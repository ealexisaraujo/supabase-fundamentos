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
