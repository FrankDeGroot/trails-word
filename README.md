# Word Finder (Azure Serverless)

A fast, serverless word finder web application designed for word games. Built with Azure Blob Storage (the cheapest mutable storage tier), an Azure Functions API for word retrieval and deletion, an interactive static frontend with real-time filtering and word deletion, and an automated GitHub Actions deployment pipeline.

---

## Features

- **Cheapest Mutable Storage**: Uses Azure Blob Storage (`Standard_LRS`, StorageV2) to store the ~370,000-word dataset (<$0.0001/month storage cost).
- **Serverless API**: Node.js Azure Functions (v4 model) integrated directly with Azure Static Web Apps:
  - `GET /api/words`: Retrieves the word list with client caching.
  - `DELETE /api/words`: Atomically deletes words from blob storage.
- **Interactive UI**:
  - Filter words by available letters (bag count), word length, and specific letter positions.
  - Click word tag to dim / un-dim.
  - Hover over a word tag and click `×` to delete the word permanently with optimistic UI updates.
  - Light, Dark, and System theme toggle.
- **Automated CI/CD**: Single GitHub Actions workflow to provision Azure Bicep infrastructure, seed the initial dataset, and deploy frontend and API.

---

## Project Structure

```
├── .devcontainer/
│   └── devcontainer.json            # VS Code Dev Container config (Node 24, Azure CLI, Tools)
├── .github/
│   └── workflows/
│       └── azure-deploy.yml         # GitHub Actions CI/CD deployment workflow
├── api/
│   ├── host.json                    # Azure Functions host config
│   ├── package.json                 # API dependencies (@azure/functions, @azure/storage-blob)
│   ├── local.settings.json.example  # Local environment variables template
│   └── src/
│       └── functions/
│           └── words.js             # GET /api/words & DELETE /api/words handlers
├── infra/
│   ├── identity.bicep               # GitHub Actions managed identity & OIDC federation
│   ├── identity.bicepparam          # Identity Bicep parameters
│   ├── main.bicep                   # Workload Bicep template (Storage + Static Web App)
│   └── main.bicepparam              # Workload Bicep parameters
├── public/
│   ├── index.html                   # Frontend markup
│   ├── styles.css                   # Frontend styles
│   ├── script.js                    # Frontend logic
│   ├── staticwebapp.config.json     # Static Web App configuration & routing
│   └── word_trails.txt              # Symlink to ../word_trails.txt (local offline fallback)
├── word_trails.txt                  # Initial dataset of ~370,000 words
└── AGENT.md                         # Project documentation
```

---

## Azure Setup & GitHub Actions Deployment

### 1. Azure Authentication in GitHub (User-Assigned Managed Identity)

Authentication uses a **user-assigned managed identity** with a federated (OIDC) credential trusting GitHub Actions — no app registration, service principal, or client secret is required. The identity and its federated credential are defined in [infra/identity.bicep](infra/identity.bicep).

Because GitHub Actions needs *something* to authenticate with before it can run the first deployment, bootstrap the identity once from your local machine (or Cloud Shell) using an account with `Owner`/`User Access Administrator` rights on the subscription:

Use the [GitHub CLI](https://cli.github.com/) to look up the numeric org and repo IDs required below:

```bash
# GitHub org ID (or user ID, if the repo is under a personal account)
gh api orgs/<your-github-org> --jq .id
# or, for a personal account:
gh api users/<your-github-username> --jq .id

# GitHub repo ID
gh api repos/<your-github-org>/trails-word --jq .id
```

```bash
SUBSCRIPTION_ID="<SUBSCRIPTION_ID>"
RESOURCE_GROUP="rg-wordtrails"
LOCATION="westeurope"
GITHUB_ORG="<your-github-org-or-user>"
GITHUB_ORG_ID="<your-github-org-id>"
GITHUB_REPO="trails-word"
GITHUB_REPO_ID="<your-github-repo-id>"
GITHUB_BRANCH="main"

az account set --subscription "$SUBSCRIPTION_ID"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION"

az deployment group create \
  --resource-group "$RESOURCE_GROUP" \
  --template-file infra/identity.bicep \
  --parameters appName="wordtrails" location="$LOCATION" \
    githubOrg="$GITHUB_ORG" githubOrgId="$GITHUB_ORG_ID" \
    githubRepo="$GITHUB_REPO" githubRepoId="$GITHUB_REPO_ID" \
    githubBranch="$GITHUB_BRANCH"
```

This creates the `wordtrails-github-deploy` managed identity with a federated credential trusting `repo:$GITHUB_ORG/$GITHUB_REPO:ref:refs/heads/main`, granted `Contributor` on the resource group.

Retrieve the identity's client ID from the Bicep deployment output and add the following repository secrets under **Settings > Secrets and variables > Actions**:

```bash
az deployment group show \
  --name "$(az deployment group list --resource-group "$RESOURCE_GROUP" --query "[0].name" -o tsv)" \
  --resource-group "$RESOURCE_GROUP" \
  --query "properties.outputs.githubIdentityClientId.value" -o tsv
az account show --query tenantId -o tsv
```

- `AZURE_CLIENT_ID` — the managed identity's client ID
- `AZURE_TENANT_ID` — your Azure AD tenant ID
- `AZURE_SUBSCRIPTION_ID` — your subscription ID

Subsequent pushes to `main` deploy the workload via [infra/main.bicep](infra/main.bicep) authenticated by the managed identity itself — no further manual steps are needed, and there are no secrets to rotate.

### 2. Triggering Deployment
Push changes to the `main` branch or trigger the workflow manually from GitHub Actions (**Actions > Deploy to Azure > Run workflow**).

The workflow will automatically:
1. Create the resource group (default: `rg-wordtrails` in `westeurope`).
2. Deploy the workload Bicep template (Azure Storage Account + Azure Static Web App) from [infra/main.bicep](infra/main.bicep).
3. Seed `word_trails.txt` to Azure Blob Storage if it has not been uploaded yet.
4. Deploy the frontend and API to Azure Static Web Apps.

---

## Local Development

### Prerequisites
- [Node.js](https://nodejs.org/) (v24+)
- [Azure Functions Core Tools](https://github.com/Azure/azure-functions-core-tools) (`npm i -g azure-functions-core-tools@4`)
- [Azure Static Web Apps CLI](https://azure.github.io/static-web-apps-cli/) (`npm i -g @azure/static-web-apps-cli`)
- [Azurite](https://github.com/Azure/Azurite) for local blob storage (or a real Azure Storage connection string)

### Running Locally
1. Install API dependencies:
   ```bash
   cd api
   npm install
   cd ..
   ```
2. Copy `api/local.settings.json.example` to `api/local.settings.json` and adjust if needed:
   ```bash
   cp api/local.settings.json.example api/local.settings.json
   ```
3. Start the Static Web Apps emulator (serves both frontend and API):
   ```bash
   swa start public --api-location api
   ```
4. Open `http://localhost:4280` in your browser.
