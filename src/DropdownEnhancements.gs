/**
 * DropdownEnhancements.gs (Revised ✅ + Description support)
 * ========================================================
 * Enhanced dropdown columns for Text Expander Manager
 *
 * Adds / validates 6 dropdown columns on the Shortcuts sheet:
 * - Description ✅ (NEW)
 * - MainCategory
 * - Subcategory
 * - FontStyle
 * - Platform
 * - UsageFrequency
 *
 * Key improvements:
 * ✅ Header-based column detection (no fragile hard-coded column numbers)
 * ✅ Uses a helper sheet with option ranges (easy to edit without code)
 * ✅ Writes options from defaults + existing sheet values (auto-learns)
 * ✅ Applies validation down to a safe row window (performance-friendly)
 * ✅ Optional strict/lenient mode (AllowInvalid true/false)
 */

const DROPDOWN_ENH_SHEET = {
  SHORTCUTS: "Shortcuts",
  OPTIONS: "Options_Dropdowns"
};

const DROPDOWN_ENH_HEADERS = {
  DESCRIPTION: "Description",
  MAIN_CATEGORY: "MainCategory",
  SUBCATEGORY: "Subcategory",
  FONT_STYLE: "FontStyle",
  PLATFORM: "Platform",
  USAGE_FREQUENCY: "UsageFrequency"
};

const DROPDOWN_ENH_DEFAULTS = {
  DESCRIPTION: [
    "general",
    "greetings",
    "fonts",
    "numbers",
    "address",
    "personal",
    "symbols",
    "kaomoji",
    "email",
    "zodiac"
  ],
  MAIN_CATEGORY: ["Static", "Emc"],
  SUBCATEGORY: ["Tags", "Animals", "Smileys", "Activities", "Travel", "Misc"],
  FONT_STYLE: ["", "Standard", "Fancy", "Unicode", "Symbols"],
  PLATFORM: ["GBOARD", "IOS", "ANDROID", "WINDOWS", "MAC", "WEB"],
  USAGE_FREQUENCY: ["", "rare", "sometimes", "often", "daily"]
};

const DROPDOWN_ENH_COLUMNS = [
  {
    key: "DESCRIPTION",
    header: DROPDOWN_ENH_HEADERS.DESCRIPTION,
    allowInvalid: true,
    note: "🏷️ Description/Type: used for UI filtering (chips) & your own organizing. Does NOT change snippet output text."
  },
  {
    key: "MAIN_CATEGORY",
    header: DROPDOWN_ENH_HEADERS.MAIN_CATEGORY,
    allowInvalid: true,
    note: "🗂️ MainCategory: your high-level bucket (ex: Static, Emc)."
  },
  {
    key: "SUBCATEGORY",
    header: DROPDOWN_ENH_HEADERS.SUBCATEGORY,
    allowInvalid: true,
    note: "📁 Subcategory: smaller grouping inside MainCategory (ex: Animals, Tags)."
  },
  {
    key: "FONT_STYLE",
    header: DROPDOWN_ENH_HEADERS.FONT_STYLE,
    allowInvalid: true,
    note: "🔤 FontStyle: stylistic label for the snippet (helps filtering)."
  },
  {
    key: "PLATFORM",
    header: DROPDOWN_ENH_HEADERS.PLATFORM,
    allowInvalid: true,
    note: "📱 Platform: where you use it (Gboard/iOS/etc)."
  },
  {
    key: "USAGE_FREQUENCY",
    header: DROPDOWN_ENH_HEADERS.USAGE_FREQUENCY,
    allowInvalid: true,
    note: "⏱️ UsageFrequency: how often you use it (rare/daily/etc)."
  }
];

/**
 * MAIN ENTRY ✅
 * Run this to create/update the dropdowns (including Description) + notes
 */
function addEnhancedDropdowns() {
  const ss = SpreadsheetApp.getActive();
  const sh = ensureSheet_(ss, DROPDOWN_ENH_SHEET.SHORTCUTS);

  ensureHeadersExist_(sh, Object.values(DROPDOWN_ENH_HEADERS));
  applyHeaderNotes_(sh);

  const optionsSheet = ensureSheet_(ss, DROPDOWN_ENH_SHEET.OPTIONS);
  buildOptionsSheet_(sh, optionsSheet);

  applyDropdownValidations_(sh, optionsSheet);

  SpreadsheetApp.getUi().alert("✅ Dropdowns updated!\n\nIncludes: Description + Category dropdowns 🎉");
}

/**
 * Removes dropdown validations for the enhanced columns (does not delete data)
 */
function removeEnhancedDropdowns() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(DROPDOWN_ENH_SHEET.SHORTCUTS);
  if (!sh) {
    SpreadsheetApp.getUi().alert("⚠️ 'Shortcuts' sheet not found.");
    return;
  }

  const map = getHeaderMap_(sh);
  DROPDOWN_ENH_COLUMNS.forEach(col => {
    const idx = map[col.header];
    if (!idx) return;
    const rng = sh.getRange(2, idx, Math.max(sh.getMaxRows() - 1, 1), 1);
    rng.clearDataValidations();
  });

  SpreadsheetApp.getUi().alert("🧹 Dropdown validations removed (data kept).");
}

/**
 * Applies header notes (mini-help) so you don't break things accidentally 😄
 */
function applyHeaderNotes_(sheet) {
  const map = getHeaderMap_(sheet);
  DROPDOWN_ENH_COLUMNS.forEach(col => {
    const idx = map[col.header];
    if (!idx) return;
    sheet.getRange(1, idx).setNote(col.note);
  });

  // Also add notes to core columns if present
  const coreNotes = {
    "Snippet Name": "✏️ Trigger text you type (what expands). Example: 'ty' → 'Thank you!'.",
    "Content": "🧾 The expanded content that gets inserted when you trigger it.",
    "Application": "📦 Where this snippet belongs (ex: GBOARD).",
    "Language": "🌍 Language label (helps search/filter).",
    "Tags": "🏷️ Extra keywords (comma-separated is fine).",
    "UpdatedAt": "🕒 Auto or manual timestamp field (depends on your pipeline)."
  };

  Object.keys(coreNotes).forEach(h => {
    const idx = map[h];
    if (idx) sheet.getRange(1, idx).setNote(coreNotes[h]);
  });
}

/**
 * Build the Options_Dropdowns sheet from:
 * - defaults
 * - plus whatever already exists in the Shortcuts sheet columns (auto-learn ✅)
 */
function buildOptionsSheet_(shortcutsSheet, optionsSheet) {
  optionsSheet.clear();

  const map = getHeaderMap_(shortcutsSheet);

  const existing = {};
  DROPDOWN_ENH_COLUMNS.forEach(col => {
    const idx = map[col.header];
    existing[col.key] = idx ? getUniqueColumnValues_(shortcutsSheet, idx) : [];
  });

  const merged = {};
  DROPDOWN_ENH_COLUMNS.forEach(col => {
    const def = (DROPDOWN_ENH_DEFAULTS[col.key] || []).map(v => normalizeOpt_(v));
    const ex = (existing[col.key] || []).map(v => normalizeOpt_(v));
    merged[col.key] = uniqueClean_(def.concat(ex)).filter(v => v !== "");
  });

  // Write header row
  const headers = DROPDOWN_ENH_COLUMNS.map(c => c.header);
  optionsSheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Compute max rows
  const lengths = DROPDOWN_ENH_COLUMNS.map(c => merged[c.key].length);
  const maxLen = Math.max(1, ...lengths);

  // Build rows
  const rows = [];
  for (let r = 0; r < maxLen; r++) {
    const row = [];
    DROPDOWN_ENH_COLUMNS.forEach(c => {
      row.push(merged[c.key][r] || "");
    });
    rows.push(row);
  }

  optionsSheet.getRange(2, 1, rows.length, headers.length).setValues(rows);

  // Pretty it up ✨
  optionsSheet.setFrozenRows(1);
  optionsSheet.autoResizeColumns(1, headers.length);
}

/**
 * Apply data validations to Shortcuts sheet based on options ranges
 */
function applyDropdownValidations_(shortcutsSheet, optionsSheet) {
  const shortcutsMap = getHeaderMap_(shortcutsSheet);
  const optionsMap = getHeaderMap_(optionsSheet);

  // Apply to a "safe window" for performance:
  // - covers all existing rows
  // - plus some future space
  const lastRow = Math.max(shortcutsSheet.getLastRow(), 2);
  const maxRows = shortcutsSheet.getMaxRows();
  const applyRows = Math.min(maxRows - 1, Math.max(lastRow - 1, 2000)); // up to 2000 rows of validation
  const startRow = 2;

  DROPDOWN_ENH_COLUMNS.forEach(col => {
    const sIdx = shortcutsMap[col.header];
    const oIdx = optionsMap[col.header];
    if (!sIdx || !oIdx) return;

    const optLastRow = Math.max(optionsSheet.getLastRow(), 2);
    const optRange = optionsSheet.getRange(2, oIdx, optLastRow - 1, 1);

    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInRange(optRange, true)
      .setAllowInvalid(col.allowInvalid)
      .build();

    const target = shortcutsSheet.getRange(startRow, sIdx, applyRows, 1);
    target.setDataValidation(rule);
  });
}

/**
 * Ensures a sheet exists, otherwise creates it
 */
function ensureSheet_(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

/**
 * Ensures headers exist in row 1; adds missing headers at the end
 */
function ensureHeadersExist_(sheet, headers) {
  const existing = sheet.getRange(1, 1, 1, sheet.getLastColumn() || 1).getValues()[0];
  const normalized = existing.map(v => String(v || "").trim());

  let changed = false;
  headers.forEach(h => {
    if (!normalized.includes(h)) {
      normalized.push(h);
      changed = true;
    }
  });

  if (changed) {
    sheet.getRange(1, 1, 1, normalized.length).setValues([normalized]);
  }
}

/**
 * Create a map: headerName -> columnIndex
 */
function getHeaderMap_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const map = {};
  headers.forEach((h, i) => {
    const key = String(h || "").trim();
    if (key) map[key] = i + 1;
  });
  return map;
}

/**
 * Reads unique values from a column (starting row 2)
 */
function getUniqueColumnValues_(sheet, colIndex) {
  const lastRow = Math.max(sheet.getLastRow(), 2);
  const values = sheet.getRange(2, colIndex, lastRow - 1, 1).getValues().flat();
  return uniqueClean_(values.map(v => String(v || "").trim())).filter(v => v !== "");
}

/**
 * Helpers 🛠️
 */
function uniqueClean_(arr) {
  const seen = new Set();
  const out = [];
  arr.forEach(v => {
    const s = String(v || "").trim();
    if (!s) return;
    const k = s.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(s);
  });
  return out;
}

function normalizeOpt_(v) {
  return String(v || "").trim();
}
