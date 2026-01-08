/**
 * ✅ Text Expander Manager entrypoints (renamed)
 * Original source: Code.gs onOpen/doGet blocks
 *
 * IMPORTANT:
 * - The OLD onOpen(), onInstall(), doGet() in Code.gs should be removed.
 * - These versions (TEM_onOpen_, TEM_doGet_) are called by 00_ProjectEntryPoints.gs
 */

function TEM_onOpen_(e) {
  ensureSheets_();
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('📝 Text Expansion Tools')
    .addItem('🚀 Open Manager (Sidebar)', 'openManagerSidebar')
    .addItem('🖼️ Open Manager (Dialog)', 'openManagerDialog')
    .addSeparator()
    .addSubMenu(ui.createMenu('🐍 Python Tools (Colab)')
      .addItem('🧠 Run ML Categorizer', 'openMLCategorizer')
      .addItem('🛡️ Run Data Quality Check', 'openDataQuality')
      .addItem('👯 Run Duplicate Finder', 'openDuplicateFinder')
      .addItem('📊 Run Analytics', 'openAnalytics')
      .addSeparator()
      .addItem('💾 Run Backup System', 'openBackupSystem')
      .addItem('🌉 Run Drive Bridge', 'openDriveBridge')
      .addItem('✨ Run Font Categorizer', 'openFontCategorizer')
      .addItem('📝 Run Text Expander Categorizer', 'openTextExpanderCategorizer')
      .addSeparator()
      .addItem('📂 Open Tools Folder', 'openToolsFolder')
    )
    .addSeparator()
    .addItem('🌐 Open Web App (New Tab)', 'openWebAppLinkDialog')
    .addSeparator()
    .addItem('🔄 Warm Cache (10k+)', 'warmShortcutsCache')
    .addItem('🗑️ Invalidate Cache', 'invalidateShortcutsCache')
    .addSeparator()
    .addSubMenu(ui.createMenu('🧹 Cleanup')
      .addItem('📋 Cleanup Shortcuts Only', 'cleanupDuplicateShortcuts')
      .addItem('⭐ Cleanup Favorites Only', 'cleanupDuplicateFavorites')
      .addItem('🧼 Cleanup Both', 'cleanupAllDuplicates')
    )
    .addSeparator()
    .addSubMenu(ui.createMenu('🔽 Dropdown Setup')
      .addItem('✅ Add Enhanced Dropdowns', 'addEnhancedDropdowns')
      .addItem('🧹 Remove Dropdown Validations', 'removeEnhancedDropdowns')
    )
    .addSeparator()
    .addItem('📘 About / Help', 'openTextExpanderHelpDialog')
    .addToUi();

  // If your Python Bridge exists, attach its menu too (safe optional) 🤖
  try {
    if (typeof addBridgeMenu === "function") addBridgeMenu();
  } catch (err) {
    // ignore
  }
}

function TEM_doGet_(e) {
  ensureSheets_();
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Text Expansion Manager')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * ✅ Upgraded Web App link dialog:
 * - Shows BOTH Text Expander and Master UI routes if the base URL is stored 🔗✨
 */
function openWebAppLinkDialog() {
  ensureSheets_();

  const base = (typeof getWebAppUrl_ === "function" ? getWebAppUrl_() : "") || "";
  const temUrl = base ? getWebAppUrlWithUi_("tem") : "";
  const masterUrl = base ? getWebAppUrlWithUi_("master") : "";

  const safeBase = base ? String(base).replace(/"/g, '&quot;') : '';
  const safeTem = temUrl ? String(temUrl).replace(/"/g, '&quot;') : '';
  const safeMaster = masterUrl ? String(masterUrl).replace(/"/g, '&quot;') : '';

  const body = base
    ? `
      <div style="font-family:Arial,sans-serif;line-height:1.45;padding:12px">
        <h3 style="margin:0 0 8px 0">🌐 Open Web App</h3>
        <p style="margin:0 0 10px 0">Base URL:</p>
        <p style="margin:0 0 12px 0"><a href="${safeBase}" target="_blank" rel="noreferrer">${safeBase}</a></p>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin:10px 0 12px 0">
          <a style="padding:10px 12px;background:#1a73e8;color:#fff;border-radius:8px;text-decoration:none"
             href="${safeTem}" target="_blank" rel="noreferrer">📝 Text Expander UI</a>

          <a style="padding:10px 12px;background:#6d28d9;color:#fff;border-radius:8px;text-decoration:none"
             href="${safeMaster}" target="_blank" rel="noreferrer">⚙️ Master UI</a>
        </div>

        <button style="padding:8px 10px" onclick="navigator.clipboard.writeText('${safeBase}');this.innerText='✅ Copied Base URL!';">Copy Base URL</button>
      </div>`
    : `
      <div style="font-family:Arial,sans-serif;line-height:1.45;padding:12px">
        <h3 style="margin:0 0 8px 0">⚠️ Web App URL Not Available</h3>
        <p style="margin:0 0 8px 0">Deploy as a Web App (Deploy → New deployment → Web app) to get a URL.</p>
        <p style="margin:0">Then store it in Script Properties as <b>WEB_APP_URL</b> or <b>WEBAPPURL</b> ✅</p>
      </div>`;

  const html = HtmlService.createHtmlOutput(body).setWidth(560).setHeight(320);
  SpreadsheetApp.getUi().showModalDialog(html, 'Web App Link');
}

/**
 * Opens the Text Expander Categorizer Colab notebook
 */
function openTextExpanderCategorizer() {
  const url = CFG.PYTHON_URLS.TEXT_EXPANDER_CATEGORIZER;
  if (url) {
    openUrlInNewTab_(url);
  } else {
    SpreadsheetApp.getUi().alert('Text Expander Categorizer URL not configured.');
  }
}
