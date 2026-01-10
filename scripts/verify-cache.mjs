#!/usr/bin/env node
/**
 * Cache Verification Script
 *
 * Verifies Redis cache consistency with Supabase and can force invalidation.
 *
 * Usage:
 *   node scripts/verify-cache.mjs              # Check cache health
 *   node scripts/verify-cache.mjs --invalidate # Force invalidate all caches
 *   node scripts/verify-cache.mjs --env prod   # Use production environment
 *
 * Environment:
 *   Uses .env by default, or .env.prod with --env prod
 */

import { Redis } from "@upstash/redis";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Parse arguments
const args = process.argv.slice(2);
const shouldInvalidate = args.includes("--invalidate");
const envFile = args.includes("--env")
  ? `.env.${args[args.indexOf("--env") + 1]}`
  : ".env";

// Load environment variables
function loadEnv(filename) {
  try {
    const envPath = resolve(__dirname, "..", filename);
    const content = readFileSync(envPath, "utf-8");
    const vars = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        let value = valueParts.join("=").trim();
        // Remove quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        vars[key.trim()] = value;
      }
    }
    return vars;
  } catch (e) {
    console.error(`Failed to load ${filename}:`, e.message);
    process.exit(1);
  }
}

const env = loadEnv(envFile);
console.log(`\n=== Cache Verification (${envFile}) ===\n`);

const RANK_MIN_LIKES = 5;

// Initialize clients
const redis = new Redis({
  url: env.UPSTASH_REDIS_REST_URL,
  token: env.UPSTASH_REDIS_REST_TOKEN,
});

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkRedisConnection() {
  try {
    await redis.ping();
    console.log("[OK] Redis connection successful");
    return true;
  } catch (e) {
    console.error("[FAIL] Redis connection failed:", e.message);
    return false;
  }
}

async function getSupabaseRankedPosts() {
  const { data, error } = await supabase
    .from("posts_new")
    .select("id, likes, caption")
    .gt("likes", RANK_MIN_LIKES)
    .order("likes", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[FAIL] Supabase query failed:", error.message);
    return null;
  }

  console.log(`[OK] Supabase: ${data.length} posts with >${RANK_MIN_LIKES} likes`);
  return data;
}

async function getCachedRankedPosts() {
  const cached = await redis.get("posts:ranked");
  if (cached === null) {
    console.log("[WARN] Redis: No cached ranked posts (null)");
    return null;
  }
  if (Array.isArray(cached)) {
    console.log(`[OK] Redis: ${cached.length} cached ranked posts`);
    return cached;
  }
  console.log("[WARN] Redis: Unexpected cache format", typeof cached);
  return null;
}

async function getCachedHomePosts() {
  // Check all pages (0, 1, 2, etc.)
  const pages = [];
  let page = 0;
  let totalPosts = 0;

  while (page < 10) { // Max 10 pages to check
    const cached = await redis.get(`posts:home:${page}:10`);
    if (cached === null) {
      break; // No more cached pages
    }
    if (Array.isArray(cached)) {
      pages.push({ page, count: cached.length });
      totalPosts += cached.length;
    }
    page++;
  }

  if (pages.length === 0) {
    console.log("[WARN] Redis: No cached home posts (null)");
    return null;
  }

  console.log(`[OK] Redis: ${totalPosts} cached home posts across ${pages.length} pages`);
  pages.forEach(p => console.log(`     - Page ${p.page}: ${p.count} posts`));

  return { pages, totalPosts };
}

async function checkTagSets() {
  const tags = ["tag:posts", "tag:ranked", "tag:home", "tag:profiles"];
  console.log("\nTag Sets:");
  for (const tag of tags) {
    const members = await redis.smembers(tag);
    console.log(`  ${tag}: ${members.length} keys`, members.length > 0 ? members : "");
  }
}

async function invalidateAllCaches() {
  console.log("\n=== Invalidating All Caches ===\n");

  // Get all cache keys
  const keys = await redis.keys("posts:*");
  const profileKeys = await redis.keys("profile:*");
  const allKeys = [...keys, ...profileKeys];

  if (allKeys.length > 0) {
    await redis.del(...allKeys);
    console.log(`[OK] Deleted ${allKeys.length} cache keys:`, allKeys);
  } else {
    console.log("[INFO] No cache keys to delete");
  }

  // Clear tag sets
  const tags = ["tag:posts", "tag:ranked", "tag:home", "tag:profiles"];
  for (const tag of tags) {
    await redis.del(tag);
  }
  console.log(`[OK] Cleared ${tags.length} tag sets`);

  console.log("\n[OK] Cache invalidation complete. Next request will fetch fresh data.");
}

async function detectIssues(supabaseData, cachedRanked, cachedHome, totalPostsCount) {
  const issues = [];

  // Critical: Ranked cache empty but Supabase has data
  if (supabaseData && supabaseData.length > 0) {
    if (cachedRanked !== null && cachedRanked.length === 0) {
      issues.push({
        severity: "CRITICAL",
        message: "Rank page bug: Redis cache is EMPTY but Supabase has data!",
        details: `Supabase has ${supabaseData.length} posts, cache has 0`,
        fix: "Run with --invalidate or trigger a like action",
      });
    }

    if (cachedRanked !== null && Math.abs(cachedRanked.length - supabaseData.length) > 5) {
      issues.push({
        severity: "WARNING",
        message: "Cache drift: Significant difference between cache and database",
        details: `Supabase: ${supabaseData.length}, Cache: ${cachedRanked.length}`,
        fix: "Cache will self-correct on TTL expiry or manual invalidation",
      });
    }
  }

  // Check if all home posts are cached (pagination coverage)
  if (cachedHome && totalPostsCount > 0) {
    const cachedTotal = cachedHome.totalPosts;
    const expectedPages = Math.ceil(totalPostsCount / 10);
    const actualPages = cachedHome.pages.length;

    if (cachedTotal < totalPostsCount) {
      issues.push({
        severity: "INFO",
        message: "Partial home cache: Not all posts are cached yet",
        details: `Cached: ${cachedTotal}/${totalPostsCount} posts (${actualPages}/${expectedPages} pages)`,
        fix: "Posts will be cached as users scroll (on-demand caching)",
      });
    }
  }

  return issues;
}

async function getTotalPostsCount() {
  const { count, error } = await supabase
    .from("posts_new")
    .select("*", { count: "exact", head: true });

  if (error) {
    console.error("[FAIL] Failed to get total posts count:", error.message);
    return 0;
  }

  console.log(`[OK] Supabase: ${count} total posts`);
  return count || 0;
}

async function main() {
  // 1. Check Redis connection
  const connected = await checkRedisConnection();
  if (!connected) {
    process.exit(1);
  }

  // 2. Force invalidate if requested
  if (shouldInvalidate) {
    await invalidateAllCaches();
    console.log("\nRe-checking after invalidation...\n");
  }

  // 3. Get data from both sources
  console.log("\n=== Data Comparison ===\n");
  const totalPostsCount = await getTotalPostsCount();
  const supabaseData = await getSupabaseRankedPosts();
  const cachedRanked = await getCachedRankedPosts();
  const cachedHome = await getCachedHomePosts();

  // 4. Check tag sets
  await checkTagSets();

  // 5. Detect issues
  console.log("\n=== Issue Detection ===\n");
  const issues = await detectIssues(supabaseData, cachedRanked, cachedHome, totalPostsCount);

  if (issues.length === 0) {
    console.log("[OK] No issues detected - cache is healthy");
  } else {
    for (const issue of issues) {
      console.log(`[${issue.severity}] ${issue.message}`);
      console.log(`    Details: ${issue.details}`);
      console.log(`    Fix: ${issue.fix}`);
      console.log();
    }
  }

  // 6. Summary
  console.log("\n=== Summary ===\n");

  console.log(`Total posts in Supabase: ${totalPostsCount}`);

  if (supabaseData) {
    console.log(`Ranked posts (>${RANK_MIN_LIKES} likes): ${supabaseData.length}`);
    if (supabaseData.length > 0) {
      console.log("Top 3 posts:");
      supabaseData.slice(0, 3).forEach((p, i) => {
        console.log(`  ${i + 1}. ID: ${p.id.slice(0, 8)}..., likes: ${p.likes}`);
      });
    }
  }

  if (cachedRanked !== null) {
    console.log(`\nCached ranked posts: ${cachedRanked.length}`);
  } else {
    console.log("\nCached ranked posts: Not cached (null)");
  }

  if (cachedHome !== null) {
    console.log(`Cached home posts: ${cachedHome.totalPosts} (${cachedHome.pages.length} pages)`);
  } else {
    console.log("Cached home posts: Not cached (null)");
  }

  const hasCritical = issues.some((i) => i.severity === "CRITICAL");
  console.log(`\nHealth: ${hasCritical ? "UNHEALTHY" : "HEALTHY"}`);

  if (hasCritical && !shouldInvalidate) {
    console.log("\nRun with --invalidate to fix cache issues");
  }

  process.exit(hasCritical ? 1 : 0);
}

main().catch((e) => {
  console.error("Script failed:", e);
  process.exit(1);
});
