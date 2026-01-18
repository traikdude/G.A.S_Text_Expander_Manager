/* *********************************** */
/* 08 Jan 2026, 17:18:20        */
/* *********************************** */

/**
 * ========
 * 🔎 Debug Harness (Drop-in)
 * ========
 *
 * ✅ What it does:
 * - Pretty logs with levels (info/warn/error)
 * - Timers ⏱️
 * - Safe wrappers for functions
 * - Environment dump 🧾
 * - Optional Document Lock wrapper 🔒
 *
 * IMPORTANT:
 * - This file was REVISED to avoid reserved name collisions:
 * - onOpen(e)    -> DEBUG_onOpen_(e)
 * - doGet(e)     -> MASTER_doGet_(e)
 * - Master onOpen(e) -> MASTER_onOpen_(e)
 * - Your PROJECT keeps ONE real onOpen/doGet in 00_ProjectEntryPoints.gs ✅
 */

const Debug = (() => {
  const LEVELS = { INFO: "INFO", WARN: "WARN", ERROR: "ERROR" };

  function formatTime_(d) {
    try {
      return Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss.SSS");
    } catch (e) {
      return d.toISOString();
    }
  }

  function log_(level, args) {
    const prefix = `[${LEVELS[level] || level}] ${formatTime_(new Date())} —`;
    try {
      console.log(prefix, ...args);
    } catch (e) {
      try { Logger.log(prefix + " " + args.map(a => String(a)).join(" ")); } catch (e2) {}
    }
  }

  function info(...args) { log_("INFO", args); }
  function warn(...args) { log_("WARN", args); }
  function error(...args) { log_("ERROR", args); }

  function time(label, fn) {
    const start = Date.now();
    try {
      const out = fn();
      const ms = Date.now() - start;
      info(`⏱️ ${label}: ${ms} ms`);
      return out;
    } catch (err) {
      const ms = Date.now() - start;
      error(`⏱️ ${label}: FAILED after ${ms} ms`, err && err.stack ? err.stack : err);
      throw err;
    }
  }

  function formatError(err) {
    try {
      if (!err) return "Unknown error";
      if (err.stack) return String(err.stack);
      return String(err);
    } catch (e) {
      return "Unknown error";
    }
  }

  function wrap(label, fn) {
    return function(...args) {
      return time(label, () => fn(...args));
    };
  }

  function run(fnName, ...args) {
    info(`🚀 Running: ${fnName}()`);
    const fn = this && this[fnName] ? this[fnName] : globalThis[fnName];
    if (typeof fn !== "function") throw new Error(`Function not found: ${fnName}`);
    return fn(...args);
  }

  function envDump() {
    const dump = {
      user: {
        active: safe_(() => Session.getActiveUser().getEmail()),
        effective: safe_(() => Session.getEffectiveUser().getEmail()),
      },
      script: {
        timeZone: safe_(() => Session.getScriptTimeZone()),
        locale: safe_(() => Session.getActiveUserLocale()),
      },
      services: {
        spreadsheetActiveId: safe_(() => SpreadsheetApp.getActiveSpreadsheet().getId()),
        spreadsheetName: safe_(() => SpreadsheetApp.getActiveSpreadsheet().getName()),
      }
    };
    info("🧾 ENV DUMP:", JSON.stringify(dump, null, 2));
    return dump;

    function safe_(fn) {
      try { return fn(); } catch (e) { return ""; }
    }
  }

  function withDocumentLock(fn, timeoutMs) {
    const lock = LockService.getDocumentLock();
    lock.waitLock(timeoutMs || 20000);
    try {
      return fn();
    } finally {
      try { lock.releaseLock(); } catch (e) {}
    }
  }

  return { info, warn, error, time, run, wrap, envDump, withDocumentLock, formatError };
})();

/**
 * ============================
 * 📌 Optional: Sheet Debug Menu
 * ============================
 * Revised: no reserved onOpen name is used.
 */
function DEBUG_onOpen_(e) {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.createMenu("🐞 Debug")
      .addItem("ENV Dump", "DEBUG_menuEnvDump")
      .addItem("Run Example Main", "DEBUG_menuRunExampleMain")
      .addToUi();
  } catch (err) {
    console.log("DEBUG_onOpen_ skipped:", err && err.message);
  }
}

function DEBUG_menuEnvDump() {
  Debug.envDump();
}

function DEBUG_menuRunExampleMain() {
  Debug.run("DEBUG_exampleMain_");
}

/**
 * Example entry point you can rename to your real main function.
 */
function DEBUG_exampleMain_() {
  Debug.envDump();

  Debug.time("Example critical section", () => {
    Debug.withDocumentLock(() => {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getActiveSheet();
      const cell = sheet.getRange("A1");
      const before = cell.getValue();

      Debug.info("📍 A1 before:", before);
      cell.setValue(`Updated @ ${new Date().toLocaleString()}`);
      Debug.info("✅ A1 updated");
    });
  });
}

/**
 * 🌟 MASTER AUTOMATION FRAMEWORK (Universal Google Apps Script Template)
 */

const MASTER_CONFIG = {
  MENU_NAME: "⚙️ Master Automation",
  MENU_EMOJI: "⚙️",
  ENABLE_TOASTS: true,

  LINKS: {
    COLAB: "",
    GITHUB: "",
    WEBAPP: "",
    PARENT_FOLDER: "",
  },

  THEME: {
    BRAND_NAME: "Master Automation Suite ✨",
    PRIMARY: "#6D28D9",
    SECONDARY: "#06B6D4",
    ACCENT: "#F59E0B",
    BG: "#0B1220",
    CARD: "#111A2E",
    TEXT: "#E5E7EB",
    MUTED: "#9CA3AF",
    SUCCESS: "#22C55E",
    WARNING: "#F59E0B",
    DANGER: "#EF4444",
  },

  DASHBOARD_SHEET_NAME: "Master Dashboard",
  DASHBOARD_FREEZE_ROWS: 1,

  LOG_MAX_ROWS: 20000,
  LOG_AUTO_TRIM_ENABLED: true,
  LOG_INCLUDE_EDIT_EVENTS: true
};

/**
 * Master framework "entry" functions were renamed to avoid collisions.
 */
function MASTER_onOpen_(e) {
  MASTER_ensureInitialized_({ reason: "onOpen" });
  
  // 🛡️ SAFEGUARD: Try to build menu, fail gracefully if headless
  try {
    MASTER_buildMenu_();
  } catch (e) {
    console.warn('⚠️ Master Menu creation skipped (No UI context):', e.message);
  }
}

/**
 * Web app entry (renamed): used by router in 00_ProjectEntryPoints.gs
 */
function MASTER_doGet_(e) {
  MASTER_ensureInitialized_({ reason: "doGet" });
  return MASTER_htmlWebApp_()
    .setTitle(`${MASTER_CONFIG.THEME.BRAND_NAME}`)
    .addMetaTag("viewport", "width=device-width, initial-scale=1");
}

/** =======================================================================
 * INITIALIZATION
 * ======================================================================= */
function MASTER_ensureInitialized_(meta) {
  const props = PropertiesService.getDocumentProperties();
  const isInit = props.getProperty("MASTER_INIT_DONE") === "true";
  if (isInit) return;

  const perf = MASTER_perfStart_();
  try {
    MASTER_ensureDashboardSheet_();
    MASTER_applyDashboardFormatting_();
    MASTER_ensureTriggers_();

    props.setProperty("MASTER_INIT_DONE", "true");
    props.setProperty("MASTER_INIT_AT_ISO", MASTER_nowIsoMs_());
    props.setProperty("MASTER_INIT_AT_EPOCH_MS", String(Date.now()));

    MASTER_logEvent_({
      eventType: "system",
      action: "initialize_framework",
      status: "success",
      durationMs: MASTER_perfEnd_(perf),
      meta: meta || {}
    });

    if (MASTER_CONFIG.ENABLE_TOASTS) {
      try {
        SpreadsheetApp.getActive().toast("✅ Master framework initialized!", "Master Automation ✨", 4);
      } catch (uiErr) {
        console.warn('Toast skipped (headless):', uiErr.message);
      }
    }
  } catch (err) {
    MASTER_logEvent_({
      eventType: "system",
      action: "initialize_framework",
      status: "failure",
      durationMs: MASTER_perfEnd_(perf),
      error: err,
      meta: meta || {}
    });
    throw err;
  }
}

function MASTER_initManually() {
  MASTER_ensureInitialized_({ reason: "manual" });
  try {
    MASTER_buildMenu_();
  } catch (e) {
    console.warn('Manual init menu skipped (headless):', e.message);
  }
}

/** =======================================================================
 * MENU SYSTEM
 * ======================================================================= */
function MASTER_buildMenu_() {
  const ui = SpreadsheetApp.getUi(); // This throws if headless
  const menu = ui.createMenu(`${MASTER_CONFIG.MENU_NAME} ${MASTER_CONFIG.MENU_EMOJI}`);

  menu.addItem("🏠 Open Sidebar (Quick Panel)", "MASTER_showSidebar");
  menu.addItem("🌐 Open Web App UI", "MASTER_openWebAppLink");
  menu.addSeparator();

  menu.addItem("🧪 Google Colab", "MASTER_openColab");
  menu.addItem("🐙 GitHub Repo", "MASTER_openGitHub");
  menu.addItem("🚀 Web App Deployment", "MASTER_openDeploymentHub");
  menu.addItem("🗂️ Folder Manager", "MASTER_openFolderManager");
  menu.addSeparator();

  menu.addItem("📊 Open Master Dashboard", "MASTER_openDashboard");
  menu.addItem("🧾 View Recent Logs (Dialog)", "MASTER_showRecentLogsDialog");
  menu.addSeparator();

  menu.addItem("🔗 Link Manager (Set URLs)", "MASTER_showLinkManagerDialog");
  menu.addItem("🔄 Reset Links to Blank", "MASTER_resetLinks");
  menu.addSeparator();

  menu.addItem("💡 About / Help", "MASTER_showAboutDialog");

  menu.addToUi();
}

/** =======================================================================
 * NAVIGATION
 * ======================================================================= */
function MASTER_openColab() {
  MASTER_openLinkKey_("COLAB", { from: "menu" });
}

function MASTER_openGitHub() {
  MASTER_openLinkKey_("GITHUB", { from: "menu" });
}

function MASTER_openWebAppLink() {
  const configured = MASTER_getLink_("WEBAPP");
  const fallback = MASTER_getThisWebAppUrl_("master");
  const url = configured || fallback;

  if (!url) {
    MASTER_openUrlDirect_("https://script.google.com/home", "🌐 Deploy Web App");
    return;
  }
  MASTER_openUrlDirect_(url, "🌐 Open Web App UI");
}

/**
 * Returns this project's deployed Web App URL (from Script Properties) with a UI route param.
 */
function MASTER_getThisWebAppUrl_(uiKey) {
  const sp = PropertiesService.getScriptProperties();
  const base = sp.getProperty("WEB_APP_URL") || sp.getProperty("WEBAPPURL") || sp.getProperty("WEB_APP") || "";
  if (!base) return "";
  return MASTER_appendQueryParam_(base, "ui", uiKey || "master");
}

/**
 * Appends or replaces a query parameter safely.
 */
function MASTER_appendQueryParam_(url, key, value) {
  const s = String(url || "");
  const parts = s.split("#");
  const base = parts[0];
  const hash = parts[1] ? "#" + parts[1] : "";

  const qParts = base.split("?");
  const path = qParts[0];
  const qs = qParts[1] || "";

  const params = {};
  if (qs) {
    qs.split("&").forEach(kv => {
      const [k, v] = kv.split("=");
      if (!k) return;
      params[decodeURIComponent(k)] = decodeURIComponent(v || "");
    });
  }
  params[key] = String(value);

  const newQs = Object.keys(params)
    .map(k => encodeURIComponent(k) + "=" + encodeURIComponent(params[k]))
    .join("&");

  return path + "?" + newQs + hash;
}

function MASTER_openDeploymentHub() {
  const url = MASTER_getLink_("WEBAPP");
  if (url) {
    MASTER_openUrlDirect_(url, "🚀 Web App");
    return;
  }
  MASTER_openUrlDirect_("https://script.google.com/home", "🚀 Deployment Hub");
}

function MASTER_openFolderManager() {
  MASTER_showFolderManagerDialog();
}

function MASTER_openDashboard() {
  const perf = MASTER_perfStart_();
  try {
    MASTER_ensureDashboardSheet_();
    const ss = SpreadsheetApp.getActive();
    const sheet = ss.getSheetByName(MASTER_CONFIG.DASHBOARD_SHEET_NAME);
    ss.setActiveSheet(sheet);

    MASTER_logEvent_({
      eventType: "navigation",
      action: "open_dashboard_sheet",
      status: "success",
      durationMs: MASTER_perfEnd_(perf),
      meta: { from: "menu" }
    });
  } catch (err) {
    MASTER_logEvent_({
      eventType: "navigation",
      action: "open_dashboard_sheet",
      status: "failure",
      durationMs: MASTER_perfEnd_(perf),
      error: err,
      meta: { from: "menu" }
    });
    throw err;
  }
}

/**
 * Opens a configured link key, or opens Link Manager if missing 🔗
 */
function MASTER_openLinkKey_(key, meta) {
  const perf = MASTER_perfStart_();
  try {
    const url = MASTER_getLink_(key);
    if (!url) {
      MASTER_logEvent_({
        eventType: "navigation",
        action: `open_link_missing_${key}`,
        status: "warning",
        durationMs: MASTER_perfEnd_(perf),
        meta: meta || {}
      });
      MASTER_showLinkManagerDialog();
      return;
    }

    MASTER_openUrlDirect_(url, `🔗 ${key}`);
    MASTER_logEvent_({
      eventType: "navigation",
      action: `open_link_${key}`,
      status: "success",
      durationMs: MASTER_perfEnd_(perf),
      meta: Object.assign({ url: url }, meta || {})
    });
  } catch (err) {
    MASTER_logEvent_({
      eventType: "navigation",
      action: `open_link_${key}`,
      status: "failure",
      durationMs: MASTER_perfEnd_(perf),
      error: err,
      meta: meta || {}
    });
    throw err;
  }
}

/**
 * 🔥 "Direct redirect" shim: opens URL instantly in a new tab and closes itself.
 */
function MASTER_openUrlDirect_(url, title) {
  const safeUrl = String(url || "").trim();
  if (!safeUrl) return;

  const html = HtmlService.createHtmlOutput(
    `<!doctype html>
    <html>
      <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
      <body style="font-family:system-ui;margin:16px;">
        <div>🔗 Opening…</div>
        <script>
          (function(){
            var url = ${JSON.stringify(safeUrl)};
            try { window.open(url, "_blank", "noopener,noreferrer"); } catch(e) {}
            setTimeout(function(){ google.script.host.close(); }, 150);
          })();
        </script>
      </body>
    </html>`
  ).setWidth(260).setHeight(90);

  SpreadsheetApp.getUi().showModelessDialog(html, title || "Open Link");
}

/** =======================================================================
 * MULTI-INTERFACE UX SUITE
 * ======================================================================= */

function MASTER_showSidebar() {
  const perf = MASTER_perfStart_();
  try {
    const html = MASTER_htmlSidebar_();
    SpreadsheetApp.getUi().showSidebar(html);

    MASTER_logEvent_({
      eventType: "ui",
      action: "show_sidebar",
      status: "success",
      durationMs: MASTER_perfEnd_(perf),
      meta: { from: "menu" }
    });
  } catch (err) {
    MASTER_logEvent_({
      eventType: "ui",
      action: "show_sidebar",
      status: "failure",
      durationMs: MASTER_perfEnd_(perf),
      error: err,
      meta: { from: "menu" }
    });
    throw err;
  }
}

function MASTER_showAboutDialog() {
  const perf = MASTER_perfStart_();
  try {
    const html = MASTER_htmlAboutDialog_();
    SpreadsheetApp.getUi().showModalDialog(html, "💡 About Master Automation");

    MASTER_logEvent_({
      eventType: "ui",
      action: "show_about_dialog",
      status: "success",
      durationMs: MASTER_perfEnd_(perf)
    });
  } catch (err) {
    MASTER_logEvent_({
      eventType: "ui",
      action: "show_about_dialog",
      status: "failure",
      durationMs: MASTER_perfEnd_(perf),
      error: err
    });
    throw err;
  }
}

function MASTER_showRecentLogsDialog() {
  const perf = MASTER_perfStart_();
  try {
    const html = MASTER_htmlRecentLogsDialog_();
    SpreadsheetApp.getUi().showModalDialog(html, "🧾 Recent Activity");

    MASTER_logEvent_({
      eventType: "ui",
      action: "show_recent_logs_dialog",
      status: "success",
      durationMs: MASTER_perfEnd_(perf)
    });
  } catch (err) {
    MASTER_logEvent_({
      eventType: "ui",
      action: "show_recent_logs_dialog",
      status: "failure",
      durationMs: MASTER_perfEnd_(perf),
      error: err
    });
    throw err;
  }
}

function MASTER_showLinkManagerDialog() {
  const perf = MASTER_perfStart_();
  try {
    const html = MASTER_htmlLinkManagerDialog_();
    SpreadsheetApp.getUi().showModalDialog(html, "🔗 Link Manager");

    MASTER_logEvent_({
      eventType: "ui",
      action: "show_link_manager_dialog",
      status: "success",
      durationMs: MASTER_perfEnd_(perf)
    });
  } catch (err) {
    MASTER_logEvent_({
      eventType: "ui",
      action: "show_link_manager_dialog",
      status: "failure",
      durationMs: MASTER_perfEnd_(perf),
      error: err
    });
    throw err;
  }
}

function MASTER_showFolderManagerDialog() {
  const perf = MASTER_perfStart_();
  try {
    const html = MASTER_htmlFolderManagerDialog_();
    SpreadsheetApp.getUi().showModalDialog(html, "🗂️ Folder Manager");

    MASTER_logEvent_({
      eventType: "ui",
      action: "show_folder_manager_dialog",
      status: "success",
      durationMs: MASTER_perfEnd_(perf)
    });
  } catch (err) {
    MASTER_logEvent_({
      eventType: "ui",
      action: "show_folder_manager_dialog",
      status: "failure",
      durationMs: MASTER_perfEnd_(perf),
      error: err
    });
    throw err;
  }
}

/** =======================================================================
 * DASHBOARD
 * ======================================================================= */

function MASTER_ensureDashboardSheet_() {
  const ss = SpreadsheetApp.getActive();
  let sheet = ss.getSheetByName(MASTER_CONFIG.DASHBOARD_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(MASTER_CONFIG.DASHBOARD_SHEET_NAME);
  }

  const headers = MASTER_dashboardHeaders_();
  const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
  const needsHeader = firstRow.join("").trim() !== headers.join("").trim();

  if (needsHeader) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  sheet.setFrozenRows(MASTER_CONFIG.DASHBOARD_FREEZE_ROWS);

  const lastCol = headers.length;
  const filter = sheet.getFilter();
  if (!filter) {
    sheet.getRange(1, 1, Math.max(sheet.getLastRow(), 2), lastCol).createFilter();
  }

  sheet.setColumnWidths(1, 3, 160);
  sheet.setColumnWidth(4, 120);
  sheet.setColumnWidth(5, 140);
  sheet.setColumnWidth(6, 220);
  sheet.setColumnWidth(7, 220);
  sheet.setColumnWidth(8, 110);
  sheet.setColumnWidth(9, 120);
  sheet.setColumnWidth(10, 140);
  sheet.setColumnWidth(11, 280);
  sheet.setColumnWidth(12, 380);
  sheet.setColumnWidth(13, 300);

  return sheet;
}

function MASTER_dashboardHeaders_() {
  return [
    "timestamp_iso_ms",
    "date_local",
    "time_local",
    "epoch_ms",
    "event_type",
    "action",
    "user",
    "status",
    "duration_ms",
    "remaining_quota_hint",
    "error_message",
    "stack_trace",
    "meta_json"
  ];
}

function MASTER_applyDashboardFormatting_() {
  const sheet = MASTER_ensureDashboardSheet_();
  const headers = MASTER_dashboardHeaders_();
  const headerRange = sheet.getRange(1, 1, 1, headers.length);

  headerRange
    .setFontWeight("bold")
    .setBackground("#111827")
    .setFontColor("#F9FAFB");

  const statusCol = 8;
  const newRules = [];

  newRules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("success")
      .setBackground(MASTER_CONFIG.THEME.SUCCESS)
      .setFontColor("#0B1220")
      .setRanges([sheet.getRange(2, statusCol, sheet.getMaxRows() - 1, 1)])
      .build()
  );

  newRules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("warning")
      .setBackground(MASTER_CONFIG.THEME.WARNING)
      .setFontColor("#0B1220")
      .setRanges([sheet.getRange(2, statusCol, sheet.getMaxRows() - 1, 1)])
      .build()
  );

  newRules.push(
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo("failure")
      .setBackground(MASTER_CONFIG.THEME.DANGER)
      .setFontColor("#F9FAFB")
      .setRanges([sheet.getRange(2, statusCol, sheet.getMaxRows() - 1, 1)])
      .build()
  );

  sheet.setConditionalFormatRules(newRules);
  sheet.setRowHeights(2, Math.min(sheet.getMaxRows() - 1, 200), 24);
}

/**
 * Central logger (writes to Master Dashboard) 🧾
 */
function MASTER_logEvent_(payload) {
  const sheet = MASTER_ensureDashboardSheet_();

  const now = new Date();
  const iso = MASTER_nowIsoMs_(now);
  const epochMs = now.getTime();

  const dateLocal = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd");
  const timeLocal = Utilities.formatDate(now, Session.getScriptTimeZone(), "HH:mm:ss");

  const user = MASTER_safeUserEmail_();

  const eventType = (payload && payload.eventType) ? String(payload.eventType) : "unknown";
  const action = (payload && payload.action) ? String(payload.action) : "unknown";
  const status = (payload && payload.status) ? String(payload.status) : "success";
  const durationMs = (payload && typeof payload.durationMs === "number") ? payload.durationMs : "";
  const remainingQuotaHint = MASTER_quotaHint_();

  const errorMessage = payload && payload.error ? MASTER_errorMessage_(payload.error) : "";
  const stackTrace = payload && payload.error ? MASTER_errorStack_(payload.error) : "";
  const metaJson = JSON.stringify((payload && payload.meta) ? payload.meta : {});

  const row = [
    iso,
    dateLocal,
    timeLocal,
    epochMs,
    eventType,
    action,
    user,
    status,
    durationMs,
    remainingQuotaHint,
    errorMessage,
    stackTrace,
    metaJson
  ];

  sheet.appendRow(row);

  if (MASTER_CONFIG.LOG_AUTO_TRIM_ENABLED) {
    MASTER_trimLogsIfNeeded_(sheet);
  }
}

function MASTER_trimLogsIfNeeded_(sheet) {
  const max = MASTER_CONFIG.LOG_MAX_ROWS;
  if (!max || max < 1000) return;

  const lastRow = sheet.getLastRow();
  if (lastRow <= max) return;

  const rowsToDelete = lastRow - max;
  if (rowsToDelete > 0) {
    sheet.deleteRows(2, rowsToDelete);
  }
}

/** =======================================================================
 * TRIGGERS
 * ======================================================================= */

function MASTER_ensureTriggers_() {
  if (!MASTER_CONFIG.LOG_INCLUDE_EDIT_EVENTS) return;

  // 🛡️ SAFEGUARD: Try to access triggers, catch permissions/context errors
  try {
    const ss = SpreadsheetApp.getActive();
    const triggers = ScriptApp.getProjectTriggers();

    const hasEdit = triggers.some(t => t.getHandlerFunction() === "MASTER_onEditHandler");
    if (!hasEdit) {
      ScriptApp.newTrigger("MASTER_onEditHandler")
        .forSpreadsheet(ss)
        .onEdit()
        .create();
    }
  } catch (e) {
    console.warn('MASTER_ensureTriggers_ skipped (Permissions or Context):', e.message);
  }
}

function MASTER_onEditHandler(e) {
  const perf = MASTER_perfStart_();
  try {
    const sheetName = e && e.range ? e.range.getSheet().getName() : "";
    const a1 = e && e.range ? e.range.getA1Notation() : "";
    const oldValue = (e && typeof e.oldValue !== "undefined") ? e.oldValue : "";
    const value = (e && e.range) ? e.range.getDisplayValue() : "";

    MASTER_logEvent_({
      eventType: "edit",
      action: "sheet_edit",
      status: "success",
      durationMs: MASTER_perfEnd_(perf),
      meta: {
        sheet: sheetName,
        range: a1,
        oldValue: oldValue,
        newValue: value
      }
    });
  } catch (err) {
    MASTER_logEvent_({
      eventType: "edit",
      action: "sheet_edit",
      status: "failure",
      durationMs: MASTER_perfEnd_(perf),
      error: err
    });
  }
}

/** =======================================================================
 * LINK STORAGE + API
 * ======================================================================= */

function MASTER_getLink_(key) {
  const props = PropertiesService.getDocumentProperties();
  const stored = props.getProperty(`MASTER_LINK_${key}`);
  if (stored !== null && stored !== undefined) return String(stored).trim();
  return String((MASTER_CONFIG.LINKS && MASTER_CONFIG.LINKS[key]) || "").trim();
}

function MASTER_setLink_(key, url) {
  const perf = MASTER_perfStart_();
  try {
    const cleanKey = String(key || "").trim().toUpperCase();
    const cleanUrl = String(url || "").trim();
    PropertiesService.getDocumentProperties().setProperty(`MASTER_LINK_${cleanKey}`, cleanUrl);

    MASTER_logEvent_({
      eventType: "config",
      action: `set_link_${cleanKey}`,
      status: "success",
      durationMs: MASTER_perfEnd_(perf),
      meta: { url: cleanUrl }
    });

    if (MASTER_CONFIG.ENABLE_TOASTS) {
      try {
        SpreadsheetApp.getActive().toast(`✅ Saved link for ${cleanKey}`, "Link Manager 🔗", 3);
      } catch (uiErr) {}
    }

    return { ok: true };
  } catch (err) {
    MASTER_logEvent_({
      eventType: "config",
      action: "set_link",
      status: "failure",
      durationMs: MASTER_perfEnd_(perf),
      error: err,
      meta: { key: key, url: url }
    });
    return { ok: false, message: MASTER_errorMessage_(err) };
  }
}

function MASTER_resetLinks() {
  const perf = MASTER_perfStart_();
  try {
    const props = PropertiesService.getDocumentProperties();
    Object.keys(MASTER_CONFIG.LINKS).forEach(k => props.deleteProperty(`MASTER_LINK_${k}`));

    MASTER_logEvent_({
      eventType: "config",
      action: "reset_links",
      status: "success",
      durationMs: MASTER_perfEnd_(perf)
    });

    if (MASTER_CONFIG.ENABLE_TOASTS) {
      try {
        SpreadsheetApp.getActive().toast("🔄 Links reset to blank defaults", "Link Manager 🔗", 3);
      } catch (uiErr) {}
    }
  } catch (err) {
    MASTER_logEvent_({
      eventType: "config",
      action: "reset_links",
      status: "failure",
      durationMs: MASTER_perfEnd_(perf),
      error: err
    });
    throw err;
  }
}

function MASTER_apiGetLinks() {
  const links = {};
  Object.keys(MASTER_CONFIG.LINKS).forEach(k => (links[k] = MASTER_getLink_(k)));
  return {
    ok: true,
    links: links,
    theme: MASTER_CONFIG.THEME,
    menuName: MASTER_CONFIG.MENU_NAME
  };
}

function MASTER_apiSetLink(payload) {
  const key = payload && payload.key ? payload.key : "";
  const url = payload && payload.url ? payload.url : "";
  return MASTER_setLink_(key, url);
}

/** =======================================================================
 * FOLDER MANAGEMENT
 * ======================================================================= */

function MASTER_createProjectFolder() {
  const perf = MASTER_perfStart_();
  try {
    const ss = SpreadsheetApp.getActive();
    const name = ss.getName();
    const parentId = MASTER_getLink_("PARENT_FOLDER");

    const parent = parentId ? DriveApp.getFolderById(parentId) : DriveApp.getRootFolder();
    const projectFolder = parent.createFolder(`🗂️ ${name} — Project Assets`);

    const sub = [
      "📦 Exports",
      "🧾 Logs",
      "🧪 Colab",
      "🐙 GitHub",
      "🌐 WebApp",
      "🗃️ Archive"
    ].map(n => projectFolder.createFolder(n));

    PropertiesService.getDocumentProperties().setProperty("MASTER_PROJECT_FOLDER_ID", projectFolder.getId());

    MASTER_logEvent_({
      eventType: "drive",
      action: "create_project_folder",
      status: "success",
      durationMs: MASTER_perfEnd_(perf),
      meta: { folderId: projectFolder.getId(), folderName: projectFolder.getName() }
    });

    if (MASTER_CONFIG.ENABLE_TOASTS) {
      try {
        SpreadsheetApp.getActive().toast("✅ Project folder created in Drive!", "Folder Manager 🗂️", 4);
      } catch (uiErr) {}
    }

    return { ok: true, folderId: projectFolder.getId(), folderUrl: projectFolder.getUrl() };
  } catch (err) {
    MASTER_logEvent_({
      eventType: "drive",
      action: "create_project_folder",
      status: "failure",
      durationMs: MASTER_perfEnd_(perf),
      error: err
    });
    return { ok: false, message: MASTER_errorMessage_(err) };
  }
}

function MASTER_getProjectFolderInfo() {
  const id = PropertiesService.getDocumentProperties().getProperty("MASTER_PROJECT_FOLDER_ID");
  if (!id) return { ok: false, message: "No project folder created yet." };
  try {
    const f = DriveApp.getFolderById(id);
    return { ok: true, folderId: id, folderUrl: f.getUrl(), folderName: f.getName() };
  } catch (err) {
    return { ok: false, message: MASTER_errorMessage_(err) };
  }
}

function MASTER_openProjectFolder() {
  const perf = MASTER_perfStart_();
  try {
    const info = MASTER_getProjectFolderInfo();
    if (!info.ok) {
      MASTER_showFolderManagerDialog();
      return;
    }
    MASTER_openUrlDirect_(info.folderUrl, "🗂️ Project Folder");

    MASTER_logEvent_({
      eventType: "drive",
      action: "open_project_folder",
      status: "success",
      durationMs: MASTER_perfEnd_(perf),
      meta: info
    });
  } catch (err) {
    MASTER_logEvent_({
      eventType: "drive",
      action: "open_project_folder",
      status: "failure",
      durationMs: MASTER_perfEnd_(perf),
      error: err
    });
    throw err;
  }
}

/** =======================================================================
 * HTML BUILDERS
 * ======================================================================= */

function MASTER_htmlWebApp_() {
  const t = MASTER_configForUi_();
  const html = HtmlService.createHtmlOutput(MASTER_uiHtml_("webapp", t));
  return html;
}

function MASTER_htmlSidebar_() {
  const t = MASTER_configForUi_();
  const html = HtmlService.createHtmlOutput(MASTER_uiHtml_("sidebar", t));
  return html;
}

function MASTER_htmlAboutDialog_() {
  const t = MASTER_configForUi_();
  const html = HtmlService.createHtmlOutput(MASTER_uiHtml_("about", t)).setWidth(520).setHeight(520);
  return html;
}

function MASTER_htmlLinkManagerDialog_() {
  const t = MASTER_configForUi_();
  const html = HtmlService.createHtmlOutput(MASTER_uiHtml_("links", t)).setWidth(560).setHeight(560);
  return html;
}

function MASTER_htmlFolderManagerDialog_() {
  const t = MASTER_configForUi_();
  const html = HtmlService.createHtmlOutput(MASTER_uiHtml_("folders", t)).setWidth(560).setHeight(560);
  return html;
}

function MASTER_htmlRecentLogsDialog_() {
  const t = MASTER_configForUi_();
  const html = HtmlService.createHtmlOutput(MASTER_uiHtml_("logs", t)).setWidth(780).setHeight(560);
  return html;
}

function MASTER_configForUi_() {
  return {
    theme: MASTER_CONFIG.THEME,
    links: (function () {
      const out = {};
      Object.keys(MASTER_CONFIG.LINKS).forEach(k => (out[k] = MASTER_getLink_(k)));
      return out;
    })(),
    brand: MASTER_CONFIG.THEME.BRAND_NAME,
    menuName: MASTER_CONFIG.MENU_NAME
  };
}

function MASTER_uiHtml_(surface, t) {
  const theme = t.theme;
  const dataJson = JSON.stringify({
    surface: surface,
    theme: theme,
    links: t.links,
    brand: t.brand,
    menuName: t.menuName
  });

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${MASTER_escapeHtml_(t.brand)}</title>
  <style>
    :root{--bg:${theme.BG};--card:${theme.CARD};--text:${theme.TEXT};--muted:${theme.MUTED};--primary:${theme.PRIMARY};--secondary:${theme.SECONDARY};--accent:${theme.ACCENT};--success:${theme.SUCCESS};--warning:${theme.WARNING};--danger:${theme.DANGER};}
    *{box-sizing:border-box}
    body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;background:radial-gradient(1200px 800px at 10% 0%,rgba(109,40,217,.35),transparent 55%),radial-gradient(900px 600px at 90% 15%,rgba(6,182,212,.25),transparent 55%),radial-gradient(1000px 700px at 50% 100%,rgba(245,158,11,.18),transparent 60%),var(--bg);color:var(--text);min-height:100vh}
    .wrap{padding:16px;max-width:980px;margin:0 auto}
    .topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;background:linear-gradient(180deg,rgba(17,26,46,.95),rgba(17,26,46,.75));border:1px solid rgba(255,255,255,.08);padding:14px;border-radius:18px;box-shadow:0 14px 40px rgba(0,0,0,.35);backdrop-filter:blur(10px);position:sticky;top:10px;z-index:5}
    .brand{display:flex;align-items:center;gap:10px}
    .logo{width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,var(--primary),var(--secondary));display:grid;place-items:center;box-shadow:0 10px 25px rgba(0,0,0,.35)}
    .brand h1{font-size:16px;margin:0;line-height:1.1}
    .brand p{margin:0;color:var(--muted);font-size:12px}
    .grid{display:grid;grid-template-columns:repeat(12,1fr);gap:14px;margin-top:14px}
    .card{grid-column:span 12;background:linear-gradient(180deg,rgba(17,26,46,.92),rgba(17,26,46,.75));border:1px solid rgba(255,255,255,.08);border-radius:18px;padding:14px;box-shadow:0 14px 40px rgba(0,0,0,.30);transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
    .card:hover{transform:translateY(-2px);border-color:rgba(255,255,255,.16);box-shadow:0 18px 48px rgba(0,0,0,.36)}
    .card h2{margin:0 0 8px 0;font-size:14px}
    .muted{color:var(--muted);font-size:12px;line-height:1.4}
    .btnrow{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}
    button,.btn{appearance:none;border:none;cursor:pointer;padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.10);color:var(--text);font-weight:600;transition:transform .12s ease,background .12s ease,border-color .12s ease;display:inline-flex;align-items:center;gap:8px}
    button:hover,.btn:hover{transform:translateY(-1px);background:rgba(255,255,255,.10);border-color:rgba(255,255,255,.16)}
    .primary{background:linear-gradient(135deg,var(--primary),rgba(109,40,217,.65));border-color:rgba(255,255,255,.12)}
    .secondary{background:linear-gradient(135deg,var(--secondary),rgba(6,182,212,.55));border-color:rgba(255,255,255,.12)}
    .toast{position:fixed;left:16px;bottom:16px;background:rgba(17,26,46,.95);border:1px solid rgba(255,255,255,.12);padding:10px 12px;border-radius:14px;box-shadow:0 14px 40px rgba(0,0,0,.35);opacity:0;transform:translateY(8px);transition:opacity .18s ease,transform .18s ease;font-size:12px;max-width:520px;z-index:10}
    .toast.show{opacity:1;transform:translateY(0)}
    .field{display:flex;flex-direction:column;gap:6px;margin-top:10px}
    label{font-size:12px;color:var(--muted)}
    input{padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:var(--text);outline:none}
    input:focus{border-color:rgba(109,40,217,.65);box-shadow:0 0 0 3px rgba(109,40,217,.18)}
    table{width:100%;border-collapse:collapse;overflow:hidden;border-radius:16px;border:1px solid rgba(255,255,255,.10);margin-top:10px;background:rgba(0,0,0,.10)}
    th,td{padding:10px;font-size:12px;border-bottom:1px solid rgba(255,255,255,.08);vertical-align:top}
    th{color:var(--muted);text-align:left;font-weight:700}
    .tag{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.06);font-size:12px;color:var(--text)}
    .kbd{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;font-size:11px;background:rgba(255,255,255,.08);padding:2px 6px;border-radius:8px;border:1px solid rgba(255,255,255,.12)}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="topbar">
      <div class="brand">
        <div class="logo">✨</div>
        <div>
          <h1>${MASTER_escapeHtml_(t.brand)}</h1>
          <p>${MASTER_escapeHtml_(surface.toUpperCase())} • Joyful automation 😄⚡</p>
        </div>
      </div>
    </div>
    <div id="toast" class="toast"></div>
    <div class="grid">
      <div class="card" style="grid-column:span 12">
        <h2>🧭 Quick Navigation</h2>
        <div class="muted">Open your key destinations instantly 🔗</div>
        <div class="btnrow">
          <button class="primary" onclick="openLink('COLAB')">🧪 Colab</button>
          <button class="secondary" onclick="openLink('GITHUB')">🐙 GitHub</button>
          <button onclick="openDashboard()">📊 Dashboard</button>
          <button onclick="showLinks()">🔗 Link Manager</button>
        </div>
      </div>
      ${surface === "links" ? MASTER_uiSectionLinks_() : ""}
      ${surface === "folders" ? MASTER_uiSectionFolders_() : ""}
      ${surface === "logs" ? MASTER_uiSectionLogs_() : ""}
      ${surface === "about" ? MASTER_uiSectionAbout_() : ""}
    </div>
  </div>
  <script>
    const APP=${dataJson};
    function toast(msg,mood){const el=document.getElementById('toast');el.textContent=(mood?mood+" ":"")+msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2200)}
    function openLink(key){google.script.run.withSuccessHandler(()=>toast("Launching "+key+" ⚡","🚀")).MASTER_openLinkKey_(key,{from:APP.surface})}
    function openDashboard(){google.script.run.MASTER_openDashboard();toast("Opening dashboard 📊","🧾")}
    function showLinks(){google.script.run.MASTER_showLinkManagerDialog();toast("Opening Link Manager 🔗","🧠")}
    function loadLinks(){google.script.run.withSuccessHandler(function(res){if(!res||!res.ok)return;const links=res.links||{};Object.keys(links).forEach(function(k){const input=document.getElementById("link_"+k);if(input)input.value=links[k]||""});toast("Links loaded ✅","📦")}).MASTER_apiGetLinks()}
    function saveLink(key){const input=document.getElementById("link_"+key);const url=input?input.value:"";google.script.run.withSuccessHandler(function(res){if(res&&res.ok){toast("Saved "+key+" ✅","🔗")}else{toast("Save failed","🚨")}}).MASTER_apiSetLink({key:key,url:url})}
    function resetLinks(){google.script.run.withSuccessHandler(function(){toast("Links reset 🔄","🧼");setTimeout(loadLinks,400)}).MASTER_resetLinks()}
    function createProjectFolder(){google.script.run.withSuccessHandler(function(res){if(res&&res.ok){toast("Folder created ✅","🗂️");setTimeout(refreshFolderInfo,400)}else{toast("Create failed","🚨")}}).MASTER_createProjectFolder()}
    function refreshFolderInfo(){google.script.run.withSuccessHandler(function(res){const box=document.getElementById("folderInfo");if(!box)return;if(res&&res.ok){box.innerHTML='<div class="tag">🗂️ '+res.folderName+'</div><div class="muted" style="margin-top:8px">Folder ID: <span class="kbd">'+res.folderId+'</span></div>'}else{box.innerHTML='<div class="muted">No project folder yet.</div>'}}).MASTER_getProjectFolderInfo()}
    function loadRecentLogs(){const tbody=document.getElementById("logsTbody");if(!tbody)return;tbody.innerHTML='<tr><td colspan="6" class="muted">Loading…</td></tr>';google.script.run.withSuccessHandler(function(rows){tbody.innerHTML="";if(!rows||!rows.length){tbody.innerHTML='<tr><td colspan="6" class="muted">No logs yet.</td></tr>';return}rows.forEach(function(r){const tr=document.createElement("tr");tr.innerHTML='<td>'+r.timestamp+'</td><td>'+r.eventType+'</td><td>'+r.action+'</td><td>'+r.user+'</td><td>'+r.status+'</td><td class="muted">'+r.meta+'</td>';tbody.appendChild(tr)});toast("Logs loaded 🧾","📊")}).MASTER_apiGetRecentLogs(30)}
    (function init(){if(APP.surface==="links")loadLinks();if(APP.surface==="folders")refreshFolderInfo();if(APP.surface==="logs")loadRecentLogs()})();
  </script>
</body>
</html>`;
}

function MASTER_uiSectionLinks_() {
  return `<div class="card" style="grid-column:span 12"><h2>🔗 Link Manager</h2><div class="muted">Set your project links once, then menu items will launch them instantly ⚡</div>
${MASTER_uiLinkField_("COLAB","🧪 Google Colab URL")}
${MASTER_uiLinkField_("GITHUB","🐙 GitHub Repo URL")}
${MASTER_uiLinkField_("WEBAPP","🚀 Deployed Web App URL")}
${MASTER_uiLinkField_("PARENT_FOLDER","🗂️ Drive Parent Folder ID")}
<div class="btnrow" style="margin-top:12px"><button onclick="resetLinks()">🧼 Reset All Links</button></div></div>`;
}

function MASTER_uiLinkField_(key, label) {
  return `<div class="field"><label>${label}</label><input id="link_${key}" placeholder="Paste here…"/><div class="btnrow"><button class="primary" onclick="saveLink('${key}')">💾 Save ${key}</button><button onclick="openLink('${key}')">🔗 Test</button></div></div>`;
}

function MASTER_uiSectionFolders_() {
  return `<div class="card" style="grid-column:span 12"><h2>🗂️ Folder Manager</h2><div class="muted">Create a Drive folder structure for this project 📁✨</div><div class="btnrow" style="margin-top:10px"><button class="primary" onclick="createProjectFolder()">➕ Create Project Folder</button></div><div id="folderInfo" class="card" style="margin-top:14px"></div></div>`;
}

function MASTER_uiSectionLogs_() {
  return `<div class="card" style="grid-column:span 12"><h2>🧾 Recent Logs</h2><div class="btnrow" style="margin-top:10px"><button onclick="loadRecentLogs()">🔄 Refresh</button><button onclick="openDashboard()">📊 Open Dashboard</button></div><table><thead><tr><th>timestamp</th><th>type</th><th>action</th><th>user</th><th>status</th><th>meta</th></tr></thead><tbody id="logsTbody"><tr><td colspan="6" class="muted">Loading…</td></tr></tbody></table></div>`;
}

function MASTER_uiSectionAbout_() {
  return `<div class="card" style="grid-column:span 12"><h2>💡 About</h2><div class="muted">This template provides: 📊 Master Dashboard with rich logs, 🧭 Emoji menu navigation, 🎨 Web App + Sidebar + Dialog suite, 🗂️ Folder Manager for project organization.</div></div>`;
}

/** =======================================================================
 * RECENT LOGS API
 * ======================================================================= */

function MASTER_apiGetRecentLogs(limit) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(MASTER_CONFIG.DASHBOARD_SHEET_NAME);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const headers = MASTER_dashboardHeaders_();
  const n = Math.max(1, Math.min(Number(limit || 30), 200));
  const startRow = Math.max(2, lastRow - n + 1);
  const numRows = lastRow - startRow + 1;

  const values = sheet.getRange(startRow, 1, numRows, headers.length).getValues();
  values.reverse();

  return values.map(r => ({
    timestamp: r[0],
    eventType: r[4],
    action: r[5],
    user: r[6],
    status: r[7],
    meta: r[12]
  }));
}

/** =======================================================================
 * UTILITIES
 * ======================================================================= */

function MASTER_perfStart_() { return { t0: Date.now() }; }
function MASTER_perfEnd_(perf) { return Math.max(0, Date.now() - (perf && perf.t0 ? perf.t0 : Date.now())); }

function MASTER_nowIsoMs_(d) {
  const dt = d instanceof Date ? d : new Date();
  return dt.toISOString();
}

function MASTER_safeUserEmail_() {
  try { const email = Session.getActiveUser().getEmail(); if (email) return email; } catch (e) {}
  try { const email2 = Session.getEffectiveUser().getEmail(); if (email2) return email2; } catch (e2) {}
  return "unknown";
}

function MASTER_quotaHint_() {
  try { const remaining = ScriptApp.getRemainingDailyQuota(); return "remainingDailyQuota=" + remaining; } catch (e) { return "quota=n/a"; }
}

function MASTER_errorMessage_(err) {
  try { if (!err) return ""; if (typeof err === "string") return err; if (err.message) return String(err.message); return String(err); } catch (e) { return "Unknown error"; }
}

function MASTER_errorStack_(err) {
  try { if (!err) return ""; if (err.stack) return String(err.stack); return ""; } catch (e) { return ""; }
}

function MASTER_escapeHtml_(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** =======================================================================
 * HOST INTEGRATION HELPERS
 * ======================================================================= */

function MASTER_hostOnOpen_(e) {
  try { MASTER_onOpen_(e); } catch (err) { try { console.error("MASTER_hostOnOpen_ error:", err && err.stack ? err.stack : err); } catch (e2) {} }
}

function MASTER_handleDoGet_(e) {
  return MASTER_doGet_(e);
}

function DEBUG_addMenu_() {
  try { DEBUG_onOpen_({}); } catch (err) { try { console.log("DEBUG_addMenu_ skipped:", err && err.message); } catch (e2) {} }
}