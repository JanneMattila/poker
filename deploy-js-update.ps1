# Deployment script to update cache versions and timestamps
# Run this script before deploying new changes to force cache refresh

$ErrorActionPreference = "Stop"

Write-Host "=== Gym Logger Deployment Update Script ===" -ForegroundColor Cyan
Write-Host ""

# Get current timestamp for version parameter
$timestamp = Get-Date -Format "yyyyMMddHHmmss"
Write-Host "New version timestamp: $timestamp" -ForegroundColor Green

# Read current service worker version
$swPath = "GymLogger\wwwroot\service-worker.js"
$swContent = Get-Content $swPath -Raw

# Extract current version
if ($swContent -match "const CACHE_VERSION = 'v([^']+)';") {
    $currentVersion = $matches[1]
    $newVersion = $timestamp
    Write-Host "Service Worker: v$currentVersion -> v$newVersion" -ForegroundColor Green
    
    # Update service worker version with timestamp
    $swContent = $swContent -replace "const CACHE_VERSION = 'v[^']+';", "const CACHE_VERSION = 'v$newVersion';"
    $swContent | Set-Content $swPath -NoNewline
    Write-Host "✓ Updated service-worker.js" -ForegroundColor Green
} else {
    Write-Host "✗ Could not find CACHE_VERSION in service-worker.js" -ForegroundColor Red
    exit 1
}

# Update version parameters in HTML files
Write-Host ""
Write-Host "Updating version parameters..." -ForegroundColor Cyan

$htmlFiles = Get-ChildItem "GymLogger\wwwroot" -Filter "*.html" -Recurse
foreach ($file in $htmlFiles) {
    $content = Get-Content $file.FullName -Raw
    $updated = $content -replace '\?v=\d+', "?v=$timestamp"
    if ($content -ne $updated) {
        $updated | Set-Content $file.FullName -NoNewline
        Write-Host "✓ Updated $($file.Name)" -ForegroundColor Green
    }
}

# Update version parameters in JS files
$jsFiles = Get-ChildItem "GymLogger\wwwroot\js" -Filter "*.js" -Recurse
foreach ($file in $jsFiles) {
    $content = Get-Content $file.FullName -Raw
    $updated = $content -replace '\?v=\d+', "?v=$timestamp"
    if ($content -ne $updated) {
        $updated | Set-Content $file.FullName -NoNewline
        Write-Host "✓ Updated $($file.Name)" -ForegroundColor Green
    }
}

# Update CSS references
$cssFiles = Get-ChildItem "GymLogger\wwwroot\css" -Filter "*.css" -Recurse -ErrorAction SilentlyContinue
foreach ($file in $cssFiles) {
    $content = Get-Content $file.FullName -Raw
    $updated = $content -replace '\?v=\d+', "?v=$timestamp"
    if ($content -ne $updated) {
        $updated | Set-Content $file.FullName -NoNewline
        Write-Host "✓ Updated $($file.Name)" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "=== Deployment Update Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "  Service Worker Version: v$newVersion" -ForegroundColor White
Write-Host "  Asset Version: $timestamp" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Build the project: dotnet build" -ForegroundColor White
Write-Host "  2. Test locally: dotnet run" -ForegroundColor White
Write-Host "  3. Deploy to production" -ForegroundColor White
Write-Host ""
Write-Host "Users will see an update notification when they return to the app!" -ForegroundColor Green
