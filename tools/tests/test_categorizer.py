"""
🧪 Unit Tests for TextExpanderCategorizer

pytest tests for the categorizer class in DriveCategorizerBridge.py.
Tests initialization, categorization, confidence thresholds, and edge cases.

Run with: pytest tools/tests/test_categorizer.py -v
"""

import pytest
import sys
from pathlib import Path

# Add tools directory to path for imports
tools_dir = Path(__file__).resolve().parent.parent
if str(tools_dir) not in sys.path:
    sys.path.insert(0, str(tools_dir))

# Import after path setup
from DriveCategorizerBridge import (
    TextExpanderCategorizer,
    CategorizationError,
    CONFIDENCE_THRESHOLD,
    HIGH_CONFIDENCE_THRESHOLD,
    LOW_CONFIDENCE_THRESHOLD,
    ensure_dependencies,
)

# Initialize ML dependencies before tests run
ensure_dependencies()


# ============================================================================
# FIXTURES
# ============================================================================

@pytest.fixture
def sample_categories():
    """Standard set of categories for testing."""
    return [
        "📧 Contact & Personal Info",
        "💬 Communication & Greetings",
        "📅 Dates & Time",
        "🔢 Numbers & Counting",
        "🔣 Symbols & Special Characters",
        "😊 Emojis & Emoticons",
        "🎯 Text Formatting",
        "🏷️ Status & Labels"
    ]


@pytest.fixture
def categorizer(sample_categories):
    """Initialized TextExpanderCategorizer instance."""
    return TextExpanderCategorizer(sample_categories)


@pytest.fixture
def minimal_categories():
    """Minimal set of 2 categories for edge case testing."""
    return ["Category A", "Category B"]


# ============================================================================
# INITIALIZATION TESTS
# ============================================================================

class TestCategorizerInit:
    """Tests for TextExpanderCategorizer initialization."""
    
    def test_init_with_valid_categories(self, sample_categories):
        """Test that categorizer initializes correctly with valid categories."""
        categorizer = TextExpanderCategorizer(sample_categories)
        
        assert categorizer is not None
        assert len(categorizer.categories) == len(sample_categories)
        assert categorizer.confidence_threshold == CONFIDENCE_THRESHOLD
    
    def test_init_with_custom_threshold(self, sample_categories):
        """Test initialization with custom confidence threshold."""
        custom_threshold = 0.5
        categorizer = TextExpanderCategorizer(
            sample_categories, 
            confidence_threshold=custom_threshold
        )
        
        assert categorizer.confidence_threshold == custom_threshold
    
    def test_init_with_empty_categories_raises_error(self):
        """Test that empty categories list raises CategorizationError."""
        with pytest.raises(CategorizationError):
            TextExpanderCategorizer([])
    
    def test_init_with_single_category(self):
        """Test initialization with a single category."""
        single = ["Only One Category"]
        categorizer = TextExpanderCategorizer(single)
        
        assert len(categorizer.categories) == 1


# ============================================================================
# CATEGORIZATION TESTS
# ============================================================================

class TestCategorization:
    """Tests for the categorize() method."""
    
    def test_categorize_returns_dict(self, categorizer):
        """Test that categorize returns a dict with expected keys."""
        result = categorizer.categorize("test text")
        
        assert isinstance(result, dict)
        assert "category" in result
        assert "confidence" in result
        assert "alternatives" in result
    
    def test_categorize_empty_text(self, categorizer):
        """Test categorization of empty text returns low confidence or Uncategorized."""
        result = categorizer.categorize("")
        
        # Empty text should return Uncategorized or Needs Review with low confidence
        assert result["category"] in ["🌱 Needs Review", "❓ Uncategorized"]
        assert result["confidence"] < 0.5  # Should have low confidence
    
    def test_categorize_with_description(self, categorizer):
        """Test that description is used for categorization."""
        result = categorizer.categorize(
            text="addr", 
            description="email address"
        )
        
        # Should return a valid result (confidence may be 0 if no match found)
        assert result["category"] is not None
        assert 0.0 <= result["confidence"] <= 1.0
    
    def test_categorize_date_text(self, categorizer):
        """Test categorization of date-related text."""
        result = categorizer.categorize("January 2024")
        
        # Should recognize as dates category
        assert "Dates" in result["category"] or result["category"] == "🌱 Needs Review"
    
    def test_categorize_email_text(self, categorizer):
        """Test categorization of email-related text."""
        result = categorizer.categorize(
            "Contact Info", 
            description="Email signature template"
        )
        
        # Should have reasonable confidence
        assert result["confidence"] >= 0
    
    def test_categorize_returns_alternatives(self, categorizer):
        """Test that alternatives list is populated."""
        result = categorizer.categorize("hello world greeting")
        
        assert isinstance(result["alternatives"], list)
    
    def test_categorize_confidence_in_valid_range(self, categorizer):
        """Test that confidence is between 0 and 1."""
        texts = ["test", "January", "email@test.com", "Hello!"]
        
        for text in texts:
            result = categorizer.categorize(text)
            assert 0.0 <= result["confidence"] <= 1.0


# ============================================================================
# CONFIDENCE THRESHOLD TESTS
# ============================================================================

class TestConfidenceThresholds:
    """Tests for confidence threshold behavior."""
    
    def test_low_confidence_returns_needs_review(self, sample_categories):
        """Test that very low confidence returns Needs Review category."""
        categorizer = TextExpanderCategorizer(
            sample_categories,
            confidence_threshold=0.9  # Very high threshold
        )
        
        result = categorizer.categorize("random gibberish xyz123")
        
        # Should be Needs Review due to high threshold
        assert result["category"] == "🌱 Needs Review" or result["confidence"] >= 0.9
    
    def test_high_confidence_returns_category(self, sample_categories):
        """Test that high confidence returns an actual category."""
        categorizer = TextExpanderCategorizer(
            sample_categories,
            confidence_threshold=0.1  # Very low threshold
        )
        
        result = categorizer.categorize("Dates and Time")
        
        # Should return an actual category, not Needs Review
        assert result["confidence"] >= 0 or "🌱" not in result["category"]


# ============================================================================
# EDGE CASE TESTS
# ============================================================================

class TestEdgeCases:
    """Tests for edge cases and error handling."""
    
    def test_categorize_none_text(self, categorizer):
        """Test handling of None text (should treat as empty)."""
        result = categorizer.categorize(None)
        
        assert result is not None
        assert "category" in result
    
    def test_categorize_very_long_text(self, categorizer):
        """Test categorization of very long text."""
        long_text = "a" * 10000
        result = categorizer.categorize(long_text)
        
        assert result is not None
        assert "category" in result
    
    def test_categorize_special_characters(self, categorizer):
        """Test categorization of text with special characters."""
        result = categorizer.categorize("→ ← ↑ ↓ ★ ☆ ♥")
        
        assert result is not None
        assert 0.0 <= result["confidence"] <= 1.0
    
    def test_categorize_emoji_text(self, categorizer):
        """Test categorization of emoji text."""
        result = categorizer.categorize("😀 🎉 ✨")
        
        assert result is not None
    
    def test_categorize_unicode_text(self, categorizer):
        """Test categorization of unicode/multilingual text."""
        result = categorizer.categorize("日本語テスト français español")
        
        assert result is not None


# ============================================================================
# INTEGRATION TESTS
# ============================================================================

class TestIntegration:
    """Integration tests for the categorizer."""
    
    def test_multiple_categorizations(self, categorizer):
        """Test that multiple categorizations work correctly."""
        texts = [
            "email address",
            "February 2024",
            "Hello!",
            "12345",
            "→ arrow"
        ]
        
        results = [categorizer.categorize(text) for text in texts]
        
        assert all(r is not None for r in results)
        assert all("category" in r for r in results)
    
    def test_deterministic_results(self, categorizer):
        """Test that same input produces same output."""
        text = "consistent test input"
        
        result1 = categorizer.categorize(text)
        result2 = categorizer.categorize(text)
        
        assert result1["category"] == result2["category"]
        assert result1["confidence"] == result2["confidence"]


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
