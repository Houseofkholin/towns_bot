# Wager Bot - Decentralized Betting System

A Towns Protocol bot for creating and managing wagers with per-wager admin systems. Users can create bets, accept wagers, and have disputes settled by mutually agreed-upon admins.

## Features

- 🎲 **Create Wagers** - Set up bets with custom descriptions, stakes, and predictions
- 👥 **Per-Wager Admins** - Each wager has 1-4 admins that both parties agree on
- 💰 **Escrow System** - Stakes are locked until settlement
- ⚖️ **Dispute Resolution** - 24-hour dispute window with admin review
- 📊 **Balance Management** - Deposit funds via tips, track balances
- 🔒 **Secure** - Only agreed admins can settle disputes

## Quick Start

### 1. Setup

```bash
# Clone repository
git clone <your-repo-url>
cd my-towns-bot

# Install dependencies
bun install

# Configure environment
cp .env.sample .env
# Edit .env with your credentials from https://app.towns.com/developer
```

### 2. Run Locally

```bash
# Development mode (with watch)
bun run dev

# Production mode
bun run start
```

### 3. Deploy

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

**Quick Deploy to Render:**
1. Connect your Git repo to Render
2. Set build command: `bun install`
3. Set start command: `bun run start`
4. Add environment variables: `APP_PRIVATE_DATA`, `JWT_SECRET`
5. Set webhook URL in Developer Portal: `https://your-app.onrender.com/webhook`

## Commands

### User Commands
- `/start` - Welcome message and instructions
- `/create` - Create a new wager (with 1-4 admins)
- `/browse` - View available wagers
- `/accept` - Accept a wager (must agree to admins)
- `/mywagers` - View your active wagers
- `/history` - View completed wagers
- `/balance` - Check your balance
- `/deposit` - Learn how to deposit funds
- `/cancel` - Cancel unwagered bet
- `/dispute` - Open dispute on settled wager

### Admin Commands
- `/admin` - View wagers where you're an admin
- `/settle` - Settle a wager (select winner)
- `/tie` - Mark wager as tie (refund both)
- `/resolve` - Resolve a dispute

## Environment Variables

Required:
- `APP_PRIVATE_DATA` - Your Towns app private data (base64 encoded)
- `JWT_SECRET` - JWT secret for webhook authentication

Optional:
- `PORT` - Port to run the bot on (default: 5123)
- `BASE_RPC_URL` - Base network RPC endpoint
- `DATABASE_URL` - Database connection string

## Documentation

- [HOW_IT_WORKS.md](./HOW_IT_WORKS.md) - Complete system explanation
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Deployment guide
- [PAYMENT_FLOW.md](./PAYMENT_FLOW.md) - Payment system details

## Code Structure

```
src/
├── index.ts          # Main bot logic and event handlers
├── commands.ts       # Slash command definitions
├── types.ts          # TypeScript type definitions
├── storage.ts        # In-memory storage (replace with DB for production)
├── utils.ts          # Helper functions and validations
├── wagerHandlers.ts  # User-facing command handlers
└── adminHandlers.ts  # Admin command handlers
```

## Development

```bash
# Type checking
bun run typecheck

# Linting
bun run lint

# Run tests
bun run test-bot.ts
```

## Production Considerations

⚠️ **Current Implementation:**
- Uses in-memory storage (data lost on restart)
- For production, implement database persistence
- Consider on-chain escrow for true security

✅ **Ready for Production:**
- Health check endpoint (`/health`)
- Graceful shutdown handling
- Error handling and validation
- Transaction logging

## License

MIT
