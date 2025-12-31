"""
🔍 Text Expander Duplicate Finder
=================================
Find near-duplicate shortcuts and similar content! 🕵️
Uses fuzzy matching to detect snippets that are suspiciously alike! ✨

🌐 Works in BOTH:
   - Google Colab (with rich visualizations)
   - Local Python (python DuplicateFinder.py)

Spreadsheet: Shortcuts
ID: 17NaZQTbIm8LEiO2VoQoIn5HpqGEQKGAIUXN81SGnZJQ
"""

# %% [markdown]
# # 🔍 Duplicate Finder
# Find similar and duplicate shortcuts in your collection!

# %% [markdown]
# ## Step 1: Setup 🔍

# %%
import sys
import os
from pathlib import Path

# Add tools directory to path for imports
current_dir = Path(__file__).resolve().parent if '__file__' in dir() else Path.cwd()
if str(current_dir) not in sys.path:
    sys.path.insert(0, str(current_dir))

# Import shared compatibility module
try:
    from colab_compat import ColabCompat, safe_print
except ImportError:
    sys.path.append("tools")
    from tools.colab_compat import ColabCompat, safe_print

# Initialize Compatibility Layer
compat = ColabCompat()
compat.print_environment()
compat.ensure_packages(["rapidfuzz", "matplotlib"])

IN_COLAB = compat.in_colab

# %%
import gspread
import pandas as pd
import matplotlib.pyplot as plt
from pathlib import Path
import warnings
warnings.filterwarnings('ignore')

try:
    from rapidfuzz import fuzz, process
    FUZZY_AVAILABLE = True
except ImportError:
    FUZZY_AVAILABLE = False
    safe_print("⚠️ rapidfuzz not available - using basic matching")

safe_print("✅ Libraries imported!")

# %% [markdown]
# ## Step 2: Authentication 🔐

# %%
if IN_COLAB:
    from google.colab import auth
    from google.auth import default
    auth.authenticate_user()
    creds, _ = default()
    gc = gspread.authorize(creds)
else:
    creds_file = Path("credentials.json")
    gspread_creds = Path.home() / ".config" / "gspread" / "credentials.json"
    
    if creds_file.exists():
        from google.oauth2.service_account import Credentials
        scopes = ['https://www.googleapis.com/auth/spreadsheets']
        creds = Credentials.from_service_account_file(str(creds_file), scopes=scopes)
        gc = gspread.authorize(creds)
    elif gspread_creds.exists():
        from google.oauth2.service_account import Credentials
        scopes = ['https://www.googleapis.com/auth/spreadsheets']
        creds = Credentials.from_service_account_file(str(gspread_creds), scopes=scopes)
        gc = gspread.authorize(creds)
    else:
        gc = gspread.oauth()

safe_print("✅ Authenticated!")

# %% [markdown]
# ## Step 3: Load Data 📥

# %%
SPREADSHEET_ID = "17NaZQTbIm8LEiO2VoQoIn5HpqGEQKGAIUXN81SGnZJQ"
SHEET_NAME = "Shortcuts"
OUTPUT_FOLDER = "/content" if IN_COLAB else str(Path.cwd())

# Initialize dataframe
df = None

try:
    spreadsheet = gc.open_by_key(SPREADSHEET_ID)
    worksheet = spreadsheet.worksheet(SHEET_NAME)
    data = worksheet.get_all_records()
    df = pd.DataFrame(data)
    safe_print(f"✅ Loaded {len(df)} shortcuts!")
except Exception as e:
    safe_print(f"❌ Error loading spreadsheet: {e}")
    safe_print("💡 Make sure you've shared the spreadsheet with your service account!")

# %% [markdown]
# ## Step 4: Find Exact Duplicates 🔄

# %%
def find_exact_duplicates():
    """Find exact duplicate content! 🔄"""
    safe_print("\n" + "=" * 60)
    safe_print("🔄 EXACT DUPLICATES")
    safe_print("=" * 60)
    
    if 'Content' not in df.columns:
        safe_print("❌ No Content column!")
        return None
    
    # Find duplicate content
    dup_mask = df['Content'].duplicated(keep=False)
    duplicates = df[dup_mask].copy()
    
    if len(duplicates) == 0:
        safe_print("\n✅ No exact duplicates found!")
        return None
    
    # Group by content
    grouped = duplicates.groupby('Content').agg({
        'Snippet Name': list
    }).reset_index()
    grouped['Count'] = grouped['Snippet Name'].apply(len)
    grouped = grouped[grouped['Count'] > 1].sort_values('Count', ascending=False)
    
    safe_print(f"\n⚠️ Found {len(grouped)} duplicate groups!")
    safe_print(f"   Total duplicate rows: {len(duplicates)}")
    
    safe_print("\n📋 Top Duplicates:")
    safe_print("-" * 60)
    for _, row in grouped.head(10).iterrows():
        content_preview = str(row['Content'])[:40]
        safe_print(f"  '{content_preview}...' ({row['Count']} copies)")
        safe_print(f"    Names: {', '.join(row['Snippet Name'][:3])}")
    
    return grouped

exact_dups = find_exact_duplicates()

# %% [markdown]
# ## Step 5: Find Similar Content 🎯

# %%
def find_similar_content(threshold=85, sample_size=500):
    """Find similar (not exact) content using fuzzy matching! 🎯"""
    safe_print("\n" + "=" * 60)
    safe_print("🎯 SIMILAR CONTENT DETECTION")
    safe_print("=" * 60)
    
    if not FUZZY_AVAILABLE:
        safe_print("⚠️ Install rapidfuzz for fuzzy matching!")
        return None
    
    if 'Content' not in df.columns:
        safe_print("❌ No Content column!")
        return None
    
    # Sample for performance
    sample = df.sample(min(sample_size, len(df)))
    contents = sample['Content'].astype(str).tolist()
    
    similar_pairs = []
    
    safe_print(f"🔍 Comparing {len(contents)} samples (threshold: {threshold}%)...")
    
    for i, content1 in enumerate(contents):
        if len(content1) < 3:
            continue
            
        for j, content2 in enumerate(contents[i+1:], i+1):
            if len(content2) < 3:
                continue
                
            score = fuzz.ratio(content1, content2)
            
            if score >= threshold and score < 100:  # Similar but not exact
                similar_pairs.append({
                    'content1': content1[:50],
                    'content2': content2[:50],
                    'similarity': score,
                    'name1': sample.iloc[i].get('Snippet Name', ''),
                    'name2': sample.iloc[j].get('Snippet Name', ''),
                })
    
    if not similar_pairs:
        safe_print(f"\n✅ No similar content found above {threshold}% threshold!")
        return None
    
    similar_df = pd.DataFrame(similar_pairs).sort_values('similarity', ascending=False)
    
    safe_print(f"\n⚠️ Found {len(similar_df)} similar pairs!")
    safe_print("\n📋 Top Similar Pairs:")
    safe_print("-" * 60)
    
    for _, row in similar_df.head(5).iterrows():
        safe_print(f"  {row['similarity']}% similar:")
        safe_print(f"    '{row['content1']}'")
        safe_print(f"    '{row['content2']}'")
    
    return similar_df

similar_pairs = find_similar_content(threshold=85, sample_size=300)

# %% [markdown]
# ## Step 6: Find Duplicate Names 🏷️

# %%
def find_duplicate_names():
    """Find shortcuts with the same name! 🏷️"""
    safe_print("\n" + "=" * 60)
    safe_print("🏷️ DUPLICATE NAMES")
    safe_print("=" * 60)
    
    if 'Snippet Name' not in df.columns:
        safe_print("❌ No Snippet Name column!")
        return None
    
    name_counts = df['Snippet Name'].value_counts()
    duplicates = name_counts[name_counts > 1]
    
    if len(duplicates) == 0:
        safe_print("\n✅ All snippet names are unique!")
        return None
    
    safe_print(f"\n⚠️ Found {len(duplicates)} duplicate names!")
    
    safe_print("\n📋 Duplicate Names:")
    safe_print("-" * 60)
    for name, count in duplicates.head(10).items():
        safe_print(f"  '{name}' appears {count} times")
    
    return duplicates

duplicate_names = find_duplicate_names()

# %% [markdown]
# ## Step 7: Cleanup Recommendations 🧹

# %%
def generate_recommendations():
    """Generate cleanup recommendations! 🧹"""
    safe_print("\n" + "=" * 60)
    safe_print("🧹 CLEANUP RECOMMENDATIONS")
    safe_print("=" * 60)
    
    recs = []
    
    if exact_dups is not None:
        recs.append(f"🔄 Delete {len(exact_dups)} exact duplicate groups (keep one copy each)")
    
    if similar_pairs is not None:
        high_similar = similar_pairs[similar_pairs['similarity'] >= 95]
        if len(high_similar) > 0:
            recs.append(f"🎯 Review {len(high_similar)} nearly-identical pairs (95%+ similar)")
    
    if duplicate_names is not None:
        recs.append(f"🏷️ Resolve {len(duplicate_names)} naming conflicts")
    
    if recs:
        safe_print("\n📋 Action Items:")
        for i, rec in enumerate(recs, 1):
            safe_print(f"   {i}. {rec}")
    else:
        safe_print("\n✅ Your data is clean! No duplicates found!")
    
    return recs

recommendations = generate_recommendations()

# %% [markdown]
# ## Step 8: Export Reports 📤

# %%
def export_reports():
    """Export duplicate reports! 📤"""
    if exact_dups is not None:
        file = os.path.join(OUTPUT_FOLDER, "exact_duplicates.csv")
        exact_dups.to_csv(file, index=False)
        safe_print(f"✅ Exported: {file}")
    
    if similar_pairs is not None:
        file = os.path.join(OUTPUT_FOLDER, "similar_content.csv")
        similar_pairs.to_csv(file, index=False)
        safe_print(f"✅ Exported: {file}")
        
    if IN_COLAB:
        from google.colab import files
        for f in ['exact_duplicates.csv', 'similar_content.csv']:
            path = os.path.join(OUTPUT_FOLDER, f)
            if os.path.exists(path):
                files.download(path)

export_reports()

# %% [markdown]
# ## 🎯 Quick Menu

# %%
def show_menu():
    safe_print("""
╔═══════════════════════════════════════════════════════╗
║         🔍 DUPLICATE FINDER                           ║
╠═══════════════════════════════════════════════════════╣
║  find_exact_duplicates()      - Find exact copies     ║
║  find_similar_content(85)     - Find similar items    ║
║  find_duplicate_names()       - Find name conflicts   ║
║  generate_recommendations()   - Get cleanup advice    ║
║  export_reports()             - Export CSV reports    ║
╚═══════════════════════════════════════════════════════╝
    """)

show_menu()

# %%
if __name__ == "__main__":
    safe_print("\n🎉 Duplicate Finder ready!")
