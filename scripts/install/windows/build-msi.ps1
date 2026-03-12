Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
Set-Location $root

function Get-AppVersion {
  if ($env:CHROME_COLLECT_VERSION) {
    return $env:CHROME_COLLECT_VERSION.TrimStart("v")
  }
  if ($env:GITHUB_REF_NAME) {
    return $env:GITHUB_REF_NAME.TrimStart("v")
  }
  return (Get-Content package.json | ConvertFrom-Json).version
}

function Convert-ToMsiVersion([string]$version) {
  $clean = ($version -split "-", 2)[0]
  $parts = $clean.Split(".")
  while ($parts.Count -lt 4) {
    $parts += "0"
  }
  return ($parts[0..3] -join ".")
}

$appVersion = Get-AppVersion
$msiVersion = Convert-ToMsiVersion $appVersion

$wix = Get-Command wix -ErrorAction SilentlyContinue
if (-not $wix) {
  throw "未找到 WiX v4 CLI（wix）。请先安装 WiX Toolset 4。"
}

$gcc = Get-Command gcc -ErrorAction SilentlyContinue
if (-not $gcc) {
  throw "未找到 gcc。桌面端 WebView 构建需要可用的 MinGW/MSYS2 工具链。"
}

New-Item -ItemType Directory -Force dist | Out-Null
bun run build:web
bun run sync:web
Push-Location packages/tray
go build -ldflags="-H windowsgui -s -w -X main.Version=$appVersion" -o ..\..\dist\chrome-collect-desktop.exe .\cmd\desktop-app
go build -ldflags="-s -w -X main.Version=$appVersion" -o ..\..\dist\chrome-collect-native-host.exe .\cmd\native-host
Pop-Location

New-Item -ItemType Directory -Force dist | Out-Null
wix build scripts/install/windows/chrome-collect.wxs -arch x64 -d ProductVersion=$msiVersion -o dist/chrome-collect-windows-x64.msi
