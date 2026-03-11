/**
 * Web search and page fetching tools.
 * Uses DuckDuckGo HTML search (no API key needed) and direct page fetching.
 */

const SEARCH_TIMEOUT = 8000;
const FETCH_TIMEOUT = 8000;

async function search(query) {
  try {
    // Use DuckDuckGo HTML search — free, no API key
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; HubSpot-Copilot/1.0)",
      },
      signal: AbortSignal.timeout(SEARCH_TIMEOUT),
    });

    const html = await res.text();

    // Parse results from DuckDuckGo HTML
    const results = [];
    const resultRegex = /<a rel="nofollow" class="result__a" href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
    let match;
    while ((match = resultRegex.exec(html)) !== null && results.length < 8) {
      const href = decodeURIComponent(match[1].replace(/.*uddg=/, "").replace(/&.*/, ""));
      const title = match[2].replace(/<[^>]+>/g, "").trim();
      const snippet = match[3].replace(/<[^>]+>/g, "").trim();
      if (title && href.startsWith("http")) {
        results.push({ title, url: href, snippet });
      }
    }

    if (results.length === 0) {
      return { query, results: [], message: "No results found. Try a different query." };
    }

    return { query, results };
  } catch (err) {
    return { query, results: [], error: err.message };
  }
}

async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; HubSpot-Copilot/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
      redirect: "follow",
    });

    if (!res.ok) {
      return { url, error: `HTTP ${res.status}`, content: null };
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("html") && !contentType.includes("text")) {
      return { url, error: `Non-text content: ${contentType}`, content: null };
    }

    const html = await res.text();

    // Extract useful text from HTML
    let text = html
      // Remove script and style blocks
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<nav[\s\S]*?<\/nav>/gi, "")
      .replace(/<footer[\s\S]*?<\/footer>/gi, "")
      .replace(/<header[\s\S]*?<\/header>/gi, "")
      // Remove HTML tags
      .replace(/<[^>]+>/g, " ")
      // Decode entities
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      // Clean whitespace
      .replace(/\s+/g, " ")
      .trim();

    // Truncate to ~4000 chars to fit in Claude's context
    if (text.length > 4000) {
      text = text.substring(0, 4000) + "... [truncated]";
    }

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, "").trim() : "";

    // Extract meta description
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    const description = descMatch ? descMatch[1] : "";

    return { url, title, description, content: text };
  } catch (err) {
    return { url, error: err.message, content: null };
  }
}

module.exports = { search, fetchPage };
