#!/bin/bash
# ═══════════════════════════════════════════
# LeadFlow24 — Deploy Script
# ═══════════════════════════════════════════
# Usage: ./deploy.sh [railway|render|docker|local]

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'
BOLD='\033[1m'

echo ""
echo "═══════════════════════════════════════════"
echo "  LeadFlow24 — Deployment"
echo "═══════════════════════════════════════════"
echo ""

MODE=${1:-"menu"}

# ─── Check .env exists ───
check_env() {
  if [ ! -f ".env" ]; then
    echo -e "${YELLOW}⚠  No .env file found. Creating from template...${NC}"
    cp .env.example .env
    
    # Generate random secrets
    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | base64 | tr -d '/+=' | head -c 64)
    WEBHOOK_SECRET=$(openssl rand -hex 16 2>/dev/null || head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 32)
    
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s/your_jwt_secret_here/$JWT_SECRET/" .env
      sed -i '' "s/generate_another_random_string/$WEBHOOK_SECRET/" .env
    else
      sed -i "s/your_jwt_secret_here/$JWT_SECRET/" .env
      sed -i "s/generate_another_random_string/$WEBHOOK_SECRET/" .env
    fi
    
    echo -e "${GREEN}✅ .env created with auto-generated secrets${NC}"
    echo -e "${YELLOW}📝 Edit .env to add your SMTP credentials before going live${NC}"
    echo ""
  fi
}

# ─── Option 1: Railway ───
deploy_railway() {
  echo -e "${CYAN}🚂 Deploying to Railway...${NC}"
  echo ""
  
  # Check if Railway CLI is installed
  if ! command -v railway &> /dev/null; then
    echo -e "${YELLOW}Installing Railway CLI...${NC}"
    npm install -g @railway/cli
  fi
  
  # Check if git is initialized
  if [ ! -d ".git" ]; then
    git init
    git add .
    git commit -m "LeadFlow24 initial deploy"
  fi
  
  # Login and deploy
  railway login
  railway init
  
  echo ""
  echo -e "${YELLOW}Setting environment variables...${NC}"
  echo "Copy these to Railway dashboard → Variables:"
  echo ""
  grep -v "^#" .env | grep -v "^$" | while read line; do
    echo "  $line"
  done
  echo ""
  
  railway up
  
  echo ""
  echo -e "${GREEN}✅ Deployed to Railway!${NC}"
  echo -e "Run ${BOLD}railway open${NC} to view your dashboard"
}

# ─── Option 2: Render ───
deploy_render() {
  echo -e "${CYAN}🎨 Deploying to Render...${NC}"
  echo ""
  
  # Check if git is initialized
  if [ ! -d ".git" ]; then
    git init
    git add .
    git commit -m "LeadFlow24 initial deploy"
  fi
  
  echo "Steps to deploy on Render:"
  echo ""
  echo "  1. Push to GitHub:"
  echo "     git remote add origin https://github.com/YOUR_USER/leadflow24.git"
  echo "     git push -u origin main"
  echo ""
  echo "  2. Go to https://render.com/new"
  echo "  3. Connect your GitHub repo"
  echo "  4. Render will auto-detect render.yaml"
  echo "  5. Add environment variables from .env"
  echo ""
  echo -e "${GREEN}✅ render.yaml is ready. Push to GitHub and connect to Render.${NC}"
}

# ─── Option 3: Docker ───
deploy_docker() {
  echo -e "${CYAN}🐳 Building Docker image...${NC}"
  echo ""
  
  check_env
  
  docker build -t leadflow24 .
  
  echo ""
  echo -e "${GREEN}✅ Docker image built!${NC}"
  echo ""
  echo "Run locally:"
  echo "  docker run -p 3000:3000 --env-file .env -v leadflow24-data:/app/data leadflow24"
  echo ""
  echo "Push to registry:"
  echo "  docker tag leadflow24 YOUR_REGISTRY/leadflow24:latest"
  echo "  docker push YOUR_REGISTRY/leadflow24:latest"
  echo ""
  echo "Deploy to DigitalOcean App Platform:"
  echo "  1. Push image to Docker Hub or DOCR"
  echo "  2. Create App → select Docker image"
  echo "  3. Add environment variables"
  echo "  4. Deploy"
}

# ─── Option 4: Local ───
deploy_local() {
  echo -e "${CYAN}💻 Starting locally...${NC}"
  echo ""
  
  check_env
  
  # Install dependencies
  if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
  fi
  
  # Seed demo data
  echo -e "${YELLOW}Seeding demo data...${NC}"
  node seed.js
  
  echo ""
  echo -e "${GREEN}✅ Starting LeadFlow24 server...${NC}"
  echo ""
  node server.js
}

# ─── Option 5: VPS (DigitalOcean/Linode/Vultr) ───
deploy_vps() {
  echo -e "${CYAN}🖥  VPS Deployment Guide${NC}"
  echo ""
  echo "Run these commands on your VPS:"
  echo ""
  echo "  # 1. Install Node.js 20"
  echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
  echo "  sudo apt-get install -y nodejs"
  echo ""
  echo "  # 2. Clone your repo"
  echo "  git clone https://github.com/YOUR_USER/leadflow24.git"
  echo "  cd leadflow24"
  echo ""
  echo "  # 3. Install & configure"
  echo "  npm install --omit=dev"
  echo "  cp .env.example .env"
  echo "  nano .env  # Add your credentials"
  echo ""
  echo "  # 4. Seed demo data"
  echo "  node seed.js"
  echo ""
  echo "  # 5. Install PM2 for process management"
  echo "  sudo npm install -g pm2"
  echo "  pm2 start server.js --name leadflow24"
  echo "  pm2 save"
  echo "  pm2 startup  # Auto-start on reboot"
  echo ""
  echo "  # 6. Nginx reverse proxy"
  echo "  sudo apt install nginx"
  echo "  sudo nano /etc/nginx/sites-available/leadflow24"
  echo ""
  echo "  Paste this config:"
  echo "  ─────────────────────────────────────"
  cat << 'NGINX'
  server {
      listen 80;
      server_name leadflow24.com www.leadflow24.com;

      location / {
          proxy_pass http://127.0.0.1:3000;
          proxy_http_version 1.1;
          proxy_set_header Upgrade $http_upgrade;
          proxy_set_header Connection 'upgrade';
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
          proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_set_header X-Forwarded-Proto $scheme;
          proxy_cache_bypass $http_upgrade;
      }
  }
NGINX
  echo "  ─────────────────────────────────────"
  echo ""
  echo "  # 7. Enable site & SSL"
  echo "  sudo ln -s /etc/nginx/sites-available/leadflow24 /etc/nginx/sites-enabled/"
  echo "  sudo nginx -t && sudo systemctl reload nginx"
  echo "  sudo apt install certbot python3-certbot-nginx"
  echo "  sudo certbot --nginx -d leadflow24.com -d www.leadflow24.com"
  echo ""
  echo -e "${GREEN}✅ VPS deployment guide complete${NC}"
}

# ─── Menu ───
if [ "$MODE" == "menu" ]; then
  echo "Select deployment target:"
  echo ""
  echo "  1) Railway      — Easiest, $5/mo hobby plan"
  echo "  2) Render        — Free tier available"
  echo "  3) Docker        — Containerized (any host)"
  echo "  4) Local         — Development server"
  echo "  5) VPS           — DigitalOcean/Linode/Vultr"
  echo ""
  read -p "Choose (1-5): " choice
  
  case $choice in
    1) deploy_railway ;;
    2) deploy_render ;;
    3) deploy_docker ;;
    4) deploy_local ;;
    5) deploy_vps ;;
    *) echo -e "${RED}Invalid choice${NC}" ;;
  esac
elif [ "$MODE" == "railway" ]; then
  deploy_railway
elif [ "$MODE" == "render" ]; then
  deploy_render
elif [ "$MODE" == "docker" ]; then
  deploy_docker
elif [ "$MODE" == "local" ]; then
  deploy_local
elif [ "$MODE" == "vps" ]; then
  deploy_vps
fi
