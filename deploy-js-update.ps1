# Deployment script to update cache versions and timestamps
# Run this script before deploying new changes to force cache refresh

$ErrorActionPreference = "Stop"

Write-Host "=== Texas Hold'em Poker - Deployment Update Script ===" -ForegroundColor Cyan
Write-Host ""

# Get current timestamp for version parameter
$timestamp = Get-Date -Format "yyyyMMddHHmmss"
Write-Host "New version timestamp: $timestamp" -ForegroundColor Green

# Read current service worker version
$swPath = "src\client\public\sw.js"
if (-not (Test-Path $swPath)) {
    Write-Host "✗ Service worker not found at: $swPath" -ForegroundColor Red
    exit 1
}

$swContent = Get-Content $swPath -Raw

# Extract current version and update
if ($swContent -match "const CACHE_NAME = 'poker-v([^']+)';") {
    $currentVersion = $matches[1]
    $newVersion = $timestamp
    Write-Host "Service Worker: poker-v$currentVersion -> poker-v$newVersion" -ForegroundColor Green
    
    # Update service worker cache name with timestamp
    $swContent = $swContent -replace "const CACHE_NAME = 'poker-v[^']+';", "const CACHE_NAME = 'poker-v$newVersion';"
    $swContent | Set-Content $swPath -NoNewline
    Write-Host "✓ Updated sw.js" -ForegroundColor Green
} else {
    Write-Host "✗ Could not find CACHE_NAME in sw.js" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "=== Deployment Update Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "  Service Worker Version: poker-v$newVersion" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Build the project: npm run build" -ForegroundColor White
Write-Host "  2. Test locally: npm run dev" -ForegroundColor White
Write-Host "  3. Deploy to production" -ForegroundColor White
Write-Host ""
Write-Host "Users will see an update notification when they return to the app!" -ForegroundColor Green
