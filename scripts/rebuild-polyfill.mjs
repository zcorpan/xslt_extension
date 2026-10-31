// Rebuilds xslt-polyfill.min.js the way mfreed7/xslt_polyfill's scripts/combine.js does:
// COPYRIGHT + '\n' + terser(xslt-wasm.js + '\n' + xslt-polyfill-src.js).
// Run from a directory where terser is installed; see SYNCING.md.
import fs from 'node:fs';
import { createRequire } from 'node:module';

const { minify } = createRequire(`${process.cwd()}/`)('terser');
const [wasmFile, srcFile, copyrightFile, outFile] = process.argv.slice(2);
if (!outFile) {
  console.error('Usage: node rebuild-polyfill.mjs <dist/xslt-wasm.js> <src/xslt-polyfill-src.js> <COPYRIGHT> <out.min.js>');
  process.exit(1);
}
const combined = fs.readFileSync(wasmFile, 'utf8') + '\n' + fs.readFileSync(srcFile, 'utf8');
const { code } = await minify(combined, { compress: true, mangle: true });
fs.writeFileSync(outFile, fs.readFileSync(copyrightFile, 'utf8') + '\n' + code);
