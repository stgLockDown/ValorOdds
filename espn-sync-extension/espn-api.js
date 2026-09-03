/**
 * espn-api.js — ESPN Fantasy v3 API client for the ValorOdds Draft Bar extension.
 *
 * This module is imported by the background service worker. It reads the user's
 * ESPN authentication cookies (espn_s2, SWID) via the chrome.cookies API and
 * uses them to call ESPN's private Fantasy API to pull structured draft data.
 *
 * No ESPN credentials are ever sent to ValorOdds or any third party. All ESPN
 * API calls happen within the extension's service worker context.
 *
 * ESPN API reference:
 *   Base URL: https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl
 *   Auth: Cookie: espn_s2={...}; SWID={...}
 *   Views: mDraftDetail, mSettings, mTeam, kona_player_info
 */

// ─── ESPN API base ───────────────────────────────────────────────────────────

const ESPN_API_BASE = 'https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl';

// ESPN position ID → abbreviation mapping (from ESPN's API docs)
const ESPN_POSITION_MAP = {
  1: 'QB',
  2: 'RB',
  3: 'WR',
  4: 'TE',
  5: 'K',
  7: 'IR',
  16: 'DST',
  20: 'BN',
  23: 'FLEX',
};

// Position IDs that count as "starters" (not bench/IR)
const STARTER_POSITION_IDS = new Set([1, 2, 3, 4, 5, 16, 23]);

// ─── Cookie reading ──────────────────────────────────────────────────────────

/**
 * Read the user's ESPN authentication cookies from the browser's cookie jar.
 * Returns { espnS2, swid } or { espnS2: null, swid: null } if not signed in.
 *
 * The SWID is extracted from the `espnAuth` cookie, which contains a JSON
 * payload with a `swid` field. The `espn_s2` cookie is read directly.
 */
async function getEspnCredentials() {
  return new Promise((resolve) => {
    chrome.cookies.get({ url: 'https://fantasy.espn.com', name: 'espn_s2' }, (s2Cookie) => {
      chrome.cookies.get({ url: 'https://fantasy.espn.com', name: 'espnAuth' }, (authCookie) => {
        const espnS2 = s2Cookie ? s2Cookie.value : null;
        let swid = null;
        if (authCookie) {
          try {
            const parsed = JSON.parse(authCookie.value);
            swid = parsed.swid || null;
          } catch {
            // Some ESPN accounts set SWID directly as the cookie value
            swid = authCookie.value;
          }
        }
        resolve({ espnS2, swid });
      });
    });
  });
}

/**
 * Check if the user is signed into ESPN (cookies present).
 * Used by the popup UI to show connection status.
 */
async function checkEspnAuth() {
  const { espnS2, swid } = await getEspnCredentials();
  return {
    authenticated: !!(espnS2 && swid),
    hasS2: !!espnS2,
    hasSwid: !!swid,
  };
}

// ─── ESPN API calls ──────────────────────────────────────────────────────────

/**
 * Build the Cookie header for ESPN API requests.
 */
function buildCookieHeader(espnS2, swid) {
  return `espn_s2=${espnS2}; SWID=${swid}`;
}

/**
 * Fetch league data with multiple views from ESPN's Fantasy v3 API.
 *
 * @param {number} leagueId - ESPN fantasy league ID
 * @param {number} seasonId - Season year (e.g. 2025)
 * @param {string[]} views - Array of view names (e.g. ['mSettings', 'mDraftDetail', 'mTeam'])
 * @returns {Promise<object>} The league JSON response
 */
async function fetchLeagueData(leagueId, seasonId, views) {
  const { espnS2, swid } = await getEspnCredentials();
  if (!espnS2 || !swid) {
    throw new Error('ESPN_NOT_AUTHENTICATED');
  }

  const viewParams = views.map((v) => `view=${v}`).join('&');
  const url = `${ESPN_API_BASE}/seasons/${seasonId}/segments/0/leagues/${leagueId}?${viewParams}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Cookie: buildCookieHeader(espnS2, swid),
      'User-Agent': 'Mozilla/5.0 (ValorOdds-Draft-Bar/1.0)',
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error('ESPN_AUTH_EXPIRED');
  }
  if (!response.ok) {
    throw new Error(`ESPN_API_ERROR_${response.status}`);
  }

  return response.json();
}

/**
 * Fetch the full player pool for a season with projections and ADP.
 *
 * Uses the kona_player_info view which returns player names, positions,
 * teams, projected stats, and ADP data.
 *
 * @param {number} seasonId - Season year
 * @returns {Promise<Array>} Array of player objects
 */
async function fetchPlayerPool(seasonId) {
  const { espnS2, swid } = await getEspnCredentials();
  if (!espnS2 || !swid) {
    throw new Error('ESPN_NOT_AUTHENTICATED');
  }

  const url = `${ESPN_API_BASE}/seasons/${seasonId}/players?view=kona_player_info&scoringPeriodId=0`;

  // X-Fantasy-Filter controls sorting and limits
  const fantasyFilter = JSON.stringify({
    players: {
      limit: 2000,
      sortPercOwned: { sortPriority: 4, sortAsc: false },
    },
  });

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Cookie: buildCookieHeader(espnS2, swid),
      'X-Fantasy-Filter': fantasyFilter,
      'User-Agent': 'Mozilla/5.0 (ValorOdds-Draft-Bar/1.0)',
    },
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error('ESPN_AUTH_EXPIRED');
  }
  if (!response.ok) {
    throw new Error(`ESPN_API_ERROR_${response.status}`);
  }

  const data = await response.json();
  return data.players || [];
}

// ─── Draft snapshot builder ──────────────────────────────────────────────────

/**
 * Parse an ESPN player object into the format the ValorOdds API expects.
 */
function parseEspnPlayer(player) {
  // Projected points are in player.stats[0] with scoringPeriodId=0 (preseason projections)
  let projectedPoints = 0;
  if (player.stats && Array.isArray(player.stats)) {
    const projStat = player.stats.find(
      (s) => s.scoringPeriodId === 0 && s.statSourceId === 1 // 1 = ESPN projections
    ) || player.stats.find((s) => s.scoringPeriodId === 0);
    if (projStat && projStat.appliedTotal != null) {
      projectedPoints = projStat.appliedTotal;
    } else if (projStat && projStat.stats) {
      // Sum up the stat values if appliedTotal isn't available
      projectedPoints = Object.values(projStat.stats).reduce(
        (sum, v) => sum + (typeof v === 'number' ? v : 0),
        0
      );
    }
  }

  // ADP from ratings
  let adp = null;
  if (player.ratings && Array.isArray(player.ratings)) {
    const rating0 = player.ratings.find((r) => r.slotId === 0 || r.id === 0) || player.ratings[0];
    if (rating0 && rating0.averageDraftPosition != null) {
      adp = rating0.averageDraftPosition;
    }
  }
  // Fallback: some player objects have ADP at the top level
  if (adp == null && player.averageDraftPosition != null) {
    adp = player.averageDraftPosition;
  }

  return {
    id: String(player.id || ''),
    playerName: player.fullName || player.name || 'Unknown',
    position: ESPN_POSITION_MAP[player.defaultPositionId] || player.defaultPosition?.abbreviation || null,
    team: player.proTeam?.abbreviation || player.proTeamId ? String(player.proTeamId) : null,
    projectedPoints: Math.round(projectedPoints * 10) / 10,
    adp: adp != null ? Math.round(adp * 10) / 10 : null,
    rank: player.rank ?? null,
    injuryStatus: player.injuryStatus || null,
  };
}

/**
 * Parse ESPN roster settings into a roster slots array for the ValorOdds API.
 *
 * ESPN's mSettings returns lineupSlotCounts as { positionId: count, ... }.
 * We convert this into an array of { position, count, isStarter } objects.
 */
function parseRosterSettings(settings) {
  const lineupCounts = settings?.rosterSettings?.lineupSlotCounts || {};
  const slots = [];
  for (const [posIdStr, count] of Object.entries(lineupCounts)) {
    const posId = parseInt(posIdStr, 10);
    const posAbbr = ESPN_POSITION_MAP[posId];
    if (!posAbbr) continue;
    if (posAbbr === 'IR') continue; // IR doesn't count for VOR
    const numCount = typeof count === 'number' ? count : parseInt(count, 10);
    if (!numCount || numCount < 1) continue;
    slots.push({
      position: posAbbr,
      count: numCount,
      isStarter: STARTER_POSITION_IDS.has(posId),
    });
  }
  return slots;
}

/**
 * Parse ESPN draft picks into an ordered array for the ValorOdds API.
 */
function parseDraftPicks(draftDetail, playerPoolMap) {
  const picks = draftDetail?.picks || [];
  return picks
    .filter((p) => p.playerId != null)
    .map((p) => {
      const player = playerPoolMap.get(p.playerId);
      return {
        playerName: player?.playerName || 'Unknown',
        position: player?.position || null,
        team: player?.team || null,
        adp: player?.adp ?? null,
        overallPick: p.overallPickNumber || (p.roundId - 1) * 0 + p.roundPickNumber,
        byTeam: String(p.teamId || ''),
      };
    });
}

/**
 * Parse a team's roster from ESPN's mTeam response.
 */
function parseTeamRoster(team, playerPoolMap) {
  const roster = team?.roster?.entries || [];
  return roster.map((entry) => {
    const playerId = entry.playerId;
    const player = playerPoolMap.get(playerId);
    return {
      playerName: player?.playerName || entry.playerPoolEntry?.player?.fullName || 'Unknown',
      position: player?.position || ESPN_POSITION_MAP[entry.lineupSlotId] || null,
      team: player?.team || null,
      projectedPoints: player?.projectedPoints || 0,
    };
  });
}

/**
 * Build a complete draft snapshot from ESPN API data.
 *
 * This is the main function that orchestrates the ESPN API calls and produces
 * the snapshot object that gets sent to the ValorOdds /api/dd/espn-sync endpoint.
 *
 * @param {number} leagueId - ESPN fantasy league ID
 * @param {number} seasonId - Season year
 * @param {number} myTeamId - The user's team ID in the league
 * @returns {Promise<object>} Draft snapshot for the ValorOdds API
 */
async function buildDraftSnapshot(leagueId, seasonId, myTeamId) {
  // Step 1: Fetch league settings, draft detail, and teams in one call
  const leagueData = await fetchLeagueData(leagueId, seasonId, [
    'mSettings',
    'mDraftDetail',
    'mTeam',
  ]);

  const settings = leagueData.settings;
  const draftDetail = leagueData.draftDetail;
  const teams = leagueData.teams || [];
  const numTeams = teams.length || settings?.draftDetail?.leagueSize || 12;

  // Step 2: Fetch the full player pool
  const espnPlayers = await fetchPlayerPool(seasonId);

  // Build a player lookup map: ESPN playerId -> parsed player
  const playerPoolMap = new Map();
  const allPlayers = [];
  for (const espnPlayer of espnPlayers) {
    const parsed = parseEspnPlayer(espnPlayer);
    // playerPoolEntry wraps the player in some ESPN response formats
    const rawId = espnPlayer.id || espnPlayer.playerPoolEntry?.id;
    if (rawId != null) {
      playerPoolMap.set(rawId, parsed);
    }
    allPlayers.push(parsed);
  }

  // Step 3: Parse roster settings
  const rosterSlots = parseRosterSettings(settings);

  // Step 4: Parse draft picks
  const picks = parseDraftPicks(draftDetail, playerPoolMap);

  // Step 5: Determine available players (not yet drafted)
  const draftedPlayerIds = new Set(
    (draftDetail?.picks || []).map((p) => p.playerId).filter(Boolean)
  );
  const availablePlayers = allPlayers.filter((p) => p.id && !draftedPlayerIds.has(parseInt(p.id, 10)));

  // Step 6: Parse my roster
  const myTeam = teams.find((t) => t.id === myTeamId);
  const myRoster = myTeam ? parseTeamRoster(myTeam, playerPoolMap) : [];

  // Step 7: Determine recent picks (last 10 for the ValorOdds API)
  const recentPicks = picks.slice(-10);

  // Step 8: Determine the last pick (for grading)
  const lastPick = picks.length > 0 ? picks[picks.length - 1] : null;

  // Step 9: Determine on-the-clock status
  const overallPickNumber = picks.length + 1;
  const isMyTurn = myTeamId != null && determineOnClock(teams, draftDetail, overallPickNumber, myTeamId);

  // Build the snapshot
  return {
    sport: 'NFL', // ESPN fantasy football — could be extended for MLB
    rosterSlots: rosterSlots.length > 0 ? rosterSlots : undefined,
    numTeams,
    availablePlayers: availablePlayers.slice(0, 500), // cap to avoid huge payloads
    myRoster,
    recentPicks,
    lastPick: lastPick
      ? {
          playerName: lastPick.playerName,
          position: lastPick.position,
          team: lastPick.team,
          adp: lastPick.adp,
          overallPick: lastPick.overallPick,
          byTeam: lastPick.byTeam,
        }
      : undefined,
    isOnClock: isMyTurn,
    overallPickNumber,
    espnLeagueId: leagueId,
    espnSeasonId: seasonId,
  };
}

/**
 * Determine if the user's team is currently on the clock.
 *
 * For snake drafts, the pick order reverses each round.
 * For linear drafts, the order is the same each round.
 */
function determineOnClock(teams, draftDetail, overallPickNumber, myTeamId) {
  const picks = draftDetail?.picks || [];
  const draftType = draftDetail?.draftType || 'SNAKE';
  const numTeams = teams.length;

  if (numTeams === 0) return false;

  const round = Math.ceil(overallPickNumber / numTeams);
  const pickInRound = ((overallPickNumber - 1) % numTeams) + 1;

  // Build the draft order from the first round's picks, or from team order
  let draftOrder;
  if (picks.length >= numTeams) {
    draftOrder = picks.slice(0, numTeams).map((p) => p.teamId);
  } else {
    draftOrder = teams.map((t) => t.id);
  }

  let teamOnClock;
  if (draftType === 'SNAKE' && round % 2 === 0) {
    // Even rounds reverse the order
    teamOnClock = draftOrder[numTeams - pickInRound];
  } else {
    teamOnClock = draftOrder[pickInRound - 1];
  }

  return teamOnClock === myTeamId;
}

// ─── Exports (for service worker importScripts) ──────────────────────────────

// In MV3 service workers, we use importScripts. The functions are attached
// to the global scope (self) so background.js can call them.
if (typeof self !== 'undefined') {
  self.checkEspnAuth = checkEspnAuth;
  self.getEspnCredentials = getEspnCredentials;
  self.buildDraftSnapshot = buildDraftSnapshot;
  self.ESPN_POSITION_MAP = ESPN_POSITION_MAP;
}
