/**
 * content.js — Content script that injects the ValorOdds Draft Bar into the
 * ESPN fantasy draft page.
 *
 * Architecture:
 *   - The bar UI lives inside a Shadow DOM for style isolation.
 *   - The content script does NOT make any API calls directly — all network
 *     requests go through the background service worker via chrome.runtime.
 *     This is because the background worker has the host permissions and
 *     the imported API client modules.
 *   - Polling: the content script checks draft state every 3 seconds by
 *     sending SYNC_DRAFT to the background. It only triggers a re-render
 *     when the pick count changes (to minimize flicker).
 *
 * Message types sent to background:
 *   SYNC_DRAFT  — fetch + sync the draft
 *   CHAT        — send a message to the AI assistant
 *   CHECK_AUTH  — check ESPN + ValorOdds auth status
 *   GET_STATE   — get current sync config
 *
 * Message types received from background (chat streaming):
 *   CHAT_CHUNK  — a text chunk from the AI
 *   CHAT_DONE   — stream complete
 *   CHAT_ERROR  — stream error
 */

(function () {
  'use strict';

  // Prevent double-injection if the script runs twice
  if (window.__valoroddsBarInjected) return;
  window.__valoroddsBarInjected = true;

  // ─── Configuration ──────────────────────────────────────────

  const POLL_INTERVAL_MS = 3000; // How often to check for draft changes
  const SYNC_COOLDOWN_MS = 2000; // Minimum time between manual sync triggers

  // ─── State ───────────────────────────────────────────────────

  let shadow = null;
  let barEl = null;
  let panelEl = null;
  let pollTimer = null;
  let lastPickCount = -1;
  let lastAnalytics = null;
  let lastSnapshot = null;
  let isExpanded = false;
  let isSyncing = false;
  let lastSyncTime = 0;
  let chatMessages = [];
  let isChatting = false;
  let chatInputEl = null;
  let chatMessagesEl = null;
  let statusDotEl = null;

  // ─── Shadow DOM setup ───────────────────────────────────────

  /**
   * Create the shadow root and load the bar CSS + build the DOM structure.
   */
  async function createBar() {
    const host = document.createElement('div');
    host.id = 'valorodds-draft-bar-host';
    host.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:2147483647;pointer-events:none;';
    // The host itself doesn't capture pointer events, but children do
    document.body.appendChild(host);

    shadow = host.attachShadow({ mode: 'open' });

    // Load the CSS into the shadow DOM
    try {
      const cssUrl = chrome.runtime.getURL('bar.css');
      const cssResponse = await fetch(cssUrl);
      const cssText = await cssResponse.text();
      const styleEl = document.createElement('style');
      styleEl.textContent = cssText;
      shadow.appendChild(styleEl);
    } catch (err) {
      console.error('[ValorOdds] Failed to load bar.css:', err);
      return;
    }

    // Build the bar DOM
    const container = document.createElement('div');
    container.innerHTML = `
      <div class="vo-bar" part="bar">
        <div class="vo-brand" id="vo-brand">
          <span class="vo-brand-dot disconnected" id="vo-dot"></span>
          <span>ValorOdds</span>
        </div>
        <div class="vo-divider"></div>
        <div class="vo-status" id="vo-status">
          <span class="vo-loading">
            <span class="vo-spinner"></span>
            Connecting…
          </span>
        </div>
        <div class="vo-divider" id="vo-board-divider" style="display:none;"></div>
        <div class="vo-board" id="vo-board" style="display:none;">
          <span class="vo-board-label">Top VOR</span>
          <div class="vo-board-list" id="vo-board-list"></div>
        </div>
        <div class="vo-divider" id="vo-grade-divider" style="display:none;"></div>
        <div class="vo-grade" id="vo-grade" style="display:none;"></div>
        <div class="vo-scarcity" id="vo-scarcity" style="display:none;"></div>
        <div class="vo-needs" id="vo-needs" style="display:none;"></div>
        <div style="flex:1;"></div>
        <div class="vo-actions">
          <a class="vo-upgrade" id="vo-upgrade" href="https://valorodds.com/pricing" target="_blank" style="display:none;">
            ⬆ Upgrade for AI
          </a>
          <button class="vo-btn vo-btn-icon" id="vo-expand" title="Expand panel">
            ▲
          </button>
          <button class="vo-btn vo-btn-primary" id="vo-sync" title="Sync now">
            ↻ Sync
          </button>
        </div>
      </div>
      <div class="vo-panel" id="vo-panel">
        <div class="vo-chat" id="vo-chat">
          <h3>AI Draft Assistant</h3>
          <div class="vo-chat-messages" id="vo-chat-messages">
            <div class="vo-chat-msg ai" id="vo-chat-placeholder">
              Sync your draft, then ask me anything — who to draft, trade advice, positional scarcity, or strategy.
            </div>
          </div>
          <div class="vo-chat-input-row">
            <input type="text" class="vo-chat-input" id="vo-chat-input"
              placeholder="Ask the AI draft assistant…" disabled />
            <button class="vo-btn vo-btn-accent" id="vo-chat-send" disabled>
              Send
            </button>
          </div>
        </div>
      </div>
    `;

    // Re-enable pointer events on the bar and panel
    container.style.pointerEvents = 'auto';
    shadow.appendChild(container);

    // Cache element references
    barEl = shadow.getElementById('vo-bar');
    panelEl = shadow.getElementById('vo-panel');
    chatInputEl = shadow.getElementById('vo-chat-input');
    chatMessagesEl = shadow.getElementById('vo-chat-messages');
    statusDotEl = shadow.getElementById('vo-dot');

    // Wire up event handlers
    wireEvents();
  }

  // ─── Event wiring ───────────────────────────────────────────

  function wireEvents() {
    // Expand/collapse panel
    const expandBtn = shadow.getElementById('vo-expand');
    expandBtn.addEventListener('click', () => {
      isExpanded = !isExpanded;
      barEl.classList.toggle('expanded', isExpanded);
      expandBtn.textContent = isExpanded ? '▼' : '▲';
    });

    // Brand click also toggles
    shadow.getElementById('vo-brand').addEventListener('click', () => {
      isExpanded = !isExpanded;
      barEl.classList.toggle('expanded', isExpanded);
      expandBtn.textContent = isExpanded ? '▼' : '▲';
    });

    // Manual sync button
    shadow.getElementById('vo-sync').addEventListener('click', () => {
      const now = Date.now();
      if (now - lastSyncTime < SYNC_COOLDOWN_MS) return;
      lastSyncTime = now;
      doSync(true);
    });

    // Chat send
    const sendBtn = shadow.getElementById('vo-chat-send');
    sendBtn.addEventListener('click', sendChatMessage);
    chatInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !isChatting) {
        sendChatMessage();
      }
    });
  }

  // ─── Sync flow ──────────────────────────────────────────────

  /**
   * Send a SYNC_DRAFT message to the background service worker and render
   * the results. Called on poll and on manual sync.
   */
  async function doSync(force = false) {
    if (isSyncing) return;
    isSyncing = true;
    updateSyncingIndicator(true);

    try {
      const response = await chrome.runtime.sendMessage({ type: 'SYNC_DRAFT', force });

      if (!response) {
        updateStatus({ error: 'No response from background.' });
        return;
      }

      if (response.error) {
        updateStatus(response);
        // If not authenticated, stop polling
        if (response.error === 'ESPN_NOT_AUTHENTICATED' || response.error === 'VALORODDS_NOT_AUTHENTICATED') {
          stopPolling();
        }
        return;
      }

      if (response.ok) {
        lastSnapshot = response.snapshot;
        lastAnalytics = response.analytics;

        // Only re-render if the pick count changed (or first render)
        const pickCount = response.snapshot.overallPickNumber || 0;
        const shouldRender = pickCount !== lastPickCount || lastPickCount === -1;
        lastPickCount = pickCount;

        if (shouldRender) {
          renderAnalytics(response.analytics, response.snapshot);
        }

        // Enable chat if the user has the feature
        updateChatAvailability(response.analytics);
      }
    } catch (err) {
      console.error('[ValorOdds] Sync error:', err);
      updateStatus({ error: 'SYNC_FAILED', message: err.message });
    } finally {
      isSyncing = false;
      updateSyncingIndicator(false);
    }
  }

  // ─── Rendering ──────────────────────────────────────────────

  function updateSyncingIndicator(syncing) {
    const syncBtn = shadow.getElementById('vo-sync');
    if (syncBtn) {
      syncBtn.disabled = syncing;
      syncBtn.textContent = syncing ? '…' : '↻ Sync';
    }
  }

  /**
   * Update the status area based on sync response.
   */
  function updateStatus(response) {
    const statusEl = shadow.getElementById('vo-status');
    const dotEl = shadow.getElementById('vo-dot');

    if (response.error === 'ESPN_NOT_AUTHENTICATED') {
      statusEl.innerHTML = `<span style="color:var(--vo-danger);">⚠ Sign in to ESPN</span>`;
      dotEl.className = 'vo-brand-dot disconnected';
      return;
    }
    if (response.error === 'VALORODDS_NOT_AUTHENTICATED') {
      statusEl.innerHTML = `<span style="color:var(--vo-danger);">⚠ Sign in to ValorOdds</span>`;
      dotEl.className = 'vo-brand-dot disconnected';
      return;
    }
    if (response.error === 'NO_LEAGUE_SELECTED') {
      statusEl.innerHTML = `<span style="color:var(--vo-text-dim);">Open a draft room</span>`;
      dotEl.className = 'vo-brand-dot disconnected';
      return;
    }
    if (response.error === 'SYNC_THROTTLED') {
      // Silent — don't update the status for throttled syncs
      return;
    }
    if (response.error) {
      statusEl.innerHTML = `<span style="color:var(--vo-danger);">⚠ ${response.message || 'Error'}</span>`;
      dotEl.className = 'vo-brand-dot disconnected';
      return;
    }
  }

  /**
   * Render the full analytics into the bar.
   */
  function renderAnalytics(analytics, snapshot) {
    const statusEl = shadow.getElementById('vo-status');
    const dotEl = shadow.getElementById('vo-dot');

    // Connected
    dotEl.className = 'vo-brand-dot';

    // Status: pick number + on clock
    const pickNum = snapshot.overallPickNumber || 0;
    const onClock = snapshot.isOnClock;
    let statusHtml = `<span>Pick <span class="vo-pick-num">#${pickNum}</span></span>`;
    if (onClock) {
      statusHtml += `<span class="vo-on-clock">● YOU'RE ON THE CLOCK</span>`;
    }
    statusEl.innerHTML = statusHtml;

    // VOR board (top available players)
    renderBoard(analytics.board);

    // Last pick grade
    renderGrade(analytics.lastPickGrade);

    // Scarcity alerts
    renderScarcity(analytics.scarcity);

    // Unfilled starters
    renderNeeds(analytics.unfilledStarters, snapshot);

    // Upgrade prompt
    renderUpgradePrompt(analytics.upgradePrompt, analytics.features);
  }

  function renderBoard(board) {
    const boardEl = shadow.getElementById('vo-board');
    const dividerEl = shadow.getElementById('vo-board-divider');
    const listEl = shadow.getElementById('vo-board-list');

    if (!board || !board.length) {
      boardEl.style.display = 'none';
      dividerEl.style.display = 'none';
      return;
    }

    boardEl.style.display = 'flex';
    dividerEl.style.display = 'block';

    // Show top 8 players
    const top = board.slice(0, 8);
    listEl.innerHTML = top
      .map(
        (p) => `
      <div class="vo-player-chip" title="${p.name || ''} — VOR ${p.vor ?? '—'}">
        <span class="vo-chip-name">${escapeHtml(p.name || 'Unknown')}</span>
        <span class="vo-chip-pos">${escapeHtml(p.position || '')} ${escapeHtml(p.team || '')}</span>
        <span class="vo-chip-vor">${p.vor != null ? p.vor.toFixed(1) : '—'}</span>
      </div>
    `
      )
      .join('');
  }

  function renderGrade(grade) {
    const gradeEl = shadow.getElementById('vo-grade');
    const dividerEl = shadow.getElementById('vo-grade-divider');

    if (!grade || !grade.letter) {
      gradeEl.style.display = 'none';
      dividerEl.style.display = 'none';
      return;
    }

    const letter = grade.letter.toUpperCase();
    gradeEl.className = `vo-grade ${letter.toLowerCase()}`;
    gradeEl.textContent = `Last Pick: ${letter}${grade.label ? ' — ' + grade.label : ''}`;
    gradeEl.style.display = 'flex';
    dividerEl.style.display = 'block';
  }

  function renderScarcity(scarcity) {
    const el = shadow.getElementById('vo-scarcity');

    if (!scarcity || !scarcity.length) {
      el.style.display = 'none';
      return;
    }

    // Show the most urgent scarcity alert
    const top = scarcity[0];
    el.textContent = `⚠ ${escapeHtml(top.position)}: only ${top.remaining} left`;
    el.style.display = 'flex';
  }

  function renderNeeds(unfilledStarters, snapshot) {
    const el = shadow.getElementById('vo-needs');

    if (!unfilledStarters || !unfilledStarters.length) {
      el.style.display = 'none';
      return;
    }

    el.innerHTML = unfilledStarters
      .slice(0, 5)
      .map(
        (n) =>
          `<span class="vo-need-chip">${escapeHtml(n.position)}${n.count > 1 ? ' ×' + n.count : ''}</span>`
      )
      .join('');
    el.style.display = 'flex';
  }

  function renderUpgradePrompt(prompt, features) {
    const el = shadow.getElementById('vo-upgrade');

    if (prompt && prompt.show) {
      el.textContent = prompt.text || '⬆ Upgrade for AI';
      el.href = prompt.url || 'https://valorodds.com/pricing';
      el.style.display = 'flex';
    } else {
      el.style.display = 'none';
    }
  }

  function updateChatAvailability(analytics) {
    const features = analytics?.features;
    const sendBtn = shadow.getElementById('vo-chat-send');
    const placeholder = shadow.getElementById('vo-chat-placeholder');

    if (features && features.aiChat) {
      chatInputEl.disabled = false;
      sendBtn.disabled = false;
      chatInputEl.placeholder = 'Ask the AI draft assistant…';
      if (placeholder) {
        placeholder.textContent = 'Sync your draft, then ask me anything — who to draft, trade advice, positional scarcity, or strategy.';
      }
    } else {
      chatInputEl.disabled = true;
      sendBtn.disabled = true;
      chatInputEl.placeholder = 'Upgrade to Premium to unlock AI chat…';
      if (placeholder) {
        placeholder.textContent = 'AI Draft Assistant is a Premium feature. Upgrade at valorodds.com/pricing to unlock real-time AI advice.';
      }
    }
  }

  // ─── AI Chat ────────────────────────────────────────────────

  function sendChatMessage() {
    const text = chatInputEl.value.trim();
    if (!text || isChatting) return;

    // Add user message to chat
    addChatMessage('user', text);
    chatInputEl.value = '';
    isChatting = true;

    // Disable input while streaming
    const sendBtn = shadow.getElementById('vo-chat-send');
    sendBtn.disabled = true;
    chatInputEl.disabled = true;

    // Create a placeholder AI message that we'll fill in as chunks arrive
    const aiMsgEl = addChatMessage('ai', '');
    let fullText = '';

    // Send to background
    chrome.runtime.sendMessage(
      { type: 'CHAT', message: text, snapshot: lastSnapshot },
      (response) => {
        if (!response || response.error) {
          // Error will come via CHAT_ERROR message
          isChatting = false;
          sendBtn.disabled = false;
          chatInputEl.disabled = false;
          if (response && response.error === 'NO_SNAPSHOT') {
            aiMsgEl.textContent = 'Sync your draft first, then try again.';
            aiMsgEl.classList.add('error');
          }
        }
        // If ok, the streaming happens via CHAT_CHUNK messages below
      }
    );

    // Listen for streaming chunks (these come as separate messages)
    // We set up a one-time listener pattern using a named handler
    const chunkHandler = (msg) => {
      if (msg.type === 'CHAT_CHUNK') {
        fullText += msg.chunk;
        aiMsgEl.textContent = fullText;
        // Auto-scroll to bottom
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
      } else if (msg.type === 'CHAT_DONE') {
        chrome.runtime.onMessage.removeListener(chunkHandler);
        isChatting = false;
        sendBtn.disabled = false;
        chatInputEl.disabled = false;
        chatInputEl.focus();
        if (!fullText) {
          aiMsgEl.textContent = '(No response received)';
        }
      } else if (msg.type === 'CHAT_ERROR') {
        chrome.runtime.onMessage.removeListener(chunkHandler);
        isChatting = false;
        sendBtn.disabled = false;
        chatInputEl.disabled = false;
        aiMsgEl.classList.add('error');
        aiMsgEl.textContent = msg.message || 'An error occurred.';
      }
    };
    chrome.runtime.onMessage.addListener(chunkHandler);
  }

  function addChatMessage(role, text) {
    // Remove placeholder on first message
    const placeholder = shadow.getElementById('vo-chat-placeholder');
    if (placeholder) placeholder.remove();

    const msgEl = document.createElement('div');
    msgEl.className = `vo-chat-msg ${role}`;
    msgEl.textContent = text;
    chatMessagesEl.appendChild(msgEl);
    chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
    return msgEl;
  }

  // ─── Polling ────────────────────────────────────────────────

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      doSync(false);
    }, POLL_INTERVAL_MS);
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

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

  async function init() {
    // Wait for the page body to be available
    if (!document.body) {
      setTimeout(init, 500);
      return;
    }

    await createBar();

    // Check auth status first
    try {
      const auth = await chrome.runtime.sendMessage({ type: 'CHECK_AUTH' });
      if (auth && auth.espn && !auth.espn.authenticated) {
        updateStatus({ error: 'ESPN_NOT_AUTHENTICATED' });
      }
      if (auth && auth.valorodds && !auth.valorodds.authenticated) {
        // Show ValorOdds sign-in prompt but still allow ESPN-only mode
        const statusEl = shadow.getElementById('vo-status');
        if (auth.espn && auth.espn.authenticated) {
          statusEl.innerHTML = `<span style="color:var(--vo-accent);">⚠ Sign in to ValorOdds for analytics</span>`;
        }
      }
    } catch (err) {
      // Background might not be ready yet
    }

    // Do an initial sync
    doSync(true);

    // Start polling
    startPolling();
  }

  // Start when the DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
