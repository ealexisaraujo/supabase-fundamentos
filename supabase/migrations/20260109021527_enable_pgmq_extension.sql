-- Enable pgmq extension for message queues
-- pgmq provides PostgreSQL-native message queues for background task processing

CREATE EXTENSION IF NOT EXISTS pgmq;

-- Grant usage on pgmq schema to service_role for Edge Function access
GRANT USAGE ON SCHEMA pgmq TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA pgmq TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA pgmq TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA pgmq TO service_role;
