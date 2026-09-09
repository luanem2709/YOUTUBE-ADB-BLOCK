$ErrorActionPreference = "Stop"
$work = Join-Path $env:TEMP "luanem2709-setup"
$patchScript = "C:\Users\Xiata\Desktop\youtube-admain\scripts\patch-github-links.py"

function Get-GitHubToken {
    $inputText = "protocol=https`nhost=github.com`n`n"
    $raw = $inputText | git credential fill 2>$null
    if (-not $raw) { return $null }
    $pass = ($raw -split "`n" | Where-Object { $_ -like "password=*" }) -replace "password=", ""
    return $pass
}

function Invoke-GitHubApi {
    param(
        [string]$Method,
        [string]$Uri,
        [object]$Body = $null
    )
    $token = Get-GitHubToken
    if (-not $token) { throw "Khong lay duoc GitHub token tu git credential." }
    $headers = @{
        Authorization = "Bearer $token"
        Accept = "application/vnd.github+json"
        "X-GitHub-Api-Version" = "2022-11-28"
    }
    if ($Body) {
        $json = $Body | ConvertTo-Json -Depth 6
        return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers -Body $json -ContentType "application/json; charset=utf-8"
    }
    return Invoke-RestMethod -Method $Method -Uri $Uri -Headers $headers
}

if (Test-Path $work) { Remove-Item -Recurse -Force $work }
New-Item -ItemType Directory -Force -Path $work | Out-Null
Set-Location $work

Write-Host "=== 1. Profile README luanem2709/luanem2709 ===" -ForegroundColor Cyan
if (Test-Path "luanem2709") { Remove-Item -Recurse -Force "luanem2709" }
git clone --depth 1 https://github.com/luanem2709/Xiata279.git luanem2709-src
New-Item -ItemType Directory -Force -Path "profile-readme" | Out-Null
Copy-Item "luanem2709-src\README.md" "profile-readme\README.md"
python $patchScript (Join-Path $work "profile-readme")
Move-Item -Force "profile-readme\README.md" "README.md"
$notice = @"

---

> Profile chinh: [github.com/luanem2709](https://github.com/luanem2709) · Portfolio: [luanem2709.github.io/portfolio-thanhluan](https://luanem2709.github.io/portfolio-thanhluan/)
"@
if (-not (Select-String -Path "README.md" -Pattern "Profile chinh" -Quiet)) {
    Add-Content -Path "README.md" -Value $notice -Encoding UTF8
}

try {
    Invoke-GitHubApi -Method POST -Uri "https://api.github.com/user/repos" -Body @{
        name = "luanem2709"
        description = "Profile README - Nguyen Thanh Luan"
        homepage = "https://luanem2709.github.io/portfolio-thanhluan/"
        private = $false
        auto_init = $false
    } | Out-Null
    Write-Host "Created repo luanem2709/luanem2709"
} catch {
    if ($_.Exception.Message -notmatch "already exists|name already exists") { throw }
    Write-Host "Repo luanem2709/luanem2709 da ton tai"
}

git init -b main
git add README.md
git commit -m "Tao profile README chinh cho luanem2709"
git remote add origin https://github.com/luanem2709/luanem2709.git
git push -u origin main --force
Write-Host "Pushed profile README" -ForegroundColor Green

Write-Host "`n=== 2. Bat GitHub Pages portfolio-thanhluan ===" -ForegroundColor Cyan
try {
    Invoke-GitHubApi -Method POST -Uri "https://api.github.com/repos/luanem2709/portfolio-thanhluan/pages" -Body @{
        source = @{ branch = "master"; path = "/" }
    } | Out-Null
    Write-Host "Pages enabled" -ForegroundColor Green
} catch {
    if ($_.Exception.Message -match "409|already exists") {
        Invoke-GitHubApi -Method PUT -Uri "https://api.github.com/repos/luanem2709/portfolio-thanhluan/pages" -Body @{
            source = @{ branch = "master"; path = "/" }
        } | Out-Null
        Write-Host "Pages updated" -ForegroundColor Green
    } else { throw }
}

Write-Host "`n=== 3. J2EE default branch ===" -ForegroundColor Cyan
if (Test-Path "j2ee") { Remove-Item -Recurse -Force "j2ee" }
git clone https://github.com/luanem2709/J2EE-PhatTrienUngDung.git j2ee
Set-Location j2ee
git push origin "Buổi-3:main"
Invoke-GitHubApi -Method PATCH -Uri "https://api.github.com/repos/luanem2709/J2EE-PhatTrienUngDung" -Body @{
    default_branch = "main"
} | Out-Null
Write-Host "Default branch -> main" -ForegroundColor Green
Set-Location $work

Write-Host "`n=== 4. Archive Xiata279 ===" -ForegroundColor Cyan
if (Test-Path "xiata-archive") { Remove-Item -Recurse -Force "xiata-archive" }
git clone --depth 1 https://github.com/luanem2709/Xiata279.git xiata-archive
Set-Location xiata-archive
@'
# Da chuyen sang tai khoan chinh

Tai khoan GitHub da chuyen sang **[luanem2709](https://github.com/luanem2709)**.

- Profile: https://github.com/luanem2709
- Portfolio: https://luanem2709.github.io/portfolio-thanhluan/

Repo nay da duoc archive de giu lich su cu.
'@ | Set-Content -Path "README.md" -Encoding UTF8
git add README.md
git commit -m "Chuyen huong sang luanem2709 truoc khi archive"
git push origin main
Set-Location $work
Invoke-GitHubApi -Method PATCH -Uri "https://api.github.com/repos/luanem2709/Xiata279" -Body @{
    archived = $true
    description = "Da chuyen sang https://github.com/luanem2709 (archived)"
} | Out-Null
Write-Host "Xiata279 archived" -ForegroundColor Green

Write-Host "`n=== Hoan tat ===" -ForegroundColor Green
