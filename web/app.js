"use strict";

const CFG = Object.assign(
  { API_URL: "", REFRESH_SECONDS: 60, REQUEST_TIMEOUT_S: 180, HISTORY_LIMIT: 200 },
  window.APP_CONFIG || {}
);
const API = String(CFG.API_URL || "").replace(/\/+$/, "");

const $ = (id) => document.getElementById(id);
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESC[c]);
const clock = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
const fmtTime = (ts) => {
  const d = new Date(ts);
  return isNaN(d) ? ts : d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
};
const describe = (code, b) => [code ? `HTTP ${code}` : "", b.error, b.detail].filter(Boolean).join(" · ");
const autoNote = () => (CFG.REFRESH_SECONDS > 0 ? ` · auto-refresh ${CFG.REFRESH_SECONDS}s` : "");

let running = false; // a call that takes the backend lock (/pending, /ack*) is in flight
let pending = [];
let tick = null;
let lastRefresh = 0;

// ---------- API ----------

async function api(method, path, timeoutS = CFG.REQUEST_TIMEOUT_S) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutS * 1000);
  try {
    const res = await fetch(API + path, { method, signal: ctrl.signal, cache: "no-store" });
    let body = {};
    try { body = (await res.json()) || {}; } catch { /* not JSON */ }
    return { code: res.status, body };
  } catch (e) {
    const timedOut = e.name === "AbortError";
    return {
      code: 0,
      body: {
        error: timedOut ? "timeout" : "network",
        detail: timedOut ? `No response after ${timeoutS}s` : `Can't reach the API (${e.message})`,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------- UI state ----------

function setStatus(html, cls = "") {
  const el = $("status");
  el.className = `status ${cls}`;
  el.innerHTML = html;
}

function setRunning(label) {
  running = Boolean(label);
  document.body.classList.toggle("running", running);
  document.querySelectorAll("[data-lock]").forEach((b) => (b.disabled = running));
  clearInterval(tick);
  if (running) {
    const t0 = Date.now();
    const draw = () =>
      setStatus(`<span class="spin" aria-hidden="true"></span>${esc(label)}… ${Math.floor((Date.now() - t0) / 1000)}s`, "busy");
    draw();
    tick = setInterval(draw, 1000);
  }
}

// ---------- health ----------

async function loadHealth() {
  const { code, body } = await api("GET", "/health", 10);
  const conn = $("conn");
  $("dry").hidden = !(code === 200 && body.dry_run);
  if (code === 200) {
    const otherBusy = body.busy && !running;
    conn.textContent = otherBusy ? "Busy" : "Online";
    conn.className = `badge ${otherBusy ? "warn" : "ok"}`;
    conn.title = "";
  } else {
    conn.textContent = "Offline";
    conn.className = "badge err";
    conn.title = describe(code, body);
  }
}

// ---------- pending ----------

async function loadPending() {
  if (running) return;
  setRunning("Checking MIR3");
  const { code, body } = await api("GET", "/pending");
  setRunning(null);
  lastRefresh = Date.now();
  if (code === 200) {
    pending = body.pending || [];
    renderPending();
    setStatus(`Updated ${clock()}${autoNote()}`);
  } else if (code === 409) {
    setStatus(`Backend busy with another call · ${clock()}${autoNote()}`, "warn");
  } else {
    setStatus(`Couldn't load pending: ${esc(describe(code, body))} · ${clock()}`, "err");
  }
}

function renderPending() {
  const n = pending.length;
  $("count").textContent = n;
  $("count").classList.toggle("hot", n > 0);
  document.title = n ? `(${n}) MIR3 Ack` : "MIR3 Ack";
  $("pending").innerHTML = n
    ? pending
        .map(
          (p) => `
      <li class="card">
        <div class="body">
          <div class="inc">${esc(p.incident || "No incident #")}</div>
          <div class="title">${esc(p.title)}</div>
          <div class="ids">event ${esc(p.event_hist_id)} · recipient ${esc(p.recipient_hist_id)}</div>
        </div>
        <button class="ack" data-lock data-id="${esc(p.event_hist_id)}"${running ? " disabled" : ""}>Ack</button>
      </li>`
        )
        .join("")
    : `<li class="empty">Nothing pending.</li>`;
}

// ---------- ack ----------

async function ack(id) {
  if (running) return;
  const item = id ? pending.find((p) => p.event_hist_id === id) : null;
  setRunning(id ? `Acking ${item?.incident || "notification"}` : `Acking all (${pending.length})`);
  const { code, body } = await api("POST", id ? `/ack/${encodeURIComponent(id)}` : "/ack-all");
  setRunning(null);
  showResult(code, body);
  if (code === 409) {
    setStatus(`Backend busy with another call · ${clock()}`, "warn");
    return;
  }
  if (!$("tab-history").hidden) loadHistory();
  await loadPending();
}

function miniList(items, withErr = false) {
  if (!items?.length) return "";
  return `<ul class="mini">${items
    .map(
      (i) =>
        `<li><b>${esc(i.incident || "—")}</b> ${esc(i.title)}${withErr && i.error ? `<div class="e">${esc(i.error)}</div>` : ""}</li>`
    )
    .join("")}</ul>`;
}

function showResult(code, b) {
  let cls, head, extra = "";
  if (code === 200 && b.dry_run) {
    cls = "warn";
    head = `Dry run: would ack ${b.would_ack?.length ?? 0}, nothing changed`;
    extra = miniList(b.would_ack);
  } else if (code === 200) {
    cls = "ok";
    head = `Acked ${b.acked?.length ?? 0} of ${b.pending_before ?? 0}${b.duration_s != null ? ` in ${b.duration_s}s` : ""}`;
    extra = miniList(b.acked);
  } else if (code === 409) {
    cls = "warn";
    head = "Busy: another operation is running. Try again shortly.";
  } else if (code === 404) {
    cls = "warn";
    head = "Not pending anymore";
    extra = b.detail ? `<p>${esc(b.detail)}</p>` : "";
  } else {
    cls = "err";
    head = code === 424 || code === 0 ? `Failed: ${b.error || "error"}` : `HTTP ${code}${b.error ? `: ${b.error}` : ""}`;
    extra =
      (b.detail ? `<p>${esc(b.detail)}</p>` : "") +
      (b.failed?.length ? `<h4>Failed (${b.failed.length})</h4>${miniList(b.failed, true)}` : "") +
      (b.acked?.length ? `<h4>Acked (${b.acked.length})</h4>${miniList(b.acked)}` : "");
  }
  const el = $("result");
  el.className = `result ${cls}`;
  el.innerHTML = `<div class="head"><strong>${esc(head)}</strong><button class="x" aria-label="Dismiss" data-dismiss>×</button></div>${extra}`;
  el.hidden = false;
}

// ---------- history ----------

async function loadHistory() {
  const st = $("histStatus");
  st.className = "status busy";
  st.innerHTML = `<span class="spin" aria-hidden="true"></span>Loading…`;
  const { code, body } = await api("GET", `/history?limit=${encodeURIComponent(CFG.HISTORY_LIMIT)}`, 30);
  if (code !== 200) {
    st.className = "status err";
    st.textContent = `Couldn't load history: ${describe(code, body)}`;
    return;
  }
  const items = body.history || [];
  st.className = "status";
  st.textContent = `${items.length} most recent · updated ${clock()}`;
  $("history").innerHTML = items.length
    ? items
        .map(
          (h) => `
      <li class="card">
        <div class="body">
          <div class="row">
            <span class="tag ${h.result === "acked" ? "ok" : "err"}">${esc(h.result)}</span>
            <span class="inc">${esc(h.incident || "No incident #")}</span>
            <time datetime="${esc(h.timestamp)}">${esc(fmtTime(h.timestamp))}</time>
          </div>
          <div class="title">${esc(h.title)}</div>
          ${h.error ? `<div class="e">${esc(h.error)}</div>` : ""}
        </div>
      </li>`
        )
        .join("")
    : `<li class="empty">No acks yet.</li>`;
}

// ---------- wiring ----------

function showTab(name) {
  document.querySelectorAll(".tab").forEach((t) => {
    const on = t.dataset.tab === name;
    t.classList.toggle("active", on);
    t.setAttribute("aria-selected", on);
  });
  $("tab-pending").hidden = name !== "pending";
  $("tab-history").hidden = name !== "history";
  window.history.replaceState(null, "", `#${name}`);
  if (name === "history") loadHistory();
}

function refreshAll() {
  if (running) return;
  loadHealth();
  loadPending();
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  if (b.dataset.tab) showTab(b.dataset.tab);
  else if (b.id === "ackAll") ack(null);
  else if (b.id === "refresh") refreshAll();
  else if (b.id === "refreshHist") loadHistory();
  else if (b.dataset.id) ack(b.dataset.id);
  else if ("dismiss" in b.dataset) $("result").hidden = true;
});

if (CFG.REFRESH_SECONDS > 0) {
  const due = () => !document.hidden && Date.now() - lastRefresh >= CFG.REFRESH_SECONDS * 1000 - 500;
  setInterval(() => due() && refreshAll(), 5000);
  document.addEventListener("visibilitychange", () => due() && refreshAll());
}

showTab(location.hash === "#history" ? "history" : "pending");
refreshAll();
