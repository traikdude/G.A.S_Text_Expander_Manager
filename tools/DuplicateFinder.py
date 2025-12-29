"""
🔍 Text Expander Duplicate & Similarity Finder
===============================================
Find near-duplicate shortcuts and similar content! 🕵️
Uses fuzzy matching to detect snippets that are suspiciously alike! ✨

Spreadsheet: Shortcuts
ID: 17NaZQTbIm8LEiO2VoQoIn5HpqGEQKGAIUXN81SGnZJQ

Run in Google Colab for best results! 🚀
"""

# %% [markdown]
# # 🔍 Duplicate & Similarity Finder
# This notebook finds duplicate and similar shortcuts in your data! 🕵️
# 
# **Features:**
# - 🔄 Exact duplicate detection
# - 🎯 Fuzzy similarity matching (85%+ similar)
# - 📊 Similarity score visualization
# - 🧹 Cleanup recommendations
# - 📤 Export duplicate pairs for review

# %% [markdown]
# ## Step 1: Setup & Authentication 🔐

# %%
# Install required packages! 📦
!pip install gspread google-auth pandas numpy rapidfuzz matplotlib seaborn -q

print("✅ Packages installed! 📦")

# %%
# Import libraries! 🎁
import gspread
import pandas as pd
import numpy as np
from rapidfuzz import fuzz, process
from collections import defaultdict
import matplotlib.pyplot as plt
import seaborn as sns
from google.colab import auth
from google.auth import default
import warnings
warnings.filterwarnings('ignore')

# Beautiful plots! 🎨
plt.style.use('seaborn-v0_8-whitegrid')

print("✅ Libraries imported! 🚀")

# %%
# Authenticate! 🔑
auth.authenticate_user()
creds, _ = default()
gc = gspread.authorize(creds)

print("✅ Authentication successful! 🔐")

# %% [markdown]
# ## Step 2: Load Your Shortcuts 📥

# %%
# Configuration! 📋
SPREADSHEET_ID = "17NaZQTbIm8LEiO2VoQoIn5HpqGEQKGAIUXN81SGnZJQ"
SHEET_NAME = "Shortcuts"

# Connect! 🔗
spreadsheet = gc.open_by_key(SPREADSHEET_ID)
worksheet = spreadsheet.worksheet(SHEET_NAME)

print(f"✅ Connected to '{spreadsheet.title}'! 📊")

# %%
# Load data! 📊
data = worksheet.get_all_records()
df = pd.DataFrame(data)

print(f"✅ Loaded {len(df)} shortcuts! 🎉")
print(f"   Columns: {list(df.columns)}")

# %% [markdown]
# ## Step 3: 🔄 Find Exact Duplicates

# %%
def find_exact_duplicates(df):
    """Find exact duplicate content! 🔄"""
    
    print("=" * 60)
    print("🔄 EXACT DUPLICATE ANALYSIS")
    print("=" * 60)
    
    # Find exact content duplicates! 📋
    content_counts = df['Content'].value_counts()
    duplicates = content_counts[content_counts > 1]
    
    print(f"\n📊 Results:")
    print(f"   Total shortcuts: {len(df)}")
    print(f"   Unique content: {df['Content'].nunique()}")
    print(f"   Duplicate groups: {len(duplicates)}")
    
    if len(duplicates) == 0:
        print("\n✅ No exact duplicates found! 🎉")
        return pd.DataFrame()
    
    # Build duplicate report! 📋
    dup_report = []
    
    print(f"\n❌ Found {len(duplicates)} groups with exact duplicates:")
    print("-" * 50)
    
    for content, count in duplicates.head(20).items():
        matching_rows = df[df['Content'] == content]
        names = matching_rows['Snippet Name'].tolist()
        rows = matching_rows.index.tolist()
        
        content_preview = str(content)[:50] + ('...' if len(str(content)) > 50 else '')
        
        print(f"\n   📦 '{content_preview}' appears {count} times:")
        for name, row_idx in zip(names, rows):
            print(f"      → Row {row_idx + 2}: {name}")
            dup_report.append({
                'content_preview': content_preview,
                'snippet_name': name,
                'row': row_idx + 2,
                'duplicate_count': count,
                'type': 'exact'
            })
    
    return pd.DataFrame(dup_report)

exact_dups = find_exact_duplicates(df)

# %% [markdown]
# ## Step 4: 🎯 Find Similar Content (Fuzzy Matching)

# %%
def find_similar_content(df, threshold=85, sample_size=500):
    """Find similar (not exact) content using fuzzy matching! 🎯"""
    
    print("\n" + "=" * 60)
    print("🎯 SIMILARITY ANALYSIS (Fuzzy Matching)")
    print("=" * 60)
    print(f"   Threshold: {threshold}% similar")
    print(f"   Processing: {'all' if len(df) <= sample_size else f'sample of {sample_size}'} rows")
    
    # For large datasets, sample to avoid timeout! ⏱️
    if len(df) > sample_size:
        print(f"   ⚠️ Large dataset - sampling {sample_size} rows for speed!")
        df_sample = df.sample(n=sample_size, random_state=42)
    else:
        df_sample = df
    
    contents = df_sample['Content'].astype(str).tolist()
    names = df_sample['Snippet Name'].tolist()
    indices = df_sample.index.tolist()
    
    similar_pairs = []
    checked = set()
    
    print("\n🔍 Scanning for similar content...")
    
    total = len(contents)
    for i, (content_a, name_a, idx_a) in enumerate(zip(contents, names, indices)):
        if i % 100 == 0:
            print(f"   Progress: {i}/{total} ({i/total*100:.1f}%)")
        
        # Compare with remaining items
        for j in range(i + 1, len(contents)):
            content_b = contents[j]
            name_b = names[j]
            idx_b = indices[j]
            
            # Skip if already checked or exact match
            pair_key = tuple(sorted([idx_a, idx_b]))
            if pair_key in checked:
                continue
            checked.add(pair_key)
            
            # Skip exact duplicates (handled separately)
            if content_a == content_b:
                continue
            
            # Calculate similarity! 🎯
            similarity = fuzz.ratio(content_a, content_b)
            
            if similarity >= threshold:
                similar_pairs.append({
                    'snippet_a': name_a,
                    'row_a': idx_a + 2,
                    'content_a': content_a[:40] + '...' if len(content_a) > 40 else content_a,
                    'snippet_b': name_b,
                    'row_b': idx_b + 2,
                    'content_b': content_b[:40] + '...' if len(content_b) > 40 else content_b,
                    'similarity': similarity,
                    'type': 'similar'
                })
    
    print(f"\n✅ Scan complete!")
    print(f"   Pairs checked: {len(checked)}")
    print(f"   Similar pairs found: {len(similar_pairs)}")
    
    if len(similar_pairs) == 0:
        print("\n✅ No suspicious similarities found! 🎉")
        return pd.DataFrame()
    
    # Sort by similarity
    similar_df = pd.DataFrame(similar_pairs)
    similar_df = similar_df.sort_values('similarity', ascending=False)
    
    print(f"\n🎯 Top Similar Pairs (≥{threshold}% match):")
    print("-" * 60)
    
    for idx, row in similar_df.head(15).iterrows():
        print(f"\n   📎 {row['similarity']}% similar:")
        print(f"      A: Row {row['row_a']}: '{row['snippet_a']}' → {row['content_a']}")
        print(f"      B: Row {row['row_b']}: '{row['snippet_b']}' → {row['content_b']}")
    
    return similar_df

similar_pairs = find_similar_content(df, threshold=85, sample_size=500)

# %% [markdown]
# ## Step 5: 📊 Similarity Distribution Visualization

# %%
def visualize_similarity(similar_df):
    """Visualize similarity score distribution! 📊"""
    
    if len(similar_df) == 0:
        print("📊 No similar pairs to visualize!")
        return
    
    print("\n" + "=" * 60)
    print("📊 SIMILARITY VISUALIZATION")
    print("=" * 60)
    
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))
    
    # Histogram of similarity scores! 📈
    ax1 = axes[0]
    ax1.hist(similar_df['similarity'], bins=15, color='#667eea', edgecolor='white', alpha=0.8)
    ax1.set_xlabel('Similarity Score (%)', fontsize=12)
    ax1.set_ylabel('Number of Pairs', fontsize=12)
    ax1.set_title('🎯 Similarity Score Distribution', fontsize=14, fontweight='bold')
    ax1.axvline(90, color='red', linestyle='--', label='90% threshold')
    ax1.axvline(95, color='darkred', linestyle='--', label='95% threshold')
    ax1.legend()
    
    # Similarity buckets pie chart! 🥧
    ax2 = axes[1]
    buckets = {
        '85-89%': len(similar_df[(similar_df['similarity'] >= 85) & (similar_df['similarity'] < 90)]),
        '90-94%': len(similar_df[(similar_df['similarity'] >= 90) & (similar_df['similarity'] < 95)]),
        '95-99%': len(similar_df[(similar_df['similarity'] >= 95) & (similar_df['similarity'] < 100)]),
    }
    buckets = {k: v for k, v in buckets.items() if v > 0}
    
    if buckets:
        colors = ['#ffd93d', '#ff6b6b', '#c44569']
        ax2.pie(buckets.values(), labels=buckets.keys(), autopct='%1.1f%%', colors=colors[:len(buckets)])
        ax2.set_title('🥧 Similarity Buckets', fontsize=14, fontweight='bold')
    
    plt.tight_layout()
    plt.show()
    
    print("✅ Visualization complete! 📈")

visualize_similarity(similar_pairs)

# %% [markdown]
# ## Step 6: 🔍 Find Duplicate Snippet Names

# %%
def find_duplicate_names(df):
    """Find shortcuts with the same name but different content! 🏷️"""
    
    print("\n" + "=" * 60)
    print("🏷️ DUPLICATE NAME ANALYSIS")
    print("=" * 60)
    
    name_counts = df['Snippet Name'].value_counts()
    duplicate_names = name_counts[name_counts > 1]
    
    print(f"\n📊 Results:")
    print(f"   Total shortcuts: {len(df)}")
    print(f"   Unique names: {df['Snippet Name'].nunique()}")
    print(f"   Duplicate name groups: {len(duplicate_names)}")
    
    if len(duplicate_names) == 0:
        print("\n✅ All snippet names are unique! 🎉")
        return pd.DataFrame()
    
    dup_name_report = []
    
    print(f"\n⚠️ Names used multiple times:")
    print("-" * 50)
    
    for name, count in duplicate_names.head(20).items():
        matching_rows = df[df['Snippet Name'] == name]
        
        print(f"\n   🏷️ '{name}' appears {count} times:")
        
        # Check if content is same or different
        unique_contents = matching_rows['Content'].nunique()
        
        if unique_contents == 1:
            print(f"      → Same content (true duplicate)")
            dup_type = 'name_and_content'
        else:
            print(f"      → {unique_contents} different contents (naming conflict!)")
            dup_type = 'name_only'
        
        for idx, row in matching_rows.iterrows():
            content_preview = str(row['Content'])[:40] + '...'
            print(f"      Row {idx + 2}: {content_preview}")
            
            dup_name_report.append({
                'snippet_name': name,
                'row': idx + 2,
                'content_preview': content_preview,
                'duplicate_type': dup_type,
                'count': count
            })
    
    return pd.DataFrame(dup_name_report)

duplicate_names = find_duplicate_names(df)

# %% [markdown]
# ## Step 7: 🧹 Cleanup Recommendations

# %%
def generate_cleanup_recommendations(exact_dups, similar_pairs, duplicate_names):
    """Generate actionable cleanup recommendations! 🧹"""
    
    print("\n" + "=" * 60)
    print("🧹 CLEANUP RECOMMENDATIONS")
    print("=" * 60)
    
    recommendations = []
    
    # Exact duplicates - highest priority! 🔴
    if len(exact_dups) > 0:
        unique_groups = exact_dups['content_preview'].nunique() if len(exact_dups) > 0 else 0
        recommendations.append({
            'priority': '🔴 HIGH',
            'issue': f'{len(exact_dups)} exact duplicate rows in {unique_groups} groups',
            'action': 'Delete duplicate rows, keep one copy each',
            'rows': exact_dups['row'].tolist() if len(exact_dups) < 50 else 'See exported CSV'
        })
    
    # High similarity pairs (95%+) 🟠
    if len(similar_pairs) > 0:
        very_similar = similar_pairs[similar_pairs['similarity'] >= 95]
        if len(very_similar) > 0:
            recommendations.append({
                'priority': '🟠 MEDIUM',
                'issue': f'{len(very_similar)} pairs with 95%+ similarity',
                'action': 'Review and merge or differentiate these snippets',
                'rows': 'See similarity report CSV'
            })
    
    # Duplicate names with different content 🟡
    if len(duplicate_names) > 0:
        name_conflicts = duplicate_names[duplicate_names['duplicate_type'] == 'name_only']
        if len(name_conflicts) > 0:
            unique_names = name_conflicts['snippet_name'].nunique()
            recommendations.append({
                'priority': '🟡 MEDIUM',
                'issue': f'{unique_names} snippet names used for different content',
                'action': 'Rename to distinguish or merge if similar',
                'rows': name_conflicts['row'].tolist() if len(name_conflicts) < 50 else 'See exported CSV'
            })
    
    # Print recommendations! 📋
    if recommendations:
        for i, rec in enumerate(recommendations, 1):
            print(f"\n{rec['priority']} Recommendation #{i}:")
            print(f"   Issue: {rec['issue']}")
            print(f"   Action: {rec['action']}")
    else:
        print("\n✅ No cleanup needed! Your data is clean! 🎉")
    
    # Summary stats
    total_issues = len(exact_dups) + len(similar_pairs) + len(duplicate_names)
    print(f"\n📊 Total potential issues: {total_issues}")
    
    return recommendations

recommendations = generate_cleanup_recommendations(exact_dups, similar_pairs, duplicate_names)

# %% [markdown]
# ## Step 8: 📤 Export Reports

# %%
def export_duplicate_reports(exact_dups, similar_pairs, duplicate_names):
    """Export all reports as CSV! 📤"""
    
    print("\n" + "=" * 60)
    print("📤 EXPORTING REPORTS")
    print("=" * 60)
    
    files_created = []
    
    # Export exact duplicates
    if len(exact_dups) > 0:
        exact_dups.to_csv('/content/exact_duplicates.csv', index=False)
        files_created.append('exact_duplicates.csv')
        print(f"✅ Exact duplicates: {len(exact_dups)} rows")
    
    # Export similar pairs
    if len(similar_pairs) > 0:
        similar_pairs.to_csv('/content/similar_pairs.csv', index=False)
        files_created.append('similar_pairs.csv')
        print(f"✅ Similar pairs: {len(similar_pairs)} pairs")
    
    # Export duplicate names
    if len(duplicate_names) > 0:
        duplicate_names.to_csv('/content/duplicate_names.csv', index=False)
        files_created.append('duplicate_names.csv')
        print(f"✅ Duplicate names: {len(duplicate_names)} rows")
    
    if not files_created:
        print("✅ No issues to export - your data is clean! 🎉")
        return
    
    # Download files! 📥
    from google.colab import files
    for f in files_created:
        files.download(f'/content/{f}')
    
    print(f"\n📥 Downloaded {len(files_created)} report(s)!")

export_duplicate_reports(exact_dups, similar_pairs, duplicate_names)

# %% [markdown]
# ## 🎉 Analysis Complete!
# 
# Your duplicate analysis is done! 🔍
# 
# **Next Steps:**
# 1. Review the downloaded CSV files 📋
# 2. Delete exact duplicates (keep one copy) 🗑️
# 3. Review high-similarity pairs (95%+) 🔍
# 4. Resolve naming conflicts 🏷️
# 5. Re-run this analyzer to verify cleanup! ✅
