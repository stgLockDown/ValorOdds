import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import { getWeeklyStats } from '@/lib/dd/weekly-stats';
import { computeWinProbability } from '@/lib/dd/win-probability';
import { defaultSeasonWeeks } from '@/lib/dd/schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/dd/leagues/[id]/chat
//
// A league-scoped AI assistant. Body: { message, history?, week? }
//
// The model is given a compact, factual snapshot of the league — standings,
// the caller's roster with weekly projections, this week's matchup and the
// live win probability — so it can answer "who should I start?", "how's my
// team looking?", "what are my chances this week?" with real numbers.
//
// Provider ladder mirrors /api/chat/stream: OpenAI primary, DeepSeek fallback.
// ────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are "DiamondDraft AI", a sharp, friendly fantasy sports assistant embedded inside a specific league.
You ONLY talk about this league: its teams, rosters, matchups, standings, weekly projections, and strategy.
Use the league snapshot provided below as ground truth. Cite specific players, projected points, and win percentages when relevant.
Be concise (2-5 short paragraphs max), confident, and practical. Use markdown and the occasional emoji.
If asked about something outside this league, gently steer back to the league.
Never invent players or numbers that aren't in the snapshot.`;

interface ChatBody {
  message?: string;
  history?: { role: string; content: string }[];
  week?: number;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const leagueId = BigInt(params.id);
  const body: ChatBody = await req.json().catch(() => ({}));
  const message = (body.message ?? '').trim();
  if (!message) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 });
  }

  const league = await queryOne<{
    id: string;
    name: string;
    sport: string;
    status: string;
    is_public: boolean;
    settings: any;
  }>(
    `SELECT id::text, name, sport, status, is_public, settings FROM dd_leagues WHERE id = $1`,
    [leagueId]
  );
  if (!league) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 });
  }

  const membership = await queryOne<{ id: string; team_name: string }>(
    `SELECT id::text, team_name FROM dd_league_members WHERE league_id = $1 AND user_id = $2`,
    [leagueId, BigInt(session.user.id)]
  );
  if (!league.is_public && !membership) {
    return NextResponse.json({ error: 'League not found' }, { status: 404 });
  }

  const context = await buildLeagueContext(leagueId, league, membership?.id ?? null, body.week);

  const openaiKey = process.env.OPENAI_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;

  const encoder = new TextEncoder();
  const sse = (text: string) =>
    new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      }),
      { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' } }
    );

  if (!openaiKey && !deepseekKey) {
    return sse(
      '⚠️ The league AI is not configured yet. Set OPENAI_API_KEY or DEEPSEEK_API_KEY in the environment.'
    );
  }

  const messages = [
    { role: 'system', content: `${SYSTEM_PROMPT}\n\n## League Snapshot\n${context}` },
    ...(body.history ?? []).slice(-8).map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  type Provider = { name: string; baseUrl: string; apiKey: string; model: string; gpt5: boolean };
  const providers: Provider[] = [];
  const isGpt5 = (m: string) => /^(gpt-5|o[0-9])/i.test(m);

  if (openaiKey) {
    const models = [
      process.env.OPENAI_CHAT_MODEL || 'gpt-5.5',
      process.env.OPENAI_CHAT_FALLBACK_MODEL || 'gpt-5.4',
      process.env.OPENAI_CHAT_MINI_MODEL || 'gpt-5.4-mini',
    ].filter((m, i, a) => m && a.indexOf(m) === i);
    for (const model of models) {
      providers.push({
        name: `openai:${model}`,
        baseUrl: 'https://api.openai.com/v1',
        apiKey: openaiKey,
        model,
        gpt5: isGpt5(model),
      });
    }
  }
  if (deepseekKey) {
    providers.push({
      name: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: deepseekKey,
      model: process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-chat',
      gpt5: false,
    });
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let lastStatus = 0;

  for (const p of providers) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const payload: Record<string, unknown> = { model: p.model, messages, stream: true };
        if (p.gpt5) payload.max_completion_tokens = 900;
        else {
          payload.max_tokens = 900;
          payload.temperature = 0.6;
        }
        const upstream = await fetch(`${p.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
          body: JSON.stringify(payload),
        });
        if (upstream.ok && upstream.body) {
          return new Response(upstream.body, {
            headers: {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache, no-transform',
              Connection: 'keep-alive',
              'X-Accel-Buffering': 'no',
            },
          });
        }
        lastStatus = upstream.status;
        try {
          await upstream.text();
        } catch {
          /* noop */
        }
        if ((upstream.status === 429 || upstream.status >= 500) && attempt < 3) {
          await sleep(Math.min(500 * 2 ** (attempt - 1), 4000));
          continue;
        }
        break; // hard failure → next provider
      } catch {
        lastStatus = 0;
        if (attempt < 3) {
          await sleep(Math.min(500 * 2 ** (attempt - 1), 4000));
          continue;
        }
        break;
      }
    }
  }

  if (lastStatus === 429) {
    return sse('⏳ The AI is rate-limited right now. Give it a minute and try again.');
  }
  return sse(`⚠️ The AI service is temporarily unavailable${lastStatus ? ` (error ${lastStatus})` : ''}.`);
}

// ────────────────────────────────────────────────────────────────────────────
// Context builder
// ────────────────────────────────────────────────────────────────────────────

async function buildLeagueContext(
  leagueId: bigint,
  league: { name: string; sport: string; status: string; settings: any },
  myMemberId: string | null,
  requestedWeek?: number
): Promise<string> {
  const parts: string[] = [];
  const settings =
    typeof league.settings === 'string' ? JSON.parse(league.settings) : (league.settings ?? {});
  const weeks = Number(settings?.seasonWeeks) || defaultSeasonWeeks(league.sport);

  parts.push(`League: ${league.name} (${league.sport}, ${league.status}). Season length: ${weeks} weeks.`);

  const matchups = await query<{
    week_num: number;
    home_member_id: string;
    away_member_id: string;
    home_score: string | null;
    away_score: string | null;
    winner_member_id: string | null;
    is_tie: boolean;
    status: string;
  }>(
    `SELECT week_num, home_member_id::text, away_member_id::text, home_score, away_score,
            winner_member_id::text, is_tie, status
     FROM dd_matchups WHERE league_id = $1 ORDER BY week_num, id`,
    [leagueId]
  );

  const members = await query<{ id: string; team_name: string }>(
    `SELECT id::text, team_name FROM dd_league_members WHERE league_id = $1`,
    [leagueId]
  );
  const nameById = new Map(members.rows.map((m) => [m.id, m.team_name]));

  // Standings.
  const records = new Map<string, { w: number; l: number; t: number; pf: number }>();
  for (const m of members.rows) records.set(m.id, { w: 0, l: 0, t: 0, pf: 0 });
  for (const g of matchups.rows) {
    if (g.status !== 'final') continue;
    const hs = g.home_score != null ? Number(g.home_score) : 0;
    const as = g.away_score != null ? Number(g.away_score) : 0;
    const hr = records.get(g.home_member_id);
    const ar = records.get(g.away_member_id);
    if (hr) hr.pf += hs;
    if (ar) ar.pf += as;
    if (g.is_tie) {
      if (hr) hr.t++;
      if (ar) ar.t++;
    } else if (g.winner_member_id) {
      const loser = g.winner_member_id === g.home_member_id ? g.away_member_id : g.home_member_id;
      const wr = records.get(g.winner_member_id);
      const lr = records.get(loser);
      if (wr) wr.w++;
      if (lr) lr.l++;
    }
  }
  const standings = [...records.entries()]
    .map(([id, r]) => ({ id, name: nameById.get(id) ?? '?', ...r }))
    .sort((a, b) => b.w - a.w || b.t - a.t || b.pf - a.pf);
  parts.push(
    '## Standings\n' +
      standings
        .map((s, i) => `${i + 1}. ${s.name} — ${s.w}-${s.l}${s.t ? `-${s.t}` : ''}, ${s.pf.toFixed(1)} PF`)
        .join('\n')
  );

  const currentWeek = matchups.rows.length
    ? Math.min(
        weeks,
        Math.max(1, ...matchups.rows.filter((m) => m.status === 'final').map((m) => m.week_num + 1))
      )
    : 1;
  const week = requestedWeek ? Math.max(1, Math.min(weeks, requestedWeek)) : currentWeek;

  // Weekly stats for the league.
  try {
    const weekly = await getWeeklyStats(leagueId, week);
    const rosterById = new Map(weekly.rosters.map((r) => [r.memberId, r]));

    parts.push(`## Week ${week} Projections (scoring: ${weekly.scoringName})`);
    for (const r of weekly.rosters) {
      const starters = r.starters
        .map((p) => `${p.playerName} (${p.position}) ${p.week.points.toFixed(1)}`)
        .join(', ');
      parts.push(`${r.teamName}: ${r.starterPoints.toFixed(1)} proj — ${starters}`);
    }

    // The caller's matchup + win probability.
    if (myMemberId) {
      const my = matchups.rows.find(
        (m) => m.week_num === week && (m.home_member_id === myMemberId || m.away_member_id === myMemberId)
      );
      if (my) {
        const isHome = my.home_member_id === myMemberId;
        const oppId = isHome ? my.away_member_id : my.home_member_id;
        const homeRoster = rosterById.get(my.home_member_id);
        const awayRoster = rosterById.get(my.away_member_id);
        if (homeRoster && awayRoster) {
          const scoredWeeks = new Set(
            matchups.rows.filter((m) => m.status === 'final').map((m) => m.week_num)
          ).size;
          const odds = computeWinProbability({
            home: homeRoster,
            away: awayRoster,
            weekProgress: my.status === 'final' ? 1 : Math.min(0.95, scoredWeeks / Math.max(1, weeks)),
            isFinal: my.status === 'final',
            finalHomeScore: my.home_score != null ? Number(my.home_score) : null,
            finalAwayScore: my.away_score != null ? Number(my.away_score) : null,
          });
          const myPct = isHome ? odds.homeWinPct : odds.awayWinPct;
          parts.push(
            `## My Matchup (Week ${week})\n` +
              `Me (${nameById.get(myMemberId)}): ${(isHome ? homeRoster : awayRoster).starterPoints.toFixed(1)} proj\n` +
              `Opponent (${nameById.get(oppId)}): ${(isHome ? awayRoster : homeRoster).starterPoints.toFixed(1)} proj\n` +
              `Win probability: ${myPct.toFixed(1)}% (${odds.reason})`
          );
        }
      }
    }
  } catch (err) {
    parts.push(`(Weekly projections unavailable: ${(err as Error).message})`);
  }

  return parts.join('\n\n');
}
