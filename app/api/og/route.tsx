import { ImageResponse } from 'next/og';

/**
 * Dynamic Open Graph image generator.
 *
 * Produces a 1200x630 branded social share card based on query params:
 *   /api/og?title=...&subtitle=...&kicker=...
 *
 * Used as the fallback OG image for any page that doesn't ship its own art.
 * Matches top-sportsbook practice (DraftKings, FanDuel, Caesars) of shipping
 * unique OG imagery per page for higher CTR in social / SERP previews.
 */

export const runtime = 'edge';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = (searchParams.get('title') || 'Valor Odds').slice(0, 120);
  const subtitle = (searchParams.get('subtitle') || 'AI-Powered Sports Betting Intelligence').slice(0, 160);
  const kicker = (searchParams.get('kicker') || 'VALOR ODDS').slice(0, 40);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 80,
          background:
            'linear-gradient(135deg, #0a1628 0%, #0f1b33 50%, #0a1628 100%)',
          color: 'white',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Decorative grid */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'radial-gradient(circle at 20% 20%, rgba(29, 185, 84, 0.15), transparent 50%), radial-gradient(circle at 80% 80%, rgba(59, 130, 246, 0.12), transparent 50%)',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 16, zIndex: 1 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #1DB954, #3B82F6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
              fontWeight: 800,
              color: 'white',
            }}
          >
            V
          </div>
          <div
            style={{
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: 8,
              color: '#94a3b8',
              textTransform: 'uppercase',
            }}
          >
            {kicker}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, zIndex: 1 }}>
          <div
            style={{
              fontSize: 72,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -1.5,
              maxWidth: 1000,
              display: 'flex',
            }}
          >
            {title}
          </div>
          <div
            style={{
              fontSize: 28,
              lineHeight: 1.3,
              color: '#cbd5e1',
              maxWidth: 960,
              display: 'flex',
            }}
          >
            {subtitle}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            zIndex: 1,
          }}
        >
          <div style={{ fontSize: 22, color: '#94a3b8', display: 'flex' }}>
            valorodds.com
          </div>
          <div
            style={{
              display: 'flex',
              gap: 8,
              fontSize: 18,
              fontWeight: 600,
              color: '#1DB954',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 10,
                background: '#1DB954',
              }}
            />
            LIVE ARBITRAGE · AI PROPS · 25+ SPORTS
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}