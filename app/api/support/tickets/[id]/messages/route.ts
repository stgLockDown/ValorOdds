import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import {
  getTicketForUser,
  addMessage,
  getTicketMessages,
  conversationReply,
  hasAdminReplied,
  userAskedForHuman,
  isSupportAIReady,
} from '@/lib/support-service';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST — user adds a reply to their ticket; AI responds autonomously to keep
// the conversation going until it genuinely can't help (then escalates to human).
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ticket = await getTicketForUser(params.id, session.user.id);
  if (!ticket) {
    return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
  }

  if (ticket.status === 'closed') {
    return NextResponse.json({ error: 'This ticket is closed' }, { status: 400 });
  }

  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const message = (body.message || '').trim();
  if (!message || message.length < 1) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }
  if (message.length > 5000) {
    return NextResponse.json({ error: 'Message is too long (max 5000 characters)' }, { status: 400 });
  }

  // 1) Save the user's reply (this also re-opens an ai_resolved ticket).
  await addMessage(params.id, session.user.id, 'user', message);

  // 2) Decide whether the AI should auto-respond.
  //    Skip if: a human (admin) has already joined the conversation, or the
  //    user explicitly asked for a human, or AI isn't configured at all.
  const adminTookOver = await hasAdminReplied(params.id);
  const askedForHuman = userAskedForHuman(message);
  const aiReady = isSupportAIReady();

  let aiReply: { content: string; escalated: boolean; resolved: boolean } | null = null;

  if (!adminTookOver && aiReady) {
    if (askedForHuman) {
      // User wants a human — escalate immediately, no AI reply.
      await query(
        `UPDATE web_support_tickets SET escalated = TRUE WHERE id = $1`,
        [params.id]
      );
      aiReply = {
        content:
          "No problem — I'm escalating this to a human support agent now. A team member will follow up with you here shortly. Thanks for your patience!",
        escalated: true,
        resolved: false,
      };
      await addMessage(params.id, null, 'ai', aiReply.content);
    } else {
      // Gather the full conversation history (including the just-saved reply)
      // and ask the AI to continue the conversation.
      const history = await getTicketMessages(params.id);
      const reply = await conversationReply(
        { subject: ticket.subject, category: ticket.category },
        history.map((m) => ({ role: m.role, content: m.content }))
      );

      if (reply) {
        aiReply = {
          content: reply.reply,
          escalated: reply.escalate,
          resolved: reply.resolved,
        };
        await addMessage(params.id, null, 'ai', reply.reply);

        // Update ticket status based on the AI's verdict.
        if (reply.resolved) {
          await query(
            `UPDATE web_support_tickets
             SET status = 'ai_resolved', escalated = FALSE, resolved_at = NOW()
             WHERE id = $1`,
            [params.id]
          );
        } else if (reply.escalate) {
          await query(
            `UPDATE web_support_tickets SET escalated = TRUE WHERE id = $1`,
            [params.id]
          );
        }
      }
      // If reply is null (all providers failed), the ticket stays open/escalated
      // for human follow-up — the user's message is still saved.
    }
  } else if (adminTookOver) {
    // A human is handling this ticket. Mark it as needing human attention but
    // do NOT generate an AI reply — just save the user's message (already done).
    await query(
      `UPDATE web_support_tickets SET escalated = TRUE WHERE id = $1`,
      [params.id]
    );
  }

  // Return the updated conversation so the client can render the AI reply
  // immediately (no extra round-trip needed).
  const messages = await getTicketMessages(params.id);
  return NextResponse.json({
    success: true,
    aiReply: aiReply?.content ?? null,
    escalated: aiReply?.escalated ?? (adminTookOver || askedForHuman),
    messages,
  });
}
