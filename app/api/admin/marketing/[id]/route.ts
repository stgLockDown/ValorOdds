import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import {
  getMarketingPost,
  updateMarketingVariants,
  setMarketingStatus,
  deleteMarketingPost,
  type MarketingVariant,
} from '@/lib/marketing-studio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Per-campaign admin API.
 *
 * GET    /api/admin/marketing/[id]   → one campaign
 * PATCH  /api/admin/marketing/[id]   → edit variants (draft/approved only) or
 *                                      set status draft|approved|rejected
 *                                      with optional review notes.
 * DELETE /api/admin/marketing/[id]   → remove a campaign
 *
 * 'posted' is set only by the post route after successful Discord delivery.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const post = await getMarketingPost(id);
  if (!post) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ post });
}

const PatchBody = z
  .object({
    variants: z
      .array(
        z.object({
          id: z.string().min(1).max(60),
          label: z.string().min(1).max(120).optional(),
          channel: z.string().min(1).max(30).optional(),
          body: z.string().min(1).max(3800),
          model: z.string().max(120).optional().nullable(),
          // Image fields are optional so admin body-edits never strip them;
          // explicit values (image picker) win when provided.
          image_url: z.string().trim().max(600).optional().nullable(),
          image_credit: z.string().trim().max(200).optional().nullable(),
        })
      )
      .max(8)
      .optional(),
    status: z.enum(['draft', 'approved', 'rejected']).optional(),
    reviewNotes: z.string().trim().max(600).optional().nullable(),
  })
  .refine((v) => v.variants !== undefined || v.status !== undefined, {
    message: 'Nothing to update',
  });

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;

  let body: z.infer<typeof PatchBody>;
  try {
    body = PatchBody.parse(await req.json().catch(() => ({})));
  } catch (e) {
    return NextResponse.json({ error: 'Invalid input', details: e instanceof Error ? e.message : undefined }, { status: 400 });
  }

  const existing = await getMarketingPost(id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (body.variants) {
    if (existing.status === 'posted') {
      return NextResponse.json({ error: 'Campaign already posted — content is immutable' }, { status: 400 });
    }
    // Merge admin edits over the stored variants (keeps ids/labels/channel,
    // and images unless the edit explicitly swaps them).
    const merged: MarketingVariant[] = existing.variants.map((v) => {
      const edit = body.variants!.find((e) => e.id === v.id);
      if (!edit) return v;
      return {
        ...v,
        body: edit.body,
        model: edit.model ?? v.model,
        image_url: edit.image_url !== undefined ? edit.image_url : v.image_url,
        image_credit: edit.image_credit !== undefined ? edit.image_credit : v.image_credit,
      };
    });
    const updated = await updateMarketingVariants(id, merged);
    if (body.status && updated) {
      return NextResponse.json({ post: await setMarketingStatus(id, body.status, body.reviewNotes ?? null) });
    }
    return NextResponse.json({ post: updated });
  }

  if (body.status) {
    const updated = await setMarketingStatus(id, body.status, body.reviewNotes ?? null);
    return NextResponse.json({ post: updated });
  }

  return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await params;
  const ok = await deleteMarketingPost(id);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
