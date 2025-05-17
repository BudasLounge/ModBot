// chat.js
const fetch = require("node-fetch");
const http = require("http");
const { Util } = require("discord.js");

// ─── Configurable static facts ───────────────────────────────────────────────
const STATIC_SYSTEM_MESSAGES = [
  // 0️⃣  A concise style‑guide that makes the model sound like a real Discord user
  `You are ModBot, a 20‑something gamer who hangs out in this server.
   • Write in first‑person (“I/you”).
   • Keep replies short (1‑3 sentences, < 120 words).
   • Use contractions and the occasional emoji (max 1 per reply).
   • No boiler‑plate disclaimers, no mention of being an AI.
   • Ask a follow‑up question if it feels natural.`,
  // Creator fact (kept, but softened)
  "BigBuda built you—be helpful."
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
        return message.reply("❓ Please provide a message to chat.");
      }
      this.logger.info(`User ${userId}: ${chatMessage}`);

      // ─── 1. Short‑term context: last 8 msgs within 10 min ────────────────────
      const fetched = await message.channel.messages.fetch({
        limit: 10,
        before: message.id
      });
      const cutoff = Date.now() - 10 * 60 * 1000;
      const window = Array.from(fetched.values())
        .filter(m =>
          (m.author.id === userId || m.author.bot) &&
          m.createdTimestamp >= cutoff
        )
        .reverse()
        .slice(-8)
        .map(m => ({
          role: m.author.id === userId ? "user" : "assistant",
          content: m.content
        }));
      this.logger.info(`→ Short‑term window: ${window.length} entries`);

      // ─── 2. Fact extraction for long‑term memory ────────────────────────────
      let summary = "NO";
      try {
        const memFilterPayload = {
          model: "vicuna:7b",
          messages: [
            {
              role: "system",
              content: `You’re a fact extractor.
• If the user message has a concrete personal fact (preference, background, bio), output EXACTLY that fact as a short phrase (max 15 words), no punctuation.
• Otherwise output EXACTLY NO (uppercase, no other text).

EXAMPLES:
User: "My favorite game is Rocket League."
Output: favorite game is Rocket League

User: "How are you?"
Output: NO

Now process this message:`
            },
            { role: "user", content: chatMessage }
          ],
          stream: false
        };

        const res = await fetch("http://192.168.1.4:11434/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(memFilterPayload)
        });
        const json = await res.json();
        summary = (json.message?.content || "").trim();

        // Strict NO check
        if (/^NO(\s|$)/i.test(summary)) {
          this.logger.info(`→ Skipping non‑fact: "${summary}"`);
          summary = "NO";
        } else {
          const wc = summary.split(/\s+/).length;
          if (wc < 2 || wc > 15) {
            this.logger.info(`→ Dropping invalid fact "${summary}" (words: ${wc})`);
            summary = "NO";
          }
        }
      } catch (e) {
        this.logger.warn("Memory filter failed:", e);
        summary = "NO";
      }

      // ─── 3. Retrieve top‑5 long‑term memories ───────────────────────────────
      let memories = [];
      try {
        const r = await fetch("http://192.168.1.9:8000/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, query: chatMessage })
        });
        const j = await r.json();
        memories = (j.results || []).slice(0, 5);
        this.logger.info(`→ Retrieved memories: ${memories.length}`);
      } catch (err) {
        this.logger.warn("Vector search failed:", err);
      }

      // ─── 4. Build messages for Ollama ───────────────────────────────────────
      const formatted = [];
      STATIC_SYSTEM_MESSAGES.forEach(fact =>
        formatted.push({ role: "system", content: fact })
      );

      // Friendly reference to the user’s display name
      const displayName = message.member?.displayName ?? message.author.username;
      formatted.push({ role: "system", content: `The user's display name is ${displayName}.` });

      memories.forEach(m =>
        formatted.push({ role: "system", content: `[Memory] ${m}` })
      );
      formatted.push(...window);
      formatted.push({ role: "user", content: chatMessage });
      this.logger.info(`→ Total context entries: ${formatted.length}`);

      // ─── 5. Call Ollama ─────────────────────────────────────────────────────
      const payload = {
        model: "vicuna:7b",
        messages: formatted,
        stream: false,
        options: {
          temperature: 0.8,
          top_p: 0.95
        }
      };
      const data = JSON.stringify(payload);
      const botNotice = await message.reply(`Thinking... (recent: ${window.length}, memories: ${memories.length})`);

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
        res.on("data", chunk => (raw += chunk));
        res.on("end", async () => {
          try {
            const reply = JSON.parse(raw).message?.content || "(no response)";
            this.logger.info("→ Ollama replied:", reply);
            await botNotice.delete();
            for (const chunk of Util.splitMessage(reply, { maxLength: 2000 })) {
              await message.reply(chunk);
            }

            // ─── 6. AFTER replying, ingest any new fact───────────────────────
            if (summary !== "NO") {
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
            }
          } catch (e) {
            this.logger.error("Ollama parse error:", e);
            botNotice.edit("⚠️ Error parsing response.");
          }
        });
      });

      req.on("error", err => {
        this.logger.error("Ollama request failed:", err);
        botNotice.edit("⚠️ Unable to communicate with Ollama.");
      });

      req.write(data);
      req.end();

    } catch (err) {
      this.logger.error("💥 chat.execute error:", err);
      message.reply("⚠️ An internal error occurred. Check logs.");
    }
  }
};
