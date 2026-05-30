param()
$ErrorActionPreference = "Stop"

$root = Resolve-Path "$PSScriptRoot\.."
$artifacts = Join-Path $root "artifacts"
New-Item -ItemType Directory -Force -Path $artifacts | Out-Null

Write-Host "[build] Building web"
Push-Location "$root\apps\web"
npm run build
Pop-Location

Write-Host "[build] Building desktop MSI"
Push-Location "$root\apps\desktop"
npm run build
Pop-Location

Write-Host "[build] Creating portable package placeholder"
$portableDir = Join-Path $artifacts "EchoPilot-Portable"
New-Item -ItemType Directory -Force -Path $portableDir | Out-Null
Copy-Item "$root\README.md" "$portableDir\README.md" -Force
Compress-Archive -Path "$portableDir\*" -DestinationPath "$artifacts\EchoPilot-Portable.zip" -Force

Write-Host "[build] Build completed. Check artifacts folder."
