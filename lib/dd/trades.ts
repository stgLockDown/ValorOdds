/**
 * DiamondDraft — Trade Center engine.
 *
 * Backs the league Trade Center: proposing trades (players / FAAB / draft
 * picks, multi-team), accept / reject / cancel, league veto voting, atomic
 * execution (roster swaps), and a trade analyzer.
 *
 * The schema (`dd_trades`, `dd_trade_assets`, `dd_trade_votes`) already exists
 * in production — this module is purely additive and never touches the draft,
 * waiver, or scoring paths.
 *
 * Lifecycle:
 *
 *   proposed ──accept──▶ accepted ──execute──▶ executed
 *      │  │                 │
 *      │  └──reject──▶ rejected
 *      └──cancel──▶ cancelled
 *
 *   When a league enables trade review, `accept` moves the trade to `voting`
 *   instead of `accepted`; members approve/veto and the commissioner executes
 *   (or the trade is auto-vetoed once the veto threshold is reached).
 */

import { query, queryOne, tx } from '@/lib/db';
import { rosterCapacityOf } from './draft-state';
import type { RosterConfig } from './presets';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type TradeStatus =
  | 'proposed'
  | 'accepted'
  | 'rejected'
  | 'voting'
  | 'approved'
  | 'vetoed'
  | 'executed'
  | 'cancelled';

export type AssetType = 'player' | 'faab' | 'draft_pick';

export interface TradeAssetInput {
  /** Member sending the asset. */
  fromMemberId: string;
  /** Member receiving the asset. */
  toMemberId: string;
  assetType: AssetType;
  /** Player name, FAAB amount (as string), or pick label. */
  assetRef: string;
}

export interface TradeAssetRow {
  id: string;
  fromMemberId: string;
  toMemberId: string;
  assetType: AssetType;
  assetRef: string;
}

export interface TradeVoteRow {
  memberId: string;
  teamName: string;
  vote: 'approve' | 'veto';
  votedAt: string;
}

export interface TradeAnalysisSide {
  memberId: string;
  teamName: string;
  gives: { type: AssetType; ref: string; value: number }[];
  receives: { type: AssetType; ref: string; value: number }[];
  /** Total value received minus total value given. */
  netValue: number;
}

export interface TradeAnalysis {
  verdict: 'fair' | 'lopsided';
  /** Member who comes out ahead (null when fair). */
  favoredMemberId: string | null;
  summary: string;
  sides: TradeAnalysisSide[];
  source: 'ai' | 'model';
}

export interface TradeRow {
  id: string;
  leagueId: string;
  status: TradeStatus;
  proposedBy: string;
  proposerTeamName: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  assets: TradeAssetRow[];
  votes: TradeVoteRow[];
  analysis: TradeAnalysis | null;
  /** The caller's relationship to this trade. */
  myRole: 'proposer' | 'counterparty' | 'observer';
  /** True when the caller can accept/reject right now. */
  canRespond: boolean;
  /** True when the caller can execute right now. */
  canExecute: boolean;
  /** True when the caller can cancel right now. */
  canCancel: boolean;
}

export class TradeError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Value model (deterministic — always available, no API key required)
// ────────────────────────────────────────────────────────────────────────────

/** Rough value of a single FAAB dollar, relative to a projected point. */
const FAAB_VALUE_PER_DOLLAR = 0.35;
/** Nominal value of a future draft pick by round. */
const PICK_ROUND_VALUE: Record<number, number> = {
  1: 220,
  2: 140,
  3: 90,
  4: 60,
  5: 40,
};

function pickValue(ref: string): number {
  const m = ref.match(/(\d+)/);
  const round = m ? Number(m[1]) : 3;
  return PICK_ROUND_VALUE[round] ?? 50;
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

interface MemberRow {
  id: string;
  team_name: string;
  user_id: string;
  is_commissioner: boolean;
}

async function loadMembers(leagueId: bigint): Promise<MemberRow[]> {
  return (
    await query<MemberRow>(
      `SELECT id::text, team_name, user_id::text, is_commissioner
       FROM dd_league_members WHERE league_id = $1`,
      [leagueId]
    )
  ).rows;
}

async function loadLeague(leagueId: bigint) {
  const league = await queryOne<{
    id: string;
    sport: string;
    roster_config: any;
    settings: any;
  }>(
    `SELECT id::text, sport, roster_config, settings
     FROM dd_leagues WHERE id = $1`,
    [leagueId]
  );
  if (!league) throw new TradeError(404, 'League not found');
  const rosterConfig: RosterConfig | null =
    typeof league.roster_config === 'string'
      ? JSON.parse(league.roster_config)
      : league.roster_config ?? null;
  const settings =
    typeof league.settings === 'string' ? JSON.parse(league.settings) : league.settings ?? {};
  return { ...league, rosterConfig, settings };
}

/** Season-long projected points for a set of players (value baseline). */
async function playerValues(sport: string, names: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!names.length) return map;
  const rows = (
    await query<{ player_name: string; projected_points: number | null }>(
      `SELECT player_name, projected_points
       FROM dd_player_pool
       WHERE sport = $1 AND player_name = ANY($2::text[])`,
      [sport, names]
    )
  ).rows;
  for (const r of rows) map.set(r.player_name, Number(r.projected_points) || 0);
  return map;
}

function assetValue(
  asset: { assetType: AssetType; assetRef: string },
  values: Map<string, number>
): number {
  if (asset.assetType === 'player') return values.get(asset.assetRef) ?? 0;
  if (asset.assetType === 'faab') return (Number(asset.assetRef) || 0) * FAAB_VALUE_PER_DOLLAR;
  return pickValue(asset.assetRef);
}

// ────────────────────────────────────────────────────────────────────────────
// Analyzer
// ────────────────────────────────────────────────────────────────────────────

/**
 * Deterministic trade analysis. Groups assets by member, sums the value each
 * member gives vs receives, and reports whether the trade is fair or lopsided.
 */
export async function analyzeTrade(
  sport: string,
  members: MemberRow[],
  assets: TradeAssetInput[]
): Promise<TradeAnalysis> {
  const playerNames = assets.filter((a) => a.assetType === 'player').map((a) => a.assetRef);
  const values = await playerValues(sport, playerNames);
  const nameOf = new Map(members.map((m) => [m.id, m.team_name]));

  const sideMap = new Map<string, TradeAnalysisSide>();
  const ensure = (id: string): TradeAnalysisSide => {
    let s = sideMap.get(id);
    if (!s) {
      s = {
        memberId: id,
        teamName: nameOf.get(id) ?? 'Team',
        gives: [],
        receives: [],
        netValue: 0,
      };
      sideMap.set(id, s);
    }
    return s;
  };

  for (const a of assets) {
    const v = assetValue(a, values);
    ensure(a.fromMemberId).gives.push({ type: a.assetType, ref: a.assetRef, value: v });
    ensure(a.toMemberId).receives.push({ type: a.assetType, ref: a.assetRef, value: v });
  }

  const sides = [...sideMap.values()];
  for (const s of sides) {
    const given = s.gives.reduce((n, x) => n + x.value, 0);
    const got = s.receives.reduce((n, x) => n + x.value, 0);
    s.netValue = Math.round((got - given) * 10) / 10;
  }

  // The "winner" is the member with the highest net value.
  const sorted = [...sides].sort((a, b) => b.netValue - a.netValue);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  const spread = top && bottom ? top.netValue - bottom.netValue : 0;
  const scale = Math.max(
    1,
    ...sides.map((s) => s.receives.reduce((n, x) => n + x.value, 0))
  );
  const fair = spread <= scale * 0.12;

  const favoredMemberId = fair ? null : top?.memberId ?? null;
  const favoredName = favoredMemberId ? nameOf.get(favoredMemberId) ?? 'Team' : null;

  let summary: string;
  if (fair) {
    summary = 'This trade is fair — both sides get comparable value.';
  } else if (favoredName) {
    summary = `This trade favors ${favoredName} (+${Math.round(spread)} value).`;
  } else {
    summary = 'Trade value is roughly even.';
  }

  return { verdict: fair ? 'fair' : 'lopsided', favoredMemberId, summary, sides, source: 'model' };
}

/**
 * Optional AI enrichment. Given the deterministic analysis, ask the model for a
 * short, human verdict. Falls back to the model analysis on any failure so the
 * feature never depends on an API key.
 */
export async function enrichAnalysisWithAI(
  analysis: TradeAnalysis,
  context: string
): Promise<TradeAnalysis> {
  const openaiKey = process.env.OPENAI_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  if (!openaiKey && !deepseekKey) return analysis;

  const providers: { baseUrl: string; apiKey: string; model: string; gpt5: boolean }[] = [];
  const isGpt5 = (m: string) => /^(gpt-5|o[0-9])/i.test(m);
  if (openaiKey) {
    const model = process.env.OPENAI_CHAT_MINI_MODEL || 'gpt-5.4-mini';
    providers.push({
      baseUrl: 'https://api.openai.com/v1',
      apiKey: openaiKey,
      model,
      gpt5: isGpt5(model),
    });
  }
  if (deepseekKey) {
    providers.push({
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: deepseekKey,
      model: process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-chat',
      gpt5: false,
    });
  }

  const prompt = `You are a fantasy sports trade analyst. Given the trade below, reply with ONE short sentence (max 22 words) giving a verdict. Be specific about positions/players. Do not use markdown.\n\n${context}\n\nModel verdict: ${analysis.summary}`;

  for (const p of providers) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12_000);
      const payload: Record<string, unknown> = {
        model: p.model,
        messages: [{ role: 'user', content: prompt }],
      };
      if (p.gpt5) payload.max_completion_tokens = 80;
      else {
        payload.max_tokens = 80;
        payload.temperature = 0.5;
      }
      const res = await fetch(`${p.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) continue;
      const json: any = await res.json();
      const text: string | undefined = json?.choices?.[0]?.message?.content?.trim();
      if (text) return { ...analysis, summary: text, source: 'ai' };
    } catch {
      // fall through to the next provider / model analysis
    }
  }
  return analysis;
}

// ────────────────────────────────────────────────────────────────────────────
// Read
// ────────────────────────────────────────────────────────────────────────────

function roleFor(
  trade: { proposed_by: string; status: TradeStatus },
  memberId: string,
  assets: TradeAssetRow[]
): 'proposer' | 'counterparty' | 'observer' {
  if (trade.proposed_by === memberId) return 'proposer';
  if (assets.some((a) => a.fromMemberId === memberId || a.toMemberId === memberId)) {
    return 'counterparty';
  }
  return 'observer';
}

export async function listTrades(leagueId: bigint, memberId: string): Promise<TradeRow[]> {
  const members = await loadMembers(leagueId);
  const nameOf = new Map(members.map((m) => [m.id, m.team_name]));

  const trades = (
    await query<{
      id: string;
      status: TradeStatus;
      proposed_by: string;
      expires_at: string | null;
      ai_analysis: any;
      created_at: string;
      updated_at: string;
    }>(
      `SELECT id::text, status, proposed_by::text, expires_at, ai_analysis, created_at, updated_at
       FROM dd_trades WHERE league_id = $1
       ORDER BY created_at DESC LIMIT 100`,
      [leagueId]
    )
  ).rows;

  if (!trades.length) return [];
  const ids = trades.map((t) => t.id);

  const assetRows = (
    await query<{
      id: string;
      trade_id: string;
      from_member_id: string;
      to_member_id: string;
      asset_type: AssetType;
      asset_ref: string;
    }>(
      `SELECT id::text, trade_id::text, from_member_id::text, to_member_id::text,
              asset_type, asset_ref
       FROM dd_trade_assets WHERE trade_id = ANY($1::bigint[])`,
      [ids]
    )
  ).rows;

  const voteRows = (
    await query<{
      trade_id: string;
      member_id: string;
      vote: 'approve' | 'veto';
      voted_at: string;
    }>(
      `SELECT trade_id::text, member_id::text, vote, voted_at
       FROM dd_trade_votes WHERE trade_id = ANY($1::bigint[])`,
      [ids]
    )
  ).rows;

  const assetsByTrade = new Map<string, TradeAssetRow[]>();
  for (const a of assetRows) {
    const list = assetsByTrade.get(a.trade_id) ?? [];
    list.push({
      id: a.id,
      fromMemberId: a.from_member_id,
      toMemberId: a.to_member_id,
      assetType: a.asset_type,
      assetRef: a.asset_ref,
    });
    assetsByTrade.set(a.trade_id, list);
  }

  const votesByTrade = new Map<string, TradeVoteRow[]>();
  for (const v of voteRows) {
    const list = votesByTrade.get(v.trade_id) ?? [];
    list.push({
      memberId: v.member_id,
      teamName: nameOf.get(v.member_id) ?? 'Team',
      vote: v.vote,
      votedAt: v.voted_at,
    });
    votesByTrade.set(v.trade_id, list);
  }

  return trades.map((t) => {
    const assets = assetsByTrade.get(t.id) ?? [];
    const votes = votesByTrade.get(t.id) ?? [];
    const role = roleFor({ proposed_by: t.proposed_by, status: t.status }, memberId, assets);
    const isCounterparty = assets.some((a) => a.toMemberId === memberId);
    const canRespond = t.status === 'proposed' && isCounterparty;
    const canExecute =
      (t.status === 'accepted' || t.status === 'voting' || t.status === 'approved') &&
      (role === 'proposer' ||
        members.find((m) => m.id === memberId)?.is_commissioner === true);
    const canCancel = t.status === 'proposed' && role === 'proposer';
    return {
      id: t.id,
      leagueId: leagueId.toString(),
      status: t.status,
      proposedBy: t.proposed_by,
      proposerTeamName: nameOf.get(t.proposed_by) ?? 'Team',
      expiresAt: t.expires_at,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
      assets,
      votes,
      analysis: (t.ai_analysis as TradeAnalysis) ?? null,
      myRole: role,
      canRespond,
      canExecute,
      canCancel,
    };
  });
}

// ────────────────────────────────────────────────────────────────────────────
// Propose
// ────────────────────────────────────────────────────────────────────────────

export interface ProposeTradeInput {
  leagueId: bigint;
  proposerMemberId: string;
  assets: TradeAssetInput[];
}

export async function proposeTrade(input: ProposeTradeInput): Promise<TradeRow> {
  const { leagueId, proposerMemberId, assets } = input;
  if (!assets.length) throw new TradeError(400, 'A trade needs at least one asset');

  const league = await loadLeague(leagueId);
  const members = await loadMembers(leagueId);
  const memberIds = new Set(members.map((m) => m.id));

  // Validate every asset references real members and that the proposer is a party.
  const proposerInvolved = assets.some(
    (a) => a.fromMemberId === proposerMemberId || a.toMemberId === proposerMemberId
  );
  if (!proposerInvolved) {
    throw new TradeError(403, 'You must be a party to the trade you propose');
  }
  for (const a of assets) {
    if (!memberIds.has(a.fromMemberId) || !memberIds.has(a.toMemberId)) {
      throw new TradeError(400, 'Trade references a team that is not in this league');
    }
    if (a.fromMemberId === a.toMemberId) {
      throw new TradeError(400, 'A team cannot trade with itself');
    }
    if (a.assetType === 'player') {
      const owned = await queryOne<{ id: string }>(
        `SELECT id::text FROM dd_rosters
         WHERE league_id = $1 AND member_id = $2 AND player_name = $3`,
        [leagueId, BigInt(a.fromMemberId), a.assetRef]
      );
      if (!owned) {
        throw new TradeError(400, `${a.assetRef} is not on that team's roster`);
      }
    }
  }

  // Build the analysis context for the AI enrichment.
  const analysis = await analyzeTrade(league.sport, members, assets);
  const context = buildAnalysisContext(members, assets, analysis);
  const enriched = await enrichAnalysisWithAI(analysis, context);

  const tradeId = await tx(async (client) => {
    const t = await client.query<{ id: string }>(
      `INSERT INTO dd_trades (league_id, status, proposed_by, ai_analysis)
       VALUES ($1, 'proposed', $2, $3::jsonb)
       RETURNING id::text`,
      [leagueId, BigInt(proposerMemberId), JSON.stringify(enriched)]
    );
    const id = t.rows[0].id;
    for (const a of assets) {
      await client.query(
        `INSERT INTO dd_trade_assets
           (trade_id, from_member_id, to_member_id, asset_type, asset_ref)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, BigInt(a.fromMemberId), BigInt(a.toMemberId), a.assetType, a.assetRef]
      );
    }
    return id;
  });

  const all = await listTrades(leagueId, proposerMemberId);
  const created = all.find((t) => t.id === tradeId);
  if (!created) throw new TradeError(500, 'Trade created but could not be loaded');
  return created;
}

function buildAnalysisContext(
  members: MemberRow[],
  assets: TradeAssetInput[],
  analysis: TradeAnalysis
): string {
  const nameOf = new Map(members.map((m) => [m.id, m.team_name]));
  const lines: string[] = [];
  for (const s of analysis.sides) {
    const gives = s.gives.map((g) => `${g.ref} (${g.type})`).join(', ') || 'nothing';
    const gets = s.receives.map((g) => `${g.ref} (${g.type})`).join(', ') || 'nothing';
    lines.push(`${s.teamName} sends: ${gives} | receives: ${gets}`);
  }
  void assets;
  void nameOf;
  return lines.join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// Respond / execute
// ────────────────────────────────────────────────────────────────────────────

export type TradeAction = 'accept' | 'reject' | 'cancel' | 'execute' | 'vote';

export interface RespondInput {
  leagueId: bigint;
  tradeId: bigint;
  memberId: string;
  action: TradeAction;
  /** For action='vote'. */
  vote?: 'approve' | 'veto';
}

export async function respondToTrade(input: RespondInput): Promise<TradeRow> {
  const { leagueId, tradeId, memberId, action } = input;
  const members = await loadMembers(leagueId);
  const me = members.find((m) => m.id === memberId);
  if (!me) throw new TradeError(403, 'You are not in this league');

  const trade = await queryOne<{
    id: string;
    status: TradeStatus;
    proposed_by: string;
  }>(
    `SELECT id::text, status, proposed_by::text FROM dd_trades
     WHERE id = $1 AND league_id = $2`,
    [tradeId, leagueId]
  );
  if (!trade) throw new TradeError(404, 'Trade not found');

  const assets = (
    await query<{
      from_member_id: string;
      to_member_id: string;
      asset_type: AssetType;
      asset_ref: string;
    }>(
      `SELECT from_member_id::text, to_member_id::text, asset_type, asset_ref
       FROM dd_trade_assets WHERE trade_id = $1`,
      [tradeId]
    )
  ).rows;

  const isCounterparty = assets.some((a) => a.to_member_id === memberId);
  const isProposer = trade.proposed_by === memberId;

  switch (action) {
    case 'accept': {
      if (trade.status !== 'proposed') throw new TradeError(409, 'This trade is no longer open');
      if (!isCounterparty) throw new TradeError(403, 'Only the receiving team can accept');
      const league = await loadLeague(leagueId);
      const review = league.settings?.tradeReview === true;
      await query(
        `UPDATE dd_trades SET status = $2, updated_at = NOW() WHERE id = $1`,
        [tradeId, review ? 'voting' : 'accepted']
      );
      if (!review) {
        // No review window — execute immediately.
        await executeTrade(leagueId, tradeId);
      }
      break;
    }
    case 'reject': {
      if (trade.status !== 'proposed') throw new TradeError(409, 'This trade is no longer open');
      if (!isCounterparty) throw new TradeError(403, 'Only the receiving team can reject');
      await query(
        `UPDATE dd_trades SET status = 'rejected', updated_at = NOW() WHERE id = $1`,
        [tradeId]
      );
      break;
    }
    case 'cancel': {
      if (trade.status !== 'proposed') throw new TradeError(409, 'This trade is no longer open');
      if (!isProposer) throw new TradeError(403, 'Only the proposer can cancel');
      await query(
        `UPDATE dd_trades SET status = 'cancelled', updated_at = NOW() WHERE id = $1`,
        [tradeId]
      );
      break;
    }
    case 'vote': {
      if (trade.status !== 'voting') throw new TradeError(409, 'This trade is not under review');
      if (!input.vote) throw new TradeError(400, 'A vote must be approve or veto');
      await query(
        `INSERT INTO dd_trade_votes (trade_id, member_id, vote)
         VALUES ($1, $2, $3)
         ON CONFLICT (trade_id, member_id)
         DO UPDATE SET vote = EXCLUDED.vote, voted_at = NOW()`,
        [tradeId, BigInt(memberId), input.vote]
      );
      // Auto-veto once the threshold is reached.
      const league = await loadLeague(leagueId);
      const threshold = Number(league.settings?.tradeVetoVotes) || 0;
      if (threshold > 0) {
        const vetoes = await queryOne<{ n: string }>(
          `SELECT COUNT(*)::text AS n FROM dd_trade_votes
           WHERE trade_id = $1 AND vote = 'veto'`,
          [tradeId]
        );
        if (Number(vetoes?.n ?? '0') >= threshold) {
          await query(
            `UPDATE dd_trades SET status = 'vetoed', updated_at = NOW() WHERE id = $1`,
            [tradeId]
          );
        }
      }
      break;
    }
    case 'execute': {
      if (!['accepted', 'voting', 'approved'].includes(trade.status)) {
        throw new TradeError(409, 'This trade is not ready to execute');
      }
      if (!isProposer && !me.is_commissioner) {
        throw new TradeError(403, 'Only the proposer or commissioner can execute');
      }
      await executeTrade(leagueId, tradeId);
      break;
    }
    default:
      throw new TradeError(400, 'Unknown action');
  }

  const all = await listTrades(leagueId, memberId);
  const updated = all.find((t) => t.id === String(tradeId));
  if (!updated) throw new TradeError(500, 'Trade updated but could not be loaded');
  return updated;
}

/**
 * Execute a trade: move every asset to its destination atomically.
 *
 * Players are re-assigned via `UPDATE ... SET member_id` (the roster table has
 * a UNIQUE(league_id, player_name) constraint, so an update — not a
 * delete+insert — is the safe primitive). Traded players land on the bench so
 * the receiving manager re-sets their lineup. Roster capacity is validated
 * before any change is made.
 */
export async function executeTrade(leagueId: bigint, tradeId: bigint): Promise<void> {
  const league = await loadLeague(leagueId);
  const capacity = rosterCapacityOf(league.rosterConfig);

  const assets = (
    await query<{
      from_member_id: string;
      to_member_id: string;
      asset_type: AssetType;
      asset_ref: string;
    }>(
      `SELECT from_member_id::text, to_member_id::text, asset_type, asset_ref
       FROM dd_trade_assets WHERE trade_id = $1`,
      [tradeId]
    )
  ).rows;
  if (!assets.length) throw new TradeError(400, 'Trade has no assets');

  // Validate: every player is still owned by the sending team.
  for (const a of assets) {
    if (a.asset_type !== 'player') continue;
    const owned = await queryOne<{ id: string }>(
      `SELECT id::text FROM dd_rosters
       WHERE league_id = $1 AND member_id = $2 AND player_name = $3`,
      [leagueId, BigInt(a.from_member_id), a.asset_ref]
    );
    if (!owned) {
      throw new TradeError(
        409,
        `${a.asset_ref} is no longer on the sending team — the trade can no longer be executed`
      );
    }
  }

  // Validate roster capacity for each receiving team.
  if (capacity > 0) {
    const netByMember = new Map<string, number>();
    for (const a of assets) {
      if (a.asset_type !== 'player') continue;
      netByMember.set(a.to_member_id, (netByMember.get(a.to_member_id) ?? 0) + 1);
      netByMember.set(a.from_member_id, (netByMember.get(a.from_member_id) ?? 0) - 1);
    }
    for (const [memberId, delta] of netByMember) {
      if (delta <= 0) continue;
      const cnt = await queryOne<{ n: string }>(
        `SELECT COUNT(*)::text AS n FROM dd_rosters WHERE league_id = $1 AND member_id = $2`,
        [leagueId, BigInt(memberId)]
      );
      if (Number(cnt?.n ?? '0') + delta > capacity) {
        throw new TradeError(
          409,
          'A team would exceed its roster limit — drop a player first'
        );
      }
    }
  }

  await tx(async (client) => {
    for (const a of assets) {
      if (a.asset_type === 'player') {
        await client.query(
          `UPDATE dd_rosters
             SET member_id = $3, slot = 'BN', acquired_via = 'trade', acquired_at = NOW()
           WHERE league_id = $1 AND member_id = $2 AND player_name = $4`,
          [leagueId, BigInt(a.from_member_id), BigInt(a.to_member_id), a.asset_ref]
        );
      }
      // FAAB and draft picks are recorded on the trade record itself; the
      // FAAB ledger is applied by the waiver system, so nothing to move here.
    }
    await client.query(
      `UPDATE dd_trades SET status = 'executed', updated_at = NOW() WHERE id = $1`,
      [tradeId]
    );
  });
}
