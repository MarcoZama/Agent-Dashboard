[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$SolutionZip,
    [Parameter(Mandatory)][string]$BuildDirectory,
    [Parameter(Mandatory)][string]$ExpectedVersion
)

$ErrorActionPreference = 'Stop'
$dist = (Resolve-Path -LiteralPath $BuildDirectory).Path
$zip = [IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $SolutionZip).Path)
try {
    $manifestEntry = $zip.GetEntry('solution.xml')
    if (!$manifestEntry) { throw 'Dataverse solution.xml is missing.' }
    $reader = [IO.StreamReader]::new($manifestEntry.Open())
    try { [xml]$metadata = $reader.ReadToEnd() } finally { $reader.Dispose() }
    $manifest = $metadata.ImportExportXml.SolutionManifest
    if ($manifest.UniqueName -cne 'AgentsDashboard' -or $manifest.Managed -ne '1' -or $manifest.Version -ne $ExpectedVersion) {
        throw "Expected managed AgentsDashboard solution version $ExpectedVersion."
    }

    $roots = @($manifest.SelectNodes('RootComponents/RootComponent'))
    if ($roots.Count -ne 1 -or $roots[0].GetAttribute('type') -ne '300' -or
        $roots[0].GetAttribute('schemaName') -notmatch '^[a-zA-Z0-9_]+$') {
        throw 'The solution must contain exactly one app as its root component, without custom connectors.'
    }
    $prefix = 'CanvasApps/{0}_CodeAppPackages/' -f $roots[0].GetAttribute('schemaName')
    if (!$zip.GetEntry("${prefix}index.html")) { throw 'The Code App entry point is missing from the solution.' }

    $customizations = $zip.GetEntry('customizations.xml')
    if (!$customizations) { throw 'Dataverse customizations.xml is missing.' }
    $reader = [IO.StreamReader]::new($customizations.Open())
    try { [xml]$metadata = $reader.ReadToEnd() } finally { $reader.Dispose() }
    $firstUri = $metadata.SelectSingleNode('/ImportExportXml/CanvasApps/CanvasApp/CodeAppPackageUris/CodeAppPackageUri[1]')
    if ($firstUri.InnerText -cne "/${prefix}index.html_ContentType_text/html") {
        throw 'index.html must be the first CodeAppPackageUri for Power Apps to start after import.'
    }

    $files = @(Get-ChildItem -LiteralPath $dist -File -Force -Recurse)
    $assets = @($zip.Entries | Where-Object {
        $_.FullName.StartsWith($prefix, [StringComparison]::Ordinal) -and $_.Name -and
        $_.FullName -cne "${prefix}.pa/power.config.json"
    })
    if ($assets.Count -ne $files.Count) { throw 'The exported asset count does not match the PR build.' }
    foreach ($file in $files) {
        $relative = [IO.Path]::GetRelativePath($dist, $file.FullName).Replace('\', '/')
        $entry = $zip.GetEntry("$prefix$relative")
        if (!$entry) { throw "Built asset not found in solution: $relative" }
        $stream = $entry.Open()
        try { $actual = Get-FileHash -InputStream $stream -Algorithm SHA256 } finally { $stream.Dispose() }
        if ($actual.Hash -ne (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash) {
            throw "Exported asset does not match the PR build: $relative"
        }
    }
    "Verified managed AgentsDashboard $ExpectedVersion with $($files.Count) matching Code App assets."
} finally {
    $zip.Dispose()
}
