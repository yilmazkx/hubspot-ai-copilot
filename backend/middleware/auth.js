const crypto = require("crypto");

/**
 * API key authentication middleware.
 * Protects endpoints from unauthorized access.
 *
 * Expects header: x-api-key: <key>
 * The key is set via COPILOT_API_KEY env var.
 *
 * In demo mode (no COPILOT_API_KEY set), auth is bypassed for local dev.
 */
function requireApiKey(req, res, next) {
  const expectedKey = process.env.COPILOT_API_KEY;

  // Skip auth in local dev if no key is configured
  if (!expectedKey) {
    return next();
  }

  const providedKey = req.headers["x-api-key"];

  if (!providedKey) {
    return res.status(401).json({ error: "Missing x-api-key header" });
  }

  // Constant-time comparison to prevent timing attacks
  const expected = Buffer.from(expectedKey, "utf8");
  const provided = Buffer.from(providedKey, "utf8");

  if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
    return res.status(403).json({ error: "Invalid API key" });
  }

  next();
}

/**
 * HubSpot origin validation middleware.
 * Only allows requests from HubSpot domains and the app's own domain.
 */
function validateOrigin(req, res, next) {
  // Skip origin check in local dev
  if (!process.env.VERCEL) {
    return next();
  }

  const origin = req.headers.origin || req.headers.referer || "";
  const allowedPatterns = [
    /^https:\/\/.*\.hubspot\.com/,
    /^https:\/\/.*\.hubspotusercontent\.com/,
    /^https:\/\/.*\.hsappstatic\.net/,
    /^https:\/\/hubspot-ai-copilot-backend\.vercel\.app/,
    /^https:\/\/hubspot-ai-copilot-backend-.*\.vercel\.app/, // preview deploys
  ];

  // Allow custom domain if set
  if (process.env.ALLOWED_ORIGIN) {
    allowedPatterns.push(new RegExp(`^${process.env.ALLOWED_ORIGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  }

  // Webhooks from HubSpot won't have an origin header
  if (req.path.startsWith("/webhooks")) {
    return next();
  }

  // Health check is public
  if (req.path === "/health") {
    return next();
  }

  // Auth callbacks are browser redirects — no origin header
  if (req.path.startsWith("/auth/callback")) {
    return next();
  }

  // If there's no origin (server-to-server call from HubSpot serverless), allow if API key is valid
  if (!origin && req.headers["x-api-key"]) {
    return next();
  }

  const isAllowed = !origin || allowedPatterns.some((p) => p.test(origin));

  if (!isAllowed) {
    return res.status(403).json({ error: "Origin not allowed" });
  }

  next();
}

module.exports = { requireApiKey, validateOrigin };
