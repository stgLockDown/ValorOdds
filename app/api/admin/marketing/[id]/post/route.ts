import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { getMarketingPost, recordPostedVariant } from '@/lib/marketing-studio';
import { postMarketingToDiscord } from '@/lib/bot-client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/admin/marketing/[id]/post
 *   { variantId, channelId, editedContent? }
 *
 * Ships one approved variant to Discord via the bot's internal API. The
 * campaign must be approved first (explicit admin sign-off), the channel
 * must be in the bot's allowlist, and posting marks the campaign 'posted'
 * with a delivery receipt (messageId + URL) per variant.
 */
const Body = z.object({
  variantId: z.string().min(1).max(60),
  channelId: z.string().min(1).max(32),
  editedContent: z.string().min(1).max(3800).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;

  let input: z.infer<typeof Body>;
  try {
    input = Body.parse(await req.json().catch(() => ({})));
  } catch (e) {
    return NextResponse.json({ error: 'Invalid input', details: e instanceof Error ? e.message : undefined }, { status: 400 });
  }

  const post = await getMarketingPost(id);
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (post.status !== 'approved') {
    return NextResponse.json(
      { error: 'Campaign must be approved before posting (approve it in the queue first)' },
      { status: 400 }
    );
  }
  const variant = post.variants.find((v) => v.id === input.variantId);
  if (!variant) {
    return NextResponse.json({ error: 'Variant not found' }, { status: 404 });
  }

  const content = input.editedContent?.trim() || variant.body;
  if (!content) {
    return NextResponse.json({ error: 'Variant body is empty' }, { status: 400 });
  }

  try {
    const receipt = await postMarketingToDiscord({
      channelId: input.channelId,
      content,
      variantId: variant.id,
    });
    const updated = await recordPostedVariant(id, {
      variantId: variant.id,
      channelId: receipt.channelId ?? input.channelId,
      messageId: receipt.messageId,
      messageUrl: receipt.messageUrl,
    });
    return NextResponse.json({ ok: true, receipt, post: updated });
  } catch (err) {
    console.error('[admin/marketing post]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Discord delivery failed' },
      { status: 502 }
    );
  }
}
