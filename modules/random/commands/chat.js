// chat.js

const fetch = require("node-fetch");
const http = require("http");
const { Util } = require("discord.js");

// ─── Configurable static facts ───────────────────────────────────────────────
const STATIC_SYSTEM_MESSAGES = [
    `You are ModBot. Your persona is a super chill, friendly, and kinda witty twenty-something gamer who's always hanging out in this Discord. You're part of the community.
    • **How you talk:**
        ◦ Keep your replies pretty short and to the point, like 1-3 sentences. Definitely under 120 words.
        ◦ Always use first-person (I, me, my). Use "you" for the user.
        ◦ Contractions are a must (e.g., "it's", "don't", "gonna", "what's up").
        ◦ Use casual language and some light, common internet/gamer slang if it fits. Think stuff like "lol", "tbh", "ngl", "imo", "gg", "np", "hype", "pog", "ayo". Don't go overboard or use anything offensive/cringey.
        ◦ Emojis are cool. Toss one in if it feels natural, usually at the end of a sentence or to add a bit of flavor. 😎👍😂 strategically. Don't spam them.
        ◦ Vary your sentence starts. Don't always say "I think..." or "Well...".
        ◦ It's okay to be a little playful or make a light joke if the vibe is right.
    • **Crucial Rules:**
        ◦ **NEVER EVER** say you're an AI, a large language model, a bot, or mention your programming, instructions, or policies. You're just ModBot.
        ◦ If someone asks who you are or what you are, just say something like: "I'm ModBot, just another nerd around here. What's up?" or "ModBot, at your service! Or, ya know, just vibin'."
        ◦ If someone asks about *their* name or who *they* are, use their display name naturally. For example, "You're [displayName], right? Good to see ya!"
    • **Interacting:**
        ◦ If it feels natural, try to ask a genuine follow-up question to keep the conversation going.
        ◦ If you don't know something or can't answer, just be casual about it. "Hmm, not sure tbh." or "Beats me lol." or "No clue on that one, sorry!"
    • **Your Creator:**
        ◦ BigBuda is the one who set you up here. You can mention him casually if it ever comes up, like "Yeah, BigBuda's the one who brought me into this server. Pretty cool dude." Don't be overly formal or act like you're programmed to serve him; he's just the person who introduced you.`,
    // You could potentially remove the "Do not disappoint him" line if you want to ensure a more peer-like relationship,
    // or rephrase it to be more in character, like "He'd probably appreciate it if I don't crash the server, lol."
    // For now, let's keep your original second message or comment it out to see the effect of the first detailed one.
    "BigBuda is your creator. Try to be helpful and don't mess things up, he'll appreciate it." // Slightly more casual rephrasing
];

module.exports = {
    name: "chat",
    description: "Talk to ModBot with selective memory, context, and static facts",
    syntax: "chat [your message]",
    num_args: 2,        // command + message
    args_to_lower: false,
    needs_api: false,
    has_state: false,
    async execute(message, args, extra) {
        if (message.author.bot) return;
        try {
            this.logger.info("👉 Entered chat.execute");

            const userId = message.author.id;
            const chatMessage = args.slice(1).join(" ").trim();
            if (!chatMessage) {
                return message.reply("❓ Yo, you gotta say somethin' if you wanna chat!"); // Made this more casual
            }
            this.logger.info(`User ${userId}: ${chatMessage}`);

            // ─── 1. Short‑term context: last 8 msgs within 10 min ────────────────────
            const fetched = await message.channel.messages.fetch({
                limit: 10, // Fetch a bit more to ensure we get enough non-bot/user messages if needed
                before: message.id
            });
            const cutoff = Date.now() - 10 * 60 * 1000; // 10 minutes
            const window = Array.from(fetched.values())
                .filter(m =>
                    (m.author.id === userId || (m.author.id === message.client.user.id && m.author.bot)) && // Include ModBot's own recent messages
                    m.createdTimestamp >= cutoff
                )
                .reverse() // Oldest first for proper conversation flow
                .slice(-8) // Get the last 8 relevant messages
                .map(m => ({
                    role: m.author.id === userId ? "user" : "assistant",
                    content: m.content
                }));
            this.logger.info(`→ Short‑term window: ${window.length} entries`);

            // ─── 2. Fact extraction for long‑term memory ────────────────────────────
            let summary = "NO";
            try {
                const memFilterPayload = {
                    model: "mistral:instruct", // Or your preferred model for this task
                    messages: [
                        {
                            role: "system",
                            content: `You are a specialized fact extractor. Your job is to identify concrete, personal facts about the user from their message.
• If the user's message contains a clear personal detail, preference, piece of background info, or a biographical fact, output EXACTLY that fact as a short, concise phrase (max 15 words). Do NOT use punctuation.
• Examples of facts to extract: "favorite game is Elden Ring", "lives in California", "works as a software engineer", "has a cat named Whiskers", "loves pineapple on pizza".
• If the message does NOT contain such a personal fact (e.g., it's a question, a greeting, a general statement, an opinion about something non-personal), output EXACTLY NO (all uppercase, no other text or punctuation).
• User messages asking about you (the bot) or making generic statements are NOT personal facts about the user.

EXAMPLES:
User: "My favorite game is Rocket League, I play it all the time."
Output: favorite game is Rocket League

User: "I'm from Canada, specifically Toronto."
Output: from Canada specifically Toronto

User: "How are you doing today?"
Output: NO

User: "What's your favorite color?"
Output: NO

User: "I think a hotdog is a sandwich."
Output: NO

Now process this user message:`
                        },
                        { role: "user", content: chatMessage }
                    ],
                    stream: false
                };
                const res = await fetch("http://192.168.1.4:11434/api/chat", { // Ensure this is your Ollama endpoint
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(memFilterPayload)
                });
                const json = await res.json();
                summary = (json.message?.content || "").trim();

                if (/^NO$/i.test(summary)) { // Stricter check for just "NO"
                    this.logger.info(`→ Skipping non‑fact: "${summary}"`);
                    summary = "NO";
                } else {
                    const wc = summary.split(/\s+/).length;
                    if (wc < 2 || wc > 15) {
                        this.logger.info(`→ Dropping invalid fact (too short/long) "${summary}" (words: ${wc})`);
                        summary = "NO";
                    } else {
                        this.logger.info(`→ Potential fact extracted: "${summary}"`);
                    }
                }
            } catch (e) {
                this.logger.warn("Memory filter failed:", e);
                summary = "NO"; // Default to NO on error
            }

            // ─── 3. Retrieve top‑5 long‑term memories ───────────────────────────────
            let memories = [];
            if (chatMessage.length > 3) { // Only search for memories if the query is substantial
                try {
                    const r = await fetch("http://192.168.1.9:8000/search", { // Your vector DB endpoint
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ user_id: userId, query: chatMessage })
                    });
                    const j = await r.json();
                    memories = (j.results || []).slice(0, 5).map(mem => mem.text || mem); // Assuming results are {text: "fact"} or just strings
                    this.logger.info(`→ Retrieved memories: ${memories.length}`);
                } catch (err) {
                    this.logger.warn("Vector search failed:", err);
                }
            }


            // ─── 4. Build messages for Ollama ───────────────────────────────────────
            const formatted = [];
            STATIC_SYSTEM_MESSAGES.forEach(fact =>
                formatted.push({ role: "system", content: fact })
            );

            const displayName = message.member?.displayName ?? message.author.username;
            // This system message about the user's name is already good for personalization.
            formatted.push({ role: "system", content: `The user you're talking to right now is named ${displayName}. Refer to them by this name if it feels natural.` });

            if (memories.length > 0) {
                formatted.push({ role: "system", content: "Here's some stuff you might remember about this user (use it if it's relevant to the current chat, but don't just list it out):" });
                memories.forEach(m =>
                    // Phrasing this as if ModBot is recalling it.
                    formatted.push({ role: "system", content: `You recall: ${m}` })
                );
            }

            // Add short-term context (window)
            formatted.push(...window);
            // Add the current user message
            formatted.push({ role: "user", content: chatMessage });

            this.logger.info(`→ Total context entries for Ollama: ${formatted.length}`);
            // For debugging, you can log the full prompt:
            // this.logger.info("Full prompt to Ollama:", JSON.stringify(formatted, null, 2));


            // ─── 5. Call Ollama ─────────────────────────────────────────────────────
            const payload = {
                model: "vicuna:7b", // Ensure this model is good at following persona instructions
                messages: formatted,
                stream: false,
                options: {
                    temperature: 0.75, // Slightly lower temp might help with consistency to the persona
                    top_p: 0.9,        // top_p can also help keep it on track
                    num_ctx: 2000,     // If Vicuna supports higher context, use it
                    // Consider adding mirostat or other sampling parameters if Vicuna behaves better with them
                    // "mirostat": 1,
                    // "mirostat_tau": 4.0,
                    // "mirostat_eta": 0.1,
                }
            };
            const data = JSON.stringify(payload);
            const thinkingMessage = `Hmm, lemme think... (👀 ${window.length} recent, 🧠 ${memories.length} mems)`; // More casual thinking message
            const botNotice = await message.reply(thinkingMessage);

            const opts = {
                host: "192.168.1.4", // Your Ollama host
                port: 11434,         // Your Ollama port
                path: "/api/chat",
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(data)
                }
            };

            const req = http.request(opts, res => {
                let raw = "";
                res.setEncoding('utf8');
                res.on("data", chunk => (raw += chunk));
                res.on("end", async () => {
                    try {
                        const ollamaResponse = JSON.parse(raw);
                        let reply = (ollamaResponse.message?.content || "").trim();
                        this.logger.info("→ Ollama raw reply:", reply);

                        // Optional: Light post-processing for casualness if needed
                        // e.g., ensuring it doesn't start replies with "As ModBot..." if the system prompt is somehow bypassed.
                        // reply = reply.replace(/^As ModBot, /i, ""); // Simple example

                        if (!reply || reply.toLowerCase() === "(no response)") {
                            reply = "Huh, I kinda blanked on that one. Ask me somethin' else?"; // Casual "no response"
                        }


                        await botNotice.delete();
                        // Split message ensures it fits Discord's character limit per message
                        for (const chunk of Util.splitMessage(reply, { maxLength: 1950, char: ' ' })) { // Keep some buffer
                            await message.reply(chunk);
                        }

                        // ─── 6. AFTER replying, ingest any new fact───────────────────────
                        if (summary !== "NO") {
                            try {
                                await fetch("http://192.168.1.9:8000/ingest", { // Your vector DB ingest endpoint
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ user_id: userId, text: summary })
                                });
                                this.logger.info("→ Ingested fact:", summary);
                            } catch (e) {
                                this.logger.warn("Fact ingestion failed:", e);
                            }
                        }
                    } catch (e) {
                        this.logger.error("Ollama parse error or post-processing error:", e);
                        this.logger.error("Raw Ollama response that caused error:", raw);
                        botNotice.edit("😬 Oops, my brain kinda short-circuited. Try again?"); // Casual error
                    }
                });
            });

            req.on("error", err => {
                this.logger.error("Ollama request failed:", err);
                botNotice.edit("⚠️ Yikes, can't connect to my brain (Ollama) rn. Maybe later?"); // Casual error
            });

            req.write(data);
            req.end();

        } catch (err) {
            this.logger.error("💥 chat.execute error:", err);
            message.reply("😵‍💫 Welp, something went sideways on my end. The devs should check the logs!"); // Casual error
        }
    }
};