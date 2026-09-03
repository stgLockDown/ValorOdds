/**
 * valorodds-api.js — ValorOdds API client for the Draft Bar extension.
 *
 * Sends the parsed ESPN draft snapshot to the ValorOdds backend and receives
 * VOR analytics (board, scarcity, suggestions, pick grades). Also handles
 * the AI chat SSE stream for Premium/VIP users.
 *
 * All calls use credentials: 'include' so the ValorOdds session cookie
 * (set when the user logs in at valorodds.com) authenticates the request
 * and the backend resolves the user's subscription tier.
 */

// ─── Configuration ───────────────────────────────────────────────────────────

// The ValorOdds API base URL. In production this is valorodds.com.
// For local development, change to http://localhost:3000.
const VALORODDS_API_BASE = 'https://valorodds.com';

// ─── Draft sync ──────────────────────────────────────────────────────────────

/**
 * Send a draft snapshot to the ValorOdds API and receive analytics.
 *
 * @param {object} snapshot - The draft snapshot built by espn-api.js
 * @returns {Promise<object>} Analytics response: { board, scarcity, suggestions, activeRuns, unfilledStarters, lastPickGrade, features, upgradePrompt, minSyncIntervalMs }
 */
async function syncDraft(snapshot) {
  const response = await fetch(`${VALORODDS_API_BASE}/api/dd/espn-sync`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(snapshot),
  });

  if (response.status === 401) {
    throw new Error('VALORODDS_NOT_AUTHENTICATED');
  }
  if (response.status === 403) {
    throw new Error('VALORODDS_FORBIDDEN');
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`VALORODDS_API_ERROR_${response.status}: ${text}`);
  }

  return response.json();
}

// ─── AI Chat (SSE stream) ────────────────────────────────────────────────────

/**
 * Send a message to the ValorOdds AI draft assistant and stream the response.
 *
 * Only available to Premium/VIP users (gated server-side). The response is
 * an SSE stream in the format: data: {"content":"..."}\n\n terminated by
 * data: [DONE].
 *
 * @param {string} message - The user's question
 * @param {object} snapshot - The current draft snapshot (for context)
 * @param {function} onChunk - Callback called with each text chunk: (text) => void
 * @param {function} onDone - Callback called when the stream completes
 * @param {function} onError - Callback called on error: (error) => void
 * @returns {Promise<void>}
 */
async function streamChat(message, snapshot, onChunk, onDone, onError) {
  try {
    const response = await fetch(`${VALORODDS_API_BASE}/api/dd/espn-sync/chat`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ message, ...snapshot }),
    });

    if (response.status === 401) {
      onError(new Error('VALORODDS_NOT_AUTHENTICATED'));
      return;
    }
    if (response.status === 403) {
      onError(new Error('VALORODDS_CHAT_NOT_AVAILABLE'));
      return;
    }
    if (!response.ok) {
      onError(new Error(`VALORODDS_CHAT_ERROR_${response.status}`));
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6); // Remove "data: " prefix
        if (data === '[DONE]') {
          onDone();
          return;
        }

        try {
          const parsed = JSON.parse(data);
          if (parsed.content) {
            onChunk(parsed.content);
          }
        } catch {
          // Ignore malformed JSON lines
        }
      }
    }

    onDone();
  } catch (err) {
    onError(err);
  }
}

// ─── Exports ─────────────────────────────────────────────────────────────────

if (typeof self !== 'undefined') {
  self.syncDraft = syncDraft;
  self.streamChat = streamChat;
  self.VALORODDS_API_BASE = VALORODDS_API_BASE;
}
