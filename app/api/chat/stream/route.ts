/**
 * AI Chat stream endpoint — runs directly in the web app.
 * Uses GitHub Models (GPT-4o) with fallback to OPENAI_API_KEY.
 * Pulls live context from shared Postgres DB.
 */
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { query } from '@/lib/db';
import { logEvent } from '@/lib/analytics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SYSTEM_PROMPT = `You are Valor, an expert AI sports betting analyst for ValorOdds.com.
You have access to real-time odds, injuries, AI-generated best bets, arbitrage opportunities, and steam moves.
Be concise, data-driven, and confident. Always cite specific odds/lines when available.
Format responses with emojis and markdown for readability.
Focus on actionable betting insights. Never encourage irresponsible gambling.`;

async function getContext(message: string): Promise<string> {
  const parts: string[] = [];
  try {
    // Latest AI best bets
    const bets = await query(
      `SELECT content, analysis_type, generated_at FROM ai_analysis
       WHERE analysis_type IN ('bestBets','parlay','aiPicks')
       ORDER BY generated_at DESC LIMIT 3`,
      []
    );
    if (bets.rows.length > 0) {
      parts.push('## Latest AI Best Bets\n' + bets.rows.map((r: any) =>
        `[${r.analysis_type} - ${new Date(r.generated_at).toLocaleDateString()}]\n${String(r.content).slice(0, 600)}`
      ).join('\n\n'));
    }

    // Live arbitrage — read from custom_api_compare (the table the bot actually
    // writes to every 60s). The legacy arbitrage_opportunities table has been
    // dormant since 2026-03-14.
    const arbs = await query(
      `SELECT sport, home_team, away_team,
              best_home_book, best_home_odds,
              best_away_book, best_away_odds,
              profit_percentage
       FROM custom_api_compare
       WHERE is_arbitrage = TRUE
         AND fetched_at > NOW() - INTERVAL '10 minutes'
       ORDER BY profit_percentage DESC NULLS LAST LIMIT 5`,
      []
    );
    if (arbs.rows.length > 0) {
      parts.push('## Live Arbitrage\n' + arbs.rows.map((r: any) =>
        `${(r.sport || '').toUpperCase()}: ${r.home_team} vs ${r.away_team} | ${r.best_home_book} ${r.home_team} @ ${r.best_home_odds} + ${r.best_away_book} ${r.away_team} @ ${r.best_away_odds} = ${Number(r.profit_percentage).toFixed(2)}% profit`
      ).join('\n'));
    }

    // Notable injuries
    const inj = await query(
      `SELECT player_name, team, status, injury_type FROM injuries
       WHERE fetched_at > NOW() - INTERVAL '48 hours'
         AND status IN ('Out','Doubtful','Questionable')
       ORDER BY fetched_at DESC LIMIT 10`,
      []
    );
    if (inj.rows.length > 0) {
      parts.push('## Recent Injuries\n' + inj.rows.map((r: any) =>
        `${r.player_name} (${r.team}): ${r.status} - ${r.injury_type}`
      ).join('\n'));
    }

    // Steam moves
    const steam = await query(
      `SELECT sport, home_team, away_team, outcome_name, before_avg_price, after_avg_price, books_moved, direction
       FROM steam_moves
       WHERE detected_at > NOW() - INTERVAL '24 hours'
       ORDER BY detected_at DESC LIMIT 5`,
      []
    );
    if (steam.rows.length > 0) {
      parts.push('## Sharp Money Moves\n' + steam.rows.map((r: any) =>
        `${r.sport}: ${r.home_team} vs ${r.away_team} | ${r.outcome_name} ${r.before_avg_price} → ${r.after_avg_price} (${r.books_moved} books, ${r.direction})`
      ).join('\n'));
    }
  } catch (err) {
    console.error('[chat/stream] context fetch error:', err);
  }
  return parts.join('\n\n');
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const message: string = body.message || '';
  const history: any[] = body.history || [];

  if (!message.trim()) {
    return NextResponse.json({ error: 'Message required' }, { status: 400 });
  }

  const githubToken = process.env.GITHUB_TOKEN;
  const openaiKey = process.env.OPENAI_API_KEY;
  const apiKey = githubToken || openaiKey;
  const baseUrl = githubToken
    ? 'https://models.inference.ai.azure.com'
    : 'https://api.openai.com/v1';
  const model = githubToken ? 'gpt-4o' : 'gpt-4o-mini';

  const encoder = new TextEncoder();

  function sseStream(text: string) {
    return new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    });
  }

  if (!apiKey) {
    return new Response(sseStream('⚠️ AI chat is not yet configured. Please set GITHUB_TOKEN or OPENAI_API_KEY in Railway environment variables.'), {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
    });
  }

  const context = await getContext(message);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT + (context ? `\n\n## Live Data\n${context}` : '') },
    ...history.slice(-8).map((m: any) => ({ role: m.role, content: m.content })),
    { role: 'user', content: message },
  ];

  logEvent({
    userId: session.user.id,
    discordId: session.user.discordId ?? null,
    eventType: 'chat_sent',
    metadata: { source: 'web' },
  }).catch(() => {});

  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, stream: true, max_tokens: 1024, temperature: 0.7 }),
    });

    if (!upstream.ok || !upstream.body) {
      return new Response(sseStream(`⚠️ AI service error (${upstream.status}). Please try again.`), {
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
      });
    }

    return new Response(upstream.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (err: any) {
    return new Response(sseStream(`⚠️ Connection error: ${err.message}. Please try again.`), {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
    });
  }
}