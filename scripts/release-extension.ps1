<#
.SYNOPSIS
    Phat hanh phien ban moi cho extension FUNNYGAME (YouTube + Spotify Ad Block).

.DESCRIPTION
    Mot lenh tu dong lam tat ca:
      1. Tang so phien ban trong manifest.json (patch/minor/major hoac dat thu cong).
      2. Dong goi lai release/funnygame.crx tu ma nguon (dung khoa build/ext.pem).
      3. Cap nhat version trong release/update.xml.
      4. (Tuy chon) commit + push len GitHub.
    Chrome tren cac may da cai se TU DONG nang cap qua update.xml (force-install policy).

.PARAMETER Bump
    Kieu tang: patch (mac dinh), minor, major.

.PARAMETER Version
    Dat phien ban cu the (vd 2.3.0). Neu dung tham so nay se bo qua -Bump.

.PARAMETER Push
    Neu bat, tu dong commit + push len origin main.

.EXAMPLE
    .\scripts\release-extension.ps1
    # Tang patch (2.1.1 -> 2.1.2), dong goi, cap nhat update.xml (khong push)

.EXAMPLE
    .\scripts\release-extension.ps1 -Bump minor -Push
    # Tang minor (2.1.1 -> 2.2.0), dong goi, commit + push

.EXAMPLE
    .\scripts\release-extension.ps1 -Version 3.0.0 -Push
#>
param(
    [ValidateSet("patch", "minor", "major")]
    [string]$Bump = "patch",
    [string]$Version,
    [switch]$Push
)

$ErrorActionPreference = "Stop"

# --- Duong dan ---
$root = Split-Path -Parent $PSScriptRoot
$manifestPath = Join-Path $root "manifest.json"
$updateXmlPath = Join-Path $root "release\update.xml"
$crxOut = Join-Path $root "release\funnygame.crx"
$stagingDir = Join-Path $root "build\ext"
$keyPath = Join-Path $root "build\ext.pem"

# --- Cac file/thu muc thuoc extension (KHONG gom installer, scripts, _metadata) ---
$extFiles = @(
    "manifest.json", "background.js", "license.js", "content-main.js", "content.js", "content.css",
    "content-spotify.js", "content-spotify-main.js", "popup.html", "popup.css", "popup.js",
    "options.html", "options.css", "options.js",
    "stats.html", "stats.css", "stats.js"
)
$extDirs = @("images", "rules", "_locales")

function Write-Utf8NoBom([string]$path, [string]$text) {
    [System.IO.File]::WriteAllText($path, $text, [System.Text.UTF8Encoding]::new($false))
}

function Read-Utf8([string]$path) {
    # Doc UTF-8 tuong minh (PowerShell 5.1 mac dinh doc ANSI -> hong tieng Viet)
    return [System.IO.File]::ReadAllText($path, [System.Text.UTF8Encoding]::new($false))
}

function Find-Chrome {
    $cands = @()
    foreach ($hive in @("HKLM:", "HKCU:")) {
        foreach ($sub in @(
            "$hive\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe",
            "$hive\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe")) {
            try { $v = (Get-ItemProperty -LiteralPath $sub -ErrorAction Stop).'(default)'; if ($v) { $cands += $v.Trim('"') } } catch {}
        }
    }
    $cands += "$env:ProgramFiles\Google\Chrome\Application\chrome.exe"
    $cands += "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
    $cands += "$env:LocalAppData\Google\Chrome\Application\chrome.exe"
    foreach ($c in $cands) { if ($c -and (Test-Path $c)) { return $c } }
    return $null
}

function Bump-Version([string]$cur, [string]$kind) {
    if ($cur -notmatch '^(\d+)\.(\d+)\.(\d+)$') {
        throw "Khong doc duoc phien ban hien tai: '$cur'"
    }
    $maj = [int]$Matches[1]; $min = [int]$Matches[2]; $pat = [int]$Matches[3]
    switch ($kind) {
        "major" { $maj++; $min = 0; $pat = 0 }
        "minor" { $min++; $pat = 0 }
        default { $pat++ }
    }
    return "$maj.$min.$pat"
}

# --- Kiem tra dieu kien ---
if (-not (Test-Path $keyPath)) {
    throw "Khong tim thay khoa ky '$keyPath'. Day la khoa private de giu ID co dinh, can co de dong goi. Hay khoi phuc file nay tu ban backup."
}
$chrome = Find-Chrome
if (-not $chrome) {
    throw "Khong tim thay Chrome de dong goi CRX. Hay cai Chrome hoac chinh lai duong dan."
}

# --- 1) Tinh phien ban moi ---
$manifestText = Read-Utf8 $manifestPath
if ($manifestText -notmatch '"version"\s*:\s*"(\d+\.\d+\.\d+)"') {
    throw "Khong tim thay truong version trong manifest.json"
}
$curVersion = $Matches[1]
$newVersion = if ($Version) { $Version } else { Bump-Version $curVersion $Bump }
if ($newVersion -notmatch '^\d+\.\d+\.\d+$') { throw "Phien ban khong hop le: '$newVersion'" }

Write-Host "Phien ban: $curVersion  ->  $newVersion" -ForegroundColor Cyan
Write-Host "Chrome:    $chrome" -ForegroundColor DarkGray

# --- 2) Cap nhat manifest.json (chi thay dong version, giu nguyen dinh dang) ---
$manifestText = [regex]::Replace($manifestText, '("version"\s*:\s*")\d+\.\d+\.\d+(")', "`${1}$newVersion`${2}")
Write-Utf8NoBom $manifestPath $manifestText
Write-Host "Da cap nhat manifest.json" -ForegroundColor Green

# --- 3) Dung staging sach ---
if (Test-Path $stagingDir) { Remove-Item $stagingDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null
foreach ($f in $extFiles) {
    $src = Join-Path $root $f
    if (Test-Path $src) { Copy-Item $src (Join-Path $stagingDir $f) -Force }
    else { Write-Warning "Bo qua file thieu: $f" }
}
foreach ($d in $extDirs) {
    $src = Join-Path $root $d
    if (Test-Path $src) { Copy-Item $src (Join-Path $stagingDir $d) -Recurse -Force }
}

# --- 4) Dong goi CRX voi khoa co dinh ---
$builtCrx = Join-Path $root "build\ext.crx"
if (Test-Path $builtCrx) { Remove-Item $builtCrx -Force }
& $chrome "--pack-extension=$stagingDir" "--pack-extension-key=$keyPath" --no-message-box | Out-Null
$deadline = (Get-Date).AddSeconds(20)
while (-not (Test-Path $builtCrx) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 400 }
if (-not (Test-Path $builtCrx)) { throw "Dong goi CRX that bai (khong thay build\ext.crx)." }

New-Item -ItemType Directory -Force -Path (Split-Path $crxOut) | Out-Null
Copy-Item $builtCrx $crxOut -Force
$crxSize = (Get-Item $crxOut).Length
Write-Host "Da dong goi release/funnygame.crx ($crxSize bytes)" -ForegroundColor Green

# --- 5) Cap nhat update.xml ---
$xml = Read-Utf8 $updateXmlPath
$xml = [regex]::Replace($xml, "(version=')\d+\.\d+\.\d+(')", "`${1}$newVersion`${2}")
Write-Utf8NoBom $updateXmlPath $xml
Write-Host "Da cap nhat release/update.xml -> $newVersion" -ForegroundColor Green

# --- 6) (Tuy chon) commit + push ---
if ($Push) {
    Push-Location $root
    try {
        git add manifest.json release/funnygame.crx release/update.xml $extFiles $extDirs 2>$null
        $msg = "Phat hanh v$newVersion"
        git commit -m $msg | Out-Null
        Write-Host "Da commit: $msg" -ForegroundColor Green
        git push origin main
        Write-Host "Da push len origin/main" -ForegroundColor Green
    }
    finally { Pop-Location }
}
else {
    Write-Host ""
    Write-Host "Chua push. Chay lai voi -Push de day len GitHub, hoac tu commit thu cong." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "HOAN TAT v$newVersion. Cac may da cai se tu dong nang cap qua Chrome (kiem tra update dinh ky)." -ForegroundColor Cyan
Write-Host "Muon nang ngay: mo chrome://extensions -> bat Developer mode -> Update, hoac khoi dong lai Chrome." -ForegroundColor DarkGray
