#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Deploys the Texas Hold'em Poker application to Azure App Service.

.DESCRIPTION
    This script builds the Node.js application, creates a deployment package, and deploys it to Azure App Service.
    Requires Azure CLI to be installed and authenticated (az login).

.PARAMETER AppName
    The name of the Azure App Service to deploy to.

.PARAMETER ResourceGroup
    The name of the Azure Resource Group containing the App Service.

.PARAMETER SkipBuild
    Skip the build step and use existing dist files.

.PARAMETER WhatIf
    Show what would be deployed without actually deploying.

.EXAMPLE
    .\deploy-to-azure.ps1 -AppName "poker-app" -ResourceGroup "rg-poker"

.EXAMPLE
    .\deploy-to-azure.ps1 -AppName "poker-dev" -ResourceGroup "rg-dev" -SkipBuild

.EXAMPLE
    .\deploy-to-azure.ps1 -AppName "poker-app" -ResourceGroup "rg-poker" -WhatIf
#>

param(
    [Parameter(Mandatory = $false, HelpMessage = "Azure App Service name")]
    [string]$AppName = "poker-app",
    
    [Parameter(Mandatory = $false, HelpMessage = "Azure Resource Group name")]
    [string]$ResourceGroup = "rg-poker",
    
    [Parameter(Mandatory = $false)]
    [switch]$SkipBuild,
    
    [Parameter(Mandatory = $false)]
    [switch]$WhatIf,
    
    [Parameter(Mandatory = $false, HelpMessage = "Skip interactive prompts (for CI/CD)")]
    [switch]$NonInteractive
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
║      Texas Hold'em Poker - Azure Deployment              ║
║                                                          ║
╚══════════════════════════════════════════════════════════╝

"@ -ForegroundColor Magenta

Write-Info "App Service: $AppName"
Write-Info "Resource Group: $ResourceGroup"
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

# Check if Node.js is installed
try {
    $nodeVersion = node --version
    Write-Success "Node.js $nodeVersion found"
} catch {
    Write-Error "Node.js not found. Please install from: https://nodejs.org/"
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

# Install dependencies and build
if (-not $SkipBuild) {
    Write-Step "Installing dependencies..."
    npm ci --silent
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to install dependencies"
        exit 1
    }
    Write-Success "Dependencies installed"
    
    Write-Step "Building application..."
    
    # Clean previous builds
    if (Test-Path "dist") {
        Remove-Item -Path "dist" -Recurse -Force
        Write-Info "Cleaned dist folder"
    }
    
    # Build client with Vite
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Build failed"
        exit 1
    }
    Write-Success "Client build completed"
} else {
    Write-Step "Skipping build (using existing files)..."
    
    if (-not (Test-Path "dist")) {
        Write-Error "dist folder not found. Run without -SkipBuild to build the application first"
        exit 1
    }
    Write-Success "Using existing build files"
}

# Create deployment package
Write-Step "Creating deployment package..."
$zipPath = "deploy.zip"
$zipFullPath = Join-Path (Get-Location) $zipPath

if (Test-Path $zipFullPath) {
    Remove-Item -Path $zipFullPath -Force
}

# Create a temporary staging folder with only needed files
$stagingPath = Join-Path (Get-Location) ".deploy-staging"
if (Test-Path $stagingPath) {
    Remove-Item -Path $stagingPath -Recurse -Force
}
New-Item -ItemType Directory -Path $stagingPath | Out-Null

# Copy required files
Copy-Item -Path "dist" -Destination "$stagingPath\dist" -Recurse
Copy-Item -Path "src\server" -Destination "$stagingPath\src\server" -Recurse
Copy-Item -Path "src\shared" -Destination "$stagingPath\src\shared" -Recurse
Copy-Item -Path "package.json" -Destination "$stagingPath\package.json"
Copy-Item -Path "package-lock.json" -Destination "$stagingPath\package-lock.json" -ErrorAction SilentlyContinue

# Create production startup script
Write-Info "Staging folder created"

# Create zip from staging
try {
    Compress-Archive -Path "$stagingPath\*" -DestinationPath $zipFullPath -Force
    Write-Success "Deployment package created: $zipPath"
} catch {
    Write-Error "Failed to create deployment package: $_"
    Remove-Item -Path $stagingPath -Recurse -Force -ErrorAction SilentlyContinue
    exit 1
}

# Clean up staging
Remove-Item -Path $stagingPath -Recurse -Force

$zipSize = (Get-Item $zipFullPath).Length / 1MB
Write-Info "Package size: $([math]::Round($zipSize, 2)) MB"

# Deploy to Azure
Write-Step "Deploying to Azure App Service..."
Write-Info "This may take a few minutes..."

try {
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

# Wait for deployment to start
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

Write-Host "`nUseful commands:"
Write-Host "  View logs:       " -NoNewline
Write-Host "az webapp log tail --name $AppName --resource-group $ResourceGroup" -ForegroundColor Yellow
Write-Host "  Open in browser: " -NoNewline
Write-Host "az webapp browse --name $AppName --resource-group $ResourceGroup" -ForegroundColor Yellow
Write-Host "  SSH to container:" -NoNewline
Write-Host "az webapp ssh --name $AppName --resource-group $ResourceGroup" -ForegroundColor Yellow
Write-Host ""

# Open browser option
if (-not $NonInteractive) {
    $openBrowser = Read-Host "Open application in browser? (y/N)"
    if ($openBrowser -eq 'y' -or $openBrowser -eq 'Y') {
        az webapp browse --name $AppName --resource-group $ResourceGroup
    }
}

Write-Success "Deployment script completed successfully!"
