/**
 * HelpDialog.gs ✅
 * Adds a safe, readable help dialog explaining every column
 */

function openTextExpanderHelpDialog() {
  const html = HtmlService.createHtmlOutput(buildHelpHtml_())
    .setWidth(700)
    .setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, "📘 Text Expander Help");
}

function buildHelpHtml_() {
  const css = `
    <style>
      body{font-family:Arial,sans-serif;padding:16px;line-height:1.45;color:#202124}
      h2{margin:0 0 10px 0}
      .card{border:1px solid #e0e0e0;border-radius:10px;padding:12px;margin:10px 0;background:#fff}
      .k{font-weight:700}
      .tip{background:#f1f8ff;border:1px solid #d2e3fc;border-radius:10px;padding:10px}
      code{background:#f6f8fa;padding:2px 6px;border-radius:6px}
    </style>
  `;

  const body = `
    <h2>📘 Text Expansion Manager — Column Guide</h2>

    <div class="tip">
      ✅ Rule of thumb: <b>Snippet Name + Content</b> power the actual expansion.<br>
      🏷️ Everything else is <b>metadata</b> for organizing, filtering, exporting, and analysis.
    </div>

    <div class="card"><div class="k">Snippet Name</div>Trigger you type (ex: <code>ty</code>). This is what your keyboard app watches for.</div>
    <div class="card"><div class="k">Content</div>The expanded text that gets inserted when the trigger matches.</div>
    <div class="card"><div class="k">Application</div>Where this belongs (ex: <code>GBOARD</code>). Helps keep multiple ecosystems clean.</div>
    <div class="card"><div class="k">Description (Type)</div>🏷️ Your "kind" label (Fonts, Greetings, Numbers…). Used heavily by UI filters.</div>
    <div class="card"><div class="k">Language</div>🌍 Used for search + filtering; doesn't affect expansion output unless your exporter uses it.</div>
    <div class="card"><div class="k">Tags</div>Extra keywords. You can use comma-separated tags for better search.</div>
    <div class="card"><div class="k">UpdatedAt</div>Timestamp (manual or automated). Great for audits and "what changed?" tracking.</div>
    <div class="card"><div class="k">MainCategory</div>🗂️ Big bucket (Static / Emc). Useful for segmentation and dashboards.</div>
    <div class="card"><div class="k">Subcategory</div>📁 Smaller bucket inside MainCategory (Animals, Tags, Smileys...).</div>
    <div class="card"><div class="k">FontStyle</div>🔤 Style label for fancy/unicode/standard/etc — great for quick filtering.</div>
    <div class="card"><div class="k">Platform</div>📱 Where you primarily use it (Gboard/iOS/Web/etc).</div>
    <div class="card"><div class="k">UsageFrequency</div>⏱️ Rare/Daily/etc — helps prioritize favorites and cleanup.</div>

    <div class="tip">
      🔥 Safe editing tip: You can change dropdowns anytime — they are <b>labels</b>.<br>
      The only "danger zone" is accidentally deleting core columns or header names.
    </div>
  `;

  return css + body;
}
