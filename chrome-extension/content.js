// HubSpot AI Copilot — Chrome Extension Content Script
(function () {
  if (document.getElementById("hs-copilot-fab")) return; // Already injected

  const BACKEND_URL = "https://hubspot-ai-copilot-backend.vercel.app";

  const TOOL_LABELS = {
    get_pipeline_summary: "Fetching pipeline summary",
    get_deals: "Searching deals",
    get_deal_detail: "Loading deal details",
    get_stale_deals: "Finding stale deals",
    get_contacts: "Searching contacts",
    get_current_record: "Loading current record",
    get_company_detail: "Fetching company details",
    web_search: "Searching the web",
    fetch_webpage: "Reading webpage",
    create_draft_email: "Creating draft email",
    send_email: "Sending email",
    create_task: "Creating task",
    update_deal_stage: "Updating deal stage",
    add_note: "Adding note",
  };
  const STATUS_ICONS = {
    executing: "\u{1F50D}",
    complete: "\u2705",
    error: "\u274C",
    pending_confirmation: "\u23F3",
  };
  const ACTION_LABELS = {
    create_draft_email: "Draft Email",
    send_email: "Send Email",
    create_task: "Create Task",
    update_deal_stage: "Move Deal Stage",
    add_note: "Add Note",
  };

  let messages = [];
  let loading = false;
  let pendingActions = [];
  let apiKey = "";
  let language = "de";
  let isOpen = false;
  let settingsVisible = false;

  // --- Detect HubSpot context from URL + page ---
  function getHubSpotContext() {
    const url = window.location.href;
    const ctx = { portalId: null, objectType: null, objectId: null, pageData: null };

    // Portal ID from URL patterns
    const portalMatch = url.match(/app(?:-eu1)?\.hubspot\.com\/contacts\/(\d+)/);
    if (portalMatch) ctx.portalId = portalMatch[1];

    // Record type detection — HubSpot URL patterns
    const patterns = [
      { regex: /\/record\/0-1\/(\d+)/, type: "contact" },   // contact
      { regex: /\/record\/0-2\/(\d+)/, type: "company" },   // company
      { regex: /\/record\/0-3\/(\d+)/, type: "deal" },      // deal
      { regex: /\/record\/0-5\/(\d+)/, type: "ticket" },    // ticket
      { regex: /\/contact\/(\d+)/, type: "contact" },
      { regex: /\/company\/(\d+)/, type: "company" },
      { regex: /\/deal\/(\d+)/, type: "deal" },
      { regex: /\/ticket\/(\d+)/, type: "ticket" },
      { regex: /\/lead\/(\d+)/, type: "lead" },
    ];

    for (const p of patterns) {
      const m = url.match(p.regex);
      if (m) {
        ctx.objectType = p.type;
        ctx.objectId = m[1];
        break;
      }
    }

    // Detect list views
    if (!ctx.objectType) {
      if (url.includes("/deals/")) ctx.pageView = "deals_list";
      else if (url.includes("/contacts/") && url.match(/contacts\/\d+\/objects\/0-1/)) ctx.pageView = "contacts_list";
      else if (url.includes("/companies/")) ctx.pageView = "companies_list";
    }

    // Scrape visible data from the page
    ctx.pageData = scrapePageData();

    return ctx;
  }

  function scrapePageData() {
    const data = {};

    // Record name / title (main heading)
    const heading = document.querySelector('[data-test-id="record-title"] span, .private-header__heading, h1');
    if (heading) data.recordName = heading.textContent.trim();

    // Scrape property values from the sidebar
    const properties = {};
    document.querySelectorAll('[data-test-id="property-input"]').forEach((el) => {
      const label = el.closest('[data-test-id="property"]')?.querySelector('[data-test-id="property-label"]');
      const value = el.textContent.trim();
      if (label && value && value !== "--") {
        properties[label.textContent.trim()] = value;
      }
    });

    // Also try the "About" section property rows
    document.querySelectorAll('.private-truncated-content, [data-selenium-test="property-input"]').forEach((el) => {
      const row = el.closest('[data-selenium-test="property-row"], [class*="PropertyRow"]');
      if (row) {
        const label = row.querySelector('[data-selenium-test="property-label"], [class*="PropertyLabel"]');
        const value = el.textContent.trim();
        if (label && value && value !== "--") {
          properties[label.textContent.trim()] = value;
        }
      }
    });

    if (Object.keys(properties).length > 0) data.properties = properties;

    // Associations in the right sidebar (companies, deals, contacts)
    const associations = {};
    document.querySelectorAll('[data-test-id="associations-list"]').forEach((list) => {
      const heading = list.closest('[data-test-id="association"]')?.querySelector('[data-test-id="association-label"]');
      if (heading) {
        const items = [];
        list.querySelectorAll('a').forEach((a) => {
          const text = a.textContent.trim();
          if (text) items.push(text);
        });
        if (items.length > 0) associations[heading.textContent.trim()] = items;
      }
    });
    if (Object.keys(associations).length > 0) data.associations = associations;

    // Activity feed — recent items
    const activities = [];
    document.querySelectorAll('[data-test-id="timeline-event"]').forEach((ev) => {
      const title = ev.querySelector('[data-test-id="timeline-event-title"]')?.textContent.trim();
      const timestamp = ev.querySelector('[data-test-id="timeline-event-timestamp"], time')?.textContent.trim();
      if (title) activities.push({ title, timestamp });
    });
    if (activities.length > 0) data.recentActivities = activities.slice(0, 10);

    return Object.keys(data).length > 0 ? data : null;
  }

  function esc(s) {
    if (!s) return "";
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function formatText(text) {
    return esc(text).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  }

  // --- Load saved API key ---
  function loadApiKey() {
    try {
      chrome.storage.local.get(["copilotApiKey"], (result) => {
        if (result.copilotApiKey) {
          apiKey = result.copilotApiKey;
          const input = document.getElementById("copilot-key-input");
          if (input) input.value = apiKey;
        }
      });
    } catch {
      apiKey = localStorage.getItem("copilotApiKey") || "";
    }
  }

  function saveApiKey(key) {
    apiKey = key;
    try {
      chrome.storage.local.set({ copilotApiKey: key });
    } catch {
      localStorage.setItem("copilotApiKey", key);
    }
  }

  function saveLanguage(lang) {
    language = lang;
    try {
      chrome.storage.local.set({ copilotLanguage: lang });
    } catch {
      localStorage.setItem("copilotLanguage", lang);
    }
  }

  function loadLanguage() {
    try {
      chrome.storage.local.get("copilotLanguage", (result) => {
        if (result.copilotLanguage) {
          language = result.copilotLanguage;
          const sel = document.getElementById("copilot-lang-select");
          if (sel) sel.value = language;
        }
      });
    } catch {
      language = localStorage.getItem("copilotLanguage") || "de";
    }
  }

  // --- Build UI ---
  function createUI() {
    // Floating action button
    const fab = document.createElement("button");
    fab.id = "hs-copilot-fab";
    fab.innerHTML = '<span class="fab-icon">AI</span>';
    fab.addEventListener("click", togglePanel);
    document.body.appendChild(fab);

    // Panel
    const panel = document.createElement("div");
    panel.id = "hs-copilot-panel";
    panel.innerHTML = `
      <div class="copilot-header">
        <div class="copilot-header-icon">AI</div>
        <div class="copilot-header-title">CRM Copilot</div>
        <span class="copilot-header-context" id="copilot-context"></span>
        <button class="copilot-header-close" id="copilot-settings-btn" title="Settings">⚙</button>
        <button class="copilot-header-close" id="copilot-close" title="Close (⌘⇧K)">✕</button>
      </div>
      <div class="copilot-settings" id="copilot-settings" style="display:none">
        <div class="copilot-settings-row">
          <span>API Key:</span>
          <input type="password" id="copilot-key-input" placeholder="Enter your API key" />
        </div>
        <div class="copilot-settings-row">
          <span>Sprache:</span>
          <select id="copilot-lang-select">
            <option value="de">Deutsch</option>
            <option value="en">English</option>
          </select>
        </div>
        <button id="copilot-key-save">Save</button>
      </div>
      <div class="copilot-messages" id="copilot-messages">
        <div class="copilot-empty" id="copilot-empty">
          <h3>Hi! Ich bin dein CRM Copilot.</h3>
          <p>Probier z.B.:</p>
          <div class="copilot-suggestions">
            <button class="copilot-suggestion" data-msg="Zeig mir meine Pipeline">Zeig mir meine Pipeline</button>
            <button class="copilot-suggestion" data-msg="Recherchiere diese Firma">Recherchiere diese Firma</button>
            <button class="copilot-suggestion" data-msg="Erstelle eine Follow-up E-Mail">Erstelle eine Follow-up E-Mail</button>
          </div>
        </div>
      </div>
      <div class="copilot-input-area">
        <input type="text" class="copilot-input" id="copilot-input" placeholder="Ask about deals, pipeline, contacts..." />
        <button class="copilot-send" id="copilot-send">Send</button>
      </div>
    `;
    document.body.appendChild(panel);

    // Event listeners
    document.getElementById("copilot-close").addEventListener("click", togglePanel);
    document.getElementById("copilot-send").addEventListener("click", sendMessage);
    document.getElementById("copilot-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    document.getElementById("copilot-settings-btn").addEventListener("click", () => {
      settingsVisible = !settingsVisible;
      document.getElementById("copilot-settings").style.display = settingsVisible ? "flex" : "none";
    });
    document.getElementById("copilot-key-save").addEventListener("click", () => {
      const key = document.getElementById("copilot-key-input").value.trim();
      if (key) saveApiKey(key);
      const lang = document.getElementById("copilot-lang-select").value;
      saveLanguage(lang);
      settingsVisible = false;
      document.getElementById("copilot-settings").style.display = "none";
    });

    // Suggestion buttons
    panel.querySelectorAll(".copilot-suggestion").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.getElementById("copilot-input").value = btn.dataset.msg;
        sendMessage();
      });
    });

    updateContext();
    loadApiKey();
    loadLanguage();
  }

  function updateContext() {
    const ctx = getHubSpotContext();
    const el = document.getElementById("copilot-context");
    if (el) {
      if (ctx.objectType && ctx.objectId) {
        el.textContent = `${ctx.objectType} #${ctx.objectId}`;
        el.style.display = "inline";
      } else if (ctx.portalId) {
        el.textContent = `portal ${ctx.portalId}`;
        el.style.display = "inline";
      } else {
        el.style.display = "none";
      }
    }
  }

  function togglePanel() {
    isOpen = !isOpen;
    document.getElementById("hs-copilot-panel").classList.toggle("open", isOpen);
    document.getElementById("hs-copilot-fab").classList.toggle("open", isOpen);
    if (isOpen) {
      updateContext();
      setTimeout(() => document.getElementById("copilot-input").focus(), 300);
    }
  }

  // --- Rendering ---
  function scrollBottom() {
    const el = document.getElementById("copilot-messages");
    el.scrollTop = el.scrollHeight;
  }

  function renderMessages() {
    const container = document.getElementById("copilot-messages");
    const empty = document.getElementById("copilot-empty");
    if (empty && messages.length > 0) empty.remove();

    container.innerHTML = "";
    for (const msg of messages) {
      const row = document.createElement("div");
      row.className = "copilot-msg-row " + msg.role;
      const bubble = document.createElement("div");
      bubble.className = "copilot-bubble " + msg.role;
      if (msg.role === "assistant") {
        bubble.innerHTML =
          '<div class="copilot-bubble-label">Copilot</div>' + formatText(msg.content);
      } else {
        bubble.textContent = msg.content;
      }
      row.appendChild(bubble);
      container.appendChild(row);
    }
    scrollBottom();
  }

  function showThinking() {
    const container = document.getElementById("copilot-messages");
    let el = document.getElementById("copilot-thinking");
    if (el) el.remove();
    el = document.createElement("div");
    el.id = "copilot-thinking";
    el.className = "copilot-thinking";
    el.innerHTML =
      '<div class="copilot-dot"></div><div class="copilot-dot"></div><div class="copilot-dot"></div><span>Thinking</span>';
    container.appendChild(el);
    scrollBottom();
  }

  function removeThinking() {
    const el = document.getElementById("copilot-thinking");
    if (el) el.remove();
  }

  function showAuthPrompt(authUrl) {
    const container = document.getElementById("copilot-messages");
    const card = document.createElement("div");
    card.className = "copilot-pending";
    card.id = "copilot-auth-card";
    card.innerHTML = `
      <div class="copilot-pending-header">\u{1F511} HubSpot authorization required</div>
      <div style="padding:16px 14px;font-size:14px;color:#33475b;line-height:1.6">
        <p>I need access to your HubSpot CRM to help you. Click below to connect your account — it only takes a few seconds.</p>
        <div style="margin-top:12px;text-align:center">
          <button id="copilot-auth-btn" style="
            padding:12px 32px;background:#ff7a59;color:#fff;border:none;border-radius:6px;
            font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;
          ">Connect HubSpot</button>
        </div>
        <p style="margin-top:12px;font-size:12px;color:#516f90;text-align:center">
          Opens a new window to authorize. You'll be redirected back automatically.
        </p>
      </div>
    `;
    container.appendChild(card);
    scrollBottom();

    document.getElementById("copilot-auth-btn").addEventListener("click", () => {
      // Open auth in a popup window
      const w = 600, h = 700;
      const left = (screen.width - w) / 2;
      const top = (screen.height - h) / 2;
      window.open(authUrl, "hs-copilot-auth", `width=${w},height=${h},left=${left},top=${top}`);
    });
  }

  // Listen for auth success from the popup callback page
  window.addEventListener("message", (event) => {
    if (event.data?.type === "hs-copilot-auth-success") {
      // Remove the auth card
      const card = document.getElementById("copilot-auth-card");
      if (card) card.remove();
      // Show success message
      messages.push({
        role: "assistant",
        content: "Connected to HubSpot portal " + event.data.portalId + ". You're all set! Try your question again.",
      });
      renderMessages();
    }
  });

  function showToolSteps(steps) {
    if (!steps || steps.length === 0) return;
    removeThinking();
    const container = document.getElementById("copilot-messages");
    const div = document.createElement("div");
    div.className = "copilot-tool-steps";
    for (const s of steps) {
      const step = document.createElement("div");
      step.className = "copilot-tool-step";
      step.innerHTML = `<span>${STATUS_ICONS[s.status] || "\u{1F504}"}</span><span>${TOOL_LABELS[s.tool] || s.tool}</span>`;
      div.appendChild(step);
    }
    container.appendChild(div);
    scrollBottom();
  }

  function showPendingActions(actions) {
    if (!actions || actions.length === 0) return;
    pendingActions = actions;
    const container = document.getElementById("copilot-messages");

    const card = document.createElement("div");
    card.className = "copilot-pending";
    card.id = "copilot-pending-card";
    card.innerHTML = `
      <div class="copilot-pending-header">\u26A0\uFE0F ${actions.length} action${actions.length > 1 ? "s" : ""} pending confirmation</div>
      <div class="copilot-pending-list">
        ${actions
          .map(
            (a, i) => `
          <div class="copilot-pending-item" onclick="this.classList.toggle('expanded')">
            <strong>${ACTION_LABELS[a.tool] || a.tool}</strong>
            ${a.input.to_email ? " — " + esc(a.input.to_email) : ""}
            ${a.input.title ? " — " + esc(a.input.title) : ""}
            <div class="copilot-pending-detail">
              ${a.input.subject ? "<div><strong>Subject:</strong> " + esc(a.input.subject) + "</div>" : ""}
              ${a.input.body ? "<div>" + esc(a.input.body) + "</div>" : ""}
              ${a.input.note_body ? "<div>" + esc(a.input.note_body) + "</div>" : ""}
              ${a.input.new_stage ? "<div><strong>New Stage:</strong> " + esc(a.input.new_stage) + "</div>" : ""}
            </div>
          </div>`
          )
          .join("")}
      </div>
      <div class="copilot-pending-buttons">
        <button class="copilot-btn-confirm" id="copilot-confirm-btn">Confirm All</button>
        <button class="copilot-btn-discard" id="copilot-discard-btn">Discard</button>
      </div>
    `;
    container.appendChild(card);

    document.getElementById("copilot-confirm-btn").addEventListener("click", confirmActions);
    document.getElementById("copilot-discard-btn").addEventListener("click", discardActions);
    scrollBottom();
  }

  // --- API calls ---
  function apiHeaders() {
    const h = { "Content-Type": "application/json" };
    if (apiKey) h["x-api-key"] = apiKey;
    return h;
  }

  async function sendMessage() {
    const input = document.getElementById("copilot-input");
    const text = input.value.trim();
    if (!text || loading) return;

    if (!apiKey) {
      settingsVisible = true;
      document.getElementById("copilot-settings").style.display = "flex";
      document.getElementById("copilot-key-input").focus();
      return;
    }

    const ctx = getHubSpotContext();
    const userMsg = { role: "user", content: text };
    messages.push(userMsg);
    input.value = "";
    renderMessages();
    setLoading(true);
    showThinking();

    try {
      const res = await fetch(BACKEND_URL + "/api/chat", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          portalId: ctx.portalId || "demo",
          dealId: ctx.objectType === "deal" ? ctx.objectId : null,
          language,
          context: {
            objectType: ctx.objectType,
            objectId: ctx.objectId,
            pageView: ctx.pageView,
            pageData: ctx.pageData,
            url: window.location.href,
          },
        }),
      });

      const data = await res.json();
      removeThinking();

      // Handle auth_required — show clickable authorize link
      if (data.auth_required) {
        showAuthPrompt(data.auth_url);
        setLoading(false);
        return;
      }

      if (data.toolSteps?.length > 0) showToolSteps(data.toolSteps);

      if (data.error) {
        messages.push({ role: "assistant", content: "Error: " + data.error + (data.details ? "\n" + data.details : "") });
      } else if (data.response) {
        messages.push({ role: "assistant", content: data.response });
      }
      renderMessages();

      // Re-insert tool steps before last message
      if (data.toolSteps?.length > 0) {
        const container = document.getElementById("copilot-messages");
        const rows = container.querySelectorAll(".copilot-msg-row");
        const lastRow = rows[rows.length - 1];
        const stepsDiv = document.createElement("div");
        stepsDiv.className = "copilot-tool-steps";
        for (const s of data.toolSteps) {
          const step = document.createElement("div");
          step.className = "copilot-tool-step";
          step.innerHTML = `<span>${STATUS_ICONS[s.status] || "\u{1F504}"}</span><span>${TOOL_LABELS[s.tool] || s.tool}</span>`;
          stepsDiv.appendChild(step);
        }
        container.insertBefore(stepsDiv, lastRow);
      }

      if (data.pendingActions?.length > 0) showPendingActions(data.pendingActions);
    } catch (err) {
      removeThinking();
      messages.push({ role: "assistant", content: "Failed to reach the backend. Is the server running?" });
      renderMessages();
    }

    setLoading(false);
    scrollBottom();
  }

  async function confirmActions() {
    const ctx = getHubSpotContext();
    setLoading(true);
    try {
      const res = await fetch(BACKEND_URL + "/api/chat/confirm", {
        method: "POST",
        headers: apiHeaders(),
        body: JSON.stringify({
          portalId: ctx.portalId || "demo",
          actions: pendingActions.map((a) => ({ tool: a.tool, input: a.input })),
        }),
      });
      const data = await res.json();
      const summary = data.results
        .map((r) =>
          r.status === "success"
            ? "\u2705 " + (ACTION_LABELS[r.tool] || r.tool) + ": Done"
            : "\u274C " + (ACTION_LABELS[r.tool] || r.tool) + ": " + r.error
        )
        .join("\n");
      const card = document.getElementById("copilot-pending-card");
      if (card) card.remove();
      messages.push({ role: "assistant", content: summary });
      renderMessages();
    } catch {
      messages.push({ role: "assistant", content: "Failed to execute actions." });
      renderMessages();
    }
    pendingActions = [];
    setLoading(false);
  }

  function discardActions() {
    const card = document.getElementById("copilot-pending-card");
    if (card) card.remove();
    pendingActions = [];
    messages.push({ role: "assistant", content: "Actions discarded." });
    renderMessages();
  }

  function setLoading(v) {
    loading = v;
    const send = document.getElementById("copilot-send");
    const input = document.getElementById("copilot-input");
    if (send) send.disabled = v;
    if (input) input.disabled = v;
  }

  // --- Listen for keyboard shortcut from background ---
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "toggle") togglePanel();
  });

  // --- Init ---
  createUI();

  // Update context when URL changes (HubSpot is a SPA)
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      updateContext();
    }
  }).observe(document.body, { subtree: true, childList: true });
})();
