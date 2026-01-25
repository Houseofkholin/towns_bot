import { makeTownsBot } from '@towns-protocol/bot'
import commands from './commands'
import { storage } from './storage'
import {
    handleCreateWager,
    handleBrowseWagers,
    handleAcceptWager,
    handleCreateWagerResponse,
    handleAcceptWagerResponse,
    handleMyWagers,
    handleHistory,
    handleBalance,
    handleDeposit,
    handleCancelWager,
    handleDisputeWager,
} from './wagerHandlers'
import {
    handleAdminDashboard,
    handleSettleWager,
    handleTieWager,
    handleResolveDispute,
} from './adminHandlers'
import { generateTransactionId, formatAmount } from './utils'
import type { Transaction } from './types'

const bot = await makeTownsBot(process.env.APP_PRIVATE_DATA!, process.env.JWT_SECRET!, {
    commands,
})

// Note: Global admins are no longer used - each wager has its own agreed admins
// This is kept for potential future platform-level admin features

// Periodic task to check for expired wagers and pending settlements
setInterval(() => {
    const now = new Date()
    const allWagers = storage.getAllWagers()

    for (const wager of allWagers) {
        // Auto-refund expired wagers that were never accepted
        if (wager.status === 'open' && now > wager.expirationTime) {
            const creator = storage.getUser(wager.creatorId)
            if (creator) {
                creator.balance += wager.stakeAmount
                storage.updateUser(wager.creatorId, { balance: creator.balance })

                const refundTx: Transaction = {
                    id: generateTransactionId(),
                    userId: wager.creatorId,
                    wagerId: wager.id,
                    type: 'refund',
                    amount: wager.stakeAmount,
                    status: 'completed',
                    timestamp: now,
                }
                storage.createTransaction(refundTx)

                storage.updateWager(wager.id, {
                    status: 'cancelled',
                })
            }
        }

        // Mark accepted wagers as pending settlement when event time passes
        if (
            wager.status === 'accepted' &&
            wager.acceptorId &&
            now >= wager.eventTime
        ) {
            storage.updateWager(wager.id, {
                status: 'pending_settlement',
            })
        }
    }
}, 60000) // Check every minute

// Slash Commands
bot.onSlashCommand('start', async (handler, { channelId, userId }) => {
    await handler.sendMessage(
        channelId,
        `🎲 **Welcome to the Wager Bot!**\n\n` +
            `Create and accept wagers with other users. Stakes are held in escrow until settlement.\n\n` +
            `**Available Commands:**\n` +
            `• \`/create\` - Create a new wager\n` +
            `• \`/browse\` - View available wagers\n` +
            `• \`/mywagers\` - View your active wagers\n` +
            `• \`/history\` - View completed wagers\n` +
            `• \`/balance\` - Check your balance\n` +
            `• \`/cancel <wager_id>\` - Cancel your unwagered bet\n` +
            `• \`/dispute <wager_id> <reason>\` - Open dispute\n\n` +
            `**How it works:**\n` +
            `1. Create a wager with a stake amount and select 1-4 admins\n` +
            `2. Someone accepts your wager (they must agree to your admins)\n` +
            `3. After the event time, one of the agreed admins settles the wager\n` +
            `4. Winner receives payout (both stakes minus 5% platform fee)\n\n` +
            `**Admin System:** Each wager has 1-4 admins that both parties agree on. ` +
            `These admins are responsible for settling disputes and determining winners.\n\n` +
            `**Deposits:** Use \`/deposit\` to learn how to add funds to your balance.`,
    )
})

bot.onSlashCommand('create', async (handler, event) => {
    console.log('=== WRAPPER CALLED ===')
    console.log('Event keys:', Object.keys(event))
    console.log('Full event:', event)
    console.log('event.args:', event.args)
    
    await handleCreateWager(handler, event as typeof event & { args: string[] })
})

// Handle form responses
bot.onInteractionResponse(async (handler, event) => {
    if (event.response.payload.content?.case !== 'form') return
    
    const form = event.response.payload.content.value
    const formData = new Map<string, string>()
    
    // Extract form data
    for (const component of form.components) {
        if (component.component.case === 'textInput') {
            formData.set(component.id, component.component.value.value)
        }
        if (component.component.case === 'button') {
            formData.set(component.id, 'clicked')
        }
    }
    
    const userId = event.userId as `0x${string}`
    
    // Route to appropriate handler
    if (form.requestId.startsWith('create-wager')) {
        await handleCreateWagerResponse(handler, {
            channelId: event.channelId,
            userId,
            formData
        })
    } else if (form.requestId.startsWith('accept-wager')) {
        const wagerId = form.requestId.replace('accept-wager-', '')
        await handleAcceptWagerResponse(handler, {
            channelId: event.channelId,
            userId,
            wagerId,
            formData
        })
    }
})

bot.onSlashCommand('browse', async (handler, event) => {
    await handleBrowseWagers(handler, event)
})

// Handle accept command (not in commands.ts since it's dynamic)
bot.onMessage(async (handler, event) => {
    const { message } = event
    // Check for /accept command pattern
    const acceptMatch = message.match(/^\/accept\s+(\S+)\s+(.+)$/i)
    if (acceptMatch) {
        const [, wagerId, prediction] = acceptMatch
        await handleAcceptWager(handler, {
            ...event,
            args: [wagerId, prediction],
        })
        return
    }
})

bot.onSlashCommand('mywagers', async (handler, event) => {
    await handleMyWagers(handler, event)
})

bot.onSlashCommand('history', async (handler, event) => {
    await handleHistory(handler, event)
})

bot.onSlashCommand('balance', async (handler, event) => {
    await handleBalance(handler, event)
})

bot.onSlashCommand('deposit', async (handler, event) => {
    await handleDeposit(handler, event)
})

bot.onSlashCommand('cancel', async (handler, event) => {
    await handleCancelWager(handler, event as typeof event & { args: string[] })
})

bot.onSlashCommand('dispute', async (handler, event) => {
    await handleDisputeWager(handler, event as typeof event & { args: string[] })
})

// Admin Commands
bot.onSlashCommand('admin', async (handler, event) => {
    await handleAdminDashboard(handler, event)
})

// Handle admin settle command (dynamic)
bot.onMessage(async (handler, event) => {
    const { message, channelId, userId } = event

    const settleMatch = message.match(/^\/settle\s+(\S+)\s+(\S+)$/i)
    if (settleMatch) {
        const [, wagerId, winnerId] = settleMatch
        await handleSettleWager(handler, {
            ...event,
            args: [wagerId, winnerId],
        })
        return
    }

    const tieMatch = message.match(/^\/tie\s+(\S+)$/i)
    if (tieMatch) {
        const [, wagerId] = tieMatch
        await handleTieWager(handler, {
            ...event,
            args: [wagerId],
        })
        return
    }

    const resolveMatch = message.match(/^\/resolve\s+(\S+)\s+(\S+)$/i)
    if (resolveMatch) {
        const [, disputeId, action] = resolveMatch
        await handleResolveDispute(handler, {
            ...event,
            args: [disputeId, action],
        })
        return
    }
})

// Handle tips (deposits)
bot.onTip(async (handler, event) => {
    const { channelId, receiverAddress, userId, amount } = event

    // Check if tip is to the bot
    if (receiverAddress === bot.appAddress) {
        const user = storage.getOrCreateUser(userId)
        user.balance += amount
        storage.updateUser(userId, { balance: user.balance })

        const depositTx: Transaction = {
            id: generateTransactionId(),
            userId,
            type: 'deposit',
            amount,
            status: 'completed',
            timestamp: new Date(),
        }
        storage.createTransaction(depositTx)

        await handler.sendMessage(
            channelId,
            `✅ **Deposit Received!**\n\n` +
                `You deposited ${formatAmount(amount)}\n` +
                `New balance: ${formatAmount(user.balance)}\n\n` +
                `Use \`/balance\` to check your balance anytime.`,
        )
    }
})

const app = bot.start()

// Health check endpoint for deployment platforms
app.get('/health', (c) => {
    return c.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        botAddress: bot.appAddress,
        gasWallet: bot.botId,
    })
})

// After your /webhook route
app.get('/.well-known/agent-metadata.json', async (c) => {
  return c.json(await bot.getIdentityMetadata())
})

// Graceful shutdown handling
process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully...')
    process.exit(0)
})

process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully...')
    process.exit(0)
})

export default app
