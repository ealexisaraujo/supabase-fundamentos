#!/usr/bin/env node
/**
 * Upload OG image to Supabase Storage
 *
 * Usage: node scripts/upload-og-to-supabase.mjs
 *
 * Prerequisites:
 * 1. Create a public bucket named 'og-images' in Supabase Dashboard
 * 2. Set SUPABASE_SERVICE_ROLE_KEY in your environment
 */

import { createClient } from '@supabase/supabase-js';
import { readFile } from 'fs/promises';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET_NAME = 'og-images';
const FILE_NAME = 'og-image.png';
const LOCAL_PATH = './public/og-image.png';

async function uploadOGImage() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  console.log('📤 Uploading OG image to Supabase Storage...');

  // Read the local file
  const fileBuffer = await readFile(LOCAL_PATH);

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(FILE_NAME, fileBuffer, {
      contentType: 'image/png',
      upsert: true, // Overwrite if exists
      cacheControl: '604800', // Cache for 1 week
    });

  if (error) {
    console.error('❌ Upload failed:', error.message);
    process.exit(1);
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(FILE_NAME);

  console.log('✅ Upload successful!');
  console.log('🔗 Public URL:', urlData.publicUrl);
  console.log('\n📝 Add this to your layout.tsx metadata:');
  console.log(`   url: "${urlData.publicUrl}"`);
}

uploadOGImage().catch(console.error);
