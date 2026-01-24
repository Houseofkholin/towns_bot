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

    if (args.length < 5) {
        await handler.sendMessage(
            channelId,
            '**Usage:** `/create <description> <stake_amount> <your_prediction> <expiration_hours> <admin1> [admin2] [admin3] [admin4]`\n\n' +
                '**Example:** `/create "Will it rain tomorrow?" 0.1 "Yes, it will rain" 24 0x123... 0x456...`\n\n' +
                '• Description: What you are wagering on\n' +
                '• Stake Amount: Amount in ETH/Stars (e.g., 0.1)\n' +
                '• Your Prediction: Your answer/outcome\n' +
                '• Expiration Hours: Hours until wager expires if not accepted\n' +
                '• Admins: 1-4 admin addresses (comma or space separated) who will settle disputes\n\n' +
                '**Note:** The acceptor must agree to these admins when accepting the wager.',
        )
        return
    }

    console.log('CREATE DEBUG:', {
        argsLength: args.length,
        args: args,
        userId: userId,
    })

    const description = args[0]
    const stakeStr = args[1]
    const prediction = args[2]
    const expirationHours = parseInt(args[3], 10)
    
    // Parse admin addresses (can be space or comma separated)
    const adminArgs = args.slice(4).join(' ').split(/[,\s]+/).filter(Boolean)
    const proposedAdmins = adminArgs.map(addr => addr.trim()).filter(addr => addr.startsWith('0x'))

    console.log('PROPOSED ADMINS:', proposedAdmins)
    console.log('ADMIN ARGS:', adminArgs)

    if (isNaN(expirationHours) || expirationHours < 1 || expirationHours > 168) {
        await handler.sendMessage(
            channelId,
            'Expiration must be between 1 and 168 hours (1 week)',
        )
        return
    }

    // Validate admins
    if (proposedAdmins.length === 0) {
        await handler.sendMessage(
            channelId,
            'You must specify at least 1 admin address (1-4 admins allowed)',
        )
        return
    }

    if (proposedAdmins.length > 4) {
        await handler.sendMessage(
            channelId,
            'Maximum 4 admins allowed. You specified ' + proposedAdmins.length,
        )
        return
    }

    // Validate admin addresses
    const invalidAdmins = proposedAdmins.filter(addr => !/^0x[a-fA-F0-9]{40}$/.test(addr))
    if (invalidAdmins.length > 0) {
        await handler.sendMessage(
            channelId,
            `Invalid admin addresses: ${invalidAdmins.join(', ')}\n` +
                'Admin addresses must be valid Ethereum addresses (0x followed by 40 hex characters)',
        )
        return
    }

    // Prevent creator from being an admin
    if (proposedAdmins.includes(userId)) {
        await handler.sendMessage(
            channelId,
            'You cannot be an admin of your own wager. Please select other users as admins.',
        )
        return
    }

    let stakeAmount: bigint
    try {
        stakeAmount = parseEther(stakeStr)
    } catch {
        await handler.sendMessage(channelId, 'Invalid stake amount. Use a number like 0.1')
        return
    }

    const validation = validateStakeAmount(stakeAmount)
    if (!validation.valid) {
        await handler.sendMessage(channelId, validation.error!)
        return
    }

    const user = storage.getOrCreateUser(userId)
    if (user.balance < stakeAmount) {
        await handler.sendMessage(
            channelId,
            `Insufficient balance. You have ${formatAmount(user.balance)}, need ${formatAmount(stakeAmount)}`,
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
        creatorPrediction: prediction,
        stakeAmount,
        eventTime: expirationTime, // Using expiration as event time for simplicity
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
            `**ID:** ${wagerId}\n` +
            `**Description:** ${description}\n` +
            `**Your Prediction:** ${prediction}\n` +
            `**Stake:** ${formatAmount(stakeAmount)}\n` +
            `**Expires:** ${formatDate(expirationTime)}\n` +
            `**Proposed Admins (${proposedAdmins.length}):**\n` +
            proposedAdmins.map((addr, i) => `  ${i + 1}. ${addr.slice(0, 10)}...${addr.slice(-8)}`).join('\n') +
            `\n\n**Note:** The acceptor must agree to these admins when accepting the wager.\n` +
            `Share this wager ID for others to accept: \`${wagerId}\``,
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

    let message = `**Available Wagers (${openWagers.length}):**\n\n`
    for (const wager of openWagers.slice(0, 10)) {
        // Limit to 10 for readability
        const creator = storage.getUser(wager.creatorId)
        message +=
            `**${wager.id}**\n` +
            `📝 ${wager.description}\n` +
            `💰 Stake: ${formatAmount(wager.stakeAmount)}\n` +
            `🎯 Creator's Prediction: ${wager.creatorPrediction}\n` +
            `👥 Proposed Admins: ${wager.proposedAdmins.length} admin(s)\n` +
            `⏰ Expires: ${formatDate(wager.expirationTime)}\n\n`
    }

    if (openWagers.length > 10) {
        message += `... and ${openWagers.length - 10} more wagers`
    }

    message += `\nUse \`/accept <wager_id> <your_prediction> agree\` to accept a wager\n` +
        `**Note:** You must add "agree" to confirm you agree to the proposed admins.`

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
            '**Usage:** `/accept <wager_id> <your_prediction> [agree]`\n\n' +
                '**Example:** `/accept wager_123 "No, it will not rain" agree`\n\n' +
                '**Important:** You must add `agree` at the end to confirm you agree to the proposed admins.\n' +
                'The wager will show the proposed admins - review them before accepting.',
        )
        return
    }

    const wagerId = args[0]
    const lastArg = args[args.length - 1].toLowerCase()
    const prediction = args.slice(1, -1).join(' ')
    const hasAgreed = lastArg === 'agree' || lastArg === 'yes' || lastArg === 'confirm'

    const wager = storage.getWager(wagerId)
    if (!wager) {
        await handler.sendMessage(channelId, 'Wager not found.')
        return
    }

    // Show proposed admins and require agreement
    if (!hasAgreed) {
        await handler.sendMessage(
            channelId,
            `**Review Proposed Admins Before Accepting**\n\n` +
                `**Wager:** ${wager.description}\n` +
                `**Stake:** ${formatAmount(wager.stakeAmount)}\n` +
                `**Proposed Admins (${wager.proposedAdmins.length}):**\n` +
                wager.proposedAdmins.map((addr, i) => `  ${i + 1}. ${addr}`).join('\n') +
                `\n\n**To accept this wager, you must agree to these admins.**\n` +
                `They will be responsible for settling disputes.\n\n` +
                `**Usage:** \`/accept ${wagerId} "${prediction || 'your prediction'}" agree\``,
        )
        return
    }

    // Extract prediction if it wasn't in the right place
    const actualPrediction = prediction || args.slice(1, -1).join(' ')
    if (!actualPrediction) {
        await handler.sendMessage(
            channelId,
            'Please provide your prediction. Usage: `/accept <wager_id> <your_prediction> agree`',
        )
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

    // Set agreed admins (both parties have agreed)
    storage.updateWager(wagerId, {
        acceptorId: userId,
        acceptorPrediction: actualPrediction,
        status: 'accepted',
        acceptedAt: now,
        agreedAdmins: wager.proposedAdmins, // Both parties agreed to these admins
    })

    // Notify creator
    await handler.sendMessage(
        channelId,
        `✅ **Wager Accepted!**\n\n` +
            `**Wager ID:** ${wagerId}\n` +
            `**Description:** ${wager.description}\n` +
            `**Your Prediction:** ${actualPrediction}\n` +
            `**Stake:** ${formatAmount(wager.stakeAmount)}\n` +
            `**Event Time:** ${formatDate(wager.eventTime)}\n` +
            `**Agreed Admins (${wager.proposedAdmins.length}):**\n` +
            wager.proposedAdmins.map((addr, i) => `  ${i + 1}. ${addr.slice(0, 10)}...${addr.slice(-8)}`).join('\n') +
            `\n\nBoth stakes are now in escrow. The wager will be settled after the event time by one of the agreed admins.`,
    )

    // Try to notify creator (if in DM or same channel)
    try {
        await handler.sendMessage(
            channelId,
            `<@${wager.creatorId}> Your wager "${wager.description}" has been accepted!`,
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

    let message = `**Your Active Wagers (${activeWagers.length}):**\n\n`

    for (const wager of activeWagers) {
        const role = wager.creatorId === userId ? '👤 Creator' : '✅ Acceptor'
        const opponentId = wager.creatorId === userId ? wager.acceptorId : wager.creatorId
        const opponent = opponentId ? storage.getUser(opponentId) : null

        message +=
            `**${wager.id}** ${role}\n` +
            `📝 ${wager.description}\n` +
            `💰 Stake: ${formatAmount(wager.stakeAmount)}\n` +
            `📊 Status: ${formatWagerStatus(wager.status)}\n`

        if (wager.status === 'accepted' && opponentId) {
            message += `👥 Opponent: ${opponent?.username || opponentId.slice(0, 10)}...\n`
        }

        if (wager.agreedAdmins && wager.agreedAdmins.length > 0) {
            message += `👥 Admins: ${wager.agreedAdmins.length} admin(s)\n`
        } else if (wager.proposedAdmins && wager.proposedAdmins.length > 0) {
            message += `👥 Proposed Admins: ${wager.proposedAdmins.length} admin(s) (awaiting agreement)\n`
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

    let message = `**Your Wager History (${completed.length}):**\n\n`

    for (const wager of completed.slice(0, 10)) {
        const role = wager.creatorId === userId ? '👤 Creator' : '✅ Acceptor'
        const won = wager.winnerId === userId
        const result = won ? '🏆 Won' : wager.status === 'cancelled' ? '❌ Cancelled' : '💔 Lost'

        message +=
            `**${wager.id}** ${role} - ${result}\n` +
            `📝 ${wager.description}\n` +
            `💰 Stake: ${formatAmount(wager.stakeAmount)}\n`

        if (wager.settledAt) {
            message += `📅 Settled: ${formatDate(wager.settledAt)}\n`
        }
        message += `\n`
    }

    if (completed.length > 10) {
        message += `... and ${completed.length - 10} more completed wagers`
    }

    await handler.sendMessage(channelId, message)
}

export async function handleBalance(handler: BotHandler, event: { channelId: string; userId: string }) {
    const { channelId, userId } = event

    const user = storage.getOrCreateUser(userId)

    await handler.sendMessage(
        channelId,
        `**Your Balance:**\n\n` +
            `💰 Available: ${formatAmount(user.balance)}\n\n` +
            `**Stats:**\n` +
            `📊 Wagers Created: ${user.totalWagersCreated}\n` +
            `✅ Wagers Accepted: ${user.totalWagersAccepted}\n` +
            `🏆 Total Won: ${user.totalWon}\n` +
            `💔 Total Lost: ${user.totalLost}\n\n` +
            `Use \`/deposit\` to learn how to add funds.`,
    )
}

export async function handleDeposit(handler: BotHandler, event: { channelId: string; userId: string }) {
    const { channelId, userId } = event

    await handler.sendMessage(
        channelId,
        `💰 **How to Deposit Funds**\n\n` +
            `**Method 1: Send a Tip**\n` +
            `1. In any channel where this bot is present, send a tip to this bot\n` +
            `2. The tip amount will be added to your balance automatically\n` +
            `3. You'll receive a confirmation message\n\n` +
            `**How to Send a Tip:**\n` +
            `• Long-press on any message from this bot\n` +
            `• Select "Tip" or the tip icon\n` +
            `• Enter the amount you want to deposit\n` +
            `• Confirm the transaction\n\n` +
            `**Current Balance:**\n` +
            `Use \`/balance\` to check your current balance.\n\n` +
            `**Note:** All deposits are tracked and can be used for wagers. ` +
            `When you create or accept a wager, the stake amount is deducted from your balance.`,
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
        await handler.sendMessage(channelId, 'Wager not found.')
        return
    }

    const validation = canCancelWager(userId, wager)
    if (!validation.can) {
        await handler.sendMessage(channelId, `❌ ${validation.error}`)
        return
    }

    // Refund creator
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
            `Wager ${wagerId} has been cancelled and your stake of ${formatAmount(wager.stakeAmount)} has been refunded.`,
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
                '**Example:** `/dispute wager_123 "The outcome was incorrectly determined"`',
        )
        return
    }

    const wagerId = args[0]
    const reason = args.slice(1).join(' ')

    const wager = storage.getWager(wagerId)
    if (!wager) {
        await handler.sendMessage(channelId, 'Wager not found.')
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
            `**Dispute ID:** ${disputeId}\n` +
            `**Wager ID:** ${wagerId}\n` +
            `**Reason:** ${reason}\n\n` +
            `An admin will review your dispute within 24 hours. The wager is now frozen until resolution.`,
    )
}

