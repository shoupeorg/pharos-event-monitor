# Pharos Event Monitor

A read-only web monitor for the Pharos Agent Arena **Event/Log Monitor** task. It watches the ERC-20 `Transfer(address,address,uint256)` event for Pharos mainnet USDC and performs every blockchain read through the official Pharos Chain MCP.

- Demo: `https://pharos-event-monitor.shoupeorg.workers.dev`
- MCP transport: Streamable HTTP
- MCP endpoint: <https://mcp.pharos.xyz/mcp>
- Network: Pharos mainnet (`chainId` 1672)
- Contract: `0xC879C018dB60520F4355C26eD1a6D572cdAC1815`
- Contract source: [PharosNetwork official Token List](https://github.com/PharosNetwork/Token-List/blob/main/tokenlist.json)
- Event topic: `0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef`

No direct RPC client, fallback endpoint, wallet, private key, transaction signing, or mock event is used.

## Install and run

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run check
npm run build
npm run dev
```

Open the local URL printed by Wrangler, then select **Start Monitor**. Select **Stop** to halt polling without clearing the displayed cursor or events.

To deploy to the configured free `workers.dev` route:

```bash
npm run deploy
```

## Deployed demo usage

1. Open the demo URL.
2. Select **Start Monitor**.
3. The app reads USDC decimals and loads a clearly labeled 100-block historical context window.
4. The live cursor starts at the next block. The page polls every eight seconds while active.
5. New confirmed transfers appear under **Caught After Monitor Start**. Earlier logs stay under **Historical Context**.
6. Select **Stop** to stop all new polling.

## MCP tools used

- `get_chain_info` verifies Pharos chain ID 1672 when monitoring starts.
- `get_block_number` identifies the initial cursor and the chain head for every poll.
- `eth_call` reads `decimals()` (`0x313ce567`) through MCP at the initial explicit block.
- `get_logs` filters by the USDC contract and Transfer topic.

Every `get_logs` request is inclusive and covers at most 1,000 blocks. A poll processes only one bounded range, then advances the browser cursor only after the request succeeds. If a temporary failure occurs, the cursor is retained and the same range is retried with backoff. Events are deduplicated by `transactionHash + logIndex`.

Amounts are decoded with `BigInt` and formatted using the MCP-read token decimals, so large integers are never converted to JavaScript `Number`.

## HTTP interface

`POST /api/start` verifies the MCP tools and chain, reads decimals, captures the initial block, and returns the most recent 100 blocks as historical context.

`GET /api/poll?fromBlock=<decimal>&decimals=<integer>` reads the current head and processes the next gap-free range of up to 1,000 blocks. The browser owns the continuous polling cursor and deduplication set.

## Recorded real output

The following is a real read-only monitoring run through `https://mcp.pharos.xyz/mcp` on 2026-10-14. This is not a historical event relabeled as live: the monitoring window was established first, and the captured event's block is greater than the recorded start block.

```text
LIVE_WINDOW
  startedAt:       2026-10-14T16:37:26.219Z
  startBlock:      20237033
  lastProcessed:   20237032

POLL 1
  processed:       20237033–20237055
  events:          0

POLL 2
  processed:       20237056–20237081
  events:          0

POLL 3
  processed:       20237082–20237112
  events:          3

LIVE_CAPTURE
  block:           20237086
  transactionHash: 0x5a42b634317140c30f206e1ff2f7fd8a9c3d3dcb5bf4d11625a1a9bf95a018a8
  logIndex:        0
  from:            0x912c9ade24d44d8922f0866d8dcb079f1363f647
  to:              0x936564245b69f5a293b42cbd752e0ee3bb68b470
  amountRaw:       38851930
  decimals:        6
  amount:          38.85193 USDC
  blockTimestamp:  2026-10-14T16:38:19.000Z
```

The initial bootstrap also returned historical logs, but those are intentionally shown only in the separate **Historical Context** section and are not evidence of a live capture.

## Read-only design

The Worker accepts only monitor-start and poll reads. It has no transaction endpoint, wallet integration, secrets, or fund-transfer code. Static files are served by Cloudflare Workers Assets, and the server-side MCP client connects only to the official Pharos endpoint.

