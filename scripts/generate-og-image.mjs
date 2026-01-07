#!/usr/bin/env node
/**
 * Generate static OG image at build time
 * Run: node scripts/generate-og-image.mjs
 *
 * This script starts a temporary server, captures the OG image,
 * and saves it to public/og-image.png
 */

import { spawn } from 'child_process';
import { writeFile } from 'fs/promises';
import { setTimeout } from 'timers/promises';

const PORT = 3099;
const OG_URL = `http://localhost:${PORT}/opengraph-image`;
const OUTPUT_PATH = './public/og-image.png';

async function generateOGImage() {
  console.log('🎨 Generating OG image...');

  // Start Next.js dev server on a different port
  const server = spawn('npx', ['next', 'dev', '-p', PORT.toString()], {
    stdio: 'pipe',
    shell: true
  });

  try {
    // Wait for server to start
    console.log('⏳ Waiting for dev server...');
    await setTimeout(8000);

    // Fetch the OG image
    console.log('📥 Fetching OG image...');
    const response = await fetch(OG_URL);

    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    await writeFile(OUTPUT_PATH, Buffer.from(buffer));

    console.log(`✅ OG image saved to ${OUTPUT_PATH}`);
    console.log(`📊 Size: ${(buffer.byteLength / 1024).toFixed(1)} KB`);

  } finally {
    // Kill the server
    server.kill('SIGTERM');
  }
}

generateOGImage().catch(console.error);
