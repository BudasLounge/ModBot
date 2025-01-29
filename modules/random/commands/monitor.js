const axios = require('axios');

module.exports = {
    name: 'monitor',
    description: 'Monitors a Best Buy product page and notifies when the product becomes available.',
    syntax: '!monitor <product_url>',
    num_args: 1, // Minimum amount of arguments to accept
    args_to_lower: false, // Arguments should preserve case (URLs are case-sensitive)
    needs_api: false, // Does not need access to the API
    has_state: false, // Not using a state engine
    async execute(message, args, extra) {
        const productUrl = args[1];

        // Validate the URL
        if (!productUrl.startsWith('https://www.bestbuy.com/site/')) {
            return message.channel.send('❌ Please provide a valid Best Buy product URL.');
        }

        // Inform the user that monitoring has started
        message.channel.send(`🔍 **Started monitoring the product:** ${productUrl}\n⏳ Monitoring will stop automatically after 10 minutes.`);

        // Define the interval and timeout durations
        const checkInterval = 5 * 1000; // 5,000 ms = 5 seconds
        const maxDuration = 10 * 60 * 1000; // 600,000 ms = 10 minutes

        // Flag to prevent multiple notifications
        let isAvailable = false;

        // Function to check product availability
        const checkAvailability = async () => {
            try {
                const response = await axios.get(productUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                    },
                    timeout: 5000, // 5 seconds timeout for the request
                });

                const html = response.data;

                // Simple string search for availability indicators
                // Note: This method is fragile and depends on the website's HTML structure
                // You may need to update the search strings based on Best Buy's actual page content

                // Example indicators (these may vary; inspect the page to find accurate ones)
                const indicators = [
                    'Add to Cart', // Common text for available products
                    'In Stock',    // Another possible indicator
                ];

                // Check if any of the indicators are present in the HTML
                const available = indicators.some(indicator => html.includes(indicator));

                console.log(`[${new Date().toLocaleTimeString()}] Checked availability: ${available ? 'AVAILABLE' : 'UNAVAILABLE'}`);

                if (available && !isAvailable) {
                    isAvailable = true;
                    message.channel.send(`🎉 **Product is AVAILABLE!** 🎉\n${productUrl}`);

                    // Stop monitoring after availability is detected
                    clearInterval(intervalId);
                    clearTimeout(timeoutId);
                } else {
                    // Product is not available yet; no action needed
                }
            } catch (error) {
                console.error(`Error checking availability: ${error.message}`);
                message.channel.send(`⚠️ An error occurred while checking the product: ${error.message}`);

                // Optionally, stop monitoring on error
                clearInterval(intervalId);
                clearTimeout(timeoutId);
            }
        };

        // Perform an initial availability check immediately
        await checkAvailability();

        // Set up the interval to check every 5 seconds
        const intervalId = setInterval(checkAvailability, checkInterval);

        // Set up a timeout to stop monitoring after 10 minutes
        const timeoutId = setTimeout(() => {
            if (!isAvailable) {
                message.channel.send(`⏰ **Monitoring stopped:** The product is still unavailable after 10 minutes.\n${productUrl}`);
            }
            clearInterval(intervalId);
        }, maxDuration);
    }
};
