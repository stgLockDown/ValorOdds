-- Migration 004: Add `beta` tier for launch pricing
--
-- The original 001 migration restricted web_subscriptions.tier to
-- ('free','premium','vip'). We are launching a Beta Access tier at ~$10.59/mo
-- as the primary public tier, so we relax the constraint to allow 'beta'.
--
-- Safe to re-run: uses DO block with IF EXISTS checks.

BEGIN;

-- Drop the old check constraint if present. Constraint name follows Postgres default convention.
ALTER TABLE web_subscriptions
  DROP CONSTRAINT IF EXISTS web_subscriptions_tier_check;

-- Re-create with 'beta' included.
ALTER TABLE web_subscriptions
  ADD CONSTRAINT web_subscriptions_tier_check
  CHECK (tier IN ('free', 'beta', 'premium', 'vip'));

-- If any users/app-level tables also have tier constraints, update them here.
-- For now, web_subscriptions is the only table.

COMMIT;