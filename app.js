const STORAGE = {
  clientId: "apps-google-client-id",
  sources: "apps-google-spreadsheet-sources",
  activeCategory: "apps-google-active-spreadsheet-category"
};

const DEFAULT_SOURCE = {
  category: "Manning",
  url: "https://docs.google.com/spreadsheets/d/1pbyUYMmbDTipbufbELPPSnM6El28xm1LY9g1614KwK0",
  spreadsheetId: "1pbyUYMmbDTipbufbELPPSnM6El28xm1LY9g1614KwK0",
  sheetName: "manning"
};

const EMPLOYEE_SUMMARY_HEADERS = ["NO", "EMPCODE", "FULL NAME", "AREA ASSIGNMENT/SECTION", "POSITION"];

const state = {
  accessToken: null,
  tokenClient: null,
  tokenClientClientId: null,
  installPrompt: null,
  clientId: localStorage.getItem(STORAGE.clientId) || "",
  sources: [],
  activeCategory: "",
  spreadsheetId: DEFAULT_SOURCE.spreadsheetId,
  sheetName: DEFAULT_SOURCE.sheetName,
  headerRowNumber: 0,
  sheets: [],
  headers: [],
  rows: [],
  rowNumbers: [],
  editingRowIndex: null,
  isRefreshing: false,
  tableProgress: 0,
  tableProgressTimer: null,
  tableProgressHideTimer: null
};

const els = {
  connectButton: document.querySelector("#connectButton"),
  installButton: document.querySelector("#installButton"),
  installDialog: document.querySelector("#installDialog"),
  installInstructions: document.querySelector("#installInstructions"),
  settingsButton: document.querySelector("#settingsButton"),
  settingsDialog: document.querySelector("#settingsDialog"),
  settingsForm: document.querySelector("#settingsForm"),
  clientIdInput: document.querySelector("#clientIdInput"),
  sourceSelect: document.querySelector("#sourceSelect"),
  deleteSourceButton: document.querySelector("#deleteSourceButton"),
  spreadsheetDialog: document.querySelector("#spreadsheetDialog"),
  spreadsheetForm: document.querySelector("#spreadsheetForm"),
  spreadsheetCategoryInput: document.querySelector("#spreadsheetCategoryInput"),
  spreadsheetUrlInput: document.querySelector("#spreadsheetUrlInput"),
  saveSpreadsheetButton: document.querySelector("#saveSpreadsheetButton"),
  sheetSelect: document.querySelector("#sheetSelect"),
  refreshButton: document.querySelector("#refreshButton"),
  refreshButtonLabel: document.querySelector("#refreshButtonLabel"),
  tableLoading: document.querySelector("#tableLoading"),
  tableProgressPercent: document.querySelector("#tableProgressPercent"),
  tableProgressBar: document.querySelector("#tableProgressBar"),
  searchInput: document.querySelector("#searchInput"),
  tableAddButton: document.querySelector("#tableAddButton"),
  addAppButton: document.querySelector("#addAppButton"),
  tableHead: document.querySelector("#tableHead"),
  tableBody: document.querySelector("#tableBody"),
  emptyState: document.querySelector("#emptyState"),
  totalCount: document.querySelector("#totalCount"),
  visibleCount: document.querySelector("#visibleCount"),
  lastUpdated: document.querySelector("#lastUpdated"),
  connectionLabel: document.querySelector("#connectionLabel"),
  rowDialog: document.querySelector("#rowDialog"),
  rowDialogTitle: document.querySelector("#rowDialogTitle"),
  rowForm: document.querySelector("#rowForm"),
  rowFields: document.querySelector("#rowFields"),
  detailsDrawer: document.querySelector("#detailsDrawer"),
  detailsAvatar: document.querySelector("#detailsAvatar"),
  detailsTitle: document.querySelector("#detailsTitle"),
  detailsSubtitle: document.querySelector("#detailsSubtitle"),
  detailsFields: document.querySelector("#detailsFields"),
  closeDetailsDrawerButton: document.querySelector("#closeDetailsDrawerButton"),
  toast: document.querySelector("#toast")
};

els.clientIdInput.value = state.clientId;
state.sources = readSavedSources();
const savedCategory = localStorage.getItem(STORAGE.activeCategory);
state.activeCategory = state.sources.some((source) => source.category === savedCategory)
  ? savedCategory
  : state.sources.find((source) => source.category === DEFAULT_SOURCE.category)?.category || state.sources[0]?.category || "";
const initialSource = getActiveSource();
if (initialSource) {
  state.spreadsheetId = spreadsheetIdFromUrl(initialSource.url);
  state.sheetName = initialSource.sheetName || "";
}
renderSourceOptions();
localStorage.removeItem("apps-google-spreadsheet-id");
localStorage.removeItem("apps-google-spreadsheet-url");
localStorage.removeItem("apps-google-sheet-name");

els.settingsButton.addEventListener("click", () => els.settingsDialog.showModal());
els.settingsForm.addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  const clientId = els.clientIdInput.value.trim();
  if (!clientId) return;
  if (clientId !== state.clientId) {
    state.clientId = clientId;
    state.tokenClient = null;
    state.tokenClientClientId = null;
    state.accessToken = null;
    state.sheets = [];
    state.headers = [];
    state.rows = [];
    state.rowNumbers = [];
    setSelectPlaceholder(els.sheetSelect, "Select a spreadsheet");
    showEmptyState("Connect your spreadsheet", "Choose a Google Spreadsheet and sheet to manage app records.");
    els.connectionLabel.textContent = "Not connected";
    document.querySelector(".status-dot").classList.remove("online");
    els.connectButton.textContent = "Add spreadsheet";
    updateRefreshButton();
  }
  localStorage.setItem(STORAGE.clientId, state.clientId);
  els.settingsDialog.close();
  toast("OAuth Client ID saved");
  if (!state.accessToken && getActiveSource()) requestGoogleAuthorization();
});

els.connectButton.addEventListener("click", openSpreadsheetDialog);
els.installButton.addEventListener("click", handleInstallClick);
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.installPrompt = event;
});
window.addEventListener("appinstalled", () => {
  state.installPrompt = null;
  updateInstallButton();
  toast("Mama Sita's Apps is installed");
});
updateInstallButton();
if (window.isSecureContext && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./service-worker.js").catch((error) => {
    console.error("Service worker registration failed:", error);
    toast("Offline support could not be enabled");
  });
}
els.sourceSelect.addEventListener("change", () => selectSource(els.sourceSelect.value));
els.deleteSourceButton.addEventListener("click", deleteSelectedSource);
els.spreadsheetForm.addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  addSpreadsheetSource();
});
els.sheetSelect.addEventListener("change", () => selectSheet(els.sheetSelect.value));
els.refreshButton.addEventListener("click", refreshSpreadsheet);
els.searchInput.addEventListener("input", renderTable);
els.tableAddButton.addEventListener("click", openAddRow);
els.addAppButton.addEventListener("click", () => state.headers.length ? openAddRow() : els.settingsDialog.showModal());
els.closeDetailsDrawerButton.addEventListener("click", () => els.detailsDrawer.close());

els.rowForm.addEventListener("submit", (event) => {
  if (event.submitter?.value === "cancel") return;
  event.preventDefault();
  saveRow();
});

function readSavedSources() {
  const saved = localStorage.getItem(STORAGE.sources);
  if (!saved) {
    const legacyUrl = localStorage.getItem("apps-google-spreadsheet-url");
    return [{ ...DEFAULT_SOURCE, url: legacyUrl || DEFAULT_SOURCE.url }];
  }
  try {
    const sources = JSON.parse(saved);
    if (!Array.isArray(sources)) throw new Error("Saved spreadsheet categories must be a list");
    const validSources = sources.map((source) => {
      if (!source || typeof source.category !== "string" || typeof source.url !== "string") {
        throw new Error("A saved spreadsheet category is missing its name or URL");
      }
      spreadsheetIdFromUrl(source.url);
      return {
        category: source.category.trim(),
        url: source.url.trim(),
        sheetName: typeof source.sheetName === "string" ? source.sheetName : ""
      };
    }).filter((source) => source.category);
    return validSources;
  } catch (error) {
    toast(`Could not read saved spreadsheet categories: ${error.message}`);
    return [{ ...DEFAULT_SOURCE }];
  }
}

function getActiveSource() {
  return state.sources.find((source) => source.category === state.activeCategory);
}

function renderSourceOptions() {
  els.sourceSelect.innerHTML = "";
  state.sources.forEach((source) => {
    const option = document.createElement("option");
    option.value = source.category;
    option.textContent = source.category;
    els.sourceSelect.appendChild(option);
  });
  els.sourceSelect.disabled = state.sources.length === 0;
  els.sourceSelect.value = state.activeCategory;
  els.deleteSourceButton.disabled = !getActiveSource();
  updateRefreshButton();
}

function openSpreadsheetDialog() {
  const source = getActiveSource();
  els.spreadsheetCategoryInput.value = source?.category || "";
  els.spreadsheetUrlInput.value = source?.url || "";
  els.saveSpreadsheetButton.textContent = state.accessToken ? "Save & load" : "Save & connect";
  els.spreadsheetDialog.showModal();
}

function persistSourceConfig(sources, activeCategory) {
  try {
    localStorage.setItem(STORAGE.sources, JSON.stringify(sources));
    localStorage.setItem(STORAGE.activeCategory, activeCategory);
    return true;
  } catch (error) {
    toast(`Could not save spreadsheet categories: ${error.message}`);
    return false;
  }
}

function addSpreadsheetSource() {
  const category = els.spreadsheetCategoryInput.value.trim();
  const url = els.spreadsheetUrlInput.value.trim();
  if (!category) {
    toast("Enter a category name");
    return;
  }

  let id;
  try {
    id = spreadsheetIdFromUrl(url);
  } catch (error) {
    toast(error.message);
    return;
  }

  const existingIndex = state.sources.findIndex((source) => source.category.toLowerCase() === category.toLowerCase());
  const existing = existingIndex >= 0 ? state.sources[existingIndex] : null;
  const source = {
    category,
    url,
    sheetName: existing && spreadsheetIdFromUrl(existing.url) === id ? existing.sheetName : ""
  };
  const nextSources = [...state.sources];
  if (existingIndex >= 0) nextSources[existingIndex] = source;
  else nextSources.push(source);
  if (!persistSourceConfig(nextSources, category)) return;

  state.sources = nextSources;
  state.activeCategory = category;
  state.spreadsheetId = id;
  state.sheetName = source.sheetName;
  renderSourceOptions();
  els.spreadsheetDialog.close();
  if (state.accessToken) loadSpreadsheet(id);
  else requestGoogleAuthorization();
}

function selectSource(category) {
  const source = state.sources.find((item) => item.category === category);
  if (!source) return;
  state.activeCategory = category;
  state.spreadsheetId = spreadsheetIdFromUrl(source.url);
  state.sheetName = source.sheetName || "";
  persistSourceConfig(state.sources, category);
  if (state.accessToken) loadSpreadsheet(state.spreadsheetId);
  else requestGoogleAuthorization();
}

async function refreshSpreadsheet() {
  if (state.isRefreshing) return;
  const source = getActiveSource();
  if (!source) return;
  try {
    state.spreadsheetId = spreadsheetIdFromUrl(source.url);
  } catch (error) {
    toast(error.message || "Enter a valid Google Sheets URL or spreadsheet ID");
    return;
  }

  if (!state.accessToken) {
    state.sheetName = source.sheetName || "";
    requestGoogleAuthorization();
    return;
  }

  state.isRefreshing = true;
  els.refreshButton.disabled = true;
  els.refreshButtonLabel.textContent = "Refreshing...";
  startTableProgress();
  let refreshed = false;
  try {
    refreshed = !state.sheetName || !state.sheets.some((sheet) => sheet.properties.title === state.sheetName)
      ? await loadSpreadsheet(state.spreadsheetId)
      : await loadSheetData();
  } finally {
    finishTableProgress(refreshed);
    state.isRefreshing = false;
    updateRefreshButton();
  }
}

function deleteSelectedSource() {
  const source = getActiveSource();
  if (!source) return;
  const confirmed = window.confirm(
    `Remove "${source.category}" from this dashboard? This removes its saved URL from this browser only; it will not delete the spreadsheet from Google Drive.`
  );
  if (!confirmed) return;

  const nextSources = state.sources.filter((item) => item.category !== source.category);
  const nextCategory = nextSources[0]?.category || "";
  if (!persistSourceConfig(nextSources, nextCategory)) return;

  state.sources = nextSources;
  state.activeCategory = nextCategory;
  state.spreadsheetId = "";
  state.sheetName = "";
  state.sheets = [];
  renderSourceOptions();
  clearTableData();

  if (!nextSources.length) {
    setSelectPlaceholder(els.sheetSelect, "No spreadsheet selected");
    showEmptyState("No spreadsheet selected", "Add a spreadsheet URL to choose a spreadsheet source.");
  } else {
    showEmptyState("Connect your spreadsheet", `Connect to load the "${nextCategory}" spreadsheet.`);
    selectSource(nextCategory);
  }
  toast(`Removed "${source.category}" from this dashboard`);
}

function requestGoogleAuthorization() {
  if (!state.clientId) {
    els.settingsDialog.showModal();
    els.clientIdInput.focus();
    return;
  }
  if (!initializeTokenClient()) return;
  state.tokenClient.requestAccessToken({ prompt: "" });
}

function initializeTokenClient() {
  if (!window.google?.accounts?.oauth2) {
    toast("Google Identity Services is still loading");
    return false;
  }
  if (!state.tokenClient || state.tokenClientClientId !== state.clientId) {
    state.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: state.clientId,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      callback: (response) => {
        if (response.error) {
          toast(response.error_description || "Google authorization failed");
          return;
        }
        state.accessToken = response.access_token;
        els.connectButton.textContent = "Add spreadsheet";
        els.connectionLabel.textContent = "Google Sheets connected";
        document.querySelector(".status-dot").classList.add("online");
        updateRefreshButton();
        const source = getActiveSource();
        if (!source) {
          toast("Add a spreadsheet URL first");
          return;
        }
        state.spreadsheetId = spreadsheetIdFromUrl(source.url);
        state.sheetName = source.sheetName || "";
        loadSpreadsheet(state.spreadsheetId);
      }
    });
    state.tokenClientClientId = state.clientId;
  }
  return true;
}

async function api(path, options = {}) {
  const response = await fetch(`https://sheets.googleapis.com/v4/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${state.accessToken}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (response.status === 401) markDisconnected();
    throw new Error(body.error?.message || `Request failed (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}

function spreadsheetIdFromUrl(value) {
  const input = value.trim();
  const match = input.match(/^https?:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/i);
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]+$/.test(input)) return input;
  throw new Error("Enter a valid Google Sheets URL or spreadsheet ID");
}

async function loadSpreadsheet(id) {
  if (!id) return false;
  state.spreadsheetId = id;
  setSelectPlaceholder(els.sheetSelect, "Loading sheets...");
  clearTableData();
  try {
    const data = await api(`spreadsheets/${id}?fields=properties(title),sheets.properties(sheetId,title)`);
    state.sheets = data.sheets || [];
    els.sheetSelect.innerHTML = "";
    if (!state.sheets.length) {
      setSelectPlaceholder(els.sheetSelect, "No sheets found");
      showEmptyState("No sheets found", "This spreadsheet does not contain any sheets.");
      return false;
    }

    state.sheets.forEach((sheet) => {
      const option = document.createElement("option");
      option.value = sheet.properties.title;
      option.textContent = sheet.properties.title;
      els.sheetSelect.appendChild(option);
    });
    els.sheetSelect.disabled = false;
    const savedName = state.sheetName;
    const matchingName = state.sheets.find((sheet) => sheet.properties.title === savedName)
      || state.sheets.find((sheet) => sheet.properties.title.toLowerCase() === savedName.toLowerCase());
    els.sheetSelect.value = matchingName?.properties.title || state.sheets[0]?.properties.title || "";
    return await selectSheet(els.sheetSelect.value);
  } catch (error) {
    setSelectPlaceholder(els.sheetSelect, "Could not load sheets");
    const message = error.message || "Could not load sheets from this spreadsheet";
    showEmptyState("Could not load sheets", message);
    toast(message);
    return false;
  }
}

async function selectSheet(name) {
  if (!name) return false;
  state.sheetName = name;
  const source = getActiveSource();
  if (source) {
    source.sheetName = name;
    persistSourceConfig(state.sources, state.activeCategory);
  }
  els.searchInput.disabled = false;
  return await loadSheetData();
}

async function loadSheetData() {
  if (!state.spreadsheetId || !state.sheetName) return false;
  try {
    const range = encodeURIComponent(`${quoteSheetName(state.sheetName)}!A1:Z1000`);
    const data = await api(`spreadsheets/${state.spreadsheetId}/values/${range}`);
    const values = data.values || [];
    state.headerRowNumber = detectHeaderRow(values);
    state.headers = state.headerRowNumber
      ? (values[state.headerRowNumber - 1] || []).map((header) => String(header ?? "").trim())
      : [];
    while (state.headers.length && !state.headers[state.headers.length - 1]) state.headers.pop();
    state.rows = [];
    state.rowNumbers = [];
    if (state.headerRowNumber) {
      values.slice(state.headerRowNumber).forEach((row, index) => {
        if (row.some((cell) => String(cell ?? "").trim())) {
          state.rows.push(row);
          state.rowNumbers.push(state.headerRowNumber + index + 1);
        }
      });
    }
    if (isEmployeeSummarySheet()) {
      const missingHeaders = EMPLOYEE_SUMMARY_HEADERS.filter((header) => !state.headers.some((item) => normalizeHeader(item) === normalizeHeader(header)));
      if (missingHeaders.length) {
        const sheetLabel = isConsolidatedSheet() ? "Consolidated sheet" : "Manning sheet";
        toast(`${sheetLabel} is missing columns: ${missingHeaders.join(", ")}`);
      }
    }
    renderTable();
    els.tableAddButton.disabled = !state.headers.length || isConsolidatedSheet();
    els.lastUpdated.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return true;
  } catch (error) {
    toast(error.message || "Could not load spreadsheet data");
    return false;
  }
}

function startTableProgress() {
  clearInterval(state.tableProgressTimer);
  clearTimeout(state.tableProgressHideTimer);
  state.tableProgress = 0;
  updateTableProgress();
  els.tableLoading.classList.remove("hidden");
  state.tableProgressTimer = window.setInterval(() => {
    state.tableProgress = Math.min(90, state.tableProgress + 2);
    updateTableProgress();
  }, 180);
}

function finishTableProgress(success) {
  clearInterval(state.tableProgressTimer);
  state.tableProgressTimer = null;
  if (!success) {
    els.tableLoading.classList.add("hidden");
    state.tableProgress = 0;
    updateTableProgress();
    return;
  }

  state.tableProgress = 100;
  updateTableProgress();
  state.tableProgressHideTimer = window.setTimeout(() => {
    els.tableLoading.classList.add("hidden");
    state.tableProgress = 0;
    updateTableProgress();
    state.tableProgressHideTimer = null;
  }, 400);
}

function updateTableProgress() {
  const progress = state.tableProgress;
  els.tableProgressPercent.textContent = `${progress}%`;
  els.tableProgressBar.firstElementChild.style.width = `${progress}%`;
  els.tableProgressBar.setAttribute("aria-valuenow", String(progress));
}

function setSelectPlaceholder(select, text) {
  select.innerHTML = "";
  const option = document.createElement("option");
  option.value = "";
  option.textContent = text;
  option.selected = true;
  select.appendChild(option);
  select.disabled = true;
}

function showEmptyState(title, message) {
  els.emptyState.querySelector("h2").textContent = title;
  els.emptyState.querySelector("p").textContent = message;
  els.emptyState.classList.remove("hidden");
}

function clearTableData() {
  state.headerRowNumber = 0;
  state.headers = [];
  state.rows = [];
  state.rowNumbers = [];
  els.tableHead.innerHTML = "";
  els.tableBody.innerHTML = "";
  els.totalCount.textContent = "0";
  els.visibleCount.textContent = "0";
  els.lastUpdated.textContent = "—";
  els.searchInput.disabled = true;
  els.tableAddButton.disabled = true;
  els.addAppButton.disabled = isConsolidatedSheet();
  els.refreshButton.disabled = state.isRefreshing || !getActiveSource();
}

function updateRefreshButton() {
  els.refreshButton.disabled = state.isRefreshing || !getActiveSource();
  els.refreshButtonLabel.textContent = state.isRefreshing ? "Refreshing..." : state.accessToken ? "Refresh" : "Reconnect";
}

function isAppInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function updateInstallButton() {
  els.installButton.classList.toggle("hidden", isAppInstalled());
}

async function handleInstallClick() {
  if (isAppInstalled()) {
    updateInstallButton();
    return;
  }
  if (!state.installPrompt) {
    const userAgent = navigator.userAgent;
    const isAppleMobile = /iPad|iPhone|iPod/.test(userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (isAppleMobile) {
      els.installInstructions.textContent = "In Safari, tap Share, then choose Add to Home Screen.";
    } else if (/Android/i.test(userAgent)) {
      els.installInstructions.textContent = "Open your browser menu and choose Install app or Add to Home Screen.";
    } else if (/Safari/i.test(userAgent) && !/Chrome|Chromium|Edg/i.test(userAgent)) {
      els.installInstructions.textContent = "In Safari, choose File, then Add to Dock.";
    } else if (/Firefox/i.test(userAgent)) {
      els.installInstructions.textContent = "Open this dashboard in Chrome or Edge to install it as an app.";
    } else {
      els.installInstructions.textContent = "Use the install icon in your browser's address bar, or choose Install app from its menu.";
    }
    els.installDialog.showModal();
    return;
  }

  const prompt = state.installPrompt;
  state.installPrompt = null;
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice.outcome === "accepted") toast("Installation started");
  } catch (error) {
    console.error("App installation failed:", error);
    toast("Could not start the app installation");
  }
}

function markDisconnected() {
  state.accessToken = null;
  els.connectionLabel.textContent = "Not connected";
  document.querySelector(".status-dot").classList.remove("online");
  updateRefreshButton();
}

function quoteSheetName(name) {
  return `'${name.replace(/'/g, "''")}'`;
}

function detectHeaderRow(values) {
  let bestRowNumber = 0;
  let bestScore = 1;
  const rowsToScan = Math.min(values.length, 50);

  for (let index = 0; index < rowsToScan; index++) {
    const labels = (values[index] || [])
      .map((cell) => String(cell ?? "").trim())
      .filter((cell) => cell && cell.length <= 80 && !/^(?:[-+]?\d[\d,]*(?:\.\d+)?|https?:\/\/|[^\s@]+@[^\s@]+\.[^\s@]+|\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4})$/i.test(cell));
    // The widest row of distinct short text is the best header candidate; ties keep the earliest row.
    const score = new Set(labels.map((label) => label.toLowerCase())).size;
    if (score > bestScore) {
      bestScore = score;
      bestRowNumber = index + 1;
    }
  }

  return bestRowNumber;
}

function filteredRows() {
  const term = els.searchInput.value.trim().toLowerCase();
  if (!term) return state.rows;
  return state.rows.filter((row) => row.some((cell) => String(cell ?? "").toLowerCase().includes(term)));
}

function renderTable() {
  const rows = filteredRows();
  const visibleColumnIndices = getVisibleColumnIndices();
  els.totalCount.textContent = state.rows.length;
  els.visibleCount.textContent = rows.length;

  els.tableHead.innerHTML = "";
  els.tableBody.innerHTML = "";

  if (!state.headers.length) {
    els.emptyState.classList.remove("hidden");
    els.emptyState.querySelector("h2").textContent = "No header row found";
    els.emptyState.querySelector("p").textContent = "Could not find at least two distinct column labels in the first 50 rows.";
    els.searchInput.disabled = true;
    els.tableAddButton.disabled = true;
    els.addAppButton.disabled = isConsolidatedSheet();
    return;
  }

  els.emptyState.classList.add("hidden");
  els.tableAddButton.disabled = isConsolidatedSheet();
  els.addAppButton.disabled = isConsolidatedSheet();
  const headRow = document.createElement("tr");
  visibleColumnIndices.forEach((columnIndex) => {
    const th = document.createElement("th");
    th.textContent = state.headers[columnIndex];
    headRow.appendChild(th);
  });
  const actionHead = document.createElement("th");
  actionHead.textContent = isConsolidatedSheet() ? "Details" : "Actions";
  actionHead.className = "actions";
  headRow.appendChild(actionHead);
  els.tableHead.appendChild(headRow);

  rows.forEach((row) => {
    const realIndex = state.rows.indexOf(row);
    const tr = document.createElement("tr");
    visibleColumnIndices.forEach((columnIndex) => {
      const td = document.createElement("td");
      td.textContent = row[columnIndex] ?? "";
      td.title = td.textContent;
      tr.appendChild(td);
    });
    const actions = document.createElement("td");
    actions.className = "actions";
    if (!isConsolidatedSheet()) {
      actions.innerHTML = `<button class="row-action" type="button" title="Edit" aria-label="Edit row"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.5-.8 4.3 4.3-.8L19.7 7.8a2.1 2.1 0 0 0-3-3L4 16.5Z"/><path d="m14.8 6.7 3 3"/></svg></button><button class="row-action delete" type="button" title="Delete" aria-label="Delete row"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7h15"/><path d="m6.5 7 .8 12h9.4l.8-12"/><path d="M9 7V4.8h6V7"/><path d="M10 11v5M14 11v5"/></svg></button>`;
      actions.children[0].addEventListener("click", () => openEditRow(realIndex));
      actions.children[1].addEventListener("click", () => deleteRow(realIndex));
    }
    if (isEmployeeSummarySheet()) {
      const detailsButton = document.createElement("button");
      detailsButton.className = "row-action";
      detailsButton.type = "button";
      detailsButton.title = "View details";
      detailsButton.setAttribute("aria-label", "View row details");
      detailsButton.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.5" y="4.5" width="15" height="15" rx="2"/><path d="M9 9h6M9 12h6M9 15h4"/></svg>`;
      detailsButton.addEventListener("click", () => openDetailsDrawer(realIndex));
      actions.appendChild(detailsButton);
      tr.classList.add("has-details");
      tr.addEventListener("click", (event) => {
        if (!event.target.closest("button")) openDetailsDrawer(realIndex);
      });
    }
    tr.appendChild(actions);
    els.tableBody.appendChild(tr);
  });
}

function getVisibleColumnIndices() {
  if (!isEmployeeSummarySheet()) return state.headers.map((_, index) => index);
  return EMPLOYEE_SUMMARY_HEADERS
    .map((header) => state.headers.findIndex((item) => normalizeHeader(item) === normalizeHeader(header)))
    .filter((index) => index >= 0);
}

function isManningSheet() {
  const sheetName = normalizeHeader(state.sheetName);
  return sheetName === "manning" || sheetName === "manningsheet";
}

function isConsolidatedSheet() {
  const sheetName = normalizeHeader(state.sheetName);
  return sheetName === "consolidated" || sheetName === "consolidatedsheet";
}

function isEmployeeSummarySheet() {
  return isManningSheet() || isConsolidatedSheet();
}

function normalizeHeader(header) {
  return String(header).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function openDetailsDrawer(rowIndex) {
  if (!isEmployeeSummarySheet()) return;
  const row = state.rows[rowIndex];
  if (!row) return;

  const fullNameIndex = state.headers.findIndex((header) => normalizeHeader(header) === "fullname");
  const employeeCodeIndex = state.headers.findIndex((header) => normalizeHeader(header) === "empcode");
  const fullName = fullNameIndex >= 0 && row[fullNameIndex] ? String(row[fullNameIndex]) : "";
  els.detailsTitle.textContent = fullName || "Employee details";
  const initials = fullName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join("");
  els.detailsAvatar.textContent = initials || "?";
  els.detailsSubtitle.textContent = employeeCodeIndex >= 0 && row[employeeCodeIndex]
    ? `Employee code: ${row[employeeCodeIndex]}`
    : "";
  els.detailsFields.innerHTML = "";

  const hiddenColumns = new Set(["empcode", "fullname", "lastday", "transferstatus"]);
  state.headers.forEach((header, index) => {
    const normalizedHeader = normalizeHeader(header);
    if (hiddenColumns.has(normalizedHeader) || /^no\d*$/.test(normalizedHeader) || String(header).trim() === "%") return;
    const item = document.createElement("div");
    item.className = "detail-item";
    const label = document.createElement("dt");
    label.textContent = formatDetailLabel(header || `Column ${index + 1}`);
    const value = document.createElement("dd");
    value.textContent = String(row[index] ?? "").trim() || "—";
    item.append(label, value);
    els.detailsFields.appendChild(item);
  });

  if (!els.detailsFields.children.length) {
    const emptyMessage = document.createElement("p");
    emptyMessage.className = "drawer-empty";
    emptyMessage.textContent = "There are no additional fields for this employee.";
    els.detailsFields.appendChild(emptyMessage);
  }
  els.detailsDrawer.showModal();
}

function formatDetailLabel(header) {
  return String(header).toLowerCase().replace(/(^|[\s/(-])([a-z])/g, (match, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
}

function openAddRow() {
  if (!state.headers.length || isConsolidatedSheet()) return;
  state.editingRowIndex = null;
  els.rowDialogTitle.textContent = "Add app";
  buildRowFields([]);
  els.rowDialog.showModal();
}

function openEditRow(index) {
  if (isConsolidatedSheet()) return;
  state.editingRowIndex = index;
  els.rowDialogTitle.textContent = "Edit app";
  buildRowFields(state.rows[index]);
  els.rowDialog.showModal();
}

function buildRowFields(row) {
  els.rowFields.innerHTML = "";
  state.headers.forEach((header, index) => {
    const label = document.createElement("label");
    label.textContent = header;
    const input = document.createElement("input");
    input.name = `column-${index}`;
    input.value = row[index] ?? "";
    label.appendChild(input);
    els.rowFields.appendChild(label);
  });
}

async function saveRow() {
  if (isConsolidatedSheet()) return;
  const values = state.headers.map((_, index) => els.rowFields.querySelector(`[name="column-${index}"]`).value);
  try {
    if (state.editingRowIndex === null) {
      const range = encodeURIComponent(`${quoteSheetName(state.sheetName)}!A1`);
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${state.spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${state.accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ values: [values] })
      }).then(checkFetchResponse);
      toast("App added");
    } else {
      const sheetRow = state.rowNumbers[state.editingRowIndex];
      if (!sheetRow) throw new Error("Could not identify the selected spreadsheet row");
      const range = encodeURIComponent(`${quoteSheetName(state.sheetName)}!A${sheetRow}:${columnLetter(state.headers.length)}${sheetRow}`);
      await api(`spreadsheets/${state.spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`, {
        method: "PUT",
        body: JSON.stringify({ values: [values] })
      });
      toast("App updated");
    }
    els.rowDialog.close();
    await loadSheetData();
  } catch (error) {
    toast(error.message);
  }
}

async function deleteRow(index) {
  if (isConsolidatedSheet()) return;
  if (!confirm("Delete this row from the spreadsheet?")) return;
  try {
    const sheet = state.sheets.find((item) => item.properties.title === state.sheetName);
    const sheetId = sheet?.properties.sheetId;
    if (sheetId === undefined) throw new Error("Could not identify the selected sheet");
    const sheetRow = state.rowNumbers[index];
    if (!sheetRow) throw new Error("Could not identify the selected spreadsheet row");
    await api(`spreadsheets/${state.spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        requests: [{
          deleteDimension: {
            range: { sheetId, dimension: "ROWS", startIndex: sheetRow - 1, endIndex: sheetRow }
          }
        }]
      })
    });
    toast("App deleted");
    await loadSheetData();
  } catch (error) {
    toast(error.message);
  }
}

async function checkFetchResponse(response) {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error?.message || "Could not save the row");
  }
  return response.json();
}

function columnLetter(count) {
  let value = "";
  while (count > 0) {
    count--;
    value = String.fromCharCode(65 + (count % 26)) + value;
    count = Math.floor(count / 26);
  }
  return value;
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => els.toast.classList.remove("visible"), 3200);
}
