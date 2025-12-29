"""
🏥 Text Expander Data Quality Analyzer
======================================
Comprehensive data health check for your shortcuts spreadsheet! 📊
Identifies missing fields, empty values, and data quality issues! 🔍

Spreadsheet: Shortcuts
ID: 17NaZQTbIm8LEiO2VoQoIn5HpqGEQKGAIUXN81SGnZJQ

Run in Google Colab for best results! 🚀
"""

# %% [markdown]
# # 🏥 Text Expander Data Quality Analyzer
# This notebook performs a comprehensive health check on your shortcuts data! ✨
# 
# **Features:**
# - 📊 Overall statistics and metrics
# - ❌ Missing field detection
# - 🔍 Empty value finder
# - 📏 Content length analysis
# - 🏷️ Tag coverage report
# - 🌍 Language distribution
# - 📈 Category balance check
# - 📋 Actionable fix recommendations

# %% [markdown]
# ## Step 1: Setup & Authentication 🔐

# %%
# Install required packages! 📦
!pip install gspread google-auth pandas numpy matplotlib seaborn -q

print("✅ Packages installed successfully! 📦")

# %%
# Import all the goodies! 🎁
import gspread
import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
from google.colab import auth
from google.auth import default
from collections import Counter
import warnings
warnings.filterwarnings('ignore')

# Set beautiful plot style! 🎨
plt.style.use('seaborn-v0_8-whitegrid')
sns.set_palette("husl")

print("✅ Libraries imported! Ready to analyze! 🚀")

# %%
# Authenticate with Google! 🔑
auth.authenticate_user()
creds, _ = default()
gc = gspread.authorize(creds)

print("✅ Authentication successful! 🔐")

# %% [markdown]
# ## Step 2: Connect & Load Data 📥

# %%
# Spreadsheet configuration! 📋
SPREADSHEET_ID = "17NaZQTbIm8LEiO2VoQoIn5HpqGEQKGAIUXN81SGnZJQ"
SHEET_NAME = "Shortcuts"

# Connect to spreadsheet! 🔗
try:
    spreadsheet = gc.open_by_key(SPREADSHEET_ID)
    worksheet = spreadsheet.worksheet(SHEET_NAME)
    print(f"✅ Connected to '{spreadsheet.title}'! 📊")
    print(f"   Sheet: '{SHEET_NAME}'")
    print(f"   Size: {worksheet.row_count} rows × {worksheet.col_count} columns")
except Exception as e:
    print(f"❌ Connection failed: {e}")

# %%
# Load all data into DataFrame! 📊
data = worksheet.get_all_records()
df = pd.DataFrame(data)

print(f"✅ Loaded {len(df)} shortcuts successfully! 🎉")
print(f"\n📋 Columns found: {list(df.columns)}")

# %% [markdown]
# ## Step 3: 📊 Overall Statistics Dashboard

# %%
def generate_overview_stats(df):
    """Generate comprehensive overview statistics! 📈"""
    
    print("=" * 60)
    print("📊 DATA QUALITY DASHBOARD")
    print("=" * 60)
    
    stats = {
        '📋 Total Shortcuts': len(df),
        '📏 Columns Available': len(df.columns),
    }
    
    # Core field analysis! 🔍
    core_fields = ['Snippet Name', 'Content', 'Application', 'Description', 'Language', 'Tags']
    
    print("\n🔍 CORE FIELD ANALYSIS:")
    print("-" * 40)
    
    for field in core_fields:
        if field in df.columns:
            empty_count = df[field].isna().sum() + (df[field] == '').sum()
            filled_count = len(df) - empty_count
            fill_rate = (filled_count / len(df)) * 100
            
            # Emoji based on fill rate! 🎨
            if fill_rate >= 90:
                status = "✅"
            elif fill_rate >= 70:
                status = "🟡"
            elif fill_rate >= 50:
                status = "🟠"
            else:
                status = "❌"
            
            print(f"  {status} {field}: {filled_count}/{len(df)} ({fill_rate:.1f}% filled)")
    
    # Enhanced fields (if available)! ✨
    enhanced_fields = ['MainCategory', 'Subcategory', 'FontStyle', 'Platform', 'UsageFrequency']
    available_enhanced = [f for f in enhanced_fields if f in df.columns]
    
    if available_enhanced:
        print("\n✨ ENHANCED FIELD ANALYSIS:")
        print("-" * 40)
        
        for field in available_enhanced:
            empty_count = df[field].isna().sum() + (df[field] == '').sum()
            filled_count = len(df) - empty_count
            fill_rate = (filled_count / len(df)) * 100
            
            if fill_rate >= 90:
                status = "✅"
            elif fill_rate >= 70:
                status = "🟡"
            else:
                status = "❌"
            
            print(f"  {status} {field}: {filled_count}/{len(df)} ({fill_rate:.1f}% filled)")
    else:
        print("\n⚠️ Enhanced fields not yet added (run DropdownEnhancements first)!")
    
    return stats

overview = generate_overview_stats(df)

# %% [markdown]
# ## Step 4: ❌ Missing Field Report

# %%
def analyze_missing_fields(df):
    """Find all rows with missing critical data! 🔍"""
    
    print("\n" + "=" * 60)
    print("❌ MISSING FIELD REPORT")
    print("=" * 60)
    
    issues = []
    
    # Check each critical field! 🔎
    critical_fields = {
        'Snippet Name': 'No snippet name - cannot identify!',
        'Content': 'No content - shortcut is useless!',
        'Description': 'No description - harder to categorize',
        'Language': 'No language - filtering limited',
        'Tags': 'No tags - search limited',
    }
    
    for field, impact in critical_fields.items():
        if field in df.columns:
            missing = df[(df[field].isna()) | (df[field] == '')]
            if len(missing) > 0:
                issues.append({
                    'field': field,
                    'count': len(missing),
                    'impact': impact,
                    'rows': missing.index.tolist()[:10]  # First 10 rows
                })
                print(f"\n❌ {field}: {len(missing)} missing")
                print(f"   Impact: {impact}")
                if len(missing) <= 5:
                    for idx, row in missing.head().iterrows():
                        name = row.get('Snippet Name', f'Row {idx+2}')
                        print(f"   → Row {idx+2}: {name[:50]}...")
    
    if not issues:
        print("\n✅ No critical missing fields found! 🎉")
    
    return issues

missing_report = analyze_missing_fields(df)

# %% [markdown]
# ## Step 5: 📏 Content Length Analysis

# %%
def analyze_content_length(df):
    """Analyze content length distribution! 📏"""
    
    print("\n" + "=" * 60)
    print("📏 CONTENT LENGTH ANALYSIS")
    print("=" * 60)
    
    if 'Content' not in df.columns:
        print("❌ Content column not found!")
        return
    
    df['content_length'] = df['Content'].astype(str).str.len()
    
    print(f"\n📊 Length Statistics:")
    print(f"   📈 Mean length: {df['content_length'].mean():.1f} characters")
    print(f"   📉 Min length: {df['content_length'].min()} characters")
    print(f"   📈 Max length: {df['content_length'].max()} characters")
    print(f"   📊 Median: {df['content_length'].median():.1f} characters")
    
    # Find extremes! ⚠️
    very_short = df[df['content_length'] < 3]
    very_long = df[df['content_length'] > 1000]
    
    if len(very_short) > 0:
        print(f"\n⚠️ Very Short Snippets (<3 chars): {len(very_short)}")
        for idx, row in very_short.head(5).iterrows():
            print(f"   → '{row['Snippet Name']}': '{row['Content']}'")
    
    if len(very_long) > 0:
        print(f"\n📦 Long Snippets (>1000 chars): {len(very_long)}")
        for idx, row in very_long.head(5).iterrows():
            print(f"   → '{row['Snippet Name']}': {row['content_length']} chars")
    
    # Create histogram! 📊
    fig, ax = plt.subplots(figsize=(10, 5))
    
    # Filter out extreme outliers for visualization
    plot_data = df[df['content_length'] < 500]['content_length']
    
    ax.hist(plot_data, bins=50, color='#667eea', edgecolor='white', alpha=0.8)
    ax.set_xlabel('Content Length (characters)', fontsize=12)
    ax.set_ylabel('Number of Shortcuts', fontsize=12)
    ax.set_title('📏 Content Length Distribution', fontsize=14, fontweight='bold')
    ax.axvline(df['content_length'].mean(), color='red', linestyle='--', label=f'Mean: {df["content_length"].mean():.1f}')
    ax.legend()
    
    plt.tight_layout()
    plt.show()
    
    print("\n✅ Histogram generated! 📈")

analyze_content_length(df)

# %% [markdown]
# ## Step 6: 🌍 Language Distribution

# %%
def analyze_language_distribution(df):
    """Analyze language distribution! 🌍"""
    
    print("\n" + "=" * 60)
    print("🌍 LANGUAGE DISTRIBUTION")
    print("=" * 60)
    
    if 'Language' not in df.columns:
        print("❌ Language column not found!")
        return
    
    # Clean and count languages! 📊
    df['lang_clean'] = df['Language'].fillna('(empty)').replace('', '(empty)')
    lang_counts = df['lang_clean'].value_counts()
    
    print(f"\n📊 Languages Found: {len(lang_counts)}")
    print("-" * 40)
    
    for lang, count in lang_counts.items():
        pct = (count / len(df)) * 100
        bar = '█' * int(pct / 5) + '▒' * (20 - int(pct / 5))
        print(f"  {lang:20} {bar} {count:5} ({pct:5.1f}%)")
    
    # Pie chart! 🥧
    fig, ax = plt.subplots(figsize=(8, 8))
    colors = plt.cm.Set3(np.linspace(0, 1, len(lang_counts)))
    
    # Only show top 5 in pie, rest as "Other"
    top_langs = lang_counts.head(5)
    if len(lang_counts) > 5:
        other_count = lang_counts[5:].sum()
        top_langs['Other'] = other_count
    
    ax.pie(top_langs, labels=top_langs.index, autopct='%1.1f%%', colors=colors, startangle=90)
    ax.set_title('🌍 Language Distribution', fontsize=14, fontweight='bold')
    
    plt.tight_layout()
    plt.show()

analyze_language_distribution(df)

# %% [markdown]
# ## Step 7: 🏷️ Category Coverage (if available)

# %%
def analyze_category_coverage(df):
    """Analyze MainCategory coverage! 🏷️"""
    
    print("\n" + "=" * 60)
    print("🏷️ CATEGORY COVERAGE ANALYSIS")
    print("=" * 60)
    
    if 'MainCategory' not in df.columns:
        print("⚠️ MainCategory column not found!")
        print("   Run the TextExpanderCategorizer notebook first! 🐍")
        return
    
    # Clean and count! 📊
    df['cat_clean'] = df['MainCategory'].fillna('(uncategorized)').replace('', '(uncategorized)')
    cat_counts = df['cat_clean'].value_counts()
    
    print(f"\n📊 Categories Found: {len(cat_counts)}")
    print("-" * 50)
    
    for cat, count in cat_counts.items():
        pct = (count / len(df)) * 100
        bar = '█' * int(pct / 2) + '▒' * (50 - int(pct / 2))
        emoji = cat[0] if cat and cat[0] in '🎯🔣😊📅🔢💬📧🎨🌈🏷️' else '❓'
        print(f"  {emoji} {cat[:35]:35} {count:5} ({pct:5.1f}%)")
    
    # Check for uncategorized! ⚠️
    uncategorized = df[df['cat_clean'] == '(uncategorized)']
    if len(uncategorized) > 0:
        print(f"\n⚠️ Uncategorized Shortcuts: {len(uncategorized)}")
        print("   These need manual categorization or re-running the categorizer!")

analyze_category_coverage(df)

# %% [markdown]
# ## Step 8: 📋 Data Quality Score

# %%
def calculate_quality_score(df):
    """Calculate overall data quality score! 🏆"""
    
    print("\n" + "=" * 60)
    print("🏆 OVERALL DATA QUALITY SCORE")
    print("=" * 60)
    
    scores = {}
    
    # Score each dimension (0-100)! 📊
    
    # 1. Completeness - are all fields filled? 📋
    core_fields = ['Snippet Name', 'Content', 'Description', 'Language', 'Tags']
    available_fields = [f for f in core_fields if f in df.columns]
    
    completeness_scores = []
    for field in available_fields:
        filled = len(df) - df[field].isna().sum() - (df[field] == '').sum()
        completeness_scores.append((filled / len(df)) * 100)
    
    scores['📋 Completeness'] = np.mean(completeness_scores) if completeness_scores else 0
    
    # 2. Uniqueness - no duplicates? 🔄
    if 'Content' in df.columns:
        unique_ratio = df['Content'].nunique() / len(df) * 100
        scores['🔄 Uniqueness'] = unique_ratio
    
    # 3. Validity - content length reasonable? ✅
    if 'Content' in df.columns:
        df['_len'] = df['Content'].astype(str).str.len()
        valid = len(df[(df['_len'] >= 1) & (df['_len'] <= 10000)])
        scores['✅ Validity'] = (valid / len(df)) * 100
    
    # 4. Categorization - if available 🏷️
    if 'MainCategory' in df.columns:
        categorized = len(df[(df['MainCategory'].notna()) & (df['MainCategory'] != '')])
        scores['🏷️ Categorized'] = (categorized / len(df)) * 100
    
    # Calculate overall! 🎯
    overall = np.mean(list(scores.values()))
    
    print(f"\n📊 Dimension Scores:")
    print("-" * 40)
    
    for dimension, score in scores.items():
        bar = '█' * int(score / 5) + '░' * (20 - int(score / 5))
        grade = '🟢' if score >= 80 else '🟡' if score >= 60 else '🔴'
        print(f"  {grade} {dimension}: {bar} {score:.1f}%")
    
    print(f"\n{'='*40}")
    
    # Overall grade with emoji! 🏆
    if overall >= 90:
        grade_emoji = "🏆"
        grade_text = "EXCELLENT"
    elif overall >= 80:
        grade_emoji = "🥇"
        grade_text = "GREAT"
    elif overall >= 70:
        grade_emoji = "🥈"
        grade_text = "GOOD"
    elif overall >= 60:
        grade_emoji = "🥉"
        grade_text = "FAIR"
    else:
        grade_emoji = "📈"
        grade_text = "NEEDS WORK"
    
    print(f"  {grade_emoji} OVERALL SCORE: {overall:.1f}% - {grade_text}")
    print(f"{'='*40}")
    
    return overall, scores

quality_score, dimension_scores = calculate_quality_score(df)

# %% [markdown]
# ## Step 9: 📋 Actionable Recommendations

# %%
def generate_recommendations(df):
    """Generate actionable fix recommendations! 💡"""
    
    print("\n" + "=" * 60)
    print("💡 ACTIONABLE RECOMMENDATIONS")
    print("=" * 60)
    
    recommendations = []
    
    # Check each issue and recommend! 🔧
    
    # 1. Missing descriptions? ❌
    if 'Description' in df.columns:
        missing_desc = len(df[(df['Description'].isna()) | (df['Description'] == '')])
        if missing_desc > 0:
            recommendations.append({
                'priority': '🔴 HIGH',
                'issue': f'{missing_desc} shortcuts missing descriptions',
                'action': 'Run auto-categorizer or manually add descriptions',
                'impact': 'Improves filtering and searchability'
            })
    
    # 2. Missing tags? 🏷️
    if 'Tags' in df.columns:
        missing_tags = len(df[(df['Tags'].isna()) | (df['Tags'] == '')])
        if missing_tags > 0:
            pct = (missing_tags / len(df)) * 100
            priority = '🔴 HIGH' if pct > 50 else '🟡 MEDIUM' if pct > 20 else '🟢 LOW'
            recommendations.append({
                'priority': priority,
                'issue': f'{missing_tags} shortcuts missing tags ({pct:.1f}%)',
                'action': 'Use Smart Tag Generator notebook',
                'impact': 'Improves search functionality'
            })
    
    # 3. Missing language? 🌍
    if 'Language' in df.columns:
        missing_lang = len(df[(df['Language'].isna()) | (df['Language'] == '')])
        if missing_lang > 0:
            recommendations.append({
                'priority': '🟡 MEDIUM',
                'issue': f'{missing_lang} shortcuts missing language',
                'action': 'Use Language Detection notebook',
                'impact': 'Enables language-based filtering'
            })
    
    # 4. Missing categories? 🏷️
    if 'MainCategory' in df.columns:
        missing_cat = len(df[(df['MainCategory'].isna()) | (df['MainCategory'] == '')])
        if missing_cat > 0:
            recommendations.append({
                'priority': '🔴 HIGH',
                'issue': f'{missing_cat} shortcuts uncategorized',
                'action': 'Re-run TextExpanderCategorizer with fixes',
                'impact': 'Essential for new filter UI'
            })
    elif 'MainCategory' not in df.columns:
        recommendations.append({
            'priority': '🔴 HIGH',
            'issue': 'MainCategory column not yet added',
            'action': 'Run clasp push, then Add Enhanced Dropdowns in spreadsheet',
            'impact': 'Required for category-based filtering'
        })
    
    # Print recommendations! 📋
    if recommendations:
        for i, rec in enumerate(recommendations, 1):
            print(f"\n{rec['priority']} Recommendation #{i}:")
            print(f"   Issue: {rec['issue']}")
            print(f"   Action: {rec['action']}")
            print(f"   Impact: {rec['impact']}")
    else:
        print("\n✅ No critical issues found! Your data is in great shape! 🎉")
    
    return recommendations

recommendations = generate_recommendations(df)

# %% [markdown]
# ## Step 10: 📊 Export Quality Report

# %%
def export_quality_report(df, quality_score):
    """Export comprehensive quality report! 📤"""
    
    print("\n" + "=" * 60)
    print("📤 EXPORTING QUALITY REPORT")
    print("=" * 60)
    
    # Create summary DataFrame! 📊
    report_data = []
    
    for idx, row in df.iterrows():
        issues = []
        
        # Check each field
        if pd.isna(row.get('Description')) or row.get('Description') == '':
            issues.append('Missing Description')
        if pd.isna(row.get('Tags')) or row.get('Tags') == '':
            issues.append('Missing Tags')
        if pd.isna(row.get('Language')) or row.get('Language') == '':
            issues.append('Missing Language')
        if 'MainCategory' in df.columns:
            if pd.isna(row.get('MainCategory')) or row.get('MainCategory') == '':
                issues.append('Missing Category')
        
        content_len = len(str(row.get('Content', '')))
        if content_len < 3:
            issues.append('Very Short Content')
        if content_len > 5000:
            issues.append('Very Long Content')
        
        report_data.append({
            'Row': idx + 2,
            'Snippet Name': row.get('Snippet Name', '')[:50],
            'Content Length': content_len,
            'Issues Count': len(issues),
            'Issues': ', '.join(issues) if issues else 'None'
        })
    
    report_df = pd.DataFrame(report_data)
    
    # Save to CSV! 💾
    report_df.to_csv('/content/data_quality_report.csv', index=False)
    
    # Also save rows with issues only
    issues_df = report_df[report_df['Issues Count'] > 0]
    issues_df.to_csv('/content/rows_with_issues.csv', index=False)
    
    print(f"✅ Full report saved: data_quality_report.csv")
    print(f"✅ Issues report saved: rows_with_issues.csv ({len(issues_df)} rows)")
    
    # Download files! 📥
    from google.colab import files
    files.download('/content/data_quality_report.csv')
    files.download('/content/rows_with_issues.csv')
    
    return report_df

report_df = export_quality_report(df, quality_score)

# %% [markdown]
# ## 🎉 Analysis Complete!
# 
# Your data quality report has been generated! 📊
# 
# **Next Steps:**
# 1. Review the downloaded CSV files 📋
# 2. Fix high-priority issues first 🔴
# 3. Re-run the categorizer if needed 🏷️
# 4. Run this analyzer again to track improvement! 📈
