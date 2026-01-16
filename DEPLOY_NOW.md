# 🚀 Deploy Your Bot Now - Step by Step

## Option 1: Render.com (Easiest - 5 minutes)

### Step 1: Push to GitHub
```bash
# If not already a git repo
git init
git add .
git commit -m "Wager bot ready for deployment"

# Create repo on GitHub, then:
git remote add origin https://github.com/YOUR_USERNAME/my-towns-bot.git
git push -u origin main
```

### Step 2: Deploy on Render
1. Go to https://render.com
2. Sign up/login
3. Click "New +" → "Web Service"
4. Connect your GitHub repository
5. Configure:
   - **Name:** wager-bot (or any name)
   - **Environment:** Node
   - **Build Command:** `bun install`
   - **Start Command:** `bun run start`
6. Add Environment Variables:
   - Click "Environment"
   - Add `APP_PRIVATE_DATA` (copy from your .env)
   - Add `JWT_SECRET` (copy from your .env)
7. Click "Create Web Service"
8. Wait for deployment (2-3 minutes)
9. Copy your service URL (e.g., `https://wager-bot.onrender.com`)

### Step 3: Configure Webhook
1. Go to https://app.towns.com/developer
2. Select your bot
3. Set Webhook URL: `https://YOUR-RENDER-URL.onrender.com/webhook`
4. Save

### Step 4: Test
1. Install bot in your Towns Space
2. Add to a channel
3. Send `/start` - bot should respond!

---

## Option 2: Quick Local Test with Tunnel

```bash
# Terminal 1: Start bot
bun run start

# Terminal 2: Expose with ngrok (install: brew install ngrok)
ngrok http 5123

# Copy the ngrok URL (e.g., https://abc123.ngrok.io)
# Set webhook in Developer Portal: https://abc123.ngrok.io/webhook
```

---

## Your Bot is Ready! ✅

- ✅ Code compiles
- ✅ Environment variables set
- ✅ Health check endpoint ready
- ✅ All features implemented

Just choose a deployment platform and follow the steps above!
