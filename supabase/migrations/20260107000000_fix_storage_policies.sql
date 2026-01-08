-- Fix storage policies for images_platzi bucket
-- The previous policies only targeted 'anon' role which caused RLS violations
-- This migration updates policies to target 'public' role (includes both anon and authenticated)

-- 1. Drop existing restrictive policies
DROP POLICY IF EXISTS "Allow anonymous select on images_platzi" ON storage.objects;
DROP POLICY IF EXISTS "Allow anonymous uploads in images_platzi" ON storage.objects;

-- Drop policies if they already exist (idempotency fix)
DROP POLICY IF EXISTS "Allow public uploads to images_platzi" ON storage.objects;
DROP POLICY IF EXISTS "Allow public read access to images_platzi" ON storage.objects;
DROP POLICY IF EXISTS "Allow public update in images_platzi" ON storage.objects;
DROP POLICY IF EXISTS "Allow public delete in images_platzi" ON storage.objects;

-- 2. Create new INSERT policy for all users (anon + authenticated)
CREATE POLICY "Allow public uploads to images_platzi"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'images_platzi');

-- 3. Create SELECT policy for all users
CREATE POLICY "Allow public read access to images_platzi"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'images_platzi');

-- 4. Create UPDATE policy for replacing/updating images
CREATE POLICY "Allow public update in images_platzi"
ON storage.objects
FOR UPDATE
TO public
USING (bucket_id = 'images_platzi')
WITH CHECK (bucket_id = 'images_platzi');

-- 5. Create DELETE policy for cleanup
CREATE POLICY "Allow public delete in images_platzi"
ON storage.objects
FOR DELETE
TO public
USING (bucket_id = 'images_platzi');

-- 6. Update bucket file size limit to 5MB (was 2MB)
UPDATE storage.buckets
SET file_size_limit = 5242880
WHERE id = 'images_platzi';
