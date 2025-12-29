"""
💾 Text Expander Backup System
==============================
Never lose your data! Comprehensive backup & restore for your shortcuts! 🛡️
Automated versioning, Google Drive storage, and one-click recovery! ✨

Spreadsheet: Shortcuts
ID: 17NaZQTbIm8LEiO2VoQoIn5HpqGEQKGAIUXN81SGnZJQ

Features:
- 💾 Automated Google Drive backups (JSON + CSV)
- 📅 Timestamp-based versioning
- 🔄 Incremental change tracking
- 📊 Backup health dashboard
- 🔐 Data integrity verification
- 🚀 One-click restore

Run in Google Colab: https://colab.research.google.com
"""

# %% [markdown]
# # 💾 Text Expander Backup System
# 
# **Never lose your data!** 🛡️ This notebook creates comprehensive backups of your
# shortcuts with versioning, integrity checks, and easy restore!
# 
# ## Features:
# - 💾 Full spreadsheet backup to Google Drive
# - 📅 Automatic timestamp versioning
# - 🔄 Incremental change detection
# - 📊 Backup status dashboard
# - 🔐 Data integrity verification (checksums)
# - 🚀 One-click restore from any backup

# %% [markdown]
# ## Step 1: Setup & Authentication 🔑

# %%
# Install required libraries! 📦
!pip install gspread gspread-dataframe pandas -q

# Import everything we need! 🐍
import gspread
import pandas as pd
import json
import hashlib
import os
from datetime import datetime, timedelta
from google.colab import auth, drive, files
from google.auth import default
from gspread_dataframe import set_with_dataframe, get_as_dataframe
import warnings
warnings.filterwarnings('ignore')

print("✅ Libraries imported! Ready to protect your data! 🛡️")

# %%
# Authenticate with Google! 🔐
auth.authenticate_user()
creds, _ = default()
gc = gspread.authorize(creds)

# Mount Google Drive for persistent backups! 💾
drive.mount('/content/drive')

print("✅ Authentication successful! Google Drive mounted! 🚀")

# %% [markdown]
# ## Step 2: Configuration 📋

# %%
# Spreadsheet configuration! 📝
SPREADSHEET_ID = "17NaZQTbIm8LEiO2VoQoIn5HpqGEQKGAIUXN81SGnZJQ"
SHEET_NAME = "Shortcuts"  # Main sheet to backup

# Backup configuration! 💾
BACKUP_FOLDER = "/content/drive/MyDrive/TextExpanderBackups"
MAX_BACKUPS_TO_KEEP = 30  # Keep last 30 backups (rotating)
BACKUP_PREFIX = "TE_Backup"

# Create backup folder if it doesn't exist! 📁
os.makedirs(BACKUP_FOLDER, exist_ok=True)
print(f"✅ Backup folder ready: {BACKUP_FOLDER} 📁")

# Connect to spreadsheet! 🔗
try:
    spreadsheet = gc.open_by_key(SPREADSHEET_ID)
    worksheet = spreadsheet.worksheet(SHEET_NAME)
    print(f"✅ Connected to '{spreadsheet.title}' - Sheet: '{SHEET_NAME}' 🔗")
except Exception as e:
    print(f"❌ Connection error: {e}")
    raise

# %% [markdown]
# ## Step 3: 📊 Backup Status Dashboard

# %%
def get_backup_status():
    """Check existing backups and return status dashboard! 📊"""
    
    backups = []
    if os.path.exists(BACKUP_FOLDER):
        for f in os.listdir(BACKUP_FOLDER):
            if f.startswith(BACKUP_PREFIX) and f.endswith('.json'):
                filepath = os.path.join(BACKUP_FOLDER, f)
                stat = os.stat(filepath)
                
                # Extract timestamp from filename
                try:
                    timestamp_str = f.replace(f"{BACKUP_PREFIX}_", "").replace(".json", "")
                    backup_date = datetime.strptime(timestamp_str, "%Y%m%d_%H%M%S")
                except:
                    backup_date = datetime.fromtimestamp(stat.st_mtime)
                
                backups.append({
                    'filename': f,
                    'date': backup_date,
                    'size_kb': round(stat.st_size / 1024, 2),
                    'filepath': filepath
                })
    
    # Sort by date (newest first)
    backups.sort(key=lambda x: x['date'], reverse=True)
    
    # Display dashboard
    print("=" * 60)
    print("💾 BACKUP STATUS DASHBOARD")
    print("=" * 60)
    
    if backups:
        print(f"\n📊 Total Backups: {len(backups)}")
        print(f"📅 Latest Backup: {backups[0]['date'].strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"📁 Backup Location: {BACKUP_FOLDER}")
        
        # Calculate days since last backup
        days_since = (datetime.now() - backups[0]['date']).days
        if days_since == 0:
            print(f"⏰ Last Backup: Today! ✅")
        elif days_since == 1:
            print(f"⏰ Last Backup: Yesterday ⚠️")
        else:
            print(f"⏰ Last Backup: {days_since} days ago {'⚠️' if days_since > 7 else ''}")
        
        print(f"\n📋 Recent Backups (Last 5):")
        print("-" * 60)
        for i, b in enumerate(backups[:5]):
            print(f"  {i+1}. {b['filename']} ({b['size_kb']} KB)")
    else:
        print("\n⚠️ No backups found! Run create_backup() to start! 🚀")
    
    print("=" * 60)
    
    return backups

# Show current backup status
existing_backups = get_backup_status()

# %% [markdown]
# ## Step 4: 💾 Create Full Backup

# %%
def calculate_checksum(data):
    """Calculate MD5 checksum for data integrity! 🔐"""
    if isinstance(data, str):
        return hashlib.md5(data.encode()).hexdigest()
    return hashlib.md5(json.dumps(data, sort_keys=True).encode()).hexdigest()

def create_backup(include_csv=True):
    """Create a complete backup of the spreadsheet! 💾"""
    
    print("\n" + "=" * 60)
    print("💾 CREATING BACKUP")
    print("=" * 60)
    
    # Generate timestamp for versioning
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # 1️⃣ Fetch all data from spreadsheet
    print("\n📥 Step 1: Fetching data from spreadsheet...")
    data = worksheet.get_all_records()
    headers = worksheet.row_values(1)
    
    print(f"   ✅ Fetched {len(data)} rows with {len(headers)} columns")
    
    # 2️⃣ Create backup object with metadata
    print("\n📦 Step 2: Preparing backup package...")
    backup_obj = {
        'metadata': {
            'backup_timestamp': timestamp,
            'backup_date': datetime.now().isoformat(),
            'spreadsheet_id': SPREADSHEET_ID,
            'spreadsheet_name': spreadsheet.title,
            'sheet_name': SHEET_NAME,
            'row_count': len(data),
            'column_count': len(headers),
            'headers': headers,
            'version': '2.0',
            'checksum': None  # Will be calculated
        },
        'data': data
    }
    
    # 3️⃣ Calculate checksum for integrity
    print("\n🔐 Step 3: Calculating data checksum...")
    backup_obj['metadata']['checksum'] = calculate_checksum(data)
    print(f"   ✅ Checksum: {backup_obj['metadata']['checksum'][:16]}...")
    
    # 4️⃣ Save JSON backup to Google Drive
    print("\n💾 Step 4: Saving JSON backup to Google Drive...")
    json_filename = f"{BACKUP_PREFIX}_{timestamp}.json"
    json_filepath = os.path.join(BACKUP_FOLDER, json_filename)
    
    with open(json_filepath, 'w', encoding='utf-8') as f:
        json.dump(backup_obj, f, ensure_ascii=False, indent=2)
    
    json_size = os.path.getsize(json_filepath) / 1024
    print(f"   ✅ Saved: {json_filename} ({json_size:.2f} KB)")
    
    # 5️⃣ Save CSV backup (optional, for easy viewing)
    if include_csv:
        print("\n📊 Step 5: Saving CSV backup...")
        csv_filename = f"{BACKUP_PREFIX}_{timestamp}.csv"
        csv_filepath = os.path.join(BACKUP_FOLDER, csv_filename)
        
        df = pd.DataFrame(data)
        df.to_csv(csv_filepath, index=False, encoding='utf-8')
        
        csv_size = os.path.getsize(csv_filepath) / 1024
        print(f"   ✅ Saved: {csv_filename} ({csv_size:.2f} KB)")
    
    # 6️⃣ Cleanup old backups (keep only MAX_BACKUPS_TO_KEEP)
    print("\n🧹 Step 6: Managing backup rotation...")
    cleanup_old_backups()
    
    # 7️⃣ Verification
    print("\n✅ Step 7: Verifying backup...")
    verify_backup(json_filepath)
    
    print("\n" + "=" * 60)
    print("🎉 BACKUP COMPLETE!")
    print("=" * 60)
    print(f"\n📁 Location: {BACKUP_FOLDER}")
    print(f"📄 Filename: {json_filename}")
    print(f"📊 Rows: {len(data)}")
    print(f"🔐 Checksum: {backup_obj['metadata']['checksum'][:16]}...")
    print(f"💾 Size: {json_size:.2f} KB")
    
    return json_filepath

# %% [markdown]
# ## Step 5: 🔐 Verify Backup Integrity

# %%
def verify_backup(filepath):
    """Verify backup file integrity! 🔐"""
    
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            backup = json.load(f)
        
        # Check structure
        assert 'metadata' in backup, "Missing metadata!"
        assert 'data' in backup, "Missing data!"
        assert 'checksum' in backup['metadata'], "Missing checksum!"
        
        # Verify checksum
        expected_checksum = backup['metadata']['checksum']
        actual_checksum = calculate_checksum(backup['data'])
        
        if expected_checksum == actual_checksum:
            print(f"   ✅ Integrity verified! Checksum matches! 🔐")
            return True
        else:
            print(f"   ❌ INTEGRITY ERROR! Checksum mismatch! ⚠️")
            print(f"      Expected: {expected_checksum}")
            print(f"      Actual:   {actual_checksum}")
            return False
            
    except Exception as e:
        print(f"   ❌ Verification failed: {e}")
        return False

# %% [markdown]
# ## Step 6: 🧹 Backup Rotation & Cleanup

# %%
def cleanup_old_backups():
    """Remove old backups to maintain rotation! 🧹"""
    
    backups = []
    for f in os.listdir(BACKUP_FOLDER):
        if f.startswith(BACKUP_PREFIX) and f.endswith('.json'):
            filepath = os.path.join(BACKUP_FOLDER, f)
            stat = os.stat(filepath)
            backups.append({
                'filename': f,
                'mtime': stat.st_mtime,
                'filepath': filepath
            })
    
    # Sort by modification time (oldest first)
    backups.sort(key=lambda x: x['mtime'])
    
    # Remove oldest backups if we exceed MAX_BACKUPS_TO_KEEP
    while len(backups) > MAX_BACKUPS_TO_KEEP:
        oldest = backups.pop(0)
        
        # Remove JSON file
        os.remove(oldest['filepath'])
        
        # Also remove corresponding CSV if exists
        csv_path = oldest['filepath'].replace('.json', '.csv')
        if os.path.exists(csv_path):
            os.remove(csv_path)
        
        print(f"   🗑️ Removed old backup: {oldest['filename']}")
    
    remaining = len([f for f in os.listdir(BACKUP_FOLDER) if f.endswith('.json')])
    print(f"   ✅ Backup rotation complete! Keeping {remaining} backups")

# %% [markdown]
# ## Step 7: 🔄 Detect Changes Since Last Backup

# %%
def detect_changes():
    """Detect what changed since the last backup! 🔄"""
    
    print("\n" + "=" * 60)
    print("🔄 CHANGE DETECTION")
    print("=" * 60)
    
    # Find latest backup
    backups = get_backup_status()
    
    if not backups:
        print("\n⚠️ No previous backups found! Cannot detect changes.")
        print("   Run create_backup() first!")
        return None
    
    # Load latest backup
    latest_backup_path = backups[0]['filepath']
    print(f"\n📂 Loading latest backup: {backups[0]['filename']}")
    
    with open(latest_backup_path, 'r', encoding='utf-8') as f:
        backup_data = json.load(f)
    
    old_data = backup_data['data']
    old_df = pd.DataFrame(old_data)
    
    # Fetch current data
    print("📥 Fetching current spreadsheet data...")
    current_data = worksheet.get_all_records()
    current_df = pd.DataFrame(current_data)
    
    print(f"\n📊 Comparison:")
    print(f"   Backup rows: {len(old_df)}")
    print(f"   Current rows: {len(current_df)}")
    
    # Calculate changes
    changes = {
        'added_rows': len(current_df) - len(old_df) if len(current_df) > len(old_df) else 0,
        'removed_rows': len(old_df) - len(current_df) if len(old_df) > len(current_df) else 0,
        'content_changed': False
    }
    
    # Check content changes
    old_checksum = backup_data['metadata']['checksum']
    new_checksum = calculate_checksum(current_data)
    
    if old_checksum != new_checksum:
        changes['content_changed'] = True
        print(f"\n⚠️ CHANGES DETECTED!")
        print(f"   Old checksum: {old_checksum[:16]}...")
        print(f"   New checksum: {new_checksum[:16]}...")
        
        if changes['added_rows'] > 0:
            print(f"   ➕ Added rows: {changes['added_rows']}")
        if changes['removed_rows'] > 0:
            print(f"   ➖ Removed rows: {changes['removed_rows']}")
        
        print(f"\n💡 Recommendation: Run create_backup() to save changes!")
    else:
        print(f"\n✅ No changes detected since last backup!")
        print(f"   Your data is up-to-date! 🎉")
    
    print("=" * 60)
    
    return changes

# Run change detection
changes = detect_changes()

# %% [markdown]
# ## Step 8: 🚀 Restore From Backup

# %%
def list_available_backups():
    """List all available backups for restore! 📋"""
    
    backups = []
    for f in os.listdir(BACKUP_FOLDER):
        if f.startswith(BACKUP_PREFIX) and f.endswith('.json'):
            filepath = os.path.join(BACKUP_FOLDER, f)
            
            # Load metadata
            with open(filepath, 'r', encoding='utf-8') as file:
                backup = json.load(file)
            
            backups.append({
                'filename': f,
                'filepath': filepath,
                'date': backup['metadata'].get('backup_date', 'Unknown'),
                'rows': backup['metadata'].get('row_count', 0),
                'checksum': backup['metadata'].get('checksum', '')[:8]
            })
    
    # Sort by date (newest first)
    backups.sort(key=lambda x: x['date'], reverse=True)
    
    print("=" * 70)
    print("📋 AVAILABLE BACKUPS FOR RESTORE")
    print("=" * 70)
    print(f"{'#':<3} {'Date':<22} {'Rows':<8} {'Checksum':<10} {'Filename':<30}")
    print("-" * 70)
    
    for i, b in enumerate(backups):
        date_str = b['date'][:19] if len(b['date']) > 19 else b['date']
        print(f"{i+1:<3} {date_str:<22} {b['rows']:<8} {b['checksum']:<10} {b['filename']:<30}")
    
    print("=" * 70)
    print(f"\n💡 To restore, run: restore_from_backup({'{backup_number}'})")
    
    return backups

# %%
def restore_from_backup(backup_number=None, backup_filepath=None, create_safety_backup=True):
    """
    Restore spreadsheet from a backup! 🚀
    
    Args:
        backup_number: Number from list_available_backups() (1-based)
        backup_filepath: Direct path to backup file
        create_safety_backup: Create a backup before restore (recommended!)
    """
    
    print("\n" + "=" * 60)
    print("🚀 RESTORE FROM BACKUP")
    print("=" * 60)
    
    # Get backup file path
    if backup_number:
        backups = list_available_backups()
        if backup_number < 1 or backup_number > len(backups):
            print(f"❌ Invalid backup number! Choose 1-{len(backups)}")
            return False
        backup_filepath = backups[backup_number - 1]['filepath']
    
    if not backup_filepath:
        print("❌ No backup specified! Use backup_number or backup_filepath")
        return False
    
    # 1️⃣ Load backup
    print(f"\n📂 Step 1: Loading backup...")
    print(f"   File: {os.path.basename(backup_filepath)}")
    
    with open(backup_filepath, 'r', encoding='utf-8') as f:
        backup = json.load(f)
    
    # 2️⃣ Verify backup integrity
    print("\n🔐 Step 2: Verifying backup integrity...")
    if not verify_backup(backup_filepath):
        print("❌ Backup integrity check failed! Aborting restore.")
        return False
    
    # 3️⃣ Create safety backup before restore
    if create_safety_backup:
        print("\n💾 Step 3: Creating safety backup of current data...")
        print("   (In case you need to undo this restore)")
        safety_path = create_backup(include_csv=False)
        print(f"   ✅ Safety backup created!")
    
    # 4️⃣ Confirmation prompt
    print(f"\n⚠️ WARNING: This will overwrite your current spreadsheet data!")
    print(f"   Backup date: {backup['metadata']['backup_date']}")
    print(f"   Rows to restore: {backup['metadata']['row_count']}")
    
    confirm = input("\n🔴 Type 'RESTORE' to confirm: ")
    
    if confirm.upper() != 'RESTORE':
        print("❌ Restore cancelled.")
        return False
    
    # 5️⃣ Clear existing data
    print("\n🧹 Step 4: Clearing current spreadsheet data...")
    worksheet.clear()
    print("   ✅ Spreadsheet cleared")
    
    # 6️⃣ Restore headers
    print("\n📋 Step 5: Restoring headers...")
    headers = backup['metadata']['headers']
    worksheet.append_row(headers)
    print(f"   ✅ Restored {len(headers)} column headers")
    
    # 7️⃣ Restore data in batches
    print("\n📥 Step 6: Restoring data rows...")
    data = backup['data']
    
    # Convert to DataFrame for easier handling
    df = pd.DataFrame(data)
    
    # Ensure column order matches headers
    df = df.reindex(columns=headers)
    
    # Use set_with_dataframe for efficient restore
    set_with_dataframe(worksheet, df, row=2, include_column_header=False)
    
    print(f"   ✅ Restored {len(data)} rows!")
    
    # 8️⃣ Verification
    print("\n✅ Step 7: Verifying restore...")
    restored_count = len(worksheet.get_all_records())
    
    if restored_count == len(data):
        print(f"   ✅ Verification passed! {restored_count} rows restored!")
    else:
        print(f"   ⚠️ Row count mismatch! Expected {len(data)}, got {restored_count}")
    
    print("\n" + "=" * 60)
    print("🎉 RESTORE COMPLETE!")
    print("=" * 60)
    print(f"\n📊 Restored: {restored_count} rows")
    print(f"📅 From backup: {backup['metadata']['backup_date']}")
    print(f"🔐 Checksum: {backup['metadata']['checksum'][:16]}...")
    
    return True

# %% [markdown]
# ## Step 9: 📤 Download Backup Locally

# %%
def download_latest_backup():
    """Download the latest backup to your computer! 📤"""
    
    backups = get_backup_status()
    
    if not backups:
        print("❌ No backups found!")
        return
    
    latest = backups[0]['filepath']
    print(f"📥 Preparing download: {backups[0]['filename']}")
    
    # Download the JSON file
    files.download(latest)
    
    # Also download CSV if exists
    csv_path = latest.replace('.json', '.csv')
    if os.path.exists(csv_path):
        files.download(csv_path)
    
    print("✅ Download started! Check your Downloads folder! 📁")

# %% [markdown]
# ## Step 10: ⏰ Automated Backup Schedule Info

# %%
def show_backup_recommendations():
    """Show backup schedule recommendations! ⏰"""
    
    print("\n" + "=" * 60)
    print("⏰ BACKUP SCHEDULE RECOMMENDATIONS")
    print("=" * 60)
    
    print("""
    📅 Recommended Backup Schedule:
    
    🔴 HIGH FREQUENCY (Daily users):
       Run create_backup() at the end of each session
       
    🟡 MEDIUM FREQUENCY (Weekly users):
       Run create_backup() at least once per week
       Set a calendar reminder!
       
    🟢 BEFORE MAJOR CHANGES:
       Always run create_backup() before:
       - Running auto-categorization scripts
       - Bulk edits or imports
       - Sharing spreadsheet access
       
    💡 AUTOMATED OPTION:
       Set up a Google Apps Script trigger to auto-backup daily!
       (Ask for the Apps Script backup code if interested!)
    """)
    
    # Check current backup health
    backups = get_backup_status()
    if backups:
        days_since = (datetime.now() - backups[0]['date']).days
        if days_since > 7:
            print(f"    ⚠️ WARNING: Your last backup is {days_since} days old!")
            print(f"    💡 Recommendation: Run create_backup() now!")
    
    print("=" * 60)

show_backup_recommendations()

# %% [markdown]
# ## 🚀 Quick Actions Menu

# %%
def show_quick_menu():
    """Display quick action menu! 🎯"""
    
    print("""
╔══════════════════════════════════════════════════════════════╗
║               💾 BACKUP SYSTEM QUICK MENU                     ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  📊 STATUS & INFO                                            ║
║     get_backup_status()      - View backup dashboard         ║
║     detect_changes()         - Check for unsaved changes     ║
║     show_backup_recommendations() - See best practices       ║
║                                                              ║
║  💾 BACKUP OPERATIONS                                        ║
║     create_backup()          - Create new backup now!        ║
║     download_latest_backup() - Download to your computer     ║
║                                                              ║
║  🚀 RESTORE OPERATIONS                                       ║
║     list_available_backups() - See all restore points        ║
║     restore_from_backup(N)   - Restore from backup #N        ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
    """)

show_quick_menu()

# %% [markdown]
# ## 💾 Run Backup Now!

# %%
# 🚀 UNCOMMENT TO CREATE A BACKUP NOW!
# backup_path = create_backup()

print("💡 To create a backup, uncomment and run: create_backup()")
print("💡 To restore from backup, run: list_available_backups() first!")

# %% [markdown]
# ## 🎉 Backup System Ready!
# 
# Your data protection toolkit is set up! 💾
# 
# **Available Commands:**
# - `create_backup()` - Save current data to Google Drive! 💾
# - `get_backup_status()` - Check backup health! 📊
# - `detect_changes()` - See what changed! 🔄
# - `list_available_backups()` - View restore points! 📋
# - `restore_from_backup(N)` - Restore from backup #N! 🚀
# - `download_latest_backup()` - Download to computer! 📤
# 
# **Pro Tips:**
# 1. 📅 Run `create_backup()` before making big changes!
# 2. 🔄 Use `detect_changes()` to see if you need a new backup!
# 3. 💾 Backups are stored in Google Drive for persistence!
# 4. 🔐 Every backup includes integrity verification!
# 
# **Never lose your shortcuts again!** 🛡️✨
