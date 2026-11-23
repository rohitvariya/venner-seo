# Putting Venner SEO online

## Quick way (Ubuntu/Debian VPS, e.g. Contabo)
```bash
ssh root@YOUR_SERVER_IP
curl -fsSL https://raw.githubusercontent.com/rohitvariya/venner-seo/main/deploy/setup-server.sh -o setup.sh
sudo bash setup.sh seo.vennerinfotech.com you@vennerinfotech.com
# first run creates /var/www/venner-seo/.env: fill it in (nano), then run the same command again
```
On a **Plesk** server the script detects Plesk, leaves its web server alone, runs the app on port 3010 and prints the
Plesk steps (add subdomain, Let's Encrypt, untick Proxy mode, paste the nginx directives).

Otherwise the script installs everything, uses a local Redis, builds, starts with PM2, sets up nginx and free SSL,
and is safe to re-run to update. The manual steps below do the same by hand.

Works on any Linux server (Ubuntu 22.04/24.04 recommended) with 2 GB+ RAM. The database (Neon) and
Redis (Upstash) stay where they are, so the server only runs the app.

## 1. Point a domain at the server
Add a DNS **A record** for e.g. `seo.vennerinfotech.com` → your server's IP.

## 2. Install Node 22, PM2, nginx and certbot (once)
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx git
sudo npm install -g pm2
```

## 3. Get the code and settings
```bash
cd /var/www
git clone https://github.com/rohitvariya/venner-seo.git
cd venner-seo
cp .env.example .env
nano .env        # paste the same values as on your computer, but set:
                 #   APP_URL="https://seo.vennerinfotech.com"
```

## 4. Build and start
```bash
npm ci
npm run db:migrate
npm run build
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup      # run the command it prints, so the app starts after a reboot
```

## 5. nginx + free SSL
```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/venner-seo
sudo nano /etc/nginx/sites-available/venner-seo   # change the domain
sudo ln -s /etc/nginx/sites-available/venner-seo /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d seo.vennerinfotech.com
```

## 6. Google sign-in on the live address
In Google Cloud → APIs & Services → Credentials → your OAuth client, add these **Authorised redirect URIs**:
- `https://seo.vennerinfotech.com/api/integrations/gsc/callback`
- `https://seo.vennerinfotech.com/api/integrations/gbp/callback`

## 7. Stop the copy on your computer
Only one worker should run against the same database and Redis. Once the server is live, stop
`npm run worker` on your PC (or point your PC at a separate test database).

## Updating later
```bash
cd /var/www/venner-seo && bash deploy/update.sh
```

## Useful commands
- `pm2 status`: are both processes running?
- `pm2 logs venner-seo-worker`: background jobs log
- `pm2 logs venner-seo-web`: website log
