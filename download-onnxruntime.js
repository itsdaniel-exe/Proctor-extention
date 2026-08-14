// Re-vendor the ONNX Runtime Web files used by monitoring.html for YOLO
// inference. Run with: node download-onnxruntime.js
//
// The extension's CSP (script-src 'self') blocks loading onnxruntime-web
// from a CDN, so it has to be vendored locally in lib/ the same way the
// Firebase compat SDKs are vendored at the project root (see
// download-firebase.js). This uses `npm pack` under the hood so the package
// never becomes a real dependency of this build-step-free project.

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const VERSION = '1.16.3';
const LIB_DIR = path.join(__dirname, 'lib');
// Threaded/simd-threaded wasm variants are intentionally skipped: extension
// pages aren't cross-origin-isolated (no SharedArrayBuffer), so
// yolo-model-loader.js forces ort.env.wasm.numThreads = 1, which only ever
// needs the non-threaded binaries below.
const FILES_TO_COPY = ['ort.min.js', 'ort-wasm.wasm', 'ort-wasm-simd.wasm'];

function main() {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'onnxruntime-web-'));

    try {
        console.log(`Downloading onnxruntime-web@${VERSION} via npm pack...`);
        execSync(`npm pack onnxruntime-web@${VERSION}`, { cwd: tempDir, stdio: 'inherit' });

        const tarball = fs.readdirSync(tempDir).find(f => f.startsWith('onnxruntime-web-') && f.endsWith('.tgz'));
        if (!tarball) {
            throw new Error('npm pack did not produce a .tgz file');
        }

        execSync(`tar -xzf "${tarball}"`, { cwd: tempDir, stdio: 'inherit' });

        const distDir = path.join(tempDir, 'package', 'dist');
        fs.mkdirSync(LIB_DIR, { recursive: true });

        for (const file of FILES_TO_COPY) {
            const src = path.join(distDir, file);
            const dest = path.join(LIB_DIR, file);
            if (fs.existsSync(src)) {
                fs.copyFileSync(src, dest);
                console.log(`Copied: ${file}`);
            } else {
                console.error(`Missing expected file: ${file}`);
            }
        }

        console.log('Done. lib/ now contains the vendored ONNX Runtime Web files.');
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

main();
