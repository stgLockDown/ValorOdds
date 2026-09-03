/**
 * POST /api/dd/espn-sync
 *
 * Receives a snapshot of an ESPN draft room scraped by the browser extension
 * and returns live analytics: a VOR-ranked board, positional scarcity, tier
 * cliff alerts, ranked suggestions and (optionally) a grade for the pick that
 * was just made.
 *
 * The extension calls this on every pick, so the handler is deliberately
 * stateless and CPU-only — no database writes, and player-pool reads are
 * avoided entirely when the extension supplies its own player list (which it
 * does, since it can read the full ESPN board off the page).
 *
 * Responses are gated by subscription tier via `espnSyncFeaturesFor`, and paid
 * analytics are stripped server-side by `redactForTier` so a free user cannot
 * simply read them out of the network response.
 *
 * CORS: the extension's content script runs on `espn.com`, so this endpoint
 * must answer cross-origin preflight. We allow only ESPN origins and the
 * extension's own origin rather than `*`, because the endpoint is credentialed.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { computeVor, gradePick, type VorPlayerInput } from '@/lib/dd/vor';
import { espnSyncFeaturesFor, redactForTier, upgradePromptFor } from '@/lib/dd/espn-sync-tiers';
import { NFL_ROSTER_PRESETS, MLB_ROSTER_PRESETS, type RosterSlot } from '@/lib/dd/presets';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─── CORS ────────────────────────────────────────────────────────────────────

const ALLOWED_ORIGIN_PATTERNS = [
  /^https?:\/\/([a-z0-9-]+\.)*espn\.com$/i,
  /^chrome-extension:\/\/[a-p]{32}$/i,
  /^moz-extension:\/\/[0-9a-f-]{36}$/i,
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGIN_PATTERNS.some((re) => re.test(origin));
  return {
    // Only echo an origin we actually recognise. Credentialed requests cannot
    // use a wildcard, and echoing an arbitrary origin would defeat CORS.
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

// ─── Request schema ──────────────────────────────────────────────────────────

const playerSchema = z.object({
  id: z.string().nullable().optional(),
  playerName: z.string().min(1).max(120),
  position: z.string().max(12).nullable().optional(),
  team: z.string().max(12).nullable().optional(),
  projectedPoints: z.number().finite(),
  adp: z.number().finite().nullable().optional(),
  rank: z.number().int().nonnegative().optional(),
  tier: z.number().int().nonnegative().optional(),
  injuryStatus: z.string().max(24).nullable().optional(),
});

const pickSchema = z.object({
  playerName: z.string().max(120).optional(),
  position: z.string().max(12).nullable().optional(),
  team: z.string().max(12).nullable().optional(),
  adp: z.number().finite().nullable().optional(),
  overallPick: z.number().int().positive().optional(),
  byTeam: z.string().max(80).optional(),
});

const syncSchema = z.object({
  sport: z.enum(['NFL', 'MLB']).default('NFL'),
  /** Roster preset key, or an explicit slot array for custom ESPN leagues. */
  rosterPreset: z.string().max(60).optional(),
  rosterSlots: z
    .array(
      z.object({
        slot: z.string().max(24),
        label: z.string().max(48),
        count: z.number().int().min(0).max(40),
        eligible: z.array(z.string().max(12)).max(24),
        isStarter: z.boolean(),
      }),
    )
    .max(40)
    .optional(),
  numTeams: z.number().int().min(2).max(32).default(12),
  // The extension caps what it scrapes; the ceiling here is a safety valve
  // against an oversized or malicious payload.
  available: z.array(playerSchema).max(1200),
  myRoster: z.array(z.object({ position: z.string().max(12).nullable() })).max(60).optional(),
  recentPicks: z
    .array(z.object({ position: z.string().max(12).nullable() }))
    .max(500)
    .optional(),
  picksMade: z.number().int().nonnegative().optional(),
  round: z.number().int().positive().optional(),
  pick: z.number().int().positive().optional(),
  teamName: z.string().max(80).optional(),
  /** The pick that was just made, if the extension wants it graded. */
  lastPick: pickSchema.optional(),
});

// ─── Roster resolution ───────────────────────────────────────────────────────

/**
 * Resolve the roster configuration to score against.
 *
 * ESPN leagues are frequently customised, so the extension may send explicit
 * slots. When it does we trust them; otherwise we fall back to a named preset,
 * and finally to the sport's standard preset so the endpoint always has a
 * usable configuration rather than erroring out mid-draft.
 */
function resolveRosterSlots(
  sport: 'NFL' | 'MLB',
  presetKey: string | undefined,
  explicit: RosterSlot[] | undefined,
): { slots: RosterSlot[]; source: string } {
  if (explicit && explicit.length > 0) {
    return { slots: explicit, source: 'custom' };
  }

  const table = sport === 'NFL' ? NFL_ROSTER_PRESETS : MLB_ROSTER_PRESETS;

  if (presetKey && table[presetKey]) {
    return { slots: table[presetKey].slots, source: presetKey };
  }

  const fallbackKey = 'standard' in table ? 'standard' : Object.keys(table)[0];
  const fallback = fallbackKey ? table[fallbackKey] : undefined;
  return { slots: fallback?.slots ?? [], source: fallbackKey ?? 'none' };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin');
  const headers = corsHeaders(origin);

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      {
        error: 'Not authenticated',
        detail: 'Sign in to ValorOdds, then reload your ESPN draft page.',
        signInUrl: '/auth/signin',
      },
      { status: 401, headers },
    );
  }

  const features = espnSyncFeaturesFor(session.user.tier, session.user.isAdmin);

  const raw = await req.json().catch(() => null);
  if (!raw) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers });
  }

  const parsed = syncSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', issues: parsed.error.issues.slice(0, 8) },
      { status: 400, headers },
    );
  }

  const input = parsed.data;

  if (input.available.length === 0) {
    return NextResponse.json(
      {
        error: 'No available players supplied',
        detail:
          'The extension could not read the ESPN player board. Try scrolling the player list into view.',
      },
      { status: 422, headers },
    );
  }

  const { slots, source } = resolveRosterSlots(input.sport, input.rosterPreset, input.rosterSlots);
  if (slots.length === 0) {
    return NextResponse.json(
      { error: 'Could not resolve a roster configuration for this league' },
      { status: 422, headers },
    );
  }

  // ── Core analytics ─────────────────────────────────────────────────────────
  const available: VorPlayerInput[] = input.available.map((p) => ({
    id: p.id ?? null,
    playerName: p.playerName,
    position: p.position ?? null,
    team: p.team ?? null,
    projectedPoints: p.projectedPoints,
    adp: p.adp ?? null,
    rank: p.rank,
    tier: p.tier,
    injuryStatus: p.injuryStatus ?? null,
  }));

  let result;
  try {
    result = computeVor({
      available,
      rosterSlots: slots,
      numTeams: input.numTeams,
      myRoster: input.myRoster,
      recentPicks: input.recentPicks,
      picksMade: input.picksMade,
    });
  } catch (err) {
    console.error('[espn-sync] VOR computation failed:', err);
    return NextResponse.json({ error: 'Analytics computation failed' }, { status: 500, headers });
  }

  // ── Optional grade for the pick that just happened ─────────────────────────
  // Graded against the board *including* the picked player, which is what the
  // drafter was actually choosing from at the moment of the pick.
  let lastPickGrade = null;
  if (input.lastPick?.playerName && features.canSeePickGrades) {
    lastPickGrade = gradePick(
      {
        playerName: input.lastPick.playerName,
        position: input.lastPick.position ?? null,
        team: input.lastPick.team ?? null,
        projectedPoints:
          available.find((a) => a.playerName === input.lastPick!.playerName)?.projectedPoints ?? 0,
        adp: input.lastPick.adp ?? null,
      },
      result.board,
      input.lastPick.overallPick,
    );
  }

  const visible = redactForTier(result, features);

  return NextResponse.json(
    {
      ok: true,
      features,
      upgrade: upgradePromptFor(features),
      rosterSource: source,
      draft: {
        round: input.round ?? null,
        pick: input.pick ?? null,
        picksMade: input.picksMade ?? null,
        teamName: input.teamName ?? null,
      },
      board: visible.board,
      scarcity: visible.scarcity,
      suggestions: visible.suggestions,
      activeRuns: visible.activeRuns,
      unfilledStarters: result.unfilledStarters,
      lastPickGrade,
      generatedAt: new Date().toISOString(),
    },
    { headers },
  );
}
