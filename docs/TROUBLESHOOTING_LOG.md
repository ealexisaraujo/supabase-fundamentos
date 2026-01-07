# Troubleshooting Log & Context Engineering

This document summarizes the key issues, root causes, and solutions discovered during the debugging of the Suplatzigram application. It can be used as a reference for future troubleshooting sessions.

## Project Overview
*   **Tech Stack:** Next.js (App Router), TypeScript, Tailwind CSS, Supabase (local Docker instance).
*   **Goal:** A public, Instagram-like feed where users can upload and view posts without authentication.

---

## Issue 1: `StorageApiError: Bucket not found`
*   **Symptom:** An error was thrown when attempting to upload an image.
*   **Root Cause:** The application code in `app/post/page.tsx` was referencing a Supabase storage bucket named `images`, but the bucket in the local Supabase instance was named `images_platzi`.
*   **Solution:** The bucket name in `app/post/page.tsx` was updated to `images_platzi` to match the local environment.

---

## Issue 2: `new row violates row-level security policy for table "storage.objects"`
*   **Symptom:** After fixing the bucket name, image uploads still failed with a `StorageApiError` containing a database RLS error message.
*   **Root Cause:** Row Level Security (RLS) was active on the `storage.objects` table, which stores metadata for all uploaded files. There was no policy to allow an unauthenticated (`anon`) user to insert new rows, which is required for an upload.
*   **Solution:** A new database migration (`..._allow_storage_inserts.sql`) was created and applied. This policy grants `INSERT` permission to the `anon` role on the `storage.objects` table, but only for the `images_platzi` bucket.
    ```sql
    CREATE POLICY "Allow anonymous uploads in images_platzi"
    ON storage.objects FOR INSERT
    TO anon
    WITH CHECK ( bucket_id = 'images_platzi' );
    ```

---

## Issue 3: `new row violates row-level security policy for table "posts_new"`
*   **Symptom:** After the image upload succeeded, the subsequent step of creating a record in the `posts_new` table failed with another RLS violation.
*   **Root Cause:** This was a misleading error message. The true cause was a **foreign key constraint violation**. The code was sending a hardcoded `user_id` that did not exist in the `auth.users` table. Because RLS is enabled on `posts_new`, PostgreSQL reported this constraint failure as an RLS violation.
*   **Solution:**
    1.  A new database migration (`..._make_user_id_nullable.sql`) was created to modify the `posts_new` table, allowing the `user_id` column to be `NULL`.
    2.  The frontend code in `app/post/page.tsx` was updated to send `null` for the `user_id` when creating a post, aligning with the goal of anonymous posts.

---

## Issue 4: `next/image` Fails with "private ip" Error (400 Bad Request)
*   **Symptom:** User-uploaded images from the local Supabase instance (`http://127.0.0.1:54321/...`) were not loading, showing a broken image and a `400 Bad Request` error in the console. The error message was `upstream image ... resolved to private ip`.
*   **Root Cause:** This is a built-in security feature of the `next/image` component. To prevent Server-Side Request Forgery (SSRF) attacks, the Next.js image optimization server is blocked from accessing images on private/local IP addresses. This security feature cannot be bypassed by configuring `next.config.ts`.
*   **Solution:** For the user-uploaded posts, the `<Image>` component from Next.js was replaced with a standard HTML `<img>` tag in `app/page.tsx`. This tells the browser to fetch the image directly from the URL, bypassing the Next.js image optimization server and its security check.

---

## Issue 5: Image Display & Cropping
*   **Symptom:** The user was unsatisfied with the image presentation in the feed, as images with different aspect ratios were either cropped, had empty space (letterboxed), or caused inconsistent post heights.
*   **Root Cause:** The fundamental design trade-off between maintaining a uniform grid and displaying the entirety of non-uniform images.
*   **Solution (Compromise):**
    1.  The image container in `app/page.tsx` was set to a fixed square aspect ratio (`aspect-square`).
    2.  The `<img>` tag uses the `object-contain` class to display the full image inside the container without cropping.
    3.  The container was given a background color (`bg-card-bg`) to fill the empty "letterbox" space with a non-distracting, consistent color. This provides a clean, uniform grid while ensuring the full image is always visible.

---

## Issue 6: Production Storage Upload Fails with RLS Policy Violation (Jan 2026)
*   **Symptom:** Image uploads in production failed with `StorageApiError: new row violates row-level security policy`. The error occurred on POST requests to `/storage/v1/object/images_platzi/...` returning 400 Bad Request.
*   **Root Cause:** The original storage policies targeted only the `anon` role instead of `public`. Additionally, the SELECT policy was missing in production. Supabase Storage requires both INSERT and SELECT policies to function correctly—SELECT is needed internally to verify uploads and check for existing objects.
*   **Original Policy (Broken):**
    ```sql
    CREATE POLICY "Allow anonymous uploads in images_platzi"
    ON storage.objects FOR INSERT
    TO anon  -- Too restrictive!
    WITH CHECK (bucket_id = 'images_platzi');
    ```
*   **Solution:** Created migration `20260107000000_fix_storage_policies.sql` that:
    1.  Drops the old restrictive `anon`-only policies
    2.  Creates new policies targeting `public` role (includes both `anon` and `authenticated`)
    3.  Adds all CRUD policies: SELECT, INSERT, UPDATE, DELETE
    ```sql
    CREATE POLICY "Allow public uploads to images_platzi"
    ON storage.objects FOR INSERT
    TO public  -- Correct: includes anon + authenticated
    WITH CHECK (bucket_id = 'images_platzi');
    ```
*   **Key Lesson:** For Supabase Storage buckets, always use `TO public` instead of `TO anon` to ensure compatibility with all authentication states. Also ensure SELECT policy exists alongside INSERT.
