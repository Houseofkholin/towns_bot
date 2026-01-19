import type { Wager, User, Transaction, Dispute, PlatformStats } from './types'

// In-memory storage - replace with database in production
class Storage {
    private wagers: Map<string, Wager> = new Map()
    private users: Map<string, User> = new Map()
    private transactions: Map<string, Transaction> = new Map()
    private disputes: Map<string, Dispute> = new Map()
    private adminUsers: Set<string> = new Set()

    // Wager operations
    createWager(wager: Wager): void {
        this.wagers.set(wager.id, wager)
    }

    getWager(id: string): Wager | undefined {
        return this.wagers.get(id)
    }

    updateWager(id: string, updates: Partial<Wager>): void {
        const wager = this.wagers.get(id)
        if (wager) {
            this.wagers.set(id, { ...wager, ...updates })
        }
    }

    getAllWagers(): Wager[] {
        return Array.from(this.wagers.values())
    }

    getOpenWagers(): Wager[] {
        return Array.from(this.wagers.values()).filter((w) => w.status === 'open')
    }

    getUserWagers(userId: string): Wager[] {
        return Array.from(this.wagers.values()).filter(
            (w) => w.creatorId === userId || w.acceptorId === userId,
        )
    }

    getActiveWagers(userId: string): Wager[] {
        return Array.from(this.wagers.values()).filter(
            (w) =>
                (w.creatorId === userId || w.acceptorId === userId) &&
                (w.status === 'open' || w.status === 'accepted' || w.status === 'pending_settlement'),
        )
    }

    getPendingSettlements(): Wager[] {
        return Array.from(this.wagers.values()).filter((w) => w.status === 'pending_settlement')
    }

    // User operations
    getUser(userId: string): User | undefined {
        return this.users.get(userId)
    }

    getOrCreateUser(userId: string, username?: string): User {
        let user = this.users.get(userId)
        if (!user) {
            user = {
                userId,
                username,
                balance: 0n,
                totalWagersCreated: 0,
                totalWagersAccepted: 0,
                totalWon: 0,
                totalLost: 0,
            }
            this.users.set(userId, user)
        } else if (username && user.username !== username) {
            user.username = username
        }
        return user
    }

    updateUser(userId: string, updates: Partial<User>): void {
        const user = this.users.get(userId)
        if (user) {
            this.users.set(userId, { ...user, ...updates })
        }
    }

    // Transaction operations
    createTransaction(transaction: Transaction): void {
        this.transactions.set(transaction.id, transaction)
    }

    getTransaction(id: string): Transaction | undefined {
        return this.transactions.get(id)
    }

    getUserTransactions(userId: string): Transaction[] {
        return Array.from(this.transactions.values())
            .filter((t) => t.userId === userId)
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
    }

    updateTransaction(id: string, updates: Partial<Transaction>): void {
        const transaction = this.transactions.get(id)
        if (transaction) {
            this.transactions.set(id, { ...transaction, ...updates })
        }
    }

    // Dispute operations
    createDispute(dispute: Dispute): void {
        this.disputes.set(dispute.id, dispute)
    }

    getDispute(id: string): Dispute | undefined {
        return this.disputes.get(id)
    }

    getDisputesByWager(wagerId: string): Dispute[] {
        return Array.from(this.disputes.values()).filter((d) => d.wagerId === wagerId)
    }

    updateDispute(id: string, updates: Partial<Dispute>): void {
        const dispute = this.disputes.get(id)
        if (dispute) {
            this.disputes.set(id, { ...dispute, ...updates })
        }
    }

    // Admin operations
    isAdmin(userId: string): boolean {
        return this.adminUsers.has(userId)
    }

    setAdmin(userId: string, isAdmin: boolean): void {
        if (isAdmin) {
            this.adminUsers.add(userId)
        } else {
            this.adminUsers.delete(userId)
        }
    }

    // Platform stats
    getPlatformStats(): PlatformStats {
        const allWagers = Array.from(this.wagers.values())
        const totalVolume = allWagers.reduce((sum, w) => sum + w.stakeAmount * 2n, 0n)
        const feesCollected = allWagers
            .filter((w) => w.status === 'settled')
            .reduce((sum, w) => {
                const totalPool = w.stakeAmount * 2n
                const fee = (totalPool * 5n) / 100n
                return sum + fee
            }, 0n)

        return {
            totalWagers: allWagers.length,
            totalVolume,
            feesCollected,
            activeWagers: allWagers.filter(
                (w) => w.status === 'open' || w.status === 'accepted' || w.status === 'pending_settlement',
            ).length,
            pendingSettlements: allWagers.filter((w) => w.status === 'pending_settlement').length,
        }
    }
}

export const storage = new Storage()

