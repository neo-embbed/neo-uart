const state = {
  lastMessageId: 0,
  terminalLines: [],
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
  cardDescription: document.getElementById("cardDescription"),
  createCardBtn: document.getElementById("createCardBtn"),
  cardsList: document.getElementById("cardsList"),
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

function addLocalLine(direction, content) {
  const ts = new Date().toISOString();
  state.terminalLines.push({ id: Date.now(), ts, direction, content });
  if (state.terminalLines.length > 3000) state.terminalLines.shift();
  renderTerminal();
}

function renderTerminal() {
  const lines = state.terminalLines
    .map((line) => {
      return `<div class="line line-${line.direction}">
        <span class="ts">[${new Date(line.ts).toLocaleTimeString()}]</span>
        <span class="content">${escapeHtml(line.content)}</span>
      </div>`;
    })
    .join("");
  el.terminal.innerHTML = lines;
  el.terminal.scrollTop = el.terminal.scrollHeight;
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
    el.serialStatus.textContent = `已连接 ${data.port} @ ${data.baudrate}`;
    el.serialStatus.style.color = "#21693f";
  } else {
    el.serialStatus.textContent = "未连接";
    el.serialStatus.style.color = "#8f341f";
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
  } catch (err) {
    addLocalLine("sys", `轮询失败: ${err.message || err}`);
  }
}

function cardTemplate(item) {
  const enabledText = item.enabled ? "已启用" : "已禁用";
  return `<article class="card-item">
    <h4>${escapeHtml(item.name)}</h4>
    <div class="card-meta">${enabledText}</div>
    <div class="card-meta">规则: ${escapeHtml(item.pattern)}</div>
    <div class="card-meta">${escapeHtml(item.description || "")}</div>
    <div class="card-actions">
      <button data-action="toggle" data-id="${item.id}">${item.enabled ? "禁用" : "启用"}</button>
      <button class="btn-danger" data-action="delete" data-id="${item.id}">删除</button>
    </div>
  </article>`;
}

async function loadCards() {
  const data = await api("/api/cards");
  const items = data.items || [];
  if (!items.length) {
    el.cardsList.innerHTML = "<p>暂无卡片，可先创建基础匹配规则。</p>";
    return;
  }
  el.cardsList.innerHTML = items.map(cardTemplate).join("");
}

async function createCard() {
  const name = el.cardName.value.trim();
  const pattern = el.cardPattern.value.trim();
  const description = el.cardDescription.value.trim();
  if (!name || !pattern) {
    alert("卡片名称和匹配规则不能为空");
    return;
  }
  await api("/api/cards", {
    method: "POST",
    body: JSON.stringify({
      name,
      pattern,
      description,
      enabled: true,
    }),
  });
  el.cardName.value = "";
  el.cardPattern.value = "";
  el.cardDescription.value = "";
  await loadCards();
}

async function onCardsListClick(event) {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  const action = target.dataset.action;
  const id = Number(target.dataset.id || 0);
  if (!action || !id) return;

  if (action === "delete") {
    await api(`/api/cards/${id}`, { method: "DELETE" });
    await loadCards();
    return;
  }

  if (action === "toggle") {
    const enabled = target.textContent === "启用";
    await api(`/api/cards/${id}`, {
      method: "PUT",
      body: JSON.stringify({ enabled }),
    });
    await loadCards();
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
}

function handleError(err) {
  const message = err?.message || String(err);
  addLocalLine("sys", `错误: ${message}`);
}

async function init() {
  setupTabs();
  bindEvents();
  await Promise.all([checkHealth(), refreshPorts(), refreshSerialStatus(), loadCards()]);
  setInterval(() => pollMessages(), 500);
  setInterval(() => refreshSerialStatus().catch(handleError), 2000);
}

init().catch(handleError);
