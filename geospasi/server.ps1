# ==============================================================================
# Server Proxy Peta Bidang Tanah ATR/BPN & Web Viewer Lokal
# ==============================================================================
# Port default: 8085 (Menghindari konflik port 8080 sistem)
# Menangani:
#   1. Web GUI (index.html)
#   2. Tile Proxy Resmi ATR/BPN bhumi.atrbpn.go.id/mprx/service (layer bhumi_persil)
#   3. Disk Cache Tile (Cepat & Hemat Kuota)
#   4. Reverse Geocoding API (/api/reverse-geocode)
# ==============================================================================

$port = 8085
$rootDir = $PSScriptRoot
if (-not $rootDir) { $rootDir = (Get-Location).Path }
$cacheDir = Join-Path $rootDir "cache\tiles"
if (-not (Test-Path $cacheDir)) { New-Item -ItemType Directory -Path $cacheDir -Force | Out-Null }

$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$port/"
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
} catch {
    Write-Host "[PERINGATAN] Port $port sedang dipakai. Mencoba port 8089..." -ForegroundColor Yellow
    $port = 8089
    $listener = New-Object System.Net.HttpListener
    $prefix = "http://localhost:$port/"
    $listener.Prefixes.Add($prefix)
    $listener.Start()
}

Clear-Host
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "  SERVER PROXY PETA BIDANG TANAH ATR/BPN (BHUMI WMS) BERJALAN" -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "URL Web Viewer : $prefix" -ForegroundColor White
Write-Host "Status Proxy   : AKTIF (Header Referer Bhumi terinjeksi otomatis)" -ForegroundColor Green
Write-Host "Folder Cache   : $cacheDir" -ForegroundColor Gray
Write-Host "------------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "Fitur Aktif    : WMS Tiles Persil BPN, Pin Lokasi & Info Bidang, Caching" -ForegroundColor Gray
Write-Host "Tekan Ctrl + C di jendela ini untuk menghentikan server." -ForegroundColor Yellow
Write-Host "==================================================================" -ForegroundColor Cyan

# Buka browser otomatis
Start-Process $prefix

# Base64 1x1 Transparent PNG Fallback
$transparentPng = [Convert]::FromBase64String("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=")

function Get-TileBboxMercator($x, $y, $z) {
    $originShift = 20037508.342789244
    $n = [Math]::Pow(2, $z)
    $tileSizeM = (2.0 * $originShift) / $n
    $minX = -$originShift + ($x * $tileSizeM)
    $maxX = $minX + $tileSizeM
    $maxY = $originShift - ($y * $tileSizeM)
    $minY = $maxY - $tileSizeM
    return "{0:F4},{1:F4},{2:F4},{3:F4}" -f $minX, $minY, $maxX, $maxY
}

while ($listener.IsListening) {
    try {
        $context = $listener.GetContext()
        $request = $context.Request
        $response = $context.Response
        
        # CORS Headers
        $response.AddHeader("Access-Control-Allow-Origin", "*")
        $response.AddHeader("Access-Control-Allow-Methods", "GET, OPTIONS")
        $response.AddHeader("Access-Control-Allow-Headers", "*")

        if ($request.HttpMethod -eq "OPTIONS") {
            $response.StatusCode = 200
            $response.Close()
            continue
        }

        $rawUrl = $request.RawUrl

        # 1. API Status
        if ($rawUrl -eq "/api/status") {
            $json = '{"status":"ok","service":"ATR/BPN Bhumi Persil Proxy","port":' + $port + '}'
            $buf = [System.Text.Encoding]::UTF8.GetBytes($json)
            $response.ContentType = "application/json; charset=utf-8"
            $response.ContentLength64 = $buf.Length
            $response.OutputStream.Write($buf, 0, $buf.Length)
            $response.Close()
            continue
        }

        # 2. Reverse Geocoding API: /api/reverse-geocode?lat=...&lon=...
        if ($rawUrl -match "^/api/reverse-geocode") {
            $query = $request.Url.Query
            $lat = ""
            $lon = ""
            if ($query -match "[?&]lat=([0-9\.\-]+)") { $lat = $matches[1] }
            if ($query -match "[?&]lon=([0-9\.\-]+)") { $lon = $matches[1] }

            if ($lat -and $lon) {
                $geoUrl = "https://nominatim.openstreetmap.org/reverse?format=json&lat=$lat&lon=$lon&addressdetails=1"

                try {
                    $wc = New-Object System.Net.WebClient
                    $wc.Headers.Add("User-Agent", "PetaBidangATRBPN/1.0 (local-gis-viewer)")
                    $geoJson = $wc.DownloadString($geoUrl)
                    $wc.Dispose()

                    $buf = [System.Text.Encoding]::UTF8.GetBytes($geoJson)
                    $response.ContentType = "application/json; charset=utf-8"
                    $response.ContentLength64 = $buf.Length
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                } catch {
                    $errJson = '{"error":"Gagal memanggil reverse geocoding: ' + $_.Exception.Message.Replace('"','\"') + '"}'
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($errJson)
                    $response.ContentType = "application/json; charset=utf-8"
                    $response.ContentLength64 = $buf.Length
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
            } else {
                $response.StatusCode = 400
                $errJson = '{"error":"Parameter lat dan lon dibutuhkan"}'
                $buf = [System.Text.Encoding]::UTF8.GetBytes($errJson)
                $response.ContentType = "application/json; charset=utf-8"
                $response.ContentLength64 = $buf.Length
                $response.OutputStream.Write($buf, 0, $buf.Length)
            }
        # 2b. Query Persil Info: /api/persil-info?lat=...&lng=...
        if ($rawUrl -match "^/api/persil-info") {
            $query = $request.Url.Query
            $lat = ""
            $lng = ""
            if ($query -match "[?&]lat=([0-9\.\-]+)") { $lat = $matches[1] }
            if ($query -match "[?&]lng=([0-9\.\-]+)") { $lng = $matches[1] }

            if ($lat -and $lng) {
                try {
                    $pyCmd = "import sys; sys.path.append(r'$rootDir'); from server import query_persil_at_coord; import json; print(json.dumps(query_persil_at_coord($lat, $lng)))"
                    $jsonRes = & python -c $pyCmd
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($jsonRes)
                    $response.ContentType = "application/json; charset=utf-8"
                    $response.ContentLength64 = $buf.Length
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                } catch {
                    $err = '{"found":false,"error":"Gagal memproses query persil: ' + $_.Exception.Message.Replace('"','\"') + '"}'
                    $buf = [System.Text.Encoding]::UTF8.GetBytes($err)
                    $response.ContentType = "application/json; charset=utf-8"
                    $response.ContentLength64 = $buf.Length
                    $response.OutputStream.Write($buf, 0, $buf.Length)
                }
            } else {
                $response.StatusCode = 400
                $err = '{"found":false,"error":"Parameter lat dan lng dibutuhkan"}'
                $buf = [System.Text.Encoding]::UTF8.GetBytes($err)
                $response.ContentType = "application/json; charset=utf-8"
                $response.ContentLength64 = $buf.Length
                $response.OutputStream.Write($buf, 0, $buf.Length)
            }
            $response.Close()
            continue
        }

        # 3. Tile Proxy: /persil/{z}/{x}/{y}.png
        if ($rawUrl -match "^/persil/(\d+)/(\d+)/(\d+)\.png") {
            $z = [int]$matches[1]
            $x = [int]$matches[2]
            $y = [int]$matches[3]

            $tileFolder = Join-Path $cacheDir "$z\$x"
            $tileFile = Join-Path $tileFolder "$y.png"

            # Cek Cache Lokal
            if (Test-Path $tileFile) {
                $bytes = [System.IO.File]::ReadAllBytes($tileFile)
                $response.ContentType = "image/png"
                $response.ContentLength64 = $bytes.Length
                $response.OutputStream.Write($bytes, 0, $bytes.Length)
                $response.Close()
                continue
            }

            # Hitung BBOX EPSG:3857
            $bbox = Get-TileBboxMercator $x $y $z
            $bhumiUrl = "https://bhumi.atrbpn.go.id/mprx/service?SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap&FORMAT=image/png&TRANSPARENT=true&LAYERS=bhumi_persil&STYLES=&CRS=EPSG:3857&TILED=true&WIDTH=512&HEIGHT=512&BBOX=$bbox"

            try {
                $wc = New-Object System.Net.WebClient
                $wc.Headers.Add("Referer", "https://bhumi.atrbpn.go.id/peta")
                $wc.Headers.Add("Origin", "https://bhumi.atrbpn.go.id")
                $wc.Headers.Add("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
                
                $tileBytes = $wc.DownloadData($bhumiUrl)
                $wc.Dispose()

                # Verifikasi apakah benar PNG (Magic number 89 50 4E 47)
                if ($tileBytes.Length -ge 8 -and $tileBytes[0] -eq 0x89 -and $tileBytes[1] -eq 0x50) {
                    if (-not (Test-Path $tileFolder)) { New-Item -ItemType Directory -Path $tileFolder -Force | Out-Null }
                    [System.IO.File]::WriteAllBytes($tileFile, $tileBytes)

                    $response.ContentType = "image/png"
                    $response.ContentLength64 = $tileBytes.Length
                    $response.OutputStream.Write($tileBytes, 0, $tileBytes.Length)
                } else {
                    $response.ContentType = "image/png"
                    $response.ContentLength64 = $transparentPng.Length
                    $response.OutputStream.Write($transparentPng, 0, $transparentPng.Length)
                }
            } catch {
                $response.ContentType = "image/png"
                $response.ContentLength64 = $transparentPng.Length
                $response.OutputStream.Write($transparentPng, 0, $transparentPng.Length)
            }
            $response.Close()
            continue
        }

        # 4. Static Files (index.html, css, js)
        $cleanPath = $rawUrl.Split('?')[0].TrimStart('/')
        if ([string]::IsNullOrWhiteSpace($cleanPath) -or $cleanPath -eq "/") {
            $cleanPath = "index.html"
        }

        $filePath = Join-Path $rootDir $cleanPath
        if (Test-Path $filePath -PathType Leaf) {
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
            $mime = switch ($ext) {
                ".html" { "text/html; charset=utf-8" }
                ".css"  { "text/css; charset=utf-8" }
                ".js"   { "application/javascript; charset=utf-8" }
                ".json" { "application/json; charset=utf-8" }
                ".png"  { "image/png" }
                ".jpg"  { "image/jpeg" }
                ".svg"  { "image/svg+xml" }
                default { "application/octet-stream" }
            }

            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $response.ContentType = $mime
            $response.ContentLength64 = $bytes.Length
            $response.OutputStream.Write($bytes, 0, $bytes.Length)
        } else {
            $response.StatusCode = 404
            $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
            $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
        }

        $response.Close()
    } catch {
        # Abaikan error client disconnect
    }
}
