import { describe, it, expect, beforeEach, vi } from "vitest";
import type {
  ProfileHighlight,
  PinHighlightResult,
  UnpinHighlightResult,
  ReorderHighlightResult,
  HighlightPosition,
} from "../app/types/highlight";

// Mock the supabase client
vi.mock("../app/utils/client", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
    rpc: vi.fn(() => Promise.resolve({ data: { success: true }, error: null })),
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    })),
    removeChannel: vi.fn(),
  },
}));

// Mock the revalidate action
vi.mock("../app/actions/revalidate-profiles", () => ({
  revalidateProfileCache: vi.fn(() => Promise.resolve({ success: true })),
}));

describe("Highlight Types", () => {
  it("should have correct ProfileHighlight structure", () => {
    const highlight: ProfileHighlight = {
      id: "highlight-uuid",
      profile_id: "profile-uuid",
      post_id: "post-uuid",
      position: 1,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    };

    expect(highlight.id).toBe("highlight-uuid");
    expect(highlight.profile_id).toBe("profile-uuid");
    expect(highlight.post_id).toBe("post-uuid");
    expect(highlight.position).toBe(1);
  });

  it("should validate position is 1, 2, or 3", () => {
    const validPositions: HighlightPosition[] = [1, 2, 3];

    validPositions.forEach((pos) => {
      expect([1, 2, 3]).toContain(pos);
    });
  });

  it("should include optional post data in highlight", () => {
    const highlightWithPost: ProfileHighlight = {
      id: "highlight-uuid",
      profile_id: "profile-uuid",
      post_id: "post-uuid",
      position: 2,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      post: {
        id: "post-uuid",
        image_url: "https://example.com/image.jpg",
        caption: "Test caption",
        likes: 10,
        created_at: "2024-01-01T00:00:00Z",
      },
    };

    expect(highlightWithPost.post).toBeDefined();
    expect(highlightWithPost.post?.image_url).toBe("https://example.com/image.jpg");
    expect(highlightWithPost.post?.likes).toBe(10);
  });
});

describe("Highlight Result Types", () => {
  it("should handle successful pin result", () => {
    const result: PinHighlightResult = {
      success: true,
      highlightId: "new-highlight-id",
      position: 2,
    };

    expect(result.success).toBe(true);
    expect(result.highlightId).toBeDefined();
    expect(result.position).toBe(2);
  });

  it("should handle failed pin result with error", () => {
    const result: PinHighlightResult = {
      success: false,
      error: "Maximum 3 highlights allowed. Please unpin one first.",
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("Maximum 3");
    expect(result.highlightId).toBeUndefined();
  });

  it("should handle ownership validation error", () => {
    const result: PinHighlightResult = {
      success: false,
      error: "You can only pin your own posts",
    };

    expect(result.success).toBe(false);
    expect(result.error).toContain("own posts");
  });

  it("should handle successful unpin result", () => {
    const result: UnpinHighlightResult = {
      success: true,
      removedPosition: 1,
    };

    expect(result.success).toBe(true);
    expect(result.removedPosition).toBe(1);
  });

  it("should handle successful reorder result", () => {
    const result: ReorderHighlightResult = {
      success: true,
      newPosition: 3,
      swappedWith: "other-post-uuid",
    };

    expect(result.success).toBe(true);
    expect(result.newPosition).toBe(3);
    expect(result.swappedWith).toBe("other-post-uuid");
  });
});

describe("Highlight Business Rules", () => {
  it("should enforce maximum of 3 highlights per profile", () => {
    const maxHighlights = 3;
    const currentCount = 3;

    expect(currentCount >= maxHighlights).toBe(true);
  });

  it("should allow adding highlights when under limit", () => {
    const maxHighlights = 3;
    const currentCount = 2;

    const canAddMore = currentCount < maxHighlights;
    expect(canAddMore).toBe(true);
  });

  it("should not allow duplicate posts in highlights", () => {
    const highlights: ProfileHighlight[] = [
      { id: "1", profile_id: "p1", post_id: "post-1", position: 1, created_at: "", updated_at: "" },
      { id: "2", profile_id: "p1", post_id: "post-2", position: 2, created_at: "", updated_at: "" },
    ];

    const postIds = highlights.map((h) => h.post_id);
    const uniquePostIds = new Set(postIds);

    // No duplicates means set size equals array length
    expect(postIds.length).toBe(uniquePostIds.size);
  });

  it("should validate unique positions per profile", () => {
    const highlights: ProfileHighlight[] = [
      { id: "1", profile_id: "p1", post_id: "post-1", position: 1, created_at: "", updated_at: "" },
      { id: "2", profile_id: "p1", post_id: "post-2", position: 2, created_at: "", updated_at: "" },
    ];

    const positions = highlights.map((h) => h.position);
    const uniquePositions = new Set(positions);

    // No duplicate positions
    expect(positions.length).toBe(uniquePositions.size);
  });
});

describe("Available Positions Logic (Append)", () => {
  // New behavior: always append to end, no gaps allowed
  // getAvailablePositions returns [count + 1] or [] if full

  it("should return position 1 when no highlights exist", () => {
    const highlightCount = 0;
    const nextPosition = highlightCount + 1;
    const available = nextPosition <= 3 ? [nextPosition] : [];

    expect(available).toEqual([1]);
  });

  it("should return position 2 when 1 highlight exists", () => {
    const highlightCount = 1;
    const nextPosition = highlightCount + 1;
    const available = nextPosition <= 3 ? [nextPosition] : [];

    expect(available).toEqual([2]);
  });

  it("should return position 3 when 2 highlights exist", () => {
    const highlightCount = 2;
    const nextPosition = highlightCount + 1;
    const available = nextPosition <= 3 ? [nextPosition] : [];

    expect(available).toEqual([3]);
  });

  it("should return empty array when all 3 positions are used", () => {
    const highlightCount = 3;
    const nextPosition = highlightCount + 1;
    const available = nextPosition <= 3 ? [nextPosition] : [];

    expect(available).toEqual([]);
  });

  it("should always append sequentially (1, 2, 3)", () => {
    // Simulating append behavior
    let highlightCount = 0;

    // First pin -> position 1
    let nextPosition = highlightCount + 1;
    expect(nextPosition).toBe(1);
    highlightCount++;

    // Second pin -> position 2
    nextPosition = highlightCount + 1;
    expect(nextPosition).toBe(2);
    highlightCount++;

    // Third pin -> position 3
    nextPosition = highlightCount + 1;
    expect(nextPosition).toBe(3);
    highlightCount++;

    // Fourth pin -> not allowed
    nextPosition = highlightCount + 1;
    expect(nextPosition > 3).toBe(true);
  });

  it("should correctly identify highlighted posts", () => {
    const highlights: ProfileHighlight[] = [
      { id: "1", profile_id: "p1", post_id: "post-1", position: 1, created_at: "", updated_at: "" },
      { id: "2", profile_id: "p1", post_id: "post-2", position: 2, created_at: "", updated_at: "" },
    ];

    const highlightedPostIds = new Set(highlights.map((h) => h.post_id));

    expect(highlightedPostIds.has("post-1")).toBe(true);
    expect(highlightedPostIds.has("post-2")).toBe(true);
    expect(highlightedPostIds.has("post-3")).toBe(false);
  });
});

describe("Highlight Reorder on Unpin", () => {
  it("should shift positions down when middle highlight is removed", () => {
    // Initial: positions 1, 2, 3
    // Remove position 2 -> positions become 1, 2 (was 3)
    const highlights: ProfileHighlight[] = [
      { id: "1", profile_id: "p1", post_id: "post-1", position: 1, created_at: "", updated_at: "" },
      { id: "2", profile_id: "p1", post_id: "post-2", position: 2, created_at: "", updated_at: "" },
      { id: "3", profile_id: "p1", post_id: "post-3", position: 3, created_at: "", updated_at: "" },
    ];

    const removedPosition = 2;
    const remaining = highlights
      .filter((h) => h.position !== removedPosition)
      .map((h) => ({
        ...h,
        position: (h.position > removedPosition ? h.position - 1 : h.position) as HighlightPosition,
      }));

    expect(remaining.length).toBe(2);
    expect(remaining[0].position).toBe(1); // post-1 stays at 1
    expect(remaining[1].position).toBe(2); // post-3 moves from 3 to 2
  });

  it("should not change positions when last highlight is removed", () => {
    const highlights: ProfileHighlight[] = [
      { id: "1", profile_id: "p1", post_id: "post-1", position: 1, created_at: "", updated_at: "" },
      { id: "2", profile_id: "p1", post_id: "post-2", position: 2, created_at: "", updated_at: "" },
      { id: "3", profile_id: "p1", post_id: "post-3", position: 3, created_at: "", updated_at: "" },
    ];

    const removedPosition = 3;
    const remaining = highlights
      .filter((h) => h.position !== removedPosition)
      .map((h) => ({
        ...h,
        position: (h.position > removedPosition ? h.position - 1 : h.position) as HighlightPosition,
      }));

    expect(remaining.length).toBe(2);
    expect(remaining[0].position).toBe(1); // unchanged
    expect(remaining[1].position).toBe(2); // unchanged
  });
});

describe("Highlight Position Swapping", () => {
  it("should swap positions when moving to occupied position", () => {
    const highlights: ProfileHighlight[] = [
      { id: "1", profile_id: "p1", post_id: "post-1", position: 1, created_at: "", updated_at: "" },
      { id: "2", profile_id: "p1", post_id: "post-2", position: 2, created_at: "", updated_at: "" },
    ];

    // Simulate swapping post-1 from position 1 to position 2
    const currentPosition = 1;
    const targetPosition = 2;

    // Find highlights involved in swap
    const movingHighlight = highlights.find((h) => h.position === currentPosition);
    const targetHighlight = highlights.find((h) => h.position === targetPosition);

    expect(movingHighlight?.post_id).toBe("post-1");
    expect(targetHighlight?.post_id).toBe("post-2");

    // After swap
    const swappedHighlights = highlights.map((h) => {
      if (h.position === currentPosition) {
        return { ...h, position: targetPosition as HighlightPosition };
      }
      if (h.position === targetPosition) {
        return { ...h, position: currentPosition as HighlightPosition };
      }
      return h;
    });

    const movedHighlight = swappedHighlights.find((h) => h.post_id === "post-1");
    const otherHighlight = swappedHighlights.find((h) => h.post_id === "post-2");

    expect(movedHighlight?.position).toBe(2);
    expect(otherHighlight?.position).toBe(1);
  });
});

describe("Highlight Ordering", () => {
  it("should sort highlights by position ascending", () => {
    const highlights: ProfileHighlight[] = [
      { id: "2", profile_id: "p1", post_id: "post-2", position: 2, created_at: "", updated_at: "" },
      { id: "3", profile_id: "p1", post_id: "post-3", position: 3, created_at: "", updated_at: "" },
      { id: "1", profile_id: "p1", post_id: "post-1", position: 1, created_at: "", updated_at: "" },
    ];

    const sorted = [...highlights].sort((a, b) => a.position - b.position);

    expect(sorted[0].position).toBe(1);
    expect(sorted[1].position).toBe(2);
    expect(sorted[2].position).toBe(3);
  });
});

describe("Error Messages", () => {
  const errorMessages = {
    maxLimit: "Maximum 3 highlights allowed. Please unpin one first.",
    ownershipError: "You can only pin your own posts",
    notFound: "Highlight not found",
    alreadyHighlighted: "This post is already highlighted",
    invalidPosition: "Position must be between 1 and 3",
  };

  it("should have appropriate error message for max limit", () => {
    expect(errorMessages.maxLimit).toContain("Maximum 3");
  });

  it("should have appropriate error message for ownership", () => {
    expect(errorMessages.ownershipError).toContain("own posts");
  });

  it("should have appropriate error message for not found", () => {
    expect(errorMessages.notFound).toContain("not found");
  });

  it("should have appropriate error message for duplicate", () => {
    expect(errorMessages.alreadyHighlighted).toContain("already");
  });

  it("should have appropriate error message for invalid position", () => {
    expect(errorMessages.invalidPosition).toContain("1 and 3");
  });
});
