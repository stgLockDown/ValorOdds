const express = require('express');
const router = express.Router();

const SYSTEM_PROMPT = `You are the Valor Odds Marketing Agent — a specialized AI content strategist for Valor Odds and Sports, a premium Discord-based sports betting intelligence community.

BRAND IDENTITY:
- Valor Odds is the smart bettor's edge — an intelligence platform, not a tipster service
- Core pillars: EDGE (mathematical advantage via arbitrage), TRUST (transparent, data-backed), COMMUNITY (bettors helping bettors), SPEED (real-time alerts)
- Brand voice: Confident, data-driven, slightly edgy. Like a sharp trader, not a desperate tout
- NOT: gamblers, tipsters, get-rich-quick, or promise-makers

PRIMARY TAGLINES:
- "Tired of Losing? Turn the Odds in Your Favor."
- "The Smart Money Knows. Now You Do Too."
- "Stop Guessing. Start Winning."
- "The Edge Closes Fast. Get In Before the Line Moves."

PRODUCTS:
- Discord server with Supporter (~$9-15/mo) and VIP (~$29-49/mo) subscription tiers via MEE6
- Website: ValorOdds.com | Mobile app coming soon
- Social: TikTok, Instagram, Reddit, X/Twitter, YouTube
- Sports focus: MLB, NFL, NBA, NHL

CONTENT RULES:
- Never make specific income guarantees or ROI promises
- Frame as "data intelligence" and "odds analysis," not "guaranteed picks"
- Always include a subtle CTA directing to Discord or ValorOdds.com
- Create FOMO and urgency without being desperate
- Use data points, percentages, and specific numbers wherever possible

When generating content, be specific, punchy, and ready-to-post. Format output cleanly with clear sections.`;

// POST /api/ai/chat  — streaming proxy to Anthropic
router.post('/chat', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  // Verify JWT (lightweight check — just ensure token exists and user is admin)
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET || 'dev-secret');
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const { messages, maxTokens = 1200 } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: maxTokens,
        system: SYSTEM_PROMPT,
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic API error:', response.status, err);
      return res.status(response.status).json({ error: 'Anthropic API error', details: err });
    }

    // Stream the response through to the client
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      res.write(chunk);
    }
    res.end();
  } catch (err) {
    console.error('AI proxy error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'AI proxy error' });
    } else {
      res.end();
    }
  }
});

module.exports = router;