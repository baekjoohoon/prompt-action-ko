[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[a-p]{32}$')]
    [string]$ExtensionId,

    [ValidateSet('Chrome', 'Edge', 'Both')]
    [string]$Browser = 'Both'
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$executablePath = Join-Path $repoRoot 'native-host\dist\PromptAction.NativeHost.exe'
$installDirectory = Join-Path $repoRoot 'native-host\installed'
$manifestPath = Join-Path $installDirectory 'com.promptaction.nativehost.json'
$hostName = 'com.promptaction.nativehost'

if (-not (Test-Path -LiteralPath $executablePath)) {
    throw "Build output was not found. Run scripts\build-native-host.ps1 first: $executablePath"
}

$registryRoots = [ordered]@{
    Chrome = 'Software\Google\Chrome\NativeMessagingHosts'
    Edge = 'Software\Microsoft\Edge\NativeMessagingHosts'
}
$selectedBrowsers = switch ($Browser) {
    'Chrome' { @('Chrome') }
    'Edge' { @('Edge') }
    default { @('Chrome', 'Edge') }
}

New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
$absoluteExecutablePath = (Resolve-Path -LiteralPath $executablePath).Path

$manifest = [ordered]@{
    name = $hostName
    description = 'Prompt Action native host for the local Codex CLI.'
    path = $absoluteExecutablePath
    type = 'stdio'
    allowed_origins = @("chrome-extension://$ExtensionId/")
}

$json = $manifest | ConvertTo-Json -Depth 4
[System.IO.File]::WriteAllText($manifestPath, $json, $utf8)

foreach ($selectedBrowser in $selectedBrowsers) {
    $registrySubKey = "$($registryRoots[$selectedBrowser])\$hostName"
    $registryKey = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($registrySubKey)
    try {
        $registryKey.SetValue('', $manifestPath, [Microsoft.Win32.RegistryValueKind]::String)
    }
    finally {
        if ($registryKey) {
            $registryKey.Close()
        }
    }
}

Write-Host "Native host registered for: $($selectedBrowsers -join ', ')"
Write-Host "Extension ID: $ExtensionId"
Write-Host "Manifest: $manifestPath"
Write-Host 'Reload the extension if the browser does not detect the updated registration.'
