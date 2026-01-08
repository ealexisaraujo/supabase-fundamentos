/**
 * Image utilities for handling Supabase Storage URLs
 *
 * Provides helper functions to determine if Next.js Image optimization
 * should be disabled for certain URLs (local development, data URLs, etc.)
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

/**
 * Check if a URL should skip Next.js Image optimization
 *
 * Returns true for:
 * - Data URLs (base64 encoded images from file preview)
 * - Local development Supabase URLs (127.0.0.1, localhost)
 * - URLs that don't match the configured Supabase URL pattern
 */
export function shouldSkipImageOptimization(url: string | null | undefined): boolean {
  if (!url) return false;

  // Always skip optimization for data URLs (file previews)
  if (url.startsWith('data:')) return true;

  // Check if it's a local development URL
  const isLocalUrl = url.includes('127.0.0.1') || url.includes('localhost');

  // Check if Supabase is configured for local development
  const isLocalSupabase = SUPABASE_URL.includes('127.0.0.1') || SUPABASE_URL.includes('localhost');

  // Skip optimization for local development
  if (isLocalUrl || isLocalSupabase) return true;

  return false;
}

/**
 * Get the appropriate image source for Supabase Storage URLs
 * Handles both local development and production URLs
 */
export function getSupabaseImageUrl(path: string): string {
  if (!path) return '';

  // If it's already a full URL, return as-is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  // Otherwise, construct the full URL
  return `${SUPABASE_URL}/storage/v1/object/public/${path}`;
}
