import { pollMonitor, startMonitor } from "./pharos-mcp.js";

const json = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/start") {
      if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
      try {
        return json(await startMonitor());
      } catch (error) {
        return json({ error: error.message || "The MCP start request failed." }, 502);
      }
    }
    if (url.pathname === "/api/poll") {
      if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
      try {
        const fromBlock = url.searchParams.get("fromBlock") || "";
        const decimals = Number(url.searchParams.get("decimals"));
        return json(await pollMonitor(fromBlock, decimals));
      } catch (error) {
        const badInput = /fromBlock|decimals|block number/.test(error.message);
        return json({ error: error.message || "The MCP poll failed." }, badInput ? 400 : 502);
      }
    }
    return env.ASSETS.fetch(request);
  },
};

