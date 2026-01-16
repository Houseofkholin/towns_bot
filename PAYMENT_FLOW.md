# Payment Flow Documentation

## How Users Pay in the Wager Bot

### 1. **Depositing Funds**

Users deposit funds by **sending tips** to the bot:

1. In any channel where the bot is present, long-press on any message from the bot
2. Select "Tip" or the tip icon
3. Enter the amount you want to deposit (in ETH or supported tokens)
4. Confirm the transaction
5. The bot automatically detects the tip and adds it to your balance
6. You'll receive a confirmation message with your new balance

**Command:** Use `/deposit` to see detailed instructions.

### 2. **Creating Wagers**

When you create a wager:
- The stake amount is **immediately deducted** from your balance
- Your stake is held in **escrow** until the wager is settled
- If no one accepts your wager before expiration, you get a **full refund**

**Example:**
```
User balance: 1.0 ETH
Create wager with 0.1 ETH stake
→ Balance after: 0.9 ETH
→ 0.1 ETH locked in escrow
```

### 3. **Accepting Wagers**

When you accept someone's wager:
- The matching stake amount is **deducted** from your balance
- Both stakes are held in **escrow** until settlement
- The wager status changes to "accepted"

**Example:**
```
User balance: 1.0 ETH
Accept wager with 0.1 ETH stake
→ Balance after: 0.9 ETH
→ 0.1 ETH locked in escrow (total pool: 0.2 ETH)
```

### 4. **Settlement & Payouts**

When an admin settles a wager:
- **Winner receives:** Both stakes minus 5% platform fee
- **Loser receives:** Nothing (stake is lost)
- **Platform receives:** 5% fee from total pool

**Example:**
```
Total pool: 0.2 ETH (0.1 ETH from each user)
Platform fee (5%): 0.01 ETH
Winner payout: 0.19 ETH
→ Winner balance increases by 0.19 ETH
→ Loser balance unchanged (already deducted)
```

### 5. **Cancellations & Refunds**

- **Unwagered bets:** If you cancel a wager before anyone accepts, you get a full refund
- **Ties:** If admin marks a wager as a tie, both users get full refunds
- **Expired wagers:** If your wager expires without being accepted, you get a full refund

### 6. **Disputes**

If a wager is disputed:
- The wager is **frozen** until resolution
- Admin can: uphold result, reverse result, or refund both users
- Resolution happens within 24 hours of dispute opening

## Payment Methods

### Currently Supported
- **Tips via Towns Protocol** - Users send tips directly to the bot
- **ETH and ERC-20 tokens** - Any token supported by Towns Protocol tips

### Balance Tracking
- All balances are tracked **in-memory** (in current implementation)
- For production, consider migrating to on-chain escrow contracts
- All transactions are logged for audit purposes

## Security Notes

- ✅ Balance validation before accepting wagers
- ✅ Prevents self-acceptance
- ✅ Stake amount limits (min/max)
- ✅ Transaction logging for all operations
- ⚠️ Current implementation uses in-memory storage (not persistent)
- ⚠️ For production, implement on-chain escrow for true security

## Commands Related to Payments

- `/balance` - Check your current balance and stats
- `/deposit` - Learn how to deposit funds
- `/create` - Create a wager (deducts stake from balance)
- `/accept` - Accept a wager (deducts stake from balance)
- `/cancel` - Cancel unwagered bet (refunds stake)

