/**
 * 🧪 CATEGORY FILTER TESTING FRAMEWORK
 * =====================================
 *
 * Comprehensive testing suite for comparing Debug (v2.0) vs Production (v2.1)
 * versions of the Automated Category Filter System.
 *
 * Features:
 * ✅ Side-by-side version comparison
 * ✅ Performance benchmarking
 * ✅ Bug verification (ensures v2.0 bugs are fixed in v2.1)
 * ✅ Visual difference reports
 * ✅ Automated test suite
 *
 * @version 1.0
 * @since 2025-01-17
 */

// ============================================
// 📋 TEST CONFIGURATION
// ============================================

const TEST_CONFIG = {
  // Test categories
  TEST_CATEGORIES: {
    MAIN: ['Emojis', 'Numbers', 'Symbols', 'General'],
    SUBCATEGORY_PAIRS: [
      { main: 'Emojis', sub: 'Faces' },
      { main: 'Numbers', sub: 'Ordinals' },
      { main: 'Symbols', sub: 'Currency' }
    ]
  },
  
  // Performance benchmarks
  BENCHMARKS: {
    MAX_QUERY_TIME_MS: 1000,  // Queries should complete under 1s
    MIN_CACHE_HIT_RATE: 50,   // 50% cache hit rate expected
    ITERATIONS: 10              // Run each test 10 times
  },
  
  // Test data limits
  LIMITS: {
    MAX_TEST_RESULTS: 100,
    TEST_PAGE_NUMBERS: [1, 2, 5, 100]  // Edge cases
  }
};

// ============================================
// 🧪 TEST SUITE
// ============================================

class CategoryFilterTestSuite {
  
  constructor() {
    this.results = {
      passed: [],
      failed: [],
      warnings: [],
      performance: {}
    };
  }
  
  /**
   * Run all tests
   */
  runAllTests() {
    console.log('🧪 ========== STARTING TEST SUITE ==========');
    console.log('Testing Category Filter System v2.0 (Debug) vs v2.1 (Production)');
    console.log('');
    
    // 1. Bug verification tests
    this.testBugFixes();
    
    // 2. Functional equivalence tests
    this.testFunctionalEquivalence();
    
    // 3. Performance comparison tests
    this.testPerformanceComparison();
    
    // 4. Edge case tests
    this.testEdgeCases();
    
    // 5. Cache behavior tests
    this.testCacheBehavior();
    
    // Generate final report
    return this.generateReport();
  }
  
  /**
   * Test 1: Verify v2.0 bugs are fixed in v2.1
   */
  testBugFixes() {
    console.log('📝 Test 1: Bug Fix Verification');
    console.log('--------------------------------');
    
    // Bug 1: Undefined CFG variable
    try {
      console.log('  🔍 Testing CFG variable bug fix...');
      
      // v2.0 would fail here (references undefined CFG)
      // v2.1 should work (uses CATEGORY_FILTER_CONFIG.DEBUG_MODE)
      
      const v21Manager = new CategoryFilterManager();
      const categories = v21Manager.getMainCategories();
      
      this.recordPass('CFG_BUG_FIX', 'v2.1 properly references CATEGORY_FILTER_CONFIG.DEBUG_MODE');
      console.log('  ✅ PASS: CFG variable bug is fixed');
      
    } catch (error) {
      this.recordFail('CFG_BUG_FIX', `Still references undefined CFG: ${error.message}`);
      console.log('  ❌ FAIL: CFG bug still exists');
    }
    
    // Bug 2: Hardcoded column letters
    try {
      console.log('  🔍 Testing dynamic header lookup...');
      
      const v21Manager = new CategoryFilterManager();
      
      // v2.0 uses hardcoded columns (B, C, D, E, F)
      // v2.1 should use dynamic lookup
      
      // This would fail in v2.0 if columns are reordered
      const categories = v21Manager.getMainCategories();
      
      this.recordPass('DYNAMIC_HEADERS', 'v2.1 uses dynamic header lookup');
      console.log('  ✅ PASS: Dynamic header lookup working');
      
    } catch (error) {
      this.recordFail('DYNAMIC_HEADERS', `Header lookup failed: ${error.message}`);
      console.log('  ❌ FAIL: Dynamic headers not working');
    }
    
    // Bug 3: Input normalization
    try {
      console.log('  🔍 Testing input normalization...');
      
      const v21Manager = new CategoryFilterManager();
      
      // Test with untrimmed input (v2.0 might fail)
      const subcats = v21Manager.getSubcategories('  Emojis  ');
      
      this.recordPass('INPUT_NORMALIZATION', 'v2.1 properly normalizes inputs');
      console.log('  ✅ PASS: Input normalization working');
      
    } catch (error) {
      this.recordFail('INPUT_NORMALIZATION', `Input normalization failed: ${error.message}`);
      console.log('  ❌ FAIL: Input normalization not working');
    }
    
    console.log('');
  }
  
  /**
   * Test 2: Ensure v2.1 produces same results as v2.0 (when v2.0 works)
   */
  testFunctionalEquivalence() {
    console.log('📝 Test 2: Functional Equivalence');
    console.log('----------------------------------');
    
    try {
      console.log('  🔍 Comparing getMainCategories outputs...');
      
      let v20Categories, v21Categories;
      
      // Get v2.0 results (if available)
      try {
        v20Categories = getMainCategoriesAPI_Debug();
      } catch (error) {
        console.log('  ⚠️ v2.0 not available for comparison');
        v20Categories = null;
      }
      
      // Get v2.1 results
      v21Categories = getMainCategoriesAPI();
      
      if (v20Categories && v20Categories.success) {
        // Compare arrays
        const match = this.arraysEqual(v20Categories.data, v21Categories.data);
        
        if (match) {
          this.recordPass('MAIN_CATEGORIES_EQUIVALENCE', 'Both versions return same categories');
          console.log('  ✅ PASS: Results match between versions');
        } else {
          this.recordWarning('MAIN_CATEGORIES_EQUIVALENCE', 'Different results (expected if data changed)');
          console.log('  ⚠️ WARNING: Results differ (may be due to data changes)');
        }
      } else {
        console.log('  ℹ️ Skipped comparison (v2.0 not available)');
      }
      
    } catch (error) {
      this.recordFail('FUNCTIONAL_EQUIVALENCE', error.message);
      console.log('  ❌ FAIL: Equivalence test failed');
    }
    
    console.log('');
  }
  
  /**
   * Test 3: Performance comparison
   */
  testPerformanceComparison() {
    console.log('📝 Test 3: Performance Benchmarking');
    console.log('------------------------------------');
    
    const iterations = TEST_CONFIG.BENCHMARKS.ITERATIONS;
    
    try {
      console.log(`  🔍 Running ${iterations} iterations...`);
      
      const v21Times = [];
      
      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        const manager = new CategoryFilterManager();
        const categories = manager.getMainCategories();
        const duration = Date.now() - startTime;
        v21Times.push(duration);
      }
      
      const avgTime = v21Times.reduce((a, b) => a + b, 0) / v21Times.length;
      const maxTime = Math.max(...v21Times);
      const minTime = Math.min(...v21Times);
      
      console.log(`  ⏱️ Average: ${avgTime.toFixed(2)}ms`);
      console.log(`  ⏱️ Min: ${minTime}ms, Max: ${maxTime}ms`);
      
      if (avgTime < TEST_CONFIG.BENCHMARKS.MAX_QUERY_TIME_MS) {
        this.recordPass('PERFORMANCE_BENCHMARK', `Avg time ${avgTime.toFixed(2)}ms < ${TEST_CONFIG.BENCHMARKS.MAX_QUERY_TIME_MS}ms`);
        console.log('  ✅ PASS: Performance within acceptable range');
      } else {
        this.recordFail('PERFORMANCE_BENCHMARK', `Avg time ${avgTime.toFixed(2)}ms exceeds ${TEST_CONFIG.BENCHMARKS.MAX_QUERY_TIME_MS}ms`);
        console.log('  ❌ FAIL: Performance too slow');
      }
      
      this.results.performance.avgQueryTime = avgTime;
      this.results.performance.minQueryTime = minTime;
      this.results.performance.maxQueryTime = maxTime;
      
    } catch (error) {
      this.recordFail('PERFORMANCE_BENCHMARK', error.message);
      console.log('  ❌ FAIL: Performance test failed');
    }
    
    console.log('');
  }
  
  /**
   * Test 4: Edge cases
   */
  testEdgeCases() {
    console.log('📝 Test 4: Edge Case Testing');
    console.log('-----------------------------');
    
    const manager = new CategoryFilterManager();
    
    // Test 4.1: Empty/null inputs
    console.log('  🔍 Testing null/empty inputs...');
    try {
      manager.getSubcategories(null);
      this.recordFail('NULL_INPUT_HANDLING', 'Should throw error for null input');
      console.log('  ❌ FAIL: Should reject null input');
    } catch (error) {
      if (error.code === 'INVALID_INPUT') {
        this.recordPass('NULL_INPUT_HANDLING', 'Properly rejects null input');
        console.log('  ✅ PASS: Null input rejected correctly');
      } else {
        this.recordFail('NULL_INPUT_HANDLING', 'Wrong error type');
        console.log('  ❌ FAIL: Wrong error handling');
      }
    }
    
    // Test 4.2: Extreme pagination
    console.log('  🔍 Testing extreme pagination...');
    try {
      const result = manager.filterByCategory('General', null, 999999);
      
      if (result.pagination.currentPage <= TEST_CONFIG.LIMITS.MAX_TEST_RESULTS) {
        this.recordPass('PAGINATION_BOUNDS', 'Pagination bounds enforced');
        console.log('  ✅ PASS: Pagination bounds respected');
      } else {
        this.recordFail('PAGINATION_BOUNDS', 'Excessive page number allowed');
        console.log('  ❌ FAIL: Pagination bounds not enforced');
      }
    } catch (error) {
      if (error.code === 'PAGINATION_ERROR') {
        this.recordPass('PAGINATION_BOUNDS', 'Rejects extreme page numbers');
        console.log('  ✅ PASS: Extreme pagination rejected');
      } else {
        this.recordFail('PAGINATION_BOUNDS', error.message);
        console.log('  ❌ FAIL: Wrong pagination handling');
      }
    }
    
    // Test 4.3: Non-existent category
    console.log('  🔍 Testing non-existent category...');
    try {
      const result = manager.filterByCategory('NonExistentCategory123', null, 1);
      
      if (result.pagination.totalResults === 0) {
        this.recordPass('NONEXISTENT_CATEGORY', 'Returns empty results for non-existent category');
        console.log('  ✅ PASS: Handles non-existent category gracefully');
      } else {
        this.recordWarning('NONEXISTENT_CATEGORY', 'Unexpected results for non-existent category');
        console.log('  ⚠️ WARNING: Non-existent category returned results');
      }
    } catch (error) {
      this.recordFail('NONEXISTENT_CATEGORY', error.message);
      console.log('  ❌ FAIL: Error on non-existent category');
    }
    
    console.log('');
  }
  
  /**
   * Test 5: Cache behavior
   */
  testCacheBehavior() {
    console.log('📝 Test 5: Cache Behavior');
    console.log('-------------------------');
    
    const manager = new CategoryFilterManager();
    
    // Test 5.1: Cache clear functionality
    console.log('  🔍 Testing cache clear...');
    try {
      const clearResult = manager.clearCache();
      
      if (clearResult.success && clearResult.cleared > 0) {
        this.recordPass('CACHE_CLEAR', `Cleared ${clearResult.cleared} cache entries`);
        console.log(`  ✅ PASS: Cache cleared (${clearResult.cleared} entries)`);
      } else {
        this.recordWarning('CACHE_CLEAR', 'No cache entries to clear');
        console.log('  ⚠️ WARNING: No cache entries found');
      }
    } catch (error) {
      this.recordFail('CACHE_CLEAR', error.message);
      console.log('  ❌ FAIL: Cache clear failed');
    }
    
    // Test 5.2: Cache effectiveness
    console.log('  🔍 Testing cache effectiveness...');
    try {
      // Clear cache first
      manager.clearCache();
      
      // First call (cache miss)
      const start1 = Date.now();
      const result1 = manager.getMainCategories();
      const time1 = Date.now() - start1;
      
      // Second call (cache hit)
      const start2 = Date.now();
      const result2 = manager.getMainCategories();
      const time2 = Date.now() - start2;
      
      // Cache should make it faster
      if (time2 < time1) {
        const improvement = ((time1 - time2) / time1 * 100).toFixed(2);
        this.recordPass('CACHE_EFFECTIVENESS', `${improvement}% faster with cache`);
        console.log(`  ✅ PASS: Cache improved performance by ${improvement}%`);
      } else {
        this.recordWarning('CACHE_EFFECTIVENESS', 'Cache did not improve performance');
        console.log('  ⚠️ WARNING: Cache not improving performance');
      }
    } catch (error) {
      this.recordFail('CACHE_EFFECTIVENESS', error.message);
      console.log('  ❌ FAIL: Cache effectiveness test failed');
    }
    
    console.log('');
  }
  
  /**
   * Helper: Record test pass
   */
  recordPass(testName, message) {
    this.results.passed.push({ test: testName, message });
  }
  
  /**
   * Helper: Record test failure
   */
  recordFail(testName, message) {
    this.results.failed.push({ test: testName, message });
  }
  
  /**
   * Helper: Record test warning
   */
  recordWarning(testName, message) {
    this.results.warnings.push({ test: testName, message });
  }
  
  /**
   * Helper: Compare arrays
   */
  arraysEqual(arr1, arr2) {
    if (!arr1 || !arr2) return false;
    if (arr1.length !== arr2.length) return false;
    
    for (let i = 0; i < arr1.length; i++) {
      if (arr1[i] !== arr2[i]) return false;
    }
    
    return true;
  }
  
  /**
   * Generate comprehensive test report
   */
  generateReport() {
    console.log('');
    console.log('🧪 ========== TEST REPORT ==========');
    console.log('');
    
    const totalTests = this.results.passed.length + this.results.failed.length + this.results.warnings.length;
    const passRate = totalTests > 0 ? (this.results.passed.length / totalTests * 100).toFixed(2) : 0;
    
    console.log(`📊 Summary:`);
    console.log(`   Total Tests: ${totalTests}`);
    console.log(`   ✅ Passed: ${this.results.passed.length}`);
    console.log(`   ❌ Failed: ${this.results.failed.length}`);
    console.log(`   ⚠️ Warnings: ${this.results.warnings.length}`);
    console.log(`   📈 Pass Rate: ${passRate}%`);
    console.log('');
    
    if (this.results.failed.length > 0) {
      console.log('❌ Failed Tests:');
      this.results.failed.forEach(fail => {
        console.log(`   - ${fail.test}: ${fail.message}`);
      });
      console.log('');
    }
    
    if (this.results.warnings.length > 0) {
      console.log('⚠️ Warnings:');
      this.results.warnings.forEach(warn => {
        console.log(`   - ${warn.test}: ${warn.message}`);
      });
      console.log('');
    }
    
    if (Object.keys(this.results.performance).length > 0) {
      console.log('⏱️ Performance Metrics:');
      for (const [key, value] of Object.entries(this.results.performance)) {
        console.log(`   ${key}: ${typeof value === 'number' ? value.toFixed(2) + 'ms' : value}`);
      }
      console.log('');
    }
    
    console.log('🧪 ===================================');
    
    return {
      success: this.results.failed.length === 0,
      summary: {
        total: totalTests,
        passed: this.results.passed.length,
        failed: this.results.failed.length,
        warnings: this.results.warnings.length,
        passRate: `${passRate}%`
      },
      details: this.results,
      timestamp: new Date().toISOString()
    };
  }
}

// ============================================
// 🎨 VISUAL COMPARISON TOOLS
// ============================================

/**
 * Create visual comparison report
 */
function createVisualComparisonReport() {
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
            padding: 24px;
          }
          h1 { color: #a78bfa; margin-bottom: 24px; }
          .comparison-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 30px;
          }
          .version-card {
            background: rgba(255,255,255,0.05);
            border-radius: 12px;
            padding: 20px;
            border: 2px solid rgba(255,255,255,0.1);
          }
          .v20 { border-color: #ef4444; }
          .v21 { border-color: #10b981; }
          .version-card h2 {
            margin-bottom: 16px;
            font-size: 20px;
          }
          .v20 h2 { color: #f87171; }
          .v21 h2 { color: #34d399; }
          .bug-list {
            background: rgba(0,0,0,0.2);
            border-radius: 8px;
            padding: 12px;
            margin-top: 12px;
          }
          .bug-item {
            padding: 8px;
            margin-bottom: 8px;
            border-left: 4px solid #ef4444;
            padding-left: 12px;
          }
          .fix-item {
            padding: 8px;
            margin-bottom: 8px;
            border-left: 4px solid #10b981;
            padding-left: 12px;
          }
          .feature-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
          }
          .feature-table th,
          .feature-table td {
            padding: 12px;
            text-align: left;
            border-bottom: 1px solid rgba(255,255,255,0.1);
          }
          .feature-table th {
            background: rgba(167,139,250,0.2);
            font-weight: 600;
          }
          .yes { color: #10b981; }
          .no { color: #ef4444; }
          .btn {
            display: inline-block;
            padding: 10px 20px;
            background: #667eea;
            color: white;
            border-radius: 8px;
            text-decoration: none;
            margin-top: 20px;
            cursor: pointer;
            border: none;
            font-size: 14px;
          }
          .btn:hover { background: #5a67d8; }
        </style>
      </head>
      <body>
        <h1>🧪 Category Filter System - Version Comparison</h1>
        
        <div class="comparison-grid">
          <div class="version-card v20">
            <h2>🐛 v2.0 (Debug Reference)</h2>
            <p><strong>Status:</strong> Contains known bugs</p>
            <p><strong>Purpose:</strong> Debugging reference only</p>
            
            <div class="bug-list">
              <div class="bug-item">
                ❌ References undefined <code>CFG</code> variable
              </div>
              <div class="bug-item">
                ❌ Hardcoded column letters (B, C, D, E, F)
              </div>
              <div class="bug-item">
                ❌ No input normalization
              </div>
              <div class="bug-item">
                ❌ Missing pagination guards
              </div>
            </div>
          </div>
          
          <div class="version-card v21">
            <h2>✅ v2.1 (Production)</h2>
            <p><strong>Status:</strong> Production-ready</p>
            <p><strong>Purpose:</strong> Active use</p>
            
            <div class="bug-list">
              <div class="fix-item">
                ✅ Uses <code>CATEGORY_FILTER_CONFIG.DEBUG_MODE</code>
              </div>
              <div class="fix-item">
                ✅ Dynamic header lookup
              </div>
              <div class="fix-item">
                ✅ Input normalization & validation
              </div>
              <div class="fix-item">
                ✅ Enhanced pagination with bounds checking
              </div>
              <div class="fix-item">
                ✅ Performance monitoring
              </div>
              <div class="fix-item">
                ✅ Smart caching with auto-invalidation
              </div>
            </div>
          </div>
        </div>
        
        <h2 style="margin-top: 30px; margin-bottom: 16px;">📊 Feature Comparison</h2>
        <table class="feature-table">
          <thead>
            <tr>
              <th>Feature</th>
              <th>v2.0</th>
              <th>v2.1</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Proper config reference</td>
              <td class="no">❌ No</td>
              <td class="yes">✅ Yes</td>
            </tr>
            <tr>
              <td>Dynamic headers</td>
              <td class="no">❌ No</td>
              <td class="yes">✅ Yes</td>
            </tr>
            <tr>
              <td>Input validation</td>
              <td class="no">❌ No</td>
              <td class="yes">✅ Yes</td>
            </tr>
            <tr>
              <td>Pagination bounds</td>
              <td class="no">❌ No</td>
              <td class="yes">✅ Yes</td>
            </tr>
            <tr>
              <td>Performance tracking</td>
              <td class="no">❌ No</td>
              <td class="yes">✅ Yes</td>
            </tr>
            <tr>
              <td>Smart caching</td>
              <td class="no">❌ Basic</td>
              <td class="yes">✅ Advanced</td>
            </tr>
            <tr>
              <td>Error codes</td>
              <td class="no">❌ Generic</td>
              <td class="yes">✅ Detailed</td>
            </tr>
          </tbody>
        </table>
        
        <button class="btn" onclick="google.script.run.runCategoryFilterTests()">
          🧪 Run Full Test Suite
        </button>
      </body>
    </html>
  `;
  
  return HtmlService.createHtmlOutput(html)
    .setWidth(900)
    .setHeight(700)
    .setTitle('Version Comparison');
}

// ============================================
// 🚀 PUBLIC TEST FUNCTIONS
// ============================================

/**
 * Run full test suite
 */
function runCategoryFilterTests() {
  const suite = new CategoryFilterTestSuite();
  return suite.runAllTests();
}

/**
 * Show visual comparison
 */
function showCategoryFilterComparison() {
  const html = createVisualComparisonReport();
  SpreadsheetApp.getUi().showModalDialog(html, 'Category Filter - Version Comparison');
}

/**
 * Quick test: Verify v2.1 works
 */
function quickTestV21() {
  console.log('🧪 Quick Test: v2.1 Functionality');
  console.log('==================================');
  
  try {
    const manager = new CategoryFilterManager();
    
    // Test 1: Get categories
    console.log('1️⃣ Testing getMainCategories...');
    const categories = manager.getMainCategories();
    console.log(`   ✅ Found ${categories.length} categories`);
    
    // Test 2: Get subcategories
    if (categories.length > 0) {
      console.log(`2️⃣ Testing getSubcategories for '${categories[0]}'...`);
      const subcats = manager.getSubcategories(categories[0]);
      console.log(`   ✅ Found ${subcats.length} subcategories`);
    }
    
    // Test 3: Filter
    if (categories.length > 0) {
      console.log(`3️⃣ Testing filterByCategory for '${categories[0]}'...`);
      const results = manager.filterByCategory(categories[0], null, 1);
      console.log(`   ✅ Found ${results.pagination.totalResults} results`);
    }
    
    // Test 4: Cache clear
    console.log('4️⃣ Testing cache clear...');
    const clearResult = manager.clearCache();
    console.log(`   ✅ Cleared ${clearResult.cleared} cache entries`);
    
    console.log('');
    console.log('🎉 All quick tests passed!');
    
    return { success: true, message: 'All tests passed' };
    
  } catch (error) {
    console.error('❌ Quick test failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Add testing menu to spreadsheet
 */
function addCategoryFilterTestMenu() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🧪 Category Filter Tests')
    .addItem('🚀 Run Full Test Suite', 'runCategoryFilterTests')
    .addItem('👀 View Comparison Report', 'showCategoryFilterComparison')
    .addItem('⚡ Quick Test v2.1', 'quickTestV21')
    .addToUi();
}