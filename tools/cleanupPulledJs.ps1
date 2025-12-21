#!/usr/bin/env pwsh
# cleanupPulledJs.ps1
# Removes duplicate .js files from src\ directory
# Run ONLY if clasp pull creates unwanted .js files alongside .gs files

Write-Host "=== Clasp Duplicate .js File Cleanup ===" -ForegroundColor Cyan
Write-Host ""

$srcDir = Join-Path $PSScriptRoot "..\src"
$jsFiles = Get-ChildItem -Path $srcDir -Filter "*.js" -File -ErrorAction SilentlyContinue

if ($jsFiles.Count -eq 0) {
    Write-Host "No .js files found in src\ - nothing to clean" -ForegroundColor Green
    exit 0
}

Write-Host "Found $($jsFiles.Count) .js file(s) to remove:" -ForegroundColor Yellow
$jsFiles | ForEach-Object { Write-Host "  - $($_.Name)" }

$confirm = Read-Host "`nDelete these files? (y/N)"
if ($confirm -ne 'y') {
    Write-Host "Cancelled" -ForegroundColor Red
    exit 1
}

$jsFiles | ForEach-Object {
    Remove-Item $_.FullName -Force
    Write-Host "  Removed $($_.Name)" -ForegroundColor Green
}

Write-Host "`nCleanup complete!" -ForegroundColor Green
