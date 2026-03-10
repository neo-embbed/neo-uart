const state = {
  lastMessageId: 0,
  terminalLines: [],
  cards: [],
  cardRuntimeById: {},
  settings: null,
};

const SETTINGS_KEY = "neo_uart_settings_v1";
const FONT_FAMILY_OPTIONS = new Set([
  '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
  '"Cascadia Code", Consolas, monospace',
  'Consolas, "Cascadia Code", monospace',
  '"Source Code Pro", "Cascadia Code", Consolas, monospace',
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
]);
const DEFAULT_SETTINGS = {
  terminalColors: {
    letter: "#d8e8fb",
    digit: "#f4c780",
    punct: "#9de4b8",
  },
  terminalFont: {
    family: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
    size: 13,
  },
};

const API_BASE = (() => {
  const customBase = window.NEO_API_BASE;
  if (typeof customBase === "string" && customBase.trim()) {
    return customBase.replace(/\/+$/, "");
  }
  if (window.location.protocol === "file:") {
    return "http://127.0.0.1:8000";
  }
  return window.location.port === "8000" ? "" : "http://127.0.0.1:8000";
})();

const el = {
  healthBadge: document.getElementById("healthBadge"),
  tabs: document.querySelectorAll(".tab"),
  pages: document.querySelectorAll(".tab-page"),
  portSelect: document.getElementById("portSelect"),
  baudrate: document.getElementById("baudrate"),
  serialStatus: document.getElementById("serialStatus"),
  terminal: document.getElementById("terminal"),
  sendInput: document.getElementById("sendInput"),
  sendMode: document.getElementById("sendMode"),
  appendNewline: document.getElementById("appendNewline"),
  refreshPortsBtn: document.getElementById("refreshPortsBtn"),
  connectBtn: document.getElementById("connectBtn"),
  disconnectBtn: document.getElementById("disconnectBtn"),
  sendBtn: document.getElementById("sendBtn"),
  clearTerminalBtn: document.getElementById("clearTerminalBtn"),
  cardName: document.getElementById("cardName"),
  cardPattern: document.getElementById("cardPattern"),
  cardUnit: document.getElementById("cardUnit"),
  cardColor: document.getElementById("cardColor"),
  createCardBtn: document.getElementById("createCardBtn"),
  cardsList: document.getElementById("cardsList"),
  colorLetter: document.getElementById("colorLetter"),
  colorDigit: document.getElementById("colorDigit"),
  colorPunct: document.getElementById("colorPunct"),
  fontFamily: document.getElementById("fontFamily"),
  fontSize: document.getElementById("fontSize"),
};

function setupTabs() {
  el.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const current = tab.dataset.tab;
      el.tabs.forEach((t) => t.classList.toggle("active", t === tab));
      el.pages.forEach((p) => p.classList.toggle("active", p.id === current));
    });
  });
}

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Request failed");
  }
  const contentType = res.headers.get("content-type") || "";
  return contentType.includes("application/json") ? res.json() : {};
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeHexColor(value, fallback) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : fallback;
}

function normalizeFontFamily(value, fallback) {
  if (typeof value !== "string") return fallback;
  return FONT_FAMILY_OPTIONS.has(value) ? value : fallback;
}

function normalizeFontSize(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(24, Math.max(10, parsed));
}

function loadSettings() {
  if (!window.localStorage) {
    return {
      terminalColors: { ...DEFAULT_SETTINGS.terminalColors },
      terminalFont: { ...DEFAULT_SETTINGS.terminalFont },
    };
  }
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return {
        terminalColors: { ...DEFAULT_SETTINGS.terminalColors },
        terminalFont: { ...DEFAULT_SETTINGS.terminalFont },
      };
    }
    const parsed = JSON.parse(raw);
    return {
      terminalColors: {
        letter: normalizeHexColor(parsed?.terminalColors?.letter, DEFAULT_SETTINGS.terminalColors.letter),
        digit: normalizeHexColor(parsed?.terminalColors?.digit, DEFAULT_SETTINGS.terminalColors.digit),
        punct: normalizeHexColor(parsed?.terminalColors?.punct, DEFAULT_SETTINGS.terminalColors.punct),
      },
      terminalFont: {
        family: normalizeFontFamily(parsed?.terminalFont?.family, DEFAULT_SETTINGS.terminalFont.family),
        size: normalizeFontSize(parsed?.terminalFont?.size, DEFAULT_SETTINGS.terminalFont.size),
      },
    };
  } catch {
    return {
      terminalColors: { ...DEFAULT_SETTINGS.terminalColors },
      terminalFont: { ...DEFAULT_SETTINGS.terminalFont },
    };
  }
}

function saveSettings(settings) {
  if (!window.localStorage) return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function applySettings(settings) {
  if (!settings) return;
  const root = document.documentElement;
  root.style.setProperty("--term-letter", settings.terminalColors.letter);
  root.style.setProperty("--term-digit", settings.terminalColors.digit);
  root.style.setProperty("--term-punct", settings.terminalColors.punct);
  root.style.setProperty("--term-font", settings.terminalFont.family);
  root.style.setProperty("--term-font-size", `${settings.terminalFont.size}px`);

  if (el.colorLetter) el.colorLetter.value = settings.terminalColors.letter;
  if (el.colorDigit) el.colorDigit.value = settings.terminalColors.digit;
  if (el.colorPunct) el.colorPunct.value = settings.terminalColors.punct;
  if (el.fontFamily) el.fontFamily.value = settings.terminalFont.family;
  if (el.fontSize) el.fontSize.value = String(settings.terminalFont.size);
}

function classifyChar(ch) {
  if (/[A-Za-z]/.test(ch)) return "letter";
  if (/[0-9]/.test(ch)) return "digit";
  if (/[\u0021-\u002F\u003A-\u0040\u005B-\u0060\u007B-\u007E]/.test(ch)) return "punct";
  return "";
}

function formatTerminalContent(text) {
  const input = String(text ?? "");
  let result = "";
  let buffer = "";
  let currentType = "";

  const flush = () => {
    if (!buffer) return;
    if (!currentType) {
      result += escapeHtml(buffer);
    } else {
      result += `<span class="token-${currentType}">${escapeHtml(buffer)}</span>`;
    }
    buffer = "";
  };

  for (const ch of input) {
    const type = classifyChar(ch);
    if (type !== currentType) {
      flush();
      currentType = type;
    }
    buffer += ch;
  }
  flush();
  return result;
}

function addLocalLine(direction, content) {
  const ts = new Date().toISOString();
  //state.terminalLines.push({ id: Date.now(), ts, direction, content });
  state.terminalLines.push({content });
  if (state.terminalLines.length > 3000) state.terminalLines.shift();
  renderTerminal();
}

function renderTerminal() {
  const lines = state.terminalLines
    .map((line) => {
      return `<div class="line line-${line.direction}"><span class="content">${formatTerminalContent(
        line.content
      )}</span></div>`;
    })
    .join("");
  el.terminal.innerHTML = lines;
  el.terminal.scrollTop = el.terminal.scrollHeight;
}

async function checkHealth() {
  try {
    await api("/api/health");
    el.healthBadge.textContent = "API Online";
    el.healthBadge.style.background = "#205d52";
  } catch {
    el.healthBadge.textContent = "API Offline";
    el.healthBadge.style.background = "#8f341f";
  }
}

async function refreshPorts() {
  const data = await api("/api/serial/ports");
  const ports = data.items || [];
  el.portSelect.innerHTML = "";
  if (!ports.length) {
    const op = document.createElement("option");
    op.value = "";
    op.textContent = "未发现串口";
    el.portSelect.append(op);
    return;
  }
  ports.forEach((p) => {
    const op = document.createElement("option");
    op.value = p.device;
    op.textContent = `${p.device} ${p.description ? `(${p.description})` : ""}`;
    el.portSelect.append(op);
  });
}

async function refreshSerialStatus() {
  const data = await api("/api/serial/status");
  if (data.connected) {
    el.serialStatus.textContent = `串口已连接 ${data.port} @ ${data.baudrate}`;
    el.serialStatus.style.background = "#205d52";
  } else {
    el.serialStatus.textContent = "串口未连接";
    el.serialStatus.style.background = "#8f341f";
  }
}

async function connectSerial() {
  if (!el.portSelect.value) {
    alert("请先选择可用串口");
    return;
  }
  await api("/api/serial/connect", {
    method: "POST",
    body: JSON.stringify({
      port: el.portSelect.value,
      baudrate: Number(el.baudrate.value),
      bytesize: 8,
      parity: "N",
      stopbits: 1,
      timeout: 0.1,
    }),
  });
  await refreshSerialStatus();
}

async function disconnectSerial() {
  await api("/api/serial/disconnect", { method: "POST" });
  await refreshSerialStatus();
}

async function sendPayload() {
  const payload = el.sendInput.value.trim();
  if (!payload) return;
  await api("/api/serial/send", {
    method: "POST",
    body: JSON.stringify({
      payload,
      mode: el.sendMode.value,
      append_newline: el.appendNewline.checked,
    }),
  });
  el.sendInput.value = "";
}

function cardTemplate(item, runtime) {
  const valueText = runtime?.matched ? String(runtime.latest_value) : "--";
  const unitText = item.unit ? ` ${item.unit}` : "";
  const runtimeAt = runtime?.matched_at ? new Date(runtime.matched_at).toLocaleTimeString() : "--:--:--";
  const patternError = runtime?.pattern_error
    ? `<div class="card-meta">Pattern Error: ${escapeHtml(runtime.pattern_error)}</div>`
    : "";

  return `<article class="card-item metric-card" style="--card-accent:${escapeHtml(item.color || "#0e7a68")};">
    <h4 class="metric-title">${escapeHtml(item.name)}</h4>
    <div class="metric-value">${escapeHtml(valueText)}<span class="metric-unit">${escapeHtml(unitText)}</span></div>
    <div class="metric-foot">更新时间 ${runtimeAt}</div>
    <div class="card-meta">规则: ${escapeHtml(item.pattern)}</div>
    ${patternError}
    <div class="card-actions card-actions-metric">
      <button type="button" data-action="toggle" data-id="${item.id}">${item.enabled ? "禁用" : "启用"}</button>
      <button type="button" class="btn-danger" data-action="delete" data-id="${item.id}">删除</button>
    </div>
  </article>`;
}

function renderCards() {
  if (!state.cards.length) {
    el.cardsList.innerHTML = "<p>暂无卡片，可先创建匹配规则。</p>";
    return;
  }
  el.cardsList.innerHTML = state.cards
    .map((item) => cardTemplate(item, state.cardRuntimeById[item.id]))
    .join("");
}

async function loadCards() {
  const data = await api("/api/cards");
  state.cards = data.items || [];
  renderCards();
}

async function refreshCardRuntime() {
  if (!state.cards.length) {
    state.cardRuntimeById = {};
    renderCards();
    return;
  }
  const data = await api("/api/cards/runtime");
  const runtimeItems = data.items || [];
  state.cardRuntimeById = Object.fromEntries(runtimeItems.map((item) => [item.card_id, item]));
  renderCards();
}

async function createCard() {
  const name = el.cardName.value.trim();
  const pattern = el.cardPattern.value.trim();
  const unit = el.cardUnit.value.trim();
  const color = el.cardColor.value || "#0e7a68";

  if (!name || !pattern) {
    alert("卡片名称和匹配规则不能为空");
    return;
  }

  await api("/api/cards", {
    method: "POST",
    body: JSON.stringify({
      name,
      pattern,
      unit,
      color,
      enabled: true,
    }),
  });

  el.cardName.value = "";
  el.cardPattern.value = "";
  el.cardUnit.value = "";
  el.cardColor.value = "#0e7a68";
  await loadCards();
  await refreshCardRuntime();
}

async function onCardsListClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const action = target.dataset.action;
  const id = Number(target.dataset.id || 0);
  if (!action || !id) return;

  //event.preventDefault();
  //event.stopPropagation();

  if (action === "delete") {
    await api(`/api/cards/${id}`, { method: "DELETE" });
    await loadCards();
    await refreshCardRuntime();
    return;
  }

  if (action === "toggle") {
    const enabled = target.textContent === "启用";
    await api(`/api/cards/${id}`, {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    });
    await loadCards();
    await refreshCardRuntime();
  }
}

async function pollMessages() {
  try {
    const data = await api(`/api/serial/messages?after_id=${state.lastMessageId}&limit=200`);
    const items = data.items || [];
    if (!items.length) return;
    items.forEach((m) => {
      state.lastMessageId = Math.max(state.lastMessageId, m.id);
      state.terminalLines.push(m);
    });
    if (state.terminalLines.length > 3000) {
      state.terminalLines = state.terminalLines.slice(-3000);
    }
    renderTerminal();
    await refreshCardRuntime();
  } catch (err) {
    addLocalLine("sys", `轮询失败: ${err.message || err}`);
  }
}

function bindEvents() {
  el.refreshPortsBtn.addEventListener("click", () => refreshPorts().catch(handleError));
  el.connectBtn.addEventListener("click", () => connectSerial().catch(handleError));
  el.disconnectBtn.addEventListener("click", () => disconnectSerial().catch(handleError));
  el.sendBtn.addEventListener("click", () => sendPayload().catch(handleError));
  el.clearTerminalBtn.addEventListener("click", () => {
    state.terminalLines = [];
    renderTerminal();
  });
  el.createCardBtn.addEventListener("click", () => createCard().catch(handleError));
  el.cardsList.addEventListener("click", (ev) => onCardsListClick(ev).catch(handleError));

  const onColorChange = () => {
    state.settings = {
      ...state.settings,
      terminalColors: {
        letter: normalizeHexColor(el.colorLetter?.value, DEFAULT_SETTINGS.terminalColors.letter),
        digit: normalizeHexColor(el.colorDigit?.value, DEFAULT_SETTINGS.terminalColors.digit),
        punct: normalizeHexColor(el.colorPunct?.value, DEFAULT_SETTINGS.terminalColors.punct),
      },
    };
    applySettings(state.settings);
    saveSettings(state.settings);
    renderTerminal();
  };

  const onFontChange = () => {
    state.settings = {
      ...state.settings,
      terminalFont: {
        family: normalizeFontFamily(el.fontFamily?.value, DEFAULT_SETTINGS.terminalFont.family),
        size: normalizeFontSize(el.fontSize?.value, DEFAULT_SETTINGS.terminalFont.size),
      },
    };
    applySettings(state.settings);
    saveSettings(state.settings);
    renderTerminal();
  };

  if (el.colorLetter) el.colorLetter.addEventListener("input", onColorChange);
  if (el.colorDigit) el.colorDigit.addEventListener("input", onColorChange);
  if (el.colorPunct) el.colorPunct.addEventListener("input", onColorChange);
  if (el.fontFamily) el.fontFamily.addEventListener("change", onFontChange);
  if (el.fontSize) el.fontSize.addEventListener("input", onFontChange);
}

function handleError(err) {
  const message = err?.message || String(err);
  addLocalLine("sys", `错误: ${message}`);
}

async function init() {
  state.settings = loadSettings();
  applySettings(state.settings);
  setupTabs();
  bindEvents();
  await Promise.all([checkHealth(), refreshPorts(), refreshSerialStatus(), loadCards()]);
  await refreshCardRuntime();
  setInterval(() => pollMessages(), 500);
  setInterval(() => refreshSerialStatus().catch(handleError), 2000);
  setInterval(() => refreshCardRuntime().catch(handleError), 1000);
}

init().catch(handleError);
