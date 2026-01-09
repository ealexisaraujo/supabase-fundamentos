/**
 * Production Sync Verification Script
 *
 * Compares data between Upstash Redis and Supabase cloud production
 *
 * Usage:
 *   npx tsx scripts/verify-production-sync.ts
 *
 * Requires .env.prod to be copied to .env or environment variables set
 */

import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";

// Load from environment (use .env.prod values)
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function main() {
  console.log("\n🔍 Production Sync Verification\n");
  console.log("================================\n");

  // Validate configuration
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("❌ Missing Supabase configuration");
    console.log("   NEXT_PUBLIC_SUPABASE_URL:", SUPABASE_URL ? "✓" : "✗");
    console.log("   NEXT_PUBLIC_SUPABASE_ANON_KEY:", SUPABASE_ANON_KEY ? "✓" : "✗");
    process.exit(1);
  }

  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    console.error("❌ Missing Upstash configuration");
    console.log("   UPSTASH_REDIS_REST_URL:", UPSTASH_URL ? "✓" : "✗");
    console.log("   UPSTASH_REDIS_REST_TOKEN:", UPSTASH_TOKEN ? "✓" : "✗");
    process.exit(1);
  }

  console.log("📡 Supabase URL:", SUPABASE_URL);
  console.log("📡 Upstash URL:", UPSTASH_URL);
  console.log("");

  // Initialize clients
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const redis = new Redis({
    url: UPSTASH_URL,
    token: UPSTASH_TOKEN,
  });

  // Test connections
  console.log("🔗 Testing connections...\n");

  // Test Supabase
  const { data: pingData, error: pingError } = await supabase
    .from("posts_new")
    .select("id")
    .limit(1);

  if (pingError) {
    console.error("❌ Supabase connection failed:", pingError.message);
    process.exit(1);
  }
  console.log("✅ Supabase connected");

  // Test Redis
  try {
    const pong = await redis.ping();
    console.log("✅ Upstash Redis connected:", pong);
  } catch (error) {
    console.error("❌ Upstash connection failed:", error);
    process.exit(1);
  }

  console.log("\n================================\n");

  // Fetch Supabase posts
  console.log("📊 Fetching Supabase posts...\n");

  const { data: posts, error: postsError } = await supabase
    .from("posts_new")
    .select("id, likes, caption")
    .order("created_at", { ascending: false });

  if (postsError) {
    console.error("❌ Failed to fetch posts:", postsError.message);
    process.exit(1);
  }

  console.log(`   Found ${posts.length} posts in Supabase\n`);

  // Fetch Redis keys
  console.log("📊 Fetching Redis keys...\n");

  const likeKeys = await redis.keys("post:likes:*");
  const likedKeys = await redis.keys("post:liked:*");

  console.log(`   Found ${likeKeys.length} like counter keys in Redis`);
  console.log(`   Found ${likedKeys.length} liked set keys in Redis\n`);

  // Fetch ratings from Supabase
  const { data: ratings, error: ratingsError } = await supabase
    .from("post_ratings")
    .select("id, post_id, session_id");

  if (ratingsError) {
    console.error("❌ Failed to fetch ratings:", ratingsError.message);
  } else {
    console.log(`   Found ${ratings.length} ratings in Supabase\n`);
  }

  console.log("================================\n");

  // Compare data for each post
  console.log("🔄 Comparing data (first 10 posts)...\n");

  const postsToCheck = posts.slice(0, 10);
  const discrepancies: Array<{
    postId: string;
    supabaseLikes: number;
    redisLikes: number | null;
  }> = [];

  for (const post of postsToCheck) {
    const redisKey = `post:likes:${post.id}`;
    const redisLikes = await redis.get<number>(redisKey);

    const match = redisLikes === post.likes;
    const status = match ? "✅" : "⚠️";

    console.log(`${status} Post ${post.id.slice(0, 8)}...`);
    console.log(`   Caption: ${post.caption?.slice(0, 40)}...`);
    console.log(`   Supabase likes: ${post.likes}`);
    console.log(`   Redis likes: ${redisLikes ?? "null (not set)"}`);

    if (!match) {
      discrepancies.push({
        postId: post.id,
        supabaseLikes: post.likes,
        redisLikes: redisLikes,
      });
    }
    console.log("");
  }

  console.log("================================\n");

  // Summary
  console.log("📋 Summary\n");
  console.log(`   Supabase posts: ${posts.length}`);
  console.log(`   Redis like counters: ${likeKeys.length}`);
  console.log(`   Redis liked sets: ${likedKeys.length}`);
  console.log(`   Supabase ratings: ${ratings?.length ?? "N/A"}`);
  console.log(`   Discrepancies found: ${discrepancies.length}`);

  if (discrepancies.length > 0) {
    console.log("\n⚠️  Discrepancies detected:");
    for (const d of discrepancies) {
      console.log(`   - ${d.postId}: Supabase=${d.supabaseLikes}, Redis=${d.redisLikes}`);
    }
    console.log("\n   Run migration script to sync Redis with Supabase.");
  } else {
    console.log("\n✅ All checked posts are in sync!");
  }

  console.log("");
}

main().catch(console.error);
