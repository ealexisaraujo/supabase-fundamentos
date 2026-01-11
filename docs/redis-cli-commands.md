# Redis CLI Commands for Suplatzigram

## Connection

```bash
redis-cli --tls -u redis://default:YOUR_UPSTASH_REDIS_TOKEN@your-instance.upstash.io:6379
```

## Basic Commands

### Check Connection

```bash
PING
# Expected: PONG
```

### List All Keys

```bash
KEYS *
```

### Get Specific Cache Keys

```bash
# Home posts cache
GET posts:home:0:10

# Ranked posts cache
GET posts:ranked

# Profile cache (replace username)
GET profile:username
```

### Check Cache Tags (Sets)

```bash
# See all keys tagged with posts
SMEMBERS tag:posts

# See all keys tagged with profiles
SMEMBERS tag:profiles

# See all keys tagged with home
SMEMBERS tag:home

# See all keys tagged with ranked
SMEMBERS tag:ranked
```

### Check TTL (Time To Live)

```bash
# Check remaining TTL for a key
TTL posts:home:0:10
TTL posts:ranked
TTL profile:username
```

## Cache Invalidation Commands

### Delete Specific Keys

```bash
# Delete specific key
DEL posts:home:0:10
DEL posts:ranked
DEL profile:username
```

### Delete Keys by Pattern (Selective Flush)

```bash
# Delete all home posts cache (all pages)
redis-cli --tls -u "redis://default:YOUR_UPSTASH_REDIS_TOKEN@your-instance.upstash.io:6379" --scan --pattern 'posts:home:*' | xargs -L 1 redis-cli --tls -u "redis://default:YOUR_UPSTASH_REDIS_TOKEN@your-instance.upstash.io:6379" DEL

# Delete all profile caches
redis-cli --tls -u "redis://default:YOUR_UPSTASH_REDIS_TOKEN@your-instance.upstash.io:6379" --scan --pattern 'profile:*' | xargs -L 1 redis-cli --tls -u "redis://default:YOUR_UPSTASH_REDIS_TOKEN@your-instance.upstash.io:6379" DEL

# Delete all tags
redis-cli --tls -u "redis://default:YOUR_UPSTASH_REDIS_TOKEN@your-instance.upstash.io:6379" --scan --pattern 'tag:*' | xargs -L 1 redis-cli --tls -u "redis://default:YOUR_UPSTASH_REDIS_TOKEN@your-instance.upstash.io:6379" DEL
```

## Flush Commands (Use with Caution in Production)

### Flush Current Database

```bash
# WARNING: Deletes ALL keys in the current database
FLUSHDB
```

### Flush All Databases

```bash
# WARNING: Deletes ALL keys in ALL databases - EXTREMELY DANGEROUS
FLUSHALL
```

### Safe Production Flush (Recommended)

For production, prefer selective deletion over FLUSHDB:

```bash
# Step 1: List all keys first to verify
redis-cli --tls -u "redis://default:YOUR_UPSTASH_REDIS_TOKEN@your-instance.upstash.io:6379" KEYS '*'

# Step 2: Count keys before deletion
redis-cli --tls -u "redis://default:YOUR_UPSTASH_REDIS_TOKEN@your-instance.upstash.io:6379" DBSIZE

# Step 3: If you're sure, flush the database
redis-cli --tls -u "redis://default:YOUR_UPSTASH_REDIS_TOKEN@your-instance.upstash.io:6379" FLUSHDB

# Step 4: Verify deletion
redis-cli --tls -u "redis://default:YOUR_UPSTASH_REDIS_TOKEN@your-instance.upstash.io:6379" DBSIZE
# Expected: (integer) 0
```

## Monitoring Commands

### Watch Real-time Commands

```bash
MONITOR
# Shows all commands being executed in real-time
# Press Ctrl+C to exit
```

### Get Database Info

```bash
INFO keyspace
# Shows number of keys and expires
```

### Memory Usage

```bash
INFO memory
```

### Database Size

```bash
DBSIZE
# Returns the number of keys in the current database
```

## Production Best Practices

1. **Before Deployment**: Always flush test data with `FLUSHDB`
2. **During Operation**: Use tag-based invalidation instead of flush
3. **Monitoring**: Use `DBSIZE` and `INFO keyspace` to monitor cache usage
4. **Debugging**: Use `TTL <key>` to check if keys are expiring correctly

## Counter Commands (Like Counts - Source of Truth)

Redis stores like counts as the source of truth. These keys are separate from cache keys.

### View Like Count for a Post

```bash
# Get like count for a specific post (replace POST_ID with actual UUID)
GET post:likes:50050001-aaaa-bbbb-cccc-ddddeeee0001

# Example output: "446"
```

### View Who Liked a Post (Set of Identifiers)

```bash
# Get all identifiers that liked a post (mix of session and profile)
SMEMBERS post:liked:50050001-aaaa-bbbb-cccc-ddddeeee0001

# Example output (shows both anonymous and authenticated likes):
# 1) "session:mk1meny8xyz123"
# 2) "profile:fc799006-9731-43db-ab47-1bc34180d88a"
```

### Check if a User Liked a Post

```bash
# Check if anonymous session is in the liked set
SISMEMBER post:liked:50050001-aaaa-bbbb-cccc-ddddeeee0001 "session:mk1meny8xyz123"

# Check if authenticated profile is in the liked set
SISMEMBER post:liked:50050001-aaaa-bbbb-cccc-ddddeeee0001 "profile:fc799006-9731-43db-ab47-1bc34180d88a"

# Example output: (integer) 1
```

### View All Posts Liked by a User

```bash
# Get all post IDs that an anonymous session has liked
SMEMBERS session:likes:mk1meny8xyz123

# Get all post IDs that an authenticated profile has liked
SMEMBERS profile:likes:fc799006-9731-43db-ab47-1bc34180d88a

# Example output:
# 1) "50050001-aaaa-bbbb-cccc-ddddeeee0001"
# 2) "50050001-aaaa-bbbb-cccc-ddddeeee0002"
```

### Count How Many Users Liked a Post

```bash
# Get the count of unique identifiers that liked a post (sessions + profiles)
SCARD post:liked:50050001-aaaa-bbbb-cccc-ddddeeee0001

# Example output: (integer) 446
```

### List All Counter Keys

```bash
# List all post like count keys
KEYS post:likes:*

# List all post liked sets
KEYS post:liked:*

# List all session likes sets (anonymous users)
KEYS session:likes:*

# List all profile likes sets (authenticated users)
KEYS profile:likes:*
```

### Verify Counter Consistency

```bash
# Compare counter value with set cardinality (should match)
GET post:likes:50050001-aaaa-bbbb-cccc-ddddeeee0001
SCARD post:liked:50050001-aaaa-bbbb-cccc-ddddeeee0001

# If these don't match, run reconciliation
```

### Manual Counter Operations (Use with Caution)

```bash
# Manually set a counter value
SET post:likes:50050001-aaaa-bbbb-cccc-ddddeeee0001 446

# Increment counter by 1
INCR post:likes:50050001-aaaa-bbbb-cccc-ddddeeee0001

# Decrement counter by 1
DECR post:likes:50050001-aaaa-bbbb-cccc-ddddeeee0001

# Add an anonymous session to liked set
SADD post:liked:50050001-aaaa-bbbb-cccc-ddddeeee0001 "session:session123"

# Add an authenticated profile to liked set
SADD post:liked:50050001-aaaa-bbbb-cccc-ddddeeee0001 "profile:fc799006-9731-43db-ab47-1bc34180d88a"

# Remove a session from liked set
SREM post:liked:50050001-aaaa-bbbb-cccc-ddddeeee0001 "session:session123"

# Remove a profile from liked set
SREM post:liked:50050001-aaaa-bbbb-cccc-ddddeeee0001 "profile:fc799006-9731-43db-ab47-1bc34180d88a"
```

### Delete Counter Data (Dangerous)

```bash
# Delete a post's like count
DEL post:likes:50050001-aaaa-bbbb-cccc-ddddeeee0001

# Delete a post's liked set
DEL post:liked:50050001-aaaa-bbbb-cccc-ddddeeee0001

# Delete all counter keys (DANGEROUS - will lose all like data!)
redis-cli --tls -u "redis://default:TOKEN@host:6379" --scan --pattern 'post:likes:*' | xargs -L 1 redis-cli --tls -u "redis://default:TOKEN@host:6379" DEL
redis-cli --tls -u "redis://default:TOKEN@host:6379" --scan --pattern 'post:liked:*' | xargs -L 1 redis-cli --tls -u "redis://default:TOKEN@host:6379" DEL
redis-cli --tls -u "redis://default:TOKEN@host:6379" --scan --pattern 'session:likes:*' | xargs -L 1 redis-cli --tls -u "redis://default:TOKEN@host:6379" DEL
redis-cli --tls -u "redis://default:TOKEN@host:6379" --scan --pattern 'profile:likes:*' | xargs -L 1 redis-cli --tls -u "redis://default:TOKEN@host:6379" DEL
```

## Cache Key Reference

| Key Pattern | Description | TTL |
|-------------|-------------|-----|
| `posts:home:{page}:{limit}` | Home feed posts | 60s |
| `posts:ranked` | Ranked posts | 300s |
| `profile:{username}` | User profile | 180s |
| `tag:posts` | Set of all post cache keys | No TTL |
| `tag:home` | Set of home cache keys | No TTL |
| `tag:ranked` | Set of ranked cache keys | No TTL |
| `tag:profiles` | Set of profile cache keys | No TTL |

## Counter Key Reference

| Key Pattern | Type | Description | TTL |
|-------------|------|-------------|-----|
| `post:likes:{postId}` | String (integer) | Like count for a post | No TTL |
| `post:liked:{postId}` | Set | Identifiers that liked the post (`session:*` or `profile:*`) | No TTL |
| `session:likes:{sessionId}` | Set | Post IDs liked by anonymous session | No TTL |
| `profile:likes:{profileId}` | Set | Post IDs liked by authenticated profile | No TTL |

## Troubleshooting

### Cache not being hit

```bash
# Check if key exists
EXISTS posts:home:0:10

# Check TTL (negative means expired or not exists)
TTL posts:home:0:10
```

### Verify tag invalidation

```bash
# Check what keys are in a tag
SMEMBERS tag:posts

# If empty after invalidation, it worked correctly
```

### Connection issues

```bash
# Test connection
redis-cli --tls -u "redis://default:YOUR_UPSTASH_REDIS_TOKEN@your-instance.upstash.io:6379" PING
```
