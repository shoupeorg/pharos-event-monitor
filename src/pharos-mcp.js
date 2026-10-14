import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import {
  CONTRACT,
  TRANSFER_TOPIC,
  decodeTransferLog,
  nextRange,
  parseBlock,
} from "./events.js";

export const MCP_URL = "https://mcp.pharos.xyz/mcp";
const DECIMALS_SELECTOR = "0x313ce567";
const REQUIRED_TOOLS = ["get_chain_info", "get_block_number", "get_logs", "eth_call"];
const HISTORICAL_BLOCKS = 100n;

function textPayload(result, toolName) {
  if (result.isError) {
    const detail = result.content
      ?.filter((item) => item.type === "text")
      .map((item) => item.text)
      .join("\n");
    throw new Error(`${toolName} failed${detail ? `: ${detail}` : ""}`);
  }
  const text = result.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new Error(`${toolName} returned no text result`);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${toolName} returned invalid JSON: ${error.message}`);
  }
}

async function callJson(client, name, args = {}) {
  try {
    return textPayload(await client.callTool({ name, arguments: args }), name);
  } catch (error) {
    throw new Error(`${name} call failed: ${error.message}`, { cause: error });
  }
}

function decodeDecimals(value) {
  if (typeof value !== "string" || !/^0x[0-9a-f]{64}$/i.test(value)) {
    throw new Error("decimals() returned invalid ABI data");
  }
  const decoded = BigInt(value);
  if (decoded > 255n) throw new Error(`decimals() returned ${decoded}`);
  return Number(decoded);
}

async function withClient(operation) {
  const client = new Client({ name: "pharos-event-monitor", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    fetch: (input, init) =>
      fetch(input, {
        ...init,
        signal: AbortSignal.any([
          ...(init?.signal ? [init.signal] : []),
          AbortSignal.timeout(25000),
        ]),
      }),
  });
  let connected = false;
  try {
    await client.connect(transport);
    connected = true;
    return await operation(client);
  } finally {
    if (connected) {
      try {
        await transport.terminateSession();
      } catch {
        // A completed hosted request can close the MCP session first.
      }
      await client.close();
    }
  }
}

function decodeLogs(logs, decimals) {
  if (!Array.isArray(logs)) throw new Error("get_logs returned a non-array result");
  return logs.filter((log) => !log.removed).map((log) => decodeTransferLog(log, decimals));
}

export async function startMonitor() {
  return withClient(async (client) => {
    const { tools } = await client.listTools();
    const available = new Set(tools.map((tool) => tool.name));
    const missing = REQUIRED_TOOLS.filter((tool) => !available.has(tool));
    if (missing.length) throw new Error(`Pharos MCP is missing: ${missing.join(", ")}`);

    const [chain, latestResult] = await Promise.all([
      callJson(client, "get_chain_info"),
      callJson(client, "get_block_number"),
    ]);
    if (chain.chainId !== 1672) {
      throw new Error(`Expected Pharos chain ID 1672, received ${chain.chainId}`);
    }
    const latest = parseBlock(latestResult.blockNumber, "latest block");
    const decimalsResult = await callJson(client, "eth_call", {
      transaction: { to: CONTRACT, data: DECIMALS_SELECTOR },
      block: latest.toString(),
    });
    const decimals = decodeDecimals(decimalsResult.result);
    const historyFrom = latest >= HISTORICAL_BLOCKS - 1n ? latest - HISTORICAL_BLOCKS + 1n : 0n;
    const historyRaw = await callJson(client, "get_logs", {
      address: CONTRACT,
      topics: [TRANSFER_TOPIC],
      fromBlock: historyFrom.toString(),
      toBlock: latest.toString(),
    });

    return {
      network: chain.name,
      chainId: chain.chainId,
      contract: CONTRACT,
      eventSignature: "Transfer(address,address,uint256)",
      eventTopic: TRANSFER_TOPIC,
      decimals,
      startedAt: new Date().toISOString(),
      startBlock: (latest + 1n).toString(),
      lastProcessedBlock: latest.toString(),
      historicalRange: { from: historyFrom.toString(), to: latest.toString() },
      historicalEvents: decodeLogs(historyRaw, decimals),
      mcpEndpoint: MCP_URL,
      pollingSeconds: 8,
      maxBlocksPerQuery: 1000,
    };
  });
}

export async function pollMonitor(fromBlock, decimals) {
  const from = parseBlock(fromBlock, "fromBlock");
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
    throw new Error("decimals must be an integer from 0 to 255");
  }
  return withClient(async (client) => {
    const latestResult = await callJson(client, "get_block_number");
    const latest = parseBlock(latestResult.blockNumber, "latest block");
    const range = nextRange(from, latest);
    if (!range) {
      return {
        latestBlock: latest.toString(),
        processedFrom: null,
        processedTo: (from - 1n).toString(),
        events: [],
        checkedAt: new Date().toISOString(),
      };
    }
    const raw = await callJson(client, "get_logs", {
      address: CONTRACT,
      topics: [TRANSFER_TOPIC],
      fromBlock: range.from.toString(),
      toBlock: range.to.toString(),
    });
    return {
      latestBlock: latest.toString(),
      processedFrom: range.from.toString(),
      processedTo: range.to.toString(),
      events: decodeLogs(raw, decimals),
      checkedAt: new Date().toISOString(),
    };
  });
}

