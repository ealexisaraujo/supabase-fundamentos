
CREATE POLICY "Allow anonymous uploads in images_platzi"
ON storage.objects FOR INSERT
TO anon
WITH CHECK ( bucket_id = 'images_platzi' );
