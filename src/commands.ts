import type { BotCommand } from '@towns-protocol/bot'

// Those commands will be registered to the bot as soon as the bot is initialized
// and will be available in the slash command autocomplete.
const commands = [
    {
        name: 'start',
        description: 'Welcome message and instructions',
    },
    {
        name: 'create',
        description: 'Create a new wager',
    },
    {
        name: 'browse',
        description: 'View available open wagers',
    },
    {
        name: 'mywagers',
        description: 'View your active wagers',
    },
    {
        name: 'history',
        description: 'View your completed wagers',
    },
    {
        name: 'balance',
        description: 'Check your balance',
    },
    {
        name: 'deposit',
        description: 'Learn how to deposit funds',
    },
    {
        name: 'cancel',
        description: 'Cancel your unwagered bet',
    },
    {
        name: 'dispute',
        description: 'Open dispute on settled wager',
    },
    {
        name: 'admin',
        description: 'Admin dashboard (admin only)',
    },
] as const satisfies BotCommand[]

export default commands
