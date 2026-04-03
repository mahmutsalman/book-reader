#!/bin/bash
# Sets up the Squirrel.Mac update server on the VPS.
# Safe to run multiple times (idempotent).
#
# Usage: RELEASES_DIR=/path/to/releases bash vps-setup-update-server.sh

set -e

RELEASES_DIR="${RELEASES_DIR:-/var/www/smartbook/releases}"
SERVER_DIR="/opt/smartbook"
SERVICE_NAME="smartbook-update"
PORT=3001

echo "=== Smart Book Update Server Setup ==="
echo "Releases dir: $RELEASES_DIR"
echo "Server dir:   $SERVER_DIR"
echo "Port:         $PORT"
echo ""

# --- 1. Ensure Node.js is available ---
if ! command -v node &>/dev/null; then
  echo "Node.js not found — installing via NodeSource..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "Node.js: $(node --version)"

# --- 2. Create server directory ---
mkdir -p "$SERVER_DIR"
cp "$(dirname "$0")/vps-update-server.js" "$SERVER_DIR/update-server.js"
chmod 644 "$SERVER_DIR/update-server.js"
echo "Server script deployed to $SERVER_DIR/update-server.js"

# --- 3. Create systemd service ---
cat > "/etc/systemd/system/${SERVICE_NAME}.service" << EOF
[Unit]
Description=Smart Book Squirrel.Mac Update Server
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node ${SERVER_DIR}/update-server.js
Restart=on-failure
RestartSec=5
Environment=RELEASES_DIR=${RELEASES_DIR}
Environment=UPDATE_SERVER_PORT=${PORT}

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"
echo "systemd service '${SERVICE_NAME}' started"

# --- 4. Configure nginx proxy for /update/ ---
# Find the nginx config that serves our domain
NGINX_CONF=$(grep -rl "smartbook.mahmutsalman.cloud" /etc/nginx/ 2>/dev/null | grep -v '.bak' | head -1)

if [ -z "$NGINX_CONF" ]; then
  echo ""
  echo "WARNING: Could not auto-detect nginx config."
  echo "Add this location block manually to your nginx server block:"
  echo ""
  echo "    location /update/ {"
  echo "        proxy_pass http://127.0.0.1:${PORT};"
  echo "        proxy_set_header Host \$host;"
  echo "    }"
  echo ""
else
  if grep -q "location /update/" "$NGINX_CONF"; then
    echo "nginx already has /update/ location in $NGINX_CONF"
  else
    # Insert the location block before the last closing brace of the last server block
    python3 - "$NGINX_CONF" "$PORT" << 'PYEOF'
import sys, re

conf_file = sys.argv[1]
port = sys.argv[2]

with open(conf_file, 'r') as f:
    content = f.read()

location_block = f"""
    location /update/ {{
        proxy_pass http://127.0.0.1:{port};
        proxy_set_header Host $host;
    }}
"""

# Insert before the last closing brace
last_brace = content.rfind('\n}')
if last_brace == -1:
    print(f"Could not find closing brace in {conf_file}")
    sys.exit(1)

new_content = content[:last_brace] + location_block + content[last_brace:]

with open(conf_file, 'w') as f:
    f.write(new_content)

print(f"Added /update/ proxy to {conf_file}")
PYEOF

    # Validate and reload
    if nginx -t 2>/dev/null; then
      systemctl reload nginx
      echo "nginx reloaded successfully"
    else
      echo "ERROR: nginx config test failed. Check $NGINX_CONF manually."
      exit 1
    fi
  fi
fi

echo ""
echo "=== Setup complete ==="
echo "Test: curl -s http://127.0.0.1:${PORT}/update/darwin/arm64/0.0.1"
echo "Expected: JSON with url field (if latest.json exists and has darwin-arm64)"
