import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import {
  harvestPlatformSnapshot,
  generateMarketingVariants,
  createMarketingPost,
  listMarketingPosts,
  type MarketingAudience,
  type MarketingTone,
} from '@/lib/marketing-studio';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // AI generation can take a couple minutes

/**
 * Admin-only Marketing Studio API.
 *
 * GET  /api/admin/marketing          → campaign queue (newest first)
 * POST /api/admin/marketing          { topic, audience?, tone?, notes?, focusSports? }
 *                                   → harvest platform data, run the AI ladder,
 *                                     store a draft campaign for review.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const posts = await listMarketingPosts();
    return NextResponse.json({ posts });
  } catch (err) {
    console.error('[admin/marketing GET]', err);
    return NextResponse.json({ error: 'Failed to list campaigns' }, { status: 500 });
  }
}

const GenerateBody = z.object({
  topic: z.string().trim().min(4).max(200),
  audience: z.enum(['casual', 'sharp', 'mixed']).default('mixed'),
  tone: z.enum(['hype', 'analytical', 'playful', 'urgent']).default('hype'),
  notes: z.string().trim().max(600).optional().nullable(),
  focusSports: z.array(z.enum(['NFL', 'NBA', 'MLB', 'NHL', 'NCAAF', 'NCAAB', 'SOCCER'])).max(4).default([]),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (!session.user.id) {
    return NextResponse.json({ error: 'No user id on session' }, { status: 401 });
  }

  let input: z.infer<typeof GenerateBody>;
  try {
    input = GenerateBody.parse(await req.json().catch(() => ({})));
  } catch (e) {
    return NextResponse.json({ error: 'Invalid input', details: e instanceof Error ? e.message : undefined }, { status: 400 });
  }

  try {
    const snapshot = await harvestPlatformSnapshot(input.focusSports);
    const generated = await generateMarketingVariants(
      {
        topic: input.topic,
        audience: input.audience as MarketingAudience,
        tone: input.tone as MarketingTone,
        notes: input.notes ?? null,
        focusSports: input.focusSports,
      },
      snapshot
    );
    const post = await createMarketingPost(
      {
        topic: input.topic,
        audience: input.audience as MarketingAudience,
        tone: input.tone as MarketingTone,
        notes: input.notes ?? null,
        focusSports: input.focusSports,
      },
      snapshot,
      generated,
      {
        id: session.user.id,
        name: session.user.name || session.user.email || 'admin',
      }
    );
    return NextResponse.json({ post });
  } catch (err) {
    console.error('[admin/marketing POST]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Generation failed' },
      { status: 500 }
    );
  }
}
