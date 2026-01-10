/**
 * Migration Script: Populate Redis with existing data from Supabase
 *
 * This script migrates all post like counts and rating data from Supabase
 * to Redis. Run this once when setting up the Redis counter system.
 *
 * What it does:
 * 1. Fetches all posts from Supabase and sets their like counts in Redis
 * 2. Fetches all ratings and builds the liked sets in Redis
 * 3. Verifies the migration by comparing counts
 *
 * Usage:
 *   npx tsx scripts/migrate-counters-to-redis.ts
 *
 * Environment Variables Required:
 *   - UPSTASH_REDIS_REST_URL
 *   - UPSTASH_REDIS_REST_TOKEN
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

import { Redis } from "@upstash/redis";
import { createClient } from "@supabase/supabase-js";

// Load environment variables
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Validate environment
if (!UPSTASH_REDIS_REST_URL || !UPSTASH_REDIS_REST_TOKEN) {
  console.error("[Error] Missing Redis environment variables:");
  console.error("   - UPSTASH_REDIS_REST_URL");
  console.error("   - UPSTASH_REDIS_REST_TOKEN");
  process.exit(1);
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("[Error] Missing Supabase environment variables:");
  console.error("   - NEXT_PUBLIC_SUPABASE_URL");
  console.error("   - NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

// Initialize clients
const redis = new Redis({
  url: UPSTASH_REDIS_REST_URL,
  token: UPSTASH_REDIS_REST_TOKEN,
});

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Key generators (same as in counters.ts)
const counterKeys = {
  postLikes: (postId: string) => `post:likes:${postId}`,
  postLiked: (postId: string) => `post:liked:${postId}`,
  sessionLikes: (sessionId: string) => `session:likes:${sessionId}`,
};

async function migrateCountersToRedis() {
  console.log("[Migration] Starting counter migration to Redis...\n");

  try {
    // Step 1: Migrate post like counts
    console.log("[Step 1] Migrating post like counts...");

    const { data: posts, error: postsError } = await supabase
      .from("posts_new")
      .select("id, likes");

    if (postsError) {
      console.error("[Error] Failed to fetch posts:", postsError);
      process.exit(1);
    }

    if (!posts || posts.length === 0) {
      console.log("   No posts found in database.");
    } else {
      let migratedPosts = 0;
      for (const post of posts) {
        const key = counterKeys.postLikes(post.id);
        await redis.set(key, post.likes ?? 0);
        migratedPosts++;
      }
      console.log(`   [OK] Migrated ${migratedPosts} post counters`);
    }

    // Step 2: Migrate liked sets
    console.log("\n[Step 2] Migrating liked sets...");

    const { data: ratings, error: ratingsError } = await supabase
      .from("post_ratings")
      .select("post_id, session_id");

    if (ratingsError) {
      console.error("[Error] Failed to fetch ratings:", ratingsError);
      process.exit(1);
    }

    if (!ratings || ratings.length === 0) {
      console.log("   No ratings found in database.");
    } else {
      let migratedRatings = 0;
      for (const rating of ratings) {
        const likedSetKey = counterKeys.postLiked(rating.post_id);
        const sessionLikesKey = counterKeys.sessionLikes(rating.session_id);

        await redis.sadd(likedSetKey, rating.session_id);
        await redis.sadd(sessionLikesKey, rating.post_id);
        migratedRatings++;
      }
      console.log(`   [OK] Migrated ${migratedRatings} rating records`);
    }

    // Step 3: Verify migration
    console.log("\n[Step 3] Verifying migration...");

    let verificationPassed = true;
    let verifiedCount = 0;
    const sampleSize = Math.min(posts?.length ?? 0, 5);

    for (let i = 0; i < sampleSize; i++) {
      const post = posts![i];
      const key = counterKeys.postLikes(post.id);
      const redisCount = await redis.get<number>(key);

      if (redisCount !== post.likes) {
        console.log(`   [Mismatch] Post ${post.id}: DB=${post.likes}, Redis=${redisCount}`);
        verificationPassed = false;
      } else {
        verifiedCount++;
      }
    }

    if (verificationPassed && sampleSize > 0) {
      console.log(`   [OK] Verified ${verifiedCount} post counters match`);
    }

    // Final summary
    console.log("\n" + "=".repeat(50));
    if (verificationPassed) {
      console.log("[Success] Migration completed successfully!");
      console.log(`   - Posts migrated: ${posts?.length ?? 0}`);
      console.log(`   - Ratings migrated: ${ratings?.length ?? 0}`);
    } else {
      console.log("[Warning] Migration completed with warnings");
      console.log("   Some counters may need manual verification.");
    }
    console.log("=".repeat(50));

  } catch (error) {
    console.error("\n[Error] Migration failed:", error);
    process.exit(1);
  }
}

// Run the migration
migrateCountersToRedis();
