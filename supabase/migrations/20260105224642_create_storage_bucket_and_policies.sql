-- Create the storage bucket for post images
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('images_platzi', 'images_platzi', true, 2097152, '{"image/jpeg","image/png","image/gif","image/webp"}')
ON CONFLICT (id) DO NOTHING;

-- Create policies for anonymous access to the bucket
-- Allow anonymous users to view images
CREATE POLICY "Allow anonymous select on images_platzi"
ON storage.objects FOR SELECT
TO anon
USING ( bucket_id = 'images_platzi' );

-- Allow anonymous users to upload images
CREATE POLICY "Allow anonymous uploads in images_platzi"
ON storage.objects FOR INSERT
TO anon
WITH CHECK ( bucket_id = 'images_platzi' );
