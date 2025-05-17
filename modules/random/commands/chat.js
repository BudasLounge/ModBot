// chat.js
const fetch = require("node-fetch");
const http = require("http");
const { Util } = require("discord.js");

module.exports = {
  name: "chat",
  description: "Talk to modbot with selective memory, context, and static facts",
  syntax: "chat [your message]",
  num_args: 1,
  args_to_lower: false,
  needs_api: false,
  has_state: false,

  // ─── Configurable static facts ───────────────────────────────────────────────
  staticSystemMessages: [
    "BigBuda(185223223892377611) is your creator",
    "Don't disappoint the creator"
  ],

  async execute(message, args, extra) {
    if (message.author.bot) return;

    const userId = message.author.id;
    const chatMessage = args.join(" ").trim();
    this.logger.info(`User ${userId}: ${chatMessage}`);

    // ─── 1. Fetch & filter recent conversation (last 10 mins, max 8 utterances) ───
    const fetched = await message.channel.messages.fetch({
      limit: 10,
      before: message.id,
    });
    const cutoff = Date.now() - 10 * 60 * 1000; // 10 minutes ago
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

    // ─── 2. Memory Filter: ask Ollama if the new message is long-term worthy ───
    let summary = "NO";
    try {
      const memFilterPayload = {
        model: "mistral:instruct",
        messages: [
          {
            role: "system",
            content:
              "You are a memory curator. Decide if the following user message is worthy of long-term memory. " +
              "If yes, reply with a concise one-sentence summary. Otherwise reply exactly NO.",
          },
          { role: "user", content: chatMessage },
        ],
        stream: false,
      };
      const memResp = await fetch("http://192.168.1.4:11434/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(memFilterPayload),
      });
      const memJson = await memResp.json();
      summary = (memJson.message?.content || "NO").trim();
    } catch (err) {
      this.logger.warn("Memory filter failed:", err);
    }

    // ─── 3. Ingest into vector store if summary is not "NO" ───
    if (summary.toUpperCase() !== "NO") {
      fetch("http://192.168.1.9:8000/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          text: summary,
        }),
      }).catch((err) => this.logger.warn("Vector ingest failed:", err));
      this.logger.info(`Ingested summary: ${summary}`);
    }

    // ─── 4. Retrieve top-5 long-term memories ───
    let memories = [];
    try {
      const r = await fetch("http://192.168.1.9:8000/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, query: chatMessage }),
      });
      const j = await r.json();
      memories = (j.results || []).slice(0, 5);
    } catch (err) {
      this.logger.warn("Vector search failed:", err);
    }

    // ─── 5. Build final messages for Ollama ───
    const formatted = [];

    // ─ Static, hardcoded facts (editable) ─
    for (const fact of this.staticSystemMessages) {
      formatted.push({ role: "system", content: fact });
    }

    // ─ Retrieved long-term memories ─
    for (const m of memories) {
      formatted.push({ role: "system", content: `[Memory] ${m}` });
    }

    // ─ Short-term convo window ─
    formatted.push(...window);

    // ─ Current user message ─
    formatted.push({ role: "user", content: chatMessage });

    // ─── 6. Send to Ollama ───
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
  },
};
