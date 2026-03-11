const express = require("express");
const hubspot = require("@hubspot/api-client");
const { storeTokens, getTokens } = require("../hubspot/client");

const router = express.Router();

const SCOPES = [
  "crm.objects.deals.read",
  "crm.objects.deals.write",
  "crm.objects.contacts.read",
  "crm.objects.contacts.write",
  "crm.schemas.deals.read",
  "sales-email-read",
  "timeline",
].join(" ");

// GET /auth/authorize — redirect user to HubSpot OAuth
router.get("/authorize", (_req, res) => {
  const authUrl =
    `https://app.hubspot.com/oauth/authorize` +
    `?client_id=${encodeURIComponent(process.env.HUBSPOT_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(process.env.HUBSPOT_REDIRECT_URI)}` +
    `&scope=${encodeURIComponent(SCOPES)}`;
  res.redirect(authUrl);
});

// GET /auth/callback — exchange code for tokens
router.get("/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) {
    return res.status(400).json({ error: "Missing authorization code" });
  }

  try {
    const client = new hubspot.Client();
    const tokenResponse = await client.oauth.tokensApi.create(
      "authorization_code",
      code,
      process.env.HUBSPOT_REDIRECT_URI,
      process.env.HUBSPOT_CLIENT_ID,
      process.env.HUBSPOT_CLIENT_SECRET
    );

    // Get portal ID from access token info
    const infoClient = new hubspot.Client({ accessToken: tokenResponse.accessToken });
    const accountInfo = await infoClient.oauth.accessTokensApi.get(tokenResponse.accessToken);
    const portalId = accountInfo.hubId;

    await storeTokens(portalId, {
      accessToken: tokenResponse.accessToken,
      refreshToken: tokenResponse.refreshToken,
      expiresIn: tokenResponse.expiresIn,
    });

    // Redirect to a success page instead of raw JSON
    res.send(`<!DOCTYPE html>
<html><head><title>Connected!</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f5f8fa;margin:0}
.card{background:#fff;border-radius:12px;padding:40px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,.1);max-width:400px}
h2{color:#00bda5;margin-bottom:8px}p{color:#33475b;font-size:15px}
.portal{background:#eaf0f6;padding:8px 16px;border-radius:6px;font-family:monospace;margin:12px 0;display:inline-block}</style></head>
<body><div class="card">
<h2>Connected Successfully</h2>
<p>Portal <span class="portal">${portalId}</span> is now linked to AI Copilot.</p>
<p>You can close this window and return to HubSpot.</p>
</div></body></html>`);
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.status(500).json({ error: "Failed to complete OAuth flow", details: err.message });
  }
});

// GET /auth/status/:portalId — check if we have tokens
router.get("/status/:portalId", async (req, res) => {
  const isDemoMode = !process.env.HUBSPOT_CLIENT_ID || !process.env.HUBSPOT_CLIENT_SECRET;
  if (isDemoMode) {
    return res.json({ authorized: true, demo: true });
  }
  const tokens = await getTokens(req.params.portalId);
  res.json({ authorized: !!tokens });
});

module.exports = router;
