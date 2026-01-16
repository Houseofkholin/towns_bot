# How the Wager Bot Works

## Overview

The Wager Bot is a decentralized betting system where users can create and accept wagers on any topic. Each wager has its own set of admins (1-4 people) that both parties agree on, who are responsible for settling disputes and determining winners.

## Core Concepts

### 1. **Per-Wager Admins**
- Each wager has 1-4 admin addresses
- Admins are proposed by the creator
- Acceptor must agree to these admins before accepting
- Only agreed admins can settle disputes and determine winners
- This ensures both parties trust the settlement process

### 2. **Escrow System**
- When a wager is created, the creator's stake is locked in escrow
- When accepted, the acceptor's stake is also locked
- Both stakes remain locked until settlement
- Winner receives both stakes minus 5% platform fee

### 3. **Balance System**
- Users deposit funds by sending tips to the bot
- Balances are tracked in-memory (for production, use on-chain escrow)
- Stakes are deducted from balance when creating/accepting wagers
- Payouts are added to balance when wagers are settled

## Complete Workflow

### Step 1: Deposit Funds

**User Action:**
1. Send a tip to the bot in any channel
2. Bot automatically detects tip and adds to balance
3. Receive confirmation with new balance

**Command:** `/deposit` - Shows instructions
**Check Balance:** `/balance`

---

### Step 2: Create a Wager

**User Action:**
```
/create "Will it rain tomorrow?" 0.1 "Yes, it will rain" 24 0xAdmin1 0xAdmin2
```

**What Happens:**
1. Creator specifies:
   - Description: What they're wagering on
   - Stake Amount: How much they're betting (e.g., 0.1 ETH)
   - Prediction: Their answer/outcome
   - Expiration: Hours until wager expires if not accepted
   - Admins: 1-4 Ethereum addresses who will settle disputes

2. System validates:
   - User has sufficient balance
   - Stake amount is within limits (min/max)
   - Admin addresses are valid Ethereum addresses
   - Creator is not one of their own admins

3. Creator's stake is deducted and locked in escrow
4. Wager status: `open`

**Command:** `/create <description> <stake> <prediction> <hours> <admin1> [admin2] [admin3] [admin4]`

---

### Step 3: Browse Available Wagers

**User Action:**
```
/browse
```

**What You See:**
- List of all open wagers
- Description, stake amount, creator's prediction
- Number of proposed admins
- Expiration time

**Command:** `/browse`

---

### Step 4: Accept a Wager

**User Action:**
```
/accept wager_123 "No, it will not rain" agree
```

**What Happens:**
1. System shows proposed admins for review
2. Acceptor must add `agree` keyword to confirm they agree to admins
3. If not agreed, system shows admins and requires agreement
4. System validates:
   - User has sufficient balance
   - Wager is still open
   - Wager hasn't expired
   - User is not the creator

5. Acceptor's stake is deducted and locked in escrow
6. `agreedAdmins` is set (both parties have agreed)
7. Wager status: `accepted`

**Command:** `/accept <wager_id> <your_prediction> agree`

**Important:** You must add `agree` to confirm you accept the proposed admins!

---

### Step 5: Event Time Passes

**Automatic Process:**
- System checks every minute for wagers past their event time
- When event time passes, wager status changes to `pending_settlement`
- Wager is now ready for admin settlement

---

### Step 6: Admin Settlement

**Admin Action (one of the agreed admins):**
```
/settle wager_123 0xCreatorAddress
```

**What Happens:**
1. Admin reviews the wager outcome
2. Admin selects winner (creator or acceptor address)
3. System calculates:
   - Total pool = creator stake + acceptor stake
   - Platform fee = 5% of total pool
   - Winner payout = total pool - platform fee

4. Winner receives payout (added to balance)
5. Loser receives nothing (stake already deducted)
6. Platform fee is recorded
7. Wager status: `settled`
8. Both parties are notified

**Commands:**
- `/settle <wager_id> <winner_id>` - Settle wager, select winner
- `/tie <wager_id>` - Mark as tie, refund both parties

**Admin Dashboard:** `/admin` - Shows wagers where you're an admin

---

### Step 7: Dispute Resolution (Optional)

**If User Disagrees with Settlement:**

**User Action:**
```
/dispute wager_123 "The outcome was incorrectly determined"
```

**What Happens:**
1. User can dispute within 24 hours of settlement
2. Wager status: `disputed` (frozen)
3. Admin reviews dispute

**Admin Action:**
```
/resolve dispute_456 uphold    # Keep original settlement
/resolve dispute_456 reverse    # Swap winner
/resolve dispute_456 refund     # Refund both parties
```

**Commands:**
- `/dispute <wager_id> <reason>` - Open a dispute
- `/resolve <dispute_id> <action>` - Resolve dispute (admin only)

---

## Admin System Details

### How Admins Are Selected

1. **Creator Proposes:** When creating wager, creator specifies 1-4 admin addresses
2. **Acceptor Reviews:** When accepting, acceptor sees proposed admins
3. **Both Agree:** Acceptor must explicitly agree (using `agree` keyword)
4. **Admins Set:** Once both agree, `agreedAdmins` is locked in

### Admin Responsibilities

- **Settle Wagers:** Determine winner after event time
- **Handle Ties:** Mark wagers as tie and refund both parties
- **Resolve Disputes:** Review and resolve disputes within 24 hours

### Admin Permissions

- Only agreed admins can perform admin actions on a specific wager
- Admins can see all wagers where they're an admin via `/admin`
- Each wager has its own independent set of admins

---

## Payment Flow

### Deposits
- Users send tips to bot → Balance increases
- All tips are automatically detected and added to balance

### Creating Wagers
- Stake amount deducted from balance immediately
- Funds locked in escrow until settlement

### Accepting Wagers
- Matching stake amount deducted from balance
- Funds locked in escrow until settlement

### Settlements
- Winner: Receives both stakes minus 5% fee (added to balance)
- Loser: Nothing (stake already deducted)
- Platform: 5% fee collected

### Refunds
- Cancelled unwagered bets: Full refund
- Expired wagers: Auto-refund to creator
- Ties: Both parties refunded

---

## Status Flow

```
open → accepted → pending_settlement → settled
  ↓                                    ↓
cancelled                          disputed → resolved
```

**Status Meanings:**
- `open` - Created, waiting for acceptor
- `accepted` - Both parties agreed, stakes locked
- `pending_settlement` - Event time passed, awaiting admin
- `settled` - Winner determined, payout sent
- `cancelled` - Creator cancelled before acceptance
- `disputed` - User disputed settlement
- `refunded` - Both parties refunded (tie/cancelled)

---

## Key Commands

### User Commands
- `/start` - Welcome message and instructions
- `/create` - Create a new wager (with admins)
- `/browse` - View available wagers
- `/accept` - Accept a wager (must agree to admins)
- `/mywagers` - View your active wagers
- `/history` - View completed wagers
- `/balance` - Check your balance
- `/deposit` - Learn how to deposit
- `/cancel` - Cancel unwagered bet
- `/dispute` - Open dispute on settled wager

### Admin Commands
- `/admin` - View wagers where you're an admin
- `/settle` - Settle a wager (select winner)
- `/tie` - Mark wager as tie (refund both)
- `/resolve` - Resolve a dispute

---

## Security Features

✅ **Balance Validation** - Can't accept wagers without sufficient balance
✅ **Self-Acceptance Prevention** - Can't accept your own wagers
✅ **Admin Agreement Required** - Both parties must agree on admins
✅ **Admin Validation** - Only agreed admins can settle disputes
✅ **Stake Limits** - Min/max stake amounts enforced
✅ **Expiration Handling** - Auto-refunds expired unwagered bets
✅ **Dispute Window** - 24-hour window for disputes after settlement
✅ **Transaction Logging** - All financial operations logged

---

## Example Scenarios

### Scenario 1: Successful Wager

1. Alice creates: `/create "Will BTC hit $100k?" 0.5 "Yes" 48 0xAdmin1 0xAdmin2`
2. Bob accepts: `/accept wager_123 "No" agree`
3. 48 hours later, BTC hits $100k
4. Admin1 settles: `/settle wager_123 0xAliceAddress`
5. Alice receives: 0.95 ETH (0.5 + 0.5 - 0.05 fee)
6. Bob loses: 0.5 ETH (already deducted)

### Scenario 2: Disputed Wager

1. Wager is settled, Bob is declared winner
2. Alice disputes: `/dispute wager_123 "BTC didn't actually hit $100k"`
3. Admin reviews and reverses: `/resolve dispute_456 reverse`
4. Alice becomes winner, receives payout
5. Bob's payout is reversed

### Scenario 3: Tie/Cancelled

1. Wager is accepted
2. Event is cancelled (e.g., sports game postponed)
3. Admin marks tie: `/tie wager_123`
4. Both Alice and Bob receive full refunds

---

## Important Notes

⚠️ **Current Implementation:**
- Balances are stored in-memory (not persistent)
- For production, implement on-chain escrow contracts
- All admins must be valid Ethereum addresses

💡 **Best Practices:**
- Choose trusted admins who both parties know
- Use 2-3 admins for better consensus
- Review admins carefully before accepting wagers
- Admins should be neutral third parties

🔒 **Trust Model:**
- Both parties must trust the agreed admins
- Admins have full authority to settle disputes
- System enforces that only agreed admins can act
- Disputes can be opened within 24 hours

---

## Technical Details

### Storage
- In-memory storage (Map-based)
- For production: Replace with database (PostgreSQL, MongoDB, etc.)
- All transactions are logged for audit

### Platform Fee
- Fixed at 5% of total pool
- Deducted from winner payout
- Tracked in platform statistics

### Validation
- Stake amounts: Min 0.001 ETH, Max 1000 ETH
- Admin addresses: Must be valid Ethereum addresses (0x + 40 hex chars)
- Expiration: 1-168 hours (1 week max)
- Balance checks: Before all financial operations

---

This system provides a decentralized, trust-minimized way to handle wagers where both parties agree on neutral admins to resolve disputes.

