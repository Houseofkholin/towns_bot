import { storage } from './storage'
import type { Wager, Transaction, User } from './types'

const PLATFORM_FEE_PERCENT = 5n // 5%
const MIN_STAKE = 1000000000000000n // 0.001 ETH/stars (1e15 wei)
const MAX_STAKE = 1000000000000000000000n // 1000 ETH/stars (1e21 wei)

export function validateStakeAmount(amount: bigint): { valid: boolean; error?: string } {
    if (amount < MIN_STAKE) {
        return { valid: false, error: `Minimum stake is ${formatAmount(MIN_STAKE)}` }
    }
    if (amount > MAX_STAKE) {
        return { valid: false, error: `Maximum stake is ${formatAmount(MAX_STAKE)}` }
    }
    return { valid: true }
}

export function formatAmount(amount: bigint): string {
    // Convert wei to readable format (assuming 18 decimals)
    const eth = Number(amount) / 1e18
    if (eth >= 1) {
        return `${eth.toFixed(4)} ETH`
    }
    const gwei = Number(amount) / 1e9
    return `${gwei.toFixed(2)} Gwei`
}

export function formatStars(amount: bigint): string {
    // For Telegram Stars (assuming 1 star = 1e6 wei or similar)
    const stars = Number(amount) / 1e6
    return `${stars.toFixed(0)} Stars`
}

export function calculatePlatformFee(totalPool: bigint): bigint {
    return (totalPool * PLATFORM_FEE_PERCENT) / 100n
}

export function calculateWinnerPayout(totalPool: bigint): bigint {
    const fee = calculatePlatformFee(totalPool)
    return totalPool - fee
}

export function generateWagerId(): string {
    return `wager_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

export function generateTransactionId(): string {
    return `tx_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

export function generateDisputeId(): string {
    return `dispute_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`
}

export function hasSufficientBalance(userId: string, amount: bigint): boolean {
    const user = storage.getUser(userId)
    return user ? user.balance >= amount : false
}

export function canAcceptWager(userId: string, wager: Wager): { can: boolean; error?: string } {
    if (wager.creatorId === userId) {
        return { can: false, error: 'You cannot accept your own wager' }
    }
    if (wager.status !== 'open') {
        return { can: false, error: 'This wager is no longer available' }
    }
    if (new Date() > wager.expirationTime) {
        return { can: false, error: 'This wager has expired' }
    }
    if (!hasSufficientBalance(userId, wager.stakeAmount)) {
        return { can: false, error: 'Insufficient balance to accept this wager' }
    }
    return { can: true }
}

export function canCancelWager(userId: string, wager: Wager): { can: boolean; error?: string } {
    if (wager.creatorId !== userId) {
        return { can: false, error: 'You can only cancel your own wagers' }
    }
    if (wager.status !== 'open') {
        return { can: false, error: 'This wager cannot be cancelled' }
    }
    return { can: true }
}

export function canDisputeWager(userId: string, wager: Wager): { can: boolean; error?: string } {
    if (wager.status !== 'settled') {
        return { can: false, error: 'Only settled wagers can be disputed' }
    }
    if (wager.creatorId !== userId && wager.acceptorId !== userId) {
        return { can: false, error: 'You can only dispute wagers you participated in' }
    }
    if (!wager.settledAt) {
        return { can: false, error: 'Invalid wager state' }
    }
    const disputeDeadline = wager.disputeDeadline || new Date(wager.settledAt.getTime() + 24 * 60 * 60 * 1000)
    if (new Date() > disputeDeadline) {
        return { can: false, error: 'Dispute deadline has passed (24 hours after settlement)' }
    }
    // Check if dispute already exists
    const existingDisputes = storage.getDisputesByWager(wager.id)
    const openDispute = existingDisputes.find((d) => d.status === 'open')
    if (openDispute) {
        return { can: false, error: 'This wager already has an open dispute' }
    }
    return { can: true }
}

export function formatWagerStatus(status: string): string {
    return status
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
}

export function formatDate(date: Date): string {
    return date.toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

export function isWagerAdmin(userId: string, wager: Wager): boolean {
    if (!wager.agreedAdmins || wager.agreedAdmins.length === 0) {
        return false
    }
    return wager.agreedAdmins.includes(userId)
}

