const express = require('express');
const { pool } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// ── Stripe setup ───────────────────────────────────────
// Set STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET in Railway env vars
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const CLIENT_URL = process.env.CLIENT_URL || process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : 'http://localhost:3000';

let stripe = null;
if (STRIPE_SECRET_KEY) {
  stripe = require('stripe')(STRIPE_SECRET_KEY);
  console.log('💳 Stripe initialized');
} else {
  console.warn('⚠️  STRIPE_SECRET_KEY not set – payment endpoints will be disabled');
}

// Helper
const requireStripe = (_req, res) => {
  if (!stripe) {
    res.status(503).json({ error: 'Payments are not configured. Set STRIPE_SECRET_KEY in environment.' });
    return false;
  }
  if (!pool) {
    res.status(503).json({ error: 'Database is not connected.' });
    return false;
  }
  return true;
};

// ── Price IDs mapping ──────────────────────────────────
// You can hardcode Stripe Price IDs here, or set them as env vars
const PRICE_MAP = {
  premium: process.env.STRIPE_PRICE_PREMIUM || null,
  vip: process.env.STRIPE_PRICE_VIP || null,
};

// ── GET /api/stripe/plans ──────────────────────────────
// Returns available plans for the frontend
router.get('/plans', (_req, res) => {
  res.json({
    plans: [
      {
        id: 'free',
        name: 'Free Trial',
        price: 0,
        period: '7 days',
        features: [
          'Access to summary channel',
          'Daily top 5 opportunities',
          'Basic AI analysis',
          'Community support',
        ],
      },
      {
        id: 'premium',
        name: 'Premium',
        price: 2900,    // in cents
        period: 'month',
        popular: true,
        features: [
          'All 14 arbitrage channels',
          'Unlimited opportunities',
          'Full AI analysis',
          'Player props (4 sports)',
          'Custom AI commands',
          'Priority support',
          'Mobile notifications',
        ],
      },
      {
        id: 'vip',
        name: 'VIP',
        price: 7900,    // in cents
        period: 'month',
        features: [
          'Everything in Premium',
          'Early access to opportunities',
          'Exclusive VIP channel',
          'Direct input on bot functions',
          'Live meetings with dev team',
          'Help shape the future of Valor Odds',
          'Beta access to upcoming mobile app',
          'Custom alerts & priority support',
        ],
      },
    ],
  });
});

// ── POST /api/stripe/create-checkout ───────────────────
// Creates a Stripe Checkout Session for a plan
router.post('/create-checkout', authMiddleware, async (req, res) => {
  if (!requireStripe(req, res)) return;

  try {
    const { plan } = req.body;  // 'premium' or 'vip'
    const userId = req.user.userId;

    if (!plan || !PRICE_MAP[plan]) {
      return res.status(400).json({ error: 'Invalid plan. Choose premium or vip.' });
    }

    const priceId = PRICE_MAP[plan];
    if (!priceId) {
      return res.status(400).json({
        error: `Stripe Price ID for "${plan}" is not configured. Set STRIPE_PRICE_${plan.toUpperCase()} in environment.`,
      });
    }

    // Get or create Stripe customer
    const userResult = await pool.query(
      'SELECT id, email, name, stripe_customer_id FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

    let customerId = user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        name: user.name,
        metadata: { userId: String(user.id) },
      });
      customerId = customer.id;
      await pool.query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [
        customerId,
        userId,
      ]);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${CLIENT_URL}/dashboard?checkout=success&plan=${plan}`,
      cancel_url: `${CLIENT_URL}/dashboard?checkout=cancelled`,
      metadata: { userId: String(userId), plan },
      subscription_data: {
        metadata: { userId: String(userId), plan },
      },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ── POST /api/stripe/create-portal ─────────────────────
// Creates a Stripe Customer Portal session (manage subscription)
router.post('/create-portal', authMiddleware, async (req, res) => {
  if (!requireStripe(req, res)) return;

  try {
    const userId = req.user.userId;
    const userResult = await pool.query(
      'SELECT stripe_customer_id FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];

    if (!user || !user.stripe_customer_id) {
      return res.status(400).json({ error: 'No active subscription found' });
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: `${CLIENT_URL}/dashboard`,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe portal error:', err);
    res.status(500).json({ error: 'Failed to create portal session' });
  }
});

// ── GET /api/stripe/subscription ───────────────────────
// Get current user's subscription status
router.get('/subscription', authMiddleware, async (req, res) => {
  if (!pool) return res.status(503).json({ error: 'Database not connected' });

  try {
    const result = await pool.query(
      'SELECT plan, subscription_status, subscription_end, stripe_subscription_id FROM users WHERE id = $1',
      [req.user.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Get subscription error:', err);
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// ── POST /api/stripe/webhook ───────────────────────────
// Stripe sends events here – must use raw body (configured in index.js)
router.post('/webhook', async (req, res) => {
  if (!stripe) return res.status(503).send('Stripe not configured');

  let event;
  try {
    if (STRIPE_WEBHOOK_SECRET) {
      const sig = req.headers['stripe-signature'];
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } else {
      // In dev without webhook secret, trust the payload
      event = req.body;
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log(`📨 Stripe webhook: ${event.type}`);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const plan = session.metadata?.plan;
        const subscriptionId = session.subscription;

        if (userId && plan) {
          await pool.query(
            `UPDATE users SET 
              plan = $1, 
              stripe_subscription_id = $2, 
              subscription_status = 'active',
              updated_at = NOW()
            WHERE id = $3`,
            [plan, subscriptionId, userId]
          );

          // Record payment
          await pool.query(
            `INSERT INTO payments (user_id, stripe_payment_id, stripe_subscription_id, amount, currency, status, plan)
             VALUES ($1, $2, $3, $4, $5, 'completed', $6)`,
            [
              userId,
              session.payment_intent || session.id,
              subscriptionId,
              session.amount_total || 0,
              session.currency || 'usd',
              plan,
            ]
          );

          console.log(`💰 User ${userId} subscribed to ${plan}`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const userId = sub.metadata?.userId;
        const status = sub.status;  // active, past_due, canceled, etc.

        if (userId) {
          const plan = sub.metadata?.plan || 'premium';
          const periodEnd = new Date(sub.current_period_end * 1000);

          await pool.query(
            `UPDATE users SET 
              subscription_status = $1,
              plan = CASE WHEN $1 = 'active' THEN $2 ELSE plan END,
              subscription_end = $3,
              updated_at = NOW()
            WHERE id = $4`,
            [status, plan, periodEnd, userId]
          );
          console.log(`📋 Subscription updated for user ${userId}: ${status}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const userId = sub.metadata?.userId;

        if (userId) {
          await pool.query(
            `UPDATE users SET 
              plan = 'free',
              subscription_status = 'cancelled',
              stripe_subscription_id = NULL,
              updated_at = NOW()
            WHERE id = $1`,
            [userId]
          );
          console.log(`🚫 Subscription cancelled for user ${userId}`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        if (customerId) {
          await pool.query(
            `UPDATE users SET subscription_status = 'past_due', updated_at = NOW()
             WHERE stripe_customer_id = $1`,
            [customerId]
          );
          console.log(`⚠️  Payment failed for customer ${customerId}`);
        }
        break;
      }

      default:
        // Unhandled event type
        break;
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
  }

  res.json({ received: true });
});

module.exports = router;