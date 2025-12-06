#!/bin/bash

# SSL Certificate Generation Script for Video Library
# Generates self-signed SSL certificates for HTTPS

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🔒 Video Library - SSL Certificate Generator${NC}"
echo "================================================"
echo ""

# Configuration
CERTS_DIR="./certs"
DAYS_VALID=365
COUNTRY="IN"
STATE="Maharashtra"
CITY="Mumbai"
ORG="Video Library"
COMMON_NAME="localhost"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --days)
      DAYS_VALID="$2"
      shift 2
      ;;
    --domain)
      COMMON_NAME="$2"
      shift 2
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

echo "Configuration:"
echo "  Certificate Directory: $CERTS_DIR"
echo "  Valid for: $DAYS_VALID days"
echo "  Common Name: $COMMON_NAME"
echo ""

# Create certs directory
if [ -d "$CERTS_DIR" ]; then
  echo -e "${YELLOW}⚠️  Certificates directory already exists${NC}"
  read -p "Do you want to regenerate certificates? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
  echo "Removing old certificates..."
  rm -rf "$CERTS_DIR"
fi

mkdir -p "$CERTS_DIR"
echo -e "${GREEN}✓${NC} Created certificates directory"

# Generate private key
echo ""
echo "Generating private key..."
openssl genrsa -out "$CERTS_DIR/private-key.pem" 2048 2>/dev/null
echo -e "${GREEN}✓${NC} Private key generated: $CERTS_DIR/private-key.pem"

# Generate certificate signing request (CSR)
echo ""
echo "Generating certificate signing request..."
openssl req -new \
  -key "$CERTS_DIR/private-key.pem" \
  -out "$CERTS_DIR/csr.pem" \
  -subj "/C=$COUNTRY/ST=$STATE/L=$CITY/O=$ORG/CN=$COMMON_NAME" \
  2>/dev/null
echo -e "${GREEN}✓${NC} CSR generated: $CERTS_DIR/csr.pem"

# Generate self-signed certificate
echo ""
echo "Generating self-signed certificate..."
openssl x509 -req \
  -days $DAYS_VALID \
  -in "$CERTS_DIR/csr.pem" \
  -signkey "$CERTS_DIR/private-key.pem" \
  -out "$CERTS_DIR/certificate.pem" \
  -extfile <(printf "subjectAltName=DNS:localhost,DNS:127.0.0.1,IP:127.0.0.1") \
  2>/dev/null
echo -e "${GREEN}✓${NC} Certificate generated: $CERTS_DIR/certificate.pem"

# Set appropriate permissions
chmod 600 "$CERTS_DIR/private-key.pem"
chmod 644 "$CERTS_DIR/certificate.pem"
echo -e "${GREEN}✓${NC} Set appropriate permissions"

# Display certificate info
echo ""
echo "================================================"
echo -e "${GREEN}✅ SSL Certificates Generated Successfully!${NC}"
echo "================================================"
echo ""
echo "Certificate Details:"
openssl x509 -in "$CERTS_DIR/certificate.pem" -noout -subject -dates -issuer

echo ""
echo "Files created:"
echo "  📄 $CERTS_DIR/private-key.pem  (Private Key)"
echo "  📄 $CERTS_DIR/certificate.pem  (Certificate)"
echo "  📄 $CERTS_DIR/csr.pem          (Certificate Signing Request)"
echo ""
echo -e "${YELLOW}⚠️  Important Notes:${NC}"
echo "  1. These are self-signed certificates for development/local use"
echo "  2. Browsers will show a security warning (this is normal)"
echo "  3. Valid for $DAYS_VALID days from today"
echo "  4. Keep private-key.pem secure and never commit to git"
echo ""
echo -e "${GREEN}Next Steps:${NC}"
echo "  1. Update config.json to enable HTTPS"
echo "  2. Restart the server: node server.js"
echo "  3. Access via: https://localhost:3000"
echo "  4. Accept the browser security warning"
echo ""
