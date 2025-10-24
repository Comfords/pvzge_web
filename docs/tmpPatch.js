// tmpPatch.js - aggressive CDN redirection for PVZGE / Cocos games
(function(){
  'use strict';

  // CHANGE THIS to the folder on JSDelivr (must end with '/')
  const CDN_ROOT = "https://cdn.jsdelivr.net/gh/Gzh0821/pvzge_web@master/docs/";

  // helper: return absolute CDN URL for a given request URL
  function toCdn(url) {
    if (!url || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('http://localhost') || url.startsWith(location.origin)) return url;
    // already absolute http/https -> leave alone (or could force CORS)
    if (/^https?:\/\//i.test(url)) return url;
    // normalized: remove leading ./ or /
    url = url.replace(/^\.\//, '').replace(/^\//, '');
    return CDN_ROOT + url;
  }

  // 1) Override XMLHttpRequest.open to rewrite relative URLs
  (function(){
    const XHROpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url, ...rest) {
      try {
        url = toCdn(url);
      } catch (e) {}
      return XHROpen.call(this, method, url, ...rest);
    };
  })();

  // 2) Override fetch
  (function(){
    if (window.fetch) {
      const origFetch = window.fetch;
      window.fetch = function(resource, ...rest) {
        try {
          if (typeof resource === 'string') resource = toCdn(resource);
          else if (resource && resource.url) resource = new Request(toCdn(resource.url), resource);
        } catch (e) {}
        return origFetch.call(this, resource, ...rest);
      };
    }
  })();

  // 3) Intercept Image src assignments
  (function(){
    try {
      const ImageProto = HTMLImageElement.prototype;
      const setSrc = Object.getOwnPropertyDescriptor(ImageProto, 'src').set;
      Object.defineProperty(ImageProto, 'src', {
        set: function(v) {
          try { v = toCdn(v); } catch(_) {}
          return setSrc.call(this, v);
        },
        get: function() { return this.getAttribute('src'); },
        configurable: true
      });
    } catch(e){}
  })();

  // 4) Intercept script/link insertion (script.src, link.href)
  (function(){
    const origCreate = Document.prototype.createElement;
    Document.prototype.createElement = function(tagName, options) {
      const el = origCreate.call(this, tagName, options);
      // script.src
      if (tagName && (tagName.toLowerCase() === 'script' || tagName.toLowerCase() === 'link' || tagName.toLowerCase() === 'img')) {
        // override setAttribute to rewrite certain attributes
        const origSet = el.setAttribute;
        el.setAttribute = function(name, value) {
          try {
            if (['src','href'].includes(name.toLowerCase())) value = toCdn(value);
          } catch(e){}
          return origSet.call(this, name, value);
        };
        // property assignment (script.src = ...)
        try {
          if ('src' in el) {
            const descr = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'src') ||
                          Object.getOwnPropertyDescriptor(el.__proto__, 'src');
            if (descr && descr.set) {
              const origSetProp = descr.set.bind(el);
              Object.defineProperty(el, 'src', {
                set: function(v){ try{ v = toCdn(v); }catch(e){} origSetProp(v); },
                get: function(){ return descr.get ? descr.get.call(this) : this.getAttribute('src'); },
                configurable:true
              });
            }
          }
          if ('href' in el) {
            const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'href') ||
                      Object.getOwnPropertyDescriptor(el.__proto__, 'href');
            if (d && d.set) {
              const origHrefSet = d.set.bind(el);
              Object.defineProperty(el, 'href', {
                set: function(v){ try{ v = toCdn(v); }catch(e){} origHrefSet(v); },
                get: function(){ return d.get ? d.get.call(this) : this.getAttribute('href'); },
                configurable:true
              });
            }
          }
        } catch(e){}
      }
      return el;
    };
  })();

  // 5) Patch System.import / dynamic import if present (SystemJS)
  (function(){
    if (window.System && typeof window.System.import === 'function') {
      const origImport = window.System.import.bind(window.System);
      window.System.import = function(specifier) {
        try {
          if (typeof specifier === 'string' && !/^https?:\/\//i.test(specifier)) {
            // avoid rewriting import maps — only rewrite plain relative imports
            specifier = toCdn(specifier.replace(/^\.\//, ''));
          }
        } catch(e){}
        return origImport(specifier);
      };
    }
    // also patch dynamic import() if it's used to import relative modules via string literals
    // note: dynamic import() cannot be monkeypatched easily — but many bundles use System.import
  })();

  // 6) Patch audio/image loader hooks commonly used by Cocos: cc.assetManager / cc.loader
  (function(){
    try {
      const rewritePath = (p) => {
        try { return toCdn(p); } catch(e){ return p; }
      };
      function patchCcObj(ccObj) {
        if (!ccObj) return;
        // cc.assetManager.loadRemote / load
        if (ccObj.assetManager && ccObj.assetManager.loadRemote) {
          const origLoadRemote = ccObj.assetManager.loadRemote;
          ccObj.assetManager.loadRemote = function(url, type, options, onComplete) {
            try { url = rewritePath(url); } catch(e){}
            return origLoadRemote.call(this, url, type, options, onComplete);
          };
        }
        // cc.loader.load / loadRes
        if (ccObj.loader && ccObj.loader.load) {
          const origLoad = ccObj.loader.load;
          ccObj.loader.load = function(resources, onComplete, onProgress) {
            if (typeof resources === 'string') resources = rewritePath(resources);
            return origLoad.call(this, resources, onComplete, onProgress);
          };
        }
      }
      // Wait for cc global if not present yet
      if (window.cc) patchCcObj(window.cc);
      else {
        const h = setInterval(() => { if (window.cc) { patchCcObj(window.cc); clearInterval(h); } }, 50);
        // give up after a while
        setTimeout(() => clearInterval(h), 5000);
      }
    } catch(e){}
  })();

  // Debug: print a tiny banner so you can confirm the patch executed
  try {
    console.info('[tmpPatch] CDN redirect active ->', CDN_ROOT);
  } catch(e){}
})();
