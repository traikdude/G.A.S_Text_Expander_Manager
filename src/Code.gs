/**
 * Text Expansion Manager — Google Apps Script Backend (Revised + Snapshot Fix ✅)
 * Author: traikdude + enhancements
 * Runtime: V8
 *
 * ✅ Fixes:
 * 1) Added CFG.SNAPSHOT_TTL_SECONDS (was missing → snapshot creation could throw) 🧯
 * 2) Snapshot now caches ONLY metadata; paging reads directly from the Sheet (more reliable for 10k+ rows) 🚀
 * 3) Added missing UI handlers used by the frontend: beginShortcutsSnapshotHandler + fetchNextShortcutsPageHandler 🧩
 * 4) Improved cache invalidation to remove chunk keys too 🧼
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const CFG = {
  SHEET_SHORTCUTS: 'Shortcuts',
  SHEET_FAVORITES: 'Favorites',
  MENU_NAME: 'Text Expansion Tools',

  CACHE_TTL_SECONDS: 60 * 10,
  CACHE_KEY_PREFIX: 'TEM_SHORTCUTS',
  CACHE_META_KEY: 'TEM_SHORTCUTS_META',
  CACHE_VER_KEY: 'TEM_SHORTCUTS_VER',

  // ✅ FIX: Snapshot TTL MUST exist (Cache putAll expects an Integer 1..21600)
  SNAPSHOT_TTL_SECONDS: 60 * 5, // 5 minutes 🕔
  SNAPSHOT_DRIVE_FOLDER_NAME: '_TEM_Snapshots', // Drive fallback folder
  SNAPSHOT_MAX_DRIVE_FILES: 25, // Keep last N snapshots in Drive
  SNAPSHOT_CHUNK_SIZE: 90000, // ~100KB safety margin for CacheService
  SNAPSHOT_CACHE_RETRIES: 2, // Retry count before Drive fallback

  // Import constraints
  MAX_IMPORT_ROWS: 10000,
  MAX_KEY_LEN: 80,
  MAX_FIELD_LEN: 50000,
  MAX_TAGS_LEN: 512,
  MAX_LANGUAGE_LEN: 64,
  MAX_APP_LEN: 128,
  MAX_DESC_LEN: 2000,

  // Paging
  INITIAL_PAGE_SIZE: 200, // keep modest to avoid client payload limits 📦
  DEBUG_MODE: true,

  // Tools
  PYTHON_URLS: {
    ML_CATEGORIZER: 'https://colab.research.google.com/github/traikdude/G.A.S_Text_Expander_Manager/blob/master/notebooks/MLCategorizer.ipynb',
    DATA_QUALITY: 'https://colab.research.google.com/github/traikdude/G.A.S_Text_Expander_Manager/blob/master/notebooks/DataQualityAnalyzer.ipynb',
    DUPLICATE_FINDER: 'https://colab.research.google.com/github/traikdude/G.A.S_Text_Expander_Manager/blob/master/notebooks/DuplicateFinder.ipynb',
    ANALYTICS: 'https://colab.research.google.com/github/traikdude/G.A.S_Text_Expander_Manager/blob/master/notebooks/AnalyticsDashboard.ipynb',
    BACKUP_SYSTEM: 'https://colab.research.google.com/github/traikdude/G.A.S_Text_Expander_Manager/blob/master/notebooks/BackupSystem.ipynb',
    DRIVE_BRIDGE: 'https://colab.research.google.com/github/traikdude/G.A.S_Text_Expander_Manager/blob/master/notebooks/DriveCategorizerBridge.ipynb',
    FONT_CATEGORIZER: 'https://colab.research.google.com/github/traikdude/G.A.S_Text_Expander_Manager/blob/master/notebooks/FontAwareCategorizer.ipynb',
    TEXT_EXPANDER_CATEGORIZER: 'https://colab.research.google.com/github/traikdude/G.A.S_Text_Expander_Manager/blob/master/notebooks/TextExpanderCategorizer.ipynb',
    FOLDER: 'https://drive.google.com/drive/u/0/my-drive'
  }
};

const HEADERS_SHORTCUTS = [
  'ID',
  'Snippet Name',
  'Content',
  'Application',
  'Description',
  'Language',
  'Tags',
  'UpdatedAt',
  // Optional enhanced dropdown columns (v2.x)
  'MainCategory',
  'Subcategory',
  'FontStyle',
  'Platform',
  'UsageFrequency',
];

const HEADERS_FAVORITES = [
  'UserEmail',
  'Snippet Name',
  'CreatedAt',
];

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
// SPREADSHEET SETUP + UTILITIES 🧰 (LEGACY / SHARED)
// ============================================================================
// Preserved for backward compatibility with ColabBridge.gs and other modules.
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