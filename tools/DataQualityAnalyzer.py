"""
📊 Text Expander Data Quality Analyzer
======================================
Comprehensive data health check for your shortcuts! 🏥
Finds missing fields, empty values, and quality issues! 🔍

🌐 Works in BOTH:
   - Google Colab (with rich visualizations)
   - Local Python (python DataQualityAnalyzer.py)

Spreadsheet: Shortcuts
ID: 17NaZQTbIm8LEiO2VoQoIn5HpqGEQKGAIUXN81SGnZJQ
"""

# %% [markdown]
# # 📊 Data Quality Analyzer
# Comprehensive health check for your shortcuts database!

# %% [markdown]
# ## Step 1: Setup 🔍

# %%
# %%
import sys
from pathlib import Path

# Add current directory to path so we can import colab_compat if run from adjacent dir
current_dir = Path(__file__).resolve().parent
if str(current_dir) not in sys.path:
    sys.path.insert(0, str(current_dir))

try:
    from colab_compat import ColabCompat, safe_print
except ImportError:
    sys.path.append("tools")
    from tools.colab_compat import ColabCompat, safe_print

# Initialize Compatibility Layer
compat = ColabCompat()
compat.print_environment()
compat.ensure_packages(["matplotlib", "seaborn"])

# %%
import gspread
import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from pathlib import Path
from collections import Counter
import warnings
warnings.filterwarnings('ignore')

plt.style.use('seaborn-v0_8-whitegrid')
sns.set_palette("husl")

print("✅ Libraries imported!")

# %% [markdown]
# ## Step 2: Authentication 🔐

# %%
# %%
MOCK_MODE = False
try:
    gc = compat.get_gspread_client()
    print("✅ Authenticated successfully!")
except Exception as e:
    print(f"⚠️ Authentication failed: {e}")
    print("🚀 Switching to MOCK MODE for testing/demo purposes.")
    MOCK_MODE = True
    gc = None

# %% [markdown]
# ## Step 3: Load Data 📥

# %%
SPREADSHEET_ID = "17NaZQTbIm8LEiO2VoQoIn5HpqGEQKGAIUXN81SGnZJQ"
SHEET_NAME = "Shortcuts"
OUTPUT_FOLDER = str(compat.base_path)

# Initialize dataframe
df = None

if MOCK_MODE:
    print("\n🚧 MOCK MODE: Generating dummy data for logic testing...")
    # Create valid dummy dataframe with some intentional quality issues for testing
    data = {
        'Snippet Name': ['addr', '', 'sig', 'meeting', 'date'],
        'Content': ['123 Main St', 'example@test.com', '', 'Meeting link:', '2024-01-01'],
        'Description': ['Home address', 'Personal email', 'Signature', '', 'Current date'],
        'MainCategory': ['Contact', 'Contact', 'Communication', 'Communication', 'Dates & Time'],
        'Language': ['en', 'en', '', 'en', 'es']
    }
    df = pd.DataFrame(data)
    print(f"📊 Mock Data Loaded: {len(df)} rows (with intentional empty fields)")

else:
    try:
        spreadsheet = gc.open_by_key(SPREADSHEET_ID)
        worksheet = spreadsheet.worksheet(SHEET_NAME)
        data = worksheet.get_all_records()
        df = pd.DataFrame(data)
        print(f"✅ Loaded {len(df)} shortcuts!")
        print(f"📋 Columns: {list(df.columns)}")
    except Exception as e:
        print(f"❌ Error loading spreadsheet: {e}")
        raise

# %% [markdown]
# ## Step 4: Overview Statistics 📈

# %%
def generate_overview():
    """Generate overview statistics! 📈"""
    print("=" * 60)
    print("📊 DATA QUALITY OVERVIEW")
    print("=" * 60)
    
    total = len(df)
    print(f"\n📦 Total Records: {total}")
    print(f"📋 Total Columns: {len(df.columns)}")
    
    # Check each column
    print("\n📊 Column Statistics:")
    print("-" * 60)
    
    stats = []
    for col in df.columns:
        filled = df[col].notna().sum()
        empty = df[col].isna().sum() + (df[col] == '').sum()
        fill_rate = (total - empty) / total * 100
        
        print(f"  {col[:30]:<30} | {fill_rate:>5.1f}% filled | {empty} empty")
        stats.append({'Column': col, 'Filled %': fill_rate, 'Empty': empty})
    
    return pd.DataFrame(stats)

overview = generate_overview()

# %% [markdown]
# ## Step 5: Missing Field Analysis ❌

# %%
def analyze_missing():
    """Find rows with missing critical data! ❌"""
    critical = ['Snippet Name', 'Content']
    available_critical = [c for c in critical if c in df.columns]
    
    print("\n" + "=" * 60)
    print("❌ MISSING FIELD ANALYSIS")
    print("=" * 60)
    
    issues = []
    for col in available_critical:
        missing = df[(df[col].isna()) | (df[col] == '')]
        if len(missing) > 0:
            print(f"\n⚠️ {col}: {len(missing)} missing")
            for idx, row in missing.head(5).iterrows():
                issues.append({'Row': idx + 2, 'Column': col, 'Issue': 'Missing'})
    
    if not issues:
        print("\n✅ No critical missing fields!")
    
    return pd.DataFrame(issues) if issues else None

missing_report = analyze_missing()

# %% [markdown]
# ## Step 6: Content Length Analysis 📏

# %%
def analyze_content_length():
    """Analyze content length distribution! 📏"""
    if 'Content' not in df.columns:
        print("❌ No Content column found!")
        return
    
    df['content_length'] = df['Content'].astype(str).str.len()
    
    print("\n" + "=" * 60)
    print("📏 CONTENT LENGTH ANALYSIS")
    print("=" * 60)
    
    print(f"\n📊 Statistics:")
    print(f"   Min: {df['content_length'].min()} chars")
    print(f"   Max: {df['content_length'].max()} chars")
    print(f"   Mean: {df['content_length'].mean():.1f} chars")
    print(f"   Median: {df['content_length'].median():.1f} chars")
    
    # Very short content (potential issues)
    very_short = df[df['content_length'] <= 1]
    if len(very_short) > 0:
        print(f"\n⚠️ Very short content (≤1 char): {len(very_short)} items")
    
    # Very long content
    very_long = df[df['content_length'] > 500]
    if len(very_long) > 0:
        print(f"📝 Long content (>500 chars): {len(very_long)} items")

analyze_content_length()

# %% [markdown]
# ## Step 7: Quality Score 🏆

# %%
def calculate_quality_score():
    """Calculate overall data quality score! 🏆"""
    print("\n" + "=" * 60)
    print("🏆 DATA QUALITY SCORE")
    print("=" * 60)
    
    scores = {}
    
    # Completeness (40%)
    total_cells = len(df) * len(df.columns)
    filled_cells = df.notna().sum().sum() - (df == '').sum().sum()
    completeness = filled_cells / total_cells * 100
    scores['Completeness'] = completeness
    
    # Content validity (30%)
    if 'Content' in df.columns:
        valid_content = df['Content'].apply(lambda x: len(str(x)) > 0).sum()
        content_validity = valid_content / len(df) * 100
    else:
        content_validity = 100
    scores['Content Validity'] = content_validity
    
    # Name uniqueness (30%)
    if 'Snippet Name' in df.columns:
        unique_ratio = df['Snippet Name'].nunique() / len(df) * 100
    else:
        unique_ratio = 100
    scores['Uniqueness'] = unique_ratio
    
    # Calculate weighted score
    overall = (completeness * 0.4 + content_validity * 0.3 + unique_ratio * 0.3)
    
    print(f"\n📊 Dimension Scores:")
    for dim, score in scores.items():
        bar = "█" * int(score / 5) + "░" * (20 - int(score / 5))
        print(f"   {dim:<20} [{bar}] {score:.1f}%")
    
    print(f"\n🏆 OVERALL QUALITY: {overall:.1f}%")
    
    if overall >= 90:
        print("   Grade: A+ Excellent! 🌟")
    elif overall >= 80:
        print("   Grade: A Good! ✅")
    elif overall >= 70:
        print("   Grade: B Fair ⚠️")
    else:
        print("   Grade: C Needs Improvement 🔧")
    
    return overall, scores

quality_score, dimension_scores = calculate_quality_score()

# %% [markdown]
# ## Step 8: Recommendations 💡

# %%
def generate_recommendations():
    """Generate actionable recommendations! 💡"""
    print("\n" + "=" * 60)
    print("💡 RECOMMENDATIONS")
    print("=" * 60)
    
    recs = []
    
    # Check for missing descriptions
    if 'Description' in df.columns:
        missing_desc = (df['Description'].isna() | (df['Description'] == '')).sum()
        if missing_desc > len(df) * 0.1:
            recs.append(f"📝 Add descriptions to {missing_desc} shortcuts")
    
    # Check for missing categories
    if 'MainCategory' in df.columns:
        missing_cat = (df['MainCategory'].isna() | (df['MainCategory'] == '')).sum()
        if missing_cat > 0:
            recs.append(f"🏷️ Categorize {missing_cat} uncategorized shortcuts")
    
    # Check for duplicates
    if 'Content' in df.columns:
        dups = df['Content'].duplicated().sum()
        if dups > 0:
            recs.append(f"🔍 Review {dups} duplicate content items")
    
    if recs:
        for i, rec in enumerate(recs, 1):
            print(f"   {i}. {rec}")
    else:
        print("   ✅ No major issues found!")
    
    return recs

recommendations = generate_recommendations()

# %% [markdown]
# ## Step 9: Export Report 📤

# %%
def export_report():
    """Export quality report! 📤"""
    report_file = os.path.join(OUTPUT_FOLDER, "data_quality_report.csv")
    
    report_data = {
        'Metric': ['Total Records', 'Quality Score', 'Completeness', 'Content Validity', 'Uniqueness'],
        'Value': [len(df), f"{quality_score:.1f}%", f"{dimension_scores['Completeness']:.1f}%", 
                  f"{dimension_scores['Content Validity']:.1f}%", f"{dimension_scores['Uniqueness']:.1f}%"]
    }
    
    pd.DataFrame(report_data).to_csv(report_file, index=False)
    print(f"\n✅ Report exported to: {report_file}")
    
    if IN_COLAB:
        from google.colab import files
        files.download(report_file)

export_report()

# %% [markdown]
# ## 🎯 Quick Menu

# %%
def show_menu():
    print("""
╔═══════════════════════════════════════════════════════╗
║         📊 DATA QUALITY ANALYZER                      ║
╠═══════════════════════════════════════════════════════╣
║  generate_overview()          - Show statistics       ║
║  analyze_missing()            - Find missing data     ║
║  calculate_quality_score()    - Get quality score     ║
║  generate_recommendations()   - Get recommendations   ║
║  export_report()              - Export report         ║
╚═══════════════════════════════════════════════════════╝
    """)

show_menu()

# %%
if __name__ == "__main__":
    print("\n🎉 Data Quality Analyzer ready!")
