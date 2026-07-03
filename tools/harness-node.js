/* Harness de execução mínima — NÃO substitui teste real em navegador.
   Mocka apenas o suficiente de window/document/DOMParser/BroadcastChannel
   para que o código de topo (IIFEs que rodam na carga) não lance
   ReferenceError. Roda no vm do próprio Node (sem dependências externas —
   este sandbox não tem acesso de rede para instalar Playwright/jsdom). */
const vm = require('vm');
const fs = require('fs');

class FakeElement {
  constructor(tag) {
    this.tagName = (tag || 'DIV').toUpperCase();
    this.childNodes = [];
    this.children = [];
    this.attributes = [];
    this.style = {};
    this.dataset = {};
    this.classList = { add(){}, remove(){}, contains(){ return false; }, toggle(){} };
    this._attrs = {};
    this.parentNode = null;
  }
  setAttribute(k, v) { this._attrs[k] = v; }
  getAttribute(k) { return this._attrs[k] || null; }
  removeAttribute(k) { delete this._attrs[k]; }
  appendChild(c) { this.childNodes.push(c); this.children.push(c); c.parentNode = this; return c; }
  insertBefore(c) { this.childNodes.unshift(c); this.children.unshift(c); c.parentNode = this; return c; }
  removeChild(c) { this.childNodes = this.childNodes.filter(x => x !== c); return c; }
  get firstChild() { return this.childNodes[0] || null; }
  addEventListener() {}
  removeEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  set innerHTML(v) { this._html = v; }
  get innerHTML() { return this._html || ''; }
  focus() {}
  click() {}
}

const fakeDocument = {
  readyState: 'complete',
  body: new FakeElement('body'),
  head: new FakeElement('head'),
  documentElement: new FakeElement('html'),
  getElementById() { return null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement(tag) { return new FakeElement(tag); },
  addEventListener() {},
  removeEventListener() {},
};

class FakeBroadcastChannel {
  constructor() { this.onmessage = null; }
  postMessage() {}
  close() {}
}

class FakeDOMParser {
  parseFromString(input) {
    // Documento inerte mínimo — suficiente pra wkzSanitizeHTML não quebrar
    const root = new FakeElement('body');
    return { body: root, querySelectorAll: () => [] };
  }
}

const sandbox = {
  console,
  window: {},
  document: fakeDocument,
  navigator: { userAgent: 'node-harness', clipboard: undefined },
  location: { origin: 'http://localhost', hash: '', href: 'http://localhost/' },
  localStorage: (function () {
    let store = {};
    return {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    };
  })(),
  BroadcastChannel: FakeBroadcastChannel,
  DOMParser: FakeDOMParser,
  Proxy,
  Node: { ELEMENT_NODE: 1 },
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  Blob: class FakeBlob { constructor(parts, opts) { this.parts = parts; this.type = opts && opts.type; } },
  URL: { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} },
  MutationObserver: class FakeMutationObserver { observe() {} disconnect() {} },
};
sandbox.window = sandbox; // window === global sandbox, como no browser real
sandbox.global = sandbox;
sandbox.addEventListener = function (evt, fn) {
  sandbox._winListeners = sandbox._winListeners || {};
  (sandbox._winListeners[evt] = sandbox._winListeners[evt] || []).push(fn);
};
sandbox.removeEventListener = function () {};
sandbox.dispatchEvent = function () { return true; };

vm.createContext(sandbox);

function loadFile(path, label) {
  const code = fs.readFileSync(path, 'utf8');
  try {
    vm.runInContext(code, sandbox, { filename: path });
    console.log('✅ ' + label + ' executou sem lançar erro em tempo de carga');
  } catch (e) {
    console.log('❌ ' + label + ' lançou erro: ' + e.message);
    console.log(e.stack.split('\n').slice(0, 4).join('\n'));
    process.exitCode = 1;
  }
}

loadFile('core/wkz-bus.js', 'wkz-bus.js');
loadFile('core/wkz-core.js', 'wkz-core.js');

// ── Asserções pós-carga — rodadas DENTRO do mesmo contexto vm, porque
// `const`/`let` de topo não vira propriedade de `window` (nem em browser
// real: script tags subsequentes enxergam via escopo léxico compartilhado,
// não via window.x). Replica esse comportamento aqui.
const assertions = `
(function() {
  var results = [];
  function assert(label, fn) {
    var ok = false, detail = '';
    try { ok = !!fn(); } catch (e) { ok = false; detail = e.message; }
    results.push({ label: label, ok: ok, detail: detail });
  }

  assert('WkzBus.on/emit/makeReactive existem', function() {
    return WkzBus && WkzBus.on && WkzBus.emit && WkzBus.makeReactive;
  });
  assert('escapeHtml() sanitiza', function() { return escapeHtml('<b>') === '&lt;b&gt;'; });
  assert('WkzApp.setPage dispara nav hook via WkzBus (fix da colisão)', function() {
    var fired = false;
    WkzApp.nav.register(function(id) { if (id === 'x') fired = true; });
    WkzApp.setPage('x');
    return fired;
  });
  assert('wkzUid gera IDs únicos', function() { return wkzUid('t') !== wkzUid('t'); });
  assert('showToast está definida (versão única)', function() { return typeof showToast === 'function'; });
  assert('wkzExactPrice(100,50) === 50', function() { return wkzExactPrice(100, 50) === 50; });
  assert('products[] tem 28 itens', function() { return Array.isArray(products) && products.length === 28; });
  assert('cartItemsData é reativo (Proxy)', function() {
    var fired = false;
    WkzBus.on('cart:change', function() { fired = true; });
    cartItemsData.push({ id: 't' });
    cartItemsData.length = 0;
    return fired;
  });
  assert('MapsTo/showPage existem, showPage delegado', function() {
    return typeof MapsTo === 'function' && showPage._wkzDelegated === true;
  });
  assert('WkzFiscalSplit existe', function() { return typeof WkzFiscalSplit === 'object'; });
  assert('WKZ_NOTIF.inbox é array', function() { return Array.isArray(WKZ_NOTIF.inbox); });
  assert('wkzConsentAcceptAll existe', function() { return typeof wkzConsentAcceptAll === 'function'; });

  return results;
})();
`;

let assertResults = [];
try {
  assertResults = vm.runInContext(assertions, sandbox, { filename: 'assertions.js' });
} catch (e) {
  console.log('❌ Bloco de asserções lançou erro: ' + e.message);
  process.exitCode = 1;
}
assertResults.forEach(function (r) {
  console.log((r.ok ? '✅ ' : '❌ ') + r.label + (r.detail ? ' — ' + r.detail : ''));
  if (!r.ok) process.exitCode = 1;
});

console.log(process.exitCode ? '\n⚠️  HÁ FALHAS — revisar antes do Sprint M2' : '\n✅ TODOS OS TESTES PASSARAM (execução headless)');
