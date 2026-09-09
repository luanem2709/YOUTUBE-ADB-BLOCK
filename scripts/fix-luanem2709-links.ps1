$ErrorActionPreference = "Stop"
$work = Join-Path $env:TEMP "luanem2709-github-fix"
$script = "C:\Users\Xiata\Desktop\youtube-admain\scripts\patch-github-links.py"
$repos = @(
    "portfolio-thanhluan",
    "PokerNow-assistive-tool",
    "MaDao-Ticket-NodeJS",
    "Xiata279"
)

New-Item -ItemType Directory -Force -Path $work | Out-Null
Set-Location $work

foreach ($repo in $repos) {
    $dir = Join-Path $work $repo
    if (Test-Path $dir) { Remove-Item -Recurse -Force $dir }
    Write-Host "`n=== Clone $repo ===" -ForegroundColor Cyan
    git clone --depth 1 "https://github.com/luanem2709/$repo.git" $dir
    python $script $dir
    Set-Location $dir
    git add -A
    $status = git status --porcelain
    if (-not $status) {
        Write-Host "No changes in $repo" -ForegroundColor Yellow
    } else {
        git commit -m "Chuyển link GitHub sang luanem2709"
        git push origin HEAD
        Write-Host "Pushed $repo" -ForegroundColor Green
    }
    Set-Location $work
}

Write-Host "`nDone." -ForegroundColor Green
