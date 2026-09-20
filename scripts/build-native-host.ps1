[CmdletBinding()]
param(
    [ValidateSet('Release', 'Debug')]
    [string]$Configuration = 'Release',
    [ValidateSet('win-x64')]
    [string]$Runtime = 'win-x64'
)

$ErrorActionPreference = 'Stop'
$utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8
$OutputEncoding = $utf8

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$projectPath = Join-Path $repoRoot 'native-host\PromptAction.NativeHost.csproj'
$outputPath = Join-Path $repoRoot 'native-host\dist'
$promptPath = Join-Path $repoRoot 'prompts\optimize-prompt.txt'

$dotnetCommand = Get-Command dotnet -ErrorAction SilentlyContinue
if (-not $dotnetCommand) {
    throw 'dotnet SDK was not found. Install the .NET SDK and try again.'
}
$dotnetRoot = Split-Path -Parent $dotnetCommand.Source
if (Test-Path -LiteralPath (Join-Path $dotnetRoot 'dotnet.exe')) {
    $env:DOTNET_ROOT = $dotnetRoot
}
$sdkList = & dotnet --list-sdks
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace(($sdkList -join [Environment]::NewLine))) {
    throw 'dotnet SDK was not found. Install the .NET SDK and try again.'
}
if (-not (Test-Path -LiteralPath $projectPath)) {
    throw "Project file was not found: $projectPath"
}
if (-not (Test-Path -LiteralPath $promptPath)) {
    throw "Optimizer instruction file was not found: $promptPath"
}

New-Item -ItemType Directory -Path $outputPath -Force | Out-Null

& dotnet publish $projectPath `
    --configuration $Configuration `
    --runtime $Runtime `
    --self-contained true `
    --nologo `
    -p:PublishSingleFile=true `
    -p:PublishTrimmed=false `
    --output $outputPath

if ($LASTEXITCODE -ne 0) {
    throw "Native host build failed. Exit code: $LASTEXITCODE"
}

$executablePath = Join-Path $outputPath 'PromptAction.NativeHost.exe'
$publishedPromptPath = Join-Path $outputPath 'optimize-prompt.txt'
if (-not (Test-Path -LiteralPath $executablePath)) {
    throw "Published executable was not found: $executablePath"
}
if (-not (Test-Path -LiteralPath $publishedPromptPath)) {
    throw "Published optimizer instruction was not found: $publishedPromptPath"
}

Write-Host "Native host built: $executablePath"
