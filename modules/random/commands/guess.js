/**
 * Guess Command for AI Security Breach Game
 * Allows players to attempt to guess the secret password
 */

const breachGame = require('./breach.js');

module.exports = {
    name: 'guess',
    description: 'Attempt to guess the secret password in the AI Security Breach Game',
    syntax: 'guess <word>',
    num_args: 1,
    args_to_lower: true,
    needs_api: false,
    has_state: false,

    async execute(message, args, extra) {
        // Only work in breach channel
        if (message.channel.id !== breachGame.BREACH_GAME_CHANNEL) {
            return message.reply('This command only works in the breach game channel!');
        }

        // Check maintenance mode
        if (breachGame.gameState.isMaintenanceMode) {
            return message.reply('🔒 The game is currently in maintenance mode. Please wait...');
        }

        const guess = args.slice(1).join(' ').toLowerCase().trim();

        if (!guess) {
            return message.reply('Usage: `,guess <word>`');
        }

        this.logger.info(`[BREACH] Guess attempt by ${message.author.id}: "${guess}" (secret: "${breachGame.gameState.secretWord}")`);

        if (guess === breachGame.gameState.secretWord.toLowerCase()) {
            // CORRECT GUESS - Trigger breach!
            await breachGame.triggerBreachSequence(message, this.logger);
        } else {
            // Wrong guess
            await message.reply('❌ **Access Denied.**');
        }
    }
};
