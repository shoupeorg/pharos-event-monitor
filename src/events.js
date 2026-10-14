export const CONTRACT = "0xC879C018dB60520F4355C26eD1a6D572cdAC1815";
export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
export const MAX_LOG_BLOCKS = 1000n;

export function parseBlock(value, label = "block") {
  if (typeof value === "bigint") {
    if (value < 0n) throw new Error(`${label} is not a block number`);
    return value;
  }
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(`${label} is not a block number`);
  }
  const text = String(value);
  if (!/^(0x[0-9a-f]+|[0-9]+)$/i.test(text)) {
    throw new Error(`${label} is not a block number`);
  }
  return BigInt(text);
}

export function formatUnits(value, decimals) {
  const amount = typeof value === "bigint" ? value : BigInt(value);
  const base = 10n ** BigInt(decimals);
  const whole = amount / base;
  const remainder = amount % base;
  if (remainder === 0n) return whole.toString();
  const fraction = remainder
    .toString()
    .padStart(decimals, "0")
    .replace(/0+$/, "");
  return `${whole}.${fraction}`;
}

function requireHex(value, label, length) {
  if (typeof value !== "string" || !/^0x[0-9a-f]*$/i.test(value)) {
    throw new Error(`${label} is not valid hex`);
  }
  if (length && value.length !== length) {
    throw new Error(`${label} has an unexpected length`);
  }
  return value.toLowerCase();
}

function topicAddress(topic, label) {
  const value = requireHex(topic, label, 66);
  return `0x${value.slice(-40)}`;
}

export function decodeTransferLog(log, decimals) {
  if (!log || !Array.isArray(log.topics) || log.topics.length < 3) {
    throw new Error("Transfer log is missing indexed topics");
  }
  if (requireHex(log.topics[0], "event topic", 66) !== TRANSFER_TOPIC) {
    throw new Error("Log does not match Transfer(address,address,uint256)");
  }
  const data = requireHex(log.data, "event data");
  if (data.length !== 66) throw new Error("Transfer amount is not one ABI word");
  const amountRaw = BigInt(data);
  const block = parseBlock(log.blockNumber, "log block").toString();
  const logIndex = parseBlock(log.logIndex, "log index").toString();
  const transactionHash = requireHex(log.transactionHash, "transaction hash", 66);
  return {
    id: `${transactionHash}:${logIndex}`,
    from: topicAddress(log.topics[1], "from topic"),
    to: topicAddress(log.topics[2], "to topic"),
    amount: formatUnits(amountRaw, decimals),
    amountRaw: amountRaw.toString(),
    transactionHash,
    logIndex,
    block,
    timestamp:
      log.blockTimestamp == null
        ? null
        : new Date(Number(parseBlock(log.blockTimestamp)) * 1000).toISOString(),
  };
}

export function nextRange(fromBlock, latestBlock) {
  const from = parseBlock(fromBlock, "fromBlock");
  const latest = parseBlock(latestBlock, "latest block");
  if (latest < from) return null;
  const to = from + MAX_LOG_BLOCKS - 1n;
  return { from, to: to < latest ? to : latest };
}
