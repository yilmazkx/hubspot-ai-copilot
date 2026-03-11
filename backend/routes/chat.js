const express = require("express");
const rateLimit = require("express-rate-limit");
const { ALL_TOOLS, WRITE_TOOL_NAMES } = require("../tools/index");
const { executeTool } = require("../tools/execute");

const router = express.Router();

// Rate limit: 30 chat requests per minute per portal
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req) => req.body?.portalId || req.ip,
  message: { error: "Too many requests, please slow down." },
});

const DEMO_MODE = !process.env.ANTHROPIC_API_KEY;

let anthropic;
if (!DEMO_MODE) {
  const Anthropic = require("@anthropic-ai/sdk");
  anthropic = new Anthropic();
}

const SYSTEM_PROMPT = `You are a HubSpot CRM Copilot for a Sales Manager. You have full access to the CRM via tools.

Guidelines:
- Be concise and action-oriented. Sales managers are busy.
- When asked about pipeline or deals, use your tools to fetch real data — never make up numbers.
- For write operations (emails, tasks, stage changes, notes), ALWAYS present what you plan to do and ask for confirmation before executing. Never execute write operations silently.
- When drafting emails, personalize them using the deal context, contact info, and recent activity.
- If multiple actions are needed, you may call multiple tools. Fetch data first, then act on it.
- Format responses with clear structure: use bullet points, bold for deal names and amounts.
- When showing deal info, always include: deal name, stage, amount, and primary contact.
- If a user asks about "stale" deals, default to 14 days unless they specify otherwise.`;

// ---- Demo mode: simulate Claude's tool use with scripted scenarios ----

function matchDemoScenario(lastMessage) {
  const msg = lastMessage.toLowerCase();

  if (msg.includes("pipeline") || msg.includes("summary") || msg.includes("overview")) {
    return {
      toolCalls: [{ name: "get_pipeline_summary", input: {} }],
      formatResponse(results) {
        const pipeline = results[0][0];
        const lines = ["Here's your **Sales Pipeline** overview:\n"];
        for (const stage of pipeline.stages) {
          const val = stage.totalValue > 0 ? ` — $${stage.totalValue.toLocaleString()}` : "";
          lines.push(`- **${stage.stageName}**: ${stage.dealCount} deal${stage.dealCount !== 1 ? "s" : ""}${val}`);
        }
        const total = pipeline.stages.reduce((s, st) => s + st.totalValue, 0);
        lines.push(`\n**Total pipeline value: $${total.toLocaleString()}**`);
        return lines.join("\n");
      },
    };
  }

  if (msg.includes("stale") || (msg.includes("no activity") && msg.includes("day"))) {
    const daysMatch = msg.match(/(\d+)\s*day/);
    const days = daysMatch ? parseInt(daysMatch[1]) : 14;
    return {
      toolCalls: [{ name: "get_stale_deals", input: { days } }],
      formatResponse(results) {
        const deals = results[0];
        if (deals.length === 0) return `No stale deals found (no deals inactive for ${days}+ days). Your pipeline is looking active!`;
        const lines = [`Found **${deals.length} stale deal${deals.length > 1 ? "s" : ""}** with no activity in ${days}+ days:\n`];
        for (const d of deals) {
          const lastMod = new Date(d.hs_lastmodifieddate).toLocaleDateString();
          lines.push(`- **${d.dealname}** — $${parseFloat(d.amount).toLocaleString()} — last activity: ${lastMod}`);
        }
        lines.push("\nWould you like me to draft follow-up emails for these deals?");
        return lines.join("\n");
      },
    };
  }

  if (msg.includes("draft") && (msg.includes("email") || msg.includes("follow"))) {
    return {
      toolCalls: [
        { name: "get_deals", input: { stage: "presentationscheduled" } },
      ],
      formatResponse(results) {
        const deals = results[0];
        if (deals.length === 0) return "No deals found in that stage to draft emails for.";
        const pendingActions = deals.slice(0, 3).map((d) => ({
          toolCallId: `demo-${d.dealId}`,
          tool: "create_draft_email",
          input: {
            deal_id: d.dealId,
            to_email: d.contacts[0]?.email || "contact@example.com",
            subject: `Following up — ${d.dealname}`,
            body: `Hi ${d.contacts[0]?.firstname || "there"},\n\nI wanted to follow up on our recent conversation about ${d.dealname}. I'm excited about the potential to work together and wanted to check if you had any questions about the proposal.\n\nWould you be available for a quick call this week to discuss next steps?\n\nBest regards`,
          },
        }));
        const lines = [`I've prepared **${pendingActions.length} draft emails** for your review:\n`];
        for (const action of pendingActions) {
          lines.push(`- **To:** ${action.input.to_email} — "${action.input.subject}"`);
        }
        lines.push("\nPlease review and confirm to send, or discard to cancel.");
        return { text: lines.join("\n"), pendingActions };
      },
    };
  }

  if (msg.includes("deal") && (msg.includes("detail") || msg.includes("tell me") || msg.includes("about"))) {
    return {
      toolCalls: [{ name: "get_deal_detail", input: { deal_id: "1001" } }],
      formatResponse(results) {
        const d = results[0];
        const c = d.contacts?.[0] || {};
        const lines = [
          `**${d.dealname}**\n`,
          `- **Stage:** ${d.dealstage}`,
          `- **Amount:** $${parseFloat(d.amount).toLocaleString()}`,
          `- **Close Date:** ${d.closedate}`,
          `- **Primary Contact:** ${c.firstname || ""} ${c.lastname || ""} (${c.email || "N/A"}) — ${c.jobtitle || ""}`,
          `\n**Recent Activity:**`,
        ];
        for (const a of (d.recentActivity || []).slice(0, 3)) {
          const date = new Date(a.timestamp).toLocaleDateString();
          lines.push(`- ${date}: ${a.body}`);
        }
        return lines.join("\n");
      },
    };
  }

  if (msg.includes("contact") || msg.includes("search")) {
    const query = msg.replace(/.*(?:contact|search)\s*/i, "").trim() || "acme";
    return {
      toolCalls: [{ name: "get_contacts", input: { query } }],
      formatResponse(results) {
        const contacts = results[0];
        if (contacts.length === 0) return `No contacts found matching "${query}".`;
        const lines = [`Found **${contacts.length} contact${contacts.length > 1 ? "s" : ""}**:\n`];
        for (const c of contacts) {
          lines.push(`- **${c.firstname} ${c.lastname}** — ${c.email} — ${c.jobtitle || ""} at ${c.company || "N/A"}`);
        }
        return lines.join("\n");
      },
    };
  }

  // Default: show available commands
  return {
    toolCalls: [],
    formatResponse() {
      return `I can help you with your CRM! Here's what I can do:\n\n- **Pipeline summary** — "Show me my pipeline"\n- **Find stale deals** — "Deals with no activity in 14 days"\n- **Deal details** — "Tell me about the Acme deal"\n- **Search contacts** — "Search contacts Acme"\n- **Draft emails** — "Draft follow-up emails for presentation deals"\n- **Create tasks** — "Create a follow-up task for deal X"\n\nWhat would you like to do?`;
    },
  };
}

async function handleDemoChat(messages, portalId) {
  const lastMessage = messages[messages.length - 1]?.content || "";
  const scenario = matchDemoScenario(lastMessage);
  const toolSteps = [];
  const results = [];

  for (const call of scenario.toolCalls) {
    toolSteps.push({ tool: call.name, input: call.input, status: "executing" });
    try {
      const result = await executeTool(call.name, call.input, portalId);
      toolSteps[toolSteps.length - 1].status = "complete";
      results.push(result);
    } catch (err) {
      toolSteps[toolSteps.length - 1].status = "error";
      toolSteps[toolSteps.length - 1].error = err.message;
      results.push({ error: err.message });
    }
  }

  const formatted = scenario.formatResponse(results);
  if (typeof formatted === "object") {
    return { response: formatted.text, toolSteps, pendingActions: formatted.pendingActions };
  }
  return { response: formatted, toolSteps, pendingActions: [] };
}

// ---- Real Claude agentic loop ----

async function handleClaudeChat(messages, portalId, dealId) {
  let systemPrompt = SYSTEM_PROMPT;
  if (dealId) {
    systemPrompt += `\n\nThe user is currently viewing deal ID: ${dealId}. Use this context when relevant.`;
  }

  const claudeMessages = messages.map((m) => ({ role: m.role, content: m.content }));
  const toolSteps = [];
  const pendingActions = [];
  let loopMessages = [...claudeMessages];
  let iterations = 0;
  const MAX_ITERATIONS = 15;

  while (iterations < MAX_ITERATIONS) {
    iterations++;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      tools: ALL_TOOLS,
      messages: loopMessages,
    });

    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
    const textBlocks = response.content.filter((b) => b.type === "text");

    if (toolUseBlocks.length === 0) {
      return {
        response: textBlocks.map((b) => b.text).join("\n"),
        toolSteps,
        pendingActions,
      };
    }

    const toolResults = [];

    for (const toolBlock of toolUseBlocks) {
      const { id, name, input } = toolBlock;

      if (WRITE_TOOL_NAMES.has(name)) {
        pendingActions.push({ toolCallId: id, tool: name, input });
        toolSteps.push({ tool: name, input, status: "pending_confirmation" });
        toolResults.push({
          type: "tool_result",
          tool_use_id: id,
          content: JSON.stringify({
            status: "pending_confirmation",
            message: `Action "${name}" has been queued for user confirmation. Do not retry this action. Inform the user what you plan to do and that it requires their confirmation.`,
          }),
        });
      } else {
        toolSteps.push({ tool: name, input, status: "executing" });
        try {
          const result = await executeTool(name, input, portalId);
          toolSteps[toolSteps.length - 1].status = "complete";
          toolResults.push({
            type: "tool_result",
            tool_use_id: id,
            content: JSON.stringify(result),
          });
        } catch (err) {
          toolSteps[toolSteps.length - 1].status = "error";
          toolSteps[toolSteps.length - 1].error = err.message;
          toolResults.push({
            type: "tool_result",
            tool_use_id: id,
            content: JSON.stringify({ error: err.message }),
            is_error: true,
          });
        }
      }
    }

    const hasPendingInThisRound = toolUseBlocks.some((b) => WRITE_TOOL_NAMES.has(b.name));

    loopMessages.push({ role: "assistant", content: response.content });
    loopMessages.push({ role: "user", content: toolResults });

    if (hasPendingInThisRound) {
      const finalResponse = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        tools: ALL_TOOLS,
        messages: loopMessages,
      });
      return {
        response: finalResponse.content.filter((b) => b.type === "text").map((b) => b.text).join("\n"),
        toolSteps,
        pendingActions,
      };
    }
  }

  return {
    response: "I reached the maximum number of steps. Here's what I found so far.",
    toolSteps,
    pendingActions,
  };
}

// ---- Routes ----

router.post("/chat", chatLimiter, async (req, res) => {
  try {
    const { messages, portalId, dealId } = req.body;

    if (!portalId) {
      return res.status(400).json({ error: "portalId is required" });
    }
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array is required" });
    }

    // Check if HubSpot is authorized before proceeding (skip in demo mode)
    if (!DEMO_MODE && process.env.HUBSPOT_CLIENT_ID) {
      const { getTokens } = require("../hubspot/client");
      const tokens = await getTokens(portalId);
      if (!tokens) {
        const proto = process.env.VERCEL ? "https" : req.protocol;
        const authUrl = `${proto}://${req.get("host")}/auth/authorize`;
        return res.json({
          response: null,
          auth_required: true,
          auth_url: authUrl,
          toolSteps: [],
          pendingActions: [],
        });
      }
    }

    const result = DEMO_MODE
      ? await handleDemoChat(messages, portalId)
      : await handleClaudeChat(messages, portalId, dealId);

    return res.json(result);
  } catch (err) {
    console.error("Chat error:", err);
    res.status(500).json({ error: "Chat failed", details: err.message });
  }
});

router.post("/chat/confirm", async (req, res) => {
  try {
    const { portalId, actions } = req.body;

    if (!portalId || !actions) {
      return res.status(400).json({ error: "portalId and actions are required" });
    }

    const results = [];
    for (const action of actions) {
      try {
        const result = await executeTool(action.tool, action.input, portalId);
        results.push({ tool: action.tool, status: "success", result });
      } catch (err) {
        results.push({ tool: action.tool, status: "error", error: err.message });
      }
    }

    res.json({ results });
  } catch (err) {
    console.error("Confirm error:", err);
    res.status(500).json({ error: "Confirm failed", details: err.message });
  }
});

module.exports = router;
