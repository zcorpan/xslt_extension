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
  console.log('Starting XSLT polyfill transformation...');
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
      overlay.textContent = 'XSLT Extension is processing this page, please wait...';
      const style = document.createElementNS(xmlns, 'style');
      style.textContent = `
        #xslt-extension-spinner {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          padding: 16px;
          border-radius: 15px;
          z-index: 1;
          font-family: sans-serif;
          visibility: visible;
        }
        #xslt-extension-spinner::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: #3b82f6;
          z-index: -1;
          animation: ripple 1.5s infinite ease-out;
        }
        @keyframes ripple {
          to {
            transform: scale(1.15, 1.4);
            opacity: 0;
          }
        }`;
      overlay.appendChild(style);
      document.body.appendChild(overlay);
    }
    overlay.style.display = 'block';
    document.body.style.visibility = 'hidden';
  } else {
    overlay?.remove();
    document.body.style.removeProperty('visibility');
  }
}
// Global settings for the polyfill script.
window.xsltPolyfillQuiet = true;
window.xsltDontAutoloadXmlDocs = true;
