-- ============================================================================
-- Valor Odds — Support Ticket System (AI-first triage)
-- Additive only. Powers /dashboard/support (user) and /admin/support (admin).
--
-- Flow:
--   1. User submits a support ticket via /dashboard/support.
--   2. AI (OpenAI → DeepSeek fallback) reads the message, classifies category
--      & priority, and generates an instant triage response.
--   3. Ticket is auto-resolved if the AI answer is confident; otherwise it is
--      escalated to 'open' for admin follow-up.
--   4. Admins view/manage tickets at /admin/support, reply, and update status.
-- ============================================================================

-- ---------- Support tickets ----------
CREATE TABLE IF NOT EXISTS web_support_tickets (
    id              BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES web_users(id) ON DELETE CASCADE,
    subject         TEXT NOT NULL,
    category        TEXT NOT NULL DEFAULT 'general',        -- general|billing|technical|bug|feature_request|account|other
    priority        TEXT NOT NULL DEFAULT 'normal',          -- low|normal|high|urgent
    status          TEXT NOT NULL DEFAULT 'open',            -- open|ai_resolved|resolved|closed
    ai_triaged      BOOLEAN NOT NULL DEFAULT FALSE,
    ai_response     TEXT,                                     -- AI-generated triage reply (nullable)
    ai_category     TEXT,                                     -- AI-suggested category
    ai_priority     TEXT,                                     -- AI-suggested priority
    ai_confidence   NUMERIC(3,2),                             -- 0.00–1.00
    escalated       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user    ON web_support_tickets (user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status  ON web_support_tickets (status);
CREATE INDEX IF NOT EXISTS idx_support_tickets_created ON web_support_tickets (created_at DESC);

-- ---------- Support ticket messages (conversation thread) ----------
CREATE TABLE IF NOT EXISTS web_support_messages (
    id              BIGSERIAL PRIMARY KEY,
    ticket_id       BIGINT NOT NULL REFERENCES web_support_tickets(id) ON DELETE CASCADE,
    user_id         BIGINT REFERENCES web_users(id) ON DELETE SET NULL,  -- null for AI/system messages
    role            TEXT NOT NULL DEFAULT 'user',            -- user|ai|admin
    content         TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON web_support_messages (ticket_id, created_at);

-- ---------- Trigger: keep updated_at in sync ----------
CREATE OR REPLACE FUNCTION fn_support_ticket_touch()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    IF NEW.status IN ('resolved', 'closed') AND NEW.resolved_at IS NULL THEN
        NEW.resolved_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_support_ticket_touch ON web_support_tickets;
CREATE TRIGGER trg_support_ticket_touch
    BEFORE UPDATE ON web_support_tickets
    FOR EACH ROW EXECUTE FUNCTION fn_support_ticket_touch();
