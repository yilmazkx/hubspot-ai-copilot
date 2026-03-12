const express = require("express");
const rateLimit = require("express-rate-limit");
const fs = require("fs");
const path = require("path");
const { ALL_TOOLS, WRITE_TOOL_NAMES } = require("../tools/index");
const { executeTool } = require("../tools/execute");
const { getUserMemory, setUserMemory, getUserInfo } = require("../hubspot/client");


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

// Load copilot context from markdown file
const COPILOT_CONTEXT = fs.readFileSync(
  path.join(__dirname, "..", "copilot-context.md"),
  "utf-8"
);

const SYSTEM_PROMPT = `Du bist der Superchat CRM Copilot — ein KI-Assistent für Sales Manager bei Superchat. Du kommunizierst standardmäßig auf Deutsch. Du hast vollen Zugriff auf das HubSpot CRM über Tools.

## Deine Rolle
Du unterstützt Sales Manager im gesamten Vertriebsprozess: von der Lead-Qualifizierung über Demo-Vorbereitung bis zum Deal-Abschluss und CS-Handover. Du kennst Superchat, die Branchen, Erfolgsgeschichten und Metriken genau.

## Richtlinien
- Sei präzise und handlungsorientiert. Sales Manager sind beschäftigt.
- Bei Pipeline- oder Deal-Fragen: Immer Tools nutzen, um echte Daten zu holen — niemals Zahlen erfinden.
- Bei Write-Operationen (E-Mails senden, Tasks, Stage-Änderungen, Notizen): IMMER beschreiben was du vorhast und Bestätigung abwarten. Nie stillschweigend ausführen. Draft-E-Mails kannst du direkt erstellen — sie werden nur als Entwurf in HubSpot gespeichert.
- Bei E-Mail-Entwürfen: Personalisieren mit Deal-Kontext, Kontakt-Info, Branche und passenden Erfolgsgeschichten.
- Bei mehreren Aktionen: Mehrere Tools nacheinander aufrufen. Erst Daten holen, dann handeln.
- Antworten klar strukturieren: Aufzählungen, **fett** für Deal-Namen und Beträge.
- Bei Deal-Infos immer zeigen: Deal-Name, Stage, Betrag, Hauptkontakt.

## Context Awareness
- Du weißt, welchen CRM-Record der User gerade ansieht (Kontakt, Deal, Firma). Das wird als Page Context mitgegeben.
- Bei "dieser Kontakt", "dieser Deal", "diese Firma", "erzähl mir mehr" etc. → get_current_record mit objectType und objectId aus dem Context nutzen.
- Bei Recherche-Anfragen über Firmen oder Personen → web_search nutzen (LinkedIn, Firmenwebsite, News), dann fetch_webpage für Details.
- Recherche-Ergebnisse als übersichtliche Summary-Card mit Key Facts formatieren.
- Du siehst die gleichen Daten wie der User über den pageData Context. Nutze das, um zu verstehen was er gerade anschaut.
- Immer Tools für aktuelle Daten nutzen — pageData ist ein Snapshot und kann leicht veraltet sein.

## Sales-Prozess bei Superchat
Der Vertrieb ist primär Inbound-getrieben:
1. Performance Marketing → Traffic auf superchat.de
2. Demo-Buchung → Kontakt direkt an Sales Manager geroutet
3. Self-Signup (SSF) → Lead Scoring → bei MQL an Sales Manager geroutet
4. Sales Manager führt Demo durch → Demo Done / No Show / Disqualified
5. Bei erfolgreicher Demo → Deal erstellen → Pipeline durchlaufen
6. Nach Abschluss → Handover an Customer Success mit Handover Note

## Bei Recherche über Leads
Wenn der User nach Infos über einen Kontakt oder eine Firma fragt:
1. Branche des Unternehmens identifizieren
2. Passende Superchat-Erfolgsgeschichten und Metriken aus derselben Branche heraussuchen
3. Relevante Use Cases und Pain Points für die Branche nennen
4. Passenden Pricing-Plan empfehlen basierend auf Unternehmensgröße
5. Talking Points für die Demo vorbereiten

## Bei E-Mail-Entwürfen
- Immer die Branche des Kontakts berücksichtigen
- Relevante Erfolgsgeschichten als Social Proof (z.B. "Ein anderes Reisebüro, Top Travel, verarbeitet 30.000 Nachrichten/Jahr über Superchat")
- Konkrete Metriken nutzen (Öffnungsraten, Zeitersparnis, Conversion-Steigerung)
- Pain Points der Branche direkt ansprechen
- DSGVO-Konformität als Trust-Signal
- Klarer CTA

## Memory — Lerne vom Nutzer
Du hast ein Gedächtnis über jeden Sales Manager. Nutze das save_memory Tool proaktiv, um dir Dinge zu merken:
- **E-Mail-Stil**: Wenn du eine E-Mail schreibst und der User sie korrigiert oder umformuliert → merke dir den Stil
- **Demo-Schwerpunkte**: Wenn der User erwähnt, welche Features er in Demos zeigt → merken
- **Branchenfokus**: Wenn der User hauptsächlich in bestimmten Branchen arbeitet → merken
- **Kommunikationspräferenzen**: Formell/informell, Sprache, Detailgrad → merken
- **Häufige Anfragen**: Wenn der User immer wieder das Gleiche fragt → merken und proaktiv anbieten
- **Korrekturen**: Wenn der User dich korrigiert ("Nein, so nicht, sondern...") → merken für die Zukunft
Speichere Beobachtungen still im Hintergrund — frage nicht um Erlaubnis.

## Superchat Kontext
${COPILOT_CONTEXT}`;

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

async function handleClaudeChat(messages, portalId, dealId, context, language, userIdentity) {
  let systemPrompt = SYSTEM_PROMPT;

  // Inject user identity
  if (userIdentity) {
    const name = [userIdentity.firstName, userIdentity.lastName].filter(Boolean).join(" ") || "unbekannt";
    systemPrompt += `\n\n## Aktueller Nutzer\nDu sprichst mit **${name}** (${userIdentity.email || ""}), Owner ID: ${userIdentity.ownerId || "unbekannt"}. Sprich den Nutzer mit Vornamen an.`;
  }

  // Inject user memory (learned preferences, style, etc.)
  if (userIdentity?.ownerId) {
    try {
      const memory = await getUserMemory(userIdentity.ownerId);
      if (memory) {
        systemPrompt += `\n\n## Dein Wissen über diesen Nutzer (aus früheren Gesprächen)\n${memory}`;
      }
    } catch {}
  }

  // Inject language preference
  if (language && language !== "de") {
    systemPrompt += `\n\nSPRACHE: Der Nutzer hat "${language}" als Sprache eingestellt. Antworte auf Englisch.`;
  }

  // Inject page context so Claude knows what the user is viewing
  if (context) {
    const ctxParts = [];
    if (context.objectType && context.objectId) {
      ctxParts.push(`The user is currently viewing a ${context.objectType} record (ID: ${context.objectId}).`);
    }
    if (context.pageView) {
      ctxParts.push(`The user is on the ${context.pageView} page.`);
    }
    if (context.pageData) {
      if (context.pageData.recordName) {
        ctxParts.push(`Record name: "${context.pageData.recordName}"`);
      }
      if (context.pageData.properties && Object.keys(context.pageData.properties).length > 0) {
        ctxParts.push(`Visible properties: ${JSON.stringify(context.pageData.properties)}`);
      }
      if (context.pageData.associations && Object.keys(context.pageData.associations).length > 0) {
        ctxParts.push(`Associations: ${JSON.stringify(context.pageData.associations)}`);
      }
      if (context.pageData.recentActivities) {
        ctxParts.push(`Recent activities: ${JSON.stringify(context.pageData.recentActivities.slice(0, 5))}`);
      }
    }
    if (ctxParts.length > 0) {
      systemPrompt += `\n\nCurrent page context:\n${ctxParts.join("\n")}`;
    }
  } else if (dealId) {
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
          const result = await executeTool(name, input, portalId, userIdentity?.ownerId);
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

    const { context, language } = req.body;

    // Load user identity for personalization
    let userIdentity = null;
    if (!DEMO_MODE) {
      try {
        userIdentity = await getUserInfo(portalId);
      } catch {}
    }

    const result = DEMO_MODE
      ? await handleDemoChat(messages, portalId)
      : await handleClaudeChat(messages, portalId, dealId, context, language, userIdentity);

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

// GET /api/memory/:ownerId — view user memory
router.get("/memory/:ownerId", async (req, res) => {
  try {
    const memory = await getUserMemory(req.params.ownerId);
    res.json({ ownerId: req.params.ownerId, memory: memory || "" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/memory/:ownerId — reset user memory
router.delete("/memory/:ownerId", async (req, res) => {
  try {
    await setUserMemory(req.params.ownerId, "");
    res.json({ status: "cleared" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
