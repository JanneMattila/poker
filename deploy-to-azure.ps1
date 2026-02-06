#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Deploys the GymLogger application to Azure App Service.

.DESCRIPTION
    This script builds the application, creates a deployment package, and deploys it to Azure App Service.
    Requires Azure CLI to be installed and authenticated (az login).

.PARAMETER AppName
    The name of the Azure App Service to deploy to.

.PARAMETER ResourceGroup
    The name of the Azure Resource Group containing the App Service.

.PARAMETER BuildConfiguration
    The build configuration to use (Debug or Release). Default: Release

.PARAMETER SkipBuild
    Skip the build step and use existing published files.

.PARAMETER WhatIf
    Show what would be deployed without actually deploying.

.EXAMPLE
    .\deploy-to-azure.ps1 -AppName "gymlogger" -ResourceGroup "rg-app-services"

.EXAMPLE
    .\deploy-to-azure.ps1 -AppName "gymlogger-dev" -ResourceGroup "rg-dev" -BuildConfiguration Debug

.EXAMPLE
    .\deploy-to-azure.ps1 -AppName "gymlogger" -ResourceGroup "rg-app-services" -WhatIf
#>

param(
    [Parameter(Mandatory = $false, HelpMessage = "Azure App Service name")]
    [string]$AppName = "gymlogger",
    
    [Parameter(Mandatory = $false, HelpMessage = "Azure Resource Group name")]
    [string]$ResourceGroup = "rg-app-services",
    
    [Parameter(Mandatory = $false)]
    [ValidateSet("Debug", "Release")]
    [string]$BuildConfiguration = "Release",
    
    [Parameter(Mandatory = $false)]
    [switch]$SkipBuild,
    
    [Parameter(Mandatory = $false)]
    [switch]$WhatIf
)

$ErrorActionPreference = "Stop"

# Colors for output
function Write-Step {
    param([string]$Message)
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

function Write-Info {
    param([string]$Message)
    Write-Host "  $Message" -ForegroundColor Gray
}

# Script start
Write-Host @"

╔══════════════════════════════════════════════════════════╗
║                                                          ║
║      GymLogger - Azure App Service Deployment            ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝

"@ -ForegroundColor Magenta

Write-Info "App Service: $AppName"
Write-Info "Resource Group: $ResourceGroup"
Write-Info "Configuration: $BuildConfiguration"
Write-Info "WhatIf Mode: $WhatIf"
Write-Host ""

# Check if Azure CLI is installed
Write-Step "Checking prerequisites..."
try {
    $azVersion = az version --output json 2>&1 | ConvertFrom-Json
    Write-Success "Azure CLI version $($azVersion.'azure-cli') found"
} catch {
    Write-Error "Azure CLI not found. Please install from: https://aka.ms/installazurecliwindows"
    exit 1
}

# Check if logged in to Azure
Write-Step "Checking Azure authentication..."
try {
    $account = az account show --output json 2>&1 | ConvertFrom-Json
    Write-Success "Logged in as: $($account.user.name)"
    Write-Info "Subscription: $($account.name) ($($account.id))"
} catch {
    Write-Error "Not logged in to Azure. Please run: az login"
    exit 1
}

# Verify App Service exists
Write-Step "Verifying App Service exists..."
try {
    $appService = az webapp show --name $AppName --resource-group $ResourceGroup --output json 2>&1 | ConvertFrom-Json
    Write-Success "App Service found: $($appService.defaultHostName)"
    Write-Info "Location: $($appService.location)"
    Write-Info "Plan: $($appService.appServicePlanName)"
    Write-Info "Runtime: $($appService.siteConfig.linuxFxVersion -replace 'DOTNETCORE', '.NET ')"
} catch {
    Write-Error "App Service '$AppName' not found in resource group '$ResourceGroup'"
    Write-Info "Available app services:"
    az webapp list --resource-group $ResourceGroup --query "[].name" --output table
    exit 1
}

if ($WhatIf) {
    Write-Step "WhatIf Mode - Skipping deployment"
    Write-Info "Would deploy to: https://$($appService.defaultHostName)"
    exit 0
}

# Build the application
if (-not $SkipBuild) {
    Write-Step "Building application..."
    
    # Change to project directory
    Push-Location "GymLogger"
    
    # Clean previous builds
    if (Test-Path "bin") {
        Remove-Item -Path "bin" -Recurse -Force
        Write-Info "Cleaned bin folder"
    }
    if (Test-Path "obj") {
        Remove-Item -Path "obj" -Recurse -Force
        Write-Info "Cleaned obj folder"
    }
    
    # Restore dependencies
    Write-Info "Restoring NuGet packages..."
    dotnet restore --verbosity quiet
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to restore NuGet packages"
        Pop-Location
        exit 1
    }
    
    # Build
    Write-Info "Building $BuildConfiguration configuration..."
    dotnet build --configuration $BuildConfiguration --no-restore --verbosity quiet
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed"
        Pop-Location
        exit 1
    }
    Write-Success "Build completed successfully"
    
    # Publish
    Write-Step "Publishing application..."
    $publishPath = "bin/publish"
    
    if (Test-Path $publishPath) {
        Remove-Item -Path $publishPath -Recurse -Force
    }
    
    dotnet publish --configuration $BuildConfiguration --output $publishPath --no-build --verbosity quiet
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Publish failed"
        Pop-Location
        exit 1
    }
    Write-Success "Published to: $publishPath"
    
    # Verify no database files are included
    Write-Info "Verifying database exclusion..."
    $dbFiles = Get-ChildItem -Path $publishPath -Filter "*.db" -Recurse
    if ($dbFiles) {
        Write-Error "Database files found in publish directory - these should not be deployed!"
        $dbFiles | ForEach-Object { Write-Info "  $_" }
        Pop-Location
        exit 1
    }
    Write-Success "No database files in deployment (production DB will be preserved)"
    
    # Return to original directory and update path
    Pop-Location
    $publishPath = "GymLogger/bin/publish"
} else {
    Write-Step "Skipping build (using existing files)..."
    $publishPath = "GymLogger/bin/publish"
    
    if (-not (Test-Path $publishPath)) {
        Write-Error "Published files not found at: $publishPath"
        Write-Info "Run without -SkipBuild to build the application first"
        exit 1
    }
    Write-Success "Using existing published files"
}

# Create deployment package
Write-Step "Creating deployment package..."
$zipPath = "deploy.zip"
$zipFullPath = Join-Path (Get-Location) $zipPath

if (Test-Path $zipFullPath) {
    Remove-Item -Path $zipFullPath -Force
}

# Change to publish directory and create zip
$currentLocation = Get-Location
Set-Location $publishPath

try {
    $zipDestination = Join-Path $currentLocation $zipPath
    Compress-Archive -Path ".\*" -DestinationPath $zipDestination -Force
    Write-Success "Deployment package created: $zipPath"
} catch {
    Write-Error "Failed to create deployment package: $_"
    Set-Location $currentLocation
    exit 1
}

Set-Location $currentLocation

$zipSize = (Get-Item $zipFullPath).Length / 1MB
Write-Info "Package size: $([math]::Round($zipSize, 2)) MB"

# Deploy to Azure
Write-Step "Deploying to Azure App Service..."
Write-Info "This may take a few minutes..."

try {
    # Deploy using az webapp deployment
    az webapp deploy `
        --resource-group $ResourceGroup `
        --name $AppName `
        --src-path $zipFullPath `
        --type zip `
        --async true `
        --output none
    
    if ($LASTEXITCODE -ne 0) {
        throw "Deployment command failed"
    }
    
    Write-Success "Deployment initiated successfully"
} catch {
    Write-Error "Deployment failed: $_"
    Write-Info "Check deployment logs: az webapp log tail --name $AppName --resource-group $ResourceGroup"
    exit 1
}

# Wait a moment for deployment to start
Write-Info "Waiting for deployment to process..."
Start-Sleep -Seconds 5

# Get deployment status
Write-Step "Checking deployment status..."
try {
    $deployments = az webapp log deployment list `
        --resource-group $ResourceGroup `
        --name $AppName `
        --query "[0]" `
        --output json | ConvertFrom-Json
    
    if ($deployments) {
        Write-Info "Status: $($deployments.status)"
        Write-Info "Deployed: $($deployments.received_time)"
    }
} catch {
    Write-Info "Unable to get deployment status (deployment may still be in progress)"
}

# Clean up deployment package
if (Test-Path $zipFullPath) {
    Remove-Item -Path $zipFullPath -Force
    Write-Info "Cleaned up deployment package"
}

# Final output
Write-Host @"

╔══════════════════════════════════════════════════════════╗
║                                                          ║
║              Deployment Completed! ✓                     ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝

"@ -ForegroundColor Green

Write-Host "Application URL: " -NoNewline
Write-Host "https://$($appService.defaultHostName)" -ForegroundColor Cyan

Write-Host "`nDatabase Information:" -ForegroundColor Yellow
Write-Host "  • Production database location: /home/data/gymlogger.db"
Write-Host "  • Database is NOT overwritten by deployment"
Write-Host "  • Existing data is preserved across deployments"
Write-Host "  • Migrations run automatically on app startup"

Write-Host "`nUseful commands:"
Write-Host "  View logs:     " -NoNewline
Write-Host "az webapp log tail --name $AppName --resource-group $ResourceGroup" -ForegroundColor Yellow
Write-Host "  Open in browser: " -NoNewline
Write-Host "az webapp browse --name $AppName --resource-group $ResourceGroup" -ForegroundColor Yellow
Write-Host "  SSH to container: " -NoNewline
Write-Host "az webapp ssh --name $AppName --resource-group $ResourceGroup" -ForegroundColor Yellow
Write-Host ""

# Open browser option
$openBrowser = Read-Host "Open application in browser? (y/N)"
if ($openBrowser -eq 'y' -or $openBrowser -eq 'Y') {
    az webapp browse --name $AppName --resource-group $ResourceGroup
}

Write-Success "Deployment script completed successfully!"
