// Serverless function that proxies confirm requests to the backend
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3000";
const COPILOT_API_KEY = process.env.COPILOT_API_KEY || "";

exports.main = async (context = {}) => {
  const { portalId, actions } = context.parameters;

  const body = JSON.stringify({ portalId, actions });
  const url = new URL("/api/chat/confirm", BACKEND_URL);

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": COPILOT_API_KEY,
    },
    body,
  });

  const data = await response.json();
  return { statusCode: 200, body: data };
};
