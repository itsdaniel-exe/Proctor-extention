# Re-vendor the ONNX Runtime Web files used by monitoring.html for YOLO
# inference (Chrome MV3 extension pages block CDN scripts via CSP, so
# onnxruntime-web has to ship inside lib/ like the Firebase compat SDKs do).
# Right-click this file and select "Run with PowerShell", or run:
#   powershell -ExecutionPolicy Bypass -File download-onnxruntime.ps1
#
# Requires Node.js/npm to be installed (uses `npm pack` to fetch the package
# without adding it as a project dependency - this repo has no build step).

$ErrorActionPreference = "Stop"
$version = "1.16.3"
$libDir = Join-Path $PSScriptRoot "lib"
$tempDir = Join-Path $env:TEMP "onnxruntime-web-download"

Write-Host "Downloading onnxruntime-web@$version via npm pack..." -ForegroundColor Green

New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
New-Item -ItemType Directory -Force -Path $libDir | Out-Null

Push-Location $tempDir
try {
    npm pack "onnxruntime-web@$version" | Out-Null
    $tarball = Get-ChildItem -Filter "onnxruntime-web-*.tgz" | Select-Object -First 1
    if (-not $tarball) {
        throw "npm pack did not produce a .tgz file"
    }

    tar -xzf $tarball.Name

    $distDir = Join-Path $tempDir "package\dist"

    # Only the files monitoring.html/yolo-model-loader.js actually need:
    # the minified entry point plus the non-threaded wasm binaries (threads
    # are force-disabled in yolo-model-loader.js since extension pages
    # aren't cross-origin-isolated, so the threaded/simd-threaded variants
    # aren't vendored to keep the repo smaller).
    $filesToCopy = @("ort.min.js", "ort-wasm.wasm", "ort-wasm-simd.wasm")

    foreach ($file in $filesToCopy) {
        $src = Join-Path $distDir $file
        if (Test-Path $src) {
            Copy-Item $src -Destination $libDir -Force
            Write-Host "Copied: $file" -ForegroundColor Green
        } else {
            Write-Host "Missing expected file: $file" -ForegroundColor Red
        }
    }
} finally {
    Pop-Location
    Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue
}

Write-Host "Done. lib/ now contains the vendored ONNX Runtime Web files." -ForegroundColor Cyan
