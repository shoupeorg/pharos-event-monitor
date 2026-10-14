'use strict';

const startButton = document.querySelector('#start');
const stopButton = document.querySelector('#stop');
const connection = document.querySelector('#connection');
const lastBlock = document.querySelector('#last-block');
const chainHead = document.querySelector('#chain-head');
const decimalsNode = document.querySelector('#decimals');
const systemStatus = document.querySelector('#system-status');
const retryStatus = document.querySelector('#retry-status');
const eventCount = document.querySelector('#event-count');
const liveRange = document.querySelector('#live-range');
const historyRange = document.querySelector('#history-range');
const liveList = document.querySelector('#live-events');
const historyList = document.querySelector('#history-events');

const state = {
  active: false,
  timer: null,
  request: null,
  decimals: null,
  startBlock: null,
  lastProcessed: null,
  retryMs: 8000,
  seen: new Set(),
  live: [],
  historical: [],
};

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);

function shortHash(value) {
  return `${value.slice(0, 10)}…${value.slice(-8)}`;
}

function setConnection(label, mode) {
  connection.textContent = label;
  connection.dataset.state = mode;
  systemStatus.textContent = label === 'LIVE' ? 'MONITOR ACTIVE' : `SYSTEM ${label}`;
}

function eventCard(event, kind) {
  const when = event.timestamp ? event.timestamp.replace('T', ' ').replace('.000Z', ' UTC') : 'timestamp unavailable';
  return `<article class="event-card ${kind}">
    <div class="event-top"><span>${kind === 'live' ? 'LIVE CAPTURE' : 'HISTORICAL'}</span><b>BLOCK ${escapeHtml(event.block)}</b></div>
    <div class="amount"><span>AMOUNT</span><strong>${escapeHtml(event.amount)} <i>USDC</i></strong></div>
    <dl>
      <div><dt>FROM</dt><dd title="${escapeHtml(event.from)}">${escapeHtml(event.from)}</dd></div>
      <div><dt>TO</dt><dd title="${escapeHtml(event.to)}">${escapeHtml(event.to)}</dd></div>
      <div><dt>TX HASH</dt><dd title="${escapeHtml(event.transactionHash)}">${escapeHtml(shortHash(event.transactionHash))}</dd></div>
      <div><dt>LOG INDEX</dt><dd>${escapeHtml(event.logIndex)}</dd></div>
    </dl>
    <p>${escapeHtml(when)}</p>
  </article>`;
}

function render() {
  eventCount.textContent = `${state.live.length + state.historical.length} EVENTS`;
  liveList.innerHTML = state.live.length
    ? state.live.map((event) => eventCard(event, 'live')).join('')
    : '<div class="empty-state"><strong>NO LIVE EVENTS CAPTURED</strong><span>New matching logs will appear here while monitoring is active.</span></div>';
  historyList.innerHTML = state.historical.length
    ? state.historical.map((event) => eventCard(event, 'historical')).join('')
    : '<div class="empty-state"><strong>NO HISTORICAL EVENTS IN RANGE</strong><span>The initial range contained no matching Transfer logs.</span></div>';
}

function addEvents(events, kind) {
  for (const event of events) {
    const key = `${event.transactionHash.toLowerCase()}:${event.logIndex}`;
    if (state.seen.has(key)) continue;
    state.seen.add(key);
    state[kind].unshift(event);
  }
  state[kind] = state[kind].slice(0, 100);
  render();
}

function schedule(delay) {
  clearTimeout(state.timer);
  if (state.active) state.timer = setTimeout(poll, delay);
}

async function readJson(url, options = {}) {
  state.request = new AbortController();
  const signal = AbortSignal.any([state.request.signal, AbortSignal.timeout(70000)]);
  const response = await fetch(url, { ...options, signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}

async function poll() {
  if (!state.active) return;
  setConnection('POLLING', 'polling');
  retryStatus.textContent = `QUERY FROM ${state.lastProcessed + 1n}`;
  try {
    const fromBlock = (state.lastProcessed + 1n).toString();
    const data = await readJson(`/api/poll?fromBlock=${fromBlock}&decimals=${state.decimals}`);
    if (!state.active) return;
    chainHead.textContent = data.latestBlock;
    if (data.processedFrom !== null) state.lastProcessed = BigInt(data.processedTo);
    lastBlock.textContent = state.lastProcessed.toString();
    addEvents(data.events.filter((event) => BigInt(event.block) >= state.startBlock), 'live');
    state.retryMs = 8000;
    setConnection('LIVE', 'live');
    retryStatus.textContent = 'CURSOR SAFE · NEXT POLL 8S';
    schedule(8000);
  } catch (error) {
    if (!state.active || error.name === 'AbortError') return;
    setConnection('RETRYING', 'error');
    retryStatus.textContent = `CURSOR HELD · RETRY ${state.retryMs / 1000}S`;
    console.warn('Poll failed; cursor was not advanced:', error);
    schedule(state.retryMs);
    state.retryMs = Math.min(state.retryMs * 2, 32000);
  }
}

async function start() {
  stop(false);
  state.seen.clear();
  state.live = [];
  state.historical = [];
  render();
  startButton.disabled = true;
  startButton.textContent = 'CONNECTING…';
  setConnection('CONNECTING', 'polling');
  retryStatus.textContent = 'OPENING MCP SESSION';
  try {
    const data = await readJson('/api/start', { method: 'POST' });
    state.decimals = data.decimals;
    state.startBlock = BigInt(data.startBlock);
    state.lastProcessed = BigInt(data.lastProcessedBlock);
    state.active = true;
    decimalsNode.textContent = data.decimals;
    lastBlock.textContent = data.lastProcessedBlock;
    chainHead.textContent = data.lastProcessedBlock;
    liveRange.textContent = `LIVE FROM BLOCK ${data.startBlock}`;
    historyRange.textContent = `BLOCKS ${data.historicalRange.from}–${data.historicalRange.to}`;
    addEvents(data.historicalEvents, 'historical');
    startButton.textContent = 'MONITORING';
    stopButton.disabled = false;
    setConnection('LIVE', 'live');
    retryStatus.textContent = 'CURSOR SAFE · NEXT POLL NOW';
    schedule(0);
  } catch (error) {
    setConnection('FAILED', 'error');
    retryStatus.textContent = error.message.toUpperCase().slice(0, 70);
    startButton.disabled = false;
    startButton.textContent = 'START MONITOR →';
  }
}

function stop(updateLabel = true) {
  state.active = false;
  clearTimeout(state.timer);
  state.timer = null;
  state.request?.abort();
  state.request = null;
  startButton.disabled = false;
  startButton.textContent = 'START MONITOR →';
  stopButton.disabled = true;
  if (updateLabel) {
    setConnection('STOPPED', 'idle');
    retryStatus.textContent = 'CURSOR RETAINED · NO POLLING';
  }
}

startButton.addEventListener('click', start);
stopButton.addEventListener('click', () => stop(true));
window.addEventListener('beforeunload', () => stop(false));

