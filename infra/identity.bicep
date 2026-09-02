@description('The primary location for resources')
param location string = resourceGroup().location

@description('Unique environment name / prefix for naming resources')
@minLength(3)
@maxLength(18)
param appName string = 'wordtrails'

@description('GitHub organization or user that owns the repository (for OIDC federation)')
param githubOrg string

@description('GitHub repository name (for OIDC federation)')
param githubRepo string

@description('Git branch allowed to federate as the deployment identity')
param githubBranch string = 'main'

// User-assigned managed identity used by GitHub Actions instead of an app registration / service principal
resource githubIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${appName}-github-deploy'
  location: location
}

// Federated credential trusts GitHub's OIDC tokens for the given repo/branch, no client secret required
resource githubFederatedCredential 'Microsoft.ManagedIdentity/userAssignedIdentities/federatedIdentityCredentials@2023-01-31' = {
  parent: githubIdentity
  name: 'github-actions-${githubBranch}'
  properties: {
    issuer: 'https://token.actions.githubusercontent.com'
    subject: 'repo:${githubOrg}/${githubRepo}:ref:refs/heads/${githubBranch}'
    audiences: [
      'api://AzureADTokenExchange'
    ]
  }
}

// Grants the identity permission to provision resources in this resource group
resource githubIdentityRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(resourceGroup().id, '${appName}-github-deploy', 'Contributor')
  scope: resourceGroup()
  properties: {
    principalId: githubIdentity.properties.principalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: subscriptionResourceId(
      'Microsoft.Authorization/roleDefinitions',
      'b24988ac-6180-42a0-ab88-20f7382dd24c'
    )
  }
}

// Outputs
output githubIdentityClientId string = githubIdentity.properties.clientId
output githubIdentityPrincipalId string = githubIdentity.properties.principalId
output githubIdentityName string = githubIdentity.name
output githubIdentityId string = githubIdentity.id
