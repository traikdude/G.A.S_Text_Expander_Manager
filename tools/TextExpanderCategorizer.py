"""
Text Expander Categorizer - Google Colab Notebook
=================================================
Copy this code into Google Colab (colab.research.google.com)
Run cells sequentially to analyze and categorize your 2,159 shortcuts.

Spreadsheet: Shortcuts
ID: 17NaZQTbIm8LEiO2VoQoIn5HpqGEQKGAIUXN81SGnZJQ
"""

# %% [markdown]
# # 🎯 Text Expander Auto-Categorization
# This notebook analyzes your shortcuts and suggests categories based on content patterns.

# %% [markdown]
# ## Step 1: Setup & Authentication
# Run this cell first to install dependencies and authenticate with Google.

# %%
# Install required packages
!pip install gspread google-auth pandas numpy regex -q

# %%
# Import libraries
import gspread
import pandas as pd
import numpy as np
import re
import regex  # Extended regex for Unicode
from google.colab import auth
from google.auth import default
from collections import Counter

print("✅ Libraries imported successfully!")

# %%
# Authenticate with Google
auth.authenticate_user()
creds, _ = default()
gc = gspread.authorize(creds)

print("✅ Authentication successful!")

# %% [markdown]
# ## Step 2: Connect to Your Spreadsheet

# %%
# Spreadsheet configuration
SPREADSHEET_ID = "17NaZQTbIm8LEiO2VoQoIn5HpqGEQKGAIUXN81SGnZJQ"
SHEET_NAME = "Shortcuts"

# Open spreadsheet
try:
    spreadsheet = gc.open_by_key(SPREADSHEET_ID)
    worksheet = spreadsheet.worksheet(SHEET_NAME)
    print(f"✅ Connected to '{spreadsheet.title}' - Sheet: '{SHEET_NAME}'")
    print(f"   Rows: {worksheet.row_count}, Columns: {worksheet.col_count}")
except Exception as e:
    print(f"❌ Error connecting: {e}")
    print("Make sure the notebook has access to the spreadsheet!")

# %%
# Load all data into DataFrame
data = worksheet.get_all_records()
df = pd.DataFrame(data)

print(f"✅ Loaded {len(df)} shortcuts")
print(f"   Columns: {list(df.columns)}")
df.head(10)

# %% [markdown]
# ## Step 3: Category Definitions
# These are the 10 main categories and 75 subcategories we'll classify shortcuts into.

# %%
# Main Category Definitions
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

# Flatten for display
all_subcategories = []
for main, subs in MAIN_CATEGORIES.items():
    for sub in subs:
        all_subcategories.append({"Main Category": main, "Subcategory": sub})

print(f"✅ Defined {len(MAIN_CATEGORIES)} main categories")
print(f"✅ Defined {len(all_subcategories)} subcategories")
pd.DataFrame(all_subcategories)

# %% [markdown]
# ## Step 4: Pattern Detection Functions
# These functions analyze content to suggest categories.

# %%
# Unicode ranges for emoji detection
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

# Kaomoji patterns (Japanese-style emoticons)
KAOMOJI_PATTERNS = [
    r'\([^\)]*[\u0e00-\u0e7f\u3040-\u30ff\u4e00-\u9fff\u0300-\u036f]+[^\)]*\)',  # With Japanese chars
    r'\([◕◉●○◎★☆♥♡♠♣♦◆■□▲△▼▽]+[_\-\^oO0\.\u3000]+[◕◉●○◎★☆♥♡♠♣♦◆■□▲△▼▽]+\)',  # Basic pattern
    r'[\(（][^）\)]{1,15}[\)）]',  # Short parenthetical with special chars
    r'[\^_\-\~][_oO\.][^\s]{0,3}[\^_\-\~]',  # Simple faces like ^_^ or -_-
    r'[>＞][_\.\-][<＜]',  # Angry faces
    r'\(╯°□°\)╯',  # Table flip and variants
    r'ಠ_ಠ|ʕ•ᴥ•ʔ|¯\\_\(ツ\)_/¯',  # Specific famous kaomoji
]

# Date/time patterns
DATE_PATTERNS = {
    "Months (English)": r'\b(january|february|march|april|may|june|july|august|september|october|november|december)\b',
    "Months (Spanish)": r'\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b',
    "Days of Week": r'\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|lunes|martes|miércoles|jueves|viernes|sábado|domingo)\b',
    "Date Patterns": r'\d{1,2}[/\-\.]\d{1,2}([/\-\.]\d{2,4})?',
    "Time Formats": r'\d{1,2}:\d{2}(\s?[AaPp][Mm])?',
}

# Number patterns
NUMBER_PATTERNS = {
    "Number Blocks": r'[0-9][\u20E3\uFE0F]',  # Keycap numbers
    "Roman Numerals": r'\b[IVXLCDM]{2,}\b',
    "Ordinal Numbers": r'\b\d+(st|nd|rd|th)\b',
    "Fractions": r'[½¼¾⅓⅔⅕⅖⅗⅘⅙⅚⅛⅜⅝⅞]',
}

# Symbol patterns
SYMBOL_PATTERNS = {
    "Arrows": r'[←→↑↓↔↕↖↗↘↙⇐⇒⇑⇓⇔⇕➔➜➡➢➣➤]',
    "Mathematical": r'[±×÷≠≈≤≥∞∑∏√∫∂∇∈∉∪∩⊂⊃⊆⊇∧∨¬∀∃]',
    "Currency": r'[$€£¥₹₽₿¢₩₪]',
    "Stars & Sparkles": r'[★☆✦✧✨✩✪✫✬✭✮✯⭐🌟💫]',
    "Hearts": r'[♥♡❤❥❦❧💕💖💗💘💙💚💛💜🖤🤍🤎💝💞💟❣]',
}

# Decorative Unicode font ranges
FONT_STYLE_PATTERNS = {
    "Bold": r'[\U0001D400-\U0001D433]',  # Mathematical Bold
    "Italic": r'[\U0001D434-\U0001D467]',  # Mathematical Italic
    "Script": r'[\U0001D49C-\U0001D4CF]',  # Mathematical Script
    "Fraktur": r'[\U0001D504-\U0001D537]',  # Mathematical Fraktur
    "Blackboard Bold": r'[\U0001D538-\U0001D56B]',  # Double-struck
    "Monospace": r'[\U0001D670-\U0001D6A3]',  # Mathematical Monospace
}

print("✅ Pattern definitions loaded")

# %%
def detect_category(content, description=""):
    """
    Analyze content and return (main_category, subcategory, confidence)
    """
    content = str(content) if content else ""
    description = str(description).lower() if description else ""
    
    # Check description first for explicit hints
    desc_lower = description.lower()
    
    # Priority 1: Check for emoji content
    for sub, pattern in EMOJI_PATTERNS.items():
        if regex.search(pattern, content):
            return ("😊 Emojis & Emoticons", sub, 0.9)
    
    # Priority 2: Check for kaomoji
    for pattern in KAOMOJI_PATTERNS:
        if regex.search(pattern, content, regex.IGNORECASE):
            return ("😊 Emojis & Emoticons", "Kaomoji", 0.85)
    
    # Priority 3: Date patterns
    for sub, pattern in DATE_PATTERNS.items():
        if regex.search(pattern, content, regex.IGNORECASE):
            return ("📅 Dates & Time", sub, 0.85)
    
    # Priority 4: Number patterns
    for sub, pattern in NUMBER_PATTERNS.items():
        if regex.search(pattern, content, regex.IGNORECASE):
            return ("🔢 Numbers & Counting", sub, 0.8)
    
    # Priority 5: Symbol patterns
    for sub, pattern in SYMBOL_PATTERNS.items():
        if regex.search(pattern, content):
            return ("🔣 Symbols & Special Characters", sub, 0.8)
    
    # Priority 6: Font style patterns
    for sub, pattern in FONT_STYLE_PATTERNS.items():
        if regex.search(pattern, content):
            return ("🎯 Text Formatting", sub, 0.85)
    
    # Priority 7: Check description keywords
    desc_mappings = {
        "greeting": ("💬 Communication & Greetings", "Greetings", 0.7),
        "email": ("📧 Contact & Personal Info", "Email Addresses", 0.7),
        "signature": ("📧 Contact & Personal Info", "Signatures", 0.7),
        "border": ("🎨 Decorative Elements", "Borders", 0.7),
        "divider": ("🎨 Decorative Elements", "Dividers", 0.7),
        "date": ("📅 Dates & Time", "Date Patterns", 0.6),
        "month": ("📅 Dates & Time", "Months (English)", 0.6),
        "number": ("🔢 Numbers & Counting", "Cardinal Numbers", 0.6),
        "symbol": ("🔣 Symbols & Special Characters", "Miscellaneous Symbols", 0.6),
        "zodiac": ("🔣 Symbols & Special Characters", "Miscellaneous Symbols", 0.7),
        "kaomoji": ("😊 Emojis & Emoticons", "Kaomoji", 0.8),
        "emoticon": ("😊 Emojis & Emoticons", "Kaomoji", 0.7),
    }
    
    for keyword, result in desc_mappings.items():
        if keyword in desc_lower:
            return result
    
    # Default: Unknown/needs manual review
    return ("🏷️ Status & Labels", "Tags", 0.3)

# Test the function
test_cases = [
    ("😊", ""),
    ("January", ""),
    ("(◕‿◕)", ""),
    ("→", ""),
    ("𝕳𝖊𝖑𝖑𝖔", ""),
    ("Hello World", "greeting"),
]

print("Testing pattern detection:")
for content, desc in test_cases:
    cat, subcat, conf = detect_category(content, desc)
    print(f"  '{content[:20]}' → {cat} / {subcat} ({conf:.0%})")

# %% [markdown]
# ## Step 5: Analyze All Shortcuts
# This processes all 2,159 shortcuts and suggests categories.

# %%
# Process all rows
results = []
low_confidence = []

for idx, row in df.iterrows():
    content = row.get('Content', '')
    description = row.get('Description', '')
    snippet_name = row.get('Snippet Name', '')
    
    main_cat, sub_cat, confidence = detect_category(content, description)
    
    results.append({
        'row_index': idx + 2,  # +2 for 1-based with header
        'snippet_name': snippet_name,
        'content_preview': str(content)[:50] + ('...' if len(str(content)) > 50 else ''),
        'current_description': description,
        'suggested_main_category': main_cat,
        'suggested_subcategory': sub_cat,
        'confidence': confidence,
    })
    
    if confidence < 0.5:
        low_confidence.append(results[-1])

results_df = pd.DataFrame(results)

print(f"✅ Analyzed {len(results_df)} shortcuts")
print(f"⚠️  {len(low_confidence)} items need manual review (confidence < 50%)")

# %% [markdown]
# ## Step 6: Preview Results

# %%
# Show distribution by main category
category_counts = results_df['suggested_main_category'].value_counts()
print("📊 Category Distribution:")
print(category_counts.to_string())

# %%
# Show sample of high-confidence categorizations
print("\n✅ High Confidence Samples (>80%):")
high_conf = results_df[results_df['confidence'] >= 0.8].head(20)
display(high_conf[['snippet_name', 'content_preview', 'suggested_main_category', 'suggested_subcategory', 'confidence']])

# %%
# Show items needing review
print("\n⚠️ Items Needing Manual Review (<50% confidence):")
low_conf_df = pd.DataFrame(low_confidence)
if len(low_conf_df) > 0:
    display(low_conf_df[['snippet_name', 'content_preview', 'current_description', 'suggested_main_category', 'confidence']].head(20))
else:
    print("All items have high confidence!")

# %% [markdown]
# ## Step 7: Export Results for Review
# Download a CSV to review before applying changes.

# %%
# Export to CSV for review
results_df.to_csv('/content/categorization_preview.csv', index=False)
print("✅ Exported to 'categorization_preview.csv'")
print("   Download from the Files panel on the left →")

# Show download link
from google.colab import files
files.download('/content/categorization_preview.csv')

# %% [markdown]
# ## Step 8: Write Categories Back to Sheet
# ⚠️ **ONLY RUN THIS AFTER REVIEWING THE PREVIEW!**
# 
# This will add/update the MainCategory and Subcategory columns.

# %%
# First, let's check if the columns already exist
headers = worksheet.row_values(1)
print(f"Current headers: {headers}")
print(f"Current worksheet size: {worksheet.row_count} rows x {worksheet.col_count} columns")

# Determine column positions for new data
main_cat_col = len(headers) + 1 if 'MainCategory' not in headers else headers.index('MainCategory') + 1
sub_cat_col = len(headers) + 2 if 'Subcategory' not in headers else headers.index('Subcategory') + 1

print(f"\nMainCategory will be in column {main_cat_col}")
print(f"Subcategory will be in column {sub_cat_col}")

# %%
# ⚠️ CONFIRMATION REQUIRED
confirm = input("⚠️ This will write to your spreadsheet. Type 'YES' to confirm: ")

if confirm.upper() == 'YES':
    # --- STEP 1: Expand worksheet if needed ---
    current_col_count = worksheet.col_count
    required_col_count = max(main_cat_col, sub_cat_col)
    if current_col_count < required_col_count:
        cols_to_add = required_col_count - current_col_count
        print(f"⚠️ Expanding worksheet from {current_col_count} to {required_col_count} columns...")
        worksheet.add_cols(cols_to_add)
        print(f"✅ Worksheet expanded to {worksheet.col_count} columns")
    
    # --- STEP 2: Add headers ---
    print("Adding headers...")
    if 'MainCategory' not in headers:
        worksheet.update_cell(1, main_cat_col, 'MainCategory')
        print(f"  Added 'MainCategory' header in column {main_cat_col}")
    if 'Subcategory' not in headers:
        worksheet.update_cell(1, sub_cat_col, 'Subcategory')
        print(f"  Added 'Subcategory' header in column {sub_cat_col}")
    
    # --- STEP 3: Prepare batch update ---
    main_cat_values = [[r['suggested_main_category']] for r in results]
    sub_cat_values = [[r['suggested_subcategory']] for r in results]
    
    # --- STEP 4: Write in batches to avoid rate limits ---
    batch_size = 500
    print(f"\nWriting {len(results)} rows in batches of {batch_size}...")
    
    for i in range(0, len(results), batch_size):
        batch_end = min(i + batch_size, len(results))
        
        # Update MainCategory column
        cell_range = f"{gspread.utils.rowcol_to_a1(i+2, main_cat_col)}:{gspread.utils.rowcol_to_a1(batch_end+1, main_cat_col)}"
        worksheet.update(cell_range, main_cat_values[i:batch_end])
        
        # Update Subcategory column
        cell_range = f"{gspread.utils.rowcol_to_a1(i+2, sub_cat_col)}:{gspread.utils.rowcol_to_a1(batch_end+1, sub_cat_col)}"
        worksheet.update(cell_range, sub_cat_values[i:batch_end])
        
        print(f"  ✓ Written rows {i+2} to {batch_end+1}")
    
    print(f"\n✅ Successfully wrote categories to {len(results)} rows!")
    print("   Open your spreadsheet to verify the changes.")
else:
    print("❌ Cancelled. No changes made.")

# %% [markdown]
# ## 🎉 Done!
# 
# Your shortcuts now have MainCategory and Subcategory columns populated.
# 
# **Next Steps:**
# 1. Review the spreadsheet to verify categorizations
# 2. Manually fix any low-confidence items
# 3. Run the Apps Script `addEnhancedDropdowns()` to add dropdown validation
# 4. Deploy the updated web app to use the new filter UI
