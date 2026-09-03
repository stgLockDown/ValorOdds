/**
 * background.js — MV3 service worker for the ValorOdds Draft Bar extension.
 *
 * Responsibilities:
 *   1. Import the ESPN API and ValorOdds API client modules.
 *   2. Handle messages from the content script and popup:
 *      - SYNC_DRAFT:    fetch ESPN draft data → send to ValorOdds → return analytics
 *      - CHECK_AUTH:    report ESPN + ValorOdds auth status
 *      - CHAT:          stream AI chat response (Premium/VIP only)
 *      - GET_LEAGUES:   list the user's ESPN fantasy leagues for the popup selector
 *   3. Manage sync state: track league ID, season ID, team ID, last pick count.
 *   4. Enforce the server's minSyncIntervalMs to avoid hammering the API.
 *
 * All ESPN API calls happen here (service worker context). ESPN cookies are read
 * via chrome.cookies and used to set the Cookie header — they never leave the
 * browser. ValorOdds calls use credentials: 'include' for the session cookie.
 */

// Import the API client modules (MV3 service worker scope)
importScripts('espn-api.js', 'valorodds-api.js');

// ─── State ───────────────────────────────────────────────────────────────────

// Persisted sync configuration (user selects league/season/team in the popup)
const DEFAULT_STATE = {
  leagueId: null,
  seasonId: null, // e.g. 2024
  myTeamId: null,
  autoSync: true,
  lastPickCount: 0,
  lastSyncAt: 0,
  minSyncIntervalMs: 3000, // Updated by server response
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Load the extension state from chrome.storage.local.
 * Falls back to DEFAULT_STATE if nothing is stored.
 */
async function loadState() {
  return new Promise((resolve) => {
    chrome.storage.local.get('syncState', (result) => {
      resolve({ ...DEFAULT_STATE, ...(result.syncState || {}) });
    });
  });
}

/**
 * Save the extension state to chrome.storage.local.
 */
async function saveState(state) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ syncState: state }, resolve);
  });
}

/**
 * Check whether enough time has passed since the last sync.
 */
function canSync(state) {
  const elapsed = Date.now() - state.lastSyncAt;
  return elapsed >= state.minSyncIntervalMs;
}

/**
 * Extract league ID and season from the current ESPN draft URL.
 * ESPN draft URLs look like:
 *   https://fantasy.espn.com/football/draft?leagueId=123456&seasonId=2024
 * Returns { leagueId, seasonId } or null if not found.
 */
function parseLeagueFromUrl(url) {
  try {
    const u = new URL(url);
    const leagueId = u.searchParams.get('leagueId');
    const seasonId = u.searchParams.get('seasonId');
    if (!leagueId || !seasonId) return null;
    return { leagueId, seasonId: parseInt(seasonId, 10) };
  } catch {
    return null;
  }
}

// ─── Message handlers ────────────────────────────────────────────────────────

/**
 * SYNC_DRAFT handler — the main sync flow.
 *
 * 1. Read ESPN cookies → check auth
 * 2. Build draft snapshot from ESPN API
 * 3. Send snapshot to ValorOdds API → get analytics
 * 4. Update sync state (pick count, timestamp)
 * 5. Return analytics to the content script for rendering
 */
async function handleSyncDraft(request, sender) {
  const state = await loadState();

  // Determine league/season: use request override, then sender tab URL, then stored state
  let leagueId = request.leagueId || state.leagueId;
  let seasonId = request.seasonId || state.seasonId;

  if ((!leagueId || !seasonId) && sender.tab && sender.tab.url) {
    const parsed = parseLeagueFromUrl(sender.tab.url);
    if (parsed) {
      leagueId = leagueId || parsed.leagueId;
      seasonId = seasonId || parsed.seasonId;
    }
  }

  if (!leagueId || !seasonId) {
    return { error: 'NO_LEAGUE_SELECTED', message: 'Open an ESPN draft room or select a league in the popup.' };
  }

  // Persist the league/season so future syncs don't need the URL
  state.leagueId = leagueId;
  state.seasonId = seasonId;

  // Check ESPN auth
  const auth = await checkEspnAuth();
  if (!auth.authenticated) {
    await saveState(state);
    return {
      error: 'ESPN_NOT_AUTHENTICATED',
      message: 'Sign in to ESPN at fantasy.espn.com, then try again.',
    };
  }

  // Throttle: skip if we synced too recently (unless forced)
  if (!request.force && !canSync(state)) {
    return { error: 'SYNC_THROTTLED', message: 'Syncing too frequently. Please wait a moment.' };
  }

  try {
    // Build the draft snapshot from ESPN's API
    const snapshot = await buildDraftSnapshot(leagueId, seasonId, state.myTeamId);

    // Send to ValorOdds for analytics
    const analytics = await syncDraft(snapshot);

    // Update state
    state.lastPickCount = snapshot.overallPickNumber || 0;
    state.lastSyncAt = Date.now();
    if (analytics.minSyncIntervalMs) {
      state.minSyncIntervalMs = analytics.minSyncIntervalMs;
    }
    // If the snapshot revealed the user's team ID, store it
    if (snapshot.myTeamId && !state.myTeamId) {
      state.myTeamId = snapshot.myTeamId;
    }
    await saveState(state);

    return {
      ok: true,
      snapshot,
      analytics,
    };
  } catch (err) {
    // Handle known error types
    if (err.message === 'ESPN_NOT_AUTHENTICATED' || err.message === 'ESPN_AUTH_EXPIRED') {
      return {
        error: 'ESPN_NOT_AUTHENTICATED',
        message: 'Your ESPN session has expired. Sign in again at fantasy.espn.com.',
      };
    }
    if (err.message === 'VALORODDS_NOT_AUTHENTICATED') {
      return {
        error: 'VALORODDS_NOT_AUTHENTICATED',
        message: 'Sign in to your ValorOdds account to see analytics.',
      };
    }
    if (err.message === 'VALORODDS_FORBIDDEN') {
      return {
        error: 'VALORODDS_FORBIDDEN',
        message: 'Your ValorOdds plan does not include draft sync. Upgrade to Basic or higher.',
      };
    }
    // Generic error
    console.error('[ValorOdds] Sync failed:', err);
    return {
      error: 'SYNC_FAILED',
      message: err.message || 'An unexpected error occurred during sync.',
    };
  }
}

/**
 * CHECK_AUTH handler — report ESPN and ValorOdds auth status for the popup.
 */
async function handleCheckAuth() {
  const espn = await checkEspnAuth();

  // Check ValorOdds auth by making a lightweight HEAD request
  let valoroddsAuthenticated = false;
  try {
    const res = await fetch(`${VALORODDS_API_BASE}/api/auth/session`, {
      method: 'GET',
      credentials: 'include',
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      valoroddsAuthenticated = !!(data && (data.userId || data.email || data.user));
    }
  } catch {
    // Network error — assume not authenticated
  }

  return {
    espn: {
      authenticated: espn.authenticated,
      hasS2: espn.hasS2,
      hasSwid: espn.hasSwid,
    },
    valorodds: {
      authenticated: valoroddsAuthenticated,
    },
  };
}

/**
 * CHAT handler — stream the AI chat response back to the content script.
 * Uses chrome.runtime messaging with progressive updates.
 */
async function handleChat(request, sender) {
  if (!sender.tab) return { error: 'NO_TAB' };

  const state = await loadState();
  const { message } = request;

  // We need a recent snapshot for context — rebuild it or use cached
  let snapshot = request.snapshot;
  if (!snapshot && state.leagueId && state.seasonId) {
    try {
      snapshot = await buildDraftSnapshot(state.leagueId, state.seasonId, state.myTeamId);
    } catch {
      // Continue without snapshot — the backend can handle partial context
    }
  }

  if (!snapshot) {
    chrome.tabs.sendMessage(sender.tab.id, {
      type: 'CHAT_ERROR',
      error: 'NO_SNAPSHOT',
      message: 'Sync your draft first before using AI chat.',
    });
    return { ok: false, error: 'NO_SNAPSHOT' };
  }

  // Stream chunks back to the content script via tab messages
  const tabId = sender.tab.id;

  streamChat(
    message,
    snapshot,
    (chunk) => {
      chrome.tabs.sendMessage(tabId, { type: 'CHAT_CHUNK', chunk });
    },
    () => {
      chrome.tabs.sendMessage(tabId, { type: 'CHAT_DONE' });
    },
    (err) => {
      let errorMsg = err.message;
      if (err.message === 'VALORODDS_NOT_AUTHENTICATED') {
        errorMsg = 'Sign in to ValorOdds to use the AI assistant.';
      } else if (err.message === 'VALORODDS_CHAT_NOT_AVAILABLE') {
        errorMsg = 'AI chat is a Premium/VIP feature. Upgrade your plan to unlock it.';
      }
      chrome.tabs.sendMessage(tabId, { type: 'CHAT_ERROR', error: err.message, message: errorMsg });
    }
  );

  return { ok: true };
}

/**
 * GET_LEAGUES handler — list the user's ESPN fantasy leagues for the popup.
 * Uses ESPN's games API to fetch the current season's leagues.
 */
async function handleGetLeagues(request) {
  const seasonId = request.seasonId || new Date().getFullYear();

  const auth = await checkEspnAuth();
  if (!auth.authenticated) {
    return { error: 'ESPN_NOT_AUTHENTICATED', message: 'Sign in to ESPN first.' };
  }

  try {
    const { espnS2, swid } = await getEspnCredentials();
    // Fetch the user's leagues for the season
    const url = `${ESPN_API_BASE}/seasons/${seasonId}?view=protocols_watched`;
    const res = await fetch(url, {
      headers: {
        Cookie: `espn_s2=${espnS2}; SWID=${swid}`,
      },
    });

    if (!res.ok) {
      return { error: 'ESPN_API_ERROR', message: `ESPN API returned ${res.status}` };
    }

    const data = await res.json();
    // The user's leagues are in the games array
    const leagues = (data.games || [])
      .filter((g) => g.gameType === 'ffl')
      .map((g) => ({
        leagueId: String(g.id),
        seasonId,
        name: g.name || `League ${g.id}`,
      }));

    return { ok: true, leagues };
  } catch (err) {
    return { error: 'LEAGUES_FETCH_FAILED', message: err.message };
  }
}

/**
 * SET_CONFIG handler — save league/season/team selection from the popup.
 */
async function handleSetConfig(request) {
  const state = await loadState();
  state.leagueId = request.leagueId || state.leagueId;
  state.seasonId = request.seasonId || state.seasonId;
  state.myTeamId = request.myTeamId || state.myTeamId;
  state.autoSync = request.autoSync !== undefined ? request.autoSync : state.autoSync;
  await saveState(state);
  return { ok: true, state };
}

// ─── Message router ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // All handlers are async — return true to keep the message channel open
  (async () => {
    try {
      switch (request.type) {
        case 'SYNC_DRAFT':
          sendResponse(await handleSyncDraft(request, sender));
          break;
        case 'CHECK_AUTH':
          sendResponse(await handleCheckAuth());
          break;
        case 'CHAT':
          sendResponse(await handleChat(request, sender));
          break;
        case 'GET_LEAGUES':
          sendResponse(await handleGetLeagues(request));
          break;
        case 'SET_CONFIG':
          sendResponse(await handleSetConfig(request));
          break;
        case 'GET_STATE':
          sendResponse({ ok: true, state: await loadState() });
          break;
        default:
          sendResponse({ error: 'UNKNOWN_MESSAGE', type: request.type });
      }
    } catch (err) {
      console.error('[ValorOdds] Message handler error:', err);
      sendResponse({ error: 'INTERNAL_ERROR', message: err.message });
    }
  })();
  return true; // Keep channel open for async response
});

// ─── Lifecycle ───────────────────────────────────────────────────────────────

// On install/update, open the welcome page
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('[ValorOdds] Draft Bar extension installed.');
  }
  // Initialize storage with defaults if not present
  chrome.storage.local.get('syncState', (result) => {
    if (!result.syncState) {
      chrome.storage.local.set({ syncState: DEFAULT_STATE });
    }
  });
});

console.log('[ValorOdds] Draft Bar background service worker started.');
