/**
 * Marketing Studio — admin-only marketing content engine.
 *
 * Flow: an admin writes a brief (topic + audience + tone + notes + focus
 * sports). We harvest a snapshot of live platform data — top arbitrage
 * opportunities, upcoming games, ESPN news, published ValorOdds articles —
 * then run the same OpenAI→DeepSeek provider ladder the News Studio uses to
 * produce channel-specific marketing copy. The admin reviews/edits, approves,
 * and ships each variant to Discord through the bot's internal API.
 */
import { query, queryOne } from './db';
import { getTopOpportunities } from './public-data';
import { getGamesGrid, isGamesHubSport } from './games-data';
import { getTopNews } from './espn-news';
import { getPublishedFeed } from './news-platform';
import { buildProviderLadder, callProvider, type Provider } from './article-generator';

// ---------- types ----------

export type MarketingAudience = 'casual' | 'sharp' | 'mixed';
export type MarketingTone = 'hype' | 'analytical' | 'playful' | 'urgent';
export type MarketingStatus = 'draft' | 'approved' | 'rejected' | 'posted';

export interface MarketingChannel {
  key: string;
  label: string;
  desc: string;
  channelId: string;
}

export interface MarketingVariant {
  id: string;          // stable slug ('discord-main', 'discord-sharp', 'x-thread')
  label: string;       // display label
  channel: string;     // 'discord' | 'x' | 'blog'
  body: string;        // the copy
  model?: string | null;
}

export interface MarketingBrief {
  topic: string;
  audience: MarketingAudience;
  tone: MarketingTone;
  notes?: string | null;
  focusSports?: string[];
}

export interface PlatformSnapshot {
  harvestedAt: string;
  opportunities: Array<{
    match: string;
    sport: string;
    profitPct: number;
    bestHome: string;
    bestAway: string;
    commenceTime: string | null;
    freshness: string;
  }>;
  games: Array<{ match: string; sport: string; books: number; starts: string | null }>;
  news: Array<{ headline: string; sport: string | null; url: string; publishedAt: string | null }>;
  articles: Array<{ title: string; slug: string; sport: string | null; publishedAt: string | null }>;
}

export interface MarketingPost {
  id: string;
  briefTopic: string;
  audience: MarketingAudience;
  tone: MarketingTone;
  extraNotes: string | null;
  focusSports: string[];
  context: PlatformSnapshot;
  variants: MarketingVariant[];
  generatorModel: string | null;
  status: MarketingStatus;
  reviewNotes: string | null;
  postedVariants: Array<{ variantId: string; channelId: string; messageId: string; messageUrl?: string; at: string }>;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------- constants ----------

const SPORTS = ['NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'NCAAB', 'SOCCER'] as const;

/** The three copy variants every campaign generates. */
const VARIANT_SPECS = [
  {
    id: 'discord-main',
    label: 'Discord — main announcement',
    channel: 'discord',
    guidance: 'For the general announcements channel. 200-350 chars. One hook line, one concrete fact from the data, one CTA linking valorodds.com. May use 1-2 relevant emojis. No @mentions, no markdown headers.',
  },
  {
    id: 'discord-sharp',
    label: 'Discord — bettor-focused',
    channel: 'discord',
    guidance: 'For a betting-community channel. 250-450 chars. Lead with the strongest number from the data (arb %, game count, book count). Casual bettor slang ok but no hype-slop. End with a CTA. No @mentions, no markdown headers.',
  },
  {
    id: 'x-thread',
    label: 'X / Twitter post',
    channel: 'x',
    guidance: 'A single X post, 280 chars max including any URL. Punchy, no hashtags spam (at most 1), must contain a real number from the data.',
  },
] as const;

// ---------- context harvest ----------

export async function harvestPlatformSnapshot(focusSports: string[] = []): Promise<PlatformSnapshot> {
  const focus = focusSports.map((s) => s.toUpperCase()).filter((s) => SPORTS.includes(s as any));

  // All sources degrade independently — an empty snapshot is still a valid
  // generation context (the brief itself carries the message).
  const [opps, news, articles] = await Promise.all([
    getTopOpportunities(8).catch(() => []),
    getTopNews(10).catch(() => [] as Awaited<ReturnType<typeof getTopNews>>),
    getPublishedFeed({ limit: 5 }).catch(() => []),
  ]);

  // Games for focus sports (or a spread of major sports when no focus given)
  const sportsForGames = focus.length ? focus : ['NFL', 'NBA', 'MLB', 'NHL'];
  const gamesBySport = await Promise.all(
    sportsForGames.slice(0, 4).map((code) =>
      isGamesHubSport(code) ? getGamesGrid(code, 6).catch(() => []) : Promise.resolve([])
    )
  );

  const filteredOpps = focus.length
    ? opps.filter((o) => focus.includes(o.sport.toUpperCase()))
    : opps;

  return {
    harvestedAt: new Date().toISOString(),
    opportunities: filteredOpps.slice(0, 6).map((o) => ({
      match: o.match,
      sport: o.sport,
      profitPct: o.profitPct,
      bestHome: `${o.bestHomeBook} @ ${o.bestHomeOdds > 0 ? `+${o.bestHomeOdds}` : o.bestHomeOdds}`,
      bestAway: `${o.bestAwayBook} @ ${o.bestAwayOdds > 0 ? `+${o.bestAwayOdds}` : o.bestAwayOdds}`,
      commenceTime: o.commenceTime,
      freshness: o.freshness,
    })),
    games: gamesBySport
      .flat()
      .slice(0, 8)
      .map((g) => ({
        match: `${g.awayTeam} @ ${g.homeTeam}`,
        sport: g.sport,
        books: g.nBooks,
        starts: g.commenceTime,
      })),
    news: news.slice(0, 6).map((n) => ({
      headline: n.headline,
      sport: null,
      url: n.url,
      publishedAt: n.publishedAt,
    })),
    articles: articles.slice(0, 4).map((a) => ({
      title: a.title,
      slug: a.slug,
      sport: a.sport,
      publishedAt: a.published_at,
    })),
  };
}

// ---------- AI generation ----------

const MARKETING_SYSTEM_PROMPT = `You are ValorOdds' marketing copywriter. You write short, punchy promotional posts for a sports betting-analytics platform (valorodds.com) that shows users arbitrage opportunities, live odds across sportsbooks, and data-driven picks.

Hard rules:
- Ground every post in the supplied PLATFORM DATA. Use its real numbers (arb profit %, book counts, game counts, article titles). NEVER invent statistics, odds, or promotions.
- No gambling advice, no "guaranteed wins", no odds picks in marketing copy. We market the product (data, alerts, coverage), not bets.
- No @mentions, no role pings, no URLs other than valorodds.com paths from the data.
- Each variant MUST respect its char limit and platform norms.
- Output STRICT JSON only (no markdown fences, no commentary):
{"discord-main": "...", "discord-sharp": "...", "x-thread": "..."}`;

function buildUserPrompt(brief: MarketingBrief, snapshot: PlatformSnapshot): string {
  const audienceMap: Record<MarketingAudience, string> = {
    casual: 'casual sports fans who bet occasionally',
    sharp: 'sharp bettors who live in the odds',
    mixed: 'a mix of casual fans and sharp bettors',
  };
  const toneMap: Record<MarketingTone, string> = {
    hype: 'high-energy, exciting',
    analytical: 'measured, numbers-first, credible',
    playful: 'fun, witty, a bit cheeky',
    urgent: 'urgent, act-now energy (but no fake scarcity)',
  };
  const variantList = VARIANT_SPECS.map((v) => `- "${v.id}" (${v.label}): ${v.guidance}`).join('\n');

  return `MARKETING BRIEF
Topic: ${brief.topic}
Audience: ${audienceMap[brief.audience]}
Tone: ${toneMap[brief.tone]}
${brief.notes ? `Extra guidance from the admin: ${brief.notes}` : ''}
${brief.focusSports?.length ? `Focus sports: ${brief.focusSports.join(', ')}` : 'All sports'}

PLATFORM DATA (ground the copy in these; ignore what's irrelevant to the brief)
Arbitrage opportunities right now:
${snapshot.opportunities.length
    ? snapshot.opportunities.map((o) => `- ${o.match} (${o.sport}): ${o.profitPct.toFixed(1)}% arb — ${o.bestHome} / ${o.bestAway}${o.commenceTime ? `, starts ${o.commenceTime}` : ''} [${o.freshness}]`).join('\n')
    : '- (none live right now)'}
Upcoming games with live odds:
${snapshot.games.length
    ? snapshot.games.map((g) => `- ${g.match} (${g.sport}), ${g.books} books tracking${g.starts ? `, starts ${g.starts}` : ''}`).join('\n')
    : '- (none right now)'}
Recent headlines:
${snapshot.news.length ? snapshot.news.map((n) => `- ${n.headline}`).join('\n') : '- (none right now)'}
Recent ValorOdds articles (promotable, link as https://valorodds.com/news/<slug>):
${snapshot.articles.length ? snapshot.articles.map((a) => `- "${a.title}" → /news/${a.slug}`).join('\n') : '- (none published yet)'}

Write exactly these variants:
${variantList}`;
}

export interface GeneratedMarketing {
  variants: MarketingVariant[];
  model: string;
}

export async function generateMarketingVariants(
  brief: MarketingBrief,
  snapshot: PlatformSnapshot
): Promise<GeneratedMarketing> {
  const providers = buildProviderLadder();
  if (!providers.length) {
    throw new Error('No AI providers configured (OPENAI_API_KEY / DEEPSEEK_API_KEY missing)');
  }

  const userPrompt = buildUserPrompt(brief, snapshot);
  let raw: string | null = null;
  let usedProvider: Provider | null = null;
  let lastErr: unknown = null;

  for (const p of providers) {
    raw = await callProvider(p, MARKETING_SYSTEM_PROMPT, userPrompt, 1200);
    if (raw) {
      usedProvider = p;
      break;
    }
    lastErr = new Error(`provider ${p.name} returned no content`);
  }
  if (!raw || !usedProvider) {
    throw new Error(`Marketing generation failed: ${String(lastErr)}`);
  }

  // Tolerant parse: model may wrap in fences despite instructions.
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error('Marketing generation returned unparseable output');
  }

  const variants: MarketingVariant[] = [];
  for (const spec of VARIANT_SPECS) {
    const body = parsed[spec.id];
    if (typeof body === 'string' && body.trim()) {
      variants.push({
        id: spec.id,
        label: spec.label,
        channel: spec.channel,
        body: body.trim(),
        model: usedProvider.name,
      });
    }
  }
  if (!variants.length) {
    throw new Error('Marketing generation produced no usable variants');
  }
  return { variants, model: usedProvider.name };
}

// ---------- persistence ----------

const POST_COLUMNS = `id, brief_topic, audience, tone, extra_notes, focus_sports,
         context, variants, generator_model, status, review_notes,
         posted_variants, created_by_name, created_at, updated_at`;

const POST_SELECT = `
  SELECT ${POST_COLUMNS}
    FROM web_marketing_posts`;

function rowToPost(row: any): MarketingPost {
  return {
    id: String(row.id),
    briefTopic: row.brief_topic,
    audience: row.audience,
    tone: row.tone,
    extraNotes: row.extra_notes,
    focusSports: row.focus_sports ?? [],
    context: row.context ?? { harvestedAt: '', opportunities: [], games: [], news: [], articles: [] },
    variants: Object.values(row.variants ?? {}) as MarketingVariant[],
    generatorModel: row.generator_model,
    status: row.status,
    reviewNotes: row.review_notes,
    postedVariants: row.posted_variants ?? [],
    createdByName: row.created_by_name,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

export async function createMarketingPost(
  brief: MarketingBrief,
  snapshot: PlatformSnapshot,
  generated: GeneratedMarketing,
  createdBy: { id: string; name: string }
): Promise<MarketingPost> {
  const variantsMap: Record<string, MarketingVariant> = {};
  for (const v of generated.variants) variantsMap[v.id] = v;

  const r = await query<any>(
    `INSERT INTO web_marketing_posts
       (brief_topic, audience, tone, extra_notes, focus_sports, context,
        variants, generator_model, status, created_by, created_by_name)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,'draft',$9,$10)
     RETURNING ${POST_COLUMNS}`,
    [
      brief.topic,
      brief.audience,
      brief.tone,
      brief.notes ?? null,
      brief.focusSports ?? [],
      JSON.stringify(snapshot),
      JSON.stringify(variantsMap),
      generated.model,
      createdBy.id,
      createdBy.name,
    ]
  );
  return rowToPost(r.rows[0]);
}

export async function listMarketingPosts(limit = 50): Promise<MarketingPost[]> {
  const r = await query<any>(`${POST_SELECT} ORDER BY created_at DESC LIMIT $1`, [limit]);
  return r.rows.map(rowToPost);
}

export async function getMarketingPost(id: string): Promise<MarketingPost | null> {
  const row = await queryOne<any>(`${POST_SELECT} WHERE id = $1`, [id]);
  return row ? rowToPost(row) : null;
}

export async function updateMarketingVariants(
  id: string,
  variants: MarketingVariant[]
): Promise<MarketingPost | null> {
  const map: Record<string, MarketingVariant> = {};
  for (const v of variants) {
    if (!v.id || !v.body) continue;
    map[v.id] = v;
  }
  const r = await query<any>(
    `UPDATE web_marketing_posts
        SET variants = $1::jsonb, updated_at = NOW()
      WHERE id = $2
      RETURNING ${POST_COLUMNS}`,
    [JSON.stringify(map), id]
  );
  return r.rows[0] ? rowToPost(r.rows[0]) : null;
}

export async function setMarketingStatus(
  id: string,
  status: MarketingStatus,
  reviewNotes?: string | null
): Promise<MarketingPost | null> {
  const r = await query<any>(
    `UPDATE web_marketing_posts
        SET status = $1, review_notes = COALESCE($2, review_notes), updated_at = NOW()
      WHERE id = $3
      RETURNING ${POST_COLUMNS}`,
    [status, reviewNotes ?? null, id]
  );
  return r.rows[0] ? rowToPost(r.rows[0]) : null;
}

export async function recordPostedVariant(
  id: string,
  entry: { variantId: string; channelId: string; messageId: string; messageUrl?: string }
): Promise<MarketingPost | null> {
  const r = await query<any>(
    `UPDATE web_marketing_posts
        SET posted_variants = posted_variants || $1::jsonb,
            status = 'posted', updated_at = NOW()
      WHERE id = $2
      RETURNING ${POST_COLUMNS}`,
    [JSON.stringify([{ ...entry, at: new Date().toISOString() }]), id]
  );
  return r.rows[0] ? rowToPost(r.rows[0]) : null;
}

export async function deleteMarketingPost(id: string): Promise<boolean> {
  const r = await query<any>(`DELETE FROM web_marketing_posts WHERE id = $1 RETURNING id`, [id]);
  return r.rows.length > 0;
}
