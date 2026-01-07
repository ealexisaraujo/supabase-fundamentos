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

# Step 8: Update config.toml if needed
echo "Checking supabase/config.toml..."
if ! grep -q "DENO_TLS_CA_STORE" "$PROJECT_DIR/supabase/config.toml" 2>/dev/null; then
  echo "Adding edge_runtime.secrets to config.toml..."

  # Check if [edge_runtime.secrets] section exists
  if grep -q "\[edge_runtime.secrets\]" "$PROJECT_DIR/supabase/config.toml" 2>/dev/null; then
    echo "Warning: [edge_runtime.secrets] exists but DENO_TLS_CA_STORE not found. Please manually add:"
    echo '  DENO_TLS_CA_STORE = "system"'
    echo '  DENO_CERT = "/etc/ssl/certs/ca-certificates.crt"'
  else
    cat >> "$PROJECT_DIR/supabase/config.toml" << 'EOF'

# Corporate proxy CA certificates configuration (added by setup-corporate-ssl.sh)
[edge_runtime.secrets]
DENO_TLS_CA_STORE = "system"
DENO_CERT = "/etc/ssl/certs/ca-certificates.crt"
EOF
    echo "Added edge_runtime.secrets to config.toml"
  fi
else
  echo "edge_runtime.secrets already configured in config.toml"
fi

echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "  1. Run: supabase stop"
echo "  2. Run: supabase start"
echo ""
echo "To verify:"
echo "  docker logs supabase_edge_runtime_\$(basename \$PWD) 2>&1 | tail -5"
