/**
 * ⚙️ CONFIGURATION (Config.gs)
 * ============================================================================
 * Centralized configuration and constants for the Text Expansion Manager.
 * Moved from Code.gs for improved modularity.
 * ============================================================================
 */

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
