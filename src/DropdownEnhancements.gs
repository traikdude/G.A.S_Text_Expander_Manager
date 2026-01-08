/**
 * DropdownEnhancements.gs (Revised ✅)
 * =======================
 * Enhanced dropdown columns for Text Expander Manager
 *
 * Adds / validates 5 dropdown columns on the Shortcuts sheet:
 * - MainCategory
 * - Subcategory
 * - FontStyle
 * - Platform
 * - UsageFrequency
 *
 * Improvements vs original:
 * ✅ Header-based column detection (no fragile hard-coded column numbers)
 * ✅ Uses a helper sheet with option ranges (easy to edit without code)
 * ✅ Applies validation down to max rows (scales past 1000 rows)
 * ✅ Optional strict/lenient mode (AllowInvalid true/false)
 * ✅ Batch-style updates (fewer calls, faster)
 *
 * Author: GAS Master 🤖✨
 * Version: 2.0.0
 * Date: 2026-01-08
 */

// ============================================================================
// DROPDOWN CONFIGURATION
// ============================================================================

const DROPDOWN_CONFIG = {
  // Helper sheet name where dropdown options are stored (range-based validation)
  OPTIONS_SHEET_NAME: '_TEM_DropdownOptions',

  // Main Category options (10)
  MAIN_CATEGORIES: [
    '🎯 Text Formatting',
    '🔣 Symbols & Special Characters',
    '😊 Emojis & Emoticons',
    '📅 Dates & Time',
    '🔢 Numbers & Counting',
    '💬 Communication & Greetings',
    '📧 Contact & Personal Info',
    '🎨 Decorative Elements',
    '🌈 Color Indicators',
    '🏷️ Status & Labels'
  ],

  // Subcategory options (~75)
  SUBCATEGORIES: [
    // Text Formatting (5)
    'Strikethrough', 'Underline', 'Bold', 'Italic', 'Mixed Styles',
    // Symbols (6)
    'Arrows', 'Mathematical', 'Currency', 'Punctuation', 'Technical', 'Miscellaneous Symbols',
    // Emojis (10)
    'Smileys & People', 'Animals & Nature', 'Food & Drink', 'Activities',
    'Travel & Places', 'Objects', 'Symbols', 'Flags', 'Kaomoji', 'ASCII Art',
    // Dates & Time (7)
    'Months (English)', 'Months (Spanish)', 'Days of Week', 'Time Formats',
    'Date Patterns', 'Seasons', 'Holidays',
    // Numbers (6)
    'Cardinal Numbers', 'Ordinal Numbers', 'Roman Numerals', 'Fractions',
    'Number Blocks', 'Counters',
    // Communication (5)
    'Greetings', 'Farewells', 'Common Phrases', 'Email Templates', 'Social Media',
    // Contact (5)
    'Email Addresses', 'Phone Numbers', 'Addresses', 'Signatures', 'URLs',
    // Decorative (6)
    'Borders', 'Dividers', 'Bullets', 'Stars & Sparkles', 'Hearts', 'Flowers',
    // Color (4)
    'Color Blocks', 'Colored Circles', 'Gradients', 'Rainbow',
    // Status (5)
    'Priority Markers', 'Status Icons', 'Checkboxes', 'Tags', 'Badges',
    // Additional (16)
    'Weather', 'Music', 'Sports', 'Gaming', 'Science', 'Medical',
    'Legal', 'Finance', 'Education', 'Art', 'Nature', 'Technology',
    'Transportation', 'Buildings', 'Clothing', 'Tools'
  ],

  // Font Style codes (40)
  FONT_STYLES: [
    'N001 - Strikethrough', 'N002 - Underline', 'N003 - Double Underline',
    'N004 - Gothic', 'N005 - Manga', 'N006 - Cursive',
    'N007 - Bold', 'N008 - Bold Italic', 'N009 - Light Bold',
    'N010 - Italic', 'N011 - Italic Serif', 'N012 - Slant Italic',
    'N013 - Monospace', 'N014 - Typewriter', 'N015 - Console',
    'N016 - Small Caps', 'N017 - All Caps', 'N018 - Title Case',
    'N019 - Superscript', 'N020 - Subscript', 'N021 - Mixed Super/Sub',
    'N022 - Blackboard Bold', 'N023 - Double Struck', 'N024 - Outlined',
    'N025 - Fraktur', 'N026 - Old English', 'N027 - Medieval',
    'N028 - Script', 'N029 - Calligraphy', 'N030 - Handwritten',
    'N031 - Math Bold', 'N032 - Math Italic', 'N033 - Math Symbols',
    'N034 - Regional Indicators', 'N035 - Enclosed Alphanumerics',
    'N036 - Circled Letters', 'N037 - Squared Letters', 'N038 - Negative Squared',
    'N039 - Parenthesized', 'N040 - Full Width'
  ],

  // Platform options (8)
  PLATFORMS: [
    'GBOARD',
    'iOS Shortcuts',
    'TextExpander',
    'AutoHotkey',
    'Alfred',
    'Espanso',
    'PhraseExpress',
    'Custom Script'
  ],

  // Usage Frequency options (5)
  USAGE_FREQUENCY: [
    '🔥 Very High (Daily)',
    '⚡ High (Weekly)',
    '🟡 Medium (Monthly)',
    '🟢 Low (Rarely)',
    '📦 Archived'
  ]
};

// ============================================================================
// PUBLIC MENU FUNCTIONS
// ============================================================================

/**
 * Adds enhanced dropdown columns AND validations (Lenient mode).
 * ✅ Allows invalid values so existing data won't be broken.
 */
function addEnhancedDropdowns() {
  addEnhancedDropdowns_(true);
}

/**
 * Adds enhanced dropdown columns AND validations (Strict mode).
 * 🔒 Restricts values to dropdown list only (can flag/deny existing values).
 */
function addEnhancedDropdownsStrict() {
  addEnhancedDropdowns_(false);
}

/**
 * Creates a backup of the Shortcuts sheet before making changes. 💾
 */
function createShortcutsBackup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const source = ss.getSheetByName(getShortcutsSheetName_());

  if (!source) throw new Error('Shortcuts sheet not found');

  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  const backupName = `Shortcuts_Backup_${timestamp}`;

  source.copyTo(ss).setName(backupName);

  SpreadsheetApp.getUi().alert(
    '✅ Backup Created',
    `Backup saved as: ${backupName}\n\nYou can delete it after verifying changes 🙂`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );

  return backupName;
}

/**
 * Shows the current dropdown configuration counts (debugging). 🧪
 */
function showDropdownConfig() {
  const config = {
    mainCategories: DROPDOWN_CONFIG.MAIN_CATEGORIES.length,
    subcategories: DROPDOWN_CONFIG.SUBCATEGORIES.length,
    fontStyles: DROPDOWN_CONFIG.FONT_STYLES.length,
    platforms: DROPDOWN_CONFIG.PLATFORMS.length,
    usageFrequency: DROPDOWN_CONFIG.USAGE_FREQUENCY.length
  };

  console.log('Dropdown Configuration:', config);
  return config;
}

/**
 * Removes dropdown validations from the 5 columns (reset/testing). 🧹
 */
function removeDropdownValidations() {
  const ui = SpreadsheetApp.getUi();
  const sheet = getShortcutsSheet_();
  const cols = resolveDropdownColumns_(sheet);

  const lastRow = Math.max(sheet.getLastRow(), 2);
  const numRows = Math.max(sheet.getMaxRows() - 1, lastRow - 1);

  const targets = [
    cols.mainCategoryCol,
    cols.subcategoryCol,
    cols.fontStyleCol,
    cols.platformCol,
    cols.usageFrequencyCol
  ].filter(n => n > 0);

  for (const col of targets) {
    sheet.getRange(2, col, numRows, 1).clearDataValidations().clearNote();
  }

  ui.alert('✅ Done', 'Cleared dropdown validations for the 5 enhancement columns 🙂', ui.ButtonSet.OK);
}

// ============================================================================
// CORE IMPLEMENTATION
// ============================================================================

/**
 * Internal worker for both strict and lenient versions.
 * @param {boolean} allowInvalid - true = lenient, false = strict
 */
function addEnhancedDropdowns_(allowInvalid) {
  const ui = SpreadsheetApp.getUi();

  const response = ui.alert(
    '🔽 Add Enhanced Dropdowns',
    'This will ensure these 5 columns exist and apply dropdown validation:\n\n' +
      '• MainCategory\n' +
      '• Subcategory\n' +
      '• FontStyle\n' +
      '• Platform\n' +
      '• UsageFrequency\n\n' +
      `Mode: ${allowInvalid ? '✅ Lenient (allows custom values)' : '🔒 Strict (only dropdown values)'}\n\n` +
      'Continue?',
    ui.ButtonSet.YES_NO
  );

  if (response !== ui.Button.YES) {
    ui.alert('Cancelled', 'No changes were made.', ui.ButtonSet.OK);
    return;
  }

  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(15000)) {
    ui.alert('⏳ Busy', 'Another operation is running. Try again in a moment 🙂', ui.ButtonSet.OK);
    return;
  }

  try {
    const sheet = getShortcutsSheet_();

    // 1) Ensure option sheet exists and is populated
    const optSheet = ensureOptionsSheet_();

    // 2) Ensure columns exist by header name (append if missing)
    ensureHeaderExists_(sheet, 'MainCategory');
    ensureHeaderExists_(sheet, 'Subcategory');
    ensureHeaderExists_(sheet, 'FontStyle');
    ensureHeaderExists_(sheet, 'Platform');
    ensureHeaderExists_(sheet, 'UsageFrequency');

    // Re-resolve columns now that headers are ensured
    const cols = resolveDropdownColumns_(sheet);

    // 3) Write options into helper sheet (batch)
    writeOptionsToSheet_(optSheet);

    // 4) Apply range-based validation rules (very maintainable)
    applyValidationFromOptions_(sheet, optSheet, cols, allowInvalid);

    // 5) Freeze header row
    sheet.setFrozenRows(1);

    // 6) Invalidate cache if available (plays nice with your snapshot/cache layer)
    safelyInvalidateTEMCache_();

    ui.alert(
      '✅ Success!',
      'Dropdown columns are ready! 🎉\n\n' +
        'Tips:\n' +
        '• You can edit options anytime in the hidden "_TEM_DropdownOptions" sheet\n' +
        '• If your UI filters rely on these fields, redeploy the web app to expose them\n' +
        '• If you want strict enforcement later, run: addEnhancedDropdownsStrict() 🔒',
      ui.ButtonSet.OK
    );

  } catch (error) {
    console.error('addEnhancedDropdowns_ error:', error);
    ui.alert('❌ Error', 'Failed to apply dropdowns: ' + error.message, ui.ButtonSet.OK);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Ensures the helper options sheet exists and is hidden.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function ensureOptionsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(DROPDOWN_CONFIG.OPTIONS_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(DROPDOWN_CONFIG.OPTIONS_SHEET_NAME);
    sheet.setTabColor('#eeeeee');
  }

  // Keep it hidden to reduce clutter
  try {
    sheet.hideSheet();
  } catch (e) {
    // If user lacks permission to hide, non-fatal
    Logger.log('⚠️ Could not hide options sheet: ' + e.message);
  }

  return sheet;
}

/**
 * Writes all dropdown options into the options sheet.
 * Layout:
 * A: MainCategory
 * B: Subcategory
 * C: FontStyle
 * D: Platform
 * E: UsageFrequency
 */
function writeOptionsToSheet_(optSheet) {
  optSheet.clear();

  const maxLen = Math.max(
    DROPDOWN_CONFIG.MAIN_CATEGORIES.length,
    DROPDOWN_CONFIG.SUBCATEGORIES.length,
    DROPDOWN_CONFIG.FONT_STYLES.length,
    DROPDOWN_CONFIG.PLATFORMS.length,
    DROPDOWN_CONFIG.USAGE_FREQUENCY.length
  );

  const header = ['MainCategory', 'Subcategory', 'FontStyle', 'Platform', 'UsageFrequency'];

  const rows = [];
  for (let i = 0; i < maxLen; i++) {
    rows.push([
      DROPDOWN_CONFIG.MAIN_CATEGORIES[i] || '',
      DROPDOWN_CONFIG.SUBCATEGORIES[i] || '',
      DROPDOWN_CONFIG.FONT_STYLES[i] || '',
      DROPDOWN_CONFIG.PLATFORMS[i] || '',
      DROPDOWN_CONFIG.USAGE_FREQUENCY[i] || ''
    ]);
  }

  optSheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  optSheet.getRange(2, 1, rows.length, header.length).setValues(rows);

  // Auto-size a bit for readability
  for (let c = 1; c <= header.length; c++) optSheet.autoResizeColumn(c);
}

/**
 * Applies range-based dropdown validations to the Shortcuts sheet.
 * Uses requireValueInRange (instead of requireValueInList) for maintainability.
 *
 * Note: Some users report helpText behavior differs when allowInvalid=true.
 */
function applyValidationFromOptions_(shortcutsSheet, optSheet, cols, allowInvalid) {
  const maxRows = shortcutsSheet.getMaxRows();
  const numRows = Math.max(maxRows - 1, 1);

  const lastOptRow = Math.max(optSheet.getLastRow(), 2);

  const ranges = {
    main: optSheet.getRange(2, 1, lastOptRow - 1, 1),
    sub: optSheet.getRange(2, 2, lastOptRow - 1, 1),
    font: optSheet.getRange(2, 3, lastOptRow - 1, 1),
    plat: optSheet.getRange(2, 4, lastOptRow - 1, 1),
    freq: optSheet.getRange(2, 5, lastOptRow - 1, 1)
  };

  const ruleMain = SpreadsheetApp.newDataValidation()
    .requireValueInRange(ranges.main, true)
    .setAllowInvalid(allowInvalid)
    .setHelpText('Pick a MainCategory from the dropdown 🙂')
    .build();

  const ruleSub = SpreadsheetApp.newDataValidation()
    .requireValueInRange(ranges.sub, true)
    .setAllowInvalid(allowInvalid)
    .setHelpText('Pick a Subcategory from the dropdown 🙂')
    .build();

  const ruleFont = SpreadsheetApp.newDataValidation()
    .requireValueInRange(ranges.font, true)
    .setAllowInvalid(allowInvalid)
    .setHelpText('Pick a FontStyle from the dropdown 🙂')
    .build();

  const rulePlat = SpreadsheetApp.newDataValidation()
    .requireValueInRange(ranges.plat, true)
    .setAllowInvalid(allowInvalid)
    .setHelpText('Pick a Platform from the dropdown 🙂')
    .build();

  const ruleFreq = SpreadsheetApp.newDataValidation()
    .requireValueInRange(ranges.freq, true)
    .setAllowInvalid(allowInvalid)
    .setHelpText('Pick a UsageFrequency from the dropdown 🙂')
    .build();

  // Apply to full columns (row 2 to max rows)
  shortcutsSheet.getRange(2, cols.mainCategoryCol, numRows, 1).setDataValidation(ruleMain);
  shortcutsSheet.getRange(2, cols.subcategoryCol, numRows, 1).setDataValidation(ruleSub);
  shortcutsSheet.getRange(2, cols.fontStyleCol, numRows, 1).setDataValidation(ruleFont);
  shortcutsSheet.getRange(2, cols.platformCol, numRows, 1).setDataValidation(rulePlat);
  shortcutsSheet.getRange(2, cols.usageFrequencyCol, numRows, 1).setDataValidation(ruleFreq);

  console.log('✅ Applied dropdown validations to max rows:', maxRows);
}

/**
 * Ensures a header exists in row 1; if missing, append it at the end.
 * This avoids risky hard-coded positions when sheet structure evolves.
 */
function ensureHeaderExists_(sheet, headerName) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v || '').trim());

  const exists = headers.indexOf(headerName) !== -1;
  if (exists) return;

  const newCol = lastCol + 1;
  sheet.getRange(1, newCol).setValue(headerName).setFontWeight('bold');
  console.log(`➕ Added missing header "${headerName}" at column ${newCol}`);
}

/**
 * Resolves dropdown column indices by header name.
 * @returns {{mainCategoryCol:number, subcategoryCol:number, fontStyleCol:number, platformCol:number, usageFrequencyCol:number}}
 */
function resolveDropdownColumns_(sheet) {
  const lastCol = Math.max(sheet.getLastColumn(), 1);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(v => String(v || '').trim());

  const map = {};
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (h) map[h] = i + 1;
  }

  const out = {
    mainCategoryCol: map['MainCategory'] || -1,
    subcategoryCol: map['Subcategory'] || -1,
    fontStyleCol: map['FontStyle'] || -1,
    platformCol: map['Platform'] || -1,
    usageFrequencyCol: map['UsageFrequency'] || -1
  };

  // Safety check
  Object.entries(out).forEach(([k, v]) => {
    if (v < 1) throw new Error(`Missing required header for dropdown: ${k}`);
  });

  return out;
}

/**
 * Returns the Shortcuts sheet name from global CFG if available, else fallback.
 */
function getShortcutsSheetName_() {
  try {
    if (typeof CFG !== 'undefined' && CFG && CFG.SHEET_SHORTCUTS) return CFG.SHEET_SHORTCUTS;
  } catch (e) {}
  return 'Shortcuts';
}

/**
 * Gets Shortcuts sheet safely.
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getShortcutsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const name = getShortcutsSheetName_();
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error(`Shortcuts sheet not found ("${name}")`);
  return sheet;
}

/**
 * Attempts to invalidate your Text Expander cache/version if those functions exist.
 */
function safelyInvalidateTEMCache_() {
  try {
    if (typeof invalidateShortcutsCache_ === 'function') invalidateShortcutsCache_();
  } catch (e) {
    Logger.log('⚠️ invalidateShortcutsCache_ failed (non-fatal): ' + e.message);
  }

  try {
    if (typeof bumpCacheVersion_ === 'function') bumpCacheVersion_();
  } catch (e) {
    Logger.log('⚠️ bumpCacheVersion_ failed (non-fatal): ' + e.message);
  }
}

// ============================================================================
// VERIFICATION & TESTING
// ============================================================================

/**
 * Test function to verify dropdown setup.
 */
function testDropdownEnhancements() {
  console.log('=== Dropdown Enhancement Test ===\n');

  console.log('TEST A: Configuration loaded');
  console.log(`  Main Categories: ${DROPDOWN_CONFIG.MAIN_CATEGORIES.length}`);
  console.log(`  Subcategories: ${DROPDOWN_CONFIG.SUBCATEGORIES.length}`);
  console.log(`  Font Styles: ${DROPDOWN_CONFIG.FONT_STYLES.length}`);
  console.log(`  Platforms: ${DROPDOWN_CONFIG.PLATFORMS.length}`);
  console.log(`  Usage Frequency: ${DROPDOWN_CONFIG.USAGE_FREQUENCY.length}`);

  console.log('\nTEST B: Sheet access');
  try {
    const sheet = getShortcutsSheet_();
    console.log(`  ✅ Shortcuts sheet found: ${sheet.getLastRow()} rows, ${sheet.getLastColumn()} cols`);
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}`);
    return false;
  }

  console.log('\nTEST C: Column resolution');
  try {
    const sheet = getShortcutsSheet_();
    ensureHeaderExists_(sheet, 'MainCategory');
    ensureHeaderExists_(sheet, 'Subcategory');
    ensureHeaderExists_(sheet, 'FontStyle');
    ensureHeaderExists_(sheet, 'Platform');
    ensureHeaderExists_(sheet, 'UsageFrequency');

    const cols = resolveDropdownColumns_(sheet);
    console.log('  ✅ Columns:', cols);
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}`);
    return false;
  }

  console.log('\nTEST D: Options sheet');
  try {
    const opt = ensureOptionsSheet_();
    writeOptionsToSheet_(opt);
    console.log(`  ✅ Options sheet ok: ${opt.getName()} (rows=${opt.getLastRow()})`);
  } catch (e) {
    console.log(`  ❌ Error: ${e.message}`);
    return false;
  }

  console.log('\n=== Test Complete ✅ ===');
  return true;
}
