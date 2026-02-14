# LeadFlow24 — Deployment Guide

## Quick Start (Local)

```bash
# 1. Install dependencies
npm install

# 2. Create your config
cp .env.example .env
# Edit .env with your SMTP credentials

# 3. Seed demo data
node seed.js

# 4. Start server
node server.js
# → http://localhost:3000
```

---

## Deploy to Railway (Recommended — $5/mo)

Railway is the fastest path to production. One command, SSL included, custom domain support.

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Initialize git
git init && git add . && git commit -m "initial"

# 3. Deploy
railway login
railway init
railway up
```

Then in the **Railway Dashboard → Variables**, add:

| Variable | Value |
|---|---|
| `PORT` | `3000` |
| `NODE_ENV` | `production` |
| `BASE_URL` | `https://your-app.up.railway.app` |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | Your Gmail address |
| `SMTP_PASS` | Gmail App Password (see below) |
| `NOTIFICATION_EMAIL` | Your email for alerts |
| `JWT_SECRET` | Run: `openssl rand -hex 32` |
| `WEBHOOK_SECRET` | Run: `openssl rand -hex 16` |

**Custom Domain:** Railway Settings → Networking → Add `leadflow24.com`

---

## Deploy to Render (Free Tier Available)

```bash
# 1. Push to GitHub
git init && git add . && git commit -m "initial"
git remote add origin https://github.com/YOUR_USER/leadflow24.git
git push -u origin main

# 2. Go to https://render.com/new
# 3. Connect GitHub repo — Render auto-detects render.yaml
# 4. Add environment variables
# 5. Deploy
```

**Note:** Render free tier sleeps after 15 min of inactivity. The $7/mo Starter plan keeps it always on.

---

## Deploy with Docker

```bash
# Build
docker build -t leadflow24 .

# Run
docker run -d \
  --name leadflow24 \
  -p 3000:3000 \
  --env-file .env \
  -v leadflow24-data:/app/data \
  --restart unless-stopped \
  leadflow24
```

Works on any Docker host: DigitalOcean, AWS, Fly.io, etc.

---

## Deploy to VPS ($6/mo — DigitalOcean/Linode/Vultr)

Best price-to-performance for production. Run `./deploy.sh vps` for the full step-by-step, or:

```bash
# On your VPS:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git nginx

git clone https://github.com/YOUR_USER/leadflow24.git
cd leadflow24
npm install --omit=dev
cp .env.example .env && nano .env
node seed.js

# PM2 process manager
sudo npm install -g pm2
pm2 start server.js --name leadflow24
pm2 save && pm2 startup

# Nginx + SSL
sudo certbot --nginx -d leadflow24.com
```

---

## Gmail SMTP Setup

1. Go to [Google Account → Security](https://myaccount.google.com/security)
2. Enable **2-Step Verification**
3. Go to **App Passwords** → Generate one for "Mail"
4. Use that 16-character password as `SMTP_PASS`

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=yourname@gmail.com
SMTP_PASS=abcd efgh ijkl mnop
```

---

## File Structure

```
leadflow24/
├── server.js          # Express API (all routes)
├── seed.js            # Demo data seeder
├── package.json       # Dependencies
├── .env.example       # Config template
├── Dockerfile         # Container config
├── Procfile           # Railway/Heroku/Render
├── railway.json       # Railway config
├── render.yaml        # Render config
├── deploy.sh          # Deploy helper script
└── public/            # Frontend (served by Express)
    ├── index.html     # Main marketing site
    ├── trial.html     # Free trial signup page
    └── quote/         # Lead capture pages
        ├── hvac/
        │   ├── edmonton.html
        │   └── toronto.html
        ├── roofing/
        │   ├── edmonton.html
        │   └── toronto.html
        └── plumbing/
            ├── edmonton.html
            └── toronto.html
```

---

## Live URLs After Deploy

| Page | URL |
|---|---|
| Marketing site | `leadflow24.com` |
| Free trial | `leadflow24.com/trial` |
| HVAC Edmonton capture | `leadflow24.com/quote/hvac/edmonton` |
| HVAC Toronto capture | `leadflow24.com/quote/hvac/toronto` |
| Roofing Edmonton | `leadflow24.com/quote/roofing/edmonton` |
| Plumbing Toronto | `leadflow24.com/quote/plumbing/toronto` |
| Health check | `leadflow24.com/api/health` |
| Admin overview | `leadflow24.com/api/admin/overview` |

---

## Post-Deploy Checklist

- [ ] Verify `leadflow24.com/api/health` returns `{ status: "ok" }`
- [ ] Test trial signup at `/trial`
- [ ] Check notification email arrives
- [ ] Run `node seed.js` for demo data
- [ ] Test a capture page lead submission
- [ ] Set up Cloudflare DNS (A record → your server IP)
- [ ] Enable SSL (auto with Railway/Render, Certbot for VPS)
- [ ] Set up UptimeRobot monitoring on `/api/health`
- [ ] Connect Stripe webhook to `/api/webhooks/stripe`
- [ ] Configure Facebook Lead Ads webhook
