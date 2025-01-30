const axios = require('axios');

module.exports = {
    name: 'monitor',
    description: 'Monitors a Best Buy product page and notifies when the product becomes available.',
    syntax: '!monitor <product_url>',
    num_args: 1, // Minimum amount of arguments to accept
    args_to_lower: false, // Arguments should preserve case (URLs are case-sensitive)
    needs_api: true, // This command needs access to the internet
    has_state: false, // Not using a state engine
    async execute(message, args, extra) {
        const productUrl = args[1];

        // Validate the URL
        if (!productUrl.startsWith('https://www.bestbuy.com/site/')) {
            this.logger.error('Invalid URL provided.');
            return message.channel.send('❌ Please provide a valid Best Buy product URL.');
        }

        // Inform the user that monitoring has started
        message.channel.send(`🔍 **Started monitoring the product:** ${productUrl}\n⏳ Monitoring will stop automatically after 10 minutes.`);
        this.logger.info(`Started monitoring: ${productUrl}`);

        // Define the interval and timeout durations
        const checkInterval = 5 * 1000; // 5 seconds
        const maxDuration = 10 * 60 * 1000; // 10 minutes

        let isAvailable = false;
        let intervalId;
        let timeoutId;

        const checkAvailability = async () => {
            try {
                const response = await axios.get(productUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    },
                    timeout: 1000, // 5 seconds timeout
                });

                const html = response.data;

                const availableIndicator = 'data-button-state="ADD_TO_CART"';
                const availableText = 'Add to Cart';

                const isAvailableNow = html.includes(availableIndicator) && html.includes(availableText);

                this.logger.info(`Checked availability: ${isAvailableNow ? 'AVAILABLE' : 'UNAVAILABLE'}`);

                if (isAvailableNow && !isAvailable) {
                    isAvailable = true;
                    message.channel.send(`<@185223223892377611> 🎉 **Product is AVAILABLE!** 🎉\n${productUrl}`);
                    this.logger.info(`Product available: ${productUrl}`);

                    clearInterval(intervalId);
                    clearTimeout(timeoutId);
                }
            } catch (error) {
                this.logger.error(`Error checking availability: ${error.message}`);
                message.channel.send(`⚠️ An error occurred while checking the product: ${error.message}`);

                clearInterval(intervalId);
                clearTimeout(timeoutId);
            }
        };

        try {
            // Initial check
            await checkAvailability();

            // Set up interval
            intervalId = setInterval(checkAvailability, checkInterval);

            // Set up timeout
            timeoutId = setTimeout(() => {
                if (!isAvailable) {
                    message.channel.send(`⏰ **Monitoring stopped:** The product is still unavailable after 10 minutes.\n${productUrl}`);
                    this.logger.info(`Monitoring stopped after timeout: ${productUrl}`);
                }
                clearInterval(intervalId);
            }, maxDuration);
        } catch (initError) {
            this.logger.error(`Initialization error: ${initError.message}`);
            message.channel.send(`⚠️ An error occurred during monitoring setup: ${initError.message}`);
        }
    }
};
