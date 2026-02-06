# Reset script to set cache versions to a fixed timestamp
# Run this script before committing code to avoid version timestamp diffs in git history

$ErrorActionPreference = "Stop"

Write-Host "=== Gym Logger Version Reset Script ===" -ForegroundColor Cyan
Write-Host ""

# Fixed timestamp for version control
$fixedTimestamp = "00000000000000"
Write-Host "Resetting to fixed version: $fixedTimestamp" -ForegroundColor Green

# Reset service worker version
$swPath = "GymLogger\wwwroot\service-worker.js"
$swContent = Get-Content $swPath -Raw

# Extract current version
if ($swContent -match "const CACHE_VERSION = 'v([^']+)';") {
    $currentVersion = $matches[1]
    Write-Host "Service Worker: v$currentVersion -> v$fixedTimestamp" -ForegroundColor Green
    
    # Update service worker version with fixed timestamp
    $swContent = $swContent -replace "const CACHE_VERSION = 'v[^']+';", "const CACHE_VERSION = 'v$fixedTimestamp';"
    $swContent | Set-Content $swPath -NoNewline
    Write-Host "✓ Reset service-worker.js" -ForegroundColor Green
} else {
    Write-Host "✗ Could not find CACHE_VERSION in service-worker.js" -ForegroundColor Red
    exit 1
}

# Reset version parameters in HTML files
Write-Host ""
Write-Host "Resetting version parameters..." -ForegroundColor Cyan

$htmlFiles = Get-ChildItem "GymLogger\wwwroot" -Filter "*.html" -Recurse
foreach ($file in $htmlFiles) {
    $content = Get-Content $file.FullName -Raw
    $updated = $content -replace '\?v=\d+', "?v=$fixedTimestamp"
    if ($content -ne $updated) {
        $updated | Set-Content $file.FullName -NoNewline
        Write-Host "✓ Reset $($file.Name)" -ForegroundColor Green
    }
}

# Reset version parameters in JS files
$jsFiles = Get-ChildItem "GymLogger\wwwroot\js" -Filter "*.js" -Recurse
foreach ($file in $jsFiles) {
    $content = Get-Content $file.FullName -Raw
    $updated = $content -replace '\?v=\d+', "?v=$fixedTimestamp"
    if ($content -ne $updated) {
        $updated | Set-Content $file.FullName -NoNewline
        Write-Host "✓ Reset $($file.Name)" -ForegroundColor Green
    }
}

# Reset CSS references
$cssFiles = Get-ChildItem "GymLogger\wwwroot\css" -Filter "*.css" -Recurse -ErrorAction SilentlyContinue
foreach ($file in $cssFiles) {
    $content = Get-Content $file.FullName -Raw
    $updated = $content -replace '\?v=\d+', "?v=$fixedTimestamp"
    if ($content -ne $updated) {
        $updated | Set-Content $file.FullName -NoNewline
        Write-Host "✓ Reset $($file.Name)" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "=== Version Reset Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Summary:" -ForegroundColor Yellow
Write-Host "  Service Worker Version: v$fixedTimestamp" -ForegroundColor White
Write-Host "  Asset Version: $fixedTimestamp" -ForegroundColor White
Write-Host ""
Write-Host "Ready to commit!" -ForegroundColor Green
Write-Host ""
Write-Host "Note: Run .\deploy-js-update.ps1 before deployment to set proper versions" -ForegroundColor Yellow
Write-Host ""
