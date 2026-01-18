/**
 * 🛠️ UTILITIES (Utilities.gs)
 * ============================================================================
 * Shared helper functions for the Text Expansion Manager.
 * Moved from Code.gs for better organization.
 * ============================================================================
 */

// ============================================================================
// TEMPLATE INCLUDE HELPER
// ============================================================================

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ============================================================================
// GENERIC URL OPENER
// ============================================================================

function openUrl_(url, title) {
  const html = HtmlService.createHtmlOutput(
    `<html>
      <script>
        window.open('${url}', '_blank');
        google.script.host.close();
      </script>
      <body style="font-family: sans-serif; padding: 20px;">
        <h3>Opening ${title}...</h3>
        <p>If the tab didn't open, <a href="${url}" target="_blank">click here</a>.</p>
      </body>
    </html>`
  ).setWidth(400).setHeight(150);
  SpreadsheetApp.getUi().showModalDialog(html, title);
}

// ============================================================================
// SPREADSHEET UTILITIES 🧰
// ============================================================================

function ensureSheets_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shortcuts = ss.getSheetByName(CFG.SHEET_SHORTCUTS) || ss.insertSheet(CFG.SHEET_SHORTCUTS);
  const favorites = ss.getSheetByName(CFG.SHEET_FAVORITES) || ss.insertSheet(CFG.SHEET_FAVORITES);

  ensureHeaderRow_(shortcuts, HEADERS_SHORTCUTS);
  ensureHeaderRow_(favorites, HEADERS_FAVORITES);

  shortcuts.setFrozenRows(1);
  favorites.setFrozenRows(1);
}

function ensureHeaderRow_(sheet, headers) {
  const lastCol = Math.max(sheet.getLastColumn(), headers.length);
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v || '').trim());
  const needs = headers.some((h, i) => existing[i] !== h);

  if (sheet.getLastRow() === 0 || needs) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  }
}

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error(`Missing sheet: ${name}`);
  return sheet;
}

function indexHeader_(headerRow) {
  const idx = {};
  for (let i = 0; i < headerRow.length; i++) {
    const h = String(headerRow[i] || '').trim();
    if (h) {
      idx[h] = i;
      idx[h.toLowerCase()] = i;
    }
  }
  return idx;
}

// ============================================================================
// DATA & WEB HELPERS
// ============================================================================

function safeJsonParse_(s) {
  try { return JSON.parse(String(s)); } catch (err) { return null; }
}

function stringifyError_(err) {
  try { return err && err.stack ? String(err.stack) : String(err); } catch (e) { return 'Unknown error'; }
}

function getUserEmail_() {
  try { return Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail() || ''; }
  catch (err) { return ''; }
}

function getWebAppUrl_() {
  return PropertiesService.getScriptProperties().getProperty('WEB_APP_URL')
    || PropertiesService.getScriptProperties().getProperty('WEBAPPURL')
    || '';
}

/**
 * One-time setup: store the deployed web app URL in Script Properties
 */
function storeWebAppUrl() {
  const url = "https://script.google.com/macros/s/AKfycbyR4SKUr9Fvs_3RLV1xWT5xjTTNxLoYPd94cthYADOZ/dev";
  PropertiesService.getScriptProperties().setProperty("WEBAPPURL", url);
  const saved = PropertiesService.getScriptProperties().getProperty("WEBAPPURL");
  Logger.log("✅ Web App URL stored successfully: " + saved);
  return "URL saved: " + saved;
}

function generateShortcutId_() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 6);
  return `SC-${timestamp}-${random}`.toUpperCase();
}
