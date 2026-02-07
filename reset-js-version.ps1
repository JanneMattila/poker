# Reset script to set cache versions to a fixed timestamp
# Run this script before committing code to avoid version timestamp diffs in git history

$ErrorActionPreference = "Stop"

Write-Host "=== Texas Hold'em Poker - Version Reset Script ===" -ForegroundColor Cyan
Write-Host ""

# Fixed timestamp for version control
$fixedTimestamp = "00000000000000"
Write-Host "Resetting to fixed version: $fixedTimestamp" -ForegroundColor Green

# Reset service worker version
$swPath = "src\client\public\sw.js"
if (-not (Test-Path $swPath)) {
    Write-Host "✗ Service worker not found at: $swPath" -ForegroundColor Red
    exit 1
}

$swContent = Get-Content $swPath -Raw

# Extract current version
if ($swContent -match "const CACHE_NAME = 'poker-v([^']+)';") {
    $currentVersion = $matches[1]
    Write-Host "Service Worker: poker-v$currentVersion -> poker-v$fixedTimestamp" -ForegroundColor Green
    
    # Update service worker cache name with fixed timestamp
    $swContent = $swContent -replace "const CACHE_NAME = 'poker-v[^']+';", "const CACHE_NAME = 'poker-v$fixedTimestamp';"
    $swContent | Set-Content $swPath -NoNewline
    Write-Host "✓ Reset sw.js" -ForegroundColor Green
} else {
    Write-Host "✗ Could not find CACHE_NAME in sw.js" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Version Reset Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "  Service Worker Version: poker-v$fixedTimestamp" -ForegroundColor White
Write-Host ""
Write-Host "Ready to commit!" -ForegroundColor Green
Write-Host ""
Write-Host "Note: Run .\deploy-js-update.ps1 before deployment to set proper versions" -ForegroundColor Yellow
Write-Host ""
