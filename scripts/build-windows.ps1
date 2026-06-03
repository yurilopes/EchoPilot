param()
$ErrorActionPreference = "Stop"

$root = Resolve-Path "$PSScriptRoot\.."
$artifacts = Join-Path $root "artifacts"
$desktopTarget = Join-Path $root "apps\desktop\src-tauri\target\release"
$bundleMsiDir = Join-Path $desktopTarget "bundle\msi"
New-Item -ItemType Directory -Force -Path $artifacts | Out-Null

function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,

        [Parameter(ValueFromRemainingArguments = $true)]
        [string[]]$Arguments
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "$FilePath failed with exit code $LASTEXITCODE"
    }
}

Write-Host "[build] Building web"
Push-Location "$root\apps\web"
Invoke-Native npm run build
Pop-Location

Write-Host "[build] Building desktop MSI"
Push-Location "$root\apps\desktop"
Invoke-Native npm run build
Pop-Location

Write-Host "[build] Collecting MSI artifact"
$msi = Get-ChildItem -Path $bundleMsiDir -Filter "*.msi" -Recurse |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
if (-not $msi) {
    throw "No MSI artifact was found under $bundleMsiDir"
}
Copy-Item $msi.FullName (Join-Path $artifacts "EchoPilot-Setup.msi") -Force

Write-Host "[build] Creating portable package"
$portableDir = Join-Path $artifacts "EchoPilot-Portable"
if (Test-Path $portableDir) {
    Remove-Item -Recurse -Force $portableDir
}
New-Item -ItemType Directory -Path $portableDir | Out-Null
Copy-Item "$root\README.md" "$portableDir\README.md" -Force
Copy-Item (Join-Path $desktopTarget "realtime_system_transcriber_desktop.exe") "$portableDir\EchoPilot.exe" -Force
Compress-Archive -Path "$portableDir\*" -DestinationPath "$artifacts\EchoPilot-Portable.zip" -Force

Write-Host "[build] Writing checksums"
Get-FileHash -Algorithm SHA256 `
    (Join-Path $artifacts "EchoPilot-Setup.msi"), `
    (Join-Path $artifacts "EchoPilot-Portable.zip") |
    ForEach-Object { "$($_.Hash)  $([System.IO.Path]::GetFileName($_.Path))" } |
    Set-Content -Encoding utf8 (Join-Path $artifacts "SHA256SUMS.txt")

Write-Host "[build] Build completed. Check artifacts folder."
