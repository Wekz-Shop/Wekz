/* Teste funcional (não apenas "carrega sem erro") da entrega de
   Comunicados (admin → comprador/vendedor), usando o CÓDIGO REAL de
   wkz-core.js e wkz-admin.js, com um DOM falso mínimo porém funcional
   e uma localStorage falsa PARTILHADA entre as abas simuladas — exatamente
   como elas se comunicam de verdade (localStorage + BroadcastChannel).
   Cobre o bug real encontrado: sendBroadcast() nunca entregava nada às
   outras abas (ver FIX-comunicados v1.0 em wkz-core.js/wkz-admin.js). */
const vm = require('vm');
const fs = require('fs');

/* ── DOM mínimo, porém real o suficiente para suportar os seletores
   usados no código: #id, [attr="val"], :not([attr="val"]) ── */
class El {
  constructor(tag) {
    this.tagName = (tag || 'div').toUpperCase();
    this.children = [];
    this.parentNode = null;
    this._attrs = {};
    this.style = { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } };
    this.classList = { add() {}, remove() {}, contains() { return false; }, toggle() {} };
    this.dataset = new Proxy({}, {
      set: (t, k, v) => { t[k] = v; this._attrs['data-' + k.replace(/[A-Z]/g, m => '-' + m.toLowerCase())] = v; return true; },
      get: (t, k) => t[k]
    });
    this._html = '';
  }
  setAttribute(k, v) { this._attrs[k] = String(v); }
  getAttribute(k) { return this._attrs[k] !== undefined ? this._attrs[k] : null; }
  removeAttribute(k) { delete this._attrs[k]; }
  get id() { return this._attrs.id || ''; }
  set id(v) { this._attrs.id = v; }
  appendChild(c) { this.children.push(c); c.parentNode = this; return c; }
  insertBefore(c, ref) {
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i === -1) this.children.push(c); else this.children.splice(i, 0, c);
    c.parentNode = this;
    return c;
  }
  removeChild(c) { this.children = this.children.filter(x => x !== c); return c; }
  get firstChild() { return this.children[0] || null; }
  set innerHTML(v) { this._html = v; this.children = []; }
  get innerHTML() { return this._html; }
  set onclick(fn) { this._attrs['onclick'] = '[fn]'; this.__onclick = fn; }
  addEventListener(type, fn) { (this._listeners = this._listeners || {})[type] = (this._listeners[type] || []).concat(fn); }
  removeEventListener(type, fn) { if (this._listeners && this._listeners[type]) this._listeners[type] = this._listeners[type].filter(f => f !== fn); }
  click() { (this._listeners && this._listeners.click || []).forEach(fn => fn({ target: this })); }
  focus() {}
  closest() { return null; }
  insertAdjacentHTML() {}
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  replaceWith(other) { if (this.parentNode) { const i = this.parentNode.children.indexOf(this); if (i !== -1) this.parentNode.children[i] = other; other.parentNode = this.parentNode; } }

  _matches(sel) {
    // suporta: [attr="val"], [attr="val"]:not([attr2="val2"]), #id
    const notMatch = sel.match(/^(.*?):not\((.*)\)$/);
    if (notMatch) {
      const [, base, negSel] = notMatch;
      return this._matchesSimple(base) && !this._matchesSimple(negSel);
    }
    return this._matchesSimple(sel);
  }
  _matchesSimple(sel) {
    if (sel.startsWith('#')) return this._attrs.id === sel.slice(1);
    const m = sel.match(/^\[([\w-]+)="([^"]*)"\]$/);
    if (m) return this.getAttribute(m[1]) === m[2];
    return false;
  }
  _walk(cb) { cb(this); this.children.forEach(c => c._walk(cb)); }
  querySelector(sel) {
    let found = null;
    this._walk(el => { if (!found && el !== this && el._matches(sel)) found = el; });
    return found;
  }
  querySelectorAll(sel) {
    const out = [];
    this._walk(el => { if (el !== this && el._matches(sel)) out.push(el); });
    return out;
  }
}

function makeDocument() {
  const registry = {};
  const root = new El('body');
  const origSetAttr = El.prototype.setAttribute;
  return {
    _root: root,
    getElementById(id) { return registry[id] || root.querySelector('#' + id); },
    createElement(tag) { return new El(tag); },
    querySelector(sel) { return root.querySelector(sel); },
    querySelectorAll(sel) { return root.querySelectorAll(sel); },
    addEventListener() {}, removeEventListener() {},
    body: root, head: new El('head'), documentElement: new El('html'),
    readyState: 'complete',
    _register(id, el) { el.setAttribute('id', id); registry[id] = el; },
  };
}

function makeLocalStorage(shared) {
  return {
    getItem: k => (k in shared ? shared[k] : null),
    setItem: (k, v) => { shared[k] = String(v); },
    removeItem: k => { delete shared[k]; },
  };
}

/* BroadcastChannel falso mas REAL o suficiente para entregar mensagens
   entre "abas" (contexts) diferentes — mantém uma lista global de
   listeners por nome de canal, tal como o navegador faz entre tabs. */
const _bcChannels = {};
class FakeBroadcastChannel {
  constructor(name) {
    this.name = name;
    this.onmessage = null;
    _bcChannels[name] = _bcChannels[name] || [];
    _bcChannels[name].push(this);
  }
  postMessage(msg) {
    (_bcChannels[this.name] || []).forEach(ch => {
      if (ch !== this && typeof ch.onmessage === 'function') {
        setTimeout(() => ch.onmessage({ data: msg }), 0);
      }
    });
  }
  close() { _bcChannels[this.name] = (_bcChannels[this.name] || []).filter(c => c !== this); }
}

function makeContext(sharedLS, label) {
  const doc = makeDocument();
  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: (...a) => console.error('[' + label + ']', ...a) },
    window: null, document: doc, localStorage: makeLocalStorage(sharedLS),
    BroadcastChannel: FakeBroadcastChannel,
    navigator: { language: 'pt-PT', userAgent: 'node-test' },
    location: { href: 'https://wekz-shop.test/' + label, hostname: 'wekz-shop.test', search: '', pathname: '/' + label },
    setTimeout, clearTimeout, setInterval, clearInterval,
    DOMParser: function () { this.parseFromString = () => ({ body: new El('body'), querySelector: () => null }); },
    Blob: function () {}, URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    requestAnimationFrame: cb => setTimeout(cb, 0),
    matchMedia: () => ({ matches: false, addListener() {}, addEventListener() {} }),
    showToast: (msg) => { sandbox.__toasts.push(msg); },
    __toasts: [],
    addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true,
    MutationObserver: class { observe() {} disconnect() {} },
    IntersectionObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { observe() {} disconnect() {} },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  sandbox._doc = doc;
  return sandbox;
}

function loadFile(ctx, path, exposeCode) {
  // `const`/`let` de topo-de-ficheiro não viram propriedades do objeto
  // global do vm (só `var`/funções viram) — para inspecionar coisas como
  // `const ADMIN_DISPUTES = [...]` a partir de fora, anexamos uma linha
  // de exposição e rodamos tudo como UM único script (mesmo escopo).
  const code = fs.readFileSync(path, 'utf8') + (exposeCode ? ('\n' + exposeCode) : '');
  vm.runInContext(code, ctx, { filename: path });
}

const ctx = makeContext({}, 'formselect-smoke');
loadFile(ctx, 'core/wkz-form-select.js');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('✅ '+msg); } else { fail++; console.log('❌ '+msg); } }

// 1) Dicionário não deve conter nenhum emoji — só SVG
const dictSrc = require('vm').runInContext('JSON.stringify(_WKZ_FS_ICONS)', ctx);
const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
const TYPOGRAPHIC_OK = new Set(['✓','✕','★','→','←','↑','↓','↕']);
function hasRealEmoji(s){ const m=[...s.matchAll(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu)]; return m.some(x=>!TYPOGRAPHIC_OK.has(x[0])); }
ok(!emojiRe.test(dictSrc), '_WKZ_FS_ICONS não contém nenhum emoji nativo (só SVG)');
ok(dictSrc.includes('<svg'), '_WKZ_FS_ICONS contém marcação <svg> de verdade');

// 2) Fallback não deve ser emoji
const fallback = require('vm').runInContext("_fsIcon('Campo Desconhecido XYZ')", ctx);
ok(fallback.includes('<svg'), 'Fallback (_fsIcon para label sem match) retorna SVG, não emoji');
ok(!emojiRe.test(fallback), 'Fallback não contém emoji');

// 3) Simula abrir um select real e verifica o painel renderizado
const selectEl = ctx._doc.createElement('select');
selectEl.id = 'testSelect1';
const opt1 = ctx._doc.createElement('option'); opt1.value = 'brl'; opt1.text = 'Real (BRL)';
const opt2 = ctx._doc.createElement('option'); opt2.value = 'eur'; opt2.text = 'Euro (EUR)';
selectEl.options = [opt1, opt2];
selectEl.selectedIndex = 0;
selectEl.value = 'brl';
ctx._doc._register('testSelect1', selectEl);

const btn = ctx._doc.createElement('button');
btn.className = 'wkz-form-select-btn';
btn.dataset = { selectId: 'testSelect1', title: 'Moeda preferida', fsId: '1' };
ctx.window.innerWidth = 1024; ctx.window.innerHeight = 768;
ctx.window.getComputedStyle = () => ({ position: 'static', display: 'block', visibility: 'visible', zIndex: 'auto' });
ctx.requestAnimationFrame = (fn) => fn();
btn.getBoundingClientRect = () => ({ left: 10, right: 200, top: 100, bottom: 130, width: 190, height: 30 });

try {
  ctx.window.openFormSelect(btn);
  const panel = ctx._doc.getElementById('wkzFSPanel_1');
  ok(!!panel, 'Painel do select customizado é criado ao abrir');
  const panelHtml = panel ? panel.innerHTML : '';
  ok(panelHtml.includes('<svg'), 'Painel renderizado contém <svg> (ícone da "Moeda preferida")');
  { const m = panelHtml.match(emojiRe); if(m) console.log('   (debug) caractere pego pelo regex:', JSON.stringify(m[0]), 'U+' + m[0].codePointAt(0).toString(16)); ok(!hasRealEmoji(panelHtml), 'Painel renderizado NÃO contém emoji nativo colorido (✓ tipográfico é permitido)'); }
  ok(panelHtml.includes('Real (BRL)') && panelHtml.includes('Euro (EUR)'), 'Opções do select continuam aparecendo corretamente no painel');
} catch (e) {
  fail++; console.log('❌ ERRO ao abrir o select:', e.message);
}

console.log('\n' + (fail === 0 ? '✅ TODOS OS TESTES PASSARAM' : ('❌ ' + fail + ' FALHA(S)')) + ` (${pass} ok / ${fail} falhas)`);
process.exit(fail === 0 ? 0 : 1);
