(function () {
  const cache = new Map();
  window.attachComponentCss = async function (shadowRoot, htmlUrl) {
    const cssUrl = new URL(htmlUrl, document.baseURI).href.replace(/\.html(\?.*)?$/, '.css$1');
    let cssText = cache.get(cssUrl);
    if (!cssText) {
      const res = await fetch(cssUrl, { cache: 'force-cache' });
      if (!res.ok) throw new Error(`CSS fetch failed: ${cssUrl} ${res.status}`);
      cssText = await res.text();
      cache.set(cssUrl, cssText);
    }
    const styleEl = document.createElement('style');
    styleEl.textContent = cssText;
    shadowRoot.prepend(styleEl);
  };
})();

