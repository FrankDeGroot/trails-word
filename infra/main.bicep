@description('The primary location for resources')
param location string = resourceGroup().location

@description('Unique environment name / prefix for naming resources')
@minLength(3)
@maxLength(18)
param appName string = 'wordtrails'

@description('Storage account SKU - Standard_LRS is the lowest-cost mutable Azure storage')
param storageSku string = 'Standard_LRS'

@description('Static Web App SKU')
@allowed([
  'Free'
  'Standard'
])
param staticWebAppSku string = 'Free'

// Unique name for globally unique resources
var uniqueSuffix = uniqueString(resourceGroup().id)
var storageAccountName = take('${replace(toLower(appName), '-', '')}${uniqueSuffix}', 24)
var staticWebAppName = '${appName}-swa-${uniqueSuffix}'
var blobContainerName = 'words'
var blobFileName = 'word_trails.txt'

// Azure Storage Account - Cheapest mutable storage tier (Standard_LRS / Hot or Cool)
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: storageAccountName
  location: location
  sku: {
    name: storageSku
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: false
    allowSharedKeyAccess: true
  }
}

// Blob Service
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: false
    }
  }
}

// Private blob container for word trails
resource blobContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: blobContainerName
  properties: {
    publicAccess: 'None'
  }
}

// Primary connection string for function backend
var storageConnectionString = 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value};EndpointSuffix=${environment().suffixes.storage}'

// Azure Static Web Apps (Free tier) with integrated serverless functions
resource staticWebApp 'Microsoft.Web/staticSites@2023-12-01' = {
  name: staticWebAppName
  location: location
  sku: {
    name: staticWebAppSku
    tier: staticWebAppSku
  }
  properties: {
    allowConfigFileUpdates: true
    stagingEnvironmentPolicy: 'Enabled'
  }
}

// Configure Static Web App application settings / secrets for the API
resource staticWebAppAppSettings 'Microsoft.Web/staticSites/config@2023-12-01' = {
  parent: staticWebApp
  name: 'appsettings'
  properties: {
    AZURE_STORAGE_CONNECTION_STRING: storageConnectionString
    BLOB_CONTAINER_NAME: blobContainerName
    BLOB_FILE_NAME: blobFileName
  }
}

// Outputs
output storageAccountName string = storageAccount.name
output blobContainerName string = blobContainerName
output blobFileName string = blobFileName
output staticWebAppName string = staticWebApp.name
output staticWebAppDefaultHostname string = staticWebApp.properties.defaultHostname
output staticWebAppDeploymentApiKey string = staticWebApp.listSecrets().properties.apiKey
