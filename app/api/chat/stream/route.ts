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
         AND fetched_at > NOW() - INTERVAL '35 minutes'
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

  if (!githubToken && !openaiKey) {
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

  // ── Provider chain ──────────────────────────────────────────────────────
  // GitHub Models (gpt-4o) has aggressive free-tier rate limits and frequently
  // returns 429. We (1) retry the same provider with backoff on transient 429/5xx,
  // and (2) fall back to OpenAI if a key is configured. Only when ALL options
  // are exhausted do we surface an error to the user — and with a friendlier,
  // actionable message for rate limits.
  type Provider = { name: string; baseUrl: string; apiKey: string; model: string };
  const providers: Provider[] = [];
  if (githubToken) {
    providers.push({
      name: 'github-models',
      baseUrl: 'https://models.inference.ai.azure.com',
      apiKey: githubToken,
      model: 'gpt-4o',
    });
  }
  if (openaiKey) {
    providers.push({
      name: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: openaiKey,
      model: 'gpt-4o-mini',
    });
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function tryProvider(p: Provider): Promise<{ ok: true; resp: Response } | { ok: false; status: number; retryable: boolean }> {
    const MAX_ATTEMPTS = 3;
    let lastStatus = 0;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const upstream = await fetch(`${p.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${p.apiKey}`,
          },
          body: JSON.stringify({ model: p.model, messages, stream: true, max_tokens: 1024, temperature: 0.7 }),
        });

        if (upstream.ok && upstream.body) {
          return { ok: true, resp: upstream };
        }

        lastStatus = upstream.status;
        const retryable = upstream.status === 429 || upstream.status >= 500;
        // Drain the body so the socket can be reused.
        try { await upstream.text(); } catch { /* noop */ }

        if (retryable && attempt < MAX_ATTEMPTS) {
          // Honor Retry-After when present, else exponential backoff (capped).
          const retryAfterHeader = upstream.headers.get('retry-after');
          let waitMs = 0;
          if (retryAfterHeader) {
            const secs = parseInt(retryAfterHeader, 10);
            if (Number.isFinite(secs)) waitMs = Math.min(secs * 1000, 8000);
          }
          if (!waitMs) waitMs = Math.min(500 * 2 ** (attempt - 1), 4000);
          console.warn(`[chat/stream] ${p.name} ${upstream.status} (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in ${waitMs}ms`);
          await sleep(waitMs);
          continue;
        }

        return { ok: false, status: upstream.status, retryable };
      } catch (err: any) {
        lastStatus = 0;
        console.error(`[chat/stream] ${p.name} fetch error (attempt ${attempt}):`, err?.message);
        if (attempt < MAX_ATTEMPTS) {
          await sleep(Math.min(500 * 2 ** (attempt - 1), 4000));
          continue;
        }
        return { ok: false, status: 0, retryable: true };
      }
    }
    return { ok: false, status: lastStatus, retryable: true };
  }

  let lastFailureStatus = 0;
  for (const p of providers) {
    const result = await tryProvider(p);
    if (result.ok) {
      return new Response(result.resp.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    }
    lastFailureStatus = result.status;
    console.warn(`[chat/stream] provider ${p.name} failed (status ${result.status}); ${providers.indexOf(p) < providers.length - 1 ? 'falling back to next provider' : 'no more providers'}`);
  }

  // All providers exhausted.
  if (lastFailureStatus === 429) {
    return new Response(sseStream('⏳ The AI assistant is handling a lot of requests right now and hit a rate limit. Please wait about a minute and try again. (If this keeps happening, an OpenAI fallback key can be configured to avoid GitHub Models limits.)'), {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
    });
  }
  return new Response(sseStream(`⚠️ AI service is temporarily unavailable${lastFailureStatus ? ` (error ${lastFailureStatus})` : ''}. Please try again in a moment.`), {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' }
  });
}