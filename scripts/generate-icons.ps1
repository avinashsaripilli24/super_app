# Renders the PWA icons from public/favicon.svg with headless Chrome (no npm dep).
# Run: powershell -ExecutionPolicy Bypass -File scripts/generate-icons.ps1
#
# favicon.svg is the single source for the mark's geometry (it in turn matches
# src/components/app-logo.tsx). This script only re-tiles it per icon variant and
# lets Chrome rasterise, so the gradients and the traced outlines come out
# exactly as drawn and nothing has to be hand-ported.

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$iconsDir = Join-Path $root 'public\icons'
New-Item -ItemType Directory -Force $iconsDir | Out-Null

$chrome = @(
  (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
  (Join-Path $env:LOCALAPPDATA 'Google\Chrome\Application\chrome.exe')
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $chrome) {
  throw 'Google Chrome not found. It rasterises the SVG icons; install Chrome, or render public/favicon.svg to PNG by hand.'
}

$svgPath = Join-Path $root 'public\favicon.svg'
$svgSource = Get-Content -Path $svgPath -Raw

# The mark is wider than it is tall; favicon.svg centres it on the square tile.
$markHeight = 46.52

function New-Icon {
  param([int]$Size, [string]$Path, [bool]$Maskable)

  $svg = $svgSource

  if ($Maskable) {
    # Maskable icons must fill the canvas (no rounded corners -- the platform
    # applies its own) and keep the mark inside the inner 80%.
    $scale = 0.76
    $svg = $svg -replace '(<rect width="64" height="64") rx="14"', '$1'
  } else {
    $scale = 0.90
  }

  $tx = [math]::Round((64 - 64 * $scale) / 2, 2)
  $ty = [math]::Round((64 - $markHeight * $scale) / 2, 2)
  $svg = $svg -replace 'translate\([-0-9. ]+\) scale\([0-9.]+\)',
                       "translate($tx $ty) scale($scale)"

  $html = @"
<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#fff}svg{display:block;width:${Size}px;height:${Size}px}
</style></head><body>
$svg
</body></html>
"@

  $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ('icon-' + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force $tmp | Out-Null
  $htmlPath = Join-Path $tmp 'icon.html'
  Set-Content -Path $htmlPath -Value $html -Encoding utf8

  $chromeArgs = @(
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    "--user-data-dir=$tmp\profile",
    "--window-size=$Size,$Size",
    "--screenshot=$Path",
    ('file:///' + ($htmlPath -replace '\\', '/'))
  )
  & $chrome @chromeArgs | Out-Null

  Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
  if (-not (Test-Path $Path)) { throw "Chrome did not write $Path" }
  Write-Host "wrote $Path"
}

New-Icon -Size 192 -Path (Join-Path $iconsDir 'pwa-192.png') -Maskable $false
New-Icon -Size 512 -Path (Join-Path $iconsDir 'pwa-512.png') -Maskable $false
New-Icon -Size 512 -Path (Join-Path $iconsDir 'pwa-512-maskable.png') -Maskable $true
New-Icon -Size 180 -Path (Join-Path $root 'public\apple-touch-icon.png') -Maskable $true
