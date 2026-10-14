import test from "node:test";
import assert from "node:assert/strict";

import {
  TRANSFER_TOPIC,
  decodeTransferLog,
  formatUnits,
  nextRange,
} from "../src/events.js";

test("formats token amounts without Number precision loss", () => {
  assert.equal(formatUnits(22769527208781n, 6), "22769527.208781");
  assert.equal(formatUnits(1000000n, 6), "1");
});

test("caps each log query to 1000 inclusive blocks", () => {
  const range = nextRange("5000", "9000");
  assert.deepEqual(range, { from: 5000n, to: 5999n });
  assert.deepEqual(nextRange(5000n, 5001n), { from: 5000n, to: 5001n });
  assert.equal(nextRange("10", "9"), null);
});

test("decodes a real-shaped ERC-20 Transfer log", () => {
  const decoded = decodeTransferLog(
    {
      blockNumber: "0x134c908",
      logIndex: "0x1",
      transactionHash: "0x17ab653179f380168ea42d925b7ad6ec42051d532fdec899689373017dc5c96d",
      blockTimestamp: "0x6acfadb6",
      data: "0x00000000000000000000000000000000000000000000000000000000037701e3",
      topics: [
        TRANSFER_TOPIC,
        "0x0000000000000000000000001f3546a29eec2102c8d52e21a45114124014c85c",
        "0x000000000000000000000000912c9ade24d44d8922f0866d8dcb079f1363f647",
      ],
    },
    6,
  );
  assert.equal(decoded.block, "20236552");
  assert.equal(decoded.amount, "58.130915");
  assert.equal(decoded.logIndex, "1");
  assert.equal(decoded.from, "0x1f3546a29eec2102c8d52e21a45114124014c85c");
});
