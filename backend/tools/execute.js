const isDemoMode = !process.env.HUBSPOT_CLIENT_ID || !process.env.HUBSPOT_CLIENT_SECRET;
const hs = isDemoMode ? require("../hubspot/mock") : require("../hubspot/client");

/**
 * Execute a tool by name with the given input.
 * Returns the result object to be sent back to Claude.
 */
async function executeTool(toolName, input, portalId) {
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

    case "create_draft_email":
      return await hs.createDraftEmail(
        portalId,
        input.deal_id,
        input.to_email,
        input.subject,
        input.body
      );

    case "send_email":
      return await hs.sendEmail(
        portalId,
        input.deal_id,
        input.to_email,
        input.subject,
        input.body
      );

    case "create_task":
      return await hs.createTask(
        portalId,
        input.deal_id,
        input.title,
        input.due_date,
        input.notes
      );

    case "update_deal_stage":
      return await hs.updateDealStage(portalId, input.deal_id, input.new_stage);

    case "add_note":
      return await hs.addNote(portalId, input.deal_id, input.note_body);

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

module.exports = { executeTool };
