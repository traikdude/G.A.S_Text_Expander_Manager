#!/usr/bin/env python3
"""
Font-Aware Text Expander Categorizer v2.0
Extracts font metadata, categorizes text expanders using NLP,
and syncs data across Google Sheets.
"""

import re
import json
import sys
from pathlib import Path
from typing import Dict, List, Tuple, Any, Optional
from collections import defaultdict
import logging

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

try:
    import pandas as pd
    import numpy as np
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.metrics.pairwise import cosine_similarity
    import nltk
    from nltk.corpus import stopwords
    from nltk.tokenize import word_tokenize
except ImportError as e:
    safe_print(f"❌ Missing dependency: {e}")
    safe_print("📦 Install with: pip install pandas numpy scikit-learn nltk")
    sys.exit(1)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Download NLTK data (one-time setup)
def ensure_nltk_data():
    """Download required NLTK data packages - compatible with all NLTK versions."""
    resources = [
        ('tokenizers/punkt_tab', 'punkt_tab'),  # NLTK 3.8+
        ('tokenizers/punkt', 'punkt'),           # Legacy fallback
        ('corpora/stopwords', 'stopwords'),
    ]
    
    for resource_path, package_name in resources:
        try:
            nltk.data.find(resource_path)
        except LookupError:
            logger.info(f"📥 Downloading NLTK {package_name}...")
            try:
                nltk.download(package_name, quiet=True)
            except Exception as e:
                logger.warning(f"⚠️ Could not download {package_name}: {e}")

# Initialize NLTK data at module load
ensure_nltk_data()


class FontExtractionError(Exception):
    """Custom exception for font extraction failures"""
    pass


class FontAwareCategorizer:
    """
    Main categorizer class that handles font extraction,
    NLP-based categorization, and data synchronization.
    """
    
    # Category mapping with expanded font support
    CATEGORY_MAPPING = {
        'dates': {
            'keywords': ['date', 'time', 'calendar', 'month', 'year', 'day'],
            'fonts': ['SF Mono', 'Courier', 'Consolas', 'Monaco'],
            'patterns': [r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}', r'\d{4}-\d{2}-\d{2}']
        },
        'numbers': {
            'keywords': ['number', 'digit', 'numeric', 'count', 'quantity'],
            'fonts': ['Arial', 'Helvetica', 'SF Pro'],
            'patterns': [r'\d+', r'[0-9]+']
        },
        'symbols': {
            'keywords': ['symbol', 'icon', 'special', 'character'],
            'fonts': ['Symbol', 'Wingdings', 'Webdings'],
            'patterns': [r'[^\w\s]']
        },
        'kaomoji': {
            'keywords': ['emoticon', 'kaomoji', 'emoji', 'face', 'expression'],
            'fonts': ['Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji'],
            'patterns': [r'[\^\-\*]_[\^\-\*]', r'\([\^o\-\*]_[\^o\-\*]\)']
        },
        'email': {
            'keywords': ['email', 'mail', 'contact', 'address'],
            'fonts': ['Helvetica', 'Arial', 'SF Pro'],
            'patterns': [r'[\w\.-]+@[\w\.-]+\.\w+']
        },
        'zodiac': {
            'keywords': ['zodiac', 'astrology', 'sign', 'horoscope'],
            'fonts': ['Zapf Dingbats', 'Arial Unicode MS'],
            'patterns': [r'♈|♉|♊|♋|♌|♍|♎|♏|♐|♑|♒|♓']
        },
        'greetings': {
            'keywords': ['hello', 'hi', 'greeting', 'welcome', 'goodbye'],
            'fonts': ['SF Pro', 'Helvetica', 'Arial'],
            'patterns': [r'\bhello\b', r'\bhi\b', r'\bhey\b']
        },
        'general': {
            'keywords': ['text', 'general', 'common', 'default'],
            'fonts': ['SF Pro Text', 'Helvetica Neue', 'Arial'],
            'patterns': []
        }
    }
    
    def __init__(self, data: pd.DataFrame):
        """
        Initialize the categorizer with input data.
        
        Args:
            data: DataFrame with text expander entries
        """
        self.data = data
        self.stop_words = set(stopwords.words('english'))
        self.vectorizer = TfidfVectorizer(
            max_features=100,
            stop_words='english',
            ngram_range=(1, 2)
        )
        
    def extract_font_metadata(self, entry: str) -> Dict[str, Any]:
        """
        Extract complete font information from a text expander entry.
        
        This method parses various font notation formats commonly found
        in Shortcuts app exports and iOS text replacement data.
        
        Args:
            entry: Raw text expander string that may contain font metadata
            
        Returns:
            Dictionary containing:
                - text_expander: The actual text content
                - font_name: Extracted font name or 'Default'
                - font_size: Font size if available
                - font_style: Style attributes (bold, italic, etc.)
                - confidence: Confidence score of extraction (0-1)
                
        Raises:
            FontExtractionError: If entry format is completely unrecognizable
        """
        try:
            result = {
                'text_expander': '',
                'font_name': 'Default',
                'font_size': None,
                'font_style': [],
                'confidence': 0.0
            }
            
            if not entry or not isinstance(entry, str):
                raise FontExtractionError("Invalid entry: must be non-empty string")
            
            # Pattern 1: iOS Shortcuts format - {font:"FontName", text:"content"}
            ios_pattern = r'\{font:\s*"([^"]+)".*?text:\s*"([^"]+)"\}'
            match = re.search(ios_pattern, entry)
            if match:
                result['font_name'] = match.group(1)
                result['text_expander'] = match.group(2)
                result['confidence'] = 0.95
                logger.debug(f"✅ Extracted iOS format: {result['font_name']}")
                return result
            
            # Pattern 2: HTML/CSS format - <span style="font-family:FontName">content</span>
            html_pattern = r'<span[^>]*font-family:\s*([^;"]+)[^>]*>([^<]+)</span>'
            match = re.search(html_pattern, entry)
            if match:
                result['font_name'] = match.group(1).strip()
                result['text_expander'] = match.group(2)
                result['confidence'] = 0.90
                logger.debug(f"✅ Extracted HTML format: {result['font_name']}")
                return result
            
            # Pattern 3: Markdown-style annotation - [FontName]text
            markdown_pattern = r'\[([^\]]+)\](.+)'
            match = re.search(markdown_pattern, entry)
            if match:
                potential_font = match.group(1)
                if self._is_valid_font_name(potential_font):
                    result['font_name'] = potential_font
                    result['text_expander'] = match.group(2)
                    result['confidence'] = 0.75
                    logger.debug(f"✅ Extracted Markdown format: {result['font_name']}")
                    return result
            
            # Pattern 4: Plain text with font hints in content
            result['text_expander'] = entry
            result['font_name'] = self._infer_font_from_content(entry)
            result['confidence'] = 0.50
            logger.debug(f"🔍 Inferred font from content: {result['font_name']}")
            
            return result
            
        except Exception as e:
            logger.error(f"❌ Font extraction failed for entry: {str(e)}")
            raise FontExtractionError(f"Could not extract font metadata: {str(e)}")
    
    def _is_valid_font_name(self, name: str) -> bool:
        """
        Validate if a string is likely a font name.
        
        Args:
            name: Potential font name
            
        Returns:
            True if name matches known font patterns
        """
        known_fonts = [
            'SF Pro', 'Helvetica', 'Arial', 'Times', 'Courier', 
            'Monaco', 'Verdana', 'Georgia', 'Comic Sans', 'Impact',
            'Symbol', 'Wingdings', 'Webdings', 'Zapf Dingbats',
            'Apple Color Emoji', 'Segoe UI Emoji', 'Noto'
        ]
        return any(font in name for font in known_fonts)
    
    def _infer_font_from_content(self, text: str) -> str:
        """
        Infer likely font based on content characteristics.
        
        Args:
            text: Text content to analyze
            
        Returns:
            Best-guess font name
        """
        # Check for emoji/special characters
        if re.search(r'[\U0001F300-\U0001F9FF]', text):
            return 'Apple Color Emoji'
        
        # Check for monospace indicators
        if re.search(r'[`|_]{2,}', text):
            return 'SF Mono'
        
        # Check for symbol-heavy content
        if len(re.findall(r'[^\w\s]', text)) / max(len(text), 1) > 0.3:
            return 'Symbol'
        
        # Default to system font
        return 'SF Pro Text'
    
    def categorize_by_font(self, font_name: str, text_content: str) -> Tuple[str, str, float]:
        """
        Categorize text expander based on font and content using NLP.
        
        Args:
            font_name: Extracted font name
            text_content: The actual text expander content
            
        Returns:
            Tuple of (main_category, subcategory, confidence_score)
        """
        max_score = 0.0
        best_category = 'general'
        best_subcategory = 'text'
        
        # Normalize inputs
        font_lower = font_name.lower()
        text_lower = text_content.lower()
        
        # Score each category
        for category, rules in self.CATEGORY_MAPPING.items():
            score = 0.0
            
            # Font matching (30% weight)
            for font_pattern in rules['fonts']:
                if font_pattern.lower() in font_lower:
                    score += 0.30
                    break
            
            # Keyword matching (40% weight)
            tokens = word_tokenize(text_lower) if text_lower.strip() else []
            keyword_matches = sum(1 for token in tokens if token in rules['keywords'])
            if keyword_matches > 0:
                score += 0.40 * (keyword_matches / len(rules['keywords']))
            
            # Pattern matching (30% weight)
            pattern_matches = sum(1 for pattern in rules['patterns'] if re.search(pattern, text_content))
            if pattern_matches > 0:
                score += 0.30
            
            # Update best match
            if score > max_score:
                max_score = score
                best_category = category
                best_subcategory = self._determine_subcategory(category, text_content)
        
        logger.debug(f"📊 Categorized '{text_content[:30]}...' as {best_category}/{best_subcategory} (score: {max_score:.2f})")
        return best_category, best_subcategory, max_score
    
    def _determine_subcategory(self, main_category: str, text: str) -> str:
        """
        Determine subcategory within a main category.
        
        Args:
            main_category: The main category assigned
            text: Text content for analysis
            
        Returns:
            Subcategory string
        """
        subcategory_rules = {
            'dates': {
                'full_date': r'\d{1,2}[/-]\d{1,2}[/-]\d{4}',
                'short_date': r'\d{1,2}[/-]\d{1,2}',
                'time': r'\d{1,2}:\d{2}',
                'general': r'.*'
            },
            'numbers': {
                'integer': r'^\d+$',
                'decimal': r'\d+\.\d+',
                'ordinal': r'\d+(st|nd|rd|th)',
                'general': r'.*'
            },
            'symbols': {
                'punctuation': r'[.,!?;:]',
                'math': r'[+\-*/=<>]',
                'currency': r'[$€£¥]',
                'general': r'.*'
            }
        }
        
        if main_category not in subcategory_rules:
            return 'standard'
        
        for subcat, pattern in subcategory_rules[main_category].items():
            if re.search(pattern, text):
                return subcat
        
        return 'standard'
    
    def process_shortcuts_sheet(self, shortcuts_data: pd.DataFrame) -> pd.DataFrame:
        """
        Process the Shortcuts sheet to extract fonts and categorize entries.
        
        Args:
            shortcuts_data: DataFrame from the Shortcuts sheet
            
        Returns:
            Enhanced DataFrame with font metadata and categories
        """
        logger.info("🚀 Processing Shortcuts sheet...")
        
        results = []
        total_rows = len(shortcuts_data)
        
        for idx, row in shortcuts_data.iterrows():
            try:
                # Extract original shortcut value (adjust column name as needed)
                raw_entry = str(row.get('Shortcut', row.get('Text', row.get('Content', ''))))
                
                # Extract font metadata
                font_data = self.extract_font_metadata(raw_entry)
                
                # Categorize based on font and content
                main_cat, sub_cat, confidence = self.categorize_by_font(
                    font_data['font_name'],
                    font_data['text_expander']
                )
                
                # Build result row
                result_row = {
                    'Original_Entry': raw_entry,
                    'Text_Expander': font_data['text_expander'],
                    'Font_Name': font_data['font_name'],
                    'Font_Size': font_data.get('font_size'),
                    'Main_Category': main_cat.title(),
                    'Subcategory': sub_cat.title(),
                    'Confidence_Score': round(confidence, 3),
                    'Extraction_Confidence': round(font_data['confidence'], 3)
                }
                
                results.append(result_row)
                
                if (idx + 1) % 100 == 0:
                    logger.info(f"📈 Processed {idx + 1}/{total_rows} rows...")
                    
            except Exception as e:
                logger.error(f"❌ Error processing row {idx}: {str(e)}")
                # Use locals() to check if raw_entry was defined before the error
                entry_value = raw_entry if 'raw_entry' in locals() else ''
                results.append({
                    'Original_Entry': entry_value,
                    'Text_Expander': entry_value,
                    'Font_Name': 'Error',
                    'Font_Size': None,
                    'Main_Category': 'General',
                    'Subcategory': 'Text',
                    'Confidence_Score': 0.0,
                    'Extraction_Confidence': 0.0
                })
        
        logger.info(f"✅ Completed processing {len(results)} entries")
        return pd.DataFrame(results)
    
    def synchronize_sheets(self, 
                          main_sheet: pd.DataFrame, 
                          categorized_data: pd.DataFrame) -> pd.DataFrame:
        """
        Synchronize categorized data back to the main sheet.
        
        Args:
            main_sheet: Original main sheet data
            categorized_data: Newly categorized data with font info
            
        Returns:
            Synchronized DataFrame ready for Google Sheets update
        """
        logger.info("🔄 Synchronizing data across sheets...")
        
        # Merge based on text content
        synchronized = main_sheet.merge(
            categorized_data[['Text_Expander', 'Font_Name', 'Main_Category', 'Subcategory']],
            left_on='Shortcut',
            right_on='Text_Expander',
            how='left',
            suffixes=('_old', '')
        )
        
        # Fill missing values
        synchronized['Font_Name'] = synchronized['Font_Name'].fillna('Default')
        synchronized['Main_Category'] = synchronized['Main_Category'].fillna('General')
        synchronized['Subcategory'] = synchronized['Subcategory'].fillna('Text')
        
        # Remove old duplicate columns
        cols_to_drop = [col for col in synchronized.columns if col.endswith('_old')]
        synchronized.drop(columns=cols_to_drop, inplace=True)
        
        logger.info(f"✅ Synchronized {len(synchronized)} rows")
        return synchronized


class FontCategorizerError(Exception):
    """Base exception for FontCategorizer"""
    pass


def main():
    """
    Main execution function - demonstrates usage.
    """
    try:
        # Example usage with dummy data
        sample_data = pd.DataFrame({
            'Shortcut': [
                '{font:"SF Mono", text:"2024-01-15"}',
                '[Arial]Hello World',
                '<span style="font-family:Symbol">★★★</span>',
                '(^_^)',
                'test@example.com'
            ]
        })
        
        logger.info("🎯 Starting Font-Aware Categorizer...")
        categorizer = FontAwareCategorizer(sample_data)
        
        # Process shortcuts
        result = categorizer.process_shortcuts_sheet(sample_data)
        
        # Display results
        safe_print("\n📊 CATEGORIZATION RESULTS:")
        safe_print("=" * 80)
        safe_print(result.to_string(index=False))
        safe_print("=" * 80)
        
        # Export to CSV
        output_file = 'categorized_text_expanders.csv'
        result.to_csv(output_file, index=False)
        logger.info(f"💾 Results saved to {output_file}")
        
        return 0
        
    except Exception as e:
        logger.error(f"💥 Fatal error: {str(e)}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
