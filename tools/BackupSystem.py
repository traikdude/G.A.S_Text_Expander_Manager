"""
💾 Text Expander Backup System
==============================
Never lose your data! Comprehensive backup & restore for your shortcuts! 🛡️
Automated versioning, storage, and one-click recovery! ✨

🌐 Works in BOTH:
   - Google Colab (with Drive storage)
   - Local Python (with local folder storage)

Spreadsheet: Shortcuts
ID: 17NaZQTbIm8LEiO2VoQoIn5HpqGEQKGAIUXN81SGnZJQ

Features:
- 💾 Automated backups (JSON + CSV)
- 📅 Timestamp-based versioning
- 🔄 Incremental change tracking
- 📊 Backup health dashboard
- 🔐 Data integrity verification
- 🚀 One-click restore

Run locally: python BackupSystem.py
Run in Colab: Upload and run cells
"""

# %% [markdown]
# # 💾 Text Expander Backup System
# 
# **Never lose your data!** 🛡️ This notebook creates comprehensive backups of your
# shortcuts with versioning, integrity checks, and easy restore!
# 
# ## 🌐 Hybrid Compatibility
# This script works both:
# - **Locally**: `python BackupSystem.py`
# - **In Colab**: Upload and run cells

# %% [markdown]
# ## Step 1: Setup & Environment Detection 🔍

# %%
# Import compatibility layer
import sys
import os

# Add tools directory to path for imports
tools_dir = os.path.dirname(os.path.abspath(__file__)) if '__file__' in dir() else os.getcwd()
if tools_dir not in sys.path:
    sys.path.insert(0, tools_dir)

# Try to import our compatibility module
try:
    from colab_compat import ColabCompat, setup_environment
except ImportError:
    # If running standalone, define minimal compatibility
    print("⚠️ colab_compat.py not found - using standalone mode")
    
    class ColabCompat:
        def __init__(self, backup_folder="TextExpanderBackups"):
            self.in_colab = 'google.colab' in sys.modules
            self.backup_path = os.path.join(os.path.expanduser("~"), backup_folder)
            
        def print_environment(self):
            env = "🌐 Google Colab" if self.in_colab else "💻 Local Python"
            print(f"🔍 Environment: {env}")
            
        def ensure_backup_folder(self):
            os.makedirs(self.backup_path, exist_ok=True)
            return self.backup_path

# Initialize compatibility layer
compat = ColabCompat("TextExpanderBackups")
compat.print_environment()

# %%
# Install/verify packages
import subprocess

def ensure_packages():
    """Ensure required packages are installed! 📦"""
    required = ['gspread', 'gspread-dataframe', 'pandas']
    
    for pkg in required:
        try:
            __import__(pkg.replace('-', '_'))
        except ImportError:
            print(f"📦 Installing {pkg}...")
            if compat.in_colab:
                from IPython import get_ipython
                get_ipython().system(f'pip install {pkg} -q')
            else:
                subprocess.run([sys.executable, '-m', 'pip', 'install', pkg, '-q'], 
                             capture_output=True)
    print("✅ All packages ready!")

ensure_packages()

# %%
# Now import everything we need
import gspread
import pandas as pd
import json
import hashlib
from datetime import datetime, timedelta
from pathlib import Path
import warnings
warnings.filterwarnings('ignore')

try:
    from gspread_dataframe import set_with_dataframe, get_as_dataframe
except ImportError:
    set_with_dataframe = None

print("✅ Libraries imported! Ready to protect your data! 🛡️")

# %% [markdown]
# ## Step 2: Authentication 🔐

# %%
# Authenticate based on environment
if compat.in_colab:
    # Colab authentication
    from google.colab import auth, drive
    from google.auth import default
    
    print("🔐 Authenticating with Google (Colab)...")
    auth.authenticate_user()
    creds, _ = default()
    gc = gspread.authorize(creds)
    
    # Mount Google Drive for persistent storage
    print("💾 Mounting Google Drive...")
    drive.mount('/content/drive')
    BACKUP_FOLDER = "/content/drive/MyDrive/TextExpanderBackups"
    
else:
    # Local authentication
    print("🔐 Authenticating with Google (Local)...")
    
    # Try service account first
    creds_file = Path("credentials.json")
    gspread_creds = Path.home() / ".config" / "gspread" / "credentials.json"
    
    if creds_file.exists():
        from google.oauth2.service_account import Credentials
        scopes = [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive'
        ]
        creds = Credentials.from_service_account_file(str(creds_file), scopes=scopes)
        gc = gspread.authorize(creds)
        print(f"✅ Authenticated via credentials.json")
    elif gspread_creds.exists():
        from google.oauth2.service_account import Credentials
        scopes = [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive'
        ]
        creds = Credentials.from_service_account_file(str(gspread_creds), scopes=scopes)
        gc = gspread.authorize(creds)
        print(f"✅ Authenticated via gspread config")
    else:
        # Fall back to OAuth
        print("💡 No service account found, using OAuth...")
        gc = gspread.oauth()
        print("✅ Authenticated via OAuth!")
    
    BACKUP_FOLDER = str(Path.home() / "TextExpanderBackups")

# Ensure backup folder exists
os.makedirs(BACKUP_FOLDER, exist_ok=True)
print(f"📁 Backup folder: {BACKUP_FOLDER}")

print("✅ Authentication complete! 🔐")

# %% [markdown]
# ## Step 3: Configuration 📋

# %%
# Spreadsheet configuration
SPREADSHEET_ID = "17NaZQTbIm8LEiO2VoQoIn5HpqGEQKGAIUXN81SGnZJQ"
SHEET_NAME = "Shortcuts"

# Backup settings
MAX_BACKUPS_TO_KEEP = 30
BACKUP_PREFIX = "TE_Backup"

# Connect to spreadsheet
try:
    spreadsheet = gc.open_by_key(SPREADSHEET_ID)
    worksheet = spreadsheet.worksheet(SHEET_NAME)
    print(f"✅ Connected to '{spreadsheet.title}' - Sheet: '{SHEET_NAME}' 🔗")
except Exception as e:
    print(f"❌ Connection error: {e}")
    print("\n💡 Make sure you've shared the spreadsheet with your service account email!")
    raise

# %% [markdown]
# ## Step 4: 📊 Backup Status Dashboard

# %%
def get_backup_status():
    """Check existing backups and return status dashboard! 📊"""
    
    backups = []
    if os.path.exists(BACKUP_FOLDER):
        for f in os.listdir(BACKUP_FOLDER):
            if f.startswith(BACKUP_PREFIX) and f.endswith('.json'):
                filepath = os.path.join(BACKUP_FOLDER, f)
                stat = os.stat(filepath)
                
                try:
                    timestamp_str = f.replace(f"{BACKUP_PREFIX}_", "").replace(".json", "")
                    backup_date = datetime.strptime(timestamp_str, "%Y%m%d_%H%M%S")
                except ValueError:
                    # Fallback to file modification time if timestamp parsing fails
                    backup_date = datetime.fromtimestamp(stat.st_mtime)
                
                backups.append({
                    'filename': f,
                    'date': backup_date,
                    'size_kb': round(stat.st_size / 1024, 2),
                    'filepath': filepath
                })
    
    backups.sort(key=lambda x: x['date'], reverse=True)
    
    print("=" * 60)
    print("💾 BACKUP STATUS DASHBOARD")
    print("=" * 60)
    
    if backups:
        print(f"\n📊 Total Backups: {len(backups)}")
        print(f"📅 Latest Backup: {backups[0]['date'].strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"📁 Location: {BACKUP_FOLDER}")
        
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

# Show current status
existing_backups = get_backup_status()

# %% [markdown]
# ## Step 5: 💾 Create Full Backup

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
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    
    # Fetch data
    print("\n📥 Step 1: Fetching data from spreadsheet...")
    data = worksheet.get_all_records()
    headers = worksheet.row_values(1)
    print(f"   ✅ Fetched {len(data)} rows with {len(headers)} columns")
    
    # Create backup object
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
            'environment': 'colab' if compat.in_colab else 'local',
            'checksum': None
        },
        'data': data
    }
    
    # Calculate checksum
    print("\n🔐 Step 3: Calculating data checksum...")
    backup_obj['metadata']['checksum'] = calculate_checksum(data)
    print(f"   ✅ Checksum: {backup_obj['metadata']['checksum'][:16]}...")
    
    # Save JSON
    print("\n💾 Step 4: Saving JSON backup...")
    json_filename = f"{BACKUP_PREFIX}_{timestamp}.json"
    json_filepath = os.path.join(BACKUP_FOLDER, json_filename)
    
    with open(json_filepath, 'w', encoding='utf-8') as f:
        json.dump(backup_obj, f, ensure_ascii=False, indent=2)
    
    json_size = os.path.getsize(json_filepath) / 1024
    print(f"   ✅ Saved: {json_filename} ({json_size:.2f} KB)")
    
    # Save CSV
    if include_csv:
        print("\n📊 Step 5: Saving CSV backup...")
        csv_filename = f"{BACKUP_PREFIX}_{timestamp}.csv"
        csv_filepath = os.path.join(BACKUP_FOLDER, csv_filename)
        
        df = pd.DataFrame(data)
        df.to_csv(csv_filepath, index=False, encoding='utf-8')
        
        csv_size = os.path.getsize(csv_filepath) / 1024
        print(f"   ✅ Saved: {csv_filename} ({csv_size:.2f} KB)")
    
    # Cleanup old backups
    print("\n🧹 Step 6: Managing backup rotation...")
    cleanup_old_backups()
    
    # Verify
    print("\n✅ Step 7: Verifying backup...")
    verify_backup(json_filepath)
    
    print("\n" + "=" * 60)
    print("🎉 BACKUP COMPLETE!")
    print("=" * 60)
    print(f"\n📁 Location: {BACKUP_FOLDER}")
    print(f"📄 Filename: {json_filename}")
    print(f"📊 Rows: {len(data)}")
    print(f"💾 Size: {json_size:.2f} KB")
    
    return json_filepath

# %% [markdown]
# ## Step 6: 🔐 Verify Backup Integrity

# %%
def verify_backup(filepath):
    """Verify backup file integrity! 🔐"""
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            backup = json.load(f)
        
        assert 'metadata' in backup, "Missing metadata!"
        assert 'data' in backup, "Missing data!"
        assert 'checksum' in backup['metadata'], "Missing checksum!"
        
        expected = backup['metadata']['checksum']
        actual = calculate_checksum(backup['data'])
        
        if expected == actual:
            print(f"   ✅ Integrity verified! Checksum matches! 🔐")
            return True
        else:
            print(f"   ❌ INTEGRITY ERROR! Checksum mismatch! ⚠️")
            return False
    except Exception as e:
        print(f"   ❌ Verification failed: {e}")
        return False

# %% [markdown]
# ## Step 7: 🧹 Backup Rotation

# %%
def cleanup_old_backups():
    """Remove old backups to maintain rotation! 🧹"""
    if not os.path.exists(BACKUP_FOLDER):
        print("   ⚠️ Backup folder doesn't exist yet")
        return
    
    backups = []
    try:
        for f in os.listdir(BACKUP_FOLDER):
            if f.startswith(BACKUP_PREFIX) and f.endswith('.json'):
                filepath = os.path.join(BACKUP_FOLDER, f)
                try:
                    stat = os.stat(filepath)
                    backups.append({'filename': f, 'mtime': stat.st_mtime, 'filepath': filepath})
                except OSError as e:
                    print(f"   ⚠️ Could not stat {f}: {e}")
    except OSError as e:
        print(f"   ❌ Error reading backup folder: {e}")
        return
    
    backups.sort(key=lambda x: x['mtime'])
    
    while len(backups) > MAX_BACKUPS_TO_KEEP:
        oldest = backups.pop(0)
        try:
            os.remove(oldest['filepath'])
            csv_path = oldest['filepath'].replace('.json', '.csv')
            if os.path.exists(csv_path):
                os.remove(csv_path)
            print(f"   🗑️ Removed: {oldest['filename']}")
        except OSError as e:
            print(f"   ⚠️ Could not remove {oldest['filename']}: {e}")
    
    # Count only backup files with proper prefix
    remaining = len([f for f in os.listdir(BACKUP_FOLDER) 
                    if f.endswith('.json') and f.startswith(BACKUP_PREFIX)])
    print(f"   ✅ Keeping {remaining} backups")

# %% [markdown]
# ## Step 8: 🔄 Detect Changes

# %%
def detect_changes():
    """Detect what changed since the last backup! 🔄"""
    print("\n" + "=" * 60)
    print("🔄 CHANGE DETECTION")
    print("=" * 60)
    
    backups = get_backup_status()
    if not backups:
        print("\n⚠️ No previous backups found!")
        return None
    
    with open(backups[0]['filepath'], 'r', encoding='utf-8') as f:
        backup_data = json.load(f)
    
    old_checksum = backup_data['metadata']['checksum']
    current_data = worksheet.get_all_records()
    new_checksum = calculate_checksum(current_data)
    
    print(f"\n📊 Backup rows: {backup_data['metadata']['row_count']}")
    print(f"📊 Current rows: {len(current_data)}")
    
    if old_checksum != new_checksum:
        print(f"\n⚠️ CHANGES DETECTED!")
        print(f"💡 Run create_backup() to save changes!")
        return True
    else:
        print(f"\n✅ No changes since last backup! 🎉")
        return False

# %% [markdown]
# ## Step 9: 🚀 Restore From Backup

# %%
def list_available_backups():
    """List all available backups! 📋"""
    backups = []
    
    if not os.path.exists(BACKUP_FOLDER):
        print("⚠️ Backup folder doesn't exist!")
        return backups
    
    try:
        for f in os.listdir(BACKUP_FOLDER):
            if f.startswith(BACKUP_PREFIX) and f.endswith('.json'):
                filepath = os.path.join(BACKUP_FOLDER, f)
                try:
                    with open(filepath, 'r', encoding='utf-8') as file:
                        backup = json.load(file)
                    backups.append({
                        'filename': f,
                        'filepath': filepath,
                        'date': backup['metadata'].get('backup_date', 'Unknown'),
                        'rows': backup['metadata'].get('row_count', 0)
                    })
                except (FileNotFoundError, json.JSONDecodeError, KeyError) as e:
                    print(f"   ⚠️ Skipping corrupted backup {f}: {e}")
    except OSError as e:
        print(f"❌ Error reading backup folder: {e}")
        return backups
    
    backups.sort(key=lambda x: x['date'], reverse=True)
    
    print("=" * 70)
    print("📋 AVAILABLE BACKUPS")
    print("=" * 70)
    for i, b in enumerate(backups):
        date_display = b['date'][:19] if len(b['date']) >= 19 else b['date']
        print(f"  {i+1}. {date_display} | {b['rows']} rows | {b['filename']}")
    print("=" * 70)
    
    return backups

def restore_from_backup(backup_number=None, create_safety_backup=True):
    """Restore from a backup! 🚀"""
    backups = list_available_backups()
    
    if not backup_number:
        print("\n💡 Usage: restore_from_backup(1) to restore from backup #1")
        return False
    
    if backup_number < 1 or backup_number > len(backups):
        print(f"❌ Invalid number! Choose 1-{len(backups)}")
        return False
    
    backup_filepath = backups[backup_number - 1]['filepath']
    
    print(f"\n📂 Loading: {os.path.basename(backup_filepath)}")
    
    if not verify_backup(backup_filepath):
        print("❌ Integrity check failed!")
        return False
    
    if create_safety_backup:
        print("\n💾 Creating safety backup first...")
        create_backup(include_csv=False)
    
    print("\n⚠️ This will OVERWRITE your spreadsheet!")
    try:
        confirm = input("Type 'RESTORE' to confirm: ").strip()
    except (EOFError, KeyboardInterrupt):
        print("\n❌ Cancelled.")
        return False
    
    if not confirm or confirm.upper() != 'RESTORE':
        print("❌ Cancelled.")
        return False
    
    with open(backup_filepath, 'r') as f:
        backup = json.load(f)
    
    worksheet.clear()
    worksheet.append_row(backup['metadata']['headers'])
    
    df = pd.DataFrame(backup['data'])
    df = df.reindex(columns=backup['metadata']['headers'])
    
    if set_with_dataframe:
        set_with_dataframe(worksheet, df, row=2, include_column_header=False)
    else:
        for i, row in df.iterrows():
            worksheet.append_row(row.tolist())
    
    print(f"\n🎉 Restored {len(backup['data'])} rows!")
    return True

# %% [markdown]
# ## Step 10: 📤 Download Backup

# %%
def download_latest_backup():
    """Download the latest backup! 📤"""
    backups = get_backup_status()
    if not backups:
        print("❌ No backups found!")
        return
    
    filepath = backups[0]['filepath']
    
    if compat.in_colab:
        from google.colab import files
        files.download(filepath)
        csv_path = filepath.replace('.json', '.csv')
        if os.path.exists(csv_path):
            files.download(csv_path)
    else:
        print(f"📁 Backup location: {filepath}")
        print(f"📁 Open folder: {BACKUP_FOLDER}")

# %% [markdown]
# ## 🎯 Quick Menu

# %%
def show_menu():
    """Display quick action menu! 🎯"""
    print("""
╔══════════════════════════════════════════════════════════════╗
║               💾 BACKUP SYSTEM MENU                          ║
╠══════════════════════════════════════════════════════════════╣
║  get_backup_status()      - View backup dashboard   📊       ║
║  detect_changes()         - Check for changes       🔄       ║
║  create_backup()          - Create new backup       💾       ║
║  list_available_backups() - See restore points      📋       ║
║  restore_from_backup(N)   - Restore backup #N       🚀       ║
║  download_latest_backup() - Download to computer    📤       ║
╚══════════════════════════════════════════════════════════════╝
    """)

show_menu()

# %% [markdown]
# ## 🚀 Quick Start

# %%
# Run this to create a backup now!
if __name__ == "__main__":
    print("\n💡 Running in standalone mode...")
    print("💡 Commands available: create_backup(), detect_changes(), etc.")
    
    # Auto-run status check
    get_backup_status()
    
    # Prompt for action
    print("\n🤔 Would you like to create a backup now? (y/n)")
    try:
        answer = input("> ").strip().lower()
        if answer == 'y':
            create_backup()
    except (EOFError, KeyboardInterrupt):
        print("\n💡 Run create_backup() manually to create a backup!")
    except Exception as e:
        print(f"\n⚠️ Input error: {e}")
        print("💡 Run create_backup() manually to create a backup!")
