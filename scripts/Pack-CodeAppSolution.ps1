[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$BuildDirectory,
    [Parameter(Mandatory)][string]$SolutionZip,
    [Parameter(Mandatory)][string]$Version
)

$ErrorActionPreference = 'Stop'
if ($Version -notmatch '^[0-9]{1,5}(\.[0-9]{1,5}){3}$' -or ($Version.Split('.') | Where-Object { [int]$_ -gt 65535 })) {
    throw 'Expected a four-part Dataverse version with each component at most 65535.'
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$configPath = Join-Path $repoRoot 'power.config.json'
$config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json -AsHashtable
$dist = (Resolve-Path -LiteralPath $BuildDirectory).Path
$output = [IO.Path]::GetFullPath($SolutionZip, (Get-Location).ProviderPath)
if ($config.buildEntryPoint -cne 'index.html' -or !(Test-Path -LiteralPath (Join-Path $dist 'index.html') -PathType Leaf)) {
    throw 'The Code App build must contain its configured index.html entry point.'
}
if ([IO.Path]::GetExtension($output) -ne '.zip' -or (Test-Path -LiteralPath $output)) {
    throw 'Specify a new ZIP file; an existing output will not be overwritten.'
}

$entries = @(Get-ChildItem -LiteralPath $dist -Recurse -Force)
if ($entries | Where-Object { $_.Name.StartsWith('.') -or ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) }) {
    throw 'The build cannot contain hidden paths or links.'
}
$mime = @{
    '.html' = 'text/html'; '.css' = 'text/css'; '.js' = 'application/javascript'; '.json' = 'application/json'
    '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'
    '.webp' = 'image/webp'; '.ico' = 'image/x-icon'; '.woff2' = 'font/woff2'
}
$files = @($entries | Where-Object { !$_.PSIsContainer } | Sort-Object FullName)
$stage = [IO.Directory]::CreateTempSubdirectory('agents-dashboard-pack-').FullName
try {
    $solutionPath = Join-Path $stage 'solution'
    Copy-Item -LiteralPath (Join-Path $repoRoot 'solution') -Destination $solutionPath -Recurse
    $manifestPath = Join-Path $solutionPath 'Other' 'Solution.xml'
    [xml]$manifest = Get-Content -LiteralPath $manifestPath -Raw
    $solution = $manifest.ImportExportXml.SolutionManifest
    $solution.Version = $Version
    $manifest.Save($manifestPath)

    $appName = $solution.RootComponents.RootComponent.schemaName
    $canvasApps = Join-Path $solutionPath 'CanvasApps'
    $metadataPath = Join-Path $canvasApps "$appName.meta.xml"
    [xml]$metadata = Get-Content -LiteralPath $metadataPath -Raw
    $metadata.CanvasApp.AppVersion = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ', [Globalization.CultureInfo]::InvariantCulture)
    $metadata.CanvasApp.DisplayName = $config.appDisplayName
    $metadata.CanvasApp.Description = $config.description

    $customDependencies = @{
        CopilotStudioCreditConsumption = 'zama_copilotstudiocreditconsumption'
        CopilotCostManagement = 'zama_copilotcostmanagement'
    }
    $references = [ordered]@{}
    foreach ($entry in $config.connectionReferences.GetEnumerator()) {
        $value = $entry.Value
        $isCustom = $customDependencies.ContainsKey($value.displayName)
        $reference = [ordered]@{
            id = $value.id
            displayName = $value.displayName
            iconUri = 'https://defaulticons.powerapps.com/defaulticons/api-dedicated.png'
            dataSources = $value.dataSources
            dependencies = @()
            dependents = @()
            parameterHints = @{}
            parameterHintsV2 = @{}
            isOnPremiseConnection = $false
            bypassConsent = $false
            dataSets = $value.dataSets
            apiTier = 'Standard'
            actions = @()
            isCustomApiSolutionAware = $isCustom
        }
        if ($isCustom) { $reference.customApiLogicalName = $customDependencies[$value.displayName] }
        if ($value.authenticationType) { $reference.authenticationType = $value.authenticationType }
        $references[$entry.Key] = $reference
    }
    $metadata.CanvasApp.ConnectionReferences = ConvertTo-Json -InputObject $references -Depth 25 -Compress
    $metadata.CanvasApp.DatabaseReferences = ConvertTo-Json -InputObject $config.databaseReferences -Depth 25 -Compress

    $packageFolder = "${appName}_CodeAppPackages"
    $assets = Join-Path $canvasApps $packageFolder
    $configDir = Join-Path $assets '.pa'
    New-Item -ItemType Directory -Path $configDir | Out-Null
    Copy-Item -LiteralPath $configPath -Destination (Join-Path $configDir 'power.config.json')
    $uris = $metadata.CanvasApp.SelectSingleNode('CodeAppPackageUris')
    $configUri = $metadata.CreateElement('CodeAppPackageUri')
    $configUri.InnerText = "/CanvasApps/$packageFolder/.pa/power.config.json_ContentType_application/json"
    $null = $uris.AppendChild($configUri)
    foreach ($file in $files) {
        $relative = [IO.Path]::GetRelativePath($dist, $file.FullName)
        $uri = $relative.Replace('\', '/')
        $type = $mime[$file.Extension]
        if (!$type -or $uri -notmatch '^[a-zA-Z0-9_./-]+$' -or $uri.Contains('_ContentType_')) {
            throw "Unsupported Code App asset: $relative"
        }
        $target = Join-Path $assets $relative
        New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
        Copy-Item -LiteralPath $file.FullName -Destination $target
        $node = $metadata.CreateElement('CodeAppPackageUri')
        $node.InnerText = "/CanvasApps/$packageFolder/${uri}_ContentType_$type"
        $null = $uris.AppendChild($node)
    }
    $metadata.Save($metadataPath)

    $zip = Join-Path $stage 'AgentsDashboard_managed.zip'
    pac solution pack --zipfile $zip --folder $solutionPath --packagetype Managed
    if ($LASTEXITCODE -ne 0) { throw 'PAC CLI failed to pack the managed Code App solution.' }
    & (Join-Path $PSScriptRoot 'Test-CodeAppSolution.ps1') -SolutionZip $zip -BuildDirectory $dist -ExpectedVersion $Version
    New-Item -ItemType Directory -Path (Split-Path -Parent $output) -Force | Out-Null
    Copy-Item -LiteralPath $zip -Destination $output
} finally {
    Remove-Item -LiteralPath $stage -Recurse -Force
}
