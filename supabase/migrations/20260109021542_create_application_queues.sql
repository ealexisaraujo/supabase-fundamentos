-- Create application-specific message queues using pgmq
-- These queues enable background processing for analytics, notifications, etc.

-- Queue for like/unlike analytics events
SELECT pgmq.create('like_events');

-- Queue for user notifications (new likes, comments, follows)
SELECT pgmq.create('notifications');

-- Queue for general analytics processing
SELECT pgmq.create('analytics');

-- Add comments for documentation
COMMENT ON SCHEMA pgmq IS 'PostgreSQL Message Queue - provides background task processing capabilities';
