import "@testing-library/jest-dom";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import React from "react";

// Runs a cleanup after each test case (e.g., clearing jsdom)
afterEach(() => {
  cleanup();
});

// Mock next/image
vi.mock("next/image", () => ({
  default: function MockImage({
    src,
    alt,
    fill,
    sizes,
    ...props
  }: {
    src: string;
    alt: string;
    fill?: boolean;
    sizes?: string;
    [key: string]: unknown;
  }) {
    return React.createElement("img", { src, alt, ...props });
  },
}));

// Mock environment variables
vi.stubEnv("NEXT_PUBLIC_USE_MOCKS", "true");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");

// Mock localStorage for session tests
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, "localStorage", { value: localStorageMock });

// Mock crypto.randomUUID
Object.defineProperty(crypto, "randomUUID", {
  value: () => "test-uuid-1234-5678-9abc-def012345678",
});
