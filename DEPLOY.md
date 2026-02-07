# Deployment Guide

## Azure App Service Configuration

### Required App Settings

Set these environment variables on the App Service to enable automatic dependency installation during zip deployment:

| Setting                          | Value                    | Purpose                                   |
| -------------------------------- | ------------------------ | ----------------------------------------- |
| `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true`                   | Triggers Oryx build during zip deployment |
| `CUSTOM_BUILD_COMMAND`           | `npm install --omit=dev` | Installs only production dependencies     |

You can set these via Azure CLI:

```bash
az webapp config appsettings set \
  --name <app-name> \
  --resource-group <resource-group> \
  --settings \
    SCM_DO_BUILD_DURING_DEPLOYMENT=true \
    CUSTOM_BUILD_COMMAND="npm install --omit=dev"
```

### Required GitHub Secrets

| Secret                  | Description                                               |
| ----------------------- | --------------------------------------------------------- |
| `AZURE_CLIENT_ID`       | App registration client ID (for federated identity login) |
| `AZURE_TENANT_ID`       | Microsoft Entra tenant ID                                 |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription ID                                     |
| `AZURE_APP_NAME`        | Azure App Service name                                    |
| `AZURE_RESOURCE_GROUP`  | Azure Resource Group name                                 |

## Deployment Methods

### GitHub Actions (CI/CD)

Push to `main` triggers the workflow in `.github/workflows/deploy-to-azure.yml`, which:

1. Runs `deploy-js-update.ps1` to update the service worker cache version
2. Builds the client with Vite
3. Packages server, shared, and dist files into a zip
4. Deploys to Azure App Service via `deploy-to-azure.ps1`

### Manual Deployment

```powershell
# Update cache version
.\deploy-js-update.ps1

# Deploy to Azure
.\deploy-to-azure.ps1 -AppName "poker-app" -ResourceGroup "rg-poker"
```

Use `-SkipBuild` to skip `npm ci` and `npm run build` if you already have a `dist/` folder.

## Pre-Commit

Run `.\reset-js-version.ps1` before committing to reset the service worker cache version to a fixed value, avoiding timestamp noise in git diffs.
