# Queues & Background Tasks Architecture

## Executive Summary

This document outlines the next-level architecture for implementing queues and background tasks in Suplatzigram using Supabase's native capabilities. The goal is to improve scalability, reliability, and user experience by offloading work to background processes.

**Status**: Phase 2 In Progress ✅
**Date**: 2026-01-08
**Updated**: 2026-01-09
**Prerequisites**: Like counter bug fix completed (see [LIKE_COUNTER_ARCHITECTURE_FIX.md](./LIKE_COUNTER_ARCHITECTURE_FIX.md))

### Implementation Progress

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Enable pgmq | ✅ Complete | Extension enabled, queues created |
| Phase 2: Enqueue Events | ✅ Complete | `toggle_post_like` enqueues rich metadata |
| Phase 3: Edge Functions | ✅ Complete | `process-like-events` deployed |
| Phase 4: pg_cron | ✅ Complete | Runs every minute |

---

## Current Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT (Next.js)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  HomeFeed   │  │  PostCard   │  │   RankGrid  │          │
│  │ (TanStack Q)│  │ (Optimistic)│  │ (TanStack Q)│          │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘          │
│         │                │                │                  │
│         └────────────────┼────────────────┘                  │
│                          ▼                                   │
│              ┌─────────────────────┐                        │
│              │   Supabase Client   │                        │
│              │   (Real-time Sub)   │                        │
│              └──────────┬──────────┘                        │
└─────────────────────────┼───────────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────────┐
│                    SUPABASE                                  │
│                          ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                   PostgreSQL                             ││
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐           ││
│  │  │posts_new  │  │post_ratings│  │ profiles  │           ││
│  │  │(Realtime) │  │(Realtime) │  │           │           ││
│  │  └───────────┘  └───────────┘  └───────────┘           ││
│  │                                                          ││
│  │  ┌───────────────────────────────────────────┐          ││
│  │  │ toggle_post_like() - RPC Function         │          ││
│  │  │ (Atomic like/unlike operation)            │          ││
│  │  └───────────────────────────────────────────┘          ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                   Redis (Upstash)                        ││
│  │  • Posts cache (60s-5min TTL)                           ││
│  │  • Profiles cache (3min TTL)                            ││
│  └─────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

### Current Limitations

1. **Synchronous Operations**: All operations block the user until complete
2. **No Rate Limiting**: High traffic could overwhelm the database
3. **No Retry Logic**: Failed operations are lost
4. **Limited Analytics**: No background processing for metrics
5. **No Notifications**: No async notification system

---

## Proposed Architecture with Queues

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT (Next.js)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │  HomeFeed   │  │  PostCard   │  │   RankGrid  │          │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘          │
│         │                │                │                  │
│         └────────────────┼────────────────┘                  │
│                          ▼                                   │
│              ┌─────────────────────┐                        │
│              │   Supabase Client   │                        │
│              └──────────┬──────────┘                        │
└─────────────────────────┼───────────────────────────────────┘
                          │
┌─────────────────────────┼───────────────────────────────────┐
│                    SUPABASE                                  │
│                          ▼                                   │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                   PostgreSQL                             ││
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐           ││
│  │  │posts_new  │  │post_ratings│  │ profiles  │           ││
│  │  └───────────┘  └───────────┘  └───────────┘           ││
│  │                                                          ││
│  │  ┌─────────────────────────────────────────────────────┐││
│  │  │                    pgmq Queues                       │││
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │││
│  │  │  │ like_events │  │notifications│  │  analytics  │ │││
│  │  │  │   queue     │  │   queue     │  │   queue     │ │││
│  │  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │││
│  │  └─────────┼────────────────┼────────────────┼─────────┘││
│  └────────────┼────────────────┼────────────────┼──────────┘│
│               │                │                │            │
│               ▼                ▼                ▼            │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                   Edge Functions                         ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐      ││
│  │  │process-likes│  │send-notifs  │  │track-metrics│      ││
│  │  └─────────────┘  └─────────────┘  └─────────────┘      ││
│  └─────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐│
│  │                pg_cron (Scheduler)                       ││
│  │  • Process queues every 10 seconds                      ││
│  │  • Clean up old messages                                ││
│  │  • Generate daily analytics                             ││
│  └─────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Enable pgmq Extension

```sql
-- Enable the pgmq extension
CREATE EXTENSION IF NOT EXISTS pgmq;

-- Verify installation
SELECT * FROM pgmq.list_queues();
```

### Phase 2: Create Application Queues

```sql
-- Queue for like/unlike events (for analytics and notifications)
SELECT pgmq.create('like_events');

-- Queue for notifications (email, push, in-app)
SELECT pgmq.create('notifications');

-- Queue for analytics events (page views, interactions)
SELECT pgmq.create('analytics');

-- Queue for image processing (thumbnails, optimization)
SELECT pgmq.create('image_processing');
```

### Phase 3: Modify Like Operation to Enqueue Events

Update the `toggle_post_like` RPC function to also enqueue events:

```sql
CREATE OR REPLACE FUNCTION toggle_post_like(
  p_post_id UUID,
  p_session_id TEXT
)
RETURNS JSON AS $$
DECLARE
  v_existing_rating_id UUID;
  v_is_liked BOOLEAN;
  v_new_likes NUMERIC;
  v_post_owner_id UUID;
BEGIN
  -- Check if rating exists
  SELECT id INTO v_existing_rating_id
  FROM post_ratings
  WHERE post_id = p_post_id AND session_id = p_session_id;

  -- Get post owner for notification
  SELECT profile_id INTO v_post_owner_id
  FROM posts_new
  WHERE id = p_post_id;

  IF v_existing_rating_id IS NOT NULL THEN
    -- Unlike
    DELETE FROM post_ratings WHERE id = v_existing_rating_id;
    UPDATE posts_new
    SET likes = GREATEST(0, likes - 1), updated_at = now()
    WHERE id = p_post_id
    RETURNING likes INTO v_new_likes;
    v_is_liked := FALSE;
  ELSE
    -- Like
    INSERT INTO post_ratings (post_id, session_id)
    VALUES (p_post_id, p_session_id);
    UPDATE posts_new
    SET likes = likes + 1, updated_at = now()
    WHERE id = p_post_id
    RETURNING likes INTO v_new_likes;
    v_is_liked := TRUE;

    -- Enqueue notification for post owner (only on like, not unlike)
    IF v_post_owner_id IS NOT NULL THEN
      PERFORM pgmq.send('notifications', json_build_object(
        'type', 'new_like',
        'post_id', p_post_id,
        'session_id', p_session_id,
        'recipient_id', v_post_owner_id,
        'timestamp', now()
      )::jsonb);
    END IF;
  END IF;

  -- Enqueue analytics event (for both like and unlike)
  PERFORM pgmq.send('analytics', json_build_object(
    'event', CASE WHEN v_is_liked THEN 'like' ELSE 'unlike' END,
    'post_id', p_post_id,
    'session_id', p_session_id,
    'new_count', v_new_likes,
    'timestamp', now()
  )::jsonb);

  RETURN json_build_object(
    'success', TRUE,
    'isLiked', v_is_liked,
    'newLikeCount', v_new_likes
  );
EXCEPTION WHEN unique_violation THEN
  RETURN json_build_object(
    'success', FALSE,
    'isLiked', TRUE,
    'newLikeCount', 0,
    'error', 'Already liked this post'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Phase 4: Create Edge Functions for Queue Processing

#### 4.1 Process Notifications Edge Function

```typescript
// supabase/functions/process-notifications/index.ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  try {
    // Read messages from the notifications queue
    const { data: messages, error } = await supabase.rpc('pgmq_read', {
      queue_name: 'notifications',
      vt: 30, // 30 second visibility timeout
      qty: 10 // Process 10 at a time
    })

    if (error) throw error
    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    const processed: number[] = []

    for (const msg of messages) {
      const payload = msg.message

      if (payload.type === 'new_like') {
        // Get recipient's notification preferences
        const { data: profile } = await supabase
          .from('profiles')
          .select('email_notifications, push_token')
          .eq('id', payload.recipient_id)
          .single()

        if (profile?.email_notifications) {
          // Send email notification (via Resend, SendGrid, etc.)
          console.log(`Sending email to user ${payload.recipient_id}`)
        }

        if (profile?.push_token) {
          // Send push notification
          console.log(`Sending push to user ${payload.recipient_id}`)
        }
      }

      processed.push(msg.msg_id)
    }

    // Delete processed messages
    if (processed.length > 0) {
      await supabase.rpc('pgmq_delete', {
        queue_name: 'notifications',
        msg_ids: processed
      })
    }

    return new Response(JSON.stringify({ processed: processed.length }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
```

#### 4.2 Process Analytics Edge Function

```typescript
// supabase/functions/process-analytics/index.ts
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
)

Deno.serve(async (req) => {
  try {
    // Read messages from the analytics queue
    const { data: messages, error } = await supabase.rpc('pgmq_read', {
      queue_name: 'analytics',
      vt: 30,
      qty: 100 // Process more for analytics
    })

    if (error) throw error
    if (!messages || messages.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }))
    }

    // Batch insert into analytics table
    const events = messages.map(msg => ({
      event_type: msg.message.event,
      post_id: msg.message.post_id,
      session_id: msg.message.session_id,
      metadata: msg.message,
      created_at: msg.message.timestamp
    }))

    await supabase.from('analytics_events').insert(events)

    // Delete processed messages
    const msgIds = messages.map(m => m.msg_id)
    await supabase.rpc('pgmq_delete', {
      queue_name: 'analytics',
      msg_ids: msgIds
    })

    return new Response(JSON.stringify({ processed: msgIds.length }))
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }
})
```

### Phase 5: Schedule Queue Processing with pg_cron

```sql
-- Enable pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Process notifications every 10 seconds
SELECT cron.schedule(
  'process-notifications',
  '*/10 * * * * *', -- Every 10 seconds (requires pg_cron 1.5+)
  $$
  SELECT net.http_post(
    url := 'https://lszvsnpptqscsuorhmec.supabase.co/functions/v1/process-notifications',
    headers := '{"Authorization": "Bearer ' || current_setting('app.service_role_key') || '"}'::jsonb
  )
  $$
);

-- Process analytics every minute (less time-sensitive)
SELECT cron.schedule(
  'process-analytics',
  '* * * * *', -- Every minute
  $$
  SELECT net.http_post(
    url := 'https://lszvsnpptqscsuorhmec.supabase.co/functions/v1/process-analytics',
    headers := '{"Authorization": "Bearer ' || current_setting('app.service_role_key') || '"}'::jsonb
  )
  $$
);

-- Clean up old archived messages daily
SELECT cron.schedule(
  'cleanup-archived-messages',
  '0 3 * * *', -- 3 AM daily
  $$
  DELETE FROM pgmq.a_like_events WHERE archived_at < now() - interval '30 days';
  DELETE FROM pgmq.a_notifications WHERE archived_at < now() - interval '7 days';
  DELETE FROM pgmq.a_analytics WHERE archived_at < now() - interval '90 days';
  $$
);
```

---

## Use Cases for Background Tasks

### 1. Notifications System

```
User likes post → Enqueue notification → Edge Function sends:
├── In-app notification (stored in DB)
├── Push notification (via FCM/APNs)
└── Email notification (via Resend/SendGrid)
```

### 2. Image Processing

```
User uploads image → Enqueue processing → Edge Function:
├── Generate thumbnail (100x100)
├── Generate medium size (400x400)
├── Optimize original (compress)
└── Extract metadata (EXIF)
```

### 3. Analytics Aggregation

```
User actions → Enqueue events → Edge Function:
├── Batch insert to analytics table
├── Update daily counters
└── Calculate trending posts
```

### 4. Rate Limiting

```
Like action → Check rate limit → If exceeded:
├── Return "Too many requests"
└── Enqueue for delayed processing
```

### 5. Comment Moderation

```
User posts comment → Enqueue moderation → Edge Function:
├── Check for spam (AI/rules)
├── Check for prohibited content
├── Auto-approve or flag for review
└── Notify user of result
```

---

## Database Schema Additions

```sql
-- Analytics events table
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  post_id UUID REFERENCES posts_new(id),
  session_id TEXT,
  profile_id UUID REFERENCES profiles(id),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for analytics queries
CREATE INDEX idx_analytics_event_type ON analytics_events(event_type);
CREATE INDEX idx_analytics_post_id ON analytics_events(post_id);
CREATE INDEX idx_analytics_created_at ON analytics_events(created_at);

-- Notifications table
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID REFERENCES profiles(id) NOT NULL,
  type TEXT NOT NULL, -- 'new_like', 'new_comment', 'new_follower'
  data JSONB NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for unread notifications
CREATE INDEX idx_notifications_unread
  ON notifications(recipient_id, created_at)
  WHERE read_at IS NULL;

-- Add notification preferences to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_notifications BOOLEAN DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_token TEXT;
```

---

## Monitoring & Observability

### Queue Metrics Dashboard Query

```sql
-- Get queue health metrics
SELECT
  queue_name,
  queue_length,
  newest_msg_age_sec,
  oldest_msg_age_sec,
  total_messages,
  scrape_time
FROM pgmq.metrics_all();
```

### Dead Letter Queue Pattern

```sql
-- Create DLQ for failed messages
SELECT pgmq.create('notifications_dlq');

-- In Edge Function, on persistent failure:
-- Move to DLQ after 3 retries
PERFORM pgmq.send('notifications_dlq', msg.message);
PERFORM pgmq.delete('notifications', msg.msg_id);
```

---

## Implementation Checklist

### Phase 1: Foundation
- [x] Enable pgmq extension in Supabase
- [ ] Enable pg_cron extension
- [ ] Enable pg_net extension (for HTTP calls)
- [x] Create base queues (like_events, notifications, analytics)

### Phase 2: Core Features
- [x] Update toggle_post_like to enqueue events with rich metadata:
  - `event_type`: 'like' | 'unlike'
  - `event_value`: +1 | -1
  - `post_id`, `post_owner_id`, `post_caption`
  - `liker_session_id`, `liker_profile_id`
  - `new_like_count`, `timestamp`, `metadata`
- [x] Create process-like-events Edge Function (deployed via Supabase MCP)
- [ ] Create process-notifications Edge Function
- [ ] Create process-analytics Edge Function
- [x] Set up pg_cron schedule (every minute)

### Phase 3: Enhanced Features
- [ ] Add analytics_events table
- [ ] Add notifications table
- [ ] Add notification preferences to profiles
- [ ] Create in-app notification UI

### Phase 4: Advanced
- [ ] Implement image processing queue
- [ ] Add comment moderation queue
- [ ] Implement rate limiting
- [ ] Set up monitoring dashboard

---

## Cost Considerations

| Component | Free Tier | Pro Tier |
|-----------|-----------|----------|
| pgmq | Included | Included |
| pg_cron | Included | Included |
| Edge Functions | 500K invocations/mo | 2M invocations/mo |
| Database Compute | 500MB RAM | Scalable |

---

## Related Documentation

- [LIKE_COUNTER_ARCHITECTURE_FIX.md](./LIKE_COUNTER_ARCHITECTURE_FIX.md) - RPC function implementation
- [CACHING_OPTIMIZATION.md](./CACHING_OPTIMIZATION.md) - Redis caching strategy
- [CLIENT_CACHING_ARCHITECTURE.md](./CLIENT_CACHING_ARCHITECTURE.md) - TanStack Query setup
- [Supabase Queues Docs](https://supabase.com/docs/guides/queues)
- [pgmq Extension](https://supabase.com/docs/guides/queues/pgmq)
