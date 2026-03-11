const express = require("express");
const crypto = require("crypto");
const { deleteTokens } = require("../hubspot/client");

const router = express.Router();

// Verify HubSpot webhook signature
function verifySignature(req) {
  const signature = req.headers["x-hubspot-signature-v3"];
  if (!signature || !process.env.HUBSPOT_CLIENT_SECRET) return false;

  const timestamp = req.headers["x-hubspot-request-timestamp"];
  const url = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const body = JSON.stringify(req.body);

  const sourceString = `${req.method}${url}${body}${timestamp}`;
  const hash = crypto
    .createHmac("sha256", process.env.HUBSPOT_CLIENT_SECRET)
    .update(sourceString)
    .digest("base64");

  return hash === signature;
}

// POST /webhooks/uninstall — HubSpot sends this when a user uninstalls the app
router.post("/uninstall", async (req, res) => {
  // In production, verify the signature
  if (process.env.NODE_ENV === "production" && !verifySignature(req)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const events = Array.isArray(req.body) ? req.body : [req.body];

  for (const event of events) {
    const portalId = event.portalId || event.objectId;
    if (portalId) {
      console.log(`App uninstalled from portal ${portalId}, cleaning up tokens`);
      await deleteTokens(portalId);
    }
  }

  res.status(200).json({ received: true });
});

module.exports = router;
