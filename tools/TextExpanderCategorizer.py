"""
🎯 Text Expander Auto-Categorizer
=================================
Analyzes shortcuts and suggests categories based on content patterns! 🔮

🌐 Works in BOTH:
   - Google Colab (recommended for large datasets)
   - Local Python (python TextExpanderCategorizer.py)

Spreadsheet: Shortcuts
ID: 17NaZQTbIm8LEiO2VoQoIn5HpqGEQKGAIUXN81SGnZJQ
"""

# %% [markdown]
# # 🎯 Text Expander Auto-Categorization
# Analyzes your shortcuts and suggests categories based on content patterns!

# %% [markdown]
# ## Step 1: Setup & Environment Detection 🔍

# %%
import sys
import os
import subprocess
import io

# Fix Windows console encoding
if sys.platform.startswith('win'):
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

# Detect environment
IN_COLAB = 'google.colab' in sys.modules
ENV_NAME = "🌐 Google Colab" if IN_COLAB else "💻 Local Python"
print(f"🔍 Environment: {ENV_NAME}")

# %%
# Install packages
def ensure_packages():
    required = ['gspread', 'pandas', 'numpy', 'regex']
    for pkg in required:
        try:
            __import__(pkg)
        except ImportError:
            print(f"📦 Installing {pkg}...")
            if IN_COLAB:
                from IPython import get_ipython
                get_ipython().system(f'pip install {pkg} -q')
            else:
                subprocess.run([sys.executable, '-m', 'pip', 'install', pkg, '-q'], capture_output=True)
    print("✅ Packages ready!")

ensure_packages()

# %%
import gspread
import pandas as pd
import numpy as np
import re
import regex
from collections import Counter
from pathlib import Path
import warnings
warnings.filterwarnings('ignore')

print("✅ Libraries imported!")

# %% [markdown]
# ## Step 2: Authentication 🔐

# %%
if IN_COLAB:
    from google.colab import auth
    from google.auth import default
    print("🔐 Authenticating (Colab)...")
    auth.authenticate_user()
    creds, _ = default()
    gc = gspread.authorize(creds)
else:
    print("🔐 Authenticating (Local)...")
    creds_file = Path("credentials.json")
    gspread_creds = Path.home() / ".config" / "gspread" / "credentials.json"
    
    if creds_file.exists():
        from google.oauth2.service_account import Credentials
        scopes = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
        creds = Credentials.from_service_account_file(str(creds_file), scopes=scopes)
        gc = gspread.authorize(creds)
    elif gspread_creds.exists():
        from google.oauth2.service_account import Credentials
        scopes = ['https://www.googleapis.com/auth/spreadsheets', 'https://www.googleapis.com/auth/drive']
        creds = Credentials.from_service_account_file(str(gspread_creds), scopes=scopes)
        gc = gspread.authorize(creds)
    else:
        gc = gspread.oauth()

print("✅ Authentication successful!")

# %% [markdown]
# ## Step 3: Connect to Spreadsheet 📊

# %%
SPREADSHEET_ID = "17NaZQTbIm8LEiO2VoQoIn5HpqGEQKGAIUXN81SGnZJQ"
SHEET_NAME = "Shortcuts"
OUTPUT_FOLDER = "/content" if IN_COLAB else str(Path.cwd())

try:
    spreadsheet = gc.open_by_key(SPREADSHEET_ID)
    worksheet = spreadsheet.worksheet(SHEET_NAME)
    print(f"✅ Connected to '{spreadsheet.title}' - Sheet: '{SHEET_NAME}'")
except Exception as e:
    print(f"❌ Error: {e}")
    raise

# %%
data = worksheet.get_all_records()
df = pd.DataFrame(data)
print(f"✅ Loaded {len(df)} shortcuts")
print(f"   Columns: {list(df.columns)}")

# %% [markdown]
# ## Step 4: Category Definitions 🏷️

# %%
MAIN_CATEGORIES = {
    "🎯 Text Formatting": ["Strikethrough", "Underline", "Bold", "Italic", "Mixed Styles"],
    "🔣 Symbols & Special Characters": ["Arrows", "Mathematical", "Currency", "Punctuation", "Technical", "Miscellaneous Symbols"],
    "😊 Emojis & Emoticons": ["Smileys & People", "Animals & Nature", "Food & Drink", "Activities", "Travel & Places", "Objects", "Symbols", "Flags", "Kaomoji", "ASCII Art"],
    "📅 Dates & Time": ["Months (English)", "Months (Spanish)", "Days of Week", "Time Formats", "Date Patterns", "Seasons", "Holidays"],
    "🔢 Numbers & Counting": ["Cardinal Numbers", "Ordinal Numbers", "Roman Numerals", "Fractions", "Number Blocks", "Counters"],
    "💬 Communication & Greetings": ["Greetings", "Farewells", "Common Phrases", "Email Templates", "Social Media"],
    "📧 Contact & Personal Info": ["Email Addresses", "Phone Numbers", "Addresses", "Signatures", "URLs"],
    "🎨 Decorative Elements": ["Borders", "Dividers", "Bullets", "Stars & Sparkles", "Hearts", "Flowers"],
    "🌈 Color Indicators": ["Color Blocks", "Colored Circles", "Gradients", "Rainbow"],
    "🏷️ Status & Labels": ["Priority Markers", "Status Icons", "Checkboxes", "Tags", "Badges"]
}

print(f"✅ Defined {len(MAIN_CATEGORIES)} main categories")

# %% [markdown]
# ## Step 5: Pattern Detection 🔍

# %%
EMOJI_PATTERNS = {
    "Smileys & People": r'[\U0001F600-\U0001F64F\U0001F466-\U0001F469]',
    "Animals & Nature": r'[\U0001F400-\U0001F4FF\U0001F980-\U0001F9FF]',
    "Food & Drink": r'[\U0001F32D-\U0001F37F]',
    "Activities": r'[\U0001F3A0-\U0001F3FF]',
    "Travel & Places": r'[\U0001F680-\U0001F6FF]',
    "Objects": r'[\U0001F4A0-\U0001F4FF]',
    "Symbols": r'[\U00002702-\U000027B0]',
    "Flags": r'[\U0001F1E0-\U0001F1FF]',
}

KAOMOJI_PATTERNS = [
    r'\([^\)]*[\u0e00-\u0e7f\u3040-\u30ff\u4e00-\u9fff\u0300-\u036f]+[^\)]*\)',
    r'\([◕◉●○◎★☆♥♡♠♣♦◆■□▲△▼▽]+[_\-\^oO0\.\u3000]+[◕◉●○◎★☆♥♡♠♣♦◆■□▲△▼▽]+\)',
    r'[\^_\-\~][_oO\.][^\s]{0,3}[\^_\-\~]',
    r'ಠ_ಠ|ʕ•ᴥ•ʔ|¯\\_\(ツ\)_/¯',
]

DATE_PATTERNS = {
    "Months (English)": r'\b(january|february|march|april|may|june|july|august|september|october|november|december)\b',
    "Months (Spanish)": r'\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b',
    "Days of Week": r'\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b',
}

SYMBOL_PATTERNS = {
    "Arrows": r'[←→↑↓↔↕↖↗↘↙⇐⇒⇑⇓⇔⇕➔➜➡➢➣➤]',
    "Mathematical": r'[±×÷≠≈≤≥∞∑∏√∫∂∇∈∉∪∩⊂⊃⊆⊇]',
    "Currency": r'[$€£¥₹₽₿¢₩₪]',
    "Stars & Sparkles": r'[★☆✦✧✨✩✪✫✬✭✮✯⭐🌟💫]',
    "Hearts": r'[♥♡❤❥❦❧💕💖💗💘💙💚💛💜🖤🤍🤎💝💞💟❣]',
}

FONT_STYLE_PATTERNS = {
    "Bold": r'[\U0001D400-\U0001D433]',
    "Italic": r'[\U0001D434-\U0001D467]',
    "Script": r'[\U0001D49C-\U0001D4CF]',
    "Fraktur": r'[\U0001D504-\U0001D537]',
    "Monospace": r'[\U0001D670-\U0001D6A3]',
}

print("✅ Patterns loaded!")

# %%
def detect_category(content, description=""):
    """Detect category based on content patterns! 🔮"""
    content = str(content) if content else ""
    desc_lower = str(description).lower() if description else ""
    
    # Check emoji patterns
    for sub, pattern in EMOJI_PATTERNS.items():
        if regex.search(pattern, content):
            return ("😊 Emojis & Emoticons", sub, 0.9)
    
    # Check kaomoji
    for pattern in KAOMOJI_PATTERNS:
        if regex.search(pattern, content, regex.IGNORECASE):
            return ("😊 Emojis & Emoticons", "Kaomoji", 0.85)
    
    # Check dates
    for sub, pattern in DATE_PATTERNS.items():
        if regex.search(pattern, content, regex.IGNORECASE):
            return ("📅 Dates & Time", sub, 0.85)
    
    # Check symbols
    for sub, pattern in SYMBOL_PATTERNS.items():
        if regex.search(pattern, content):
            return ("🔣 Symbols & Special Characters", sub, 0.8)
    
    # Check font styles
    for sub, pattern in FONT_STYLE_PATTERNS.items():
        if regex.search(pattern, content):
            return ("🎯 Text Formatting", sub, 0.85)
    
    # Description hints
    if "greeting" in desc_lower:
        return ("💬 Communication & Greetings", "Greetings", 0.7)
    if "email" in desc_lower:
        return ("📧 Contact & Personal Info", "Email Addresses", 0.7)
    
    return ("🏷️ Status & Labels", "Tags", 0.3)

# Test
print("Testing detection:")
for test in [("😊", ""), ("January", ""), ("→", ""), ("Hello", "greeting")]:
    cat, sub, conf = detect_category(*test)
    print(f"  '{test[0]}' → {sub} ({conf:.0%})")

# %% [markdown]
# ## Step 6: Analyze All Shortcuts 📊

# %%
def analyze_shortcuts():
    """Analyze all shortcuts and categorize them! 📊"""
    results = []
    
    for idx, row in df.iterrows():
        content = row.get('Content', '')
        description = row.get('Description', '')
        main_cat, sub_cat, confidence = detect_category(content, description)
        
        results.append({
            'row': idx + 2,
            'snippet_name': row.get('Snippet Name', ''),
            'content_preview': str(content)[:40],
            'main_category': main_cat,
            'subcategory': sub_cat,
            'confidence': confidence,
        })
    
    return pd.DataFrame(results)

results_df = analyze_shortcuts()
print(f"✅ Analyzed {len(results_df)} shortcuts!")
print(f"⚠️ {len(results_df[results_df['confidence'] < 0.5])} need review")

# %%
# Show distribution
print("\n📊 Category Distribution:")
print(results_df['main_category'].value_counts().to_string())

# %% [markdown]
# ## Step 7: Export Results 📤

# %%
def export_results():
    """Export categorization results! 📤"""
    output_file = os.path.join(OUTPUT_FOLDER, "categorization_results.csv")
    results_df.to_csv(output_file, index=False)
    print(f"✅ Exported to: {output_file}")
    
    if IN_COLAB:
        from google.colab import files
        files.download(output_file)

export_results()

# %% [markdown]
# ## Step 8: Write to Spreadsheet ✏️

# %%
def write_categories_to_sheet(confirm=False):
    """Write categories back to spreadsheet! ✏️"""
    if not confirm:
        print("💡 Run: write_categories_to_sheet(confirm=True)")
        return
    
    headers = worksheet.row_values(1)
    main_col = len(headers) + 1 if 'MainCategory' not in headers else headers.index('MainCategory') + 1
    sub_col = len(headers) + 2 if 'Subcategory' not in headers else headers.index('Subcategory') + 1
    
    # Add headers if needed
    if 'MainCategory' not in headers:
        worksheet.update_cell(1, main_col, 'MainCategory')
    if 'Subcategory' not in headers:
        worksheet.update_cell(1, sub_col, 'Subcategory')
    
    # Write in batches
    batch_size = 500
    for i in range(0, len(results_df), batch_size):
        batch = results_df.iloc[i:i+batch_size]
        cells = [[row['main_category']] for _, row in batch.iterrows()]
        start_row = i + 2
        end_row = start_row + len(batch) - 1
        worksheet.update(f"{gspread.utils.rowcol_to_a1(start_row, main_col)}:{gspread.utils.rowcol_to_a1(end_row, main_col)}", cells)
        
        cells = [[row['subcategory']] for _, row in batch.iterrows()]
        worksheet.update(f"{gspread.utils.rowcol_to_a1(start_row, sub_col)}:{gspread.utils.rowcol_to_a1(end_row, sub_col)}", cells)
        print(f"  ✓ Rows {start_row}-{end_row}")
    
    print(f"✅ Written {len(results_df)} categories!")

print("💡 To write to sheet: write_categories_to_sheet(confirm=True)")

# %% [markdown]
# ## 🚀 Quick Actions Menu

# %%
def show_menu():
    print("""
╔═══════════════════════════════════════════════════════╗
║         🎯 TEXT EXPANDER CATEGORIZER                  ║
╠═══════════════════════════════════════════════════════╣
║  analyze_shortcuts()            - Analyze all data    ║
║  export_results()               - Export to CSV       ║
║  write_categories_to_sheet(True) - Write to sheet    ║
╚═══════════════════════════════════════════════════════╝
    """)

show_menu()

# %% [markdown]
# ## 🎉 Ready!

# %%
if __name__ == "__main__":
    print("\n💡 Categorizer ready! Use the functions above.")
