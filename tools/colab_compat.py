"""
🔧 Colab Compatibility Module
=============================
Shared utilities for running Python tools both locally AND in Google Colab! 🚀

This module auto-detects the environment and provides:
- 📦 Package installation (pip vs !pip)
- 🔐 Google authentication (local credentials vs Colab auth)
- 💾 File storage paths (local folder vs Google Drive)
- 📤 File download handlers

Usage:
    from colab_compat import ColabCompat
    compat = ColabCompat()
    gc = compat.get_gspread_client()
"""

import sys
import os
import subprocess
from pathlib import Path

# Fix Windows console encoding for emojis
def safe_print(text):
    """Print with fallback for Windows console encoding issues."""
    try:
        print(text)
    except UnicodeEncodeError:
        # Remove emojis for Windows console
        import re
        clean_text = re.sub(r'[\U0001F000-\U0001F9FF\U00002700-\U000027BF]', '', text)
        print(clean_text)

# Set UTF-8 mode for Windows if possible
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except (AttributeError, Exception):
        pass  # Python < 3.7 or reconfigure not available


class ColabCompat:
    """
    🌐 Environment compatibility layer for Local + Colab execution!
    
    Automatically detects whether running in:
    - Google Colab (uses Colab auth, Drive mount)
    - Local Python (uses service account or OAuth, local folders)
    """
    
    def __init__(self, backup_folder_name="TextExpanderBackups"):
        """
        Initialize the compatibility layer! 🚀
        
        Args:
            backup_folder_name: Name of folder for backups
        """
        self.backup_folder_name = backup_folder_name
        
        # Robust Colab detection using try/except (fixes OAuth issue)
        self.in_colab = self._detect_colab()
        self.in_jupyter = 'ipykernel' in sys.modules
        
        # Set up paths based on environment
        if self.in_colab:
            self.base_path = Path("/content")
            self.drive_path = Path("/content/drive/MyDrive")
            self.backup_path = self.drive_path / backup_folder_name
        else:
            # Local: use user's home directory or current directory
            self.base_path = Path.cwd()
            self.drive_path = Path.home() / "TextExpanderBackups"
            self.backup_path = self.drive_path
        
        self._gc = None  # Cached gspread client
    
    @staticmethod
    def _detect_colab():
        """
        Reliably detect if running in Google Colab.
        
        Uses try/except import which is more reliable than checking
        sys.modules (which can fail if google.colab not imported yet).
        
        Returns:
            bool: True if running in Colab, False otherwise
        """
        try:
            import google.colab
            return True
        except ImportError:
            return False
        
    def print_environment(self):
        """Print detected environment info!"""
        env_type = "Google Colab" if self.in_colab else "Local Python"
        safe_print(f"\n{'='*50}")
        safe_print(f"Environment Detected: {env_type}")
        safe_print(f"Base Path: {self.base_path}")
        safe_print(f"Backup Path: {self.backup_path}")
        safe_print(f"Python: {sys.version.split()[0]}")
        safe_print(f"{'='*50}\n")
    
    def install_packages(self, packages: list):
        """
        Install required packages! 📦
        
        Args:
            packages: List of package names to install
        """
        packages_str = " ".join(packages)
        
        if self.in_colab:
            # In Colab, we need to use IPython magic
            from IPython import get_ipython
            get_ipython().system(f'pip install {packages_str} -q')
        else:
            # Local: use subprocess
            print(f"📦 Installing packages: {packages_str}")
            subprocess.run(
                [sys.executable, "-m", "pip", "install", *packages, "-q"],
                capture_output=True
            )
        print(f"✅ Packages ready: {packages_str}")
    
    def ensure_packages(self, additional_packages=None):
        """Ensure all required packages are installed! 📦"""
        required = [
            "gspread",
            "gspread-dataframe", 
            "pandas",
            "google-auth",
            "google-auth-oauthlib"
        ]
        
        if additional_packages:
            required.extend(additional_packages)
        
        # Check which packages need installation
        missing = []
        for pkg in required:
            pkg_name = pkg.replace("-", "_")  # Handle package name variations
            try:
                __import__(pkg_name if pkg != "gspread-dataframe" else "gspread_dataframe")
            except ImportError:
                missing.append(pkg)
        
        if missing:
            self.install_packages(missing)
        else:
            print("✅ All required packages already installed!")
    
    def authenticate(self):
        """
        Authenticate with Google! 🔐
        
        Returns:
            credentials: Google credentials object
        """
        if self.in_colab:
            return self._authenticate_colab()
        else:
            return self._authenticate_local()
    
    def _authenticate_colab(self):
        """Colab authentication using built-in auth! 🌐"""
        from google.colab import auth
        from google.auth import default
        
        print("🔐 Authenticating with Google (Colab)...")
        auth.authenticate_user()
        creds, _ = default()
        print("✅ Authentication successful!")
        return creds
    
    def _authenticate_local(self):
        """
        Local authentication using credentials file or OAuth! 💻
        
        Looks for credentials in order:
        1. SERVICE_ACCOUNT_FILE environment variable
        2. ./credentials.json (service account)
        3. ~/.config/gspread/credentials.json
        4. Interactive OAuth flow
        """
        print("🔐 Authenticating with Google (Local)...")
        
        # Option 1: Service account from environment variable
        service_account_file = os.environ.get("SERVICE_ACCOUNT_FILE")
        if service_account_file and os.path.exists(service_account_file):
            from google.oauth2.service_account import Credentials
            scopes = [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive'
            ]
            creds = Credentials.from_service_account_file(
                service_account_file, scopes=scopes
            )
            print(f"✅ Authenticated via service account: {service_account_file}")
            return creds
        
        # Option 2: Local credentials.json file
        local_creds = Path("credentials.json")
        if local_creds.exists():
            from google.oauth2.service_account import Credentials
            scopes = [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive'
            ]
            creds = Credentials.from_service_account_file(
                str(local_creds), scopes=scopes
            )
            print("✅ Authenticated via local credentials.json")
            return creds
        
        # Option 3: gspread default credentials location
        gspread_creds = Path.home() / ".config" / "gspread" / "credentials.json"
        if gspread_creds.exists():
            from google.oauth2.service_account import Credentials
            scopes = [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive'
            ]
            creds = Credentials.from_service_account_file(
                str(gspread_creds), scopes=scopes
            )
            print(f"✅ Authenticated via gspread config")
            return creds
        
        # Option 4: OAuth flow for user authentication
        # Note: This is the normal flow when running interactively!
        print("\n🔐 Starting interactive OAuth authentication...")
        print("💡 Tip: For automated/headless usage, create a service account.")
        print("   Save the JSON key as 'credentials.json' in the project folder.")
        
        try:
            import gspread
            gc = gspread.oauth()
            self._gc = gc
            print("✅ Authenticated via OAuth!")
            return None  # gspread.oauth() handles its own auth
        except Exception as e:
            print(f"\n❌ Authentication failed: {e}")
            print("\n📋 To fix this, you need to set up Google credentials:")
            print("   1. Go to https://console.cloud.google.com/")
            print("   2. Create a project and enable Sheets API + Drive API")
            print("   3. Create a Service Account and download JSON key")
            print("   4. Save as 'credentials.json' in this folder")
            print("   5. Share your spreadsheet with the service account email")
            raise
    
    def get_gspread_client(self):
        """
        Get an authenticated gspread client! 📊
        
        Returns:
            gspread.Client: Authenticated gspread client
        """
        if self._gc:
            return self._gc
        
        import gspread
        
        creds = self.authenticate()
        
        if creds:
            self._gc = gspread.authorize(creds)
        # else: _gc was set during OAuth flow
        
        return self._gc
    
    def mount_drive(self):
        """Mount Google Drive (Colab only)! 💾"""
        if self.in_colab:
            from google.colab import drive
            print("💾 Mounting Google Drive...")
            drive.mount('/content/drive')
            print("✅ Google Drive mounted!")
        else:
            print("💻 Running locally - no Drive mount needed")
            # Ensure local backup directory exists
            self.backup_path.mkdir(parents=True, exist_ok=True)
            print(f"📁 Local backup folder: {self.backup_path}")
    
    def ensure_backup_folder(self):
        """Ensure backup folder exists! 📁"""
        self.backup_path.mkdir(parents=True, exist_ok=True)
        print(f"📁 Backup folder ready: {self.backup_path}")
        return self.backup_path
    
    def download_file(self, filepath):
        """
        Download a file to the user! 📤
        
        In Colab: Triggers browser download
        Locally: Just prints the path
        """
        if self.in_colab:
            from google.colab import files
            print(f"📥 Starting download: {filepath}")
            files.download(filepath)
        else:
            filepath = Path(filepath)
            print(f"📁 File saved locally: {filepath.absolute()}")
            print(f"   Size: {filepath.stat().st_size / 1024:.2f} KB")
    
    def get_input(self, prompt):
        """
        Get user input with Colab compatibility! ⌨️
        """
        return input(prompt)
    
    def display_dataframe(self, df):
        """
        Display a DataFrame nicely! 📊
        
        In Colab/Jupyter: Rich HTML display
        Locally: Print to console
        """
        if self.in_colab or self.in_jupyter:
            from IPython.display import display
            display(df)
        else:
            print(df.to_string())


# Convenience function for quick setup
def setup_environment(backup_folder="TextExpanderBackups"):
    """
    Quick setup function! 🚀
    
    Usage:
        from colab_compat import setup_environment
        compat, gc, worksheet = setup_environment()
    """
    compat = ColabCompat(backup_folder)
    compat.print_environment()
    compat.ensure_packages()
    
    if compat.in_colab:
        compat.mount_drive()
    
    compat.ensure_backup_folder()
    gc = compat.get_gspread_client()
    
    return compat, gc


# Quick test when run directly
if __name__ == "__main__":
    print("🧪 Testing ColabCompat module...")
    compat = ColabCompat()
    compat.print_environment()
    print("✅ Module loaded successfully!")
    print("\n💡 Usage:")
    print("   from colab_compat import ColabCompat, setup_environment")
    print("   compat, gc = setup_environment()")
