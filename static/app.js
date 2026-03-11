const state = {
  lastMessageId: 0,
  terminalLines: [],
  cards: [],
  cardRuntimeById: {},
  settings: null,
  cardViewById: {},
  cardHistoryById: {},
  currentPresetName: "",
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
    tx: "#9de4b8",
  },
  terminalFont: {
    family: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
    size: 13,
  },
};

const BRAND_SUBTITLE_KEY = "neo_uart_brand_subtitle_v1";

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
  customPort: document.getElementById("customPort"),
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
  cardType: document.getElementById("cardType"),
  cardUnit: document.getElementById("cardUnit"),
  cardColor: document.getElementById("cardColor"),
  createCardBtn: document.getElementById("createCardBtn"),
  cardsList: document.getElementById("cardsList"),
  presetName: document.getElementById("presetName"),
  savePresetBtn: document.getElementById("savePresetBtn"),
  presetSelect: document.getElementById("presetSelect"),
  loadPresetBtn: document.getElementById("loadPresetBtn"),
  currentPresetLabel: document.getElementById("currentPresetLabel"),
  colorLetter: document.getElementById("colorLetter"),
  colorDigit: document.getElementById("colorDigit"),
  colorPunct: document.getElementById("colorPunct"),
  colorTx: document.getElementById("colorTx"),
  fontFamily: document.getElementById("fontFamily"),
  fontSize: document.getElementById("fontSize"),
  brandSubtitle: document.getElementById("brandSubtitle"),
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
        tx: normalizeHexColor(parsed?.terminalColors?.tx, DEFAULT_SETTINGS.terminalColors.tx),
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
  root.style.setProperty("--term-tx", settings.terminalColors.tx);
  root.style.setProperty("--term-font", settings.terminalFont.family);
  root.style.setProperty("--term-font-size", `${settings.terminalFont.size}px`);

  if (el.colorLetter) el.colorLetter.value = settings.terminalColors.letter;
  if (el.colorDigit) el.colorDigit.value = settings.terminalColors.digit;
  if (el.colorPunct) el.colorPunct.value = settings.terminalColors.punct;
  if (el.colorTx) el.colorTx.value = settings.terminalColors.tx;
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
      const content =
        line.direction === "tx" ? escapeHtml(line.content) : formatTerminalContent(line.content);
      return `<div class="line line-${line.direction}"><span class="content">${content}</span></div>`;
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
  const manualPort = el.customPort?.value.trim();
  const selectedPort = el.portSelect.value;
  const port = manualPort || selectedPort;
  if (!port) {
    alert("请先选择或输入可用串口");
    return;
  }
  await api("/api/serial/connect", {
    method: "POST",
    body: JSON.stringify({
      port,
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
  const appendNewline = el.appendNewline.checked && el.sendMode.value === "text";
  await api("/api/serial/send", {
    method: "POST",
    body: JSON.stringify({
      payload,
      mode: el.sendMode.value,
      append_newline: el.appendNewline.checked,
    }),
  });
  addLocalLine("tx", appendNewline ? `${payload}\n` : payload);
  el.sendInput.value = "";
}

function cardTemplate(item, runtime) {
  const isBoolean = item.type === "boolean";
  const hasBooleanValue = typeof runtime?.latest_value === "string" && runtime.latest_value.trim() !== "";
  const booleanValue = hasBooleanValue ? runtime.latest_value.trim().toLowerCase() : "";
  const isUnknown = booleanValue === "unknown";
  const isTrue = booleanValue === "true" || booleanValue === "on" || booleanValue === "1" || booleanValue === "yes";
  const isFalse = booleanValue === "false" || booleanValue === "off" || booleanValue === "0" || booleanValue === "no";
  const valueText = isBoolean
    ? runtime?.matched
      ? isUnknown
        ? "不匹配"
        : isFalse
          ? "FALSE"
          : "TRUE"
      : "FALSE"
    : runtime?.matched
      ? String(runtime.latest_value)
      : "--";
  const unitText = !isBoolean && item.unit ? ` ${item.unit}` : "";
  const runtimeAt = runtime?.matched_at ? new Date(`${runtime.matched_at}Z`).toLocaleTimeString() : "--:--:--";
  //const runtimeAt = runtime?.matched_at ? new Date(runtime.matched_at).toLocaleTimeString() : "--:--:--"; 
  const patternError = runtime?.pattern_error
    ? `<div class="card-meta">Pattern Error: ${escapeHtml(runtime.pattern_error)}</div>`
    : "";
  const view = isBoolean ? "value" : state.cardViewById[item.id] || "value";
  const history = state.cardHistoryById[item.id] || [];
  const chartSvg = view === "chart" ? renderSparklineSvg(history) : "";
  const valueClass = isBoolean
    ? isUnknown
      ? "metric-value boolean-unknown"
      : !runtime?.matched || isFalse
        ? "metric-value boolean-false"
        : "metric-value"
    : "metric-value";

  return `<article class="card-item metric-card" style="--card-accent:${escapeHtml(item.color || "#0e7a68")};">
    <div class="card-head">
      ${
        isBoolean
          ? ""
          : `<button type="button" class="card-toggle" data-action="toggleView" data-id="${item.id}" title="切换显示">↔</button>`
      }
      <h4 class="metric-title">${escapeHtml(item.name)}</h4>
    </div>
    ${
      view === "value"
        ? `<div class="${valueClass}">${escapeHtml(valueText)}<span class="metric-unit">${escapeHtml(
            unitText
          )}</span></div>`
        : `<div class="metric-chart">
            ${chartSvg}
            <div class="metric-value metric-value-inline">${escapeHtml(valueText)}<span class="metric-unit">${escapeHtml(
              unitText
            )}</span></div>
          </div>`
    }
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

function updateCurrentPresetLabel(name) {
  if (!el.currentPresetLabel) return;
  state.currentPresetName = name || "";
  const label = state.currentPresetName ? `（当前配置：${state.currentPresetName}）` : "（当前配置：未选择）";
  el.currentPresetLabel.textContent = label;
}

async function loadCards() {
  const data = await api("/api/cards");
  state.cards = data.items || [];
  updateCurrentPresetLabel(data.current_name || "");
  renderCards();
}

async function loadPresets() {
  if (!el.presetSelect) return;
  const data = await api("/api/cards/presets");
  const items = data.items || [];
  const previous = state.currentPresetName || el.presetSelect.value || "";
  el.presetSelect.innerHTML = "";
  if (!items.length) {
    const op = document.createElement("option");
    op.value = "";
    op.textContent = "暂无保存配置";
    el.presetSelect.append(op);
    updateCurrentPresetLabel("");
    return;
  }
  items.forEach((item) => {
    const op = document.createElement("option");
    op.value = item.name;
    op.textContent = item.name;
    el.presetSelect.append(op);
  });
  const hasPrevious = previous && Array.from(el.presetSelect.options).some((op) => op.value === previous);
  if (hasPrevious) {
    el.presetSelect.value = previous;
  }
  updateCurrentPresetLabel(state.currentPresetName || el.presetSelect.value || "");
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
  updateCardHistory(runtimeItems);
  renderCards();
}


function updateCardHistory(runtimeItems) {
  const cardById = Object.fromEntries(state.cards.map((card) => [card.id, card]));
  runtimeItems.forEach((item) => {
    if (!item.matched) return;
    const card = cardById[item.card_id];
    if (card?.type === "boolean") return;
    const value = Number.parseFloat(item.latest_value);
    if (!Number.isFinite(value)) return;
    const list = state.cardHistoryById[item.card_id] || [];
    list.push(value);
    if (list.length > 60) list.shift();
    state.cardHistoryById[item.card_id] = list;
  });
}

function renderSparklineSvg(values) {
  const width = 220;
  const height = 70;
  if (!values.length) {
    return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <line x1="0" y1="${height - 1}" x2="${width}" y2="${height - 1}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="rgba(255,255,255,0.35)" font-size="10">暂无数据</text>
    </svg>`;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / Math.max(values.length - 1, 1);
  const points = values
    .map((v, idx) => {
      const x = idx * step;
      const y = height - ((v - min) / span) * (height - 6) - 3;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
    <polyline fill="none" stroke="var(--card-accent)" stroke-width="2" points="${points}" />
    <circle cx="${((values.length - 1) * step).toFixed(2)}" cy="${(
      height - ((values[values.length - 1] - min) / span) * (height - 6) - 3
    ).toFixed(2)}" r="2.5" fill="var(--card-accent)" />
  </svg>`;
}


async function createCard() {
  const name = el.cardName.value.trim();
  const pattern = el.cardPattern.value.trim();
  const type = el.cardType?.value || "numeric";
  const unit = type === "boolean" ? "" : el.cardUnit.value.trim();
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
      type,
      unit,
      color,
      enabled: true,
    }),
  });

  el.cardName.value = "";
  el.cardPattern.value = "";
  el.cardUnit.value = "";
  el.cardColor.value = "#0e7a68";
  if (el.cardType) el.cardType.value = "numeric";
  await loadCards();
  await refreshCardRuntime();
}

async function savePreset() {
  const inputName = el.presetName?.value.trim() || "";
  const name = inputName || state.currentPresetName;
  if (!name) {
    alert("请输入配置名称");
    return;
  }
  const existingNames = Array.from(el.presetSelect?.options || []).map((op) => op.value).filter(Boolean);
  if (existingNames.includes(name)) {
    const ok = window.confirm(`配置“${name}”已存在，是否覆盖？`);
    if (!ok) return;
  }
  await api("/api/cards/presets", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  await loadPresets();
  await loadCards();
  if (el.presetSelect) {
    el.presetSelect.value = name;
  }
  updateCurrentPresetLabel(name);
  if (el.presetName) {
    el.presetName.value = "";
  }
}

async function loadPreset() {
  const name = el.presetSelect?.value || "";
  if (!name) return;
  await api("/api/cards/presets/load", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  await loadCards();
  await refreshCardRuntime();
  if (el.presetSelect) {
    el.presetSelect.value = name;
  }
  updateCurrentPresetLabel(name);
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
    return;
  }

  if (action === "toggleView") {
    const card = state.cards.find((item) => item.id === id);
    if (card?.type !== "boolean") {
      state.cardViewById[id] = state.cardViewById[id] === "chart" ? "value" : "chart";
      renderCards();
    }
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
  if (el.savePresetBtn) {
    el.savePresetBtn.addEventListener("click", () => savePreset().catch(handleError));
  }
  if (el.loadPresetBtn) {
    el.loadPresetBtn.addEventListener("click", () => loadPreset().catch(handleError));
  }
  if (el.presetSelect) {
    el.presetSelect.addEventListener("change", () => {
      updateCurrentPresetLabel(el.presetSelect.value || "");
    });
  }
  if (el.cardType && el.cardUnit) {
    const syncCardType = () => {
      const isBoolean = el.cardType.value === "boolean";
      el.cardUnit.disabled = isBoolean;
      if (isBoolean) el.cardUnit.value = "";
    };
    el.cardType.addEventListener("change", syncCardType);
    syncCardType();
  }

  const onColorChange = () => {
    state.settings = {
      ...state.settings,
      terminalColors: {
        letter: normalizeHexColor(el.colorLetter?.value, DEFAULT_SETTINGS.terminalColors.letter),
        digit: normalizeHexColor(el.colorDigit?.value, DEFAULT_SETTINGS.terminalColors.digit),
        punct: normalizeHexColor(el.colorPunct?.value, DEFAULT_SETTINGS.terminalColors.punct),
        tx: normalizeHexColor(el.colorTx?.value, DEFAULT_SETTINGS.terminalColors.tx),
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
  if (el.colorTx) el.colorTx.addEventListener("input", onColorChange);
  if (el.fontFamily) el.fontFamily.addEventListener("change", onFontChange);
  if (el.fontSize) el.fontSize.addEventListener("input", onFontChange);
}

function handleError(err) {
  const message = err?.message || String(err);
  addLocalLine("sys", `错误: ${message}`);
}

function initBrandSubtitle() {
  if (!el.brandSubtitle) return;
  if (window.localStorage) {
    const saved = window.localStorage.getItem(BRAND_SUBTITLE_KEY);
    if (saved && saved.trim()) {
      el.brandSubtitle.textContent = saved.trim();
    }
  }
  const sanitize = () => {
    const text = el.brandSubtitle.textContent?.trim() || "";
    el.brandSubtitle.textContent = text;
    if (window.localStorage) {
      window.localStorage.setItem(BRAND_SUBTITLE_KEY, text);
    }
  };
  el.brandSubtitle.addEventListener("blur", sanitize);
  el.brandSubtitle.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      el.brandSubtitle.blur();
    }
  });
}

async function init() {
  state.settings = loadSettings();
  applySettings(state.settings);
  setupTabs();
  bindEvents();
  initBrandSubtitle();
  await Promise.all([checkHealth(), refreshPorts(), refreshSerialStatus(), loadCards(), loadPresets()]);
  await refreshCardRuntime();
  setInterval(() => pollMessages(), 500);
  setInterval(() => refreshSerialStatus().catch(handleError), 2000);
  setInterval(() => refreshCardRuntime().catch(handleError), 1000);
}

init().catch(handleError);
