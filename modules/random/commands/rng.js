const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'rng',
    description: 'Roll a random number or dice notation (ex: 2d6).',
    syntax: 'rng [max]|[min max]|[XdY]',
    num_args: 0,
    args_to_lower: false,
    needs_api: false,
    has_state: false,
    async execute(message, args, extra) {
        const usageText = 'Usage: `,rng` | `,rng 20` | `,rng 5 20` | `,rng 2d6`';
        const rawArgs = args.slice(1).filter(part => part !== undefined && part !== null && part.toString().trim().length > 0);

        this.logger.info(`[RNG] Command invoked by ${message.author.id} with args: ${JSON.stringify(rawArgs)}`);

        try {
            let min = 1;
            let max = 100;
            let result = null;
            let detail = '';

            if (rawArgs.length === 0) {
                detail = 'Default range';
            } else if (rawArgs.length === 1) {
                const token = rawArgs[0].toString().trim();
                const diceMatch = token.match(/^(\d+)d(\d+)$/i);

                if (diceMatch) {
                    const count = Number.parseInt(diceMatch[1], 10);
                    const sides = Number.parseInt(diceMatch[2], 10);

                    if (!Number.isInteger(count) || !Number.isInteger(sides) || count <= 0 || sides <= 1 || count > 100 || sides > 10000) {
                        this.logger.info(`[RNG] Invalid dice notation values: count=${count}, sides=${sides}`);
                        return message.channel.send({ content: `Invalid dice notation. ${usageText}` });
                    }

                    const rolls = [];
                    for (let i = 0; i < count; i++) {
                        rolls.push(Math.floor(Math.random() * sides) + 1);
                    }

                    result = rolls.reduce((sum, value) => sum + value, 0);
                    min = 1;
                    max = sides;
                    detail = `${count}d${sides} → [${rolls.join(', ')}]`;
                } else {
                    const parsedMax = Number.parseInt(token, 10);
                    if (!Number.isInteger(parsedMax) || parsedMax < 1) {
                        this.logger.info(`[RNG] Invalid single-number argument: ${token}`);
                        return message.channel.send({ content: `Please provide a positive whole number. ${usageText}` });
                    }
                    min = 1;
                    max = parsedMax;
                    detail = 'Custom max';
                }
            } else if (rawArgs.length === 2) {
                const parsedA = Number.parseInt(rawArgs[0], 10);
                const parsedB = Number.parseInt(rawArgs[1], 10);

                if (!Number.isInteger(parsedA) || !Number.isInteger(parsedB)) {
                    this.logger.info(`[RNG] Invalid min/max arguments: ${rawArgs[0]}, ${rawArgs[1]}`);
                    return message.channel.send({ content: `Please provide two whole numbers for a range. ${usageText}` });
                }

                min = Math.min(parsedA, parsedB);
                max = Math.max(parsedA, parsedB);
                detail = parsedA <= parsedB ? 'Custom range' : 'Custom range (auto-corrected order)';
            } else {
                this.logger.info(`[RNG] Too many arguments provided: ${rawArgs.length}`);
                return message.channel.send({ content: `Too many arguments. ${usageText}` });
            }

            if (result === null) {
                result = Math.floor(Math.random() * (max - min + 1)) + min;
            }

            const embed = new EmbedBuilder()
                .setColor(0x5865F2)
                .setTitle('🎲 RNG Roll')
                .addFields(
                    { name: 'Range', value: `${min} to ${max}`, inline: true },
                    { name: 'Result', value: `**${result}**`, inline: true },
                    { name: 'Mode', value: detail, inline: false }
                )
                .setFooter({ text: `Requested by ${message.member?.displayName ?? message.author.username}` })
                .setTimestamp();

            this.logger.info(`[RNG] Success for ${message.author.id}: min=${min}, max=${max}, result=${result}, mode=${detail}`);
            await message.channel.send({ embeds: [embed] });
        } catch (error) {
            this.logger.error(`[RNG] Failed to execute command for ${message.author.id}: ${error.message}`);
            await message.channel.send({ content: 'Something went wrong while rolling. Try again in a moment.' });
        }
    }
};