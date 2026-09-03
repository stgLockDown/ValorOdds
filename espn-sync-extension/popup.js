/**
 * popup.js — Controls the extension popup UI.
 *
 * Shows ESPN + ValorOdds connection status, lets the user select their
 * ESPN fantasy league/season, and configure auto-sync. All data is fetched
 * via the background service worker (chrome.runtime.sendMessage).
 */

(function () {
  'use strict';

  // ─── Element refs ───────────────────────────────────────────

  const espnDot = document.getElementById('espn-dot');
  const espnStatus = document.getElementById('espn-status');
  const voDot = document.getElementById('vo-dot');
  const voStatus = document.getElementById('vo-status');
  const leagueSelect = document.getElementById('league-select');
  const seasonInput = document.getElementById('season-input');
  const teamSelect = document.getElementById('team-select');
  const autosyncToggle = document.getElementById('autosync-toggle');
  const saveBtn = document.getElementById('save-config');
  const refreshBtn = document.getElementById('refresh-status');

  // ─── Auth status ────────────────────────────────────────────

  async function checkAuth() {
    try {
      const auth = await chrome.runtime.sendMessage({ type: 'CHECK_AUTH' });
      if (!auth) return;

      // ESPN status
      if (auth.espn) {
        if (auth.espn.authenticated) {
          espnDot.classList.add('connected');
          espnStatus.textContent = 'Connected';
          espnStatus.className = 'vo-status-text ok';
        } else {
          espnDot.classList.remove('connected');
          espnStatus.textContent = auth.espn.hasS2 ? 'Partial (missing SWID)' : 'Not signed in';
          espnStatus.className = 'vo-status-text err';
        }
      }

      // ValorOdds status
      if (auth.valorodds) {
        if (auth.valorodds.authenticated) {
          voDot.classList.add('connected');
          voStatus.textContent = 'Connected';
          voStatus.className = 'vo-status-text ok';
        } else {
          voDot.classList.remove('connected');
          voStatus.textContent = 'Not signed in';
          voStatus.className = 'vo-status-text err';
        }
      }

      // Load leagues if ESPN is authenticated
      if (auth.espn && auth.espn.authenticated) {
        loadLeagues();
      }
    } catch (err) {
      console.error('[ValorOdds Popup] Auth check failed:', err);
      espnStatus.textContent = 'Error';
      voStatus.textContent = 'Error';
    }
  }

  // ─── League loading ─────────────────────────────────────────

  async function loadLeagues() {
    const seasonId = parseInt(seasonInput.value, 10) || new Date().getFullYear();

    leagueSelect.innerHTML = '<option value="">Loading leagues…</option>';
    leagueSelect.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({
        type: 'GET_LEAGUES',
        seasonId,
      });

      if (response && response.error) {
        leagueSelect.innerHTML = `<option value="">${response.message || 'Failed to load'}</option>`;
        return;
      }

      if (response && response.ok && response.leagues && response.leagues.length > 0) {
        leagueSelect.innerHTML = response.leagues
          .map(
            (l) =>
              `<option value="${l.leagueId}">${escapeHtml(l.name)} (ID: ${l.leagueId})</option>`
          )
          .join('');
        leagueSelect.disabled = false;

        // Load saved state to pre-select
        const stateRes = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
        if (stateRes && stateRes.ok && stateRes.state && stateRes.state.leagueId) {
          leagueSelect.value = stateRes.state.leagueId;
        }
      } else {
        leagueSelect.innerHTML =
          '<option value="">No leagues found for this season</option>';
      }
    } catch (err) {
      leagueSelect.innerHTML = '<option value="">Failed to load leagues</option>';
    }
  }

  // ─── Config save ────────────────────────────────────────────

  async function saveConfig() {
    const leagueId = leagueSelect.value;
    const seasonId = parseInt(seasonInput.value, 10);
    const autoSync = autosyncToggle.classList.contains('on');

    if (!leagueId) {
      saveBtn.textContent = 'Select a league first';
      setTimeout(() => (saveBtn.textContent = 'Save & Sync'), 2000);
      return;
    }

    saveBtn.textContent = 'Saving…';
    saveBtn.disabled = true;

    try {
      await chrome.runtime.sendMessage({
        type: 'SET_CONFIG',
        leagueId,
        seasonId,
        autoSync,
      });

      saveBtn.textContent = '✓ Saved';
      setTimeout(() => {
        saveBtn.textContent = 'Save & Sync';
        saveBtn.disabled = false;
      }, 1500);
    } catch (err) {
      saveBtn.textContent = 'Failed';
      setTimeout(() => {
        saveBtn.textContent = 'Save & Sync';
        saveBtn.disabled = false;
      }, 2000);
    }
  }

  // ─── Toggle ─────────────────────────────────────────────────

  autosyncToggle.addEventListener('click', () => {
    autosyncToggle.classList.toggle('on');
  });

  // ─── Event listeners ────────────────────────────────────────

  saveBtn.addEventListener('click', saveConfig);
  refreshBtn.addEventListener('click', checkAuth);

  seasonInput.addEventListener('change', () => {
    if (espnDot.classList.contains('connected')) {
      loadLeagues();
    }
  });

  // ─── Utilities ──────────────────────────────────────────────

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ─── Init ───────────────────────────────────────────────────

  checkAuth();
})();
