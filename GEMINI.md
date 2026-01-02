# Project Context: Suplatzigram

## Project Overview
Suplatzigram is an Instagram-inspired web application built as the frontend for the **Platzi Supabase Course**. It leverages **Next.js** for the frontend and **Supabase** for backend services including authentication, database, and storage. The application features a social feed where users can view posts, see likes, and potentially interact with content.

### Tech Stack
*   **Frontend Framework:** Next.js 16 (App Router)
*   **Language:** TypeScript
*   **Styling:** Tailwind CSS v4
*   **Backend:** Supabase (Client initialized in `app/utils/client.ts`)
*   **Icons:** Heroicons (via direct SVG usage)

## Key Directories & Files
*   `app/`: Main application source code (App Router).
    *   `page.tsx`: Home page displaying the feed of posts. Fetches data from Supabase table `posts_new`.
    *   `layout.tsx`: Root layout including global styles, fonts (Geist), and the `BottomNav` component.
    *   `utils/client.ts`: Supabase client initialization using `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
    *   `mocks/posts.ts`: Contains the `Post` interface and mock data (likely for testing or fallback).
    *   `components/`: Reusable UI components (e.g., `BottomNav.tsx`).
*   `next.config.ts`: Next.js configuration, notably allowing images from `i.pravatar.cc`, `picsum.photos`, and the specific Supabase project domain.

## Building and Running

### Prerequisites
*   Node.js (v20+ recommended based on `@types/node`)
*   npm

### Environment Variables
The application requires the following environment variables (typically in `.env.local`):
*   `NEXT_PUBLIC_SUPABASE_URL`
*   `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Scripts
*   **Development Server:** `npm run dev` (starts at http://localhost:3000)
*   **Build:** `npm run build`
*   **Start Production:** `npm run start`
*   **Linting:** `npm run lint`

## Development Conventions

### Code Style
*   **Typography:** Uses `Geist` and `Geist_Mono` fonts.
*   **Styling:** Utility-first CSS with Tailwind. Custom colors (like `card-bg`, `border`, `primary`) are likely defined in `app/globals.css`.
*   **Components:** Functional components with TypeScript interfaces for props.
*   **Data Fetching:** Client-side fetching using `useEffect` and the Supabase client is currently implemented in `app/page.tsx`.
*   **Images:** extensively uses `next/image` for optimization. Remote patterns are configured in `next.config.ts`.

### Data Model (Inferred)
Based on `Post` interface and usage:
*   `posts_new` table likely contains: `id`, `user` (jsonb or relation), `image_url`, `caption`, `likes`, `created_at`.
