const isDemoMode = !process.env.HUBSPOT_CLIENT_ID || !process.env.HUBSPOT_CLIENT_SECRET;
const hs = isDemoMode ? require("../hubspot/mock") : require("../hubspot/client");
const { getUserMemory, setUserMemory } = require("../hubspot/client");
const web = require("./web");

/**
 * Execute a tool by name with the given input.
 * Returns the result object to be sent back to Claude.
 */
async function executeTool(toolName, input, portalId, ownerId) {
  switch (toolName) {
    case "get_pipeline_summary":
      return await hs.getPipelineSummary(portalId);

    case "get_deals":
      return await hs.getDeals(portalId, {
        stage: input.stage,
        owner: input.owner,
        min_value: input.min_value,
        stale_days: input.stale_days,
        limit: input.limit,
      });

    case "get_deal_detail":
      return await hs.getDealDetail(portalId, input.deal_id);

    case "get_stale_deals":
      return await hs.getStaleDeals(portalId, input.days);

    case "get_contacts":
      return await hs.getContacts(portalId, input.query);

    case "get_current_record":
      return await getCurrentRecord(portalId, input.object_type, input.object_id);

    case "get_company_detail":
      return await hs.getCompanyDetail(portalId, input.company_id);

    case "web_search":
      return await web.search(input.query);

    case "fetch_webpage":
      return await web.fetchPage(input.url);

    case "create_draft_email":
      return await hs.createDraftEmail(portalId, input.deal_id, input.to_email, input.subject, input.body);

    case "send_email":
      return await hs.sendEmail(portalId, input.deal_id, input.to_email, input.subject, input.body);

    case "create_task":
      return await hs.createTask(portalId, input.deal_id, input.title, input.due_date, input.notes);

    case "update_deal_stage":
      return await hs.updateDealStage(portalId, input.deal_id, input.new_stage);

    case "add_note":
      return await hs.addNote(portalId, input.deal_id, input.note_body);

    case "save_memory": {
      if (!ownerId) return { status: "skipped", reason: "No user identity available" };
      const existing = await getUserMemory(ownerId);
      const timestamp = new Date().toISOString().split("T")[0];
      const newEntry = `- [${timestamp}] ${input.content}`;
      const updated = existing ? `${existing}\n${newEntry}` : newEntry;
      await setUserMemory(ownerId, updated);
      return { status: "saved", content: input.content };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

async function getCurrentRecord(portalId, objectType, objectId) {
  switch (objectType) {
    case "contact": {
      const client = await hs.getClient(portalId);
      const contact = await client.crm.contacts.basicApi.getById(objectId, [
        "firstname", "lastname", "email", "phone", "jobtitle", "company",
        "lifecyclestage", "hs_lead_status", "city", "state", "country",
        "website", "linkedin_url", "notes_last_updated", "hubspot_owner_id",
        "createdate", "lastmodifieddate", "num_associated_deals",
      ]);
      // Get associated companies
      let companies = [];
      try {
        const assoc = await client.crm.contacts.associationsApi.getAll(objectId, "companies");
        companies = await Promise.all(
          (assoc.results || []).slice(0, 5).map(async (a) => {
            const c = await client.crm.companies.basicApi.getById(a.toObjectId, [
              "name", "domain", "industry", "numberofemployees", "annualrevenue",
            ]);
            return { companyId: c.id, ...c.properties };
          })
        );
      } catch {}
      // Get associated deals
      let deals = [];
      try {
        const assoc = await client.crm.contacts.associationsApi.getAll(objectId, "deals");
        deals = await Promise.all(
          (assoc.results || []).slice(0, 5).map(async (a) => {
            const d = await client.crm.deals.basicApi.getById(a.toObjectId, [
              "dealname", "dealstage", "amount", "closedate",
            ]);
            return { dealId: d.id, ...d.properties };
          })
        );
      } catch {}
      return { type: "contact", contactId: objectId, ...contact.properties, companies, deals };
    }
    case "company": {
      return await hs.getCompanyDetail(portalId, objectId);
    }
    case "deal": {
      return await hs.getDealDetail(portalId, objectId);
    }
    default:
      return { error: `Unsupported object type: ${objectType}` };
  }
}

module.exports = { executeTool };
