export type WagerStatus =
    | 'open'
    | 'accepted'
    | 'pending_settlement'
    | 'settled'
    | 'cancelled'
    | 'disputed'
    | 'refunded'

export type TransactionType = 'deposit' | 'withdrawal' | 'escrow' | 'payout' | 'refund' | 'fee'

export type DisputeStatus = 'open' | 'resolved' | 'rejected'

export interface Wager {
    id: string
    creatorId: string
    acceptorId?: string
    description: string
    creatorPrediction: string
    acceptorPrediction?: string
    stakeAmount: bigint // in wei/stars
    eventTime: Date
    expirationTime: Date
    status: WagerStatus
    winnerId?: string
    createdAt: Date
    acceptedAt?: Date
    settledAt?: Date
    disputeDeadline?: Date
    proposedAdmins: string[] // Admins proposed by creator (1-4 addresses)
    agreedAdmins?: string[] // Final admin list agreed upon by both parties
}

export interface User {
    userId: string
    username?: string
    balance: bigint // in wei/stars
    totalWagersCreated: number
    totalWagersAccepted: number
    totalWon: number
    totalLost: number
}

export interface Transaction {
    id: string
    userId: string
    wagerId?: string
    type: TransactionType
    amount: bigint
    status: 'pending' | 'completed' | 'failed'
    timestamp: Date
    txHash?: string
}

export interface Dispute {
    id: string
    wagerId: string
    disputingUserId: string
    reason: string
    status: DisputeStatus
    resolution?: string
    createdAt: Date
    resolvedAt?: Date
    resolvedBy?: string
}

export interface PlatformStats {
    totalWagers: number
    totalVolume: bigint
    feesCollected: bigint
    activeWagers: number
    pendingSettlements: number
}

