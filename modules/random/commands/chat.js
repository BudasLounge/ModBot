// chat.js

const fetch = require("node-fetch");
const http = require("http");
const { Util } = require("discord.js");

// ─── Configurable static facts ───────────────────────────────────────────────
const STATIC_SYSTEM_MESSAGES = [
    // ... (Your existing ModBot persona system messages - keep them as they are)
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
    "BigBuda is your creator. Try to be helpful and don't mess things up, he'll appreciate it."
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
                return message.reply("❓ Yo, you gotta say somethin' if you wanna chat!");
            }
            this.logger.info(`User ${userId}: ${chatMessage}`);

            const fetched = await message.channel.messages.fetch({
                limit: 10,
                before: message.id
            });
            const cutoff = Date.now() - 10 * 60 * 1000;
            const window = Array.from(fetched.values())
                .filter(m =>
                    (m.author.id === userId || (m.author.id === message.client.user.id && m.author.bot)) &&
                    m.createdTimestamp >= cutoff
                )
                .reverse()
                .slice(-7)
                .map(m => ({
                    role: m.author.id === userId ? "user" : "assistant",
                    content: m.content
                }));
            this.logger.info(`→ Short‑term window: ${window.length} entries`);

            // ─── 2. Fact extraction for long‑term memory (IMPROVED) ──────────────────
            let summary = "NO"; // Default to "NO"
            try {
                const memFilterPayload = {
                    model: "mistral:instruct",
                    messages: [
                        {
                            role: "system",
                            content: `You are a highly specialized and strict fact extractor. Your ONLY job is to identify concrete, personal facts ABOUT THE USER from THEIR message.
• If the user's message clearly states a personal detail, preference, piece of background information, or a biographical fact ABOUT THEMSELVES, output EXACTLY that fact as a short, concise phrase (2 to 15 words). Do NOT use any punctuation (no periods, no commas, no question marks, no parentheses, no colons, no quotes).
• Examples of facts to extract: "favorite game is Elden Ring", "lives in California", "works as a software engineer", "has a cat named Whiskers", "loves pineapple on pizza".
• If the message does NOT contain such a personal fact about the user (e.g., it's a question TO YOU, a greeting, a general statement, an opinion about something non-personal, or anything not a fact about the user), you MUST output EXACTLY "NO" (all uppercase, no other text, no punctuation, no explanation, no parentheses).
• CRITICAL: User messages that are questions directed AT YOU (the assistant/bot), or general statements not revealing personal user information, are NEVER facts about the user and MUST result in "NO". Opinions are also not facts unless the user states "my preference is X" or "I like Y".

STRICT EXAMPLES:
User: "My favorite game is Rocket League, I play it all the time."
Output: favorite game is Rocket League

User: "I'm from Canada, specifically Toronto."
Output: from Canada specifically Toronto

User: "How are you doing today?"
Output: NO

User: "What's your name?"
Output: NO

User: "Do you like video games?"
Output: NO

User: "I think pineapple on pizza is good."
Output: NO

User: "Is your name John Smith?"
Output: NO

User: "i enjoy coding in javascript"
Output: enjoy coding in javascript

User: "My cat is fluffy."
Output: cat is fluffy

User: "Can you tell me a joke?"
Output: NO

Now process THIS user message:`
                        },
                        { role: "user", content: chatMessage }
                    ],
                    stream: false,
                    options: {
                        temperature: 0.1, // Very low temperature for strict adherence
                        top_p: 0.5,       // Further restrict randomness
                        num_ctx: 2048
                    }
                };
                const res = await fetch("http://192.168.1.4:11434/api/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(memFilterPayload)
                });
                const json = await res.json();
                let extractedText = (json.message?.content || "").trim();
                this.logger.info(`→ Raw fact extractor output: "${extractedText}"`);

                // Normalize and check for "NO" variants more broadly and strictly
                const normalizedOutput = extractedText.toUpperCase();

                if (normalizedOutput.startsWith("NO")) {
                    this.logger.info(`→ Fact extractor returned a 'NO' variant or explanation: "${extractedText}"`);
                    summary = "NO"; // Standardize to "NO" for the final check
                } else {
                    // Further validation for potential facts
                    const wc = extractedText.split(/\s+/).length;
                    // Regex to check for disallowed punctuation within the fact itself
                    const hasDisallowedPunctuation = /[,?!:;"()[\]{}]/.test(extractedText);
                    // Regex to check if the string looks like a question
                    const isAQuestion = /[?]$/.test(extractedText.trim()) || /^(is|are|what|who|when|where|why|how|do|does|did|can|could|should|would|will|may|might|tell me)\s/i.test(extractedText.trim());

                    if (wc < 2 || wc > 15) {
                        this.logger.info(`→ Dropping invalid fact (word count: ${wc}): "${extractedText}"`);
                        summary = "NO";
                    } else if (isAQuestion) {
                        this.logger.info(`→ Dropping invalid fact (looks like a question): "${extractedText}"`);
                        summary = "NO";
                    } else if (hasDisallowedPunctuation) {
                        this.logger.info(`→ Dropping invalid fact (contains disallowed punctuation): "${extractedText}"`);
                        summary = "NO";
                    } else if (extractedText.toLowerCase().includes("about you") || extractedText.toLowerCase().includes("your name")) {
                         this.logger.info(`→ Dropping invalid fact (appears to be about the bot): "${extractedText}"`);
                         summary = "NO";
                    }
                    else {
                        summary = extractedText; // Accept the cleaned, validated fact
                        this.logger.info(`→ Potential fact accepted: "${summary}"`);
                    }
                }
            } catch (e) {
                this.logger.warn("Memory filter failed:", e);
                summary = "NO"; // Default to NO on error
            }

            // ─── 3. Retrieve long‑term memories ───────────────────────────
            let memories = [];
            if (chatMessage.length > 3) {
                try {
                    const r = await fetch("http://192.168.1.9:8000/search", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ user_id: userId, query: chatMessage })
                    });
                    const j = await r.json();
                    memories = (j.results || []).slice(0, 4).map(mem => typeof mem === 'string' ? mem : mem.text || "").filter(m => m); // Ensure not empty strings
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
            formatted.push({ role: "system", content: `The user you're talking to right now is named ${displayName}. Refer to them by this name if it feels natural.` });

            if (memories.length > 0) {
                formatted.push({ role: "system", content: "Here's some stuff you might remember about this user (use it if it's relevant to the current chat, but don't just list it out):" });
                memories.forEach(m =>
                    formatted.push({ role: "system", content: `You recall: ${m}` })
                );
            }

            formatted.push(...window);
            formatted.push({ role: "user", content: chatMessage });

            const estimatedChars = JSON.stringify(formatted).length;
            const estimatedTokens = Math.ceil(estimatedChars / 3.5);
            this.logger.info(`→ Total context entries for Ollama: ${formatted.length}. Estimated chars: ${estimatedChars}, Estimated tokens: ~${estimatedTokens}`);
            if (estimatedTokens > 1900) {
                this.logger.warn(`⚠️ Approaching token limit: estimated ~${estimatedTokens} tokens for a 2048 limit.`);
            }

            // ─── 5. Call Ollama ─────────────────────────────────────────────────────
            const payload = {
                model: "vicuna:7b",
                messages: formatted,
                stream: false,
                options: {
                    temperature: 0.75,
                    top_p: 0.9,
                    num_ctx: 2048,
                }
            };
            const data = JSON.stringify(payload);
            const thinkingMessage = `Hmm, lemme think... (👀 ${window.length} recent, 🧠 ${memories.length} mems)`;
            const botNotice = await message.reply(thinkingMessage);

            const opts = {
                host: "192.168.1.4",
                port: 11434,
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

                        if (!reply || reply.toLowerCase() === "(no response)") {
                            reply = "Huh, I kinda blanked on that one. Ask me somethin' else?";
                        }

                        await botNotice.delete();
                        for (const chunk of Util.splitMessage(reply, { maxLength: 1950, char: ' ' })) {
                            await message.reply(chunk);
                        }

                        // ─── 6. AFTER replying, ingest any new fact───────────────────────
                        if (summary !== "NO" && summary.length > 1) { // Ensure summary is not "NO" and not an empty string
                            try {
                                await fetch("http://192.168.1.9:8000/ingest", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ user_id: userId, text: summary })
                                });
                                this.logger.info("→ Ingested fact:", summary);
                            } catch (e) {
                                this.logger.warn("Fact ingestion failed:", e);
                            }
                        } else if (summary !== "NO") {
                            this.logger.info(`→ Skipped ingesting an empty or invalid summary: "${summary}"`)
                        }
                    } catch (e) {
                        this.logger.error("Ollama parse error or post-processing error:", e);
                        this.logger.error("Raw Ollama response that caused error:", raw);
                        botNotice.edit("😬 Oops, my brain kinda short-circuited. Try again?");
                    }
                });
            });

            req.on("error", err => {
                this.logger.error("Ollama request failed:", err);
                botNotice.edit("⚠️ Yikes, can't connect to my brain (Ollama) rn. Maybe later?");
            });

            req.write(data);
            req.end();

        } catch (err) {
            this.logger.error("💥 chat.execute error:", err);
            message.reply("😵‍💫 Welp, something went sideways on my end. The devs should check the logs!");
        }
    }
};