/**
 * Production Migration Script - Sync Supabase to Upstash Redis
 *
 * Migrates like counters and liked sets from Supabase cloud to Upstash Redis.
 *
 * Usage:
 *   # With .env.prod environment
 *   env $(cat .env.prod | grep -v '^#' | xargs) npx tsx scripts/migrate-counters-to-upstash.ts
 *
 * What it does:
 * 1. Fetches all posts from Supabase and sets like counters in Redis
 * 2. Fetches all ratings from Supabase and builds liked sets in Redis
 * 3. Verifies the migration was successful
 */

import { createClient } from "@supabase/supabase-js";
import { Redis } from "@upstash/redis";

// Load from environment
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

async function main() {
  console.log("\n🚀 Upstash Redis Migration\n");
  console.log("================================\n");

  // Validate configuration
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("❌ Missing Supabase configuration");
    process.exit(1);
  }

  if (!UPSTASH_URL || !UPSTASH_TOKEN) {
    console.error("❌ Missing Upstash configuration");
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

  const { error: pingError } = await supabase
    .from("posts_new")
    .select("id")
    .limit(1);

  if (pingError) {
    console.error("❌ Supabase connection failed:", pingError.message);
    process.exit(1);
  }
  console.log("✅ Supabase connected");

  try {
    await redis.ping();
    console.log("✅ Upstash Redis connected");
  } catch (error) {
    console.error("❌ Upstash connection failed:", error);
    process.exit(1);
  }

  console.log("\n================================\n");

  // Step 1: Fetch all posts
  console.log("📊 Step 1: Fetching posts from Supabase...\n");

  const { data: posts, error: postsError } = await supabase
    .from("posts_new")
    .select("id, likes");

  if (postsError) {
    console.error("❌ Failed to fetch posts:", postsError.message);
    process.exit(1);
  }

  console.log(`   Found ${posts.length} posts\n`);

  // Step 2: Fetch all ratings
  console.log("📊 Step 2: Fetching ratings from Supabase...\n");

  const { data: ratings, error: ratingsError } = await supabase
    .from("post_ratings")
    .select("post_id, session_id");

  if (ratingsError) {
    console.error("❌ Failed to fetch ratings:", ratingsError.message);
    process.exit(1);
  }

  console.log(`   Found ${ratings.length} ratings\n`);

  console.log("================================\n");

  // Step 3: Set like counters in Redis
  console.log("📝 Step 3: Setting like counters in Redis...\n");

  let counterCount = 0;
  for (const post of posts) {
    const key = `post:likes:${post.id}`;
    await redis.set(key, post.likes);
    counterCount++;

    if (counterCount % 10 === 0 || counterCount === posts.length) {
      process.stdout.write(`\r   Progress: ${counterCount}/${posts.length} counters set`);
    }
  }
  console.log("\n   ✅ All counters set\n");

  // Step 4: Build liked sets in Redis
  console.log("📝 Step 4: Building liked sets in Redis...\n");

  // Group ratings by post_id
  const ratingsByPost = new Map<string, string[]>();
  for (const rating of ratings) {
    const existing = ratingsByPost.get(rating.post_id) || [];
    existing.push(rating.session_id);
    ratingsByPost.set(rating.post_id, existing);
  }

  console.log(`   Found ${ratingsByPost.size} posts with likes\n`);

  let setCount = 0;
  for (const [postId, sessionIds] of ratingsByPost) {
    const key = `post:liked:${postId}`;

    // Clear existing set first
    await redis.del(key);

    // Add all session IDs
    if (sessionIds.length > 0) {
      await redis.sadd(key, ...sessionIds);
    }

    setCount++;
    if (setCount % 5 === 0 || setCount === ratingsByPost.size) {
      process.stdout.write(`\r   Progress: ${setCount}/${ratingsByPost.size} liked sets built`);
    }
  }
  console.log("\n   ✅ All liked sets built\n");

  console.log("================================\n");

  // Step 5: Verify migration
  console.log("🔍 Step 5: Verifying migration...\n");

  const likeKeys = await redis.keys("post:likes:*");
  const likedKeys = await redis.keys("post:liked:*");

  console.log(`   Redis like counters: ${likeKeys.length}`);
  console.log(`   Redis liked sets: ${likedKeys.length}`);

  // Verify a few random posts
  const samplePosts = posts.slice(0, 3);
  console.log("\n   Sample verification:");

  for (const post of samplePosts) {
    const redisLikes = await redis.get<number>(`post:likes:${post.id}`);
    const match = redisLikes === post.likes;
    const status = match ? "✅" : "❌";
    console.log(`   ${status} Post ${post.id.slice(0, 8)}... Supabase: ${post.likes}, Redis: ${redisLikes}`);
  }

  console.log("\n================================\n");
  console.log("✅ Migration complete!\n");
  console.log(`   Posts migrated: ${posts.length}`);
  console.log(`   Ratings migrated: ${ratings.length}`);
  console.log(`   Liked sets created: ${ratingsByPost.size}`);
  console.log("");
}

main().catch(console.error);
