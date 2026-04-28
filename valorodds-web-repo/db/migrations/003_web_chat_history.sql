-- Web chat history storage
CREATE TABLE IF NOT EXISTS web_chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  title VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, id)
);

CREATE TABLE IF NOT EXISTS web_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES web_chat_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_web_chat_conversations_user_id ON web_chat_conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_web_chat_conversations_updated_at ON web_chat_conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_web_chat_messages_conversation_id ON web_chat_messages(conversation_id, created_at);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_web_chat_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE web_chat_conversations SET updated_at = NOW() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_web_chat_conversation_timestamp
  AFTER INSERT ON web_chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION update_web_chat_conversation_timestamp();