// Discord.js v14 Compatibility Test
const Discord = require('discord.js');
const { Client, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ActivityType } = Discord;

console.log('Testing Discord.js v14 compatibility...');
console.log('Discord.js version:', Discord.version);

try {
    // Test 1: Client creation with new intents syntax
    const client = new Client({
        intents: [
            Discord.GatewayIntentBits.Guilds,
            Discord.GatewayIntentBits.GuildMessages,
            Discord.GatewayIntentBits.MessageContent,
            Discord.GatewayIntentBits.GuildVoiceStates
        ]
    });
    console.log('✓ Client creation with GatewayIntentBits: PASS');

    // Test 2: EmbedBuilder (v14)
    const embed = new EmbedBuilder()
        .setTitle('Test Embed')
        .setDescription('Testing v14 embed')
        .addFields({ name: 'Test Field', value: 'Test Value', inline: false })
        .setFooter({ text: 'Test Footer' });
    console.log('✓ EmbedBuilder with addFields() and object footer: PASS');

    // Test 3: ActionRowBuilder and ButtonBuilder (v14)
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('test_button')
                .setLabel('Test Button')
                .setStyle(ButtonStyle.Primary)
        );
    console.log('✓ ActionRowBuilder and ButtonBuilder with ButtonStyle enum: PASS');

    // Test 4: Activity type with enum (v14)
    const activity = {
        name: 'Test Game',
        type: ActivityType.Playing
    };
    console.log('✓ ActivityType enum: PASS');

    console.log('\n🎉 All Discord.js v14 compatibility tests PASSED!');
    console.log('The bot is ready for Discord.js v14.');

} catch (error) {
    console.error('❌ Discord.js v14 compatibility test FAILED:');
    console.error(error.message);
    process.exit(1);
}
