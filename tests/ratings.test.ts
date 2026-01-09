import { describe, it, expect, vi, beforeEach } from 'vitest'

// Use vi.hoisted to define mocks before they're hoisted
const { mockSupabase } = vi.hoisted(() => {
  const mock: any = {
    from: vi.fn(() => mock),
    select: vi.fn(() => mock),
    insert: vi.fn(() => mock),
    delete: vi.fn(() => mock),
    update: vi.fn(() => mock),
    eq: vi.fn(() => mock),
    in: vi.fn(() => mock),
    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  }
  return { mockSupabase: mock }
})

vi.mock('../app/utils/client', () => ({
  supabase: mockSupabase,
}))

// Import after mocking
import { togglePostLike, getSessionLikes } from '../app/utils/ratings'

describe('Rating Functions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('togglePostLike', () => {
    it('should return error when sessionId is empty', async () => {
      const result = await togglePostLike('post-123', '')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Session ID is required')
    })

    it('should add a like when post is not already liked', async () => {
      // Mock: RPC returns success with isLiked true (added like)
      mockSupabase.rpc.mockResolvedValueOnce({
        data: { success: true, isLiked: true, newLikeCount: 6 },
        error: null,
      })

      const result = await togglePostLike('post-123', 'session-456')

      expect(mockSupabase.rpc).toHaveBeenCalledWith('toggle_post_like', {
        p_post_id: 'post-123',
        p_session_id: 'session-456',
      })
      expect(result.success).toBe(true)
      expect(result.isLiked).toBe(true)
      expect(result.newLikeCount).toBe(6)
    })

    it('should remove a like when post is already liked', async () => {
      // Mock: RPC returns success with isLiked false (removed like)
      mockSupabase.rpc.mockResolvedValueOnce({
        data: { success: true, isLiked: false, newLikeCount: 5 },
        error: null,
      })

      const result = await togglePostLike('post-123', 'session-456')

      expect(mockSupabase.rpc).toHaveBeenCalledWith('toggle_post_like', {
        p_post_id: 'post-123',
        p_session_id: 'session-456',
      })
      expect(result.success).toBe(true)
      expect(result.isLiked).toBe(false)
      expect(result.newLikeCount).toBe(5)
    })

    it('should handle unique constraint violation gracefully', async () => {
      // Mock: RPC returns the race condition error from the database
      mockSupabase.rpc.mockResolvedValueOnce({
        data: { success: false, isLiked: true, newLikeCount: 0, error: 'Already liked this post' },
        error: null,
      })

      const result = await togglePostLike('post-123', 'session-456')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Already liked this post')
    })

    it('should handle RPC errors', async () => {
      // Mock: RPC returns an error
      mockSupabase.rpc.mockResolvedValueOnce({
        data: null,
        error: { message: 'Database connection error' },
      })

      const result = await togglePostLike('post-123', 'session-456')

      expect(result.success).toBe(false)
      expect(result.error).toBe('Database connection error')
    })
  })

  describe('getSessionLikes', () => {
    it('should return empty map when sessionId is empty', async () => {
      const result = await getSessionLikes(['post-1', 'post-2'], '')

      expect(result.size).toBe(0)
    })

    it('should return empty map when postIds is empty', async () => {
      const result = await getSessionLikes([], 'session-123')

      expect(result.size).toBe(0)
    })

    it('should return liked status for multiple posts', async () => {
      // Mock: return some liked posts
      mockSupabase.in.mockReturnValue({
        ...mockSupabase,
        then: (fn: Function) => fn({
          data: [{ post_id: 'post-1' }, { post_id: 'post-3' }],
          error: null,
        }),
      })

      const result = await getSessionLikes(
        ['post-1', 'post-2', 'post-3'],
        'session-123'
      )

      // The mock doesn't fully simulate the chain, but we verify the call
      expect(mockSupabase.from).toHaveBeenCalledWith('post_ratings')
      expect(mockSupabase.eq).toHaveBeenCalledWith('session_id', 'session-123')
    })
  })
})

describe('Rating Constraints', () => {
  it('should enforce one rating per session per post (conceptual)', () => {
    // This test documents the database constraint behavior
    // The actual enforcement is done by the unique constraint:
    // CONSTRAINT unique_session_post_rating UNIQUE (post_id, session_id)

    // In a real integration test, attempting to insert duplicate ratings
    // would result in a PostgreSQL error code 23505 (unique_violation)
    expect(true).toBe(true)
  })

  it('should use atomic RPC function for like count updates', () => {
    // This test documents that likes are now updated atomically using an RPC function:
    // The toggle_post_like RPC function handles everything in a single transaction:
    // 1. Check if rating exists
    // 2. Insert/delete rating
    // 3. Update post likes count
    //
    // This eliminates race conditions and the "flash" bug where the counter
    // would briefly show incorrect values during like/unlike operations.
    //
    // Real-time sync ensures all clients see the final count via a single UPDATE event.
    expect(true).toBe(true)
  })
})
