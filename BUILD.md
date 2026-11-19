# Building

`xslt-extension.js` is generated: `scripts/bundle.mjs` wraps `content.js` and `xslt_polyfill/xslt-polyfill.min.js` in one function. `xslt-polyfill.min.js` is built from the [mfreed7/xslt_polyfill](https://github.com/mfreed7/xslt_polyfill) submodule (pinned commit): `src/xslt-polyfill-src.js` and `src/transform.c`, with libxml2 and libxslt (its submodules, compiled to Wasm with emscripten), minified with terser. This repo is a Firefox fork of [mfreed7/xslt_extension](https://github.com/mfreed7/xslt_extension); its `README.md` describes the polyfill's build.

## Tools

- Node.js and npm (Node 24, npm 11 were used).
- emscripten (`emcc`, `emconfigure`, `emmake` on `PATH`), `make`, autotools (`autoconf`, `automake`, `libtool`, `pkg-config`). The emscripten version isn't pinned by the polyfill repo; the committed `xslt-polyfill.min.js` was built by the polyfill's maintainer, so a rebuild may differ byte for byte (see below).

## Commands

```sh
git submodule update --init --recursive
node scripts/bundle.mjs      # npm install + npm run build in xslt_polyfill/, then writes xslt-extension.js
```

The source package for AMO has the submodules checked out already (`python3 scripts/source-zip.py`).

## Checking without the Wasm toolchain

The polyfill repo commits its `xslt-polyfill.min.js`. `xslt-extension.js` must be exactly `content.js` and that file in the wrapper (SYNCING.md step 2 has a script). Rebuilding `xslt-polyfill.min.js` itself needs the toolchain above and `npm run build` in `xslt_polyfill/`.

To sync with upstream and release a new version, see [SYNCING.md](SYNCING.md).
