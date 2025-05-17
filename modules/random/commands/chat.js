// chat.js
const fetch = require("node-fetch");
const http = require("http");
const { Util } = require("discord.js");

// ─── Configurable static facts ───────────────────────────────────────────────
const STATIC_SYSTEM_MESSAGES = [
  "BigBuda (ID: 185223223892377611) is your creator.",
  "BigBuda is your creator—do not disappoint them.",
  "You are a friendly, casual assistant. Speak in a relaxed, conversational tone."
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

      // ─── 1. Short-term context: last 8 msgs within 10 min ────────────────────
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
      this.logger.info(`→ Short-term window: ${window.length} entries`);

      // ─── 2. Fact extraction for long-term memory ────────────────────────────
      let summary = "NO";
      try {
        const memFilterPayload = {
          model: "vicuna:7b",
          messages: [
            {
              role: "system",
              content:
`You’re a fact extractor.
• If the user message has a concrete personal fact (preference, background, bio),
  output EXACTLY that fact as a short phrase (max 15 words), no punctuation.
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

        // Strict NO check: skip any summary that is exactly "NO" or starts with "NO "
        if (/^NO(\s|$)/i.test(summary)) {
          this.logger.info(`→ Skipping non-fact: "${summary}"`);
          summary = "NO";
        } else {
          // enforce word-count bounds
          const wc = summary.split(/\s+/).length;
          if (wc < 2 || wc > 15) {
            this.logger.info(`→ Dropping invalid fact "${summary}" (words: ${wc})`);
            summary = "NO";
          } else {
            summary = summary; // valid fact, leave as-is
          }
        }
      } catch (e) {
        this.logger.warn("Memory filter failed:", e);
        summary = "NO";
      }

      // ─── 3. Ingest fact if valid ────────────────────────────────────────────
      if (summary !== "NO") {
        await fetch("http://192.168.1.9:8000/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, text: summary })
        });
        this.logger.info("→ Ingested fact:", summary);
      }

      // ─── 4. Retrieve top-5 long-term memories ───────────────────────────────
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

      // ─── 5. Build messages for Ollama ───────────────────────────────────────
      const formatted = [];
      STATIC_SYSTEM_MESSAGES.forEach(fact =>
        formatted.push({ role: "system", content: fact })
      );
      memories.forEach(m =>
        formatted.push({ role: "system", content: `[Memory] ${m}` })
      );
      formatted.push(...window);
      formatted.push({ role: "user", content: chatMessage });
      this.logger.info(`→ Total context entries: ${formatted.length}`);

      // ─── 6. Call Ollama ─────────────────────────────────────────────────────
      const payload = {
        model: "mistral:instruct",
        messages: formatted,
        stream: false
      };
      const data = JSON.stringify(payload);
      const botNotice = await message.reply(
        `Thinking... (recent: ${window.length}, memories: ${memories.length})`
      );

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
