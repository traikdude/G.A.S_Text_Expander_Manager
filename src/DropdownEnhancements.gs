/**
 * DropdownEnhancements.gs
 * =======================
 * Enhanced dropdown columns for Text Expander Manager
 * 
 * Adds 5 new columns to the Shortcuts sheet:
 * - MainCategory (10 options)
 * - Subcategory (75 options, hierarchical)
 * - FontStyle (40 N-codes)
 * - Platform (8 options)
 * - UsageFrequency (5 options)
 * 
 * Author: Zenith Orchestrator
 * Version: 1.0.0
 * Date: 2025-12-28
 */

// ============================================================================
// DROPDOWN CONFIGURATION
// ============================================================================

const DROPDOWN_CONFIG = {
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

  // Subcategory options (75) - organized hierarchically
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
    // Additional (16 more to reach ~75)
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
// MAIN FUNCTIONS (Menu-Callable)
// ============================================================================

/**
 * Adds enhanced dropdown columns to the Shortcuts sheet.
 * Call from menu: Setup → Add Enhanced Dropdowns (5 columns)
 */
function addEnhancedDropdowns() {
  const ui = SpreadsheetApp.getUi();
  
  // Confirm before proceeding
  const response = ui.alert(
    '🔽 Add Enhanced Dropdowns',
    'This will add 5 new columns to the Shortcuts sheet:\n\n' +
    '• MainCategory (column I)\n' +
    '• Subcategory (column J)\n' +
    '• FontStyle (column K)\n' +
    '• Platform (column L)\n' +
    '• UsageFrequency (column M)\n\n' +
    'Existing data will NOT be modified.\n\n' +
    'Continue?',
    ui.ButtonSet.YES_NO
  );
  
  if (response !== ui.Button.YES) {
    ui.alert('Cancelled', 'No changes were made.', ui.ButtonSet.OK);
    return;
  }
  
  try {
    const sheet = getShortcutsSheet_();
    
    // Add columns and validations
    addDropdownColumn_(sheet, 'MainCategory', DROPDOWN_CONFIG.MAIN_CATEGORIES, 9);
    addDropdownColumn_(sheet, 'Subcategory', DROPDOWN_CONFIG.SUBCATEGORIES, 10);
    addDropdownColumn_(sheet, 'FontStyle', DROPDOWN_CONFIG.FONT_STYLES, 11);
    addDropdownColumn_(sheet, 'Platform', DROPDOWN_CONFIG.PLATFORMS, 12);
    addDropdownColumn_(sheet, 'UsageFrequency', DROPDOWN_CONFIG.USAGE_FREQUENCY, 13);
    
    // Freeze header row
    sheet.setFrozenRows(1);
    
    ui.alert(
      '✅ Success!',
      '5 dropdown columns have been added.\n\n' +
      'Next steps:\n' +
      '1. Run the Google Colab notebook to auto-categorize\n' +
      '2. Or manually select categories for each row\n' +
      '3. Redeploy the web app to see new filters',
      ui.ButtonSet.OK
    );
    
    // Invalidate cache to force refresh
    if (typeof invalidateShortcutsCache_ === 'function') {
      invalidateShortcutsCache_();
    }
    
  } catch (error) {
    ui.alert('❌ Error', 'Failed to add dropdowns: ' + error.message, ui.ButtonSet.OK);
    console.error('addEnhancedDropdowns error:', error);
  }
}

/**
 * Creates a backup of the Shortcuts sheet before making changes.
 */
function createShortcutsBackup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const source = ss.getSheetByName('Shortcuts');
  
  if (!source) {
    throw new Error('Shortcuts sheet not found');
  }
  
  const timestamp = Utilities.formatDate(new Date(), 'America/New_York', 'yyyyMMdd_HHmmss');
  const backupName = `Shortcuts_Backup_${timestamp}`;
  
  source.copyTo(ss).setName(backupName);
  
  SpreadsheetApp.getUi().alert(
    '✅ Backup Created',
    `Backup saved as: ${backupName}\n\nYou can delete this sheet after verifying changes.`,
    SpreadsheetApp.getUi().ButtonSet.OK
  );
  
  return backupName;
}

/**
 * Shows the current dropdown configuration (for debugging).
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Gets the Shortcuts sheet.
 * @returns {Sheet} The Shortcuts sheet
 */
function getShortcutsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('Shortcuts');
  
  if (!sheet) {
    throw new Error('Shortcuts sheet not found');
  }
  
  return sheet;
}

/**
 * Adds a dropdown column with data validation.
 * @param {Sheet} sheet - Target sheet
 * @param {string} headerName - Column header name
 * @param {Array<string>} options - Dropdown options
 * @param {number} colIndex - 1-based column index
 */
function addDropdownColumn_(sheet, headerName, options, colIndex) {
  const lastRow = sheet.getLastRow();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  
  // Check if column already exists
  const existingCol = headers.indexOf(headerName);
  if (existingCol >= 0) {
    console.log(`Column '${headerName}' already exists at position ${existingCol + 1}`);
    colIndex = existingCol + 1;
  } else {
    // Set header
    sheet.getRange(1, colIndex).setValue(headerName).setFontWeight('bold');
  }
  
  // Create validation rule
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(options, true)
    .setAllowInvalid(false)
    .setHelpText(`Select a ${headerName} from the dropdown`)
    .build();
  
  // Apply to data range (skip header)
  if (lastRow > 1) {
    const dataRange = sheet.getRange(2, colIndex, lastRow - 1, 1);
    dataRange.setDataValidation(rule);
  }
  
  // Also set validation on the column for future rows
  const futureRange = sheet.getRange(2, colIndex, 1000, 1);
  futureRange.setDataValidation(rule);
  
  console.log(`✓ Added dropdown: ${headerName} (column ${colIndex}) with ${options.length} options`);
}

/**
 * Removes all dropdown validations (for reset/testing).
 */
function removeDropdownValidations_() {
  const sheet = getShortcutsSheet_();
  const lastRow = sheet.getLastRow();
  
  // Clear validations from columns I-M (9-13)
  for (let col = 9; col <= 13; col++) {
    if (lastRow > 1) {
      sheet.getRange(2, col, lastRow - 1, 1).clearDataValidations();
    }
  }
  
  console.log('Cleared dropdown validations from columns I-M');
}

// ============================================================================
// VERIFICATION & TESTING
// ============================================================================

/**
 * Test function to verify dropdown configuration.
 */
function testDropdownEnhancements() {
  console.log('=== Dropdown Enhancement Test ===\n');
  
  // Test A: Configuration loaded
  console.log('TEST A: Configuration loaded');
  console.log(`  Main Categories: ${DROPDOWN_CONFIG.MAIN_CATEGORIES.length}`);
  console.log(`  Subcategories: ${DROPDOWN_CONFIG.SUBCATEGORIES.length}`);
  console.log(`  Font Styles: ${DROPDOWN_CONFIG.FONT_STYLES.length}`);
  console.log(`  Platforms: ${DROPDOWN_CONFIG.PLATFORMS.length}`);
  console.log(`  Usage Frequency: ${DROPDOWN_CONFIG.USAGE_FREQUENCY.length}`);
  
  // Test B: Sheet access
  console.log('\nTEST B: Sheet access');
  try {
    const sheet = getShortcutsSheet_();
    console.log(`  ✓ Shortcuts sheet found: ${sheet.getLastRow()} rows`);
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}`);
  }
  
  // Test C: Current headers
  console.log('\nTEST C: Current headers');
  try {
    const sheet = getShortcutsSheet_();
    const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    console.log(`  Current columns: ${headers.join(', ')}`);
    
    const hasMainCategory = headers.includes('MainCategory');
    const hasSubcategory = headers.includes('Subcategory');
    console.log(`  MainCategory exists: ${hasMainCategory}`);
    console.log(`  Subcategory exists: ${hasSubcategory}`);
  } catch (e) {
    console.log(`  ✗ Error: ${e.message}`);
  }
  
  console.log('\n=== Test Complete ===');
  return true;
}
