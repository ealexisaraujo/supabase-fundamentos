# Corporate Proxy SSL Certificate Fix for Supabase Edge Runtime

## Issue Summary

When running `supabase start` behind a corporate proxy (e.g., Zscaler, NortonLifeLock/Gen Digital), the Edge Runtime container fails to bootstrap with the following error:

```
worker boot error: failed to bootstrap runtime: failed to create the graph:
Import 'https://deno.land/std/http/status.ts' failed: error sending request for url
(https://deno.land/std/http/status.ts): client error (Connect): invalid peer certificate: UnknownIssuer
```

### Root Cause

Corporate proxies perform SSL/TLS inspection by intercepting HTTPS traffic and re-signing it with their own certificates. The Deno runtime inside the Edge Runtime container doesn't trust these corporate CA certificates by default, causing SSL verification to fail when fetching dependencies from `deno.land`.

## Solution Overview

The fix requires two components:

1. **Custom Docker Image**: Bake corporate CA certificates into the Edge Runtime image
2. **Deno Configuration**: Tell Deno to use the system certificate store via environment variables

## Step-by-Step Fix

### Step 1: Extract Corporate CA Certificates

First, identify which corporate certificates your proxy uses by checking the certificate chain:

```bash
# Check what certificate is presented for deno.land
echo | openssl s_client -connect deno.land:443 -servername deno.land 2>/dev/null | openssl x509 -noout -issuer -subject

# Show full certificate chain
echo | openssl s_client -connect deno.land:443 -servername deno.land -showcerts 2>/dev/null | grep -E "(i:|s:)"
```

Then extract the corporate CA certificates from your macOS System Keychain:

```bash
# Create a directory for certificates
mkdir -p supabase/functions

# Extract corporate certificates (adjust certificate names for your organization)
# Example for NortonLifeLock/Gen Digital (Zscaler):
security find-certificate -c "NortonLifeLock Inc. Private Root CA - GCS" -a -p /Library/Keychains/System.keychain > /tmp/corp_ca_chain.pem
security find-certificate -c "NortonLifeLock Inc. Private SSL Inspection ICA" -a -p /Library/Keychains/System.keychain >> /tmp/corp_ca_chain.pem
security find-certificate -c "NortonLifeLock Private CA" -a -p /Library/Keychains/System.keychain >> /tmp/corp_ca_chain.pem
security find-certificate -c "Gen Digital Inc. Private Root CA" -a -p /Library/Keychains/System.keychain >> /tmp/corp_ca_chain.pem
security find-certificate -c "Gen Digital Inc. Root CA" -a -p /Library/Keychains/System.keychain >> /tmp/corp_ca_chain.pem

# Verify extraction
openssl crl2pkcs7 -nocrl -certfile /tmp/corp_ca_chain.pem 2>/dev/null | openssl pkcs7 -print_certs -noout
```

### Step 2: Create Combined CA Bundle

Combine the standard Mozilla CA bundle with your corporate certificates:

```bash
# If you have a company bundle from certifi/Python
cat ~/.ca-bundles/company_bundle.pem /tmp/corp_ca_chain.pem > supabase/functions/combined_ca_bundle.pem

# OR download Mozilla CA bundle and combine
curl -o /tmp/mozilla_ca_bundle.pem https://curl.se/ca/cacert.pem
cat /tmp/mozilla_ca_bundle.pem /tmp/corp_ca_chain.pem > supabase/functions/combined_ca_bundle.pem

# Verify the bundle
echo "Total certificates:"
grep -c "BEGIN CERTIFICATE" supabase/functions/combined_ca_bundle.pem
```

### Step 3: Create Custom Dockerfile

Create `Dockerfile.edge_custom` in your project root:

```dockerfile
FROM public.ecr.aws/supabase/edge-runtime:v1.69.28

USER root

# Copy the combined CA bundle (Mozilla CAs + Corporate CAs)
# This is required for Deno to trust SSL connections through corporate proxy
COPY supabase/functions/combined_ca_bundle.pem /etc/ssl/certs/ca-certificates.crt

# Set environment variables for Deno SSL verification
ENV DENO_CERT=/etc/ssl/certs/ca-certificates.crt
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
ENV REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
```

### Step 4: Build and Tag Custom Image

Build the custom image and tag it to replace the stock Supabase image:

```bash
# Build with custom tag
docker build -f Dockerfile.edge_custom -t public.ecr.aws/supabase/edge-runtime:v1.69.28-corp .

# Replace the stock image tag (IMPORTANT: this makes Supabase CLI use your custom image)
docker tag public.ecr.aws/supabase/edge-runtime:v1.69.28-corp public.ecr.aws/supabase/edge-runtime:v1.69.28

# Verify
docker images | grep edge-runtime
```

### Step 5: Configure Supabase

Add the following to your `supabase/config.toml`:

```toml
[edge_runtime]
enabled = true
policy = "per_worker"
inspector_port = 8083
deno_version = 2

# Corporate proxy CA certificates configuration
# DENO_TLS_CA_STORE=system tells Deno to use system certs from /etc/ssl/certs/
# DENO_CERT specifies additional certificates to trust
[edge_runtime.secrets]
DENO_TLS_CA_STORE = "system"
DENO_CERT = "/etc/ssl/certs/ca-certificates.crt"
```

### Step 6: Restart Supabase

```bash
supabase stop
supabase start
```

## Agnostic Solution for Any Corporate Proxy

If you don't know your specific corporate certificates, you can use this generic approach:

### Option A: Extract All Certificates from a Connection

```bash
#!/bin/bash
# extract-proxy-certs.sh - Extract certificates from SSL inspection

TARGET_HOST="${1:-deno.land}"
OUTPUT_FILE="${2:-supabase/functions/proxy_ca_chain.pem}"

echo "Extracting certificate chain from $TARGET_HOST..."

# Get the full certificate chain
echo | openssl s_client -connect "$TARGET_HOST:443" -servername "$TARGET_HOST" -showcerts 2>/dev/null | \
  awk '/BEGIN CERTIFICATE/,/END CERTIFICATE/{print}' > "$OUTPUT_FILE"

# Count certificates
CERT_COUNT=$(grep -c "BEGIN CERTIFICATE" "$OUTPUT_FILE")
echo "Extracted $CERT_COUNT certificates to $OUTPUT_FILE"

# Show certificate subjects
echo "Certificate subjects:"
openssl crl2pkcs7 -nocrl -certfile "$OUTPUT_FILE" 2>/dev/null | \
  openssl pkcs7 -print_certs -noout 2>/dev/null
```

### Option B: Export All Corporate Certificates from Keychain

```bash
#!/bin/bash
# export-corporate-certs.sh - Export all non-standard CAs from System Keychain

OUTPUT_FILE="${1:-supabase/functions/corp_ca_chain.pem}"

# Export all certificates from System Keychain
security find-certificate -a -p /Library/Keychains/System.keychain > "$OUTPUT_FILE"

# Count certificates
CERT_COUNT=$(grep -c "BEGIN CERTIFICATE" "$OUTPUT_FILE")
echo "Exported $CERT_COUNT certificates to $OUTPUT_FILE"
```

### Option C: Combined Script for Full Setup

```bash
#!/bin/bash
# setup-corporate-ssl.sh - Complete setup for corporate proxy SSL

set -e

PROJECT_DIR="${1:-.}"
EDGE_RUNTIME_VERSION="${2:-v1.69.28}"

echo "=== Corporate Proxy SSL Setup for Supabase Edge Runtime ==="

# Step 1: Create directories
mkdir -p "$PROJECT_DIR/supabase/functions"

# Step 2: Download Mozilla CA bundle
echo "Downloading Mozilla CA bundle..."
curl -sL -o /tmp/mozilla_ca_bundle.pem https://curl.se/ca/cacert.pem

# Step 3: Extract corporate certificates from connection
echo "Extracting corporate certificates from deno.land..."
echo | openssl s_client -connect deno.land:443 -servername deno.land -showcerts 2>/dev/null | \
  awk '/BEGIN CERTIFICATE/,/END CERTIFICATE/{print}' > /tmp/proxy_chain.pem

# Step 4: Also try to get from System Keychain (macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo "Extracting certificates from macOS System Keychain..."
  security find-certificate -a -p /Library/Keychains/System.keychain >> /tmp/proxy_chain.pem 2>/dev/null || true
fi

# Step 5: Create combined bundle
echo "Creating combined CA bundle..."
cat /tmp/mozilla_ca_bundle.pem /tmp/proxy_chain.pem > "$PROJECT_DIR/supabase/functions/combined_ca_bundle.pem"

# Remove duplicates (optional, keeps file smaller)
# awk '/BEGIN CERTIFICATE/,/END CERTIFICATE/' "$PROJECT_DIR/supabase/functions/combined_ca_bundle.pem" | \
#   awk 'BEGIN{RS="-----END CERTIFICATE-----\n"} !seen[$0]++ {print $0 "-----END CERTIFICATE-----"}' > /tmp/dedup.pem
# mv /tmp/dedup.pem "$PROJECT_DIR/supabase/functions/combined_ca_bundle.pem"

CERT_COUNT=$(grep -c "BEGIN CERTIFICATE" "$PROJECT_DIR/supabase/functions/combined_ca_bundle.pem")
echo "Combined bundle has $CERT_COUNT certificates"

# Step 6: Create Dockerfile
echo "Creating Dockerfile.edge_custom..."
cat > "$PROJECT_DIR/Dockerfile.edge_custom" << EOF
FROM public.ecr.aws/supabase/edge-runtime:$EDGE_RUNTIME_VERSION

USER root

# Copy the combined CA bundle (Mozilla CAs + Corporate CAs)
COPY supabase/functions/combined_ca_bundle.pem /etc/ssl/certs/ca-certificates.crt

# Set environment variables for Deno SSL verification
ENV DENO_CERT=/etc/ssl/certs/ca-certificates.crt
ENV SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
ENV REQUESTS_CA_BUNDLE=/etc/ssl/certs/ca-certificates.crt
EOF

# Step 7: Build Docker image
echo "Building custom Docker image..."
cd "$PROJECT_DIR"
docker build -f Dockerfile.edge_custom -t "public.ecr.aws/supabase/edge-runtime:$EDGE_RUNTIME_VERSION-corp" .
docker tag "public.ecr.aws/supabase/edge-runtime:$EDGE_RUNTIME_VERSION-corp" "public.ecr.aws/supabase/edge-runtime:$EDGE_RUNTIME_VERSION"

# Step 8: Update config.toml
echo "Updating supabase/config.toml..."
if ! grep -q "DENO_TLS_CA_STORE" "$PROJECT_DIR/supabase/config.toml"; then
  cat >> "$PROJECT_DIR/supabase/config.toml" << 'EOF'

# Corporate proxy CA certificates configuration (added by setup-corporate-ssl.sh)
[edge_runtime.secrets]
DENO_TLS_CA_STORE = "system"
DENO_CERT = "/etc/ssl/certs/ca-certificates.crt"
EOF
  echo "Added edge_runtime.secrets to config.toml"
else
  echo "edge_runtime.secrets already configured in config.toml"
fi

echo ""
echo "=== Setup Complete ==="
echo "Run 'supabase stop && supabase start' to apply changes"
```

## Troubleshooting

### Verify Custom Image is Being Used

```bash
# Check the image ID matches your custom build
docker images | grep edge-runtime

# After starting supabase, verify the container uses the custom image
docker inspect supabase_edge_runtime_<project-name> | jq '.[0].Config.Image'
```

### Verify Certificates in Container

```bash
# Check certificates are in the container
docker run --rm --entrypoint /bin/sh public.ecr.aws/supabase/edge-runtime:v1.69.28 -c \
  "grep -c 'BEGIN CERTIFICATE' /etc/ssl/certs/ca-certificates.crt"

# Check for your corporate certificate
docker run --rm --entrypoint /bin/sh public.ecr.aws/supabase/edge-runtime:v1.69.28 -c \
  "tail -50 /etc/ssl/certs/ca-certificates.crt" | openssl x509 -noout -subject -issuer
```

### Verify Environment Variables

```bash
# After supabase start, check env vars in container
docker inspect supabase_edge_runtime_<project-name> | jq '.[0].Config.Env[]' | grep -E "DENO|SSL"
```

### Check Edge Runtime Logs

```bash
docker logs supabase_edge_runtime_<project-name>
```

## Key Environment Variables

| Variable | Purpose | Value |
|----------|---------|-------|
| `DENO_TLS_CA_STORE` | Tells Deno where to find root CAs | `system` (uses /etc/ssl/certs/) |
| `DENO_CERT` | Additional certificates to trust | `/etc/ssl/certs/ca-certificates.crt` |
| `SSL_CERT_FILE` | Standard OpenSSL cert file location | `/etc/ssl/certs/ca-certificates.crt` |

## Files Modified/Created

| File | Purpose |
|------|---------|
| `Dockerfile.edge_custom` | Custom Docker image with corporate certs |
| `supabase/functions/combined_ca_bundle.pem` | Combined CA bundle (Mozilla + Corporate) |
| `supabase/config.toml` | Supabase configuration with DENO_TLS_CA_STORE |

## References

- [Deno Environment Variables](https://docs.deno.com/runtime/reference/env_variables/)
- [Supabase Discussion #10989 - DENO_TLS_CA_STORE](https://github.com/orgs/supabase/discussions/10989)
- [Supabase Discussion #21106 - Invalid peer certificate](https://github.com/orgs/supabase/discussions/21106)
- [Deno Issue #25331 - DENO_TLS_CA_STORE default](https://github.com/denoland/deno/issues/25331)

## Quick Setup (One Command)

A ready-to-use script is available at `scripts/setup-corporate-ssl.sh`:

```bash
# Run from project root
./scripts/setup-corporate-ssl.sh

# Or specify custom project dir and edge runtime version
./scripts/setup-corporate-ssl.sh /path/to/project v1.69.28
```

Then restart Supabase:
```bash
supabase stop && supabase start
```

## Version Compatibility

- Supabase CLI: 2.67.1+
- Edge Runtime: v1.69.28
- Deno: 2.x (configured via `deno_version = 2` in config.toml)

---

*Last updated: 2026-01-06*
