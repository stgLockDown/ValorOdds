/**
 * POST /api/dd/espn-sync/chat
 *
 * AI draft assistant for the ESPN sync bar. The extension sends the user's
 * question plus the current draft snapshot; we compute the same VOR analytics
 * the bar is displaying, compress them into a short context block, and ask the
 * model to answer as a draft advisor.
 *
 * Gating: Premium/VIP only, enforced with the shared `canUseChat` helper so
 * this endpoint and the main web chat can never disagree about who has access.
 *
 * The response is streamed as SSE, matching the format the main chat client
 * already understands (`data: {"content": "..."}` frames terminated by
 * `data: [DONE]`), so the extension can reuse the same parsing logic.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { canUseChat } from '@/lib/entitlements';
import { computeVor, summariseDraftContext, type VorPlayerInput } from '@/lib/dd/vor';
import { NFL_ROSTER_PRESETS, MLB_ROSTER_PRESETS, type RosterSlot } from '@/lib/dd/presets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── CORS (mirrors the sync endpoint) ────────────────────────────────────────

const ALLOWED_ORIGIN_PATTERNS = [
  /^https?:\/\/([a-z0-9-]+\.)*espn\.com$/i,
  /^chrome-extension:\/\/[a-p]{32}$/i,
  /^moz-extension:\/\/[0-9a-f-]{36}$/i,
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });
}

// ─── Schema ──────────────────────────────────────────────────────────────────

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().max(4000),
      }),
    )
    .max(12)
    .optional(),
  sport: z.enum(['NFL', 'MLB']).default('NFL'),
  rosterPreset: z.string().max(60).optional(),
  numTeams: z.number().int().min(2).max(32).default(12),
  available: z
    .array(
      z.object({
        playerName: z.string().min(1).max(120),
        position: z.string().max(12).nullable().optional(),
        team: z.string().max(12).nullable().optional(),
        projectedPoints: z.number().finite(),
        adp: z.number().finite().nullable().optional(),
        rank: z.number().int().nonnegative().optional(),
        injuryStatus: z.string().max(24).nullable().optional(),
      }),
    )
    .max(1200)
    .optional(),
  myRoster: z.array(z.object({ position: z.string().max(12).nullable() })).max(60).optional(),
  recentPicks: z.array(z.object({ position: z.string().max(12).nullable() })).max(500).optional(),
  round: z.number().int().positive().optional(),
  pick: z.number().int().positive().optional(),
  teamName: z.string().max(80).optional(),
});

const SYSTEM_PROMPT = `You are the ValorOdds DiamondDraft assistant, advising a user during a live fantasy draft.

You will be given a snapshot of the current draft: open starter slots, positional scarcity, any positional runs in progress, and the best available players ranked by Value Over Replacement (VOR).

Guidelines:
- Be decisive and brief. The user is on the clock and may have seconds to act.
- Lead with a recommendation, then give one or two sentences of reasoning.
- Reference VOR, scarcity and tier cliffs when they justify the pick.
- Never invent players, projections or statistics. Use only the supplied snapshot.
- If the snapshot lacks what you need, say so plainly instead of guessing.
- Prefer plain prose over bullet lists; keep the whole reply under 120 words.`;

function resolveSlots(
  sport: 'NFL' | 'MLB',
  presetKey: string | undefined,
): RosterSlot[] {
  const table = sport === 'NFL' ? NFL_ROSTER_PRESETS : MLB_ROSTER_PRESETS;
  if (presetKey && table[presetKey]) return table[presetKey].slots;
  const fallbackKey = 'standard' in table ? 'standard' : Object.keys(table)[0];
  return (fallbackKey ? table[fallbackKey]?.slots : undefined) ?? [];
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  const headers = corsHeaders(origin);

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Not authenticated', signInUrl: '/auth/signin' },
      { status: 401, headers },
    );
  }

  // Premium/VIP gate — identical rule to the main web chat.
  if (!canUseChat(session.user.tier, session.user.isAdmin)) {
    return NextResponse.json(
      {
        error: 'AI chat requires Premium',
        detail: 'Upgrade to Premium or VIP to use the AI draft assistant.',
        upgradeUrl: '/pricing',
      },
      { status: 403, headers },
    );
  }

  const raw = await req.json().catch(() => null);
  const parsed = chatSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', issues: parsed.error.issues.slice(0, 8) },
      { status: 400, headers },
    );
  }

  const input = parsed.data;

  // Build the draft context block, when the extension supplied a board.
  let draftContext = '';
  if (input.available && input.available.length > 0) {
    const slots = resolveSlots(input.sport, input.rosterPreset);
    if (slots.length > 0) {
      const available: VorPlayerInput[] = input.available.map((p) => ({
        playerName: p.playerName,
        position: p.position ?? null,
        team: p.team ?? null,
        projectedPoints: p.projectedPoints,
        adp: p.adp ?? null,
        rank: p.rank,
        injuryStatus: p.injuryStatus ?? null,
      }));

      try {
        const result = computeVor({
          available,
          rosterSlots: slots,
          numTeams: input.numTeams,
          myRoster: input.myRoster,
          recentPicks: input.recentPicks,
        });
        draftContext = summariseDraftContext(result, {
          round: input.round,
          pick: input.pick,
          teamName: input.teamName,
        });
      } catch (err) {
        // A context failure should degrade to a normal chat reply rather than
        // taking down the assistant mid-draft.
        console.error('[espn-sync/chat] context build failed:', err);
      }
    }
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const encoder = new TextEncoder();

  function sseError(text: string) {
    return new NextResponse(
      new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: text })}\n\n`));
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        },
      }),
      {
        headers: {
          ...headers,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      },
    );
  }

  if (!openaiKey && !deepseekKey) {
    return sseError('The AI assistant is not configured right now. Please try again later.');
  }

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...(draftContext
      ? [{ role: 'system', content: `Current draft snapshot:\n${draftContext}` }]
      : []),
    ...(input.history ?? []).map((h) => ({ role: h.role, content: h.content })),
    { role: 'user', content: input.message },
  ];

  const useOpenAi = Boolean(openaiKey);
  const endpoint = useOpenAi
    ? 'https://api.openai.com/v1/chat/completions'
    : 'https://api.deepseek.com/chat/completions';
  const model = useOpenAi ? 'gpt-4o-mini' : 'deepseek-chat';
  const apiKey = useOpenAi ? openaiKey : deepseekKey;

  let upstream: Response;
  try {
    upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, stream: true, temperature: 0.4, max_tokens: 400 }),
    });
  } catch (err) {
    console.error('[espn-sync/chat] upstream request failed:', err);
    return sseError('Could not reach the AI service. Please try again.');
  }

  if (!upstream.ok || !upstream.body) {
    console.error('[espn-sync/chat] upstream error status:', upstream.status);
    return sseError('The AI service returned an error. Please try again.');
  }

  // Re-emit the upstream SSE as our own frame format so the extension only ever
  // has to understand one shape.
  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          // Keep the trailing partial line for the next chunk.
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === '[DONE]') continue;

            try {
              const json = JSON.parse(payload);
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ content: delta })}\n\n`),
                );
              }
            } catch {
              // Ignore malformed frames rather than aborting the stream.
            }
          }
        }
      } catch (err) {
        console.error('[espn-sync/chat] stream error:', err);
      } finally {
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      ...headers,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
