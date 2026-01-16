# Deployment Guide

This guide covers deploying the Wager Bot to various platforms.

## Prerequisites

1. **Bot Credentials** from [Towns Developer Portal](https://app.towns.com/developer):
   - `APP_PRIVATE_DATA` (base64 encoded)
   - `JWT_SECRET`

2. **Environment Setup:**
   ```bash
   cp .env.sample .env
   # Edit .env with your credentials
   ```

## Local Development & Testing

### 1. Start the Bot

```bash
bun install
bun run dev
```

The bot will run on port 5123 (or PORT from .env).

### 2. Expose Webhook

You need to expose your local server to the internet for webhooks:

**Option A: Tailscale Funnel (Recommended)**
```bash
tailscale funnel 5123
# Creates URL like: https://your-machine.taild8e1b0.ts.net/
```

**Option B: ngrok**
```bash
ngrok http 5123
# Creates URL like: https://abc123.ngrok.io
```

### 3. Configure Webhook in Developer Portal

1. Go to https://app.towns.com/developer
2. Select your bot
3. Set Webhook URL to: `https://your-tunnel-url/webhook`
4. Save changes

### 4. Install Bot in Towns

1. Go to your Space settings
2. Navigate to Integrations
3. Install your bot
4. Add bot to specific channels (Channel Settings → Integrations)

### 5. Test

- Send `/start` in a channel with the bot
- Check bot logs for incoming events
- Verify commands work correctly

---

## Production Deployment

### Option 1: Render.com (Recommended)

1. **Create New Web Service:**
   - Connect your Git repository
   - Select "Web Service"

2. **Configure Build:**
   - **Build Command:** `bun install`
   - **Start Command:** `bun run start`
   - **Environment:** Node 20+

3. **Set Environment Variables:**
   ```
   APP_PRIVATE_DATA=your_base64_encoded_private_data
   JWT_SECRET=your_jwt_secret
   PORT=10000
   ```

4. **Deploy:**
   - Render will automatically deploy on git push
   - Get your service URL (e.g., `https://my-towns-bot.onrender.com`)

5. **Update Webhook:**
   - Go to https://app.towns.com/developer
   - Set Webhook URL to: `https://my-towns-bot.onrender.com/webhook`

6. **Health Check:**
   - Render will use `/health` endpoint automatically
   - Verify: `https://my-towns-bot.onrender.com/health`

---

### Option 2: Railway

1. **Create New Project:**
   - Connect your Git repository
   - Railway will auto-detect Bun

2. **Configure:**
   - **Start Command:** `bun run start`
   - Add environment variables:
     - `APP_PRIVATE_DATA`
     - `JWT_SECRET`
     - `PORT` (optional, Railway provides)

3. **Deploy:**
   - Railway auto-deploys on push
   - Get your service URL

4. **Update Webhook:**
   - Set webhook URL in Developer Portal

---

### Option 3: Fly.io

1. **Install Fly CLI:**
   ```bash
   curl -L https://fly.io/install.sh | sh
   ```

2. **Create App:**
   ```bash
   fly launch
   ```

3. **Create fly.toml:**
   ```toml
   app = "my-towns-bot"
   primary_region = "iad"

   [build]
     builder = "paketobuildpacks/builder:base"

   [http_service]
     internal_port = 5123
     force_https = true
     auto_stop_machines = true
     auto_start_machines = true
     min_machines_running = 0

   [[services]]
     http_checks = []
     internal_port = 5123
     processes = ["app"]
     protocol = "tcp"
     script_checks = []

     [services.concurrency]
       hard_limit = 25
       soft_limit = 20
       type = "connections"

     [[services.ports]]
       force_https = true
       handlers = ["http"]
       port = 80

     [[services.ports]]
       handlers = ["tls", "http"]
       port = 443

     [[services.tcp_checks]]
       grace_period = "1s"
       interval = "15s"
       restart_limit = 0
       timeout = "2s"
   ```

4. **Set Secrets:**
   ```bash
   fly secrets set APP_PRIVATE_DATA=your_data
   fly secrets set JWT_SECRET=your_secret
   ```

5. **Deploy:**
   ```bash
   fly deploy
   ```

---

### Option 4: VPS (DigitalOcean, AWS EC2, etc.)

1. **SSH into your server**

2. **Install Bun:**
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

3. **Clone Repository:**
   ```bash
   git clone your-repo-url
   cd my-towns-bot
   ```

4. **Install Dependencies:**
   ```bash
   bun install
   ```

5. **Create .env file:**
   ```bash
   cp .env.sample .env
   nano .env  # Edit with your credentials
   ```

6. **Use PM2 for Process Management:**
   ```bash
   npm install -g pm2
   pm2 start "bun run start" --name wager-bot
   pm2 save
   pm2 startup
   ```

7. **Set up Nginx (Reverse Proxy):**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;

       location / {
           proxy_pass http://localhost:5123;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

8. **Set up SSL (Let's Encrypt):**
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

9. **Update Webhook:**
   - Set webhook URL to: `https://your-domain.com/webhook`

---

## Environment Variables

### Required

- `APP_PRIVATE_DATA` - Bot credentials (base64 encoded)
- `JWT_SECRET` - Webhook authentication secret

### Optional

- `PORT` - Server port (default: 5123)
- `BASE_RPC_URL` - Base network RPC endpoint
- `DATABASE_URL` - Database connection string (if using persistent storage)

---

## Health Check

The bot includes a health check endpoint at `/health`:

```bash
curl https://your-bot-url/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "botAddress": "0x...",
  "gasWallet": "0x..."
}
```

---

## Monitoring

### Logs

- **Render:** View logs in dashboard
- **Railway:** View logs in dashboard
- **Fly.io:** `fly logs`
- **PM2:** `pm2 logs wager-bot`

### Alerts

Set up monitoring for:
- Health check endpoint (should return 200)
- Bot response times
- Error rates
- Webhook delivery failures

---

## Troubleshooting

### Bot Not Responding

1. Check if bot is running: `curl https://your-bot-url/health`
2. Check logs for errors
3. Verify webhook URL in Developer Portal
4. Ensure bot is installed in Space and added to channel

### Webhook Not Receiving Events

1. Verify webhook URL is correct
2. Check firewall/security group settings
3. Ensure HTTPS is enabled (required)
4. Check bot logs for incoming requests

### Database Connection Issues

If using a database:
1. Verify `DATABASE_URL` is correct
2. Check database is accessible from deployment platform
3. Ensure connection pool settings are appropriate

---

## Security Checklist

- [ ] Environment variables are set as secrets (not in code)
- [ ] HTTPS is enabled (required for webhooks)
- [ ] Bot credentials are kept secure
- [ ] Webhook URL uses HTTPS
- [ ] Database credentials are secure (if using)
- [ ] Rate limiting considered (if needed)

---

## Next Steps

1. **Persistent Storage:** Replace in-memory storage with database
2. **On-Chain Escrow:** Implement smart contracts for true escrow
3. **Monitoring:** Set up error tracking (Sentry, etc.)
4. **Backups:** Regular database backups (if using DB)
5. **Scaling:** Consider load balancing for high traffic

---

## Support

For issues:
- Check bot logs
- Verify webhook configuration
- Test health endpoint
- Review Towns Protocol documentation
