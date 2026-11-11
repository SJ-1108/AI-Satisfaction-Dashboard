# 피드백 자동분류 배포 실행 파일 빌드: dist\불만족평가_피드백_자동분류_v<VERSION>.exe (단일 파일, 설치 불필요)
# 실행: powershell -ExecutionPolicy Bypass -File tools\judge\release\build-release.ps1 [-SkipNode]
#   -SkipNode : 포터블 Node 다운로드 생략(테스트용, 실행 PC에 node 가 있어야 함)
# 필요한 것: Windows 내장 csc.exe(.NET Framework 4), npm(xlsx 패키지 설치용), 인터넷(처음 한 번 Node zip 다운로드)
param([switch]$SkipNode)
$ErrorActionPreference = 'Stop'
$NodeVersion = 'v24.15.0'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$ver = (Get-Content (Join-Path $repo 'tools\judge\VERSION') -Raw).Trim()
$dist = Join-Path $repo 'dist'
$stage = Join-Path $dist 'stage'
$payload = Join-Path $dist 'payload.zip'
$exe = Join-Path $dist "불만족평가_피드백_자동분류_v$ver.exe"
New-Item -ItemType Directory -Force $dist | Out-Null

Write-Host "== 피드백 자동분류 $ver 빌드"
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force $stage | Out-Null

# 1) 판정 도구 본체 (프롬프트·참조 문서·스크립트·버전)
foreach ($d in 'prompts', 'docs', 'scripts') {
  Copy-Item (Join-Path $repo "tools\judge\$d") (Join-Path $stage "tools\judge\$d") -Recurse
}
Remove-Item (Join-Path $stage 'tools\judge\prompts\archive') -Recurse -Force -ErrorAction SilentlyContinue
foreach ($f in 'VERSION', 'CHANGELOG.md') { Copy-Item (Join-Path $repo "tools\judge\$f") (Join-Path $stage "tools\judge\$f") }
New-Item -ItemType Directory -Force (Join-Path $stage 'tools\judge\output') | Out-Null
Copy-Item (Join-Path $repo 'tools\judge\VERSION') $stage
Copy-Item (Join-Path $repo 'tools\judge\CHANGELOG.md') $stage

# 2) Claude Code 명령
Copy-Item (Join-Path $repo '.claude\skills\판정') (Join-Path $stage '.claude\skills\판정') -Recurse

# 3) xlsx 패키지 (의존성 포함)
$xlsxVer = (Get-Content (Join-Path $repo 'node_modules\xlsx\package.json') -Raw | ConvertFrom-Json).version
@{ name = 'judge-runner'; version = $ver; private = $true; dependencies = @{ xlsx = $xlsxVer } } | ConvertTo-Json | Set-Content (Join-Path $stage 'package.json') -Encoding utf8
Push-Location $stage
try { & npm install --no-audit --no-fund --no-package-lock --omit=dev --silent; if ($LASTEXITCODE -ne 0) { throw 'npm install 실패' } }
finally { Pop-Location }

# 4) 포터블 Node (node.exe 하나만)
if (-not $SkipNode) {
  $nodeZip = Join-Path $dist "node-$NodeVersion-win-x64.zip"
  if (-not (Test-Path $nodeZip)) {
    Write-Host "== Node $NodeVersion 다운로드"
    Invoke-WebRequest "https://nodejs.org/dist/$NodeVersion/node-$NodeVersion-win-x64.zip" -OutFile $nodeZip
  }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $za = [IO.Compression.ZipFile]::OpenRead($nodeZip)
  try {
    $entry = $za.Entries | Where-Object { $_.FullName -eq "node-$NodeVersion-win-x64/node.exe" }
    if (-not $entry) { throw 'node.exe 항목을 zip에서 찾지 못함' }
    New-Item -ItemType Directory -Force (Join-Path $stage 'runtime') | Out-Null
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, (Join-Path $stage 'runtime\node.exe'), $true)
  } finally { $za.Dispose() }
}

# 5) payload.zip (항목 이름 UTF-8 — 런처가 UTF-8 로 읽는다)
Add-Type -AssemblyName System.IO.Compression.FileSystem
if (Test-Path $payload) { Remove-Item $payload -Force }
[IO.Compression.ZipFile]::CreateFromDirectory($stage, $payload, [IO.Compression.CompressionLevel]::Optimal, $false, [Text.Encoding]::UTF8)

# 6) 런처 exe 컴파일 (payload.zip 을 리소스로 내장)
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path $csc)) { $csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path $csc)) { throw 'csc.exe 를 찾지 못함 (.NET Framework 4 필요)' }
$verCs = Join-Path $dist 'Version.cs'
"static class Version { public const string Value = `"$ver`"; }" | Set-Content $verCs -Encoding utf8
# csc 는 한글 출력 경로를 못 받으므로 영문 임시 이름으로 만든 뒤 바꾼다
$tmpExe = Join-Path $dist 'judge_launcher.exe'
if (Test-Path $exe) { Remove-Item $exe -Force }
if (Test-Path $tmpExe) { Remove-Item $tmpExe -Force }
& $csc /nologo /target:exe /platform:anycpu /optimize+ /out:"$tmpExe" `
  /r:System.dll /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll /r:System.Windows.Forms.dll /r:System.Web.Extensions.dll `
  /resource:"$payload,payload.zip" (Join-Path $PSScriptRoot 'launcher\Program.cs') $verCs
if ($LASTEXITCODE -ne 0) { throw 'csc 컴파일 실패' }
Move-Item $tmpExe $exe -Force

$size = [math]::Round((Get-Item $exe).Length / 1MB, 1)
Write-Host "== 완료: $exe ($size MB)"
