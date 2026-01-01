// ========================================================================
// FEATURE 1: PAGINATION FUNCTIONS
// ========================================================================

/**
 * Navigate to a specific page number
 * @param {number} page - Target page number (1-indexed)
 */
function goToPage(page) {
  totalPages = Math.ceil((filteredShortcuts?.length || 0) / ITEMS_PER_PAGE);
  
  if (page < 1 || page > totalPages || page === currentPage) {
    return;
  }
  
  currentPage = page;
  renderImmediate();
  updatePaginationUI();
  
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Update pagination UI state (button disabled states, page counter)
 */
function updatePaginationUI() {
  totalPages = Math.ceil((filteredShortcuts?.length || 0) / ITEMS_PER_PAGE);
  
  const currentPageNum = document.getElementById('currentPageNum');
  const totalPagesNum = document.getElementById('totalPagesNum');
  if (currentPageNum) currentPageNum.textContent = currentPage;
  if (totalPagesNum) totalPagesNum.textContent = totalPages;
  
  const btnFirst = document.getElementById('btnFirstPage');
  const btnPrev = document.getElementById('btnPrevPage');
  const btnNext = document.getElementById('btnNextPage');
  const btnLast = document.getElementById('btnLastPage');
  
  if (btnFirst) btnFirst.disabled = currentPage === 1;
  if (btnPrev) btnPrev.disabled = currentPage === 1;
  if (btnNext) btnNext.disabled = currentPage >= totalPages;
  if (btnLast) btnLast.disabled = currentPage >= totalPages;
  
  const paginationControls = document.getElementById('paginationControls');
  if (paginationControls) {
    paginationControls.style.display = totalPages <= 1 ? 'none' : 'flex';
  }
}

// ========================================================================
// FEATURE 2: FILTER MEMOIZATION CACHE FUNCTIONS
// ========================================================================

/**
 * Filter shortcuts with memoization for performance
 * @param {Array} shortcuts - Full shortcuts array
 * @param {string} searchQuery - Search term
 * @param {string} langFilter - Language filter
 * @param {string} typeFilter - Type filter
 * @param {string} categoryFilter - Category filter
 * @param {string} styleFilter - Style filter
 * @returns {Array} Filtered shortcuts array
 */
function filterShortcutsMemoized(shortcuts, searchQuery, langFilter, typeFilter, categoryFilter, styleFilter) {
  const cacheKey = `${searchQuery}|${langFilter}|${typeFilter}|${categoryFilter}|${styleFilter}`;
  
  if (filterCache.key === cacheKey) {
    filterCache.hits++;
    console.debug(`🎯 Cache HIT #${filterCache.hits} (${filterCache.hits} hits, ${filterCache.misses} misses)`);
    return filterCache.results;
  }
  
  console.debug(`⚡ Cache MISS - Filtering ${shortcuts.length} items...`);
  const startTime = performance.now();
  
  const filtered = shortcuts.filter(item => {
    const matchesSearch = !searchQuery || 
      (item.name && item.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.content && item.content.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.tags && item.tags.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.language && item.language.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.app && item.app.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesLang = langFilter === 'all' || item.language === langFilter;
    const matchesType = typeFilter === 'all' || item.type === typeFilter;
    const matchesCat = categoryFilter === 'all' || item.category === categoryFilter;
    const matchesStyle = styleFilter === 'all' || item.style === styleFilter;
    
    return matchesSearch && matchesLang && matchesType && matchesCat && matchesStyle;
  });
  
  const elapsed = performance.now() - startTime;
  console.debug(`✅ Filtered in ${elapsed.toFixed(2)}ms - ${filtered.length} / ${shortcuts.length} results`);
  
  filterCache = {
    key: cacheKey,
    results: filtered,
    timestamp: Date.now(),
    hits: filterCache.hits,
    misses: filterCache.misses + 1
  };
  
  return filtered;
}

/**
 * Invalidate filter cache (call when data source changes)
 */
function invalidateFilterCache() {
  filterCache = { key: '', results: [], timestamp: 0, hits: 0, misses: 0 };
  console.debug('🗑️ Filter cache cleared');
}

// ========================================================================
// FEATURE 3: GRID/LIST VIEW TOGGLE FUNCTIONS
// ========================================================================

/**
 * Set view mode (grid or list) and persist to localStorage
 * @param {string} mode - View mode ('grid' | 'list')
 */
function setViewMode(mode) {
  if (mode !== 'grid' && mode !== 'list') {
    console.warn(`Invalid view mode: ${mode}`);
    return;
  }
  
  viewMode = mode;
  localStorage.setItem('viewMode', mode);
  applyViewMode();
  
  const modeLabel = mode === 'grid' ? '🔲 Grid' : '📋 List';
  toast(`View mode: ${modeLabel}`, 'good');
}

/**
 * Initialize view mode from localStorage on page load
 */
function initViewMode() {
  const saved = localStorage.getItem('viewMode');
  if (saved && (saved === 'grid' || saved === 'list')) {
    viewMode = saved;
  }
  applyViewMode();
}

/**
 * Apply view mode to DOM (CSS class toggle and button states)
 */
function applyViewMode() {
  const grid = document.getElementById('shortcutsGrid');
  const btnGrid = document.getElementById('btnGridView');
  const btnList = document.getElementById('btnListView');
  
  if (!grid) return;
  
  if (viewMode === 'list') {
    grid.classList.add('list-view');
    if (btnList) {
      btnList.classList.add('active');
      btnList.setAttribute('aria-pressed', 'true');
    }
    if (btnGrid) {
      btnGrid.classList.remove('active');
      btnGrid.setAttribute('aria-pressed', 'false');
    }
  } else {
    grid.classList.remove('list-view');
    if (btnGrid) {
      btnGrid.classList.add('active');
      btnGrid.setAttribute('aria-pressed', 'true');
    }
    if (btnList) {
      btnList.classList.remove('active');
      btnList.setAttribute('aria-pressed', 'false');
    }
  }
}

// ========================================================================
// FEATURE 4: FONT STYLE FILTER FUNCTIONS
// ========================================================================

/**
 * Set the active style filter and re-render shortcuts
 * @param {string} style - Style key (e.g., 'bold', 'italic', 'all')
 */
function setStyleFilter(style) {
  if (activeStyleFilter === style) return;
  
  activeStyleFilter = style;
  currentPage = 1;
  renderImmediate();
  updateStyleChipsUI();
  
  const styleName = style === 'all' ? 'All Styles' : (FONT_STYLES[style] || style);
  toast(`Filter: ${styleName}`, 'good');
}

/**
 * Update style chip active states in UI
 */
function updateStyleChipsUI() {
  const chips = document.querySelectorAll('#styleFilters .chip');
  chips.forEach(chip => {
    const filterValue = chip.getAttribute('data-filter');
    if (filterValue === activeStyleFilter) {
      chip.classList.add('active');
      chip.setAttribute('aria-pressed', 'true');
    } else {
      chip.classList.remove('active');
      chip.setAttribute('aria-pressed', 'false');
    }
  });
}

/**
 * Dynamically render style filter chips based on available styles in data
 * Call this after shortcuts data is loaded from server
 */
function renderStyleFilters() {
  const container = document.getElementById('styleFilters');
  if (!container) {
    console.warn('Style filters container not found');
    return;
  }
  
  const hasStyleProperty = state.shortcuts && state.shortcuts.some(s => s.style);
  
  if (!hasStyleProperty) {
    container.style.display = 'none';
    console.warn('⚠️ No style property found in shortcuts data. Style filter hidden.');
    return;
  }
  
  const uniqueStyles = new Set();
  state.shortcuts.forEach(shortcut => {
    if (shortcut.style) {
      uniqueStyles.add(shortcut.style);
    }
  });
  
  const styles = Array.from(uniqueStyles).sort();
  
  let chipsHTML = '<span class="filter-label" id="styleFilterLabel">Style:</span>';
  chipsHTML += `
    <div class="chip active" data-filter="all" data-filter-type="style" onclick="setStyleFilter('all')" role="button" tabindex="0" aria-label="All styles" aria-pressed="true">
      ✨ All Styles
    </div>
  `;
  
  styles.forEach(style => {
    let displayName;
    if (FONT_STYLES[style]) {
      displayName = FONT_STYLES[style].split'(')[0].trim();
    } else {
      displayName = style.charAt(0).toUpperCase() + style.slice(1).replace(/-/g, ' ');
    }
    
    chipsHTML += `
      <div class="chip" data-filter="${escapeHtml(style)}" data-filter-type="style" onclick="setStyleFilter('${escapeHtml(style)}')" role="button" tabindex="0" aria-label="${escapeHtml(displayName)}" aria-pressed="false">
        ${escapeHtml(displayName)}
      </div>
    `;
  });
  
  container.innerHTML = chipsHTML;
  container.style.display = 'flex';
  
  console.log(`✅ Rendered ${styles.length} style filters:`, styles);
}
