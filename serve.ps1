# Minimal static file server using .NET HttpListener.
# Used only for local preview — production is served by Vercel.
param(
  [int]$Port = 5050,
  [string]$Root = $PSScriptRoot
)

$ErrorActionPreference = "Stop"

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "text/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".woff2"= "font/woff2"
  ".map"  = "application/json"
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving '$Root' at http://localhost:$Port/"

try {
  while ($listener.IsListening) {
    $context  = $listener.GetContext()
    $request  = $context.Request
    $response = $context.Response

    # Close each connection instead of keeping it alive. Lingering keep-alive
    # sockets read as "active network" to headless browsers and prevent the
    # network-idle state that screenshot/preview tooling waits for.
    $response.KeepAlive = $false

    # HEAD requests (used for health checks) must not carry a body.
    $isHead = $request.HttpMethod -eq "HEAD"
    Write-Host "$($request.HttpMethod) $($request.Url.AbsolutePath)"

    try {
      $rel = [System.Uri]::UnescapeDataString($request.Url.AbsolutePath.TrimStart("/"))
      if ([string]::IsNullOrWhiteSpace($rel)) { $rel = "index.html" }

      $path = Join-Path $Root $rel
      # Prevent path traversal outside the served root.
      $fullRoot = [System.IO.Path]::GetFullPath($Root)
      $fullPath = [System.IO.Path]::GetFullPath($path)

      # Directory request (e.g. /baseball/) -> serve its index.html, matching Vercel.
      if (Test-Path $fullPath -PathType Container) {
        $fullPath = Join-Path $fullPath "index.html"
      }

      if ($fullPath.StartsWith($fullRoot) -and (Test-Path $fullPath -PathType Leaf)) {
        $ext = [System.IO.Path]::GetExtension($fullPath).ToLower()
        $type = $mime[$ext]
        if (-not $type) { $type = "application/octet-stream" }
        $bytes = [System.IO.File]::ReadAllBytes($fullPath)
        $response.ContentType = $type
        $response.ContentLength64 = $bytes.Length
        if (-not $isHead) { $response.OutputStream.Write($bytes, 0, $bytes.Length) }
      } else {
        $response.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
        $response.ContentLength64 = $msg.Length
        if (-not $isHead) { $response.OutputStream.Write($msg, 0, $msg.Length) }
      }
    } catch {
      # Never let a single bad request take down the listener loop.
      Write-Host "Request error: $($_.Exception.Message)"
    } finally {
      $response.OutputStream.Close()
    }
  }
} finally {
  $listener.Stop()
}
