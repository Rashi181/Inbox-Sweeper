// popup.js
let currentData = [];
let activeCategory = "All";
let activeGroup = null;

const els = {
  statusBar: document.getElementById("status-bar"),
  categoryFilters: document.getElementById("category-filters"),
  list: document.getElementById("newsletter-list"),
  emptyState: document.getElementById("empty-state"),
  listView: document.getElementById("list-view"),
  detailView: document.getElementById("detail-view"),
  refreshBtn: document.getElementById("refresh-btn"),
  scanBtn: document.getElementById("scan-btn"),
  backBtn: document.getElementById("back-btn"),
  unsubscribeBtn: document.getElementById("unsubscribe-btn"),
  detailSenderName: document.getElementById("detail-sender-name"),
  detailSenderMeta: document.getElementById("detail-sender-meta"),
  detailMessageList: document.getElementById("detail-message-list")
};

document.addEventListener("DOMContentLoaded", async () => {
  const cached = await chrome.runtime.sendMessage({ action: "getCached" });
  if (cached.ok && cached.data.newsletters && cached.data.newsletters.length > 0) {
    currentData = cached.data.newsletters;
    renderList();
    setStatus(`Last updated ${timeAgo(cached.data.lastScanned)}`);
  } else {
    els.emptyState.classList.remove("hidden");
  }
});

els.refreshBtn.addEventListener("click", runScan);
els.scanBtn.addEventListener("click", runScan);
els.backBtn.addEventListener("click", showListView);
els.unsubscribeBtn.addEventListener("click", handleUnsubscribeClick);

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "scanProgress") {
    const p = msg.progress;
    if (p.phase === "listing") {
      setStatus(`Finding emails… ${p.found} found`);
    } else if (p.phase === "fetching") {
      setStatus(`Scanning… ${p.processed}/${p.total}`);
    }
  }
});

async function runScan() {
  els.refreshBtn.classList.add("spinning");
  els.emptyState.classList.add("hidden");
  setStatus("Starting scan…");

  const response = await chrome.runtime.sendMessage({ action: "scan" });

  els.refreshBtn.classList.remove("spinning");

  if (!response.ok) {
    setStatus("Scan failed: " + response.error);
    return;
  }

  currentData = response.data;
  activeCategory = "All";
  renderList();
  setStatus(`Last updated just now`);

  if (currentData.length === 0) {
    els.emptyState.classList.remove("hidden");
  }
}

function getCategories() {
  const cats = new Set(currentData.map((g) => g.category));
  return ["All", ...Array.from(cats).sort()];
}

function renderList() {
  renderCategoryFilters();
  els.list.innerHTML = "";

  const filtered =
    activeCategory === "All"
      ? currentData
      : currentData.filter((g) => g.category === activeCategory);

  if (filtered.length === 0) {
    els.emptyState.classList.remove("hidden");
    return;
  }
  els.emptyState.classList.add("hidden");

  for (const group of filtered) {
    const li = document.createElement("li");
    li.className = "newsletter-item";
    li.innerHTML = `
      <div class="newsletter-info">
        <span class="newsletter-name">${escapeHtml(group.senderName)}</span>
        <span class="newsletter-meta">
          <span class="category-tag">${escapeHtml(group.category)}</span>
          <span>${escapeHtml(group.senderEmail)}</span>
        </span>
      </div>
      <span class="newsletter-count">${group.count}</span>
    `;
    li.addEventListener("click", () => showDetailView(group));
    els.list.appendChild(li);
  }
}

function renderCategoryFilters() {
  els.categoryFilters.innerHTML = "";
  for (const cat of getCategories()) {
    const chip = document.createElement("span");
    chip.className = "category-chip" + (cat === activeCategory ? " active" : "");
    chip.textContent = cat;
    chip.addEventListener("click", () => {
      activeCategory = cat;
      renderList();
    });
    els.categoryFilters.appendChild(chip);
  }
}

function showDetailView(group) {
  activeGroup = group;
  els.listView.classList.add("hidden");
  els.detailView.classList.remove("hidden");

  els.detailSenderName.textContent = group.senderName;
  els.detailSenderMeta.textContent = `${group.senderEmail} · ${group.count} emails · ${group.category}`;

  els.unsubscribeBtn.disabled = false;
  els.unsubscribeBtn.textContent = "Unsubscribe";

  els.detailMessageList.innerHTML = "";
  for (const msg of group.messages) {
    const li = document.createElement("li");
    li.className = "detail-message-item";
    li.innerHTML = `
      <div class="detail-message-subject">${escapeHtml(msg.subject || "(no subject)")}</div>
      <div class="detail-message-date">${formatDate(msg.date)}</div>
      <div class="detail-message-snippet">${escapeHtml(msg.snippet || "")}</div>
    `;
    els.detailMessageList.appendChild(li);
  }
}

function showListView() {
  els.detailView.classList.add("hidden");
  els.listView.classList.remove("hidden");
  activeGroup = null;
}

async function handleUnsubscribeClick() {
  if (!activeGroup) return;
  els.unsubscribeBtn.disabled = true;
  els.unsubscribeBtn.textContent = "Working…";

  const response = await chrome.runtime.sendMessage({
    action: "unsubscribe",
    group: activeGroup
  });

  if (response.ok && response.data.success) {
    els.unsubscribeBtn.textContent =
      response.data.method === "one-click" ? "Unsubscribed ✓" : "Opened unsubscribe page ✓";
  } else {
    els.unsubscribeBtn.textContent = "Couldn't unsubscribe";
    els.unsubscribeBtn.disabled = false;
  }
}

function setStatus(text) {
  els.statusBar.textContent = text;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function timeAgo(timestamp) {
  if (!timestamp) return "never";
  const diffMs = Date.now() - timestamp;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}