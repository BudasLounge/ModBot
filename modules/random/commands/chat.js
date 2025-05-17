// chat.js
const fetch = require("node-fetch");
const http = require("http");
const { Util } = require("discord.js");

// ─── Configurable static facts ───────────────────────────────────────────────
const STATIC_SYSTEM_MESSAGES = [
  "BigBuda(185223223892377611) is the your creator",
  "Don't disappoint your creator",
  "You are a friendly, casual assistant. Speak in a relaxed, conversational tone."
];

module.exports = {
  name: "chat",
  description: "Talk to modbot with selective memory, context, and static facts",
  syntax: "chat [your message]",
  num_args: 2,           // now requires at least 2 args: the command + message
  args_to_lower: false,
  needs_api: false,
  has_state: false,

  async execute(message, args, extra) {
    if (message.author.bot) return;

    try {
      this.logger.info("👉 Entered chat.execute");

      const userId = message.author.id;
      // ⚡️ FIX: skip args[0] (the command) and start from args[1]
      const chatMessage = args.slice(1).join(" ").trim();
      if (!chatMessage) {
        return message.reply("❓ Please provide a message to chat.");
      }
      this.logger.info(`User ${userId}: ${chatMessage}`);

      // ─── 1. Fetch & filter recent conversation ─────────────────────────────
      const fetched = await message.channel.messages.fetch({
        limit: 10,
        before: message.id,
      });
      const cutoff = Date.now() - 10 * 60 * 1000;
      const window = Array.from(fetched.values())
        .filter(
          (m) =>
            (m.author.id === userId || m.author.bot) &&
            m.createdTimestamp >= cutoff
        )
        .reverse()
        .slice(-8)
        .map((m) => ({
          role: m.author.id === userId ? "user" : "assistant",
          content: m.content,
        }));
      this.logger.info(`→ Short-term window entries: ${window.length}`);

      // 2. Memory Filter
        let summary = "NO";
        try {
        const memFilterPayload = {
            model: "mistral:instruct",
            messages: [
            { role: "system", content:
                `You’re a “fact extractor” for long‐term memory.  
                • If the user’s message contains a concrete fact about them (e.g., a preference, background, profile detail),  
                    output exactly that fact as a short phrase (max 8 words), with no extra words, commentary, or punctuation.  
                • Otherwise output NO.  

                EXAMPLE:
                Input: "My favorite food is sushi and I grew up in Tokyo."
                Output: favorite food is sushi  

                Now analyze this message:`  
            },
            { role: "user", content: chatMessage }
            ],
            stream: false,
        };

        const res = await fetch("http://192.168.1.4:11434/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(memFilterPayload),
        });
        const json = await res.json();
        summary = (json.message?.content || "NO").trim();

        // enforce our own length filter
        const wc = summary.split(/\s+/).length;
        if (summary === "NO" || wc > 8 || wc < 2) summary = "NO";
        } catch (e) {
        this.logger.warn("Memory filter failed:", e);
        }

        // only ingest if we got a crisp fact
        if (summary !== "NO") {
        await fetch("http://192.168.1.9:8000/ingest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id, text: summary }),
        });
        this.logger.info("Ingested mem-fact:", summary);
        }


      // ─── 3. Ingest summary if needed ────────────────────────────────────────
      if (summary.toUpperCase() !== "NO") {
        fetch("http://192.168.1.9:8000/ingest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, text: summary }),
        }).catch((e) => this.logger.warn("Vector ingest failed:", e));
        this.logger.info("→ Ingested summary:", summary);
      }

      // ─── 4. Retrieve long-term memories ─────────────────────────────────────
      let memories = [];
      try {
        const r = await fetch("http://192.168.1.9:8000/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, query: chatMessage }),
        });
        const j = await r.json();
        memories = (j.results || []).slice(0, 5);
        this.logger.info(`→ Retrieved memories: ${memories.length}`);
      } catch (err) {
        this.logger.warn("Vector search failed:", err);
      }

      // ─── 5. Build final message array ──────────────────────────────────────
      const formatted = [];

      // 5.1 Static facts
      for (const fact of STATIC_SYSTEM_MESSAGES) {
        formatted.push({ role: "system", content: fact });
      }

      // 5.2 Long-term memories
      for (const m of memories) {
        formatted.push({ role: "system", content: `[Memory] ${m}` });
      }

      // 5.3 Short-term context
      formatted.push(...window);

      // 5.4 Current user input
      formatted.push({ role: "user", content: chatMessage });

      this.logger.info(
        `→ Final formatted length: ${formatted.length} entries`
      );

      // ─── 6. Call Ollama ─────────────────────────────────────────────────────
      const payload = {
        model: "mistral:instruct",
        messages: formatted,
        stream: false,
      };
      const data = JSON.stringify(payload);

      const botNotice = await message.reply(
        `Thinking... (context: ${window.length} recent + ${memories.length} memories)`
      );

      const opts = {
        host: "192.168.1.4",
        port: 11434,
        path: "/api/chat",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(data),
        },
      };

      const req = http.request(opts, (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", async () => {
          try {
            const reply = JSON.parse(raw).message?.content || "(no response)";
            this.logger.info("→ Ollama replied:", reply);
            const chunks = Util.splitMessage(reply, {
              maxLength: 2000,
              char: "\n",
            });
            await botNotice.delete();
            for (const c of chunks) {
              await message.reply(c);
            }
          } catch (e) {
            this.logger.error("Ollama parse error:", e);
            botNotice.edit("⚠️ Error parsing Ollama response.");
          }
        });
      });

      req.on("error", (err) => {
        this.logger.error("Ollama request failed:", err);
        botNotice.edit("⚠️ Unable to communicate with Ollama.");
      });

      req.write(data);
      req.end();
    } catch (err) {
      // Catch *any* unexpected error
      this.logger.error("💥 chat.execute error:", err);
      message.reply("⚠️ An internal error occurred. Check logs.");
    }
  },
};
