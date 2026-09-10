/**
 * AI article generator — the editorial engine behind News Studio.
 *
 * What it does:
 *   1. Picks a weekly subject: the platform rotates focus between players
 *      (odd ISO weeks) and teams (even ISO weeks) so coverage spreads across
 *      the roster of newsworthy names.
 *   2. Harvests context for that subject: recent ESPN headlines from the
 *      bot-harvested `news` table + player/team imagery from ESPN CDN
 *      (headshots via athleteIds / team logos via lib/team-logos).
 *   3. Runs the OpenAI ladder (same provider chain the dashboard chat uses:
 *      OPENAI_CHAT_MODEL → fallback → mini, then DeepSeek) with a strict
 *      editorial system prompt.
 *   4. Returns a structured draft (title / subtitle / markdown body / tags /
 *      image) saved as 'pending_review' — nothing goes live until an admin
 *      approves.
 *
 * Images: "harvested" means we pick real photos from the context we gathered —
 * the player's actual headshot or the most recent real photo attached to an
 * ESPN story about them. Credit is always recorded.
 */

import { query, queryOne } from './db';
import { teamLogoUrl as espnTeamLogo } from './team-logos';
import { normalizeInlineImages, type InlineImage } from './article-images';
import { mapPlaceholderCitations } from './citations';

// ---------- types ----------

export interface GeneratedArticleDraft {
  title: string;
  subtitle: string | null;
  body_md: string;
  tags: string[];
  cover_image_url: string | null;
  image_credit: string | null;
  sport: string | null;
  subject_type: 'player' | 'team';
  subject_name: string;
  source_links: string[];
  /** Structured refs { url, name (outlet), headline } for the Sources footer. */
  sources: { url: string; name: string; headline: string }[];
  generator_model: string;
}

export interface SubjectCandidate {
  name: string;
  sport: string;
  headlineCount: number;
  image: string | null;
  imageCredit: string | null;
  sourceLinks: string[];
}

// ---------- weekly subject rotation ----------

/**
 * Deterministic weekly rotation.
 * Odd ISO weeks → player focus, even → team focus. The candidate set is drawn
 * from who is actually generating headlines this week, ranked by volume, and
 * the index is (weekNumber % candidates) so successive weeks auto-vary.
 */
export function weekFocusMode(date = new Date()): 'player' | 'team' {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7; // Mon=1..Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return weekNo % 2 === 1 ? 'player' : 'team';
}

export function isoWeekNumber(date = new Date()): number {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// ---------- subject candidates from harvested news ----------

/**
 * Most-newsworthy names of the last 7 days, aggregated from the bot's `news`
 * table. Player candidates come from the per-athlete ESPN tagging the web app
 * already does (espn-news.ts athleteIds); team candidates from headline text.
 */
export async function getSubjectCandidates(mode: 'player' | 'team'): Promise<SubjectCandidate[]> {
  // Pull the last 7 days of headlines with images. The `news` table stores
  // everything the bot harvested; we mine it for trending names.
  const rows = await query<{
    sport: string;
    headline: string;
    description: string | null;
    url: string | null;
    source: string | null;
    image_url: string | null;
    image_credit: string | null;
    author: string | null;
    published_at: string | null;
  }>(
    `SELECT sport, headline, description, url, source, image_url, image_credit, author, published_at
     FROM news
     WHERE published_at >= NOW() - INTERVAL '7 days'
     ORDER BY published_at DESC
     LIMIT 600`
  );

  // In team mode, first collect the player-shaped names so they can be
  // excluded — "Patrick Mahomes" passes the franchise-suffix filter ("s")
  // but is a person, not a team.
  const playerShaped = new Set<string>();
  if (mode === 'team') {
    for (const r of rows.rows) {
      const text = `${r.headline} ${r.description ?? ''}`;
      const name = extractPlayerName(text);
      if (name) playerShaped.add(name);
    }
  }

  const nameCounts = new Map<string, SubjectCandidate & { score: number }>();
  for (const r of rows.rows) {
    const text = `${r.headline} ${r.description ?? ''}`;
    const candidate = mode === 'player' ? extractPlayerName(text) : extractTeamName(text);
    if (!candidate) continue;
    if (mode === 'team' && playerShaped.has(candidate)) continue; // it's a player
    const key = `${candidate}|${r.sport}`;
    const existing = nameCounts.get(key);
    if (existing) {
      existing.headlineCount++;
      existing.score += 1;
      if (!existing.image && r.image_url) {
        existing.image = r.image_url;
        existing.imageCredit = photoCredit(r.image_credit, r.source);
        if (r.url) existing.sourceLinks.push(r.url);
      } else if (r.image_url && existing.sourceLinks.length < 6 && r.url) {
        existing.sourceLinks.push(r.url);
      }
    } else {
      nameCounts.set(key, {
        name: candidate,
        sport: r.sport,
        headlineCount: 1,
        score: 1,
        image: r.image_url,
        // Photo credit, not the article author — same rule as the update branch.
        imageCredit: r.image_url ? photoCredit(r.image_credit, r.source) : '',
        sourceLinks: r.url ? [r.url] : [],
      });
    }
  }

  // Rank by headline volume; require >= 2 mentions to be "trending".
  const trending = [...nameCounts.values()]
    .filter((c) => c.headlineCount >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  return trending.map(({ score, ...rest }) => rest);
}

/**
 * Extract a plausible athlete name from headline text.
 * Handles the two dominant ESPN patterns:
 *   "Team's FirstName LastName ..."   → "Cam Heyward"
 *   "FirstName LastName verb ..."      → "Bryce Young"
 */
export function extractPlayerName(text: string): string | null {
  // Pattern 1: possessive lead — "Steelers' Cam Heyward not a fan…"
  const possessive = text.match(/^(?:[A-Z][\w.-]*(?:\s+[A-Z][\w.-]*)?)'s?\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
  if (possessive) return cleanName(possessive[1]);
  // Pattern 2: direct lead — "Bryce Young throws…"
  const direct = text.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1})\b/);
  if (direct) return cleanName(direct[1]);
  return null;
}

/** Words that mark a capitalized fragment as NOT a person's name. */
const NON_NAME_WORDS = new Set([
  // question/sentence scaffolding
  'does', 'doesn', 'did', 'is', 'isn', 'are', 'was', 'were', 'will', 'would',
  'can', 'could', 'should', 'how', 'why', 'what', 'when', 'where', 'who',
  'inside', 'after', 'before', 'despite', 'sources', 'report', 'reports',
  'breaking', 'analysis', 'ranking', 'rankings', 'watch', 'takeaways', 'takeaway',
  // prepositions / connective leads ("In Mike Trout's return…")
  'in', 'on', 'at', 'to', 'for', 'as', 'with', 'over', 'amid', 'from', 'by',
  'of', 'off', 'up', 'down', 'out', 'about', 'against', 'between', 'through',
  'back', 'again', 'still', 'now', 'then', 'here', 'there', 'first', 'last',
  'next', 'every', 'each', 'another', 'one', 'two', 'three', 'final', 'full',
  'half', 'star', 'rookie', 'veteran', 'qb', 'wr', 'rb', 'te', 'coach',
  // sports nouns / places that read like names
  'super', 'bowl', 'fantasy', 'baseball', 'football', 'basketball', 'hockey',
  'soccer', 'angeles', 'york', 'orleans', 'vegas', 'francisco', 'diego',
  'antonio', 'division', 'league', 'playoffs', 'postseason', 'camp', 'season',
  'week', 'game', 'games', 'draft', 'free', 'agency', 'trade', 'trades', 'power',
  'national', 'american', 'central', 'east', 'west', 'north', 'south', 'midnight',
  'training', 'preseason', 'halftime', 'overtime', 'championship', 'world',
  'series', 'all-star', 'allstar', 'mvp', 'roy', 'injury', 'injuries', 'covid',
  'top', 'best', 'worst', 'most', 'more', 'few', 'new', 'old', 'big', 'great',
]);

function cleanName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  const words = name.split(' ');
  if (words.length < 2) return null; // need first+last
  // Every word must look like a plausible name word — no sentence scaffolding,
  // no sports nouns, no city-only fragments.
  for (const w of words) {
    const lower = w.toLowerCase().replace(/[^a-z]/g, '');
    if (NON_NAME_WORDS.has(lower)) return null;
    if (!/^[A-Z][a-z]+$/.test(w)) return null;
  }
  return name;
}

/** Team extractor: capitalized multi-word lead or standalone known franchise word. */
export function extractTeamName(text: string): string | null {
  const m = text.match(
    /^(?:The\s+)?([A-Z][\w-]*(?:\s+[A-Z][\w-]*){0,3})/
  );
  if (!m) return null;
  const raw = m[1].trim();
  // Filter obvious non-teams (verbs, days, months, question words).
  const STOP = new Set([
    'NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'NCAAB', 'NCAA', 'UFC', 'MLS',
    'Sources', 'Report', 'Reports', 'Breaking', 'Week', 'Monday', 'Tuesday',
    'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Season', 'Training',
    'Training Camp', 'Free', 'Free Agency', 'Draft', 'Playoffs', 'Postseason',
    'How', 'Why', 'What', 'Inside', 'Analysis', 'Ranking', 'Rankings', 'Power',
    'Does', 'Is', 'Are', 'Was', 'Were', 'Will', 'Can', 'Should', 'Could', 'Would',
    'Super', 'Fantasy', 'Watch', 'Takeaways', 'Everything', 'Preview',
  ]);
  if (STOP.has(raw) || raw.split(' ').length < 2) return null;
  // Multi-word candidates must end in a plausible franchise/plural noun.
  const words = raw.split(' ');
  const last = words[words.length - 1];
  const FRANCHISE_ENDS = /(s|ers|ans|ies|es|ks|ns|ics|ots|iors|iors|ons|ens|hens|gals|dores|backs|ines|ters|ves|als|ons|ars|hawks|wings|nets|stars)$/i;
  if (!FRANCHISE_ENDS.test(last) && !/(Sox|Socks|Jazz|Thunder|Lightning|Magic|Heat|Kings|Ducks|Blazers)$/i.test(last)) {
    return null;
  }
  return raw;
}


// ---------- image harvesting ----------

export function teamLogoUrl(team: string): string | null {
  // espnTeamLogo needs a sport code; the subject candidate carries one
  // (NFL/MLB/NBA/NHL/…). We try the subject's own sport first, then the
  // cross-sport fallbacks for headline-generic names.
  const code = teamLogoSportCode(team);
  const url = espnTeamLogo(code, team);
  return url || null;
}

function teamLogoSportCode(team: string): string {
  const t = team.toLowerCase();
  if (/(sooner|longhorn|tiger|crimson|buckeye|rebel|aggie|volunteer|nittany|fighting|bulldog|wildcat)/.test(t)) return 'ncaaf';
  if (/(laker|warrior|celtic|knick|net|buck|raptor|heat|sun|clipper|nugget|thunder|spur|jazz|maverick|grizzl|pelican|king|hornet|piston|trail|blazer|rocket|timberwolv|magic|hawk|wizard|cavalier)/.test(t)) return 'nba';
  if (/(yankee|red so|dodger|giant|cubs?|mets|brave|astro|padre|guardian|tiger|mariner|oriole|ray|ranger|national|phillie|brewer|red|royal|rockie|pirate|blue jay|white sox|angel|athletic)/.test(t)) return 'mlb';
  if (/(ranger|islander|devil|sabre|jet|knight|penguin|capital|red wing|lightning|maple leaf|panther|predator|oiler|star|canuck|wild|duck|shark|king|flame|avalanche|blackhawk|blue)/.test(t)) return 'nhl';
  return 'nfl';
}

/**
 * Player headshot harvest — ESPN athlete id → CDN headshot.
 * The web app's espn-news lib already parses athleteIds; the news table rows
 * we pulled don't carry them, so we try the player's recent article images
 * first (real photos) and fall back to null (the card shows the brand tile).
 */
export async function playerHeadshot(name: string, sport: string): Promise<{ url: string | null; credit: string | null }> {
  const row = await queryOne<{ image_url: string | null; author: string | null }>(
    `SELECT image_url, author FROM news
     WHERE sport = $1
       AND (headline ILIKE '%' || $2 || '%' OR COALESCE(description,'') ILIKE '%' || $2 || '%')
       AND image_url IS NOT NULL
     ORDER BY published_at DESC
     LIMIT 1`,
    [sport, name]
  );
  if (row?.image_url) return { url: row.image_url, credit: row.author ?? 'ESPN' };
  return { url: null, credit: null };
}

/**
 * Photo-credit resolver: the agency/photographer who owns the image
 * (news.image_credit, e.g. "Getty Images") when present; otherwise the
 * outlet that published the photo (news.source). Never the article author —
 * the byline credits the writer, not the photographer.
 */
function photoCredit(credit: string | null | undefined, outlet: string | null | undefined): string | null {
  const c = (credit ?? '').trim();
  if (c) return c.slice(0, 200);
  const o = (outlet ?? '').trim();
  return o ? `Photo: ${o}` : null;
}

// ---------- AI provider chain ----------
// (Exported so other generators — e.g. Marketing Studio — can reuse the
// exact same OpenAI→DeepSeek fallback ladder instead of duplicating it.)

export interface Provider {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  style: PayloadStyle;
}

type PayloadStyle = 'gpt5' | 'legacy';

export function buildProviderLadder(): Provider[] {
  const providers: Provider[] = [];
  const openaiKey = process.env.OPENAI_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const isGpt5 = (model: string) => /^(gpt-5|o[0-9])/i.test(model);
  if (openaiKey) {
    const models = [
      process.env.OPENAI_CHAT_MODEL || 'gpt-5.5',
      process.env.OPENAI_CHAT_FALLBACK_MODEL || 'gpt-5.4',
      process.env.OPENAI_CHAT_MINI_MODEL || 'gpt-5.4-mini',
    ].filter((m, i, arr) => m && arr.indexOf(m) === i);
    for (const model of models) {
      providers.push({
        name: `openai:${model}`,
        baseUrl: 'https://api.openai.com/v1',
        apiKey: openaiKey,
        model,
        style: isGpt5(model) ? 'gpt5' : 'legacy',
      });
    }
  }
  if (deepseekKey) {
    providers.push({
      name: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: deepseekKey,
      model: process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-chat',
      style: 'legacy',
    });
  }
  return providers;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function callProvider(
  provider: Provider,
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number
): Promise<string | null> {
  const body: Record<string, unknown> =
    provider.style === 'gpt5'
      ? { model: provider.model, messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ], max_completion_tokens: maxTokens }
      : { model: provider.model, messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ], max_tokens: maxTokens, temperature: 0.7 };

  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${provider.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provider.apiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
      if (res.ok) {
        const json = await res.json();
        const content = json?.choices?.[0]?.message?.content;
        if (content) return String(content);
        return null;
      }
      const errText = await res.text().catch(() => '');
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`${provider.name} ${res.status}: ${errText.slice(0, 200)}`);
        await sleep(1500 * (attempt + 1)); // backoff, then retry
        continue;
      }
      // Hard failure → next provider.
      console.error(`[article-gen] ${provider.name} hard fail ${res.status}`);
      return null;
    } catch (err) {
      lastErr = err;
      await sleep(1000);
    }
  }
  console.error(`[article-gen] provider exhausted: ${String(lastErr)}`);
  return null;
}

// ---------- prompt ----------

const EDITORIAL_SYSTEM_PROMPT = `You are ValorOdds' staff sports writer. You write concise, punchy, factual sports articles for a betting-analytics audience.

Hard rules:
- 550-800 words in the body, structured with ## section headings.
- First paragraph is a strong lede — no throat-clearing, no "In the world of sports".
- Only state facts that appear in the supplied RECENT HEADLINES. If you are unsure of a fact, leave it out. NEVER invent statistics, quotes, or injury statuses.
- Where a headline supports a claim, cite it inline as a markdown link labeled by outlet name (e.g. [CBS Sports](url) or [ESPN](url)) using the exact URL shown after "source:". NEVER write placeholder links such as source-2, [2], or [source 4] — if a headline has no source URL, state the fact without a citation.
- End with a short "What to watch" section (2-3 bullets, ## heading).
- Tone: professional sports desk, confident, no hype-slop, no emojis.
- No gambling advice or odds picks — this is news coverage, not betting tips.
- Output STRICT JSON only (no markdown fences, no commentary):
{"title": "...", "subtitle": "...", "body_md": "...", "tags": ["..."], "image_query_note": "..."}`;

// ---------- main entry ----------

export interface GenerateOptions {
  /** Explicit subject (admin picked). Overrides rotation. */
  subjectName?: string | null;
  /** 'player' | 'team' — defaults to this week's rotation. */
  subjectType?: 'player' | 'team';
}

export async function generateArticleDraft(opts: GenerateOptions = {}): Promise<GeneratedArticleDraft> {
  const mode: 'player' | 'team' = opts.subjectType ?? weekFocusMode();
  const weekNo = isoWeekNumber();

  // 1. Choose the subject.
  const candidates = await getSubjectCandidates(mode);
  if (!candidates.length) {
    throw new Error('No trending subjects found in the last 7 days of harvested news — try again later.');
  }

  let subject: SubjectCandidate | null = null;
  if (opts.subjectName) {
    subject = candidates.find((c) => c.name.toLowerCase() === opts.subjectName!.toLowerCase()) ?? null;
  }
  if (!subject) {
    // Weekly rotation index: week number cycles through the ranked list.
    const idx = weekNo % candidates.length;
    subject = candidates[idx];
  }

  // 2. Harvest context: full recent headlines about this subject.
  const context = await query<{ sport: string; headline: string; description: string | null; url: string | null; source: string | null; published_at: string | null; image_url: string | null; image_credit: string | null; author: string | null }>(
    `SELECT sport, headline, description, url, source, published_at, image_url, image_credit, author
     FROM news
     WHERE published_at >= NOW() - INTERVAL '10 days'
       AND (headline ILIKE '%' || $1 || '%' OR COALESCE(description,'') ILIKE '%' || $1 || '%')
     ORDER BY published_at DESC
     LIMIT 12`,
    [subject.name]
  );
  const headlines = context.rows.map((r) => ({
    headline: r.headline,
    description: r.description,
    url: r.url,
    outlet: (r.source || 'ESPN').trim() || 'ESPN',
    publishedAt: r.published_at,
    image: r.image_url,
    imageCredit: r.image_credit,
    author: r.author,
  }));

  if (!headlines.length) {
    throw new Error(`No recent headlines found for subject "${subject.name}".`);
  }

  // 3. Image harvest: best real photo attached to a story about the subject.
  // Cover preference order (all real photos from the harvested context):
  //   a) newest context photo that carries a photo credit,
  //   b) newest context photo with outlet fallback credit,
  //   c) subject candidate image, d) player headshot / team logo fallbacks.
  const isRealImage = (u: string | null | undefined): u is string => {
    if (!u) return false;
    return /^https?:\/\//i.test(String(u).trim());
  };
  const photosWithCredit = headlines.find((h) => isRealImage(h.image) && (h.imageCredit ?? '').trim());
  const withPhoto = headlines.find((h) => isRealImage(h.image));
  let coverImage: string | null = subject.image && isRealImage(subject.image) ? subject.image : null;
  let coverCredit: string | null = subject.imageCredit;
  if (!coverImage && mode === 'player') {
    const shot = await playerHeadshot(subject.name, subject.sport);
    coverImage = shot.url;
    coverCredit = shot.credit;
  }
  if (!coverImage && mode === 'team') {
    coverImage = teamLogoUrl(subject.name);
    coverCredit = coverImage ? 'Team logo' : null;
  }
  if (photosWithCredit) {
    coverImage = photosWithCredit.image;
    coverCredit = photoCredit(photosWithCredit.imageCredit, photosWithCredit.outlet);
  } else if (withPhoto) {
    coverImage = withPhoto.image;
    coverCredit = photoCredit(withPhoto.imageCredit, withPhoto.outlet);
  }

  // 4. Build the prompt.
  const sourceLinks = [...new Set(headlines.map((h) => h.url).filter((u): u is string => Boolean(u)))].slice(0, 8);
  // Structured source refs: { url, name (outlet), headline } — deduped by URL,
  // outlet-prefixed ordering (stable per generation). This is what the article
  // page renders as the "Sources" footer.
  const sources = headlines
    .filter((h) => Boolean(h.url))
    .reduce<{ url: string; name: string; headline: string }[]>((acc, h) => {
      if (!acc.some((s) => s.url === h.url)) acc.push({ url: h.url!, name: h.outlet, headline: h.headline });
      return acc;
    }, [])
    .slice(0, 8);
  const contextBlock = headlines
    .map(
      (h, i) =>
        `[${i + 1}] ${h.headline}${h.description ? ` — ${h.description.slice(0, 200)}` : ''}${
          h.url ? ` (source: ${h.outlet}: ${h.url})` : ''
        }`
    )
    .join('\n');

  // Inline image pool: distinct real photos from the harvested context, in
  // context order. The cover may reuse one of them (fine — hero + inline
  // duplicates read naturally) but pool order is what the prompt shows.
  const imagePool: InlineImage[] = headlines
    .filter((h) => h.image && /^https?:\/\//i.test(h.image.trim()))
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
  const imagePoolBlock = imagePool.length
    ? imagePool
        .map((p, i) => `[image ${i + 1}] ${p.url} (photo of/about ${subject.name}; credit: ${p.credit ?? 'the outlet'})`)
        .join('\n')
    : '';

  const userPrompt = `Write this week's ValorOdds ${mode === 'player' ? 'Player Spotlight' : 'Team Spotlight'} article.

SUBJECT: ${subject.name} (${subject.sport})
FOCUS WEEK: ISO week ${weekNo}
SUBJECT TYPE: ${mode}

RECENT HEADLINES (your only factual sources — cite them):
${contextBlock}
${imagePoolBlock ? `
AVAILABLE PHOTOS (real images you may embed — use the exact URL):
${imagePoolBlock}
` : ''}
Requirements: 550-800 words. Cover why ${subject.name} is trending this week, what the reporting says, and what it means for their season. Cite sources inline with markdown links labeled by outlet name (e.g. [CBS Sports](url) — never [source 2]).${imagePoolBlock ? ` Embed ${imagePool.length >= 2 ? 'exactly two photos' : 'the one photo'} from AVAILABLE PHOTOS at natural points mid-article as markdown images: ![short caption — photo credit](exact URL). Never invent image URLs; never write image-2 placeholders.` : ' Do not embed any images.'} End with "## What to watch". Return STRICT JSON.`;

  // 5. Run the provider ladder.
  const providers = buildProviderLadder();
  if (!providers.length) {
    throw new Error('No AI provider configured. Set OPENAI_API_KEY (or DEEPSEEK_API_KEY) in Railway env vars.');
  }
  let raw: string | null = null;
  let usedModel = '';
  for (const p of providers) {
    raw = await callProvider(p, EDITORIAL_SYSTEM_PROMPT, userPrompt, 4000);
    if (raw) { usedModel = p.model; break; }
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
    // salvage: wrap raw text as body if it's usable prose
    if (stripped.length > 400) {
      parsed = { title: `${subject.name} — this week in review`, body_md: stripped, tags: [subject.sport.toLowerCase()] };
    } else {
      throw new Error('AI returned unparseable output — try generating again.');
    }
  }
  if (!parsed.title || !parsed.body_md || parsed.body_md.length < 300) {
    throw new Error('AI returned an incomplete article (missing title or body too short) — try generating again.');
  }

  // 7. Citation hygiene: models sometimes cite the numbered context entries
  // as [source 3](source-3) placeholders even when told not to. Map them to
  // the real source URL (1-ordered, matching the prompt block) labeled with
  // the outlet that published the headline, or drop them when no URL exists.
  let bodyMd = mapPlaceholderCitations(
    parsed.body_md,
    headlines.map((h) => ({ url: h.url, name: h.outlet }))
  );
  // Inline image hygiene: map invented/placeholder image links to real pool
  // photos, cap at 2, strip everything else. Runs after citation mapping so
  // image alt text is never mistaken for a citation.
  bodyMd = normalizeInlineImages(bodyMd, imagePool, 2);

  return {
    title: parsed.title.slice(0, 200),
    subtitle: parsed.subtitle?.slice(0, 300) ?? null,
    body_md: bodyMd,
    tags: (parsed.tags ?? [subject.sport.toLowerCase(), mode]).slice(0, 8),
    cover_image_url: coverImage,
    image_credit: coverCredit,
    sport: subject.sport,
    subject_type: mode,
    subject_name: subject.name,
    source_links: sourceLinks,
    sources,
    generator_model: usedModel,
  };
}

/** Candidate preview for the admin UI ("who could we cover this week?"). */
export async function previewWeeklySubjects(): Promise<{
  week: number;
  mode: 'player' | 'team';
  candidates: SubjectCandidate[];
}> {
  const mode = weekFocusMode();
  const candidates = await getSubjectCandidates(mode);
  return { week: isoWeekNumber(), mode, candidates };
}
