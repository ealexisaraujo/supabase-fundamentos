# Ralph Prompt: Supabase Queues & Background Tasks Implementation

## Overview

Implement a robust queue and background task system for Suplatzigram using Supabase's native capabilities combined with Vercel-compatible solutions. This addresses performance bottlenecks, race conditions, and enables async processing for heavy operations.

---

## Current Architecture Context

Read these files first to understand the existing system:

```
MUST READ:
- CLAUDE.md                          # Project overview, tech stack, caching layers
- app/utils/supabase/server.ts       # Server-side Supabase client
- app/utils/client.ts                # Browser Supabase client
- app/utils/ratings.ts               # Real-time likes (potential race conditions)
- app/utils/cached-posts.ts          # Post caching with Redis
- app/utils/redis/                   # Upstash Redis integration
- app/providers/AuthProvider.tsx     # Auth state with onAuthStateChange
- supabase/migrations/               # Current database schema
```

### Current Stack
| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | Next.js 16 (App Router) | React 19 Server/Client Components |
| Backend | Supabase | Database, Auth, Storage, Realtime |
| Caching | Upstash Redis + unstable_cache | Three-layer caching |
| Client State | TanStack Query | Client-side caching |
| Hosting | Vercel | Serverless functions (10s/60s limits) |

### Known Issues to Investigate

Before implementing, diagnose these potential problems:

1. **Race Conditions in Likes/Ratings**
   - Multiple users liking simultaneously may cause count drift
   - Check `app/utils/ratings.ts` for optimistic updates without proper locking

2. **Realtime Subscription Memory Leaks**
   - Check if subscriptions are properly cleaned up
   - Look for missing `channel.unsubscribe()` in useEffect cleanup

3. **Cache Invalidation Timing**
   - Redis cache may serve stale data during high-frequency updates
   - Check `app/actions/revalidate-posts.ts` for race conditions

4. **Comment Count Flashing**
   - CLAUDE.md mentions this was "fixed" but verify implementation
   - Check `initialCommentCount` prop flow in PostCard → CommentsSection

---

## Phase 1: Diagnostic Investigation

Before building anything, investigate the current state:

### 1.1 Identify Existing Issues

```bash
# Search for potential race conditions
grep -r "update\|increment\|decrement" app/utils/
grep -r "optimistic" app/

# Check realtime subscription cleanup
grep -r "unsubscribe\|cleanup\|useEffect.*return" app/

# Find console errors in rating system
grep -r "console.error" app/utils/ratings.ts
```

### 1.2 Check Database Constraints

```sql
-- Run these in Supabase SQL Editor to check for issues:

-- Check for duplicate ratings (race condition evidence)
SELECT post_id, session_id, COUNT(*) as count
FROM post_ratings
GROUP BY post_id, session_id
HAVING COUNT(*) > 1;

-- Check for like count drift (post.likes vs actual ratings)
SELECT 
  p.id,
  p.likes as stored_likes,
  COUNT(pr.id) as actual_ratings,
  p.likes - COUNT(pr.id) as drift
FROM posts_new p
LEFT JOIN post_ratings pr ON p.id = pr.post_id
GROUP BY p.id, p.likes
HAVING p.likes != COUNT(pr.id);

-- Check for orphaned data
SELECT * FROM post_ratings WHERE post_id NOT IN (SELECT id FROM posts_new);
SELECT * FROM comments WHERE post_id NOT IN (SELECT id FROM posts_new);
```

### 1.3 Document Findings

Create a file `DIAGNOSTIC_FINDINGS.md` with:
- List of identified issues
- Evidence (queries, code snippets)
- Severity (critical/high/medium/low)
- Proposed fix approach

---

## Phase 2: Database-Level Queue Tables

### 2.1 Create Queue Infrastructure

Create migration: `supabase/migrations/YYYYMMDD_add_queue_tables.sql`

```sql
-- ============================================
-- BACKGROUND JOBS QUEUE TABLE
-- ============================================

-- Job status enum
CREATE TYPE job_status AS ENUM (
  'pending',
  'processing', 
  'completed',
  'failed',
  'dead'  -- Failed too many times
);

-- Job type enum (extend as needed)
CREATE TYPE job_type AS ENUM (
  'process_image',
  'send_notification',
  'sync_like_count',
  'generate_thumbnail',
  'cleanup_expired',
  'recompute_rankings'
);

-- Main jobs table
CREATE TABLE IF NOT EXISTS background_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type job_type NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status job_status NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 0,  -- Higher = more urgent
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  scheduled_for TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- For idempotency (prevent duplicate jobs)
  idempotency_key TEXT UNIQUE
);

-- Indexes for efficient queue operations
CREATE INDEX idx_jobs_pending ON background_jobs(status, priority DESC, scheduled_for)
  WHERE status = 'pending';
CREATE INDEX idx_jobs_scheduled ON background_jobs(scheduled_for)
  WHERE status = 'pending';
CREATE INDEX idx_jobs_type ON background_jobs(job_type, status);
CREATE INDEX idx_jobs_created ON background_jobs(created_at DESC);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER jobs_updated_at
  BEFORE UPDATE ON background_jobs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================
-- JOB HISTORY TABLE (for completed/failed jobs)
-- ============================================

CREATE TABLE IF NOT EXISTS job_history (
  id UUID PRIMARY KEY,
  job_type job_type NOT NULL,
  payload JSONB NOT NULL,
  status job_status NOT NULL,
  attempts INTEGER NOT NULL,
  error_message TEXT,
  result JSONB,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_history_type ON job_history(job_type, completed_at DESC);

-- ============================================
-- ATOMIC LIKE COUNT SYNC (fixes race conditions)
-- ============================================

-- Function to atomically sync like counts
CREATE OR REPLACE FUNCTION sync_post_like_count(target_post_id UUID)
RETURNS INTEGER AS $$
DECLARE
  actual_count INTEGER;
BEGIN
  -- Get actual count from ratings table
  SELECT COUNT(*) INTO actual_count
  FROM post_ratings
  WHERE post_id = target_post_id;
  
  -- Atomically update post
  UPDATE posts_new
  SET likes = actual_count, updated_at = NOW()
  WHERE id = target_post_id;
  
  RETURN actual_count;
END;
$$ LANGUAGE plpgsql;

-- Trigger to queue like sync after rating changes
CREATE OR REPLACE FUNCTION queue_like_sync()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert job with idempotency key to prevent duplicates
  INSERT INTO background_jobs (
    job_type,
    payload,
    priority,
    idempotency_key,
    scheduled_for
  ) VALUES (
    'sync_like_count',
    jsonb_build_object('post_id', COALESCE(NEW.post_id, OLD.post_id)),
    5,  -- Medium-high priority
    'sync_likes_' || COALESCE(NEW.post_id, OLD.post_id)::text || '_' || 
      date_trunc('second', NOW())::text,
    NOW() + INTERVAL '2 seconds'  -- Debounce: wait 2s for more changes
  )
  ON CONFLICT (idempotency_key) DO NOTHING;  -- Deduplicate
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rating_change_queue_sync
  AFTER INSERT OR DELETE ON post_ratings
  FOR EACH ROW
  EXECUTE FUNCTION queue_like_sync();

-- ============================================
-- RLS POLICIES
-- ============================================

ALTER TABLE background_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_history ENABLE ROW LEVEL SECURITY;

-- Only service role can access jobs (not exposed to clients)
CREATE POLICY "Service role only" ON background_jobs
  FOR ALL TO service_role USING (true);

CREATE POLICY "Service role only" ON job_history
  FOR ALL TO service_role USING (true);
```

### 2.2 Create Job Claim Function (Prevents Double Processing)

```sql
-- Atomic job claim with row locking
CREATE OR REPLACE FUNCTION claim_next_job(
  worker_id TEXT,
  job_types job_type[] DEFAULT NULL
)
RETURNS background_jobs AS $$
DECLARE
  claimed_job background_jobs;
BEGIN
  -- Select and lock a pending job atomically
  SELECT * INTO claimed_job
  FROM background_jobs
  WHERE status = 'pending'
    AND scheduled_for <= NOW()
    AND (job_types IS NULL OR job_type = ANY(job_types))
  ORDER BY priority DESC, scheduled_for ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;  -- Skip jobs being claimed by other workers
  
  IF claimed_job.id IS NOT NULL THEN
    -- Mark as processing
    UPDATE background_jobs
    SET 
      status = 'processing',
      started_at = NOW(),
      attempts = attempts + 1
    WHERE id = claimed_job.id;
    
    -- Return the updated job
    SELECT * INTO claimed_job FROM background_jobs WHERE id = claimed_job.id;
  END IF;
  
  RETURN claimed_job;
END;
$$ LANGUAGE plpgsql;

-- Mark job as completed
CREATE OR REPLACE FUNCTION complete_job(
  job_id UUID,
  job_result JSONB DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  job_record background_jobs;
BEGIN
  SELECT * INTO job_record FROM background_jobs WHERE id = job_id;
  
  -- Move to history
  INSERT INTO job_history (id, job_type, payload, status, attempts, result, duration_ms, created_at)
  VALUES (
    job_record.id,
    job_record.job_type,
    job_record.payload,
    'completed',
    job_record.attempts,
    job_result,
    EXTRACT(EPOCH FROM (NOW() - job_record.started_at)) * 1000,
    job_record.created_at
  );
  
  -- Remove from active queue
  DELETE FROM background_jobs WHERE id = job_id;
END;
$$ LANGUAGE plpgsql;

-- Mark job as failed (with retry logic)
CREATE OR REPLACE FUNCTION fail_job(
  job_id UUID,
  error_msg TEXT
)
RETURNS VOID AS $$
DECLARE
  job_record background_jobs;
BEGIN
  SELECT * INTO job_record FROM background_jobs WHERE id = job_id;
  
  IF job_record.attempts >= job_record.max_attempts THEN
    -- Move to history as dead
    INSERT INTO job_history (id, job_type, payload, status, attempts, error_message, duration_ms, created_at)
    VALUES (
      job_record.id,
      job_record.job_type,
      job_record.payload,
      'dead',
      job_record.attempts,
      error_msg,
      EXTRACT(EPOCH FROM (NOW() - job_record.started_at)) * 1000,
      job_record.created_at
    );
    
    DELETE FROM background_jobs WHERE id = job_id;
  ELSE
    -- Retry with exponential backoff
    UPDATE background_jobs
    SET 
      status = 'pending',
      failed_at = NOW(),
      error_message = error_msg,
      scheduled_for = NOW() + (INTERVAL '1 second' * POWER(2, attempts))
    WHERE id = job_id;
  END IF;
END;
$$ LANGUAGE plpgsql;
```

---

## Phase 3: Queue Client Utilities

### 3.1 Create Queue Client

Create `app/utils/queue/client.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";

// Use service role for queue operations (not exposed to browser)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Server-only!
  { auth: { persistSession: false } }
);

export type JobType = 
  | 'process_image'
  | 'send_notification'
  | 'sync_like_count'
  | 'generate_thumbnail'
  | 'cleanup_expired'
  | 'recompute_rankings';

export interface JobPayload {
  process_image: { postId: string; imageUrl: string };
  send_notification: { userId: string; title: string; body: string };
  sync_like_count: { postId: string };
  generate_thumbnail: { imageUrl: string; sizes: number[] };
  cleanup_expired: { olderThanDays: number };
  recompute_rankings: { limit?: number };
}

export interface EnqueueOptions {
  priority?: number;        // 0-10, higher = more urgent
  scheduledFor?: Date;      // When to run
  idempotencyKey?: string;  // Prevent duplicates
  maxAttempts?: number;     // Default: 3
}

// Enqueue a job
export async function enqueueJob<T extends JobType>(
  jobType: T,
  payload: JobPayload[T],
  options: EnqueueOptions = {}
) {
  const { priority = 0, scheduledFor, idempotencyKey, maxAttempts = 3 } = options;
  
  const { data, error } = await supabaseAdmin
    .from('background_jobs')
    .insert({
      job_type: jobType,
      payload,
      priority,
      scheduled_for: scheduledFor?.toISOString() ?? new Date().toISOString(),
      idempotency_key: idempotencyKey,
      max_attempts: maxAttempts,
    })
    .select()
    .single();
  
  if (error) {
    // Handle duplicate key gracefully
    if (error.code === '23505') {
      console.log(`[Queue] Duplicate job skipped: ${idempotencyKey}`);
      return null;
    }
    console.error('[Queue] Failed to enqueue job:', error);
    throw error;
  }
  
  console.log(`[Queue] Enqueued ${jobType} job: ${data.id}`);
  return data;
}

// Get queue stats
export async function getQueueStats() {
  const { data, error } = await supabaseAdmin
    .from('background_jobs')
    .select('status, job_type')
    .then(({ data }) => {
      if (!data) return { pending: 0, processing: 0, failed: 0, byType: {} };
      
      const stats = {
        pending: data.filter(j => j.status === 'pending').length,
        processing: data.filter(j => j.status === 'processing').length,
        failed: data.filter(j => j.status === 'failed').length,
        byType: {} as Record<string, number>,
      };
      
      data.forEach(j => {
        stats.byType[j.job_type] = (stats.byType[j.job_type] || 0) + 1;
      });
      
      return stats;
    });
  
  return data;
}
```

### 3.2 Create Job Processor

Create `app/utils/queue/processor.ts`:

```typescript
import { createClient } from "@supabase/supabase-js";
import type { JobPayload, JobType } from "./client";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// Job handlers registry
const handlers: Record<JobType, (payload: any) => Promise<any>> = {
  sync_like_count: async (payload: JobPayload['sync_like_count']) => {
    const { data, error } = await supabaseAdmin
      .rpc('sync_post_like_count', { target_post_id: payload.postId });
    
    if (error) throw error;
    return { syncedCount: data };
  },
  
  process_image: async (payload: JobPayload['process_image']) => {
    // Placeholder: Add image processing logic
    // Could resize, optimize, generate thumbnails
    console.log(`[Job] Processing image for post ${payload.postId}`);
    return { processed: true };
  },
  
  send_notification: async (payload: JobPayload['send_notification']) => {
    // Placeholder: Add notification logic (push, email, etc.)
    console.log(`[Job] Sending notification to ${payload.userId}`);
    return { sent: true };
  },
  
  generate_thumbnail: async (payload: JobPayload['generate_thumbnail']) => {
    // Placeholder: Generate thumbnails at different sizes
    console.log(`[Job] Generating thumbnails: ${payload.sizes.join(', ')}px`);
    return { sizes: payload.sizes };
  },
  
  cleanup_expired: async (payload: JobPayload['cleanup_expired']) => {
    // Placeholder: Clean up old data
    console.log(`[Job] Cleaning up data older than ${payload.olderThanDays} days`);
    return { cleaned: true };
  },
  
  recompute_rankings: async (payload: JobPayload['recompute_rankings']) => {
    // Placeholder: Recompute post rankings
    console.log(`[Job] Recomputing rankings`);
    return { computed: true };
  },
};

// Process a single job
export async function processJob(job: {
  id: string;
  job_type: JobType;
  payload: any;
}) {
  const handler = handlers[job.job_type];
  
  if (!handler) {
    throw new Error(`Unknown job type: ${job.job_type}`);
  }
  
  try {
    const result = await handler(job.payload);
    
    // Mark as completed
    await supabaseAdmin.rpc('complete_job', {
      job_id: job.id,
      job_result: result,
    });
    
    console.log(`[Queue] Completed job ${job.id}`);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Mark as failed (will retry or move to dead)
    await supabaseAdmin.rpc('fail_job', {
      job_id: job.id,
      error_msg: errorMessage,
    });
    
    console.error(`[Queue] Failed job ${job.id}:`, errorMessage);
    throw error;
  }
}

// Claim and process next job
export async function claimAndProcessNext(
  workerId: string,
  jobTypes?: JobType[]
) {
  const { data: job, error } = await supabaseAdmin
    .rpc('claim_next_job', {
      worker_id: workerId,
      job_types: jobTypes,
    });
  
  if (error) {
    console.error('[Queue] Failed to claim job:', error);
    return null;
  }
  
  if (!job?.id) {
    return null; // No jobs available
  }
  
  return processJob(job);
}
```

---

## Phase 4: Worker API Routes

### 4.1 Create Worker Endpoint

Create `app/api/queue/process/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { claimAndProcessNext } from '@/app/utils/queue/processor';

// Verify request is from authorized source
function verifyRequest(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  // Allow Vercel Cron or manual trigger with secret
  if (authHeader === `Bearer ${cronSecret}`) {
    return true;
  }
  
  // Allow from localhost in development
  if (process.env.NODE_ENV === 'development') {
    return true;
  }
  
  return false;
}

export async function POST(request: NextRequest) {
  if (!verifyRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const workerId = `worker-${Date.now()}`;
  const maxJobs = 10; // Process up to 10 jobs per invocation
  const results = [];
  
  try {
    for (let i = 0; i < maxJobs; i++) {
      const result = await claimAndProcessNext(workerId);
      
      if (result === null) {
        break; // No more jobs
      }
      
      results.push(result);
    }
    
    return NextResponse.json({
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error('[Worker] Error processing jobs:', error);
    return NextResponse.json(
      { error: 'Processing failed', processed: results.length },
      { status: 500 }
    );
  }
}

// Also support GET for Vercel Cron
export async function GET(request: NextRequest) {
  return POST(request);
}
```

### 4.2 Configure Vercel Cron

Create/update `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/queue/process",
      "schedule": "* * * * *"
    }
  ]
}
```

Add to `.env`:

```bash
CRON_SECRET=your-secure-random-string-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

---

## Phase 5: Integration with Existing Code

### 5.1 Fix Race Conditions in Ratings

Update `app/utils/ratings.ts`:

```typescript
// BEFORE: Direct increment (race condition prone)
// await supabase.rpc('increment_likes', { post_id: postId });

// AFTER: Insert rating, let trigger queue the sync
export async function toggleLike(postId: string, sessionId: string) {
  const supabase = getSupabaseClient();
  
  // Check if already liked
  const { data: existing } = await supabase
    .from('post_ratings')
    .select('id')
    .eq('post_id', postId)
    .eq('session_id', sessionId)
    .single();
  
  if (existing) {
    // Remove like - trigger will queue sync_like_count job
    await supabase
      .from('post_ratings')
      .delete()
      .eq('id', existing.id);
    
    return { liked: false };
  } else {
    // Add like - trigger will queue sync_like_count job
    await supabase
      .from('post_ratings')
      .insert({ post_id: postId, session_id: sessionId });
    
    return { liked: true };
  }
}
```

### 5.2 Add Image Processing Queue

Update `app/utils/posts.ts`:

```typescript
import { enqueueJob } from './queue/client';

export async function createPost(/* ... */) {
  // ... existing post creation code ...
  
  // Queue background image processing
  await enqueueJob('process_image', {
    postId: post.id,
    imageUrl: post.image_url,
  }, {
    priority: 3,
    idempotencyKey: `process_image_${post.id}`,
  });
  
  return post;
}
```

---

## Phase 6: Monitoring & Observability

### 6.1 Create Admin Dashboard API

Create `app/api/admin/queue/stats/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getQueueStats } from '@/app/utils/queue/client';

export async function GET(request: NextRequest) {
  // Add auth check for admin users
  
  const stats = await getQueueStats();
  
  return NextResponse.json(stats);
}
```

### 6.2 Add Queue Health Check

Create `app/api/health/queue/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  const { data: stuckJobs } = await supabase
    .from('background_jobs')
    .select('id')
    .eq('status', 'processing')
    .lt('started_at', new Date(Date.now() - 5 * 60 * 1000).toISOString()); // 5 min timeout
  
  const { data: pendingCount } = await supabase
    .from('background_jobs')
    .select('id', { count: 'exact' })
    .eq('status', 'pending');
  
  const healthy = (stuckJobs?.length ?? 0) === 0;
  
  return NextResponse.json({
    healthy,
    stuckJobs: stuckJobs?.length ?? 0,
    pendingJobs: pendingCount?.length ?? 0,
  }, {
    status: healthy ? 200 : 503,
  });
}
```

---

## Phase 7: Testing & Verification

### 7.1 Create Queue Tests

Create `tests/queue.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { enqueueJob, getQueueStats } from '@/app/utils/queue/client';

describe('Background Queue', () => {
  it('enqueues a job successfully', async () => {
    const job = await enqueueJob('sync_like_count', {
      postId: 'test-post-123',
    });
    
    expect(job).toBeDefined();
    expect(job?.job_type).toBe('sync_like_count');
    expect(job?.status).toBe('pending');
  });
  
  it('deduplicates jobs with same idempotency key', async () => {
    const key = `test-dedup-${Date.now()}`;
    
    const job1 = await enqueueJob('sync_like_count', { postId: 'test-1' }, {
      idempotencyKey: key,
    });
    
    const job2 = await enqueueJob('sync_like_count', { postId: 'test-1' }, {
      idempotencyKey: key,
    });
    
    expect(job1).toBeDefined();
    expect(job2).toBeNull(); // Duplicate should be skipped
  });
  
  it('respects priority ordering', async () => {
    // Test that higher priority jobs are claimed first
    // Implementation depends on your test setup
  });
});
```

### 7.2 Manual Testing Checklist

```markdown
## Queue System Testing Checklist

### Database Setup
- [ ] Migration applied successfully
- [ ] background_jobs table created
- [ ] job_history table created
- [ ] All functions created (claim_next_job, complete_job, fail_job)
- [ ] RLS policies active

### Job Enqueueing
- [ ] Can enqueue sync_like_count job
- [ ] Can enqueue process_image job
- [ ] Idempotency key prevents duplicates
- [ ] Priority is respected
- [ ] Scheduled jobs respect scheduled_for

### Job Processing
- [ ] Worker endpoint processes jobs
- [ ] Jobs move from pending → processing → completed
- [ ] Failed jobs retry with exponential backoff
- [ ] Dead jobs (max attempts exceeded) move to history
- [ ] No duplicate processing (SKIP LOCKED working)

### Like Count Sync
- [ ] Like creates rating record
- [ ] Trigger queues sync_like_count job
- [ ] Job correctly syncs posts_new.likes count
- [ ] Rapid likes don't cause race conditions
- [ ] Unlike works correctly

### Cron Job
- [ ] Vercel cron triggers /api/queue/process
- [ ] Worker processes pending jobs
- [ ] No jobs left stuck in processing state

### Monitoring
- [ ] /api/admin/queue/stats returns correct counts
- [ ] /api/health/queue returns healthy status
- [ ] Stuck jobs are detected
```

---

## Phase 8: Documentation

Update `CLAUDE.md` with:

```markdown
### Queue & Background Tasks

The app uses a database-backed job queue for async processing:

**Components:**
- `background_jobs` table - Active job queue with priority and scheduling
- `job_history` table - Completed/failed job archive
- `app/utils/queue/client.ts` - Enqueue jobs
- `app/utils/queue/processor.ts` - Job handlers
- `app/api/queue/process/route.ts` - Worker endpoint (Vercel Cron)

**Job Types:**
| Type | Purpose | Priority |
|------|---------|----------|
| sync_like_count | Fix race conditions in likes | 5 |
| process_image | Resize/optimize uploaded images | 3 |
| send_notification | Push/email notifications | 2 |
| generate_thumbnail | Create image thumbnails | 1 |
| cleanup_expired | Remove old data | 0 |
| recompute_rankings | Recalculate post rankings | 0 |

**How it works:**
1. Action triggers `enqueueJob()` (e.g., like button)
2. Job inserted into `background_jobs` with status=pending
3. Vercel Cron calls `/api/queue/process` every minute
4. Worker claims job with `FOR UPDATE SKIP LOCKED`
5. Job handler executes, job moves to history

**Monitoring:**
- `GET /api/admin/queue/stats` - Queue statistics
- `GET /api/health/queue` - Health check
```

---

## Success Criteria

1. **No Race Conditions**: Like counts always match actual ratings
2. **No Data Loss**: All jobs eventually complete or fail gracefully
3. **Observability**: Can monitor queue health and stuck jobs
4. **Reliability**: Exponential backoff for failed jobs
5. **Performance**: Jobs don't block user requests
6. **Tests Pass**: All existing + new tests pass
7. **Documentation**: CLAUDE.md updated

---

## Constraints

- DO NOT expose service role key to browser
- DO NOT process jobs in user request path (async only)
- DO NOT skip idempotency keys for state-changing operations
- PRESERVE all existing functionality
- ENSURE Vercel 10s timeout is respected (process in batches)

---

## Completion Promise

When all phases are complete and verified:
- All tests pass (`npm run test:run`)
- Manual testing checklist complete
- No console errors in development
- Queue processing confirmed via logs
- Like race conditions eliminated (verified via SQL)

Output: <promise>QUEUE_SYSTEM_COMPLETE</promise>

---

## Ralph Loop Command

```bash
/ralph-loop "Implement a robust queue and background task system for Suplatzigram.

GOALS:
1. Create database-backed job queue with retry logic
2. Fix race conditions in like/rating system
3. Enable async image processing
4. Add monitoring and health checks
5. Integrate with Vercel Cron for job processing

READ FIRST:
- QUEUES_BACKGROUND_TASKS_RALPH_PROMPT.md (this file)
- CLAUDE.md (project context)
- app/utils/ratings.ts (current like system - find race conditions)
- supabase/migrations/ (current schema)

PHASES:
1. DIAGNOSTIC: Investigate existing issues, document findings
2. DATABASE: Create queue tables and atomic functions
3. CLIENT: Build TypeScript queue utilities
4. PROCESSOR: Implement job handlers
5. API: Create worker endpoint for Vercel Cron
6. INTEGRATION: Connect rating system to queue
7. MONITORING: Add health checks and stats
8. TESTING: Write tests, verify with manual checks
9. DOCUMENTATION: Update CLAUDE.md

VERIFICATION after each phase:
- npm run test:run
- npm run dev (check for console errors)
- Check Supabase logs for SQL errors
- Test like/unlike with multiple rapid clicks

CRITICAL:
- Never expose SUPABASE_SERVICE_ROLE_KEY to browser
- All job processing must be async (not in request path)
- Use idempotency keys to prevent duplicate jobs
- Respect Vercel's 10s function timeout

Output <promise>QUEUE_SYSTEM_COMPLETE</promise> when all verified." --completion-promise "QUEUE_SYSTEM_COMPLETE" --max-iterations 60
```

---

## Quick Reference: Copy-Paste Commands

### Start the Ralph Loop
```bash
/ralph-loop "Implement queue system following QUEUES_BACKGROUND_TASKS_RALPH_PROMPT.md. Start with Phase 1 diagnostic investigation. Output <promise>QUEUE_SYSTEM_COMPLETE</promise> when done." --completion-promise "QUEUE_SYSTEM_COMPLETE" --max-iterations 60
```

### Cancel if Stuck
```bash
/cancel-ralph
```
