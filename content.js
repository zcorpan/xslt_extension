let xslt_ext_hideRequestId = 0;

// Immediately-invoked function to start the process.
(function initTransform() {
  let nativeSupported = 'XSLTProcessor' in window && window.XSLTProcessor.toString().includes('native code');
  if (nativeSupported) {
    try {
      new XSLTProcessor();
    } catch {
      nativeSupported = false;
    }
  }
  if (nativeSupported) {
    console.log('Not running the XSLT polyfill extension because this browser supports native XSLT.');
    return;
  }

  if (document.location.protocol === 'file:') {
    console.log('XSLT polyfill extension: Fetching from file:// URLs is not supported by this extension.');
    return;
  }

  // Step 1: Immediately hide the document to prevent FOUC.
  setHidden(true);

  // Step 2: Asynchronously fetch and process the document.
  fetchAndTransform().catch((error) => {
    // Catch any errors, log them, and ensure the document is visible.
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      console.log(
        'XSLT polyfill extension: Unable to load the site via fetch. This can happen with local files (file://) or due to network errors.',
      );
    } else {
      console.error('Error during XSLT transformation:', error);
    }
    setHidden(false); // Error - stop. Make things visible again.
  });
})();

async function fetchAndTransform() {
  const response = await fetch(document.location.href);
  if (!response.ok) {
    setHidden(false); // Error - stop. Make things visible again.
    console.warn(`XSLT Polyfill: Failed to fetch document: ${response.statusText}`);
    return;
  }
  const xmlBytes = new Uint8Array(await response.arrayBuffer());

  // Decode a small chunk to check for the processing instruction.
  const decoder = new TextDecoder();
  const textChunk = decoder.decode(xmlBytes.subarray(0, 2048));

  if (textChunk.includes('<?xml-stylesheet')) {
    // PI found, proceed with transformation. The page is already hidden.
    // The polyfill's replaceDoc function will handle revealing the new content.
    try {
      await xsltPolyfillReady();
      await loadXmlWithXsltFromBytes(xmlBytes, document.location.href);
    } catch (err) {
      console.error(`Error displaying XML file: ${err.message || err.toString()}`);
    }
    console.log('XSLT Polyfill has transformed this document.');
  }
  setHidden(false);
}

function setHidden(hidden) {
  // This function needs to be robust since it's called very early at document_start.
  if (!document.body) {
    // If the body doesn't exist yet, use animation frames.
    // If we're hiding, schedule it. If we're un-hiding, cancel the scheduled hide.
    if (hidden) {
      xslt_ext_hideRequestId = requestAnimationFrame(() => setHidden(true));
    } else {
      cancelAnimationFrame(xslt_ext_hideRequestId);
    }
    return;
  }

  // Once the body exists, we can act on it directly.
  // Also cancel any pending hide request just in case.
  cancelAnimationFrame(xslt_ext_hideRequestId);

  let overlay = document.getElementById('xslt-extension-spinner');
  if (hidden) {
    if (!overlay) {
      const xmlns = 'http://www.w3.org/1999/xhtml';
      overlay = document.createElementNS(xmlns, 'div');
      overlay.id = 'xslt-extension-spinner';
      overlay.style.cssText = `
        position:fixed;
        top:0;
        left:0;
        right:0;
        bottom:0;
        background:#fff;
        z-index:2147483647;
        display:flex;
        flex-direction:column;
        align-items:center;
        justify-content:center;
        font-family:system-ui,-apple-system,sans-serif;
        color:#333;
        visibility:visible;`;
      const style = document.createElementNS(xmlns, 'style');
      style.textContent = `
        @keyframes xslt-ripple {
          0% { top: 36px; left: 36px; width: 0; height: 0; opacity: 0; }
          4.9% { top: 36px; left: 36px; width: 0; height: 0; opacity: 0; }
          5% { top: 36px; left: 36px; width: 0; height: 0; opacity: 1; }
          100% { top: 0px; left: 0px; width: 72px; height: 72px; opacity: 0; }
        }
        .xslt-ripple-container {
          display: inline-block;
          position: relative;
          width: 80px;
          height: 80px;
          margin-bottom: 20px;
        }
        .xslt-ripple-container div {
          position: absolute;
          border: 4px solid #3498db;
          opacity: 1;
          border-radius: 50%;
          animation: xslt-ripple 1s cubic-bezier(0, 0.2, 0.8, 1) infinite;
        }
        .xslt-ripple-container div:nth-child(2) {
          animation-delay: -0.5s;
        }`;
      overlay.appendChild(style);

      const rippleContainer = document.createElementNS(xmlns, 'div');
      rippleContainer.className = 'xslt-ripple-container';
      rippleContainer.appendChild(document.createElementNS(xmlns, 'div'));
      rippleContainer.appendChild(document.createElementNS(xmlns, 'div'));
      overlay.appendChild(rippleContainer);

      const textDiv = document.createElementNS(xmlns, 'div');
      textDiv.textContent = 'XSLT Extension is processing this page, please wait...';
      overlay.appendChild(textDiv);

      document.body.appendChild(overlay);
    }
    overlay.style.display = 'flex';
    document.body.style.visibility = 'hidden';
  } else {
    if (overlay) overlay.remove();
    document.body.style.visibility = '';
  }
}
// Global settings for the polyfill script.
window.xsltPolyfillQuiet = true;
window.xsltDontAutoloadXmlDocs = true;
