# ═══════════════════════════════════════════
# LeadFlow24 — Production Dockerfile
# ═══════════════════════════════════════════
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install dependencies (cached layer)
COPY package.json ./
RUN npm install --omit=dev

# Copy app source
COPY . .

# Create data directory for SQLite
RUN mkdir -p /app/data

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

# Start server
CMD ["node", "server.js"]
