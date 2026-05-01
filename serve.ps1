# 로컬 정적 서버 (Node/Python 없이 PowerShell만으로 동작)
# 사용법:  pwsh -ExecutionPolicy Bypass -File .\serve.ps1
# 또는:    powershell -ExecutionPolicy Bypass -File .\serve.ps1
# 기본 포트 5173. 변경: .\serve.ps1 -Port 8080

param(
  [int]$Port = 5173,
  [string]$Root = (Get-Location).Path
)

# 콘솔 출력 인코딩 UTF-8 (한글 깨짐 방지)
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
  chcp 65001 > $null
} catch {}

# localhost 와 127.0.0.1 둘 다 등록 (환경 호환성)
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Prefixes.Add("http://127.0.0.1:$Port/")
$prefix = "http://localhost:$Port/"

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.htm'  = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.mjs'  = 'application/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.ico'  = 'image/x-icon'
  '.webmanifest' = 'application/manifest+json'
  '.txt'  = 'text/plain; charset=utf-8'
}

try {
  $listener.Start()
} catch {
  Write-Host "Listener 시작 실패." -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host ""
  Write-Host "해결 방법:" -ForegroundColor Yellow
  Write-Host "  1) 다른 포트로 시도: .\serve.ps1 -Port 8080" -ForegroundColor Yellow
  Write-Host "  2) 같은 포트가 이미 사용 중인지 확인: netstat -ano | findstr :$Port" -ForegroundColor Yellow
  Write-Host "  3) 이 창을 '관리자 권한으로' 다시 실행" -ForegroundColor Yellow
  Write-Host ""
  Read-Host "엔터를 눌러 종료"
  exit 1
}

Write-Host "혈당 메모 로컬 서버" -ForegroundColor Cyan
Write-Host "  Root: $Root"
Write-Host "  URL : $prefix"
Write-Host "Ctrl+C 로 종료" -ForegroundColor Yellow
Write-Host ""

while ($listener.IsListening) {
  try {
    $context = $listener.GetContext()
  } catch {
    break
  }
  $req = $context.Request
  $res = $context.Response

  $path = [System.Uri]::UnescapeDataString($req.Url.AbsolutePath)
  if ($path -eq '/') { $path = '/index.html' }
  $localPath = Join-Path $Root ($path.TrimStart('/'))

  Write-Host "$($req.HttpMethod) $path" -ForegroundColor DarkGray

  if ((Test-Path $localPath) -and -not (Get-Item $localPath).PSIsContainer) {
    $ext = [System.IO.Path]::GetExtension($localPath).ToLower()
    $contentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
    try {
      $bytes = [System.IO.File]::ReadAllBytes($localPath)
      $res.ContentType = $contentType
      $res.ContentLength64 = $bytes.Length
      $res.Headers.Add('Cache-Control', 'no-cache')
      # SW 등록을 위해 동일 출처 정책 명확화
      $res.Headers.Add('Service-Worker-Allowed', '/')
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } catch {
      $res.StatusCode = 500
      $msg = [System.Text.Encoding]::UTF8.GetBytes("500 server error")
      $res.OutputStream.Write($msg, 0, $msg.Length)
    }
  } else {
    $res.StatusCode = 404
    $msg = [System.Text.Encoding]::UTF8.GetBytes("404 not found: $path")
    $res.ContentType = 'text/plain; charset=utf-8'
    $res.OutputStream.Write($msg, 0, $msg.Length)
  }

  try { $res.OutputStream.Close() } catch {}
}

$listener.Stop()
