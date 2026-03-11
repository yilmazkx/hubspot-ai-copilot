// Serverless function that proxies chat requests to the backend
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:3000";
const COPILOT_API_KEY = process.env.COPILOT_API_KEY || "";

exports.main = async (context = {}) => {
  const { messages, portalId, dealId } = context.parameters;

  const body = JSON.stringify({ messages, portalId, dealId });
  const url = new URL("/api/chat", BACKEND_URL);

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
