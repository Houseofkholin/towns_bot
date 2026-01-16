import type { BotHandler } from '@towns-protocol/bot'
import { storage } from './storage'
import {
    generateTransactionId,
    calculateWinnerPayout,
    formatAmount,
    formatWagerStatus,
    formatDate,
    isWagerAdmin,
} from './utils'
import type { Transaction } from './types'

export async function handleAdminDashboard(
    handler: BotHandler,
    event: { channelId: string; userId: string },
) {
    const { channelId, userId } = event

    // Show wagers where user is an admin
    const allWagers = storage.getAllWagers()
    const userAdminWagers = allWagers.filter((w) => isWagerAdmin(userId, w))
    const pendingSettlements = userAdminWagers.filter(
        (w) => w.status === 'pending_settlement' || w.status === 'accepted',
    )

    let message = `**Your Admin Dashboard**\n\n`
    message += `You are an admin for **${userAdminWagers.length}** wager(s).\n\n`

    if (pendingSettlements.length > 0) {
        message += `**Wagers Requiring Your Action (${pendingSettlements.length}):**\n\n`
        for (const wager of pendingSettlements.slice(0, 10)) {
            const isPending = wager.status === 'pending_settlement'
            message +=
                `**${wager.id}** ${isPending ? '⏳ Pending Settlement' : '✅ Accepted'}\n` +
                `📝 ${wager.description}\n` +
                `💰 Stake: ${formatAmount(wager.stakeAmount)}\n` +
                `👤 Creator: ${wager.creatorId.slice(0, 10)}...\n` +
                `✅ Acceptor: ${wager.acceptorId?.slice(0, 10) || 'N/A'}...\n` +
                `⏰ Event Time: ${formatDate(wager.eventTime)}\n` +
                `📊 Status: ${formatWagerStatus(wager.status)}\n\n`
        }
        if (pendingSettlements.length > 10) {
            message += `... and ${pendingSettlements.length - 10} more\n\n`
        }
        message +=
            `**Admin Commands:**\n` +
            `• \`/settle <wager_id> <winner_id>\` - Settle wager (winner gets payout)\n` +
            `• \`/tie <wager_id>\` - Mark as tie (refund both)\n` +
            `• \`/resolve <dispute_id> <action>\` - Resolve dispute (uphold/reverse/refund)\n`
    } else {
        message += `No wagers require your action at this time.\n\n`
        message += `**Admin Commands:**\n` +
            `• \`/settle <wager_id> <winner_id>\` - Settle a wager\n` +
            `• \`/tie <wager_id>\` - Mark wager as tie\n` +
            `• \`/resolve <dispute_id> <action>\` - Resolve dispute`
    }

    await handler.sendMessage(channelId, message)
}

export async function handleSettleWager(
    handler: BotHandler,
    event: { channelId: string; userId: string; args: string[] },
) {
    const { channelId, userId, args } = event

    if (args.length < 2) {
        await handler.sendMessage(
            channelId,
            '**Usage:** `/settle <wager_id> <winner_id>`\n\n' +
                '**Example:** `/settle wager_123 0x1234...`\n\n' +
                'Winner ID should be the creator or acceptor address.',
        )
        return
    }

    const wagerId = args[0]
    const winnerId = args[1]

    const wager = storage.getWager(wagerId)
    if (!wager) {
        await handler.sendMessage(channelId, 'Wager not found.')
        return
    }

    // Check if user is a wager admin
    if (!isWagerAdmin(userId, wager)) {
        await handler.sendMessage(
            channelId,
            '❌ You are not an admin for this wager. Only agreed admins can settle wagers.',
        )
        return
    }

    if (wager.status !== 'pending_settlement' && wager.status !== 'accepted') {
        await handler.sendMessage(channelId, 'Wager is not in a state that can be settled.')
        return
    }

    if (winnerId !== wager.creatorId && winnerId !== wager.acceptorId) {
        await handler.sendMessage(channelId, 'Winner must be either the creator or acceptor.')
        return
    }

    if (!wager.acceptorId) {
        await handler.sendMessage(channelId, 'Wager has not been accepted yet.')
        return
    }

    const totalPool = wager.stakeAmount * 2n
    const payout = calculateWinnerPayout(totalPool)
    const fee = totalPool - payout

    const winner = storage.getUser(winnerId)
    const loserId = winnerId === wager.creatorId ? wager.acceptorId! : wager.creatorId

    if (!winner) {
        await handler.sendMessage(channelId, 'Winner user not found.')
        return
    }

    // Payout to winner
    winner.balance += payout
    if (winnerId === wager.creatorId) {
        storage.updateUser(winnerId, {
            balance: winner.balance,
            totalWon: winner.totalWon + 1,
        })
    } else {
        storage.updateUser(winnerId, {
            balance: winner.balance,
            totalWon: winner.totalWon + 1,
        })
    }

    // Update loser stats
    const loser = storage.getUser(loserId)
    if (loser) {
        if (loserId === wager.creatorId) {
            storage.updateUser(loserId, {
                totalLost: loser.totalLost + 1,
            })
        } else {
            storage.updateUser(loserId, {
                totalLost: loser.totalLost + 1,
            })
        }
    }

    const now = new Date()

    // Create payout transaction
    const payoutTx: Transaction = {
        id: generateTransactionId(),
        userId: winnerId,
        wagerId,
        type: 'payout',
        amount: payout,
        status: 'completed',
        timestamp: now,
    }
    storage.createTransaction(payoutTx)

    // Create fee transaction
    const feeTx: Transaction = {
        id: generateTransactionId(),
        userId: winnerId, // Platform fee
        wagerId,
        type: 'fee',
        amount: fee,
        status: 'completed',
        timestamp: now,
    }
    storage.createTransaction(feeTx)

    storage.updateWager(wagerId, {
        status: 'settled',
        winnerId,
        settledAt: now,
        disputeDeadline: new Date(now.getTime() + 24 * 60 * 60 * 1000), // 24 hours
    })

    await handler.sendMessage(
        channelId,
        `✅ **Wager Settled**\n\n` +
            `**Wager ID:** ${wagerId}\n` +
            `**Winner:** ${winnerId.slice(0, 10)}...\n` +
            `**Payout:** ${formatAmount(payout)}\n` +
            `**Platform Fee:** ${formatAmount(fee)}\n\n` +
            `Both users have been notified.`,
    )

    // Try to notify users
    try {
        await handler.sendMessage(
            channelId,
            `<@${winnerId}> 🏆 You won the wager "${wager.description}"! Payout: ${formatAmount(payout)}`,
            {
                mentions: [{ userId: winnerId, displayName: 'Winner' }],
            },
        )
        await handler.sendMessage(
            channelId,
            `<@${loserId}> 💔 You lost the wager "${wager.description}". Better luck next time!`,
            {
                mentions: [{ userId: loserId, displayName: 'Loser' }],
            },
        )
    } catch {
        // Ignore if can't send mentions
    }
}

export async function handleTieWager(
    handler: BotHandler,
    event: { channelId: string; userId: string; args: string[] },
) {
    const { channelId, userId, args } = event

    if (args.length < 1) {
        await handler.sendMessage(channelId, '**Usage:** `/tie <wager_id>`')
        return
    }

    const wagerId = args[0]
    const wager = storage.getWager(wagerId)

    if (!wager) {
        await handler.sendMessage(channelId, 'Wager not found.')
        return
    }

    // Check if user is a wager admin
    if (!isWagerAdmin(userId, wager)) {
        await handler.sendMessage(
            channelId,
            '❌ You are not an admin for this wager. Only agreed admins can mark wagers as tie.',
        )
        return
    }

    if (wager.status !== 'pending_settlement' && wager.status !== 'accepted') {
        await handler.sendMessage(channelId, 'Wager cannot be marked as tie in current state.')
        return
    }

    if (!wager.acceptorId) {
        await handler.sendMessage(channelId, 'Wager has not been accepted yet.')
        return
    }

    // Refund both users
    const creator = storage.getUser(wager.creatorId)!
    const acceptor = storage.getUser(wager.acceptorId)!

    creator.balance += wager.stakeAmount
    acceptor.balance += wager.stakeAmount

    storage.updateUser(wager.creatorId, { balance: creator.balance })
    storage.updateUser(wager.acceptorId, { balance: acceptor.balance })

    const now = new Date()

    // Create refund transactions
    const creatorRefundTx: Transaction = {
        id: generateTransactionId(),
        userId: wager.creatorId,
        wagerId,
        type: 'refund',
        amount: wager.stakeAmount,
        status: 'completed',
        timestamp: now,
    }
    storage.createTransaction(creatorRefundTx)

    const acceptorRefundTx: Transaction = {
        id: generateTransactionId(),
        userId: wager.acceptorId,
        wagerId,
        type: 'refund',
        amount: wager.stakeAmount,
        status: 'completed',
        timestamp: now,
    }
    storage.createTransaction(acceptorRefundTx)

    storage.updateWager(wagerId, {
        status: 'cancelled',
        settledAt: now,
    })

    await handler.sendMessage(
        channelId,
        `✅ **Wager Marked as Tie**\n\n` +
            `Wager ${wagerId} has been cancelled and both users have been refunded ${formatAmount(wager.stakeAmount)} each.`,
    )

    // Try to notify users
    try {
        await handler.sendMessage(
            channelId,
            `<@${wager.creatorId}> The wager "${wager.description}" was marked as a tie. Your stake has been refunded.`,
            {
                mentions: [{ userId: wager.creatorId, displayName: 'Creator' }],
            },
        )
        await handler.sendMessage(
            channelId,
            `<@${wager.acceptorId}> The wager "${wager.description}" was marked as a tie. Your stake has been refunded.`,
            {
                mentions: [{ userId: wager.acceptorId, displayName: 'Acceptor' }],
            },
        )
    } catch {
        // Ignore if can't send mentions
    }
}

export async function handleResolveDispute(
    handler: BotHandler,
    event: { channelId: string; userId: string; args: string[] },
) {
    const { channelId, userId, args } = event

    if (args.length < 2) {
        await handler.sendMessage(
            channelId,
            '**Usage:** `/resolve <dispute_id> <action>`\n\n' +
                '**Actions:**\n' +
                '• `uphold` - Keep original settlement\n' +
                '• `reverse` - Reverse settlement (swap winner)\n' +
                '• `refund` - Refund both users',
        )
        return
    }

    const disputeId = args[0]
    const action = args[1].toLowerCase()

    const dispute = storage.getDispute(disputeId)
    if (!dispute) {
        await handler.sendMessage(channelId, 'Dispute not found.')
        return
    }

    if (dispute.status !== 'open') {
        await handler.sendMessage(channelId, 'Dispute is not open.')
        return
    }

    const wager = storage.getWager(dispute.wagerId)
    if (!wager || wager.status !== 'disputed') {
        await handler.sendMessage(channelId, 'Wager not found or not in disputed state.')
        return
    }

    // Check if user is a wager admin
    if (!isWagerAdmin(userId, wager)) {
        await handler.sendMessage(
            channelId,
            '❌ You are not an admin for this wager. Only agreed admins can resolve disputes.',
        )
        return
    }

    const now = new Date()

    if (action === 'uphold') {
        storage.updateDispute(disputeId, {
            status: 'resolved',
            resolution: 'Original settlement upheld',
            resolvedAt: now,
            resolvedBy: userId,
        })
        storage.updateWager(dispute.wagerId, {
            status: 'settled',
        })

        await handler.sendMessage(
            channelId,
            `✅ **Dispute Resolved: Upheld**\n\nOriginal settlement stands.`,
        )
    } else if (action === 'reverse') {
        if (!wager.winnerId || !wager.acceptorId) {
            await handler.sendMessage(channelId, 'Cannot reverse: invalid wager state.')
            return
        }

        const newWinnerId = wager.winnerId === wager.creatorId ? wager.acceptorId : wager.creatorId
        const oldWinnerId = wager.winnerId

        // Reverse the payout
        const totalPool = wager.stakeAmount * 2n
        const payout = calculateWinnerPayout(totalPool)

        const oldWinner = storage.getUser(oldWinnerId)!
        const newWinner = storage.getUser(newWinnerId)!

        // Take back from old winner
        oldWinner.balance -= payout
        storage.updateUser(oldWinnerId, {
            balance: oldWinner.balance,
            totalWon: Math.max(0, oldWinner.totalWon - 1),
            totalLost: oldWinner.totalLost + 1,
        })

        // Give to new winner
        newWinner.balance += payout
        storage.updateUser(newWinnerId, {
            balance: newWinner.balance,
            totalWon: newWinner.totalWon + 1,
            totalLost: Math.max(0, newWinner.totalLost - 1),
        })

        storage.updateDispute(disputeId, {
            status: 'resolved',
            resolution: 'Settlement reversed',
            resolvedAt: now,
            resolvedBy: userId,
        })
        storage.updateWager(dispute.wagerId, {
            status: 'settled',
            winnerId: newWinnerId,
        })

        await handler.sendMessage(
            channelId,
            `✅ **Dispute Resolved: Reversed**\n\nWinner changed. New winner: ${newWinnerId.slice(0, 10)}...`,
        )
    } else if (action === 'refund') {
        // Refund both users
        const creator = storage.getUser(wager.creatorId)!
        const acceptor = storage.getUser(wager.acceptorId!)!

        creator.balance += wager.stakeAmount
        acceptor.balance += wager.stakeAmount

        storage.updateUser(wager.creatorId, { balance: creator.balance })
        storage.updateUser(wager.acceptorId!, { balance: acceptor.balance })

        const refundTx1: Transaction = {
            id: generateTransactionId(),
            userId: wager.creatorId,
            wagerId: wager.id,
            type: 'refund',
            amount: wager.stakeAmount,
            status: 'completed',
            timestamp: now,
        }
        storage.createTransaction(refundTx1)

        const refundTx2: Transaction = {
            id: generateTransactionId(),
            userId: wager.acceptorId!,
            wagerId: wager.id,
            type: 'refund',
            amount: wager.stakeAmount,
            status: 'completed',
            timestamp: now,
        }
        storage.createTransaction(refundTx2)

        storage.updateDispute(disputeId, {
            status: 'resolved',
            resolution: 'Both users refunded',
            resolvedAt: now,
            resolvedBy: userId,
        })
        storage.updateWager(dispute.wagerId, {
            status: 'refunded',
        })

        await handler.sendMessage(
            channelId,
            `✅ **Dispute Resolved: Refunded**\n\nBoth users have been refunded.`,
        )
    } else {
        await handler.sendMessage(channelId, 'Invalid action. Use: uphold, reverse, or refund')
        return
    }
}

