/**
 * Game article generator — previews & recaps for a specific matchup.
 *
 * Companion to lib/article-generator.ts (the player/team spotlight engine).
 * This module targets a single game identified by ESPN event id:
 *
 *   - PRE / IN  → a PREVIEW article: the matchup angle, records, venue,
 *     the market view (best moneyline / spread / total across the books we
 *     track in odds_snapshots), plus recent team headlines for color and
 *     citations.
 *   - POST      → a RECAP article: the final score story built from the
 *     ESPN game summary (box score, linescores, team stats, big plays,
 *     top player lines), plus team headlines for context.
 *
 * Articles are stored with subject_type 'game' and subject_name
 * "Away @ Home". The ESPN event id is recorded in
 * generator_prompt_subject for provenance.
 *
 * Data sources (all existing, no new ingestion):
 *   - lib/espn-scores.ts      — scoreboard window + score state
 *   - lib/espn-summary.ts     — full box score / big plays (fetchGameSummary)
 *   - odds_snapshots (PG)     — bookmaker lines for the market angle
 *   - news (PG)               — harvested team headlines for citations
 *
 * Images: cover + inline photos come from the team headline context (real
 * ESPN/outlet photos with credits), same harvest pattern as spotlights.
 */

import { query } from './db';
import { listEspnScoreWindow, type EspnGameWindowEntry } from './espn-scores';
import { fetchGameSummary, type GameSummary } from './espn-summary';
import { normalizeInlineImages, type InlineImage } from './article-images';
import { mapPlaceholderCitations } from './citations';
import {
  buildProviderLadder,
  callProvider,
  photoCredit,
  type GeneratedArticleDraft,
  type Provider,
} from './article-generator';

// ---------- types ----------

/** A game offered in the News Studio picker. */
export interface ArticleGameOption {
  /** ESPN event id — the key passed back to generate. */
  eventId: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  startTime: string | null;
  /** pre / in / post */
  state: 'pre' | 'in' | 'post';
  statusDetail: string | null;
  isLive: boolean;
  isFinal: boolean;
  homeScore: number;
  awayScore: number;
  homeRecord: string | null;
  awayRecord: string | null;
  /** # of books with lines on this game (from odds_snapshots). */
  books: number;
}

/** Best line per market for the preview's market block. */
export interface MarketLine {
  /** h2h / spreads / totals */
  market: string;
  /** Display label, e.g. "Chargers ML", "Chargers -3.5", "Over 47.5". */
  label: string;
  /** Best (max) price found across books. American odds. */
  price: number;
  book: string;
}

// ---------- editorial system prompt ----------

const GAME_ARTICLE_SYSTEM_PROMPT = `You are ValorOdds' staff sports writer. You write concise, punchy, factual game coverage for a betting-analytics audience.

Hard rules:
- 550-800 words in the body, structured with ## section headings.
- First paragraph is a strong lede — the score or the stakes, no throat-clearing.
- Only state facts that appear in the supplied GAME DATA, MARKET DATA, or TEAM HEADLINES blocks. If you are unsure of a fact, leave it out. NEVER invent statistics, quotes, or injury statuses.
- Betting line facts must come from the MARKET DATA block — cite the book name when quoting a price (e.g. "Pinnacle had the Chargers at -3.5"). Never invent or round odds into existence.
- Where a headline supports a claim, cite it inline as a markdown link labeled by outlet name (e.g. [CBS Sports](url)) using the exact URL shown after "source:". NEVER write placeholder links such as source-2, [2], or [source 4].
- End with a short "What to watch" section (2-3 bullets, ## heading).
- Tone: professional sports desk, confident, no hype-slop, no emojis.
- No gambling advice or "bet this" recommendations — market context is coverage, not picks.
- Output STRICT JSON only (no markdown fences, no commentary):
{"title": "...", "subtitle": "...", "body_md": "...", "tags": ["..."]}`;

// ---------- picker ----------

/**
 * Games available for game-coverage articles across the main hub sports.
 * Editorial ordering (live → soonest upcoming → newest finals) comes from
 * listEspnScoreWindow; book counts are joined in from odds_snapshots.
 */
export async function listArticleGames(sport?: string): Promise<ArticleGameOption[]> {
  const SPORTS = ['NFL', 'NBA', 'MLB', 'NHL', 'SOCCER'];
  const codes = sport ? [sport.toUpperCase()] : SPORTS;

  const slates = await Promise.all(
    codes.map((code) => listEspnScoreWindow(code, 3, 10).catch(() => [] as EspnGameWindowEntry[])),
  );
  const all = slates.flat();

  // Book coverage per matchup, from odds_snapshots (last 16h..+10d window).
  const booksByMatchup = new Map<string, number>();
  try {
    const r = await query<{ home_team: string; away_team: string; books: number }>(
      `SELECT home_team, away_team, COUNT(DISTINCT bookmaker_key)::int AS books
       FROM odds_snapshots
       WHERE commence_time > NOW() - INTERVAL '16 hours'
         AND commence_time < NOW() + INTERVAL '10 days'
       GROUP BY home_team, away_team`,
    );
    for (const row of r.rows) {
      // Key on normalized pair so ESPN names match odds-feed names.
      const k = pairKey(row.home_team, row.away_team);
      booksByMatchup.set(k, Math.max(booksByMatchup.get(k) ?? 0, row.books));
    }
  } catch {
    // odds harvest soft-fails — the picker still works, just without counts.
  }

  return all.map((e) => ({
    eventId: e.eventId as string,
    sport: e.sport,
    homeTeam: e.homeTeam,
    awayTeam: e.awayTeam,
    startTime: e.startTime,
    state: e.state,
    statusDetail: e.statusDetail,
    isLive: e.isLive,
    isFinal: e.isFinal,
    homeScore: e.homeScore,
    awayScore: e.awayScore,
    homeRecord: e.homeRecord,
    awayRecord: e.awayRecord,
    books: booksByMatchup.get(pairKey(e.homeTeam, e.awayTeam)) ?? 0,
  }));
}

function pairKey(home: string, away: string): string {
  const norm = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const a = norm(home);
  const b = norm(away);
  return [a, b].sort().join('|');
}

// ---------- market harvest ----------

/**
 * Best line per market side from odds_snapshots for one matchup. "Best" =
 * highest American price for that outcome across books (best for the
 * bettor), with the book named. Returns [] when no lines exist (e.g.
 * international soccer feeds absent, or the game has no market yet).
 */
export async function harvestMarketLines(
  sport: string,
  homeTeam: string,
  awayTeam: string,
): Promise<MarketLine[]> {
  // ESPN team names (e.g. "Los Angeles Chargers") vs odds-feed names —
  // match on ILIKE both directions to tolerate prefix/abbrev differences.
  const rows = await query<{
    market_type: string;
    outcome_name: string;
    outcome_price: numericLike;
    outcome_point: numericLike;
    bookmaker_name: string;
    outcome_side: string;
  }>(
    `SELECT market_type, outcome_name, outcome_price, outcome_point, bookmaker_name,
            CASE WHEN outcome_name ILIKE '%' || $1 || '%' THEN 'home' ELSE 'away' END AS outcome_side
     FROM odds_snapshots
     WHERE commence_time > NOW() - INTERVAL '16 hours'
       AND commence_time < NOW() + INTERVAL '10 days'
       AND (home_team ILIKE '%' || $1 || '%' OR home_team ILIKE '%' || $2 || '%'
            OR away_team ILIKE '%' || $1 || '%' OR away_team ILIKE '%' || $2 || '%')
       AND market_type IN ('h2h','spreads','totals')
     ORDER BY outcome_price DESC
     LIMIT 400`,
    [homeTeam, awayTeam],
  );

  interface Entry {
    market: string;
    label: string;
    price: number;
    book: string;
  }
  const best = new Map<string, Entry>();
  for (const r of rows.rows) {
    const price = Number(r.outcome_price);
    if (!Number.isFinite(price) || price === 0) continue;
    const point = r.outcome_point !== null && r.outcome_point !== undefined ? Number(r.outcome_point) : null;
    let label = '';
    const isHome = r.outcome_side === 'home';
    const team = isHome ? homeTeam : awayTeam;
    if (r.market_type === 'h2h') {
      label = `${team} ML`;
    } else if (r.market_type === 'spreads') {
      const pts = point !== null && Number.isFinite(point) ? point : 0;
      label = `${team} ${pts >= 0 ? '+' : ''}${pts.toFixed(1)}`;
    } else if (r.market_type === 'totals') {
      const pts = point !== null && Number.isFinite(point) ? point : null;
      if (pts === null) continue;
      const overUnder = String(r.outcome_name || '').toLowerCase().startsWith('over') ? 'Over' : 'Under';
      label = `${overUnder} ${pts.toFixed(1)}`;
    } else {
      continue;
    }
    const key = `${r.market_type}:${label}`;
    const cur = best.get(key);
    if (!cur || price > cur.price) {
      best.set(key, { market: r.market_type, label, price, book: r.bookmaker_name });
    }
  }
  return [...best.values()].slice(0, 8);
}

type numericLike = string | number | null;

// ---------- headline context ----------

interface TeamHeadline {
  headline: string;
  description: string | null;
  url: string | null;
  outlet: string;
  publishedAt: string | null;
  image: string | null;
  imageCredit: string | null;
}

/**
 * Recent headlines mentioning either team (10 days), for citations and
 * inline photos. Mirrors the spotlight generator's context harvest.
 */
async function harvestTeamHeadlines(homeTeam: string, awayTeam: string): Promise<TeamHeadline[]> {
  const r = await query<{
    headline: string;
    description: string | null;
    url: string | null;
    source: string | null;
    published_at: string | null;
    image_url: string | null;
    image_credit: string | null;
  }>(
    `SELECT headline, description, url, source, published_at, image_url, image_credit
     FROM news
     WHERE published_at >= NOW() - INTERVAL '10 days'
       AND (headline ILIKE '%' || $1 || '%' OR headline ILIKE '%' || $2 || '%')
     ORDER BY published_at DESC
     LIMIT 10`,
    [homeTeam, awayTeam],
  );
  return r.rows.map((row) => ({
    headline: row.headline,
    description: row.description,
    url: row.url,
    outlet: (row.source || 'ESPN').trim() || 'ESPN',
    publishedAt: row.published_at,
    image: row.image_url,
    imageCredit: row.image_credit,
  }));
}

// ---------- game context block builders ----------

function scoreLabel(e: { isFinal: boolean; homeScore: number; awayScore: number }): string {
  return `${e.awayScore}-${e.homeScore}`;
}

function linescoreBlock(summary: GameSummary | null): string {
  if (!summary || !summary.linescores.length) return '';
  const head = `| Period | ${summary.away.abbrev} | ${summary.home.abbrev} |\n| --- | --- | --- |`;
  const rows = summary.linescores
    .map((l) => `| ${l.label} | ${l.away ?? '-'} | ${l.home ?? '-'} |`)
    .join('\n');
  return `${head}\n${rows}`;
}

function teamStatsBlock(summary: GameSummary | null): string {
  if (!summary || !summary.teamStats.length) return '';
  const head = `| Stat | ${summary.away.abbrev} | ${summary.home.abbrev} |\n| --- | --- | --- |`;
  const rows = summary.teamStats
    .slice(0, 10)
    .map((s) => `| ${s.label} | ${s.away} | ${s.home} |`)
    .join('\n');
  return `${head}\n${rows}`;
}

function topPlayersBlock(summary: GameSummary | null): string {
  if (!summary) return '';
  const lines: string[] = [];
  for (const group of [...summary.homePlayers, ...summary.awayPlayers]) {
    const statCols = group.labels
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => /pass|rush|rec|yds|td|ast|pts|reb|stl|blk|era|so|ip|avg|obp|slg|goal|save|shot|toi/i.test(l));
    if (!statCols.length) continue;
    for (const p of group.players.slice(0, 6)) {
      const name = p.name;
      const team = summary.homePlayers.includes(group) ? summary.home.abbrev : summary.away.abbrev;
      const stat = statCols
        .slice(0, 3)
        .map(({ l, i }) => `${l} ${p.stats[i] ?? '-'}`)
        .join(', ');
      lines.push(`${team} ${name} — ${stat}`);
    }
  }
  return lines.slice(0, 8).join('\n');
}

function bigPlaysBlock(summary: GameSummary | null): string {
  if (!summary) return '';
  return summary.bigPlays
    .slice(0, 8)
    .map((p) => {
      const score = p.homeScore !== null && p.awayScore !== null ? ` (${p.awayScore}-${p.homeScore})` : '';
      return `${p.clock ?? ''} ${p.period ?? ''} ${p.text}${score} [${p.kind}]`;
    })
    .join('\n');
}

// ---------- main entry ----------

export interface GenerateGameArticleOptions {
  /** ESPN event id for the game. */
  eventId: string;
  /** Optional explicit sport code (skips a lookup pass). */
  sport?: string;
}

export async function generateGameArticleDraft(
  opts: GenerateGameArticleOptions,
): Promise<GeneratedArticleDraft> {
  // 1. Locate the game across the hub sports' scoreboards.
  const SPORTS = ['NFL', 'NBA', 'MLB', 'NHL', 'SOCCER'];
  const codes = opts.sport ? [opts.sport.toUpperCase()] : SPORTS;
  let game: EspnGameWindowEntry | null = null;
  let sportCode = '';
  for (const code of codes) {
    const entries = await listEspnScoreWindow(code, 3, 10).catch(() => []);
    const found = entries.find((e) => e.eventId === opts.eventId);
    if (found) {
      game = found;
      sportCode = code;
      break;
    }
  }
  if (!game) {
    throw new Error(
      `Game ${opts.eventId} not found on the scoreboard window (last 3 days .. +10 days). It may be too old or too far out.`,
    );
  }

  // 2. Parallel context harvest: box summary (recaps), market lines, team headlines.
  const [summary, marketLines, headlines] = await Promise.all([
    fetchGameSummary(sportCode, game.eventId as string).catch(() => null),
    harvestMarketLines(sportCode, game.homeTeam, game.awayTeam).catch(() => [] as MarketLine[]),
    harvestTeamHeadlines(game.homeTeam, game.awayTeam).catch(() => [] as TeamHeadline[]),
  ]);

  // 3. Cover + inline image pool from team headlines (real photos, credited).
  const isRealImage = (u: string | null | undefined): u is string => {
    if (!u) return false;
    return /^https?:\/\//i.test(String(u).trim());
  };
  const imagePool: InlineImage[] = headlines
    .filter((h) => isRealImage(h.image))
    .reduce<InlineImage[]>((acc, h) => {
      const u = h.image!.trim();
      if (!acc.some((p) => p.url === u)) {
        acc.push({
          url: u,
          caption: h.headline.slice(0, 120),
          credit: photoCredit(h.imageCredit, h.outlet),
        });
      }
      return acc;
    }, [])
    .slice(0, 4);
  let coverImage: string | null = imagePool[0]?.url ?? null;
  let coverCredit: string | null = imagePool[0]?.credit ?? null;
  if (!coverImage && summary?.home.logo) {
    // Team-logo cover fallback for the branded look when no photos exist.
    coverImage = summary.home.logo;
    coverCredit = 'Team logo';
  }

  // 4. Build the prompt.
  const matchup = `${game.awayTeam} @ ${game.homeTeam}`;
  const kickoff = game.startTime
    ? new Date(game.startTime).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
    : 'TBD';
  const isRecap = game.state === 'post';
  const articleKind = isRecap ? 'RECAP' : 'PREVIEW';

  const headlineBlock = headlines.length
    ? headlines
        .map(
          (h, i) =>
            `[${i + 1}] ${h.headline}${h.description ? ` — ${h.description.slice(0, 200)}` : ''}${
              h.url ? ` (source: ${h.outlet}: ${h.url})` : ''
            }`,
        )
        .join('\n')
    : 'None found — write the article purely from GAME DATA and MARKET DATA.';

  const marketBlock = marketLines.length
    ? marketLines
        .map((m) => `- ${m.label}: ${m.price > 0 ? '+' : ''}${m.price} (${m.book})`)
        .join('\n')
    : 'No bookmaker lines on this game in our snapshot window.';

  const marketNote = marketLines.length
    ? 'The MARKET DATA block lists the best price found across the books we track, per outcome. Quote prices with the book name.'
    : 'No lines are available, so write the piece without market context.';

  const gameDataBlock = isRecap
    ? [
        `FINAL: ${game.awayTeam} ${game.awayScore} — ${game.homeTeam} ${game.homeScore} (${game.statusDetail ?? 'Final'})`,
        summary ? `Venue: ${summary.venue ?? 'TBD'}` : '',
        game.awayRecord ? `Records: ${game.awayTeam} ${game.awayRecord}, ${game.homeTeam} ${game.homeRecord}` : '',
        linescoreBlock(summary),
        teamStatsBlock(summary),
        topPlayersBlock(summary) ? `TOP PERFORMERS:\n${topPlayersBlock(summary)}` : '',
        bigPlaysBlock(summary) ? `KEY PLAYS (newest first):\n${bigPlaysBlock(summary)}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    : [
        `UPCOMING: ${matchup} — ${kickoff}`,
        summary ? `Venue: ${summary.venue ?? 'TBD'}` : '',
        game.homeRecord || game.awayRecord
          ? `Records: ${game.awayTeam} ${game.awayRecord ?? '?'}, ${game.homeTeam} ${game.homeRecord ?? '?'}`
          : '',
        game.isLive ? `STATUS: LIVE NOW — ${game.statusDetail ?? 'in progress'}` : '',
        `This is a PREVIEW article — the game has not finished.`,
      ]
        .filter(Boolean)
        .join('\n');

  const imagePoolBlock = imagePool.length
    ? imagePool
        .map((p, i) => `[image ${i + 1}] ${p.url} (photo related to ${matchup}; credit: ${p.credit ?? 'the outlet'})`)
        .join('\n')
    : '';

  const userPrompt = `Write a ValorOdds ${articleKind} article for this game.

SUBJECT: ${matchup} (${sportCode})
ARTICLE KIND: ${articleKind}

GAME DATA (authoritative — scores, records, venue, box):
${gameDataBlock}

MARKET DATA (bookmaker lines we track — the only odds you may quote):
${marketBlock}

TEAM HEADLINES (recent reporting — your only factual sources for narrative color; cite them):
${headlineBlock}
${imagePoolBlock ? `\nAVAILABLE PHOTOS (real images you may embed — use the exact URL):\n${imagePoolBlock}` : ''}
Requirements: 550-800 words. ${
    isRecap
      ? 'Lead with the final score and why it happened — the decisive plays, the box score story, and the standout performances.'
      : 'Lead with the stakes and the matchup angle — records, venue, and the market view. Frame the odds as market coverage, never as advice.'
  } Cite sources inline with markdown links labeled by outlet name (e.g. [CBS Sports](url) — never [source 2]).${
    imagePoolBlock
      ? ` Embed ${imagePool.length >= 2 ? 'exactly two photos' : 'the one photo'} from AVAILABLE PHOTOS at natural points mid-article as markdown images: ![short caption — photo credit](exact URL). Never invent image URLs; never write image-2 placeholders.`
      : ' Do not embed any images.'
  } End with "## What to watch". Return STRICT JSON.`;

  // 5. Run the provider ladder.
  const providers: Provider[] = buildProviderLadder();
  if (!providers.length) {
    throw new Error('No AI provider configured. Set OPENAI_API_KEY (or DEEPSEEK_API_KEY) in Railway env vars.');
  }
  let raw: string | null = null;
  let usedModel = '';
  for (const p of providers) {
    raw = await callProvider(p, GAME_ARTICLE_SYSTEM_PROMPT, userPrompt, 4000);
    if (raw) {
      usedModel = p.model;
      break;
    }
  }
  if (!raw) {
    throw new Error('All AI providers failed to generate the article. Check Railway logs.');
  }

  // 6. Parse (strip fences if the model added them).
  const stripped = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  let parsed: { title?: string; subtitle?: string; body_md?: string; tags?: string[] };
  try {
    parsed = JSON.parse(stripped);
  } catch {
    if (stripped.length > 400) {
      parsed = {
        title: `${matchup} — ${isRecap ? 'recap' : 'preview'}`,
        body_md: stripped,
        tags: [sportCode.toLowerCase()],
      };
    } else {
      throw new Error('AI returned unparseable output — try generating again.');
    }
  }
  if (!parsed.title || !parsed.body_md || parsed.body_md.length < 300) {
    throw new Error('AI returned an incomplete article (missing title or body too short) — try generating again.');
  }

  // 7. Citation + image hygiene (same as spotlights).
  let bodyMd = mapPlaceholderCitations(
    parsed.body_md,
    headlines.map((h) => ({ url: h.url, name: h.outlet })),
  );
  bodyMd = normalizeInlineImages(bodyMd, imagePool, 2);

  // 8. Sources list (dedup by URL, cap 8).
  const sources = headlines
    .filter((h) => Boolean(h.url))
    .reduce<{ url: string; name: string; headline: string }[]>((acc, h) => {
      if (!acc.some((s) => s.url === h.url)) acc.push({ url: h.url!, name: h.outlet, headline: h.headline });
      return acc;
    }, [])
    .slice(0, 8);
  const sourceLinks = [...new Set(headlines.map((h) => h.url).filter((u): u is string => Boolean(u)))].slice(0, 8);

  return {
    title: parsed.title.slice(0, 200),
    subtitle: parsed.subtitle?.slice(0, 300) ?? null,
    body_md: bodyMd,
    tags: (parsed.tags ?? [sportCode.toLowerCase(), isRecap ? 'recap' : 'preview']).slice(0, 8),
    cover_image_url: coverImage,
    image_credit: coverCredit,
    sport: sportCode,
    subject_type: 'game',
    subject_name: matchup,
    source_links: sourceLinks,
    sources,
    generator_model: usedModel,
  };
}
