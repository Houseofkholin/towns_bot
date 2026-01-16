# Deployment Checklist

## Pre-Deployment

- [x] Health check endpoint added (`/health`)
- [x] Graceful shutdown handling
- [x] Environment variables documented
- [x] TypeScript compilation passes
- [x] All features tested

## Quick Deploy Steps

### 1. Get Bot Credentials
- [ ] Go to https://app.towns.com/developer
- [ ] Create or select your bot
- [ ] Copy `APP_PRIVATE_DATA` (base64)
- [ ] Copy `JWT_SECRET`

### 2. Choose Deployment Platform

**Option A: Render.com (Easiest)**
- [ ] Create account at render.com
- [ ] Connect Git repository
- [ ] Create new Web Service
- [ ] Set build command: `bun install`
- [ ] Set start command: `bun run start`
- [ ] Add environment variables:
  - `APP_PRIVATE_DATA`
  - `JWT_SECRET`
- [ ] Deploy
- [ ] Get service URL (e.g., `https://my-bot.onrender.com`)

**Option B: Railway**
- [ ] Create account at railway.app
- [ ] Connect Git repository
- [ ] Add environment variables
- [ ] Deploy
- [ ] Get service URL

**Option C: Fly.io**
- [ ] Install Fly CLI
- [ ] Run `fly launch`
- [ ] Set secrets: `fly secrets set APP_PRIVATE_DATA=...`
- [ ] Deploy: `fly deploy`

### 3. Configure Webhook

- [ ] Go to https://app.towns.com/developer
- [ ] Select your bot
- [ ] Set Webhook URL to: `https://your-service-url/webhook`
- [ ] Save changes

### 4. Install Bot in Towns

- [ ] Go to your Space settings
- [ ] Navigate to Integrations
- [ ] Install your bot
- [ ] Add bot to specific channels

### 5. Test

- [ ] Send `/start` in a channel
- [ ] Verify bot responds
- [ ] Test `/balance` command
- [ ] Check health endpoint: `curl https://your-service-url/health`

## Post-Deployment

- [ ] Monitor logs for errors
- [ ] Set up alerts (if available)
- [ ] Test all commands
- [ ] Verify webhook is receiving events
- [ ] Document your deployment URL

## Troubleshooting

If bot doesn't respond:
1. Check health endpoint returns 200
2. Verify webhook URL is correct
3. Check bot logs for errors
4. Ensure bot is installed in Space and channel

