import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock cookies
const mockCookieStore = {
  getAll: vi.fn(() => []),
  set: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}));

// Mock NextResponse
const mockRedirect = vi.fn((url: string) => ({ url, type: "redirect" }));
vi.mock("next/server", () => ({
  NextResponse: {
    redirect: (url: string) => mockRedirect(url),
  },
}));

// Mock Supabase SSR client
const mockExchangeCodeForSession = vi.fn();
const mockCreateServerClient = vi.fn(() => ({
  auth: {
    exchangeCodeForSession: mockExchangeCodeForSession,
  },
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (...args: unknown[]) => mockCreateServerClient(...args),
}));

// Import the route handler after mocks are set up
import { GET } from "../app/auth/callback/route";

describe("Auth Callback Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset environment variables
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
  });

  describe("Code Exchange", () => {
    it("exchanges code for session when code is present", async () => {
      mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });

      const request = new Request(
        "https://example.com/auth/callback?code=test-code-123&next=/auth/reset-password"
      );

      await GET(request);

      expect(mockExchangeCodeForSession).toHaveBeenCalledWith("test-code-123");
    });

    it("redirects to next URL on successful code exchange", async () => {
      mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });

      const request = new Request(
        "https://example.com/auth/callback?code=test-code-123&next=/auth/reset-password"
      );

      await GET(request);

      expect(mockRedirect).toHaveBeenCalledWith(
        "https://example.com/auth/reset-password"
      );
    });

    it("redirects to home when next param is not provided", async () => {
      mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });

      const request = new Request(
        "https://example.com/auth/callback?code=test-code-123"
      );

      await GET(request);

      expect(mockRedirect).toHaveBeenCalledWith("https://example.com/");
    });

    it("redirects to login with error when code exchange fails", async () => {
      mockExchangeCodeForSession.mockResolvedValueOnce({
        error: new Error("Invalid code"),
      });

      const request = new Request(
        "https://example.com/auth/callback?code=invalid-code&next=/auth/reset-password"
      );

      await GET(request);

      expect(mockRedirect).toHaveBeenCalledWith(
        "https://example.com/auth/login?error=auth_callback_error"
      );
    });
  });

  describe("Missing Code", () => {
    it("redirects to login with error when code is missing", async () => {
      const request = new Request(
        "https://example.com/auth/callback?next=/auth/reset-password"
      );

      await GET(request);

      expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
      expect(mockRedirect).toHaveBeenCalledWith(
        "https://example.com/auth/login?error=auth_callback_error"
      );
    });

    it("redirects to login with error when no query params", async () => {
      const request = new Request("https://example.com/auth/callback");

      await GET(request);

      expect(mockExchangeCodeForSession).not.toHaveBeenCalled();
      expect(mockRedirect).toHaveBeenCalledWith(
        "https://example.com/auth/login?error=auth_callback_error"
      );
    });
  });

  describe("Supabase Client Configuration", () => {
    it("creates Supabase client with correct configuration", async () => {
      mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });

      const request = new Request(
        "https://example.com/auth/callback?code=test-code"
      );

      await GET(request);

      expect(mockCreateServerClient).toHaveBeenCalledWith(
        "https://test.supabase.co",
        "test-anon-key",
        expect.objectContaining({
          cookies: expect.objectContaining({
            getAll: expect.any(Function),
            setAll: expect.any(Function),
          }),
        })
      );
    });

    it("handles cookies correctly", async () => {
      mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });
      mockCookieStore.getAll.mockReturnValueOnce([
        { name: "session", value: "test-session" },
      ]);

      const request = new Request(
        "https://example.com/auth/callback?code=test-code"
      );

      await GET(request);

      // Verify cookies are being accessed
      expect(mockCreateServerClient).toHaveBeenCalled();
    });
  });

  describe("URL Handling", () => {
    it("preserves origin when redirecting", async () => {
      mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });

      const request = new Request(
        "https://myapp.vercel.app/auth/callback?code=test-code&next=/dashboard"
      );

      await GET(request);

      expect(mockRedirect).toHaveBeenCalledWith(
        "https://myapp.vercel.app/dashboard"
      );
    });

    it("handles different next paths correctly", async () => {
      mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });

      const testCases = [
        { next: "/auth/reset-password", expected: "/auth/reset-password" },
        { next: "/profile", expected: "/profile" },
        { next: "/settings/security", expected: "/settings/security" },
      ];

      for (const testCase of testCases) {
        vi.clearAllMocks();
        mockExchangeCodeForSession.mockResolvedValueOnce({ error: null });

        const request = new Request(
          `https://example.com/auth/callback?code=test-code&next=${testCase.next}`
        );

        await GET(request);

        expect(mockRedirect).toHaveBeenCalledWith(
          `https://example.com${testCase.expected}`
        );
      }
    });
  });
});
