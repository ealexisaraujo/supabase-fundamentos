/**
 * Migration Script: Populate LOCAL Redis with existing data from Supabase
 *
 * This script migrates all post like counts and rating data from Supabase
 * to a LOCAL Redis instance (not Upstash).
 *
 * Usage:
 *   npx tsx scripts/migrate-counters-to-redis-local.ts
 *
 * Environment Variables Required:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Prerequisites:
 *   - Redis running locally on port 6379
 *   - npm install ioredis (if not already installed)
 */

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { createClient as createRedisClient } from "redis";

// Load .env.local first, then .env as fallback
config({ path: ".env.local" });
config({ path: ".env" });

// Load environment variables
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

// Validate environment
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("❌ Missing Supabase environment variables:");
  console.error("   - NEXT_PUBLIC_SUPABASE_URL");
  console.error("   - NEXT_PUBLIC_SUPABASE_ANON_KEY");
  process.exit(1);
}

// Initialize clients
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Key generators (same as in counters.ts)
const counterKeys = {
  postLikes: (postId: string) => `post:likes:${postId}`,
  postLiked: (postId: string) => `post:liked:${postId}`,
  sessionLikes: (sessionId: string) => `session:likes:${sessionId}`,
};

async function migrateCountersToRedis() {
  console.log("🚀 Starting counter migration to LOCAL Redis...\n");
  console.log(`   Redis URL: ${REDIS_URL}\n`);

  // Connect to local Redis
  const redis = createRedisClient({ url: REDIS_URL });

  redis.on("error", (err) => {
    console.error("❌ Redis connection error:", err.message);
  });

  try {
    await redis.connect();
    console.log("✅ Connected to Redis\n");

    // Step 1: Migrate post like counts
    console.log("📊 Step 1: Migrating post like counts...");

    const { data: posts, error: postsError } = await supabase
      .from("posts_new")
      .select("id, likes");

    if (postsError) {
      console.error("❌ Failed to fetch posts:", postsError);
      process.exit(1);
    }

    if (!posts || posts.length === 0) {
      console.log("   No posts found in database.");
    } else {
      let migratedPosts = 0;
      for (const post of posts) {
        const key = counterKeys.postLikes(post.id);
        await redis.set(key, String(post.likes ?? 0));
        migratedPosts++;
      }
      console.log(`   ✅ Migrated ${migratedPosts} post counters`);
    }

    // Step 2: Migrate liked sets
    console.log("\n👍 Step 2: Migrating liked sets...");

    const { data: ratings, error: ratingsError } = await supabase
      .from("post_ratings")
      .select("post_id, session_id");

    if (ratingsError) {
      console.error("❌ Failed to fetch ratings:", ratingsError);
      process.exit(1);
    }

    if (!ratings || ratings.length === 0) {
      console.log("   No ratings found in database.");
    } else {
      let migratedRatings = 0;
      for (const rating of ratings) {
        const likedSetKey = counterKeys.postLiked(rating.post_id);
        const sessionLikesKey = counterKeys.sessionLikes(rating.session_id);

        await redis.sAdd(likedSetKey, rating.session_id);
        await redis.sAdd(sessionLikesKey, rating.post_id);
        migratedRatings++;
      }
      console.log(`   ✅ Migrated ${migratedRatings} rating records`);
    }

    // Step 3: Verify migration
    console.log("\n🔍 Step 3: Verifying migration...");

    let verificationPassed = true;
    let verifiedCount = 0;
    const sampleSize = Math.min(posts?.length ?? 0, 5);

    for (let i = 0; i < sampleSize; i++) {
      const post = posts![i];
      const key = counterKeys.postLikes(post.id);
      const redisCount = await redis.get(key);

      if (Number(redisCount) !== post.likes) {
        console.log(`   ❌ Mismatch for post ${post.id}: DB=${post.likes}, Redis=${redisCount}`);
        verificationPassed = false;
      } else {
        verifiedCount++;
      }
    }

    if (verificationPassed && sampleSize > 0) {
      console.log(`   ✅ Verified ${verifiedCount} post counters match`);
    }

    // Step 4: Show sample data
    console.log("\n📋 Step 4: Sample data in Redis...");

    const sampleKeys = await redis.keys("post:likes:*");
    console.log(`   Total post:likes:* keys: ${sampleKeys.length}`);

    if (sampleKeys.length > 0) {
      const sampleKey = sampleKeys[0];
      const sampleValue = await redis.get(sampleKey);
      console.log(`   Sample: ${sampleKey} = ${sampleValue}`);
    }

    const likedKeys = await redis.keys("post:liked:*");
    console.log(`   Total post:liked:* keys: ${likedKeys.length}`);

    const sessionKeys = await redis.keys("session:likes:*");
    console.log(`   Total session:likes:* keys: ${sessionKeys.length}`);

    // Final summary
    console.log("\n" + "=".repeat(50));
    if (verificationPassed) {
      console.log("✅ Migration completed successfully!");
      console.log(`   - Posts migrated: ${posts?.length ?? 0}`);
      console.log(`   - Ratings migrated: ${ratings?.length ?? 0}`);
    } else {
      console.log("⚠️  Migration completed with warnings");
      console.log("   Some counters may need manual verification.");
    }
    console.log("=".repeat(50));

    await redis.quit();

  } catch (error) {
    console.error("\n❌ Migration failed with error:", error);
    process.exit(1);
  }
}

// Run the migration
migrateCountersToRedis();
