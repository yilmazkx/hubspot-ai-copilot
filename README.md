# HubSpot AI Copilot

AI-powered CRM assistant that lives inside HubSpot. Uses Claude as the AI brain with tool use to read and write CRM data through natural conversation.

## Architecture

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────┐
│  HubSpot UI         │────▶│  Node.js Backend     │────▶│  Claude API │
│  Extension (React)  │◀────│  Express + Tools     │◀────│  (tool use) │
│  Sidebar Panel      │     │  POST /api/chat      │     └─────────────┘
└─────────────────────┘     │  POST /api/chat/confirm│
                            │  HubSpot OAuth       │────▶ HubSpot API
                            └──────────────────────┘
```

## Setup

### 1. HubSpot Developer App

1. Go to [HubSpot Developer Portal](https://developers.hubspot.com/)
2. Create a new app
3. Under **Auth**, add the redirect URI: `http://localhost:3000/auth/callback`
4. Under **Scopes**, enable:
   - `crm.objects.deals.read`
   - `crm.objects.deals.write`
   - `crm.objects.contacts.read`
   - `crm.objects.contacts.write`
   - `crm.schemas.deals.read`
   - `sales-email-read`
   - `timeline`
5. Copy the Client ID and Client Secret

### 2. Environment Variables

```bash
cp backend/.env.example backend/.env
```

Fill in:
```
ANTHROPIC_API_KEY=sk-ant-...
HUBSPOT_CLIENT_ID=your-client-id
HUBSPOT_CLIENT_SECRET=your-client-secret
HUBSPOT_REDIRECT_URI=http://localhost:3000/auth/callback
PORT=3000
```

### 3. Install & Run

```bash
# Install all dependencies
npm install

# Start the backend
npm run dev:backend

# In another terminal, start the extension dev server
npm run dev:extension
```

### 4. Authorize

Visit `http://localhost:3000/auth/authorize` in your browser to connect your HubSpot portal.

## API Endpoints

### `POST /api/chat`

Main chat endpoint. Runs the Claude agentic loop.

```json
{
  "messages": [{"role": "user", "content": "Show me stale deals"}],
  "portalId": "12345",
  "dealId": "optional-deal-id"
}
```

Response:
```json
{
  "response": "Here are your stale deals...",
  "toolSteps": [{"tool": "get_stale_deals", "status": "complete"}],
  "pendingActions": []
}
```

### `POST /api/chat/confirm`

Execute write actions after user confirmation.

```json
{
  "portalId": "12345",
  "actions": [{"tool": "create_draft_email", "input": {...}}]
}
```

### `GET /auth/authorize`

Redirects to HubSpot OAuth flow.

### `GET /auth/status/:portalId`

Check if a portal is authorized.

## Tools

### Read (execute immediately)
| Tool | Description |
|------|-------------|
| `get_pipeline_summary` | All pipelines with stage counts and values |
| `get_deals` | Search/filter deals with contacts |
| `get_deal_detail` | Full deal with activity history |
| `get_stale_deals` | Deals with no activity in N days |
| `get_contacts` | Search contacts |

### Write (require user confirmation)
| Tool | Description |
|------|-------------|
| `create_draft_email` | Save email draft on a deal |
| `send_email` | Send email from a deal |
| `create_task` | Create follow-up task |
| `update_deal_stage` | Move deal in pipeline |
| `add_note` | Log note to deal timeline |

## Example Workflows

**Pipeline overview:**
> "How does my pipeline look this week?"

**Stale deal follow-up:**
> "Find deals with no activity in 14 days and draft follow-ups"

**Post-demo batch emails:**
> "My demos that moved to Demo Done today — draft personalized follow-up emails for each one"

**Deal research:**
> "Tell me everything about the Acme Corp deal"
