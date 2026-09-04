'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  Trophy, Search, Clock, Pause, Play, Check, Loader2, ArrowLeft,
  Target, Shield, Crown, ChevronRight, X, Filter, Zap, ArrowUpDown, AlertCircle,
} from 'lucide-react';
import { PlayerInfoCard } from '@/components/dd/PlayerInfoCard';
import {
  getPositionColor,
  positionBadgeStyle,
  positionLeftBorderStyle,
  positionCellBgStyle,
  getPositionLegend,
} from '@/lib/dd/position-colors';
import {
  checkPositionLimit,
  getPositionSummary,
  type FilledCounts,
} from '@/lib/dd/roster-enforcement';
import DraftLayoutGrid, { PANEL_KEYS } from '@/components/dd/DraftLayoutGrid';

interface Player {
  id: string; playerName: string; team: string | null; position: string | null;
  rank: number | null; tier: number | null; projectedPoints: number | null;
  adp: number | null;
  vegasScore?: number | null;
  vegasRank?: number | null;
  // Bio fields (returned by /api/dd/players from dd_player_pool)
  espnId?: string | null;
  headshot?: string | null;
  height?: string | null;
  weight?: string | null;
  age?: number | null;
  college?: string | null;
  debutYear?: number | null;
  experienceYears?: number | null;
  birthPlace?: string | null;
  jersey?: string | null;
}

interface DraftPick {
  id: string; playerName: string; playerId: string | null;
  team: string | null; position: string | null;
  round: number; overallPick: number;
  isAutoPicked: boolean; pickedAt: string;
}

interface RosterSlot {
  slot: string; label: string; count: number; eligible: string[]; isStarter: boolean;
}

interface DraftBoardEntry {
  round: number; pickInRound: number; overallPick: number; slot: number;
  memberId?: string; teamName?: string; displayName?: string;
  pick?: { playerName: string; position: string | null; team: string | null; isAutoPicked: boolean; headshot?: string | null } | null;
}

interface Member {
  id: string; userId: string; teamName: string; draftPosition: number | null;
  displayName: string; isBot?: boolean;
}

interface DraftState {
  draft: {
    id: string; leagueId: string; leagueName: string; sport: string;
    draftType: string; status: string; rounds: number; numTeams: number;
    currentRound: number; currentPick: number; timerSeconds: number | null;
    startedAt: string | null; completedAt: string | null;
    isComplete: boolean; picksMade: number; totalPicks: number; isMock?: boolean;
    rosterConfig?: { slots: RosterSlot[]; name?: string; totalRosterSize?: number; totalStarters?: number } | RosterSlot[];
  };
  currentTurn: {
    overallPick: number; round: number; pickInRound: number; slot: number;
    memberId: string; teamName: string; displayName: string;
  } | null;
  members: Member[];
  draftBoard: DraftBoardEntry[];
  teamRosters: Record<string, { playerName: string; position: string | null; team: string | null; round: number; overallPick: number }[]>;
}

export default function DraftRoomClient({
  leagueId,
  leagueName,
  sport,
  seasonYear,
  currentMemberId,
  currentTeamName,
  currentDraftPosition,
  isCommissioner,
}: {
  leagueId: string;
  leagueName: string;
  sport: string;
  seasonYear: number;
  currentMemberId: string;
  currentTeamName: string;
  currentDraftPosition: number | null;
  isCommissioner: boolean;
}) {
  const [draftState, setDraftState] = useState<DraftState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [players, setPlayers] = useState<Player[]>([]);
  const [playerSearch, setPlayerSearch] = useState('');
  const [positionFilter, setPositionFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<'rank' | 'vegas_rank' | 'projected_points' | 'adp'>('rank');
  const [playersLoading, setPlayersLoading] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [lastPollTime, setLastPollTime] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [positionWarning, setPositionWarning] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoPickAttemptedRef = useRef<Set<number>>(new Set()); // track overall picks we've tried to auto-pick
  const turnStartRef = useRef<number>(0); // timestamp when current turn started
  const lastOverallPickRef = useRef<number>(0); // track overall pick changes to reset timer

  // ── Hover info card state ──
  const [hoveredPlayer, setHoveredPlayer] = useState<Player | null>(null);
  const [cardVisible, setCardVisible] = useState(false);
  const [cardPos, setCardPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  // Refs to the currently-hovered row and its scroll panel — used by the
  // scroll listener to reposition the card as the user scrolls the player list.
  const hoveredRowRef = useRef<HTMLElement | null>(null);
  const hoveredPanelRef = useRef<HTMLElement | null>(null);
  // Track the last computed card position to avoid redundant state updates
  const lastCardPosRef = useRef<{ top: number; left: number }>({ top: 0, left: 0 });

  const sportIcon = sport === 'NFL'
    ? <Shield className="w-5 h-5" />
    : <Target className="w-5 h-5" />;

  // Fetch draft state
  const fetchDraftState = useCallback(async () => {
    try {
      const res = await fetch(`/api/dd/drafts?leagueId=${leagueId}`);
      const data = await res.json();
      if (res.ok) {
        setDraftState(data);
        setLastPollTime(Date.now());
      } else if (data.error?.includes('not found') || data.error?.includes('Draft not found')) {
        setError('No draft has been started yet. The commissioner needs to start the draft.');
      }
    } catch {
      // Silently fail, will retry
    } finally {
      setLoading(false);
    }
  }, [leagueId]);

  // Fetch available players
  const fetchPlayers = useCallback(async () => {
    setPlayersLoading(true);
    try {
      const params = new URLSearchParams({
        sport,
        seasonYear: String(seasonYear),
        excludeDrafted: leagueId,
        sort: sortBy,
        limit: '100',
      });
      if (playerSearch) params.set('search', playerSearch);
      if (positionFilter) params.set('position', positionFilter);

      const res = await fetch(`/api/dd/players?${params}`);
      const data = await res.json();
      if (res.ok) {
        setPlayers(data.players || []);
      }
    } catch {
      // Silently fail
    } finally {
      setPlayersLoading(false);
    }
  }, [sport, seasonYear, leagueId, playerSearch, positionFilter, sortBy]);

  // Initial load
  useEffect(() => {
    fetchDraftState();
    fetchPlayers();
  }, [fetchDraftState, fetchPlayers]);

  // Real-time updates: use Server-Sent Events (SSE) for live draft sync.
  // Falls back to polling every 5s if SSE is unavailable.
  useEffect(() => {
    if (!draftState || draftState.draft.isComplete) return;

    let sseConnected = false;
    let pollStarted = false;

    // ── SSE connection for real-time updates ──
    const draftId = draftState.draft.id;
    const es = new EventSource(`/api/dd/drafts/${draftId}/stream`);
    eventSourceRef.current = es;

    es.onopen = () => {
      sseConnected = true;
      // Stop polling if SSE is working
      if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'state' && data.draft) {
          // Update draft state from SSE push
          setDraftState(data);
          setLastPollTime(Date.now());
          // Also refresh players when picks change
          if (data.draft.picksMade !== draftState.draft.picksMade) {
            fetchPlayers();
          }
        }
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      sseConnected = false;
      es.close();
      eventSourceRef.current = null;
      // Start polling fallback if not already running
      if (!pollRef.current && !draftState.draft.isComplete) {
        pollStarted = true;
        const poll = () => {
          fetchDraftState();
          pollRef.current = setTimeout(poll, 5000);
        };
        pollRef.current = setTimeout(poll, 5000);
      }
    };

    // Also start polling as a backup in case SSE takes time to connect
    // (will be cleared once SSE connects successfully)
    if (!sseConnected && !pollStarted) {
      const poll = () => {
        if (!sseConnected) {
          fetchDraftState();
          pollRef.current = setTimeout(poll, 5000);
        }
      };
      pollRef.current = setTimeout(poll, 5000);
    }

    return () => {
      es.close();
      eventSourceRef.current = null;
      if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [draftState?.draft.isComplete, draftState?.draft.id, fetchDraftState, fetchPlayers]);

  // Countdown timer: track when the current turn started and tick down every second
  useEffect(() => {
    if (!draftState?.currentTurn || draftState.draft.isComplete) {
      setCountdown(null);
      return;
    }
    const overallPick = draftState.currentTurn.overallPick;
    const timerSeconds = draftState.draft.timerSeconds ?? 90;

    // Reset timer when a new pick slot comes on the clock
    if (lastOverallPickRef.current !== overallPick) {
      lastOverallPickRef.current = overallPick;
      turnStartRef.current = Date.now();
      setCountdown(timerSeconds);
    }

    const tick = () => {
      const elapsed = Math.floor((Date.now() - turnStartRef.current) / 1000);
      const remaining = Math.max(0, timerSeconds - elapsed);
      setCountdown(remaining);
    };

    tick(); // immediate update
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [draftState?.currentTurn?.overallPick, draftState?.draft.isComplete, draftState?.draft.timerSeconds]);

  // Debounced player search
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      fetchPlayers();
    }, 300);
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    };
  }, [playerSearch, positionFilter, fetchPlayers]);

  // ── Hover info card handlers ──
  // ── Compute card position relative to the player list panel ──
  // The card uses position:fixed (viewport-relative). We anchor it to the
  // LEFT edge of the player-list scroll panel so it appears consistently
  // next to the list, not floating in random spots. Vertically, we align
  // the card centre with the hovered row, then clamp within the viewport.
  const computeCardPosition = useCallback((
    rowRect: DOMRect,
    panelRect: DOMRect,
    cardWidth: number,
    cardHeight: number,
  ): { top: number; left: number } => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 12;

    // ── Horizontal: prefer LEFT of the panel (panel is on the right side) ──
    let left = panelRect.left - cardWidth - 8;
    if (left < margin) {
      // Not enough room on the left — try RIGHT of the panel
      left = panelRect.right + 8;
    }
    // If still off-screen on the right, squeeze it into the viewport
    if (left + cardWidth > vw - margin) {
      left = vw - cardWidth - margin;
    }
    // Final clamp
    if (left < margin) left = margin;

    // ── Vertical: align card centre with the row centre, then clamp ──
    const rowCenter = rowRect.top + rowRect.height / 2;
    let top = rowCenter - cardHeight / 2;

    // Clamp so the card stays fully within the viewport
    if (top < margin) top = margin;
    if (top + cardHeight > vh - margin) top = vh - cardHeight - margin;
    // If the viewport is shorter than the card, just pin to top
    if (top < margin) top = margin;

    return { top: Math.round(top), left: Math.round(left) };
  }, []);

  const handlePlayerMouseEnter = useCallback((player: Player, e: React.MouseEvent<HTMLDivElement>) => {
    // Clear any pending close
    if (cardCloseTimerRef.current) {
      clearTimeout(cardCloseTimerRef.current);
      cardCloseTimerRef.current = null;
    }
    // Clear any pending open
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    // Capture the target rect NOW — e.currentTarget becomes null after the
    // handler returns (React nulls it), so we can't access it inside setTimeout.
    // Also capture the scroll panel rect (closest scrollable ancestor).
    const targetEl = e.currentTarget as HTMLElement;
    const rowRect = targetEl.getBoundingClientRect();
    // Walk up to find the scrollable panel container
    let panelEl: HTMLElement | null = targetEl.parentElement;
    while (panelEl) {
      const style = window.getComputedStyle(panelEl);
      if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && panelEl.scrollHeight > panelEl.clientHeight) {
        break;
      }
      panelEl = panelEl.parentElement;
    }
    const panelRect = panelEl ? panelEl.getBoundingClientRect() : rowRect;

    // Store refs so the scroll listener can reposition
    hoveredRowRef.current = targetEl;
    hoveredPanelRef.current = panelEl;

    // Delay showing the card to avoid flicker on quick mouse-overs
    hoverTimerRef.current = setTimeout(() => {
      // Use the CURRENT rect (the row may have shifted if list was scrolling)
      const currentRowRect = targetEl.getBoundingClientRect();
      const currentPanelRect = panelEl ? panelEl.getBoundingClientRect() : currentRowRect;
      const { top, left } = computeCardPosition(
        currentRowRect,
        currentPanelRect,
        380, // card width (w-[380px])
        480, // card max height (max-h-[480px])
      );
      setHoveredPlayer(player);
      lastCardPosRef.current = { top, left };
      setCardPos({ top, left });
      setCardVisible(true);
    }, 350); // 350ms hover delay
  }, [computeCardPosition]);

  const handlePlayerMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    // Small grace period before closing — lets user move mouse into the card
    cardCloseTimerRef.current = setTimeout(() => {
      setCardVisible(false);
      setHoveredPlayer(null);
      hoveredRowRef.current = null;
      hoveredPanelRef.current = null;
    }, 200);
  }, []);

  const handleCardMouseEnter = useCallback(() => {
    if (cardCloseTimerRef.current) {
      clearTimeout(cardCloseTimerRef.current);
      cardCloseTimerRef.current = null;
    }
  }, []);

  const handleCardMouseLeave = useCallback(() => {
    cardCloseTimerRef.current = setTimeout(() => {
      setCardVisible(false);
      setHoveredPlayer(null);
      hoveredRowRef.current = null;
      hoveredPanelRef.current = null;
    }, 200);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      if (cardCloseTimerRef.current) clearTimeout(cardCloseTimerRef.current);
    };
  }, []);

  // ── Reposition or hide the hover card when the player list scrolls ──
  // When the user scrolls the player-list panel, the hovered row moves on
  // screen. We recompute the card's vertical position to track the row. If
  // the row has scrolled completely out of the panel's visible area, we
  // hide the card.
  useEffect(() => {
    if (!cardVisible) return;
    const panel = hoveredPanelRef.current;
    const row = hoveredRowRef.current;
    if (!panel || !row) return;

    const onScroll = () => {
      const rowRect = row.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      // If the row is no longer visible within the panel, hide the card
      if (rowRect.bottom < panelRect.top || rowRect.top > panelRect.bottom) {
        setCardVisible(false);
        setHoveredPlayer(null);
        return;
      }
      // Otherwise, reposition the card to track the row
      const { top, left } = computeCardPosition(rowRect, panelRect, 380, 480);
      lastCardPosRef.current = { top, left };
      setCardPos({ top, left });
    };

    panel.addEventListener('scroll', onScroll, { passive: true });
    // Also handle window resize
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      panel.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [cardVisible, computeCardPosition]);

  // ── Measure actual card height after render and reposition if needed ──
  // The positioning logic uses an estimated height of 480px, but the actual
  // card may be shorter (e.g. loading state ~200px) or change height when
  // data finishes loading. We use a ResizeObserver to detect size changes
  // and recompute the vertical position so the card stays aligned with the
  // hovered row and within the viewport.
  useEffect(() => {
    if (!cardVisible || !cardRef.current) return;
    const card = cardRef.current;
    const row = hoveredRowRef.current;
    const panel = hoveredPanelRef.current;
    if (!row) return;

    const reposition = () => {
      const actualHeight = card.offsetHeight;
      const actualWidth = card.offsetWidth;
      const rowRect = row.getBoundingClientRect();
      const panelRect = panel ? panel.getBoundingClientRect() : rowRect;
      const { top, left } = computeCardPosition(rowRect, panelRect, actualWidth, actualHeight);
      if (Math.abs(top - lastCardPosRef.current.top) > 2 || Math.abs(left - lastCardPosRef.current.left) > 2) {
        lastCardPosRef.current = { top, left };
        setCardPos({ top, left });
      }
    };

    // Reposition immediately on mount
    reposition();

    // Watch for size changes (loading -> full data transitions)
    const resizeObserver = new ResizeObserver(() => reposition());
    resizeObserver.observe(card);

    return () => resizeObserver.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardVisible, hoveredPlayer, computeCardPosition]);

  const makePick = async (player: Player) => {
    if (!draftState?.currentTurn) return;
    setPicking(player.playerName);
    setError('');
    setPositionWarning(null);
    try {
      const res = await fetch(`/api/dd/drafts/${draftState.draft.id}/pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerName: player.playerName,
          playerId: player.id,
          team: player.team,
          position: player.position,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to make pick');
        // If the server returned position limits, surface a warning too
        if (data.positionLimits) {
          setPositionWarning(data.error || null);
        }
      } else {
        if (data.positionWarning) {
          setPositionWarning(data.positionWarning);
        }
        // Immediately refresh draft state
        fetchDraftState();
        fetchPlayers();
      }
    } catch {
      setError('Network error');
    } finally {
      setPicking(null);
    }
  };

  const togglePause = async () => {
    if (!draftState) return;
    const action = draftState.draft.status === 'paused' ? 'resume' : 'pause';
    try {
      await fetch(`/api/dd/drafts/${draftState.draft.id}/${action}`, { method: 'POST' });
      fetchDraftState();
    } catch {
      setError('Failed to toggle draft');
    }
  };

  // ── Bot auto-pick: when it's a bot's turn (not the user), trigger auto-pick ──
  const triggerBotAutoPick = useCallback(async () => {
    if (!draftState?.currentTurn || draftState.draft.isComplete) return;
    const onClockMember = draftState.members.find((m) => m.id === draftState.currentTurn!.memberId);
    if (!onClockMember?.isBot) return; // only auto-pick for bots

    const overallPick = draftState.currentTurn.overallPick;
    // Avoid duplicate auto-pick attempts for the same pick slot
    if (autoPickAttemptedRef.current.has(overallPick)) return;
    autoPickAttemptedRef.current.add(overallPick);

    try {
      const res = await fetch(`/api/dd/drafts/${draftState.draft.id}/auto-pick`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        // Immediately refresh draft state after a successful auto-pick
        fetchDraftState();
      } else {
        // If it failed, remove from attempted set so we can retry on next poll
        autoPickAttemptedRef.current.delete(overallPick);
      }
    } catch {
      autoPickAttemptedRef.current.delete(overallPick);
    }
  }, [draftState, fetchDraftState]);

  // Detect bot turns and trigger auto-pick with a short delay (feels more natural)
  useEffect(() => {
    if (!draftState?.currentTurn || draftState.draft.isComplete) return;
    const currentTurnLocal = draftState.currentTurn;
    const onClockMember = draftState.members.find((m) => m.id === currentTurnLocal.memberId);
    if (!onClockMember?.isBot) return;

    const overallPick = currentTurnLocal.overallPick;
    if (autoPickAttemptedRef.current.has(overallPick)) return;

    // Delay 1.5 seconds before auto-picking so the UI shows the bot "thinking"
    const timer = setTimeout(() => {
      triggerBotAutoPick();
    }, 1500);

    return () => clearTimeout(timer);
  }, [draftState?.currentTurn, draftState?.draft.isComplete, triggerBotAutoPick]);

  // Loading state
  if (loading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-20 text-center">
        <Loader2 className="w-8 h-8 text-brand-primary animate-spin mx-auto" />
        <p className="text-brand-muted mt-3">Loading draft room...</p>
      </div>
    );
  }

  // No draft yet
  if (!draftState) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <Link href={`/dd/league/${leagueId}`} className="inline-flex items-center gap-1 text-sm text-brand-muted hover:text-brand-text mb-4">
          <ArrowLeft className="w-4 h-4" /> League Home
        </Link>
        <div className="card text-center py-12">
          <Clock className="w-12 h-12 text-brand-muted mx-auto mb-4" />
          <h2 className="text-xl font-bold text-brand-text mb-2">No Active Draft</h2>
          <p className="text-brand-muted mb-6">{error || 'The draft hasn\'t started yet.'}</p>
          {isCommissioner && (
            <Link href={`/dd/league/${leagueId}`} className="btn-primary">
              Start the Draft
            </Link>
          )}
        </div>
      </div>
    );
  }

  const { draft, currentTurn, members, draftBoard, teamRosters } = draftState;
  const isMyTurn = currentTurn?.memberId === currentMemberId;
  const myRoster = teamRosters[currentMemberId] || [];
  const onClockMember = currentTurn ? members.find((m) => m.id === currentTurn.memberId) : null;
  const isBotThinking = !isMyTurn && onClockMember?.isBot && !draft.isComplete;

  // Position filter options based on sport
  const positions = sport === 'NFL'
    ? ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']
    : ['C', '1B', '2B', '3B', 'SS', 'OF', 'SP', 'RP'];

  // ── Roster needs calculation: which starter positions still need to be filled ──
  const rosterSlots: RosterSlot[] = Array.isArray(draft.rosterConfig)
    ? draft.rosterConfig
    : draft.rosterConfig?.slots ?? [];
  const positionNeeds = (() => {
    if (!rosterSlots.length) return { needed: [] as string[], filled: {} as Record<string, number>, remaining: {} as Record<string, number> };
    const filled: Record<string, number> = {};
    // Count how many of each position the user has drafted
    for (const pick of myRoster) {
      const pos = pick.position ?? 'BN';
      filled[pos] = (filled[pos] ?? 0) + 1;
    }
    // Calculate remaining needs for each starter slot
    const remaining: Record<string, number> = {};
    const needed: string[] = [];
    for (const slot of rosterSlots) {
      if (!slot.isStarter) continue;
      // For each starter slot, check if the user has enough eligible players
      const eligibleFilled = slot.eligible.includes('*')
        ? myRoster.length
        : slot.eligible.reduce((sum, pos) => sum + (filled[pos] ?? 0), 0);
      const need = Math.max(0, slot.count - eligibleFilled);
      if (need > 0) {
        remaining[slot.slot] = need;
        // Add eligible positions for this slot to needed list
        if (!slot.eligible.includes('*')) {
          for (const pos of slot.eligible) {
            if (!needed.includes(pos)) needed.push(pos);
          }
        }
      }
    }
    return { needed, filled, remaining };
  })();

  // Check if a player fills a needed position
  const playerFillsNeed = (playerPos: string | null): boolean => {
    if (!playerPos || !positionNeeds.needed.length) return false;
    return positionNeeds.needed.includes(playerPos);
  };

  // ── Position limit enforcement (client-side preview) ──
  // Mirrors the server-side check so the UI can disable the Draft button
  // and show the reason before the user even clicks.
  const positionSummary = rosterSlots.length > 0
    ? getPositionSummary(rosterSlots, positionNeeds.filled as FilledCounts)
    : [];
  const totalRosterSize = rosterSlots.reduce((sum, s) => sum + s.count, 0);
  const enforceLimits = true; // server defaults to true; UI previews accordingly

  const getPickBlockReason = (player: Player): string | null => {
    if (!rosterSlots.length || !player.position) return null;
    if (!enforceLimits) return null;
    const check = checkPositionLimit(
      rosterSlots,
      player.position,
      positionNeeds.filled as FilledCounts,
      totalRosterSize,
      myRoster.length
    );
    return check.allowed ? null : check.reason;
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Link href={`/dd/league/${leagueId}`} className="btn-ghost p-2">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="flex items-center gap-2">
            {sportIcon}
            <div>
              <h1 className="text-xl font-bold text-brand-text">{leagueName} — Draft</h1>
              <p className="text-xs text-brand-muted">
                {draft.draftType.replace(/_/g, ' ')} · {draft.picksMade}/{draft.totalPicks} picks
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {draft.status === 'in_progress' && (
            <span className="flex items-center gap-1.5 text-xs text-brand-success">
              <span className="w-2 h-2 rounded-full bg-brand-success animate-pulse" />
              Live
            </span>
          )}
          {draft.status === 'paused' && (
            <span className="flex items-center gap-1.5 text-xs text-brand-accent">
              <Pause className="w-3 h-3" /> Paused
            </span>
          )}
          {isCommissioner && draft.status !== 'completed' && (
            <button onClick={togglePause} className="btn-secondary text-sm py-2">
              {draft.status === 'paused' ? <><Play className="w-4 h-4" /> Resume</> : <><Pause className="w-4 h-4" /> Pause</>}
            </button>
          )}
        </div>
      </div>

      {/* On the clock banner */}
      {currentTurn && !draft.isComplete && (
        <div className={`rounded-xl p-4 mb-4 border-2 transition-all ${
          isMyTurn
            ? 'border-brand-primary bg-brand-primary/10 animate-pulse'
            : 'border-brand-border bg-brand-surface'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className={`w-6 h-6 ${isMyTurn ? 'text-brand-primary' : 'text-brand-muted'}`} />
              <div>
                <div className="text-sm text-brand-muted">On the clock</div>
                <div className={`text-lg font-bold ${isMyTurn ? 'text-brand-primaryText' : 'text-brand-text'}`}>
                  {isMyTurn ? 'YOUR PICK' : currentTurn.displayName}
                  {onClockMember?.isBot && !isMyTurn && (
                    <span className="ml-2 text-xs font-normal text-brand-muted flex items-center gap-1 inline-flex">
                      <Loader2 className="w-3 h-3 animate-spin" /> AI thinking...
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-brand-muted">Pick #{currentTurn.overallPick}</div>
              <div className="text-sm text-brand-text">Round {currentTurn.round}</div>
              {countdown !== null && (
                <div
                  className={`text-2xl font-bold tabular-nums mt-1 ${
                    countdown <= 10
                      ? 'text-brand-danger'
                      : countdown <= 30
                      ? 'text-brand-accent'
                      : isMyTurn
                      ? 'text-brand-primaryText'
                      : 'text-brand-muted'
                  }`}
                >
                  {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
                </div>
              )}
            </div>
          </div>
          {isMyTurn && (
            <div className="mt-2 text-sm text-brand-primaryText font-medium">
              Select a player from the list below ↓
            </div>
          )}
        </div>
      )}

      {/* Draft complete banner */}
      {draft.isComplete && (
        <div className="rounded-xl p-6 mb-4 border-2 border-brand-success bg-brand-success/10 text-center">
          <Trophy className="w-10 h-10 text-brand-accent mx-auto mb-2" />
          <h2 className="text-xl font-bold text-brand-text">Draft Complete!</h2>
          <p className="text-brand-muted mt-1">All {draft.totalPicks} picks have been made.</p>
          {draft.isMock ? (
            <Link href="/dd" className="btn-primary mt-4">
              Back to DiamondDraft
            </Link>
          ) : (
            <Link href={`/dd/league/${leagueId}`} className="btn-primary mt-4">
              Go to League Home
            </Link>
          )}
        </div>
      )}

      {error && (
        <div className="bg-brand-danger/10 text-brand-danger text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      {positionWarning && (
        <div className="bg-brand-accent/10 text-brand-accent text-sm rounded-lg p-3 mb-4 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold">Position Notice:</span> {positionWarning}
          </div>
        </div>
      )}

      <DraftLayoutGrid draftId={draftState.draft.id}>
        {{
          [PANEL_KEYS.DRAFT_BOARD]: (
            <>
          <div className="card overflow-hidden">
            <h3 className="font-semibold text-brand-text mb-3 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-brand-accent" />
              Draft Board
            </h3>
            {/* Position color legend */}
            <div className="mb-3 flex flex-wrap gap-1.5">
              {getPositionLegend(sport).map(({ position, color }) => (
                <span
                  key={position}
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{ color: color.fg, backgroundColor: color.bg, border: `1px solid ${color.border}` }}
                  title={color.name}
                >
                  {position}
                </span>
              ))}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-brand-border">
                    <th className="text-left py-2 px-2 text-brand-muted font-medium sticky left-0 bg-brand-surface z-10">
                      Round
                    </th>
                    {members.map((m) => (
                      <th key={m.id} className="text-center py-2 px-1.5 text-brand-muted font-medium min-w-[110px] max-w-[140px]">
                        <div className="truncate flex items-center justify-center gap-1" title={m.teamName}>
                          {m.isBot && <Zap className="w-3 h-3 text-brand-accent flex-shrink-0" />}
                          <span className="truncate text-xs">{m.teamName}</span>
                        </div>
                        <div className="text-xs text-brand-muted">#{m.draftPosition}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: draft.rounds }).map((_, roundIdx) => {
                    const round = roundIdx + 1;
                    const roundPicks = draftBoard.filter((p) => p.round === round);
                    return (
                      <tr key={round} className="border-b border-brand-border/50">
                        <td className="py-2 px-2 text-brand-muted font-medium sticky left-0 bg-brand-surface z-10">
                          {round}
                        </td>
                        {members.map((m) => {
                          const pick = roundPicks.find((p) => p.memberId === m.id);
                          const isCurrent = currentTurn?.memberId === m.id && currentTurn?.round === round;
                          return (
                            <td key={m.id} className="py-1.5 px-1 text-center">
                              {pick?.pick ? (
                                <div
                                  className={`rounded-md py-1.5 px-1 ${
                                    pick.pick.isAutoPicked ? '' : ''
                                  }`}
                                  style={positionCellBgStyle(sport, pick.pick.position)}
                                >
                                  {pick.pick.headshot && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={pick.pick.headshot}
                                      alt={pick.pick.playerName}
                                      className="w-6 h-6 rounded-full object-cover mx-auto mb-0.5 bg-brand-surface"
                                      loading="lazy"
                                    />
                                  )}
                                  <div className="text-xs font-medium text-brand-text truncate" title={pick.pick.playerName}>
                                    {pick.pick.playerName}
                                  </div>
                                  <div className="text-xs">
                                    <span
                                      className="inline-block px-1 rounded font-bold"
                                      style={positionBadgeStyle(sport, pick.pick.position)}
                                    >
                                      {pick.pick.position}
                                    </span>
                                    <span className="text-brand-muted"> · {pick.pick.team}</span>
                                  </div>
                                </div>
                              ) : isCurrent ? (
                                <div className="rounded-md py-1.5 px-1 border-2 border-brand-primary bg-brand-primary/10">
                                  <div className="text-xs text-brand-primaryText font-medium">On Clock</div>
                                </div>
                              ) : (
                                <div className="rounded-md py-1.5 px-1 bg-brand-elevated/30">
                                  <div className="text-xs text-brand-muted">—</div>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
            </>
          ),
          [PANEL_KEYS.MY_ROSTER]: (
            <>
          <div className="card">
            <h3 className="font-semibold text-brand-text mb-3 flex items-center gap-2">
              <Crown className="w-5 h-5 text-brand-accent" />
              Your Team — {currentTeamName}
              <span className="text-sm text-brand-muted font-normal">({myRoster.length} players)</span>
            </h3>

            {/* Position needs indicator */}
            {rosterSlots.length > 0 && Object.keys(positionNeeds.remaining).length > 0 && (
              <div className="mb-3 p-2.5 rounded-lg bg-brand-primary/10 border border-brand-primary/30">
                <div className="text-xs font-medium text-brand-text mb-1.5 flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-brand-primary" />
                  Positions Still Needed:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(positionNeeds.remaining).map(([slot, count]) => {
                    const slotInfo = rosterSlots.find((s) => s.slot === slot);
                    return (
                      <span key={slot} className="text-xs px-2 py-0.5 rounded-full bg-brand-primary/20 text-brand-primaryText font-medium">
                        {count}× {slotInfo?.label ?? slot}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
            {rosterSlots.length > 0 && Object.keys(positionNeeds.remaining).length === 0 && myRoster.length > 0 && (
              <div className="mb-3 p-2.5 rounded-lg bg-brand-success/10 border border-brand-success/30">
                <div className="text-xs font-medium text-brand-success flex items-center gap-1.5">
                  <Check className="w-3.5 h-3.5" />
                  All required starter positions filled!
                </div>
              </div>
            )}

            {/* Position limits summary — filled / capacity per position */}
            {positionSummary.length > 0 && (
              <div className="mb-3 p-2.5 rounded-lg bg-brand-elevated/50 border border-brand-border">
                <div className="text-xs font-medium text-brand-text mb-1.5 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-brand-primaryText" />
                  Position Limits
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                  {positionSummary.map((p) => {
                    const pc = getPositionColor(sport, p.position);
                    return (
                      <div key={p.position} className="flex items-center gap-1 text-xs">
                        <span
                          className="inline-block px-1 rounded font-bold text-[10px] flex-shrink-0"
                          style={positionBadgeStyle(sport, p.position)}
                        >
                          {p.position}
                        </span>
                        <span
                          className={p.isFull ? 'text-brand-muted line-through' : 'text-brand-text'}
                          style={p.isFull ? undefined : { color: pc.fg }}
                        >
                          {p.filled}/{p.capacity}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {myRoster.length === 0 ? (
              <p className="text-sm text-brand-muted text-center py-4">
                No players drafted yet.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {myRoster.map((p, i) => (
                  <div
                    key={i}
                    className={`bg-brand-elevated rounded-lg p-2.5 ${playerFillsNeed(p.position) ? 'ring-1 ring-brand-primary/30' : ''}`}
                    style={positionLeftBorderStyle(sport, p.position)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-brand-muted">R{p.round}</span>
                      <span className="text-xs text-brand-muted">#{p.overallPick}</span>
                    </div>
                    <div className="text-sm font-medium text-brand-text truncate mt-1">{p.playerName}</div>
                    <div className="text-xs text-brand-muted flex items-center gap-1.5">
                      <span
                        className="inline-block px-1 rounded font-bold text-[10px]"
                        style={positionBadgeStyle(sport, p.position)}
                      >
                        {p.position ?? 'BN'}
                      </span>
                      <span className="truncate">{p.team}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
            </>
          ),
          [PANEL_KEYS.AVAILABLE_PLAYERS]: (
            <>
          <div className="card">
            <h3 className="font-semibold text-brand-text mb-3 flex items-center gap-2">
              <Search className="w-5 h-5 text-brand-primaryText" />
              Available Players
            </h3>

            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-muted" />
              <input
                type="text"
                className="input pl-10"
                placeholder="Search players..."
                value={playerSearch}
                onChange={(e) => setPlayerSearch(e.target.value)}
              />
            </div>

            {/* Position filter */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              <button
                onClick={() => setPositionFilter('')}
                className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                  !positionFilter ? 'bg-brand-primary text-white' : 'bg-brand-elevated text-brand-muted hover:text-brand-text'
                }`}
              >
                All
              </button>
              {positions.map((pos) => {
                const pc = getPositionColor(sport, pos);
                const isActive = pos === positionFilter;
                return (
                  <button
                    key={pos}
                    onClick={() => setPositionFilter(pos === positionFilter ? '' : pos)}
                    className="text-xs px-2.5 py-1 rounded-md transition-colors font-semibold"
                    style={
                      isActive
                        ? { backgroundColor: pc.fg, color: '#0a0e1a' }
                        : positionBadgeStyle(sport, pos)
                    }
                  >
                    {pos}
                  </button>
                );
              })}
            </div>

            {/* Sort selector */}
            <div className="flex items-center gap-2 mb-3">
              <ArrowUpDown className="w-3.5 h-3.5 text-brand-muted" />
              <div className="flex flex-wrap gap-1.5">
                {([
                  ['rank', 'ESPN Rank'],
                  ['vegas_rank', 'Vegas Rank'],
                  ['projected_points', 'Proj Pts'],
                  ['adp', 'ADP'],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setSortBy(key)}
                    className={`text-xs px-2.5 py-1 rounded-md transition-colors ${
                      sortBy === key
                        ? key === 'vegas_rank'
                          ? 'bg-brand-accent text-white'
                          : 'bg-brand-primary text-white'
                        : 'bg-brand-elevated text-brand-muted hover:text-brand-text'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Player list */}
            <div className="space-y-1.5 max-h-[600px] overflow-y-auto">
              {playersLoading ? (
                <div className="text-center py-8">
                  <Loader2 className="w-5 h-5 text-brand-primary animate-spin mx-auto" />
                </div>
              ) : players.length === 0 ? (
                <p className="text-sm text-brand-muted text-center py-8">
                  No players found.
                </p>
              ) : (
                players.map((player) => {
                  const fillsNeed = playerFillsNeed(player.position);
                  const blockReason = getPickBlockReason(player);
                  const isBlocked = !!blockReason;
                  return (
                  <div
                    key={player.id}
                    className={`flex items-center gap-2 py-2 px-2.5 rounded-lg bg-brand-elevated/50 hover:bg-brand-elevated transition-colors group cursor-pointer ${fillsNeed ? 'bg-brand-primary/5' : ''} ${isBlocked ? 'opacity-60' : ''}`}
                    style={positionLeftBorderStyle(sport, player.position)}
                    onMouseEnter={(e) => handlePlayerMouseEnter(player, e)}
                    onMouseLeave={handlePlayerMouseLeave}
                  >
                    {/* Rank badge */}
                    <div className="w-8 h-8 rounded-md bg-brand-surface border border-brand-border flex items-center justify-center text-xs font-bold text-brand-muted flex-shrink-0">
                      {player.rank ?? '?'}
                    </div>

                    {/* Vegas Rank badge (if available) */}
                    {player.vegasRank != null && (
                      <div className="w-8 h-8 rounded-md bg-brand-accent/15 border border-brand-accent/30 flex items-center justify-center text-xs font-bold text-brand-accent flex-shrink-0" title={`Vegas Score: ${player.vegasScore?.toFixed(1) ?? '—'}`}>
                        {player.vegasRank}
                      </div>
                    )}

                    {/* Player headshot */}
                    {player.headshot ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={player.headshot}
                        alt={player.playerName}
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0 bg-brand-surface border border-brand-border"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-brand-surface border border-brand-border flex items-center justify-center flex-shrink-0">
                        {sport === 'NFL' ? <Shield className="w-4 h-4 text-brand-muted" /> : <Target className="w-4 h-4 text-brand-muted" />}
                      </div>
                    )}

                    {/* Player info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-brand-text truncate flex items-center gap-1.5">
                        {player.playerName}
                        {fillsNeed && (
                          <span className="text-[9px] font-bold uppercase tracking-wide bg-brand-primary/20 text-brand-primary px-1 py-0.5 rounded">Need</span>
                        )}
                      </div>
                      <div className="text-xs text-brand-muted flex items-center gap-1.5">
                        <span
                          className="inline-block px-1 rounded font-bold text-[10px]"
                          style={positionBadgeStyle(sport, player.position)}
                        >
                          {player.position ?? '—'}
                        </span>
                        <span className="truncate">{player.team}</span>
                        {player.projectedPoints && ` · ${player.projectedPoints.toFixed(1)} pts`}
                        {player.adp != null && ` · ADP ${player.adp}`}
                      </div>
                    </div>

                    {/* Draft button / blocked indicator */}
                    {(isMyTurn || isCommissioner) && draft.status === 'in_progress' && (
                      isBlocked ? (
                        <div
                          className="flex items-center gap-1 text-xs px-2 py-1.5 rounded-md bg-brand-danger/15 text-brand-danger"
                          title={blockReason ?? undefined}
                        >
                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="hidden sm:inline">Limit</span>
                        </div>
                      ) : (
                        <button
                          onClick={() => makePick(player)}
                          disabled={picking !== null}
                          className="btn-primary text-xs px-2.5 py-1.5 transition-opacity"
                        >
                          {picking === player.playerName ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <>Draft</>
                          )}
                        </button>
                      )
                    )}
                  </div>
                  );
                })
              )}
            </div>
          </div>
            </>
          ),
          [PANEL_KEYS.RECENT_PICKS]: (
            <>
          <div className="card">
            <h3 className="font-semibold text-brand-text mb-3">Recent Picks</h3>
            <div className="space-y-1.5">
              {draftBoard
                .filter((p) => p.pick)
                .slice(-5)
                .reverse()
                .map((p) => (
                  <div key={p.overallPick} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded-lg bg-brand-elevated/30">
                    <span className="text-xs text-brand-muted w-8">#{p.overallPick}</span>
                    {p.pick!.headshot ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.pick!.headshot} alt={p.pick!.playerName} className="w-6 h-6 rounded-full object-cover flex-shrink-0 bg-brand-surface" loading="lazy" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-brand-surface border border-brand-border flex-shrink-0" />
                    )}
                    <span className="font-medium text-brand-text flex-1 truncate">{p.pick!.playerName}</span>
                    <span className="text-xs text-brand-muted">{p.pick!.position}</span>
                    <span className="text-xs text-brand-muted truncate max-w-[80px]">{p.teamName}</span>
                  </div>
                ))}
              {draftBoard.filter((p) => p.pick).length === 0 && (
                <p className="text-sm text-brand-muted text-center py-4">No picks yet.</p>
              )}
            </div>
          </div>
            </>
          ),
        }}
      </DraftLayoutGrid>

      {/* ── Floating Player Info Card (hover popover) ── */}
      {cardVisible && hoveredPlayer && (
        <div
          ref={cardRef}
          className="fixed z-50"
          style={{ top: cardPos.top, left: cardPos.left }}
          onMouseEnter={handleCardMouseEnter}
          onMouseLeave={handleCardMouseLeave}
        >
          <PlayerInfoCard
            poolId={hoveredPlayer.id}
            sport={sport}
            seasonYear={seasonYear}
            playerName={hoveredPlayer.playerName}
            position={hoveredPlayer.position}
            team={hoveredPlayer.team}
          />
        </div>
      )}
    </div>
  );
}
