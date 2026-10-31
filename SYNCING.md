# Syncing with upstream and releasing to AMO

This repo is a Firefox fork of [mfreed7/xslt_extension](https://github.com/mfreed7/xslt_extension) (the Chrome extension). Upstream mostly ships new builds of `xslt-polyfill.min.js` (from [mfreed7/xslt_polyfill](https://github.com/mfreed7/xslt_polyfill)) and version bumps. This fork carries a few Firefox-only changes on top, which must survive every sync:

- `manifest.json`: the `browser_specific_settings` block (`gecko` and `gecko_android`: add-on ID `@xslt-polyfill.zcorpan`, `strict_min_version`, `data_collection_permissions`).
- `README.md`: Firefox/AMO wording and links.
- `BUILD.md`, `SYNCING.md`, `.gitignore`, `web-ext-config.mjs`, `scripts/rebuild-polyfill.mjs`, `test/`.

Everything else (`content.js`, `xslt-polyfill.min.js`, and `xslt-extension.js`, which `scripts/bundle.mjs` generates from those two) should match upstream. The `version` in `manifest.json` matches upstream, except for Firefox-only releases between upstream versions, which add a fourth component (`1.0.25.1`) so the next upstream version (`1.0.26`) still sorts higher.

Don't publish until steps 2 and 3 pass. If the new upstream version fails them, ship the previous `min.js`, or fix it locally (e.g. an option in `content.js`'s `xsltPolyfillOptions`, then `node scripts/bundle.mjs`) and release a fourth-component version.

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
- `xslt-polyfill.min.js`: take upstream's (`git checkout --theirs xslt-polyfill.min.js`), unless steps 2 or 3 say otherwise.
- `content.js`: take upstream's. Prefer upstreaming fixes as PRs to mfreed7/xslt_extension.
- `xslt-extension.js`: regenerate it with `node scripts/bundle.mjs`; with upstream's `content.js` and `min.js` it should match upstream's.

Then check that the only remaining differences from upstream are the Firefox-only changes listed above:

```sh
git add -A
git diff --cached upstream/main
git commit -m "Merge upstream/main (X.Y.Z)"
```

## 2. Verify the polyfill build

`xslt-polyfill.min.js` is 1.4 MB of minified code, too big to review directly. Instead, show that it's an exact build of polyfill source you can review (step 3).

Find the mfreed7/xslt_polyfill commit (`NEW`) whose committed `min.js` matches, and the commit the previously shipped one came from (`OLD`, from the previous sync's commit message or the same hash lookup on the previous `min.js`):

```sh
cd ../xslt_polyfill   # clone of mfreed7/xslt_polyfill
git fetch origin
shasum -a 256 ../xslt_extension/xslt-polyfill.min.js
for c in $(git log --format=%h -15 origin/main -- xslt-polyfill.min.js); do echo "$c $(git show $c:xslt-polyfill.min.js | shasum -a 256)"; done
```

Then rebuild it from source. `min.js` is `COPYRIGHT` plus terser's output for the emscripten bundle `dist/xslt-wasm.js` concatenated with `src/xslt-polyfill-src.js`. The emscripten bundle isn't committed, but it ships in the npm package; use the npm version published right after `NEW` (`npm view xslt-polyfill time`), whose own `min.js` should have the same hash. Do this in a scratch directory outside the repo:

```sh
mkdir -p /tmp/xslt-verify/tools /tmp/xslt-verify/src /tmp/xslt-verify/npm
cd /tmp/xslt-verify/tools && npm init -y >/dev/null && npm install terser@5.50.0
cd /tmp/xslt-verify/npm && npm pack xslt-polyfill@<npm version> && tar xzf xslt-polyfill-*.tgz
git -C ~/git/zcorpan/xslt_polyfill show NEW:src/xslt-polyfill-src.js > /tmp/xslt-verify/src/xslt-polyfill-src.js
git -C ~/git/zcorpan/xslt_polyfill show NEW:COPYRIGHT > /tmp/xslt-verify/src/COPYRIGHT
cd /tmp/xslt-verify/tools && node ~/git/zcorpan/xslt_extension/scripts/rebuild-polyfill.mjs \
  ../npm/package/dist/xslt-wasm.js ../src/xslt-polyfill-src.js ../src/COPYRIGHT ../rebuilt.min.js
cmp ../rebuilt.min.js ~/git/zcorpan/xslt_extension/xslt-polyfill.min.js && echo IDENTICAL
```

If it isn't identical, try the terser version from the polyfill's `package-lock.json` (if any) or upstream's `node_modules`. Don't ship a build you can't reproduce. If upstream's build is stale (missing a source fix that matters), you can ship your own rebuild from the same inputs instead, and say which polyfill commit it's from in the commit message.

`dist/xslt-wasm.js` (emscripten glue plus the embedded Wasm binary, built from `src/transform.c` and the `src/libxml2` and `src/libxslt` submodules) isn't reproduced here, since that needs the same emscripten toolchain. To limit what you're trusting:

- The Wasm binary can only reach the page through the glue's imports. List them and compare with the previous npm version (BSD `grep` can't handle the file's long lines):

  ```sh
  python3 -I -c "import re,sys;print(sorted(p.split(':')[1] for p in re.search(r'wasmImports\s*=\s*\{([^}]*)\}',open(sys.argv[1]).read()).group(1).split(',')))" npm/package/dist/xslt-wasm.js
  ```

  Expect only emscripten's in-memory syscalls plus `fetch_and_load_document`, `js_collate`, and `clear_collate_cache` (the `EM_JS` functions in `src/transform.c`). A new import means new capability; review it.
- Review `git diff OLD NEW -- src/transform.c Makefile` (step 3).
- Check whether the submodule pins changed (`git diff OLD NEW -- src/libxml2 src/libxslt`). If they did, look at the libxml2/libxslt changes in between and any security advisories. If they haven't changed in a long time, check advisories for the pinned versions anyway.

## 3. Security review

### Threat model

`manifest.json` injects `xslt-extension.js` (`content.js` and the polyfill, wrapped in one function by `scripts/bundle.mjs`) into every page and frame (`<all_urls>`, `all_frames`, `document_start`), in the page's own JS world (`"world": "MAIN"`). The extension has no permissions, background script, web-accessible resources or message listeners, so there's no privileged context to attack. The risk is what its scripts do on every site, with that site's privileges.

The rule to hold it to: **a page must not be able to do anything through the extension that it couldn't do without it.** Review for two attackers, in two browser states:

- Attackers: (1) a page the user visits that the attacker controls (navigating to or framing a victim page counts); (2) content the attacker got onto a victim page or file (user-generated content, an upload, a feed item), which is safe without the extension but unsafe with it.
- States: native XSLT available (Firefox Nightly today), where the extension should be fully dormant; and native XSLT missing (Chrome Canary today, Firefox with `dom.xslt.enabled=false`), where the polyfill is active and must not be more permissive than native XSLT was.

Properties to check for:

- **Dormant while native XSLT exists.** No globals, no prototype patches, no replaced `XSLTProcessor` (`test/security.html` section A).
- **Same inputs transform as native XSLT did.** Native XSLT only honors `<?xml-stylesheet?>` in the prolog; fetches stylesheets, imports and `document()` same-origin (Chromium: `RequestMode::kSameOrigin`); applies CSP `script-src` to them; and keeps data as data. Anything the polyfill accepts beyond that is a new capability for attackers.
- **Content can't steer the polyfill.** Document and element content (including `<form>` controls, and elements named like properties) must not change which code runs or break it.

### Reviewing

Review `git diff OLD NEW -- src scripts Makefile` in the polyfill repo, plus any upstream changes to `content.js` and `manifest.json`, looking for:

- **Reach.** Changes to defaults or flags (`xsltUsePolyfillOnlyIfNeeded`, `xsltUsePolyfillAlways`, `xsltDontAutoloadXmlDocs`, the native-support detection), or to `matches`, `all_frames`, `world`, or permissions in the manifest. Anything that makes the polyfill run where it didn't before has to be undone locally (e.g. in `content.js`'s `xsltPolyfillOptions`).
- **Global side effects.** New `window.*` globals and new prototype patches (`Document.prototype`, `Element.prototype`, `Node.prototype`). Patches must apply only to the document being polyfilled, never to every page.
- **HTML sinks.** `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `setHTMLUnsafe`, `document.write`, `DOMParser` with `text/html`, and script elements that get created or re-run. Check where their input comes from: XML or XSLT data, error messages, URLs.
- **Serialize-then-reparse.** Native XSLT builds the result DOM directly. The polyfill serializes libxslt's output to text and reparses it. Anywhere text gets decoded twice (e.g. raw-text elements, entity decoding of script text), data can turn into markup or script.
- **Network and data.** New `fetch` or other requests. They should only go to URLs the page provides (stylesheets, `document()`, the document itself), never to hard-coded hosts. Anything else breaks `data_collection_permissions: none`.
- **Code execution.** `eval`, `new Function`, `setTimeout` with strings, or new Wasm imports.
- **Stylesheet discovery.** How the stylesheet PI is found (`content.js`, `loadXmlWithXsltFromBytes()`). Matching text in the first bytes with a regex also matches CDATA and comments, which user content controls (feeds, uploaded SVG/XHTML); it should come from PIs in the parsed prolog.
- **Load mode.** How stylesheets, `xsl:import`/`xsl:include` and `document()` are fetched (`loadDoc()`, `fetch_and_load_document`). Plain `fetch()` accepts `data:` and CORS cross-origin URLs and ignores `script-src`, unlike native XSLT; expect `mode: 'same-origin'` and `data:` rejected.
- **DOM clobbering.** `<form>` controls shadow the form's own members, and named elements (`embed`, `form`, `iframe`, `img` and `object` by `name`; `object`, and `img` that also has a `name`, by `id`) shadow members of the live `document`. Property access on the page's `document` or on elements from page or output content (`document.createElementNS`, `el.getAttributeNames()`, `form.childNodes`) breaks on those, as do `window.*` options that a named element can shadow (the extension passes its options in scope instead). Expect those accesses to go through members looked up on the prototypes (`callOn()`/`getOn()`/`setOn()`, from mfreed7/xslt_polyfill#56); inert documents from `DOMParser` aren't affected. `location` is `[LegacyUnforgeable]` on both `document` and `window`, so it can't be shadowed.
- **Engine-dependent document checks.** `document instanceof XMLDocument` / `HTMLDocument` gives opposite answers for `application/xhtml+xml` in Firefox (`HTMLDocument`) and Chrome (`XMLDocument`), so new uses make Firefox take different code paths than the ones upstream tested. Prefer checks based on `document.contentType`.

Then run the differential tests in `test/security.html`, which compare the polyfill with native Firefox XSLT. Serve the repo root over HTTP (`python3 -m http.server 8000`) and open http://localhost:8000/test/security.html in Firefox:

- With the built zip loaded in `about:debugging` (or `web-ext run`): section A checks that the polyfill is dormant on ordinary pages and iframes (native `XSLTProcessor`, no polyfill globals or prototype patches). A must pass while Firefox has native XSLT. A dormant extension leaves no trace, so A also passes without it; check that it's loaded.
- With or without the extension: section B runs the bundled polyfill against native XSLT on inputs where data must stay data. As of polyfill 4b226b6, B1 fails and B2 passes. A new failure, or a fix that makes B1 pass, is worth noting in the release notes.
  - B1 (data in `<style>`/`<script>` via `transformToFragment()`) is an accepted risk. With `<xsl:output method="html"/>`, libxslt writes `script`/`style` content unescaped (XSLT 1.0 §16.2), and the polyfill reparses the result as HTML, so data containing `</style>` breaks out. Chrome's native XSLT does the same (it reparses libxslt's output too); Firefox's native XSLT builds the DOM directly and keeps the data as text. It only matters for pages whose own stylesheet puts untrusted data in `<style>`/`<script>`, and only while the polyfill is active (native XSLT missing).
  - B2 (entity-like data re-decoded in output `<script>`) was a polyfill bug, fixed in mfreed7/xslt_polyfill@a56ca31.

How to test the "native XSLT missing" state:

- Firefox Nightly: start it with `user_pref("dom.xslt.enabled", false);` in the profile's `user.js` (a throwaway profile), and install the extension (unpacked, via `about:debugging` or WebDriver BiDi `webExtension.install`). Serve a "victim" origin and an "attacker" origin on different ports (`127.0.0.1` and `localhost`) with a small Python server; compare each case without the extension, with it, and with native XSLT on.
- Chrome Canary has no native XSLT. The MCP-driven browser can't load extensions, so evaluate `xslt-extension.js` in the page after load: `(0, eval)(await (await fetch('/xslt-extension.js')).text())`. That bypasses CSP and `document_start`, so check CSP and early-load behavior in Firefox.

When a review finding is a new kind of bug, add a case to `test/security.html` that fails on the bad build. Report polyfill security bugs to mfreed7 privately. If private vulnerability reporting isn't enabled on the repo (it wasn't in October 2026), email him and ask him to enable it (Settings, Code security); don't open a public issue or PR that describes the exploit. Fixes for non-exploitable robustness bugs can go straight to a PR.

## 4. Build, lint, and test

Requires [`web-ext`](https://github.com/mozilla/web-ext) (`npm install -g web-ext`). `web-ext-config.mjs` keeps `test/` and `scripts/` out of the package.

```sh
web-ext lint     # expect 0 errors; innerHTML warnings in xslt-polyfill.min.js and xslt-extension.js are known
web-ext build --overwrite-dest --artifacts-dir ../web-ext-artifacts
```

This produces `../web-ext-artifacts/xslt_polyfill-X.Y.Z.zip`. Load it in Firefox (`about:debugging` or `web-ext run`) and open a local XML file with an `<?xml-stylesheet type="text/xsl" href="...">` processing instruction, served over HTTP. While Firefox has native XSLT, Firefox itself does the transform and the console says the extension isn't running. The extension only transforms when native XSLT is missing. Also run section A of `test/security.html` with this build.

## 5. Push to GitHub

```sh
git push origin main
```

## 6. Submit to AMO

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

`xslt-polyfill.min.js` is minified, so AMO may ask for source code. Point reviewers at the mfreed7/xslt_polyfill commit it was built from and the npm version providing `dist/xslt-wasm.js` (step 2), plus `scripts/rebuild-polyfill.mjs`. `xslt-extension.js` is `content.js` plus that `min.js`, wrapped by `scripts/bundle.mjs`.
