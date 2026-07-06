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
  insertAdjacentHTML(pos, html) { /* no-op no mock — suficiente pra não travar */ }
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
    const root = new FakeElement('body');
    return { body: root, querySelectorAll: () => [] };
  }
}

// Registro de todos os timers criados, para dar clearAll no final e o
// processo poder sair sem depender de process.exit() forçado.
const _timers = [];
function fakeSetTimeout(fn, ms) { const id = setTimeout(fn, ms); _timers.push(id); return id; }
function fakeSetInterval(fn, ms) { const id = setInterval(fn, ms); _timers.push(id); return id; }

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
  setTimeout: fakeSetTimeout,
  clearTimeout,
  setInterval: fakeSetInterval,
  clearInterval,
  requestAnimationFrame: (fn) => fakeSetTimeout(fn, 0),
  Blob: class FakeBlob { constructor(parts, opts) { this.parts = parts; this.type = opts && opts.type; } },
  URL: { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} },
  MutationObserver: class FakeMutationObserver { observe() {} disconnect() {} },
};
sandbox.window = sandbox;
sandbox.global = sandbox;
sandbox.addEventListener = function (evt, fn) {
  sandbox._winListeners = sandbox._winListeners || {};
  (sandbox._winListeners[evt] = sandbox._winListeners[evt] || []).push(fn);
};
sandbox.removeEventListener = function () {};
sandbox.dispatchEvent = function () { return true; };

vm.createContext(sandbox);
let hadError = false;
function loadFile(path, label) {
  const code = fs.readFileSync(path, 'utf8');
  try {
    vm.runInContext(code, sandbox, { filename: path });
    console.log('✅ ' + label);
  } catch (e) {
    console.log('❌ ' + label + ' — ' + e.message);
    console.log(e.stack.split('\n').slice(0, 5).join('\n'));
    hadError = true;
  }
}
loadFile('core/wkz-bus.js', 'wkz-bus.js');
loadFile('core/wkz-core.js', 'wkz-core.js');
loadFile('buyer/wkz-buyer.js', 'wkz-buyer.js (arquivo final montado)');

_timers.forEach(id => { clearTimeout(id); clearInterval(id); });
console.log(hadError ? '\n⚠️ HOUVE FALHAS' : '\n✅ wkz-buyer.js roda de ponta a ponta sem erro');
process.exitCode = hadError ? 1 : 0;
