param(
    [string]$Endpoint = "http://127.0.0.1:8765/transcript"
)

$ErrorActionPreference = "Stop"

function Find-SuspiciousCodepoints {
    param([string]$Text)

    $results = New-Object System.Collections.Generic.List[string]
    for ($i = 0; $i -lt $Text.Length; $i++) {
        $code = [int][char]$Text[$i]
        $isControl = ($code -ge 0 -and $code -le 31) -or $code -eq 127
        $isLineSep = $code -eq 0x2028 -or $code -eq 0x2029 -or $code -eq 0x0085
        if ($isControl -or $isLineSep) {
            $results.Add(("index={0} code=U+{1}" -f $i, $code.ToString("X4")))
        }
    }
    return $results
}

Write-Host "[check] Fetching transcript from $Endpoint" -ForegroundColor Cyan
$response = Invoke-RestMethod -Uri $Endpoint -Method Get
$text = [string]$response.text

$hasRealNewline = $text.Contains("`n") -or $text.Contains("`r")
$hasEscapedNewline = $text.Contains("\n") -or $text.Contains("\r")
$suspicious = Find-SuspiciousCodepoints -Text $text

Write-Host "[check] Transcript length: $($text.Length)" -ForegroundColor Cyan
Write-Host "[check] Contains real newline chars: $hasRealNewline" -ForegroundColor Yellow
Write-Host "[check] Contains escaped newline literals: $hasEscapedNewline" -ForegroundColor Yellow
Write-Host "[check] Suspicious/control codepoints count: $($suspicious.Count)" -ForegroundColor Yellow

if ($suspicious.Count -gt 0) {
    Write-Host "[check] First suspicious codepoints:" -ForegroundColor Magenta
    $suspicious | Select-Object -First 20 | ForEach-Object { Write-Host "  $_" }
}

$preview = $text
if ($preview.Length -gt 400) {
    $preview = $preview.Substring(0, 400) + "..."
}

Write-Host "[check] Transcript preview:" -ForegroundColor Cyan
Write-Host $preview

if ($hasRealNewline -or $hasEscapedNewline -or $suspicious.Count -gt 0) {
    Write-Host "[check] FAIL: transcript still has linebreak-related artifacts." -ForegroundColor Red
    exit 2
}

Write-Host "[check] PASS: transcript is single-line clean." -ForegroundColor Green
exit 0
