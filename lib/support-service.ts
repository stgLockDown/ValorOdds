/**
 * Support Service — AI-first triage for support tickets.
 *
 * PRIMARY:  OpenAI (OPENAI_API_KEY)   — same model ladder as the chat feature.
 * FALLBACK: DeepSeek (DEEPSEEK_API_KEY)
 *
 * When a user submits a ticket, the AI:
 *   1. Reads the subject + message.
 *   2. Classifies category & priority.
 *   3. Generates a helpful triage response.
 *   4. Returns a confidence score.
 *
 * If confidence >= AUTO_RESOLVE_THRESHOLD the ticket is auto-resolved (ai_resolved).
 * Otherwise it is escalated to 'open' for admin follow-up.
 *
 * If no AI keys are configured, the service runs in "fallback mode" — tickets
 * are created without AI triage and always escalated to admins.
 */
import { query, queryOne } from '@/lib/db';

export const AUTO_RESOLVE_THRESHOLD = 0.78;

export interface TriageResult {
  aiResponse: string;
  aiCategory: string;
  aiPriority: string;
  aiConfidence: number;
  autoResolve: boolean;
  provider: string;
}

interface Provider {
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  style: 'gpt5' | 'legacy';
}

const TRIAGE_SYSTEM_PROMPT = `You are the Valor Odds support triage assistant.
A user has submitted a support ticket. Your job:
1. Classify the ticket into exactly one category: general, billing, technical, bug, feature_request, account, other.
2. Assign a priority: low, normal, high, or urgent.
3. Write a helpful, friendly response that addresses the user's issue directly.

Rules:
- Be concise but thorough (3-6 sentences).
- If the issue is about billing/subscription, mention they can manage billing at /account.
- If the issue is about Discord linking, point them to /account/link-discord.
- If it's a bug, ask for steps to reproduce and mention the team will investigate.
- If it's a feature request, thank them and say it's been logged.
- For account/access issues, mention their current plan tier.
- Always end with: "If this doesn't resolve your issue, a team member will follow up shortly."

You MUST respond with valid JSON only, no markdown fences:
{
  "category": "<one of the categories>",
  "priority": "<low|normal|high|urgent>",
  "confidence": <0.0-1.0>,
  "response": "<your helpful response>"
}`;

const isGpt5 = (model: string) => /^(gpt-5|o[0-9])/i.test(model);

function buildProviders(): Provider[] {
  const openaiKey = process.env.OPENAI_API_KEY;
  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const providers: Provider[] = [];

  if (openaiKey) {
    const models = [
      process.env.OPENAI_CHAT_MODEL || 'gpt-5.5',
      process.env.OPENAI_CHAT_FALLBACK_MODEL || 'gpt-5.4',
      process.env.OPENAI_CHAT_MINI_MODEL || 'gpt-5.4-mini',
    ].filter((m, i, arr) => m && arr.indexOf(m) === i);
    for (const model of models) {
      providers.push({
        name: `openai:${model}`,
        baseUrl: 'https://api.openai.com/v1',
        apiKey: openaiKey,
        model,
        style: isGpt5(model) ? 'gpt5' : 'legacy',
      });
    }
  }

  if (deepseekKey) {
    providers.push({
      name: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: deepseekKey,
      model: process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-chat',
      style: 'legacy',
    });
  }

  return providers;
}

export function isSupportAIReady(): boolean {
  return Boolean(process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY);
}

async function callProvider(
  p: Provider,
  messages: Array<{ role: string; content: string }>
): Promise<string | null> {
  const payload: Record<string, unknown> = {
    model: p.model,
    messages,
    stream: false,
  };
  if (p.style === 'gpt5') {
    payload.max_completion_tokens = 512;
  } else {
    payload.max_tokens = 512;
    payload.temperature = 0.4;
  }

  try {
    const res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${p.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      console.warn(`[support/triage] ${p.name} returned ${res.status}`);
      return null;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    return typeof content === 'string' ? content : null;
  } catch (err) {
    console.warn(`[support/triage] ${p.name} error:`, err);
    return null;
  }
}

function parseTriageJSON(raw: string): {
  category: string;
  priority: string;
  confidence: number;
  response: string;
} | null {
  try {
    // Strip markdown fences if present
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
    }
    const parsed = JSON.parse(cleaned);
    if (!parsed.response || typeof parsed.response !== 'string') return null;
    return {
      category: String(parsed.category || 'general'),
      priority: String(parsed.priority || 'normal'),
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
      response: parsed.response,
    };
  } catch {
    // If JSON parse fails, treat the raw text as the response with defaults
    if (raw.trim().length > 20) {
      return {
        category: 'general',
        priority: 'normal',
        confidence: 0.3,
        response: raw.trim(),
      };
    }
    return null;
  }
}

/**
 * Run AI triage on a new support ticket.
 * Returns null if no AI providers are configured (fallback mode).
 */
export async function triageTicket(
  subject: string,
  message: string
): Promise<TriageResult | null> {
  const providers = buildProviders();
  if (providers.length === 0) {
    return null; // fallback mode — no AI keys
  }

  const messages = [
    { role: 'system', content: TRIAGE_SYSTEM_PROMPT },
    {
      role: 'user',
      content: `Subject: ${subject}\n\nMessage:\n${message}`,
    },
  ];

  for (const p of providers) {
    const raw = await callProvider(p, messages);
    if (!raw) continue;
    const parsed = parseTriageJSON(raw);
    if (!parsed) continue;

    return {
      aiResponse: parsed.response,
      aiCategory: parsed.category,
      aiPriority: parsed.priority,
      aiConfidence: parsed.confidence,
      autoResolve: parsed.confidence >= AUTO_RESOLVE_THRESHOLD,
      provider: p.name,
    };
  }

  // All providers failed
  return null;
}

// ---------- Database helpers ----------

export interface CreateTicketInput {
  userId: string;
  subject: string;
  category?: string;
  message: string;
}

export interface TicketRow {
  id: string;
  user_id: string;
  subject: string;
  category: string;
  priority: string;
  status: string;
  ai_triaged: boolean;
  ai_response: string | null;
  escalated: boolean;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  username?: string;
  email?: string;
  message_count?: string;
}

export async function createTicket(
  input: CreateTicketInput
): Promise<{ ticket: TicketRow; triage: TriageResult | null }> {
  // Run triage
  const triage = await triageTicket(input.subject, input.message);

  const status = triage?.autoResolve ? 'ai_resolved' : 'open';
  const category = triage?.aiCategory || input.category || 'general';
  const priority = triage?.aiPriority || 'normal';

  // Insert ticket
  const ticket = await queryOne<TicketRow>(
    `INSERT INTO web_support_tickets
       (user_id, subject, category, priority, status, ai_triaged, ai_response,
        ai_category, ai_priority, ai_confidence, escalated)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, user_id, subject, category, priority, status,
               ai_triaged, ai_response, escalated, created_at, updated_at, resolved_at`,
    [
      input.userId,
      input.subject,
      category,
      priority,
      status,
      triage ? true : false,
      triage?.aiResponse ?? null,
      triage?.aiCategory ?? null,
      triage?.aiPriority ?? null,
      triage?.aiConfidence ?? null,
      triage ? !triage.autoResolve : true,
    ]
  );

  if (!ticket) throw new Error('Failed to create ticket');

  // Insert the user's original message
  await query(
    `INSERT INTO web_support_messages (ticket_id, user_id, role, content)
     VALUES ($1, $2, 'user', $3)`,
    [ticket.id, input.userId, input.message]
  );

  // If AI triaged, insert the AI response as a message
  if (triage?.aiResponse) {
    await query(
      `INSERT INTO web_support_messages (ticket_id, user_id, role, content)
       VALUES ($1, NULL, 'ai', $2)`,
      [ticket.id, triage.aiResponse]
    );
  }

  return { ticket, triage };
}

export async function getTicketsForUser(userId: string): Promise<TicketRow[]> {
  const result = await query<TicketRow>(
    `SELECT id, user_id, subject, category, priority, status,
            ai_triaged, ai_response, escalated, created_at, updated_at, resolved_at
     FROM web_support_tickets
     WHERE user_id = $1
     ORDER BY created_at DESC`,
    [userId]
  );
  return result.rows;
}

export async function getTicketForUser(
  ticketId: string,
  userId: string
): Promise<TicketRow | null> {
  return queryOne<TicketRow>(
    `SELECT id, user_id, subject, category, priority, status,
            ai_triaged, ai_response, escalated, created_at, updated_at, resolved_at
     FROM web_support_tickets
     WHERE id = $1 AND user_id = $2`,
    [ticketId, userId]
  );
}

export async function getTicketMessages(
  ticketId: string
): Promise<Array<{ id: string; role: string; content: string; created_at: string }>> {
  const result = await query(
    `SELECT id, role, content, created_at
     FROM web_support_messages
     WHERE ticket_id = $1
     ORDER BY created_at ASC`,
    [ticketId]
  );
  return result.rows as Array<{ id: string; role: string; content: string; created_at: string }>;
}

export async function addMessage(
  ticketId: string,
  userId: string | null,
  role: 'user' | 'ai' | 'admin',
  content: string
): Promise<void> {
  await query(
    `INSERT INTO web_support_messages (ticket_id, user_id, role, content)
     VALUES ($1, $2, $3, $4)`,
    [ticketId, userId, role, content]
  );

  // Re-open ticket if user replies to an ai_resolved ticket
  if (role === 'user') {
    await query(
      `UPDATE web_support_tickets
       SET status = 'open', escalated = TRUE, resolved_at = NULL
       WHERE id = $1 AND status = 'ai_resolved'`,
      [ticketId]
    );
  }
}

// ---------- Admin helpers ----------

export async function getAllTickets(
  filter?: { status?: string; limit?: number; offset?: number }
): Promise<{ tickets: TicketRow[]; total: number }> {
  const limit = filter?.limit ?? 50;
  const offset = filter?.offset ?? 0;
  const statusFilter = filter?.status && filter.status !== 'all' ? filter.status : null;

  const whereClause = statusFilter ? 'WHERE t.status = $3' : '';
  const params: unknown[] = statusFilter ? [limit, offset, statusFilter] : [limit, offset];

  const ticketsResult = await query<TicketRow>(
    `SELECT t.id, t.user_id, t.subject, t.category, t.priority, t.status,
            t.ai_triaged, t.ai_response, t.escalated, t.created_at, t.updated_at,
            t.resolved_at,
            u.display_name AS username, u.email,
            (SELECT COUNT(*)::text FROM web_support_messages WHERE ticket_id = t.id) AS message_count
     FROM web_support_tickets t
     LEFT JOIN web_users u ON u.id = t.user_id
     ${whereClause}
     ORDER BY
       CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
       t.created_at DESC
     LIMIT $1 OFFSET $2`,
    params
  );

  const countResult = await query<{ c: string }>(
    `SELECT COUNT(*)::text AS c FROM web_support_tickets ${whereClause}`,
    statusFilter ? [statusFilter] : []
  );

  return {
    tickets: ticketsResult.rows,
    total: parseInt(countResult.rows[0]?.c ?? '0', 10),
  };
}

export async function adminGetTicket(ticketId: string): Promise<TicketRow | null> {
  return queryOne<TicketRow>(
    `SELECT t.id, t.user_id, t.subject, t.category, t.priority, t.status,
            t.ai_triaged, t.ai_response, t.escalated, t.created_at, t.updated_at,
            t.resolved_at,
            u.display_name AS username, u.email
     FROM web_support_tickets t
     LEFT JOIN web_users u ON u.id = t.user_id
     WHERE t.id = $1`,
    [ticketId]
  );
}

export async function adminUpdateTicketStatus(
  ticketId: string,
  status: string
): Promise<void> {
  const validStatuses = ['open', 'ai_resolved', 'resolved', 'closed'];
  if (!validStatuses.includes(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
  await query(
    `UPDATE web_support_tickets SET status = $1 WHERE id = $2`,
    [status, ticketId]
  );
}

export async function getTicketStats(): Promise<{
  total: number;
  open: number;
  aiResolved: number;
  resolved: number;
  escalated: number;
}> {
  const result = await query<{
    total: string;
    open: string;
    ai_resolved: string;
    resolved: string;
    escalated: string;
  }>(
    `SELECT
       COUNT(*)::text AS total,
       COUNT(*) FILTER (WHERE status = 'open')::text AS open,
       COUNT(*) FILTER (WHERE status = 'ai_resolved')::text AS ai_resolved,
       COUNT(*) FILTER (WHERE status = 'resolved')::text AS resolved,
       COUNT(*) FILTER (WHERE escalated = TRUE)::text AS escalated
     FROM web_support_tickets`
  );
  const r = result.rows[0];
  return {
    total: parseInt(r?.total ?? '0', 10),
    open: parseInt(r?.open ?? '0', 10),
    aiResolved: parseInt(r?.ai_resolved ?? '0', 10),
    resolved: parseInt(r?.resolved ?? '0', 10),
    escalated: parseInt(r?.escalated ?? '0', 10),
  };
}
