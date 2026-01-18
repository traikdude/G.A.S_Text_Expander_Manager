/**
 * 📝 TEXT EXPANSION MANAGER - Enhanced Entry Point
 * =================================================
 * Manages text expansion shortcuts with advanced categorization,
 * Python/Colab integration, and comprehensive UI options.
 * * Called by: 00_ProjectEntryPoints.gs unified router
 * Original: Code.gs (refactored for unified architecture)
 * * Features:
 * ✅ Multi-modal UI (Sidebar, Dialog, Web App)
 * ✅ Python/Colab integration for ML categorization
 * ✅ Advanced cache management (10k+ shortcuts)
 * ✅ Duplicate cleanup utilities
 * ✅ Enhanced dropdown validations
 * ✅ Performance monitoring
 */

// ============================================
// 📋 CONFIGURATION
// ============================================

const TEM_CONFIG_ = {
  // Performance settings
  CACHE: {
    ENABLED: true,
    TTL_SECONDS: 3600,  // 1 hour cache lifetime
    WARM_BATCH_SIZE: 1000,  // Process in batches for large datasets
    MAX_SHORTCUTS: 15000  // Warn if approaching limits
  },
  
  // UI preferences
  UI: {
    DEFAULT_MODE: 'sidebar',  // 'sidebar', 'dialog', or 'webapp'
    SIDEBAR_WIDTH: 320,
    DIALOG_WIDTH: 900,
    DIALOG_HEIGHT: 700
  },
  
  // Logging
  LOGGING: {
    ENABLED: true,
    LOG_MENU_ACTIONS: true,
    LOG_CACHE_OPERATIONS: true
  },
  
  // Sheet names (must match actual sheet names)
  SHEETS: {
    SHORTCUTS: 'Shortcuts',
    FAVORITES: 'Favorites',
    CATEGORIES: 'Categories',
    ANALYTICS: 'Analytics'
  }
};

// ============================================
// 🎯 MAIN ENTRY POINTS
// ============================================

/**
 * 📌 Initialize Text Expansion Manager on spreadsheet open
 * Called by unified entry point
 */
function TEM_onOpen_(e) {
  const startTime = new Date();
  
  try {
    // Ensure required sheets exist (Safe to run in background)
    ensureSheets_();
    
    // Create main menu (Needs UI context)
    try {
      createTextExpanderMenu_();
      
      // Optional: Initialize Python Bridge menu
      initializePythonBridgeMenu_();
    } catch (uiErr) {
      console.warn('⚠️ TEM Menu creation skipped (No UI context):', uiErr.message);
    }
    
    // Log successful initialization
    logTEM_('✅ Text Expansion Manager initialized', {
      duration: new Date() - startTime + 'ms',
      authMode: e?.authMode
    });
    
  } catch (err) {
    logTEM_('❌ TEM initialization failed', {
      error: err.message,
      stack: err.stack
    });
    
    // Show user-friendly error (Safe UI check)
    try {
       showInitializationError_(err);
    } catch (e) {
       console.error('Could not show error dialog:', e.message);
    }
  }
}

/**
 * 🌐 Web App entry point
 * Returns the main Text Expansion Manager UI
 */
function TEM_doGet_(e) {
  try {
    ensureSheets_();
    
    // Check if requesting specific view mode
    const view = e?.parameter?.view || 'default';
    
    logTEM_('🌐 Web App accessed', {
      view: view,
      userAgent: e?.parameter?.userAgent || 'unknown'
    });
    
    return createWebAppUI_(view);
    
  } catch (err) {
    logTEM_('❌ Web App render failed', {
      error: err.message,
      stack: err.stack
    });
    
    return createErrorUI_(err);
  }
}

// ============================================
// 🎨 MENU CREATION
// ============================================

/**
 * Create comprehensive Text Expansion Tools menu
 */
function createTextExpanderMenu_() {
  // This will throw if no UI context, caught by TEM_onOpen_
  const ui = SpreadsheetApp.getUi();
  
  const menu = ui.createMenu('📝 Text Expansion Tools')
    
    // Quick Access Section
    .addItem('🚀 Open Manager (Sidebar)', 'openManagerSidebar')
    .addItem('🖼️ Open Manager (Dialog)', 'openManagerDialog')
    .addItem('🌐 Open Manager (Web)', 'openWebAppLinkDialog')
    .addSeparator()
    
    // Python/ML Tools Section
    .addSubMenu(createPythonToolsMenu_(ui))
    .addSeparator()
    
    // Cache Management Section
    .addSubMenu(createCacheMenu_(ui))
    .addSeparator()
    
    // Data Cleanup Section
    .addSubMenu(createCleanupMenu_(ui))
    .addSeparator()
    
    // Advanced Features Section
    .addSubMenu(createAdvancedMenu_(ui))
    .addSeparator()
    
    // Help & Info Section
    .addItem('📊 View Statistics', 'showTEMStatistics')
    .addItem('📘 Help & Documentation', 'openTextExpanderHelpDialog')
    .addItem('ℹ️ About', 'showTEMAbout');
  
  menu.addToUi();
}

/**
 * Create Python/Colab Tools submenu
 */
function createPythonToolsMenu_(ui) {
  return ui.createMenu('🐍 Python Tools (Colab)')
    .addItem('🧠 ML Categorizer', 'openMLCategorizer')
    .addItem('🛡️ Data Quality Check', 'openDataQuality')
    .addItem('👯 Duplicate Finder', 'openDuplicateFinder')
    .addItem('📊 Analytics Dashboard', 'openAnalytics')
    .addSeparator()
    .addItem('💾 Backup System', 'openBackupSystem')
    .addItem('🌉 Drive Bridge', 'openDriveBridge')
    .addItem('✨ Font Categorizer', 'openFontCategorizer')
    .addItem('📝 Text Expander Categorizer', 'openTextExpanderCategorizer')
    .addSeparator()
    .addItem('📂 Open Tools Folder', 'openToolsFolder')
    .addItem('⚙️ Configure Python URLs', 'configurePythonURLs');
}

/**
 * Create Cache Management submenu
 */
function createCacheMenu_(ui) {
  return ui.createMenu('⚡ Cache Management')
    .addItem('🔥 Warm Cache (Recommended)', 'warmShortcutsCache')
    .addItem('🔄 Rebuild Cache', 'rebuildShortcutsCache')
    .addItem('🗑️ Clear Cache', 'invalidateShortcutsCache')
    .addSeparator()
    .addItem('📊 Cache Statistics', 'showCacheStatistics')
    .addItem('🧪 Test Cache Performance', 'testCachePerformance');
}

/**
 * Create Cleanup Tools submenu
 */
function createCleanupMenu_(ui) {
  return ui.createMenu('🧹 Cleanup Tools')
    .addItem('📋 Remove Duplicate Shortcuts', 'cleanupDuplicateShortcuts')
    .addItem('⭐ Remove Duplicate Favorites', 'cleanupDuplicateFavorites')
    .addItem('🧼 Clean All Duplicates', 'cleanupAllDuplicates')
    .addSeparator()
    .addItem('🔍 Find Empty Entries', 'findEmptyEntries')
    .addItem('🗑️ Remove Empty Entries', 'removeEmptyEntries')
    .addSeparator()
    .addItem('📊 Cleanup Report', 'generateCleanupReport');
}

/**
 * Create Advanced Features submenu
 */
function createAdvancedMenu_(ui) {
  return ui.createMenu('🔧 Advanced Features')
    .addSubMenu(ui.createMenu('🔽 Dropdown Setup')
      .addItem('✅ Add Enhanced Dropdowns', 'addEnhancedDropdowns')
      .addItem('🧹 Remove Dropdowns', 'removeEnhancedDropdowns')
      .addItem('🔄 Refresh Dropdowns', 'refreshEnhancedDropdowns')
    )
    .addSeparator()
    .addItem('📤 Export All Data', 'exportAllTEMData')
    .addItem('📥 Import Data', 'importTEMData')
    .addSeparator()
    .addItem('🔐 Backup to Drive', 'backupTEMToDrive')
    .addItem('♻️ Restore from Backup', 'restoreFromBackup');
}

/**
 * Initialize Python Bridge menu if available
 */
function initializePythonBridgeMenu_() {
  try {
    if (typeof addBridgeMenu === 'function') {
      addBridgeMenu();
      logTEM_('✅ Python Bridge menu added');
    }
  } catch (err) {
    // Silent fail - Python Bridge is optional
    logTEM_('ℹ️ Python Bridge not available', { error: err.message });
  }
}

// ============================================
// 🖥️ UI CREATION
// ============================================

/**
 * Create main web app UI
 */
function createWebAppUI_(view) {
  const template = HtmlService.createTemplateFromFile('Index');
  
  // Pass configuration to template
  template.config = {
    view: view,
    theme: getUserTheme_(),
    shortcuts: getCachedShortcuts_()
  };
  
  return template.evaluate()
    .setTitle('📝 Text Expansion Manager')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Create error UI for web app failures
 */
function createErrorUI_(error) {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0;
            padding: 20px;
          }
          .error-container {
            background: white;
            border-radius: 16px;
            padding: 40px;
            max-width: 500px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            text-align: center;
          }
          h1 { color: #e53e3e; margin: 0 0 16px 0; }
          p { color: #4a5568; line-height: 1.6; margin: 0 0 24px 0; }
          .error-details {
            background: #fff5f5;
            border: 2px solid #feb2b2;
            border-radius: 8px;
            padding: 16px;
            text-align: left;
            font-family: monospace;
            font-size: 13px;
            color: #742a2a;
            margin-top: 20px;
            overflow-x: auto;
          }
          button {
            background: #667eea;
            color: white;
            border: none;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 16px;
            cursor: pointer;
            font-weight: 600;
          }
          button:hover { background: #5a67d8; }
        </style>
      </head>
      <body>
        <div class="error-container">
          <div style="font-size: 64px; margin-bottom: 20px;">🚨</div>
          <h1>Unable to Load Manager</h1>
          <p>The Text Expansion Manager encountered an error while loading.</p>
          <div class="error-details">
            <strong>Error:</strong> ${error.message || 'Unknown error'}
          </div>
          <button onclick="location.reload()">🔄 Retry</button>
        </div>
      </body>
    </html>
  `;
  
  return HtmlService.createHtmlOutput(html)
    .setTitle('Error - Text Expansion Manager')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Show initialization error to user
 */
function showInitializationError_(error) {
  try {
    const ui = SpreadsheetApp.getUi();
    ui.alert(
      '⚠️ Initialization Error',
      `Text Expansion Manager failed to initialize:\n\n${error.message}\n\nPlease check the script logs for details.`,
      ui.ButtonSet.OK
    );
  } catch (err) {
    // Can't show UI, just log
    console.error('Failed to show initialization error:', err);
  }
}

// ============================================
// 🔗 WEB APP LINK DIALOG (Enhanced)
// ============================================

/**
 * ✨ Enhanced Web App link dialog with beautiful UI and multiple access options
 */
function openWebAppLinkDialog() {
  try {
    ensureSheets_();
    
    const base = (typeof getWebAppUrl_ === 'function' ? getWebAppUrl_() : '') || '';
    const temUrl = base ? getWebAppUrlWithUi_('tem') : '';
    const masterUrl = base ? getWebAppUrlWithUi_('master') : '';
    const debugUrl = base ? getWebAppUrlWithUi_('debug') : '';
    
    const html = base ? createWebAppLinksHTML_(base, temUrl, masterUrl, debugUrl) 
                      : createNoURLConfiguredHTML_();
    
    const dialog = HtmlService.createHtmlOutput(html)
      .setWidth(650)
      .setHeight(450);
    
    // 🛡️ SAFEGUARD: Check for UI context
    try {
      const ui = SpreadsheetApp.getUi();
      ui.showModalDialog(dialog, '🌐 Web App Access Links');
    } catch (e) {
      console.warn('⚠️ Cannot show dialog: Script is running in a context without a UI (e.g., Editor or Time Trigger).');
      console.log('🔗 Link generated: ' + (temUrl || 'No URL configured'));
    }

  } catch (err) {
    console.error('Error in openWebAppLinkDialog:', err);
    throw err; // Rethrow to see it in execution logs if needed
  }
}

/**
 * Create HTML for configured web app links
 */
function createWebAppLinksHTML_(base, temUrl, masterUrl, debugUrl) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 24px;
            color: white;
          }
          .container {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 16px;
            padding: 32px;
            color: #1a202c;
          }
          h2 {
            margin: 0 0 8px 0;
            color: #2d3748;
            font-size: 24px;
          }
          .subtitle {
            color: #718096;
            margin-bottom: 24px;
            font-size: 14px;
          }
          .url-section {
            background: #f7fafc;
            border: 2px solid #e2e8f0;
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 16px;
          }
          .url-section h3 {
            margin: 0 0 12px 0;
            color: #4a5568;
            font-size: 16px;
            display: flex;
            align-items: center;
            gap: 8px;
          }
          .url-display {
            background: white;
            border: 1px solid #cbd5e0;
            border-radius: 8px;
            padding: 12px;
            font-family: monospace;
            font-size: 13px;
            word-break: break-all;
            margin-bottom: 12px;
            color: #2d3748;
          }
          .button-group {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
          }
          .btn {
            padding: 10px 16px;
            border: none;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
            text-decoration: none;
            display: inline-flex;
            align-items: center;
            gap: 6px;
          }
          .btn-primary {
            background: #667eea;
            color: white;
          }
          .btn-primary:hover {
            background: #5a67d8;
            transform: translateY(-1px);
          }
          .btn-secondary {
            background: #48bb78;
            color: white;
          }
          .btn-secondary:hover {
            background: #38a169;
          }
          .btn-outline {
            background: white;
            color: #667eea;
            border: 2px solid #667eea;
          }
          .btn-outline:hover {
            background: #667eea;
            color: white;
          }
          .info-box {
            background: #ebf8ff;
            border-left: 4px solid #4299e1;
            padding: 12px 16px;
            border-radius: 8px;
            margin-top: 20px;
            font-size: 14px;
            color: #2c5282;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>🌐 Web App Access Links</h2>
          <p class="subtitle">Quick access to all your web-based tools</p>
          
          <!-- Text Expansion Manager -->
          <div class="url-section">
            <h3>📝 Text Expansion Manager</h3>
            <div class="url-display">${escapeHtml_(temUrl)}</div>
            <div class="button-group">
              <a href="${escapeHtml_(temUrl)}" target="_blank" class="btn btn-primary">
                🚀 Open Manager
              </a>
              <button onclick="copyUrl('${escapeHtml_(temUrl)}', this)" class="btn btn-outline">
                📋 Copy Link
              </button>
            </div>
          </div>
          
          <!-- Master Automation -->
          <div class="url-section">
            <h3>⚙️ Master Automation</h3>
            <div class="url-display">${escapeHtml_(masterUrl)}</div>
            <div class="button-group">
              <a href="${escapeHtml_(masterUrl)}" target="_blank" class="btn btn-primary">
                🚀 Open Automation
              </a>
              <button onclick="copyUrl('${escapeHtml_(masterUrl)}', this)" class="btn btn-outline">
                📋 Copy Link
              </button>
            </div>
          </div>
          
          <!-- Debug Dashboard -->
          <div class="url-section">
            <h3>🐞 Debug Dashboard</h3>
            <div class="url-display">${escapeHtml_(debugUrl)}</div>
            <div class="button-group">
              <a href="${escapeHtml_(debugUrl)}" target="_blank" class="btn btn-secondary">
                🔍 Open Dashboard
              </a>
              <button onclick="copyUrl('${escapeHtml_(debugUrl)}', this)" class="btn btn-outline">
                📋 Copy Link
              </button>
            </div>
          </div>
          
          <div class="info-box">
            💡 <strong>Pro Tip:</strong> Bookmark these links for instant access from any browser!
          </div>
        </div>
        
        <script>
          function copyUrl(url, button) {
            navigator.clipboard.writeText(url).then(() => {
              const originalText = button.innerHTML;
              button.innerHTML = '✅ Copied!';
              button.style.background = '#48bb78';
              button.style.color = 'white';
              button.style.borderColor = '#48bb78';
              
              setTimeout(() => {
                button.innerHTML = originalText;
                button.style.background = 'white';
                button.style.color = '#667eea';
                button.style.borderColor = '#667eea';
              }, 2000);
            }).catch(err => {
              alert('Failed to copy: ' + err);
            });
          }
        </script>
      </body>
    </html>
  `;
}

/**
 * Create HTML for when URL is not configured
 */
function createNoURLConfiguredHTML_() {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 24px;
            color: white;
          }
          .container {
            background: rgba(255, 255, 255, 0.95);
            border-radius: 16px;
            padding: 32px;
            color: #1a202c;
            text-align: center;
          }
          h2 {
            margin: 0 0 16px 0;
            color: #2d3748;
          }
          .warning-box {
            background: #fffaf0;
            border: 2px solid #f6ad55;
            border-radius: 12px;
            padding: 20px;
            margin: 20px 0;
            text-align: left;
          }
          .steps {
            background: #f7fafc;
            border-radius: 12px;
            padding: 20px;
            margin-top: 20px;
            text-align: left;
          }
          .steps h3 {
            margin: 0 0 12px 0;
            color: #4a5568;
          }
          .steps ol {
            margin-left: 20px;
            line-height: 1.8;
          }
          .steps li {
            margin-bottom: 8px;
          }
          code {
            background: #e2e8f0;
            padding: 2px 8px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 13px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div style="font-size: 64px; margin-bottom: 16px;">⚠️</div>
          <h2>Web App URL Not Configured</h2>
          
          <div class="warning-box">
            <strong>⚠️ Setup Required</strong><br>
            The web app URL hasn't been configured yet. Please deploy this project as a web app first.
          </div>
          
          <div class="steps">
            <h3>📋 Setup Instructions:</h3>
            <ol>
              <li>Click <strong>Deploy → New deployment</strong></li>
              <li>Select type: <strong>Web app</strong></li>
              <li>Set "Execute as": <strong>Me</strong></li>
              <li>Set "Who has access": <strong>Anyone</strong> (or your preference)</li>
              <li>Click <strong>Deploy</strong></li>
              <li>Copy the web app URL</li>
              <li>Store it in Script Properties as <code>WEB_APP_URL</code></li>
            </ol>
          </div>
        </div>
      </body>
    </html>
  `;
}

// ============================================
// 📊 STATISTICS & ANALYTICS
// ============================================

/**
 * Show comprehensive TEM statistics
 */
function showTEMStatistics() {
  try {
    const stats = gatherTEMStatistics_();
    const html = createStatisticsHTML_(stats);
    
    const dialog = HtmlService.createHtmlOutput(html)
      .setWidth(700)
      .setHeight(600);
    
    SpreadsheetApp.getUi().showModalDialog(dialog, '📊 Text Expansion Manager Statistics');
    
  } catch (err) {
    SpreadsheetApp.getUi().alert('Error gathering statistics: ' + err.message);
  }
}

/**
 * Gather comprehensive statistics
 */
function gatherTEMStatistics_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const shortcutsSheet = ss.getSheetByName(TEM_CONFIG_.SHEETS.SHORTCUTS);
  const favoritesSheet = ss.getSheetByName(TEM_CONFIG_.SHEETS.FAVORITES);
  
  const stats = {
    shortcuts: {
      total: 0,
      byCategory: {},
      byLanguage: {}
    },
    favorites: {
      total: 0
    },
    cache: {
      status: 'unknown',
      lastWarmed: 'never'
    },
    performance: {
      cacheHitRate: 0,
      avgLoadTime: 0
    }
  };
  
  // Count shortcuts
  if (shortcutsSheet) {
    const data = shortcutsSheet.getDataRange().getValues();
    stats.shortcuts.total = Math.max(0, data.length - 1); // Exclude header
    
    // Analyze categories and languages (if columns exist)
    // This is a simplified version - enhance based on your sheet structure
  }
  
  // Count favorites
  if (favoritesSheet) {
    const data = favoritesSheet.getDataRange().getValues();
    stats.favorites.total = Math.max(0, data.length - 1);
  }
  
  // Check cache status
  const cache = CacheService.getScriptCache();
  const cacheData = cache.get('shortcuts_cache');
  if (cacheData) {
    stats.cache.status = 'active';
    // Get last warmed time if stored
  }
  
  return stats;
}

/**
 * Create statistics HTML
 */
function createStatisticsHTML_(stats) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #0f172a;
            color: white;
            padding: 24px;
          }
          .stat-card {
            background: rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            padding: 20px;
            margin-bottom: 16px;
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
          .stat-card h3 {
            color: #a78bfa;
            margin-bottom: 12px;
            font-size: 16px;
          }
          .stat-value {
            font-size: 32px;
            font-weight: bold;
            margin-bottom: 4px;
          }
          .stat-label {
            color: #94a3b8;
            font-size: 14px;
          }
          .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 16px;
            margin-top: 20px;
          }
        </style>
      </head>
      <body>
        <h2 style="margin-bottom: 24px;">📊 Statistics Dashboard</h2>
        
        <div class="grid">
          <div class="stat-card">
            <h3>📋 Total Shortcuts</h3>
            <div class="stat-value">${stats.shortcuts.total.toLocaleString()}</div>
            <div class="stat-label">Text expansions</div>
          </div>
          
          <div class="stat-card">
            <h3>⭐ Favorites</h3>
            <div class="stat-value">${stats.favorites.total.toLocaleString()}</div>
            <div class="stat-label">Saved favorites</div>
          </div>
          
          <div class="stat-card">
            <h3>⚡ Cache Status</h3>
            <div class="stat-value">${stats.cache.status === 'active' ? '✅' : '❌'}</div>
            <div class="stat-label">${stats.cache.status}</div>
          </div>
        </div>
      </body>
    </html>
  `;
}

/**
 * Show about dialog
 */
function showTEMAbout() {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            padding: 24px;
            line-height: 1.6;
          }
          h2 { color: #667eea; margin-bottom: 16px; }
          .version { color: #718096; font-size: 14px; }
          .feature-list { margin: 20px 0; }
          .feature-list li { margin-bottom: 8px; }
        </style>
      </head>
      <body>
        <h2>📝 Text Expansion Manager</h2>
        <p class="version">Version 2.0 - Enhanced Edition</p>
        
        <div class="feature-list">
          <h3>✨ Features:</h3>
          <ul>
            <li>🚀 Manage 10,000+ text expansion shortcuts</li>
            <li>🧠 ML-powered categorization via Python/Colab</li>
            <li>⚡ High-performance caching system</li>
            <li>🌐 Multiple UI modes (Sidebar, Dialog, Web)</li>
            <li>🧹 Advanced duplicate cleanup tools</li>
            <li>📊 Comprehensive analytics</li>
          </ul>
        </div>
        
        <p><strong>Created by:</strong> Erik Gaton</p>
        <p><strong>License:</strong> MIT</p>
      </body>
    </html>
  `;
  
  const dialog = HtmlService.createHtmlOutput(html)
    .setWidth(500)
    .setHeight(400);
  
  SpreadsheetApp.getUi().showModalDialog(dialog, 'About');
}

// ============================================
// 🔧 UTILITY FUNCTIONS
// ============================================

/**
 * Unified logging for TEM
 */
function logTEM_(message, data) {
  if (!TEM_CONFIG_.LOGGING.ENABLED) return;
  
  const timestamp = new Date().toISOString();
  console.log(`[TEM ${timestamp}] ${message}`, data || '');
  
  // Use unified logging system if available
  if (typeof logUnified_ === 'function') {
    logUnified_(`[TEM] ${message}`, data);
  }
}

/**
 * Get user's theme preference
 */
function getUserTheme_() {
  try {
    const props = PropertiesService.getUserProperties();
    return props.getProperty('TEM_THEME') || 'dark';
  } catch (err) {
    return 'dark';
  }
}

/**
 * Get cached shortcuts (stub - implement based on your cache strategy)
 */
function getCachedShortcuts_() {
  try {
    const cache = CacheService.getScriptCache();
    const cached = cache.get('shortcuts_cache');
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    logTEM_('❌ Cache retrieval failed', { error: err.message });
  }
  return [];
}

/**
 * Escape HTML for safe rendering
 */
function escapeHtml_(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================
// 🐍 PYTHON/COLAB INTEGRATION
// ============================================

/**
 * Open Text Expander Categorizer Colab notebook
 */
function openTextExpanderCategorizer() {
  const url = CFG?.PYTHON_URLS?.TEXT_EXPANDER_CATEGORIZER;
  if (url) {
    openUrl_(url, 'Text Expander Categorizer');
  } else {
    SpreadsheetApp.getUi().alert('❌ Text Expander Categorizer URL not configured in CFG.PYTHON_URLS');
  }
}

/**
 * Configure Python URLs dialog
 */
function configurePythonURLs() {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            padding: 20px;
          }
          h3 { color: #667eea; }
          .info {
            background: #ebf8ff;
            border-left: 4px solid #4299e1;
            padding: 12px;
            margin: 16px 0;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <h3>⚙️ Python URL Configuration</h3>
        <div class="info">
          Python/Colab URLs should be configured in the CFG object within your configuration file.
        </div>
        <p>Please update your configuration file with the appropriate Colab notebook URLs.</p>
      </body>
    </html>
  `;
  
  const dialog = HtmlService.createHtmlOutput(html).setWidth(450).setHeight(250);
  SpreadsheetApp.getUi().showModalDialog(dialog, 'Configuration');
}