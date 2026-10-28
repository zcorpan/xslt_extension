# Syncing with upstream and releasing to AMO

This repo is a Firefox fork of [mfreed7/xslt_extension](https://github.com/mfreed7/xslt_extension) (the Chrome extension). Upstream mostly ships new builds of `xslt-polyfill.min.js` and version bumps. This fork carries a few Firefox-only changes on top, which must survive every sync:

- `manifest.json`: the `browser_specific_settings` block (`gecko` and `gecko_android`: add-on ID `@xslt-polyfill.zcorpan`, `strict_min_version`, `data_collection_permissions`).
- `README.md`: Firefox/AMO wording and links.
- `BUILD.md`, `SYNCING.md`, `.gitignore` (`web-ext-artifacts/`).

Everything else (`content.js`, `xslt-polyfill.min.js`, the `version` in `manifest.json`) should match upstream.

## 1. Merge upstream

Sync by merging, not rebasing, so `main` on `origin` never needs a force push.

```sh
git remote add upstream git@github.com:mfreed7/xslt_extension.git  # once
git checkout main
git pull origin main
git fetch upstream
git log --oneline main..upstream/main     # what's new upstream
git merge --no-ff --no-commit upstream/main
```

Expected conflicts and how to resolve them:

- `manifest.json` `version`: take upstream's value. Keep the `browser_specific_settings` block.
- `xslt-polyfill.min.js`: take upstream's (`git checkout --theirs xslt-polyfill.min.js`), unless step 2 says otherwise.
- `content.js`: take upstream's, unless a Firefox fix there hasn't landed upstream yet. Prefer upstreaming such fixes as PRs to mfreed7/xslt_extension.

Then check that the only remaining differences from upstream are the Firefox-only changes listed above:

```sh
git add -A
git diff --cached upstream/main
git commit -m "Merge upstream/main (X.Y.Z)"
```

## 2. Check the polyfill build

Find which [mfreed7/xslt_polyfill](https://github.com/mfreed7/xslt_polyfill) commit upstream's `min.js` came from, by comparing hashes against the polyfill repo's history:

```sh
cd ../xslt_polyfill   # clone of mfreed7/xslt_polyfill
git fetch origin
shasum -a 256 ../xslt_extension/xslt-polyfill.min.js
for c in $(git log --format=%h -10 origin/main -- xslt-polyfill.min.js); do echo "$c $(git show $c:xslt-polyfill.min.js | shasum -a 256)"; done
```

Then confirm that the matching commit rebuilt `min.js` from its own source (the commit touching `src/` also touches `xslt-polyfill.min.js`), and look at what changed in `src/` on polyfill `main` since. If upstream's build is stale and misses a fix that matters, rebuild it instead of taking upstream's: `scripts/combine.js` concatenates the Wasm glue with `src/xslt-polyfill-src.js` and minifies with terser. Before trusting a rebuild, reproduce a known upstream build byte-for-byte with the same toolchain, since any source change makes terser re-mangle large parts of the output and the diff is unreviewable. Note in the commit message which polyfill commit the build is from.

## 3. Build, lint, and test

Requires [`web-ext`](https://github.com/mozilla/web-ext) (`npm install -g web-ext`).

```sh
web-ext lint     # expect 0 errors; innerHTML warnings in xslt-polyfill.min.js are known
web-ext build --overwrite-dest --artifacts-dir ../web-ext-artifacts
```

This produces `../web-ext-artifacts/xslt_polyfill-X.Y.Z.zip`. Smoke test in Firefox (`web-ext run`, or load the zip in `about:debugging`) with a local XML file that has an `<?xml-stylesheet type="text/xsl" href="...">` processing instruction, served over HTTP. Check that the transformed output renders and that `XSLTProcessor.prototype.isPolyfill` exists in the page, which shows the polyfill replaced the native implementation.

## 4. Push to GitHub

```sh
git push origin main
```

## 5. Submit to AMO

Listing: https://addons.mozilla.org/en-US/firefox/addon/xslt-polyfill/ (add-on ID `@xslt-polyfill.zcorpan`). AMO rejects a version number it has seen before, so `version` must be higher than the last submitted one.

Either upload the zip at https://addons.mozilla.org/en-US/developers/addon/xslt-polyfill/versions/submit/, or use `web-ext sign` with API credentials from https://addons.mozilla.org/en-US/developers/addon/api/key/:

```sh
WEB_EXT_API_KEY=... WEB_EXT_API_SECRET=... web-ext sign --channel=listed
```

On zcorpan's machine the keys are in the macOS Keychain (shared with zcorpan/github-merge-helper-ext, since AMO API keys are per account):

```sh
WEB_EXT_API_KEY="$(security find-generic-password -s github-merge-helper-amo -a jwt-issuer -w)" \
WEB_EXT_API_SECRET="$(security find-generic-password -s github-merge-helper-amo -a jwt-secret -w)" \
web-ext sign --channel=listed
```

This takes a few minutes (validation, then approval) and downloads the signed `.xpi` to `web-ext-artifacts/`.

`xslt-polyfill.min.js` is minified, so AMO may ask for source code. Point reviewers at the mfreed7/xslt_polyfill commit it was built from (see step 2) and its README's build instructions.
