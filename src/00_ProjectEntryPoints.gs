/**
 * 🚦 UNIFIED ENTRY POINT - Enhanced Version
 * ============================================
 * Central traffic controller for multiple Google Apps Script systems
 * * Systems Managed:
 * - 📝 Text Expansion Manager (TEM)
 * - ⚙️ Master Automation Framework
 * - 🐞 Debug/Admin Dashboard
 * * Architecture Benefits:
 * ✅ Single onOpen() - No conflicts
 * ✅ Single doGet() - Clean routing
 * ✅ Graceful error handling
 * ✅ Comprehensive logging
 * ✅ Easy debugging
 */

// ============================================
// 📋 CONFIGURATION
// ============================================

const UNIFIED_CONFIG_ = {
  // System identifiers
  SYSTEMS: {
    TEM: 'Text Expansion Manager',
    MASTER: 'Master Automation',
    DEBUG: 'Debug Dashboard'
  },
  
  // Route parameters for doGet
  ROUTES: {
    TEM: ['tem', 'text', 'expander', ''],  // Default route
    MASTER: ['master', 'automation', 'auto'],
    DEBUG: ['debug', 'admin', 'dashboard']
  },
  
  // Logging configuration
  LOGGING: {
    ENABLED: true,
    VERBOSE: true,  // Set false for production
    MAX_LOG_ENTRIES: 100
  },
  
  // Error handling
  ERROR_DISPLAY: true,  // Show detailed errors to user (false for production)
  
  // Performance monitoring
  TRACK_PERFORMANCE: true
};

// ============================================
// 🎯 RESERVED TRIGGERS
// ============================================

/**
 * 📌 Reserved Simple Trigger: Spreadsheet Open
 * Initializes ALL systems safely with comprehensive error handling
 */
function onOpen(e) {
  const startTime = new Date();
  logUnified_('🚀 onOpen triggered', { timestamp: startTime });
  
  const results = {
    tem: { success: false, error: null, duration: 0 },
    master: { success: false, error: null, duration: 0 },
    debug: { success: false, error: null, duration: 0 }
  };

  // 1️⃣ Initialize Text Expansion Manager
  results.tem = initializeSystem_('TEM', () => {
    if (typeof TEM_onOpen_ === 'function') {
      TEM_onOpen_(e);
      return true;
    }
    return false;
  });

  // 2️⃣ Initialize Master Automation Framework
  results.master = initializeSystem_('MASTER', () => {
    if (typeof MASTER_hostOnOpen_ === 'function') {
      MASTER_hostOnOpen_(e);
      return true;
    }
    return false;
  });

  // 3️⃣ Initialize Debug Dashboard (optional)
  results.debug = initializeSystem_('DEBUG', () => {
    if (typeof DEBUG_addMenu_ === 'function') {
      DEBUG_addMenu_();
      return true;
    }
    return false;
  });

  // 📊 Performance summary
  const totalDuration = new Date() - startTime;
  logUnified_('✅ onOpen completed', {
    totalDuration: totalDuration + 'ms',
    results: results
  });

  // 🎨 Add unified admin menu
  addUnifiedAdminMenu_();

  // 💾 Store initialization metrics
  storeMetrics_('onOpen', results, totalDuration);
}

/**
 * 📦 Install Trigger
 */
function onInstall(e) {
  logUnified_('📦 Installation triggered');
  onOpen(e);
  
  // Post-install setup
  try {
    initializeScriptProperties_();
    logUnified_('✅ Installation completed successfully');
  } catch (err) {
    logUnified_('❌ Installation warning', { error: err.message });
  }
}

// ============================================
// 🌐 WEB APP ROUTING
// ============================================

/**
 * 🎯 Reserved Web App Entry Point
 * Intelligent routing based on URL parameters
 * * Routes:
 * - ?ui=master      → Master Automation UI
 * - ?ui=debug       → Debug/Admin Dashboard
 * - ?ui=tem         → Text Expansion Manager UI (also default)
 * - (no param)      → Text Expansion Manager UI
 */
function doGet(e) {
  const startTime = new Date();
  const requestId = Utilities.getUuid().substring(0, 8);
  
  // Parse routing parameter
  const uiParam = String((e?.parameter?.ui || e?.parameter?.app || '')).toLowerCase().trim();
  
  logUnified_('🌐 doGet request', {
    requestId: requestId,
    uiParam: uiParam,
    allParams: e?.parameter,
    userAgent: e?.parameter?.userAgent || 'unknown'
  });

  let output;
  let routeName = 'UNKNOWN';

  try {
    // 🔀 Route to appropriate system
    if (matchesRoute_(uiParam, 'MASTER')) {
      routeName = 'MASTER';
      output = routeToMaster_(e);
      
    } else if (matchesRoute_(uiParam, 'DEBUG')) {
      routeName = 'DEBUG';
      output = routeToDebug_(e);
      
    } else {
      // Default: Text Expansion Manager
      routeName = 'TEM';
      output = routeToTEM_(e);
    }

    // Track successful routing
    const duration = new Date() - startTime;
    logUnified_(`✅ Routed to ${routeName}`, {
      requestId: requestId,
      duration: duration + 'ms'
    });
    
    storeMetrics_('doGet', { route: routeName, success: true }, duration);
    
    return output;

  } catch (err) {
    // 🚨 Critical routing error
    const duration = new Date() - startTime;
    logUnified_(`❌ Routing failed for ${routeName}`, {
      requestId: requestId,
      error: err.message,
      stack: err.stack,
      duration: duration + 'ms'
    });
    
    storeMetrics_('doGet', { route: routeName, success: false, error: err.message }, duration);
    
    return createErrorPage_(routeName, err);
  }
}

// ============================================
// 🔧 ROUTING HELPERS
// ============================================

/**
 * Route to Master Automation system
 */
function routeToMaster_(e) {
  if (typeof MASTER_handleDoGet_ !== 'function') {
    throw new Error('MASTER_handleDoGet_ function not found. Please ensure Master Automation code is included.');
  }
  return MASTER_handleDoGet_(e);
}

/**
 * Route to Debug Dashboard
 */
function routeToDebug_(e) {
  if (typeof DEBUG_handleDoGet_ !== 'function') {
    // Fallback: create basic debug dashboard inline
    return createDebugDashboard_();
  }
  return DEBUG_handleDoGet_(e);
}

/**
 * Route to Text Expansion Manager
 */
function routeToTEM_(e) {
  if (typeof TEM_doGet_ !== 'function') {
    throw new Error('TEM_doGet_ function not found. Please ensure Text Expansion Manager code is included.');
  }
  return TEM_doGet_(e);
}

/**
 * Check if parameter matches any route alias
 */
function matchesRoute_(param, systemKey) {
  const routes = UNIFIED_CONFIG_.ROUTES[systemKey] || [];
  return routes.some(route => route === param);
}

// ============================================
// 🛠️ INITIALIZATION HELPERS
// ============================================

/**
 * Initialize a system with error handling and timing
 */
function initializeSystem_(systemName, initFunction) {
  const startTime = new Date();
  const result = {
    success: false,
    error: null,
    duration: 0,
    skipped: false
  };

  try {
    const initialized = initFunction();
    if (initialized) {
      result.success = true;
      logUnified_(`✅ ${systemName} initialized`);
    } else {
      result.skipped = true;
      logUnified_(`⏭️ ${systemName} skipped (function not found)`);
    }
  } catch (err) {
    result.error = err.message;
    logUnified_(`❌ ${systemName} initialization failed`, {
      error: err.message,
      stack: UNIFIED_CONFIG_.LOGGING.VERBOSE ? err.stack : undefined
    });
  }

  result.duration = new Date() - startTime;
  return result;
}

/**
 * Initialize script properties on first run
 */
function initializeScriptProperties_() {
  const props = PropertiesService.getScriptProperties();
  
  // Set installation timestamp if not exists
  if (!props.getProperty('INSTALLATION_DATE')) {
    props.setProperty('INSTALLATION_DATE', new Date().toISOString());
  }
  
  // Initialize web app URL if available
  if (!props.getProperty('WEB_APP_URL') && !props.getProperty('WEBAPPURL')) {
    // This will be set after first deployment
    logUnified_('ℹ️ Web App URL not yet set (expected on first install)');
  }
  
  // Initialize metrics storage
  if (!props.getProperty('METRICS_ENABLED')) {
    props.setProperty('METRICS_ENABLED', 'true');
  }
}

// ============================================
// 📊 LOGGING & METRICS
// ============================================

/**
 * Unified logging system
 */
function logUnified_(message, data) {
  if (!UNIFIED_CONFIG_.LOGGING.ENABLED) return;

  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp: timestamp,
    message: message,
    data: data || {}
  };

  // Console logging
  if (UNIFIED_CONFIG_.LOGGING.VERBOSE && data) {
    console.log(`[${timestamp}] ${message}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[${timestamp}] ${message}`);
  }

  // Optional: Store in spreadsheet for review
  try {
    appendToLogSheet_(logEntry);
  } catch (err) {
    // Silent fail - don't break on logging errors
  }
}

/**
 * Append log entry to dedicated sheet
 */
function appendToLogSheet_(entry) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) return;

  let sheet = ss.getSheetByName('System Logs');
  if (!sheet) {
    sheet = ss.insertSheet('System Logs');
    sheet.appendRow(['Timestamp', 'Message', 'Data']);
    sheet.setFrozenRows(1);
  }

  // Limit log entries
  const maxRows = UNIFIED_CONFIG_.LOGGING.MAX_LOG_ENTRIES + 1; // +1 for header
  if (sheet.getLastRow() >= maxRows) {
    sheet.deleteRow(2); // Delete oldest entry (row 2, after header)
  }

  sheet.appendRow([
    entry.timestamp,
    entry.message,
    JSON.stringify(entry.data)
  ]);
}

/**
 * Store performance metrics
 */
function storeMetrics_(operation, results, duration) {
  if (!UNIFIED_CONFIG_.TRACK_PERFORMANCE) return;

  try {
    const props = PropertiesService.getScriptProperties();
    const metricsKey = `METRICS_${operation.toUpperCase()}`;
    
    const metric = {
      lastRun: new Date().toISOString(),
      duration: duration,
      results: results
    };
    
    props.setProperty(metricsKey, JSON.stringify(metric));
  } catch (err) {
    // Silent fail
  }
}

// ============================================
// 🎨 UI HELPERS
// ============================================

/**
 * Add unified admin menu to spreadsheet
 */
function addUnifiedAdminMenu_() {
  // 🛡️ SAFEGUARD: Try to build menu, fail gracefully if headless
  try {
    const ui = SpreadsheetApp.getUi(); // Throws if headless
    ui.createMenu('🔧 System Admin')
      .addItem('📊 View Dashboard', 'openDebugDashboard_')
      .addItem('📝 View System Logs', 'viewSystemLogs_')
      .addSeparator()
      .addItem('🌐 Open Text Expander', 'openTextExpander_')
      .addItem('⚙️ Open Master Automation', 'openMasterAutomation_')
      .addSeparator()
      .addItem('🔄 Refresh All Systems', 'refreshAllSystems_')
      .addItem('🗑️ Clear Logs', 'clearSystemLogs_')
      .addToUi();
  } catch (err) {
    // Graceful failure - log warning but don't crash the script
    logUnified_('⚠️ Could not create admin menu (likely headless/editor execution)', { error: err.message });
  }
}

/**
 * Menu action: Open debug dashboard
 */
function openDebugDashboard_() {
  const url = getWebAppUrlWithUi_('debug');
  if (url) {
    const html = HtmlService.createHtmlOutput(`
      <script>
        window.open('${url}', '_blank');
        google.script.host.close();
      </script>
    `).setWidth(200).setHeight(100);
    SpreadsheetApp.getUi().showModalDialog(html, 'Opening Dashboard...');
  } else {
    SpreadsheetApp.getUi().alert('Web App URL not configured. Please deploy as web app first.');
  }
}

/**
 * Menu action: View system logs
 */
function viewSystemLogs_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('System Logs');
  if (sheet) {
    ss.setActiveSheet(sheet);
  } else {
    SpreadsheetApp.getUi().alert('No logs available yet. System Logs sheet will be created on first log entry.');
  }
}

/**
 * Menu action: Open Text Expander
 */
function openTextExpander_() {
  const url = getWebAppUrlWithUi_('tem');
  if (url) {
    const html = HtmlService.createHtmlOutput(`
      <script>
        window.open('${url}', '_blank');
        google.script.host.close();
      </script>
    `).setWidth(200).setHeight(100);
    SpreadsheetApp.getUi().showModalDialog(html, 'Opening Text Expander...');
  }
}

/**
 * Menu action: Open Master Automation
 */
function openMasterAutomation_() {
  const url = getWebAppUrlWithUi_('master');
  if (url) {
    const html = HtmlService.createHtmlOutput(`
      <script>
        window.open('${url}', '_blank');
        google.script.host.close();
      </script>
    `).setWidth(200).setHeight(100);
    SpreadsheetApp.getUi().showModalDialog(html, 'Opening Master Automation...');
  }
}

/**
 * Menu action: Refresh all systems
 */
function refreshAllSystems_() {
  const ui = SpreadsheetApp.getUi();
  const response = ui.alert(
    'Refresh All Systems',
    'This will reload all system configurations. Continue?',
    ui.ButtonSet.YES_NO
  );
  
  if (response === ui.Button.YES) {
    onOpen({ authMode: ScriptApp.AuthMode.FULL });
    ui.alert('✅ All systems refreshed successfully!');
  }
}

/**
 * Menu action: Clear system logs
 */
function clearSystemLogs_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('System Logs');
  if (sheet) {
    sheet.clear();
    sheet.appendRow(['Timestamp', 'Message', 'Data']);
    sheet.setFrozenRows(1);
    SpreadsheetApp.getUi().alert('✅ System logs cleared!');
  }
}

// ============================================
// 🔗 URL HELPERS
// ============================================

/**
 * Build web app URL with routing parameter
 * Compatible with existing WEB_APP_URL / WEBAPPURL conventions
 */
function getWebAppUrlWithUi_(ui) {
  // Try multiple methods to get base URL
  const base = getBaseWebAppUrl_();
  if (!base) {
    logUnified_('⚠️ Web App URL not configured');
    return '';
  }

  // Parse URL components
  const urlStr = String(base);
  const parts = urlStr.split('#');
  const baseNoHash = parts[0];
  const hash = parts[1] ? '#' + parts[1] : '';

  // Add ui parameter
  const hasQuery = baseNoHash.indexOf('?') !== -1;
  const separator = hasQuery ? '&' : '?';
  
  return baseNoHash + separator + 'ui=' + encodeURIComponent(String(ui || '')) + hash;
}

/**
 * Get base web app URL from multiple possible sources
 */
function getBaseWebAppUrl_() {
  // Method 1: Existing helper function
  if (typeof getWebAppUrl_ === 'function') {
    const url = getWebAppUrl_();
    if (url) return url;
  }

  // Method 2: Script Properties
  const props = PropertiesService.getScriptProperties();
  const url = props.getProperty('WEB_APP_URL') || props.getProperty('WEBAPPURL');
  if (url) return url;

  // Method 3: Get from ScriptApp (only works in certain contexts)
  try {
    const url = ScriptApp.getService().getUrl();
    if (url) {
      props.setProperty('WEB_APP_URL', url); // Cache for future use
      return url;
    }
  } catch (err) {
    // Not available in this context
  }

  return '';
}

// ============================================
// 🚨 ERROR HANDLING
// ============================================

/**
 * Create user-friendly error page
 */
function createErrorPage_(systemName, error) {
  const showDetails = UNIFIED_CONFIG_.ERROR_DISPLAY;
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          .error-card {
            background: white;
            border-radius: 20px;
            padding: 40px;
            max-width: 600px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          }
          .icon { font-size: 64px; margin-bottom: 20px; }
          h1 { color: #e53e3e; margin-bottom: 10px; }
          h2 { color: #4a5568; margin-bottom: 20px; font-weight: 500; }
          .system { 
            display: inline-block;
            background: #edf2f7;
            padding: 8px 16px;
            border-radius: 8px;
            font-family: monospace;
            margin-bottom: 20px;
          }
          .error-details {
            background: #fff5f5;
            border: 2px solid #feb2b2;
            border-radius: 12px;
            padding: 20px;
            margin-top: 20px;
            font-family: monospace;
            font-size: 14px;
            color: #742a2a;
            overflow-x: auto;
          }
          .suggestions {
            background: #f0fff4;
            border: 2px solid #9ae6b4;
            border-radius: 12px;
            padding: 20px;
            margin-top: 20px;
          }
          .suggestions h3 {
            color: #2f855a;
            margin-bottom: 12px;
          }
          .suggestions ul {
            margin-left: 20px;
            color: #276749;
          }
          .suggestions li {
            margin-bottom: 8px;
          }
          .back-btn {
            display: inline-block;
            margin-top: 20px;
            padding: 12px 24px;
            background: #667eea;
            color: white;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
          }
          .back-btn:hover {
            background: #5a67d8;
          }
        </style>
      </head>
      <body>
        <div class="error-card">
          <div class="icon">🚨</div>
          <h1>System Error</h1>
          <h2>Unable to load ${systemName}</h2>
          <div class="system">Route: ${systemName}</div>
          
          ${showDetails ? `
            <div class="error-details">
              <strong>Error Message:</strong><br>
              ${error.message || 'Unknown error'}
              ${error.stack ? `<br><br><strong>Stack Trace:</strong><br>${error.stack}` : ''}
            </div>
          ` : ''}
          
          <div class="suggestions">
            <h3>💡 Troubleshooting Steps:</h3>
            <ul>
              <li>Ensure all code files are properly deployed</li>
              <li>Check that function names match exactly (case-sensitive)</li>
              <li>Verify Script Properties are configured</li>
              <li>Try refreshing the page</li>
              <li>Contact your administrator if the issue persists</li>
            </ul>
          </div>
          
          <a href="?ui=debug" class="back-btn">🐞 Go to Debug Dashboard</a>
        </div>
      </body>
    </html>
  `;
  
  return HtmlService.createHtmlOutput(html)
    .setTitle(`Error - ${systemName}`)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Create basic debug dashboard (inline fallback)
 */
function createDebugDashboard_() {
  const props = PropertiesService.getScriptProperties();
  const allProps = props.getProperties();
  
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
            background: #0f172a;
            color: white;
            padding: 40px 20px;
          }
          .container { max-width: 1200px; margin: 0 auto; }
          h1 { margin-bottom: 30px; }
          .section {
            background: rgba(255,255,255,0.05);
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 20px;
          }
          .section h2 {
            color: #a78bfa;
            margin-bottom: 16px;
            font-size: 18px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
          }
          th, td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid rgba(255,255,255,0.1);
          }
          th { color: #818cf8; font-weight: 600; }
          code {
            background: rgba(0,0,0,0.3);
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 13px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🐞 System Debug Dashboard</h1>
          
          <div class="section">
            <h2>📊 System Status</h2>
            <table>
              <tr>
                <th>Component</th>
                <th>Status</th>
              </tr>
              <tr>
                <td>Text Expansion Manager</td>
                <td>${typeof TEM_doGet_ === 'function' ? '✅ Loaded' : '❌ Not Found'}</td>
              </tr>
              <tr>
                <td>Master Automation</td>
                <td>${typeof MASTER_handleDoGet_ === 'function' ? '✅ Loaded' : '❌ Not Found'}</td>
              </tr>
              <tr>
                <td>Debug Functions</td>
                <td>${typeof DEBUG_handleDoGet_ === 'function' ? '✅ Loaded' : '⚠️ Using Fallback'}</td>
              </tr>
            </table>
          </div>
          
          <div class="section">
            <h2>⚙️ Script Properties</h2>
            <table>
              <tr>
                <th>Property</th>
                <th>Value</th>
              </tr>
              ${Object.keys(allProps).map(key => `
                <tr>
                  <td><code>${key}</code></td>
                  <td>${allProps[key].substring(0, 100)}${allProps[key].length > 100 ? '...' : ''}</td>
                </tr>
              `).join('')}
            </table>
          </div>
          
          <div class="section">
            <h2>🔗 Quick Links</h2>
            <p><a href="?ui=tem" style="color: #818cf8;">📝 Text Expansion Manager</a></p>
            <p><a href="?ui=master" style="color: #818cf8;">⚙️ Master Automation</a></p>
          </div>
        </div>
      </body>
    </html>
  `;
  
  return HtmlService.createHtmlOutput(html)
    .setTitle('Debug Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}