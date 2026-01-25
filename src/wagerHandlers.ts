import type { BotHandler } from '@towns-protocol/bot'
import { storage } from './storage'
import {
    generateWagerId,
    generateTransactionId,
    generateDisputeId,
    validateStakeAmount,
    formatAmount,
    canAcceptWager,
    canCancelWager,
    canDisputeWager,
    formatWagerStatus,
    formatDate,
} from './utils'
import type { Wager, Transaction } from './types'
import { parseEther } from 'viem'

export async function handleCreateWager(
    handler: BotHandler,
    event: { channelId: string; userId: string },
) {
    const { channelId, userId } = event

    // Send a form for creating a wager
    await handler.sendInteractionRequest(channelId, {
        type: 'form',
        id: `create-wager-${Date.now()}`,
        components: [
            { id: 'description', type: 'textInput', placeholder: 'What are you wagering on?' },
            { id: 'stake', type: 'textInput', placeholder: 'Stake amount (e.g., 0.1)' },
            { id: 'hours', type: 'textInput', placeholder: 'Hours until expiration (1-168)' },
            { id: 'admin1', type: 'textInput', placeholder: 'Admin address 1 (0x...)' },
            { id: 'admin2', type: 'textInput', placeholder: 'Admin address 2 (optional)' },
            { id: 'submit', type: 'button', label: 'Create Wager' },
            { id: 'cancel', type: 'button', label: 'Cancel' }
        ],
        recipient: userId as `0x${string}`
    })
}

export async function handleCreateWagerResponse(
    handler: BotHandler,
    event: { channelId: string; userId: string; formData: Map<string, string> }
) {
    const { channelId, userId, formData } = event

    if (formData.get('cancel')) {
        await handler.sendMessage(channelId, '❌ Wager creation cancelled')
        return
    }

    const description = formData.get('description')?.trim()
    const stakeStr = formData.get('stake')?.trim()
    const hoursStr = formData.get('hours')?.trim()
    const admin1 = formData.get('admin1')?.trim()
    const admin2 = formData.get('admin2')?.trim()

    if (!description || description.length < 5) {
        await handler.sendMessage(channelId, '❌ Description must be at least 5 characters')
        return
    }

    if (!stakeStr) {
        await handler.sendMessage(channelId, '❌ Stake amount is required')
        return
    }

    if (!hoursStr) {
        await handler.sendMessage(channelId, '❌ Expiration hours is required')
        return
    }

    const expirationHours = parseInt(hoursStr, 10)
    if (isNaN(expirationHours) || expirationHours < 1 || expirationHours > 168) {
        await handler.sendMessage(channelId, '❌ Expiration must be between 1 and 168 hours')
        return
    }

    const proposedAdmins: string[] = []
    if (admin1) proposedAdmins.push(admin1)
    if (admin2) proposedAdmins.push(admin2)

    if (proposedAdmins.length === 0) {
        await handler.sendMessage(channelId, '❌ At least 1 admin address is required')
        return
    }

    // Validate admin addresses
    const invalidAdmins = proposedAdmins.filter(addr => !/^0x[a-fA-F0-9]{40}$/.test(addr))
    if (invalidAdmins.length > 0) {
        await handler.sendMessage(
            channelId,
            `❌ Invalid admin addresses: ${invalidAdmins.join(', ')}`
        )
        return
    }

    if (proposedAdmins.includes(userId)) {
        await handler.sendMessage(channelId, '❌ You cannot be an admin of your own wager')
        return
    }

    let stakeAmount: bigint
    try {
        stakeAmount = parseEther(stakeStr)
    } catch {
        await handler.sendMessage(channelId, '❌ Invalid stake amount. Use a number like 0.1')
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
            `❌ Insufficient balance\nYou have: ${formatAmount(user.balance)}\nNeed: ${formatAmount(stakeAmount)}`
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
        creatorPrediction: description,
        stakeAmount,
        eventTime: expirationTime,
        expirationTime,
        status: 'open',
        createdAt: now,
        proposedAdmins,
    }

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
        `**Admins (${proposedAdmins.length}):**\n` +
        proposedAdmins.map((addr, i) => `  ${i + 1}. \`${addr.slice(0, 10)}...${addr.slice(-8)}\``).join('\n') +
        `\n\n💡 Share ID: \`${wagerId}\`\n` +
        `Others can accept with: \`/accept ${wagerId}\``
    )
}

export async function handleBrowseWagers(
    handler: BotHandler,
    event: { channelId: string },
) {
    const { channelId } = event
    const openWagers = storage.getOpenWagers()

    if (openWagers.length === 0) {
        await handler.sendMessage(channelId, 'No open wagers available. Use `/create` to create one!')
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

    message += `Use \`/accept\` to accept a wager`

    await handler.sendMessage(channelId, message)
}

export async function handleAcceptWager(
    handler: BotHandler,
    event: { channelId: string; userId: string; args: string[] },
) {
    const { channelId, userId, args } = event

    // If wager ID provided, show that wager's form
    if (args.length > 0) {
        const wagerId = args[0]
        const wager = storage.getWager(wagerId)
        
        if (!wager) {
            await handler.sendMessage(channelId, `❌ Wager not found: \`${wagerId}\``)
            return
        }

        await handler.sendInteractionRequest(channelId, {
            type: 'form',
            id: `accept-wager-${wagerId}`,
            components: [
                { id: 'prediction', type: 'textInput', placeholder: 'Your prediction/counter-position' },
                { id: 'accept', type: 'button', label: 'Accept Wager' },
                { id: 'cancel', type: 'button', label: 'Cancel' }
            ],
            recipient: userId as `0x${string}`
        })
        return
    }

    // Otherwise show list of wagers to accept
    await handleBrowseWagers(handler, event)
}

export async function handleAcceptWagerResponse(
    handler: BotHandler,
    event: { channelId: string; userId: string; wagerId: string; formData: Map<string, string> }
) {
    const { channelId, userId, wagerId, formData } = event

    if (formData.get('cancel')) {
        await handler.sendMessage(channelId, '❌ Cancelled')
        return
    }

    const prediction = formData.get('prediction')?.trim()

    if (!prediction || prediction.length < 3) {
        await handler.sendMessage(channelId, '❌ Please provide your prediction')
        return
    }

    const wager = storage.getWager(wagerId)
    if (!wager) {
        await handler.sendMessage(channelId, `❌ Wager not found`)
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
        `**Admins:** ${wager.proposedAdmins.length} agreed\n\n` +
        `🔒 Both stakes in escrow. Admins will settle after event time.`
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
        await handler.sendMessage(channelId, 'You have no active wagers.\n\nUse `/create` to create one or `/browse` to see available wagers.')
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
            message += `👥 Proposed Admins: ${wager.proposedAdmins.length}\n`
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
        await handler.sendMessage(channelId, 'You have no completed wagers yet.')
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
        message += `_... and ${completed.length - 10} more_`
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
        `3. Enter the amount\n` +
        `4. Confirm the transaction\n\n` +
        `Your balance will be updated automatically.\n\n` +
        `Use \`/balance\` to check your balance.`
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
        await handler.sendMessage(channelId, `❌ Wager not found: \`${wagerId}\``)
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
        `Wager \`${wagerId}\` cancelled.\nRefunded: ${formatAmount(wager.stakeAmount)}`
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
            '**Example:** `/dispute wager_123 The outcome was incorrect`'
        )
        return
    }

    const wagerId = args[0]
    const reason = args.slice(1).join(' ')

    const wager = storage.getWager(wagerId)
    if (!wager) {
        await handler.sendMessage(channelId, `❌ Wager not found: \`${wagerId}\``)
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
        `Admin will review within 24 hours. Wager frozen.`
    )
}