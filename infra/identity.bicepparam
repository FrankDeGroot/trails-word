using 'identity.bicep'

param appName = 'wordtrails'
param location = 'swedencentral'
param githubOrg = readEnvironmentVariable('GITHUB_ORG', '')
param githubRepo = readEnvironmentVariable('GITHUB_REPO', '')
param githubBranch = readEnvironmentVariable('GITHUB_BRANCH', 'main')
