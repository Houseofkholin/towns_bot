import type { BotHandler } from '@towns-protocol/bot'
import { storage } from './storage'
import {
    generateWagerId,
    generateTransactionId,
    generateDisputeId,
    validateStakeAmount,
    formatAmount,
    calculateWinnerPayout,
    canAcceptWager,
    canCancelWager,
    canDisputeWager,
    formatWagerStatus,
    formatDate,
    hasSufficientBalance,
} from './utils'
import type { Wager, Transaction } from './types'
import { parseEther } from 'viem'

export async function handleCreateWager(
    handler: BotHandler,
    event: { channelId: string; userId: string; args: string[] },
) {
    const { channelId, userId, args } = event

    // NEW FORMAT: /create <stake_amount> <expiration_hours> <admin1> [admin2] [admin3] [admin4] <rest is description and prediction>
    // Example: /create 0.1 24 0x123... 0x456... Will it rain tomorrow? I predict yes
    
    if (args.length < 3) {
        await handler.sendMessage(
            channelId,
            '**Usage:** `/create <stake> <hours> <admin1> [admin2] [...] <description and prediction>`\n\n' +
                '**Example:** `/create 0.1 24 0x1234567890123456789012345678901234567890 Will it rain tomorrow? I predict yes`\n\n' +
                '**Parameters:**\n' +
                '• Stake: Amount in ETH (e.g., 0.1)\n' +
                '• Hours: Hours until expiration (1-168)\n' +
                '• Admins: 1-4 admin addresses (space separated)\n' +
                '• Description: Everything after admins is your wager description and prediction\n\n' +
                '**Multi-admin example:**\n' +
                '`/create 0.5 48 0x123... 0x456... 0x789... Bitcoin hits 100k by Friday`'
        )
        return
    }

    const stakeStr = args[0]
    const expirationHours = parseInt(args[1], 10)

    if (isNaN(expirationHours) || expirationHours < 1 || expirationHours > 168) {
        await handler.sendMessage(
            channelId,
            '❌ Expiration must be between 1 and 168 hours (1 week)'
        )
        return
    }

    // Find admin addresses (they start with 0x)
    const proposedAdmins: string[] = []
    let descriptionStartIndex = 2

    for (let i = 2; i < args.length; i++) {
        if (args[i].startsWith('0x') && /^0x[a-fA-F0-9]{40}$/.test(args[i])) {
            proposedAdmins.push(args[i])
            descriptionStartIndex = i + 1
        } else {
            // First non-address argument, stop looking for admins
            break
        }
    }

    // Validate admins
    if (proposedAdmins.length === 0) {
        await handler.sendMessage(
            channelId,
            '❌ You must specify at least 1 admin address after the hours parameter\n' +
                'Example: `/create 0.1 24 0x1234567890123456789012345678901234567890 Your wager description`'
        )
        return
    }

    if (proposedAdmins.length > 4) {
        await handler.sendMessage(
            channelId,
            `❌ Maximum 4 admins allowed. You specified ${proposedAdmins.length}`
        )
        return
    }

    // Prevent creator from being an admin
    if (proposedAdmins.includes(userId)) {
        await handler.sendMessage(
            channelId,
            '❌ You cannot be an admin of your own wager'
        )
        return
    }

    // Everything after admins is the description
    const description = args.slice(descriptionStartIndex).join(' ')
    
    if (!description || description.length < 5) {
        await handler.sendMessage(
            channelId,
            '❌ Please provide a description after the admin addresses\n' +
                'Example: `/create 0.1 24 0x123... Will it rain tomorrow? I predict yes`'
        )
        return
    }

    let stakeAmount: bigint
    try {
        stakeAmount = parseEther(stakeStr)
    } catch (error) {
        await handler.sendMessage(
            channelId,
            `❌ Invalid stake amount. Use a number like 0.1\n` +
                `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        )
        return
    }

    const validation = validateStakeAmount(stakeAmount)
    if (!validation.valid) {
        await handler.sendMessage(channelId, `❌ ${validation.error}`)
        return
    }

    const user = storage.getOrCreateUser(userId)
    if (user.balance < stakeAmount) {
        await handler.sendMessage(
            channelId,
            `❌ Insufficient balance. You have ${formatAmount(user.balance)}, need ${formatAmount(stakeAmount)}`
        )
        return
    }

    const wagerId = generateWagerId()
    const now = new Date()
    const expirationTime = new Date(now.getTime() + expirationHours * 60 * 60 * 1000)

    const wager: Wager = {
        id: wagerId,
        creatorId: userId,
        description,
        creatorPrediction: description, // Full description is their prediction
        stakeAmount,
        eventTime: expirationTime,
        expirationTime,
        status: 'open',
        createdAt: now,
        proposedAdmins,
    }

    // Lock creator's stake in escrow
    user.balance -= stakeAmount
    storage.updateUser(userId, { balance: user.balance, totalWagersCreated: user.totalWagersCreated + 1 })

    const tx: Transaction = {
        id: generateTransactionId(),
        userId,
        wagerId,
        type: 'escrow',
        amount: stakeAmount,
        status: 'completed',
        timestamp: now,
    }
    storage.createTransaction(tx)

    storage.createWager(wager)

    await handler.sendMessage(
        channelId,
        `✅ **Wager Created!**\n\n` +
            `**ID:** \`${wagerId}\`\n` +
            `**Description:** ${description}\n` +
            `**Stake:** ${formatAmount(stakeAmount)}\n` +
            `**Expires:** ${formatDate(expirationTime)}\n` +
            `**Proposed Admins (${proposedAdmins.length}):**\n` +
            proposedAdmins.map((addr, i) => `  ${i + 1}. \`${addr.slice(0, 10)}...${addr.slice(-8)}\``).join('\n') +
            `\n\n💡 Share this ID for others to accept: \`${wagerId}\`\n` +
            `Use \`/browse\` to see all open wagers`
    )
}

export async function handleBrowseWagers(
    handler: BotHandler,
    event: { channelId: string },
) {
    const { channelId } = event

    const openWagers = storage.getOpenWagers()

    if (openWagers.length === 0) {
        await handler.sendMessage(channelId, 'No open wagers available at the moment.')
        return
    }

    let message = `**📋 Available Wagers (${openWagers.length})**\n\n`
    for (const wager of openWagers.slice(0, 10)) {
        message +=
            `**\`${wager.id}\`**\n` +
            `📝 ${wager.description}\n` +
            `💰 Stake: ${formatAmount(wager.stakeAmount)}\n` +
            `👥 Admins: ${wager.proposedAdmins.length}\n` +
            `⏰ Expires: ${formatDate(wager.expirationTime)}\n\n`
    }

    if (openWagers.length > 10) {
        message += `_... and ${openWagers.length - 10} more wagers_\n\n`
    }

    message += `Use \`/accept <wager_id> <your_prediction>\` to accept a wager`

    await handler.sendMessage(channelId, message)
}

export async function handleAcceptWager(
    handler: BotHandler,
    event: { channelId: string; userId: string; args: string[] },
) {
    const { channelId, userId, args } = event

    if (args.length < 2) {
        await handler.sendMessage(
            channelId,
            '**Usage:** `/accept <wager_id> <your_prediction>`\n\n' +
                '**Example:** `/accept wager_123456 I think it will not rain`\n\n' +
                'Everything after the wager ID is your prediction/counter-position.'
        )
        return
    }

    const wagerId = args[0]
    const prediction = args.slice(1).join(' ')

    if (!prediction || prediction.length < 3) {
        await handler.sendMessage(
            channelId,
            '❌ Please provide your prediction after the wager ID'
        )
        return
    }

    const wager = storage.getWager(wagerId)
    if (!wager) {
        await handler.sendMessage(channelId, '❌ Wager not found')
        return
    }

    const validation = canAcceptWager(userId, wager)
    if (!validation.can) {
        await handler.sendMessage(channelId, `❌ ${validation.error}`)
        return
    }

    const user = storage.getOrCreateUser(userId)
    user.balance -= wager.stakeAmount
    storage.updateUser(userId, {
        balance: user.balance,
        totalWagersAccepted: user.totalWagersAccepted + 1,
    })

    const now = new Date()
    const tx: Transaction = {
        id: generateTransactionId(),
        userId,
        wagerId,
        type: 'escrow',
        amount: wager.stakeAmount,
        status: 'completed',
        timestamp: now,
    }
    storage.createTransaction(tx)

    storage.updateWager(wagerId, {
        acceptorId: userId,
        acceptorPrediction: prediction,
        status: 'accepted',
        acceptedAt: now,
        agreedAdmins: wager.proposedAdmins,
    })

    await handler.sendMessage(
        channelId,
        `✅ **Wager Accepted!**\n\n` +
            `**Wager ID:** \`${wagerId}\`\n` +
            `**Description:** ${wager.description}\n` +
            `**Your Prediction:** ${prediction}\n` +
            `**Stake:** ${formatAmount(wager.stakeAmount)} each\n` +
            `**Total Pool:** ${formatAmount(wager.stakeAmount * 2n)}\n` +
            `**Event Time:** ${formatDate(wager.eventTime)}\n` +
            `**Admins:** ${wager.proposedAdmins.length} agreed admin(s)\n\n` +
            `🔒 Both stakes are now in escrow. An admin will settle this wager after the event time.`
    )

    try {
        await handler.sendMessage(
            channelId,
            `🎯 <@${wager.creatorId}> Your wager has been accepted!`,
            {
                mentions: [{ userId: wager.creatorId, displayName: 'Creator' }],
            },
        )
    } catch {
        // Ignore if can't send mention
    }
}

export async function handleMyWagers(handler: BotHandler, event: { channelId: string; userId: string }) {
    const { channelId, userId } = event

    const activeWagers = storage.getActiveWagers(userId)

    if (activeWagers.length === 0) {
        await handler.sendMessage(channelId, 'You have no active wagers.')
        return
    }

    let message = `**📊 Your Active Wagers (${activeWagers.length})**\n\n`

    for (const wager of activeWagers) {
        const role = wager.creatorId === userId ? '👤 Creator' : '✅ Acceptor'
        const opponentId = wager.creatorId === userId ? wager.acceptorId : wager.creatorId
        const opponent = opponentId ? storage.getUser(opponentId) : null

        message +=
            `**\`${wager.id}\`** ${role}\n` +
            `📝 ${wager.description}\n` +
            `💰 Stake: ${formatAmount(wager.stakeAmount)}\n` +
            `📊 Status: ${formatWagerStatus(wager.status)}\n`

        if (wager.status === 'accepted' && opponentId) {
            message += `👥 Opponent: ${opponent?.username || opponentId.slice(0, 10)}...\n`
        }

        if (wager.agreedAdmins && wager.agreedAdmins.length > 0) {
            message += `👥 Admins: ${wager.agreedAdmins.length}\n`
        } else if (wager.proposedAdmins && wager.proposedAdmins.length > 0) {
            message += `👥 Proposed Admins: ${wager.proposedAdmins.length} (awaiting acceptance)\n`
        }

        if (wager.status === 'pending_settlement') {
            message += `⏳ Awaiting admin settlement\n`
        }

        message += `\n`
    }

    await handler.sendMessage(channelId, message)
}

export async function handleHistory(handler: BotHandler, event: { channelId: string; userId: string }) {
    const { channelId, userId } = event

    const allWagers = storage.getUserWagers(userId)
    const completed = allWagers.filter(
        (w) => w.status === 'settled' || w.status === 'cancelled' || w.status === 'refunded',
    )

    if (completed.length === 0) {
        await handler.sendMessage(channelId, 'You have no completed wagers.')
        return
    }

    let message = `**📜 Your Wager History (${completed.length})**\n\n`

    for (const wager of completed.slice(0, 10)) {
        const role = wager.creatorId === userId ? '👤 Creator' : '✅ Acceptor'
        const won = wager.winnerId === userId
        const result = won ? '🏆 Won' : wager.status === 'cancelled' ? '❌ Cancelled' : '💔 Lost'

        message +=
            `**\`${wager.id}\`** ${role} - ${result}\n` +
            `📝 ${wager.description}\n` +
            `💰 Stake: ${formatAmount(wager.stakeAmount)}\n`

        if (wager.settledAt) {
            message += `📅 Settled: ${formatDate(wager.settledAt)}\n`
        }
        message += `\n`
    }

    if (completed.length > 10) {
        message += `_... and ${completed.length - 10} more completed wagers_`
    }

    await handler.sendMessage(channelId, message)
}

export async function handleBalance(handler: BotHandler, event: { channelId: string; userId: string }) {
    const { channelId, userId } = event

    const user = storage.getOrCreateUser(userId)

    await handler.sendMessage(
        channelId,
        `**💰 Your Balance**\n\n` +
            `Available: ${formatAmount(user.balance)}\n\n` +
            `**📊 Stats**\n` +
            `Wagers Created: ${user.totalWagersCreated}\n` +
            `Wagers Accepted: ${user.totalWagersAccepted}\n` +
            `Total Won: ${user.totalWon}\n` +
            `Total Lost: ${user.totalLost}\n\n` +
            `Use \`/deposit\` to add funds`
    )
}

export async function handleDeposit(handler: BotHandler, event: { channelId: string; userId: string }) {
    const { channelId, userId } = event

    await handler.sendMessage(
        channelId,
        `**💰 How to Deposit Funds**\n\n` +
            `**Method: Send a Tip**\n` +
            `1. Long-press any message from this bot\n` +
            `2. Select "Tip" or the tip icon\n` +
            `3. Enter the amount you want to deposit\n` +
            `4. Confirm the transaction\n\n` +
            `The tip amount will be added to your balance automatically.\n\n` +
            `Use \`/balance\` to check your current balance.`
    )
}

export async function handleCancelWager(
    handler: BotHandler,
    event: { channelId: string; userId: string; args: string[] },
) {
    const { channelId, userId, args } = event

    if (args.length < 1) {
        await handler.sendMessage(channelId, '**Usage:** `/cancel <wager_id>`')
        return
    }

    const wagerId = args[0]
    const wager = storage.getWager(wagerId)

    if (!wager) {
        await handler.sendMessage(channelId, '❌ Wager not found')
        return
    }

    const validation = canCancelWager(userId, wager)
    if (!validation.can) {
        await handler.sendMessage(channelId, `❌ ${validation.error}`)
        return
    }

    const user = storage.getUser(userId)!
    user.balance += wager.stakeAmount
    storage.updateUser(userId, { balance: user.balance })

    const now = new Date()
    const refundTx: Transaction = {
        id: generateTransactionId(),
        userId,
        wagerId,
        type: 'refund',
        amount: wager.stakeAmount,
        status: 'completed',
        timestamp: now,
    }
    storage.createTransaction(refundTx)

    storage.updateWager(wagerId, {
        status: 'cancelled',
    })

    await handler.sendMessage(
        channelId,
        `✅ **Wager Cancelled**\n\n` +
            `Wager \`${wagerId}\` has been cancelled and your stake of ${formatAmount(wager.stakeAmount)} has been refunded.`
    )
}

export async function handleDisputeWager(
    handler: BotHandler,
    event: { channelId: string; userId: string; args: string[] },
) {
    const { channelId, userId, args } = event

    if (args.length < 2) {
        await handler.sendMessage(
            channelId,
            '**Usage:** `/dispute <wager_id> <reason>`\n\n' +
                '**Example:** `/dispute wager_123 The outcome was incorrectly determined`'
        )
        return
    }

    const wagerId = args[0]
    const reason = args.slice(1).join(' ')

    const wager = storage.getWager(wagerId)
    if (!wager) {
        await handler.sendMessage(channelId, '❌ Wager not found')
        return
    }

    const validation = canDisputeWager(userId, wager)
    if (!validation.can) {
        await handler.sendMessage(channelId, `❌ ${validation.error}`)
        return
    }

    const disputeId = generateDisputeId()
    const now = new Date()

    storage.createDispute({
        id: disputeId,
        wagerId,
        disputingUserId: userId,
        reason,
        status: 'open',
        createdAt: now,
    })

    storage.updateWager(wagerId, {
        status: 'disputed',
    })

    await handler.sendMessage(
        channelId,
        `✅ **Dispute Opened**\n\n` +
            `**Dispute ID:** \`${disputeId}\`\n` +
            `**Wager ID:** \`${wagerId}\`\n` +
            `**Reason:** ${reason}\n\n` +
            `An admin will review your dispute within 24 hours. The wager is frozen until resolution.`
    )
}