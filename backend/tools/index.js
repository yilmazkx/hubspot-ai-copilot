// Claude tool definitions (JSON schema format)

const READ_TOOLS = [
  {
    name: "get_pipeline_summary",
    description:
      "Get a summary of all deal pipelines with stages, deal counts, and total values per stage. Use this to give the user an overview of their sales pipeline.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_deals",
    description:
      "Search and filter deals in HubSpot CRM. Returns deal details with associated contacts. Supports filtering by stage, owner, minimum value, stale days, and limit.",
    input_schema: {
      type: "object",
      properties: {
        stage: {
          type: "string",
          description: "Filter by deal stage ID or name (e.g. 'appointmentscheduled', 'closedwon')",
        },
        owner: {
          type: "string",
          description: "Filter by HubSpot owner ID",
        },
        min_value: {
          type: "number",
          description: "Minimum deal amount to filter by",
        },
        stale_days: {
          type: "number",
          description: "Only return deals with no activity in this many days",
        },
        limit: {
          type: "number",
          description: "Max number of deals to return (default 20)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_deal_detail",
    description:
      "Get full details for a specific deal including contacts, activity history, emails, calls, and notes. Use this to understand the full context of a deal.",
    input_schema: {
      type: "object",
      properties: {
        deal_id: {
          type: "string",
          description: "The HubSpot deal ID",
        },
      },
      required: ["deal_id"],
    },
  },
  {
    name: "get_stale_deals",
    description:
      "Get deals with no activity in the specified number of days. Useful for finding deals that need follow-up.",
    input_schema: {
      type: "object",
      properties: {
        days: {
          type: "number",
          description: "Number of days of inactivity to consider a deal stale",
        },
      },
      required: ["days"],
    },
  },
  {
    name: "get_contacts",
    description:
      "Search contacts in HubSpot by name, email, company, or any text query.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Search query (name, email, company, etc.)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_current_record",
    description:
      "Fetch the full details of the CRM record the user is currently viewing (contact, company, or deal). Use this when the user asks about 'this contact', 'this deal', 'this company', or refers to what they're currently looking at. Requires objectType and objectId from the page context.",
    input_schema: {
      type: "object",
      properties: {
        object_type: {
          type: "string",
          enum: ["contact", "company", "deal"],
          description: "The type of CRM record",
        },
        object_id: {
          type: "string",
          description: "The HubSpot record ID",
        },
      },
      required: ["object_type", "object_id"],
    },
  },
  {
    name: "web_search",
    description:
      "Search the web for information. Use this to research companies (by domain/name), find LinkedIn profiles, look up people, or gather any external information not available in HubSpot. Returns search results with titles, snippets, and URLs.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query (e.g. 'John Smith LinkedIn Acme Corp', 'acmecorp.com company info')",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "fetch_webpage",
    description:
      "Fetch and extract text content from a webpage URL. Use this after web_search to get detailed information from a specific page (e.g. a LinkedIn profile, company about page, blog post). Returns the page text content.",
    input_schema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The full URL to fetch",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "get_company_detail",
    description:
      "Get full details for a HubSpot company record including properties, associated contacts, and deals.",
    input_schema: {
      type: "object",
      properties: {
        company_id: {
          type: "string",
          description: "The HubSpot company ID",
        },
      },
      required: ["company_id"],
    },
  },
  {
    name: "create_draft_email",
    description:
      "Create a draft email associated with a deal in HubSpot. The draft will be saved in HubSpot but NOT sent — the user can review and send it from HubSpot. Use this when the user asks you to draft or prepare an email.",
    input_schema: {
      type: "object",
      properties: {
        deal_id: {
          type: "string",
          description: "The deal ID to associate the email with",
        },
        to_email: {
          type: "string",
          description: "Recipient email address",
        },
        subject: {
          type: "string",
          description: "Email subject line",
        },
        body: {
          type: "string",
          description: "Email body content (plain text or HTML)",
        },
      },
      required: ["deal_id", "to_email", "subject", "body"],
    },
  },
  {
    name: "save_memory",
    description:
      "Save a learning or preference about the current user for future conversations. Use this when you notice patterns in the user's communication style, demo preferences, industry focus, preferred email tone, common requests, or any other useful context. Call this proactively — don't ask the user for permission. Examples: 'Bevorzugt kurze, direkte E-Mails', 'Fokus auf Versicherungs-Branche', 'Nutzt gerne Bullet Points', 'Zeigt in Demos immer zuerst den KI-Agent'.",
    input_schema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "The observation or preference to remember about this user. Write in German. Be specific and actionable.",
        },
      },
      required: ["content"],
    },
  },
];

const WRITE_TOOLS = [
  {
    name: "send_email",
    description:
      "Send an email associated with a deal. This will actually send the email. Requires user confirmation.",
    input_schema: {
      type: "object",
      properties: {
        deal_id: {
          type: "string",
          description: "The deal ID to associate the email with",
        },
        to_email: {
          type: "string",
          description: "Recipient email address",
        },
        subject: {
          type: "string",
          description: "Email subject line",
        },
        body: {
          type: "string",
          description: "Email body content",
        },
      },
      required: ["deal_id", "to_email", "subject", "body"],
    },
  },
  {
    name: "create_task",
    description:
      "Create a follow-up task associated with a deal. Requires user confirmation.",
    input_schema: {
      type: "object",
      properties: {
        deal_id: {
          type: "string",
          description: "The deal ID to associate the task with",
        },
        title: {
          type: "string",
          description: "Task title/subject",
        },
        due_date: {
          type: "string",
          description: "Due date in ISO format (e.g. 2025-01-15)",
        },
        notes: {
          type: "string",
          description: "Additional notes for the task",
        },
      },
      required: ["deal_id", "title", "due_date"],
    },
  },
  {
    name: "update_deal_stage",
    description:
      "Move a deal to a different pipeline stage. Requires user confirmation.",
    input_schema: {
      type: "object",
      properties: {
        deal_id: {
          type: "string",
          description: "The deal ID to update",
        },
        new_stage: {
          type: "string",
          description: "The stage ID to move the deal to",
        },
      },
      required: ["deal_id", "new_stage"],
    },
  },
  {
    name: "add_note",
    description:
      "Add a note to a deal's timeline. Requires user confirmation.",
    input_schema: {
      type: "object",
      properties: {
        deal_id: {
          type: "string",
          description: "The deal ID to add the note to",
        },
        note_body: {
          type: "string",
          description: "The note content (supports HTML)",
        },
      },
      required: ["deal_id", "note_body"],
    },
  },
];

const WRITE_TOOL_NAMES = new Set(WRITE_TOOLS.map((t) => t.name));

const ALL_TOOLS = [...READ_TOOLS, ...WRITE_TOOLS];

module.exports = { ALL_TOOLS, WRITE_TOOL_NAMES, READ_TOOLS, WRITE_TOOLS };
