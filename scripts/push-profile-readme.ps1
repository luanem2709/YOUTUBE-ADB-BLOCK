$ErrorActionPreference = "Stop"
$readme = "C:\Users\Xiata\Desktop\youtube-admain\scripts\profile-readme-luanem2709.md"
$work = Join-Path $env:TEMP "luanem2709-profile-push"
if (Test-Path $work) { Remove-Item -Recurse -Force $work }
New-Item -ItemType Directory -Force -Path $work | Out-Null
Copy-Item $readme (Join-Path $work "README.md")
Set-Location $work
git init -b main
git add README.md
git commit -m "Tao profile README chinh cho luanem2709"
git remote add origin "https://luanem2709@github.com/luanem2709/luanem2709.git"
git push -u origin main --force
Write-Host "Profile README da push thanh cong." -ForegroundColor Green
