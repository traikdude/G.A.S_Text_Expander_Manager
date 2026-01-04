# Known Issues

## Colab OAuth Authentication Error (2026-01-04)

**Status:** To be investigated

**Issue:** When running the Colab notebooks from the custom menu, users encounter an OAuth flow error:
```
no service account found, starting OAuth flow...
```

**Context:**
- All 7 Python tools redirect correctly to GitHub-hosted Colab notebooks
- The error occurs during authentication setup in the notebooks
- Likely related to the `colab_compat.py` authentication configuration

**Next Steps:**
1. Review `tools/colab_compat.py` authentication setup
2. Verify service account credentials configuration
3. Test the OAuth flow in a fresh Colab session
4. Update documentation with proper authentication steps

**Related Files:**
- `tools/colab_compat.py`
- `tools/HOW_TO_RUN_IN_COLAB.md`
- All notebooks in `/notebooks` directory
