/**
 * ✅ Unified entry points for:
 * - 📝 Text Expansion Tools
 * - ⚙️ Master Automation Framework
 * - 🐞 Debug Harness (optional)
 *
 * IMPORTANT:
 * - There must be ONLY ONE onOpen(e) and ONLY ONE doGet(e) in the whole project.
 * - This file becomes the "traffic controller" 🚦
 */

/**
 * Reserved simple trigger: runs when the spreadsheet opens 🧭
 * This calls BOTH systems safely ✨
 */
function onOpen(e) {
  // 1) Text Expander menu + sheet setup
  try {
    if (typeof TEM_onOpen_ === "function") TEM_onOpen_(e);
  } catch (err) {
    console.error("TEM_onOpen_ failed:", err && err.stack ? err.stack : err);
  }

  // 2) Master Automation framework init + menu
  try {
    if (typeof MASTER_hostOnOpen_ === "function") MASTER_hostOnOpen_(e);
  } catch (err) {
    console.error("MASTER_hostOnOpen_ failed:", err && err.stack ? err.stack : err);
  }

  // 3) Optional Debug menu (does NOT consume reserved onOpen name)
  try {
    if (typeof DEBUG_addMenu_ === "function") DEBUG_addMenu_();
  } catch (err) {
    // ignore
  }
}

/**
 * Install trigger helper ✅
 */
function onInstall(e) {
  onOpen(e);
}

/**
 * Reserved Web App entry point 🌐
 * Router:
 *  - ?ui=master  -> Master Automation Web UI
 *  - default     -> Text Expander Manager Web UI
 */
function doGet(e) {
  const ui = String((e && e.parameter && (e.parameter.ui || e.parameter.app)) || "").toLowerCase();

  if (ui === "master") {
    if (typeof MASTER_handleDoGet_ !== "function") {
      return HtmlService.createHtmlOutput("❌ MASTER_handleDoGet_ not found. Paste the Master framework file first.");
    }
    return MASTER_handleDoGet_(e);
  }

  // Default: Text Expander web UI
  if (typeof TEM_doGet_ !== "function") {
    return HtmlService.createHtmlOutput("❌ TEM_doGet_ not found. Paste TEM entry file first.");
  }
  return TEM_doGet_(e);
}

/**
 * Helper: build a web app URL with a ui route param 🔗
 * Uses your existing WEB_APP_URL / WEBAPPURL Script Properties convention ✅
 */
function getWebAppUrlWithUi_(ui) {
  const base = (typeof getWebAppUrl_ === "function" ? getWebAppUrl_() : "") || "";
  if (!base) return "";

  const s = String(base);
  const parts = s.split("#");
  const baseNoHash = parts[0];
  const hash = parts[1] ? "#" + parts[1] : "";

  const hasQ = baseNoHash.indexOf("?") !== -1;
  const sep = hasQ ? "&" : "?";
  return baseNoHash + sep + "ui=" + encodeURIComponent(String(ui || "")) + hash;
}
