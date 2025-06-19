#!/bin/bash

# SSH Key Generation Script for Testing
# Generates comprehensive test keys for the enhanced key parser

set -e

KEYS_DIR="$(dirname "$0")/keys"
FIXTURES_DIR="$(dirname "$0")/fixtures"

echo "🔑 Generating comprehensive SSH test keys..."
echo "Keys will be saved in: $KEYS_DIR"
echo "Fixtures will be saved in: $FIXTURES_DIR"

# Clean up existing keys
rm -rf "$KEYS_DIR"/*
mkdir -p "$KEYS_DIR" "$FIXTURES_DIR"

# Test passphrases
PASSPHRASE="test123"
NO_PASSPHRASE=""

echo "📝 Creating key generation log..."
LOG_FILE="$FIXTURES_DIR/key-generation.log"
echo "# SSH Key Generation Log" > "$LOG_FILE"
echo "# Generated on: $(date)" >> "$LOG_FILE"
echo "" >> "$LOG_FILE"

# Function to generate and log keys
generate_key() {
    local key_type="$1"
    local key_name="$2"
    local extra_args="$3"
    local passphrase="$4"
    local description="$5"
    
    echo "Generating: $description"
    echo "## $description" >> "$LOG_FILE"
    echo "Key: $key_name" >> "$LOG_FILE"
    echo "Type: $key_type" >> "$LOG_FILE"
    echo "Args: $extra_args" >> "$LOG_FILE"
    echo "Passphrase: $([ -n "$passphrase" ] && echo "yes" || echo "no")" >> "$LOG_FILE"
    echo "" >> "$LOG_FILE"
    
    if [ -n "$passphrase" ]; then
        ssh-keygen -t "$key_type" $extra_args -f "$KEYS_DIR/$key_name" -N "$passphrase" -C "$description" -q
    else
        ssh-keygen -t "$key_type" $extra_args -f "$KEYS_DIR/$key_name" -N "" -C "$description" -q
    fi
    
    # Store passphrase info for tests
    if [ -n "$passphrase" ]; then
        echo "$passphrase" > "$KEYS_DIR/$key_name.passphrase"
    fi
}

echo "🔸 Generating RSA keys..."

# RSA keys - various sizes and formats
generate_key "rsa" "rsa_2048_no_pass" "-b 2048" "$NO_PASSPHRASE" "RSA 2048-bit, no passphrase"
generate_key "rsa" "rsa_2048_with_pass" "-b 2048" "$PASSPHRASE" "RSA 2048-bit, with passphrase"
generate_key "rsa" "rsa_3072_no_pass" "-b 3072" "$NO_PASSPHRASE" "RSA 3072-bit, no passphrase"
generate_key "rsa" "rsa_3072_with_pass" "-b 3072" "$PASSPHRASE" "RSA 3072-bit, with passphrase"
generate_key "rsa" "rsa_4096_no_pass" "-b 4096" "$NO_PASSPHRASE" "RSA 4096-bit, no passphrase"
generate_key "rsa" "rsa_4096_with_pass" "-b 4096" "$PASSPHRASE" "RSA 4096-bit, with passphrase"

echo "🔸 Generating Ed25519 keys..."

# Ed25519 keys
generate_key "ed25519" "ed25519_no_pass" "" "$NO_PASSPHRASE" "Ed25519, no passphrase"
generate_key "ed25519" "ed25519_with_pass" "" "$PASSPHRASE" "Ed25519, with passphrase"

echo "🔸 Generating ECDSA keys..."

# ECDSA keys - different curves
generate_key "ecdsa" "ecdsa_256_no_pass" "-b 256" "$NO_PASSPHRASE" "ECDSA P-256, no passphrase"
generate_key "ecdsa" "ecdsa_256_with_pass" "-b 256" "$PASSPHRASE" "ECDSA P-256, with passphrase"
generate_key "ecdsa" "ecdsa_384_no_pass" "-b 384" "$NO_PASSPHRASE" "ECDSA P-384, no passphrase"
generate_key "ecdsa" "ecdsa_384_with_pass" "-b 384" "$PASSPHRASE" "ECDSA P-384, with passphrase"
generate_key "ecdsa" "ecdsa_521_no_pass" "-b 521" "$NO_PASSPHRASE" "ECDSA P-521, no passphrase"
generate_key "ecdsa" "ecdsa_521_with_pass" "-b 521" "$PASSPHRASE" "ECDSA P-521, with passphrase"

echo "🔸 Converting keys to different formats..."

# Convert some RSA keys to different formats for testing
echo "Converting RSA keys to PKCS#8 format..."

# Convert to PKCS#8 unencrypted
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt -in "$KEYS_DIR/rsa_2048_no_pass" -out "$KEYS_DIR/rsa_2048_pkcs8_no_pass"
echo "" > "$KEYS_DIR/rsa_2048_pkcs8_no_pass.passphrase"  # No passphrase

# Convert to PKCS#8 encrypted
openssl pkcs8 -topk8 -inform PEM -outform PEM -passout "pass:$PASSPHRASE" -in "$KEYS_DIR/rsa_3072_no_pass" -out "$KEYS_DIR/rsa_3072_pkcs8_encrypted"
echo "$PASSPHRASE" > "$KEYS_DIR/rsa_3072_pkcs8_encrypted.passphrase"

echo "🔸 Generating keys with different ciphers..."

# Generate keys with specific encryption ciphers (for encrypted keys)
ssh-keygen -t rsa -b 2048 -f "$KEYS_DIR/rsa_aes128_cbc" -N "$PASSPHRASE" -Z aes128-cbc -C "RSA with AES128-CBC encryption" -q 2>/dev/null || echo "AES128-CBC not supported"
echo "$PASSPHRASE" > "$KEYS_DIR/rsa_aes128_cbc.passphrase" 2>/dev/null || true

ssh-keygen -t rsa -b 2048 -f "$KEYS_DIR/rsa_aes256_cbc" -N "$PASSPHRASE" -Z aes256-cbc -C "RSA with AES256-CBC encryption" -q 2>/dev/null || echo "AES256-CBC not supported"
echo "$PASSPHRASE" > "$KEYS_DIR/rsa_aes256_cbc.passphrase" 2>/dev/null || true

echo "🔸 Creating OpenSSH format keys..."

# Generate keys in OpenSSH format (newer format)
ssh-keygen -t rsa -b 2048 -f "$KEYS_DIR/rsa_openssh_no_pass" -N "" -m OpenSSH -C "RSA OpenSSH format, no passphrase" -q
ssh-keygen -t rsa -b 2048 -f "$KEYS_DIR/rsa_openssh_with_pass" -N "$PASSPHRASE" -m OpenSSH -C "RSA OpenSSH format, with passphrase" -q
echo "$PASSPHRASE" > "$KEYS_DIR/rsa_openssh_with_pass.passphrase"

ssh-keygen -t ed25519 -f "$KEYS_DIR/ed25519_openssh_no_pass" -N "" -m OpenSSH -C "Ed25519 OpenSSH format, no passphrase" -q
ssh-keygen -t ed25519 -f "$KEYS_DIR/ed25519_openssh_with_pass" -N "$PASSPHRASE" -m OpenSSH -C "Ed25519 OpenSSH format, with passphrase" -q
echo "$PASSPHRASE" > "$KEYS_DIR/ed25519_openssh_with_pass.passphrase"

echo "🔸 Creating legacy format keys..."

# Generate keys in legacy PEM format
ssh-keygen -t rsa -b 2048 -f "$KEYS_DIR/rsa_pem_no_pass" -N "" -m PEM -C "RSA PEM format, no passphrase" -q
ssh-keygen -t rsa -b 2048 -f "$KEYS_DIR/rsa_pem_with_pass" -N "$PASSPHRASE" -m PEM -C "RSA PEM format, with passphrase" -q
echo "$PASSPHRASE" > "$KEYS_DIR/rsa_pem_with_pass.passphrase"

echo "🔸 Creating test metadata..."

# Create a comprehensive key inventory
cat > "$FIXTURES_DIR/key-inventory.json" << 'EOF'
{
  "keys": [
    {
      "name": "rsa_2048_no_pass",
      "type": "rsa",
      "bits": 2048,
      "format": "pkcs1",
      "encrypted": false,
      "expectedSshType": "ssh-rsa"
    },
    {
      "name": "rsa_2048_with_pass",
      "type": "rsa", 
      "bits": 2048,
      "format": "pkcs1",
      "encrypted": true,
      "expectedSshType": "ssh-rsa"
    },
    {
      "name": "rsa_3072_no_pass",
      "type": "rsa",
      "bits": 3072,
      "format": "pkcs1", 
      "encrypted": false,
      "expectedSshType": "ssh-rsa"
    },
    {
      "name": "rsa_3072_with_pass",
      "type": "rsa",
      "bits": 3072,
      "format": "pkcs1",
      "encrypted": true,
      "expectedSshType": "ssh-rsa"
    },
    {
      "name": "rsa_4096_no_pass",
      "type": "rsa",
      "bits": 4096,
      "format": "pkcs1",
      "encrypted": false,
      "expectedSshType": "ssh-rsa"
    },
    {
      "name": "rsa_4096_with_pass",
      "type": "rsa",
      "bits": 4096,
      "format": "pkcs1",
      "encrypted": true,
      "expectedSshType": "ssh-rsa"
    },
    {
      "name": "rsa_2048_pkcs8_no_pass",
      "type": "rsa",
      "bits": 2048,
      "format": "pkcs8",
      "encrypted": false,
      "expectedSshType": "ssh-rsa"
    },
    {
      "name": "rsa_3072_pkcs8_encrypted",
      "type": "rsa",
      "bits": 3072,
      "format": "pkcs8",
      "encrypted": true,
      "expectedSshType": "ssh-rsa"
    },
    {
      "name": "rsa_openssh_no_pass",
      "type": "rsa",
      "bits": 2048,
      "format": "openssh",
      "encrypted": false,
      "expectedSshType": "ssh-rsa"
    },
    {
      "name": "rsa_openssh_with_pass",
      "type": "rsa",
      "bits": 2048,
      "format": "openssh",
      "encrypted": true,
      "expectedSshType": "ssh-rsa"
    },
    {
      "name": "rsa_pem_no_pass",
      "type": "rsa",
      "bits": 2048,
      "format": "pem",
      "encrypted": false,
      "expectedSshType": "ssh-rsa"
    },
    {
      "name": "rsa_pem_with_pass",
      "type": "rsa",
      "bits": 2048,
      "format": "pem",
      "encrypted": true,
      "expectedSshType": "ssh-rsa"
    },
    {
      "name": "ed25519_no_pass",
      "type": "ed25519",
      "format": "openssh",
      "encrypted": false,
      "expectedSshType": "ssh-ed25519"
    },
    {
      "name": "ed25519_with_pass",
      "type": "ed25519",
      "format": "openssh",
      "encrypted": true,
      "expectedSshType": "ssh-ed25519"
    },
    {
      "name": "ed25519_openssh_no_pass",
      "type": "ed25519",
      "format": "openssh",
      "encrypted": false,
      "expectedSshType": "ssh-ed25519"
    },
    {
      "name": "ed25519_openssh_with_pass",
      "type": "ed25519",
      "format": "openssh",
      "encrypted": true,
      "expectedSshType": "ssh-ed25519"
    },
    {
      "name": "ecdsa_256_no_pass",
      "type": "ecdsa",
      "bits": 256,
      "curve": "nistp256",
      "format": "openssh",
      "encrypted": false,
      "expectedSshType": "ecdsa-sha2-nistp256"
    },
    {
      "name": "ecdsa_256_with_pass",
      "type": "ecdsa",
      "bits": 256,
      "curve": "nistp256",
      "format": "openssh",
      "encrypted": true,
      "expectedSshType": "ecdsa-sha2-nistp256"
    },
    {
      "name": "ecdsa_384_no_pass",
      "type": "ecdsa",
      "bits": 384,
      "curve": "nistp384",
      "format": "openssh",
      "encrypted": false,
      "expectedSshType": "ecdsa-sha2-nistp384"
    },
    {
      "name": "ecdsa_384_with_pass",
      "type": "ecdsa",
      "bits": 384,
      "curve": "nistp384",
      "format": "openssh",
      "encrypted": true,
      "expectedSshType": "ecdsa-sha2-nistp384"
    },
    {
      "name": "ecdsa_521_no_pass",
      "type": "ecdsa",
      "bits": 521,
      "curve": "nistp521",
      "format": "openssh",
      "encrypted": false,
      "expectedSshType": "ecdsa-sha2-nistp521"
    },
    {
      "name": "ecdsa_521_with_pass",
      "type": "ecdsa",
      "bits": 521,
      "curve": "nistp521",
      "format": "openssh",
      "encrypted": true,
      "expectedSshType": "ecdsa-sha2-nistp521"
    }
  ]
}
EOF

echo "✅ Key generation complete!"
echo ""
echo "📊 Summary:"
echo "  - Generated $(find "$KEYS_DIR" -name "*.pub" | wc -l) key pairs"
echo "  - Keys saved in: $KEYS_DIR"
echo "  - Metadata saved in: $FIXTURES_DIR"
echo "  - Log file: $LOG_FILE"
echo ""
echo "🔍 Key types generated:"
echo "  - RSA: Various sizes (2048, 3072, 4096 bits)"
echo "  - Ed25519: Modern elliptic curve"
echo "  - ECDSA: P-256, P-384, P-521 curves"
echo "  - Formats: PKCS#1, PKCS#8, OpenSSH, PEM"
echo "  - With and without passphrases"
echo ""
echo "🚀 Ready for testing!"