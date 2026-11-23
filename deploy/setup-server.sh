#!/usr/bin/env bash
# One-command setup (and update) for Venner SEO on an Ubuntu/Debian VPS such as Contabo.
#
#   curl -fsSL https://raw.githubusercontent.com/rohitvariya/venner-seo/main/deploy/setup-server.sh -o setup.sh
#   sudo bash setup.sh seo.vennerinfotech.com you@vennerinfotech.com
#
# Safe to run again: it updates the code, rebuilds and restarts.
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
APP_DIR="/var/www/venner-seo"
REPO="https://github.com/rohitvariya/venner-seo.git"

say() { printf "\n\033[1;34m==> %s\033[0m\n" "$*"; }
warn() { printf "\n\033[1;33m!!  %s\033[0m\n" "$*"; }
die() { printf "\n\033[1;31mXX  %s\033[0m\n" "$*"; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root: sudo bash setup.sh <domain> <email>"
[ -n "$DOMAIN" ] && [ -n "$EMAIL" ] || die "Usage: sudo bash setup.sh seo.yourdomain.com you@yourdomain.com"
. /etc/os-release
case "$ID" in ubuntu|debian) ;; *) die "This script supports Ubuntu or Debian (found: $PRETTY_NAME)." ;; esac

# Plesk servers: Plesk owns nginx/Apache and SSL. We only run the app on a local port and
# Plesk's domain settings forward the subdomain to it (see the steps printed at the end).
PLESK=0
if [ -d /usr/local/psa ] || command -v plesk >/dev/null 2>&1; then PLESK=1; fi

# Port 80/443 must be free for nginx (or already nginx).
if [ "$PLESK" -eq 0 ] && ss -ltnp 2>/dev/null | grep -E ':(80|443)\s' | grep -qv nginx; then
  ss -ltnp | grep -E ':(80|443)\s' || true
  die "Something other than nginx (Apache, cPanel, Plesk…) is using port 80/443. Tell Claude what's running and it will adapt the setup."
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
if [ "$PLESK" -eq 1 ]; then
  say "Plesk detected: installing Redis and git only (Plesk keeps handling the web server and SSL)…"
  apt-get install -y curl git redis-server ca-certificates build-essential
  systemctl enable --now redis-server
else
  say "Installing system packages (nginx, Redis, certbot, git)…"
  apt-get install -y curl git nginx redis-server certbot python3-certbot-nginx ca-certificates build-essential
  systemctl enable --now redis-server nginx
fi
# Redis only for this server, never reachable from the internet.
sed -i 's/^bind .*/bind 127.0.0.1/' /etc/redis/redis.conf && systemctl restart redis-server

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  say "Installing Node.js 22…"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
command -v pm2 >/dev/null || { say "Installing PM2…"; npm install -g pm2; }

# Swap helps `next build` on small VPS plans.
if [ "$(free -m | awk '/Mem:/{print $2}')" -lt 3500 ] && ! swapon --show | grep -q .; then
  say "Adding 2 GB swap…"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

say "Getting the code…"
mkdir -p /var/www
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only
else
  git clone "$REPO" "$APP_DIR" || die "Could not download the code. If the GitHub repo is private, ask Claude for the deploy-key steps."
fi
cd "$APP_DIR"

if [ ! -f .env ]; then
  cp .env.example .env
  warn "Created $APP_DIR/.env. Fill it in now, then run this script again:"
  echo "    nano $APP_DIR/.env"
  echo "Copy the values from the .env on your computer. SESSION_SECRET and ENCRYPTION_KEY MUST be the same,"
  echo "otherwise saved WordPress/Google connections can't be decrypted. APP_URL and REDIS_URL are set for you."
  exit 0
fi

# Server-specific values.
set_env() { if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=\"$2\"|" .env; else echo "$1=\"$2\"" >> .env; fi; }
set_env APP_URL "https://$DOMAIN"
set_env REDIS_URL "redis://127.0.0.1:6379"   # local Redis: faster and no Upstash command limits
for k in DATABASE_URL SESSION_SECRET ENCRYPTION_KEY ANTHROPIC_API_KEY; do
  grep -Eq "^$k=\"?[^\"]+" .env || die "$k is empty in .env. Fill it in (nano $APP_DIR/.env) and run again."
done
chmod 600 .env

# Pick a free port for the app (3000, or 3010 on Plesk, unless taken by something else).
PORT=3000
[ "$PLESK" -eq 1 ] && PORT=3010
if [ -f .port ]; then PORT=$(cat .port); else
  while ss -ltn | grep -q ":$PORT\s"; do PORT=$((PORT+1)); done
  echo "$PORT" > .port
fi

say "Installing packages, updating the database and building (a few minutes)…"
npm ci
npm run db:migrate
SKIP_BUILD_CHECKS=1 NODE_OPTIONS="--max-old-space-size=2048" npm run build

say "Starting the app and worker on port $PORT…"
PORT=$PORT pm2 startOrReload deploy/ecosystem.config.cjs --update-env
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true

if [ "$PLESK" -eq 1 ]; then
  pm2 status
  say "App is running on http://127.0.0.1:$PORT. Now connect $DOMAIN in Plesk:"
  cat <<STEPS
  1. Websites & Domains → Add Subdomain (or Add Domain) → $DOMAIN
  2. On $DOMAIN → SSL/TLS Certificates → Install free Let's Encrypt certificate (tick "Redirect from http to https")
  3. On $DOMAIN → Apache & nginx Settings:
       - UNTICK "Proxy mode"
       - In "Additional nginx directives" paste:

location ~ / {
    proxy_pass http://127.0.0.1:$PORT;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_read_timeout 120s;
    client_max_body_size 110m;
}

       - Click OK
  4. Open https://$DOMAIN
STEPS
  echo "Logs: pm2 logs venner-seo-worker   |   pm2 logs venner-seo-web"
  echo "Update later: sudo bash $APP_DIR/deploy/setup-server.sh $DOMAIN $EMAIL"
  exit 0
fi

say "Configuring nginx for $DOMAIN…"
sed -e "s/seo.vennerinfotech.com/$DOMAIN/" -e "s|127.0.0.1:3000|127.0.0.1:$PORT|" deploy/nginx.conf > /etc/nginx/sites-available/venner-seo
ln -sf /etc/nginx/sites-available/venner-seo /etc/nginx/sites-enabled/venner-seo
[ -e /etc/nginx/sites-enabled/default ] && rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

SERVER_IP=$(curl -fsS4 https://api.ipify.org || hostname -I | awk '{print $1}')
DNS_IP=$(getent ahostsv4 "$DOMAIN" | awk 'NR==1{print $1}' || true)
if [ "$DNS_IP" = "$SERVER_IP" ]; then
  say "Getting a free SSL certificate…"
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect || warn "SSL failed; run: certbot --nginx -d $DOMAIN"
else
  warn "$DOMAIN points to '${DNS_IP:-nothing}', but this server is $SERVER_IP."
  echo "Add a DNS A record: $DOMAIN -> $SERVER_IP, wait 5-30 minutes, then run this script again for SSL."
fi

pm2 status
say "Done. Open https://$DOMAIN"
echo "Logs: pm2 logs venner-seo-worker   |   pm2 logs venner-seo-web"
echo "Update later: sudo bash $APP_DIR/deploy/setup-server.sh $DOMAIN $EMAIL"
