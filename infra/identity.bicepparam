using 'identity.bicep'

param appName = 'wordtrails'
param location = 'westeurope'
param githubOrg = readEnvironmentVariable('GITHUB_ORG', '')
param githubOrgId = readEnvironmentVariable('GITHUB_ORG_ID', '')
param githubRepo = readEnvironmentVariable('GITHUB_REPO', '')
param githubRepoId = readEnvironmentVariable('GITHUB_REPO_ID', '')
param githubBranch = readEnvironmentVariable('GITHUB_BRANCH', 'main')
