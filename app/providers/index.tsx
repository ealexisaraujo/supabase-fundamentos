"use client";

/**
 * Combined Providers Export
 *
 * This file exports all providers and a combined Providers component
 * for easy use in the root layout.
 */

export { AuthProvider, useAuth } from "./AuthProvider";
export { QueryProvider, queryKeys } from "./QueryProvider";

import { type ReactNode } from "react";
import { AuthProvider } from "./AuthProvider";
import { QueryProvider } from "./QueryProvider";

interface ProvidersProps {
  children: ReactNode;
}

/**
 * Combined Providers Component
 *
 * Wraps children with all necessary providers in the correct order:
 * 1. QueryProvider - TanStack Query for data caching
 * 2. AuthProvider - Authentication state management
 *
 * @example
 * ```tsx
 * // In app/layout.tsx
 * import { Providers } from "./providers";
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <Providers>{children}</Providers>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export function Providers({ children }: ProvidersProps) {
  return (
    <QueryProvider>
      <AuthProvider>{children}</AuthProvider>
    </QueryProvider>
  );
}
