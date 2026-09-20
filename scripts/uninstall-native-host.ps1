[CmdletBinding()]
param(
    [ValidateSet('Chrome', 'Edge', 'Both')]
    [string]$Browser = 'Both'
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$manifestPath = Join-Path $repoRoot 'native-host\installed\com.promptaction.nativehost.json'
$hostName = 'com.promptaction.nativehost'
$registryRoots = [ordered]@{
    Chrome = 'Software\Google\Chrome\NativeMessagingHosts'
    Edge = 'Software\Microsoft\Edge\NativeMessagingHosts'
}
$selectedBrowsers = switch ($Browser) {
    'Chrome' { @('Chrome') }
    'Edge' { @('Edge') }
    default { @('Chrome', 'Edge') }
}

foreach ($selectedBrowser in $selectedBrowsers) {
    $parentSubKey = $registryRoots[$selectedBrowser]
    $parentKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($parentSubKey, $true)
    try {
        if ($parentKey) {
            $parentKey.DeleteSubKey($hostName, $false)
        }
    }
    finally {
        if ($parentKey) {
            $parentKey.Close()
        }
    }
}

if (Test-Path -LiteralPath $manifestPath) {
    $registrationStillExists = $false
    foreach ($remainingBrowser in $registryRoots.Keys) {
        $remainingPath = "$($registryRoots[$remainingBrowser])\$hostName"
        $remainingKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($remainingPath, $false)
        try {
            if ($remainingKey) {
                $registrationStillExists = $true
            }
        }
        finally {
            if ($remainingKey) {
                $remainingKey.Close()
            }
        }
    }
    if (-not $registrationStillExists) {
        Remove-Item -LiteralPath $manifestPath -Force
    }
}

Write-Host "Prompt Action native host registration removed for: $($selectedBrowsers -join ', ')"
Write-Host "Only the Prompt Action host name and generated manifest were removed."
