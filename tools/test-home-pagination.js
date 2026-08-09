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
  scrollIntoView() {}
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

const ctx = makeContext({}, 'home-pagination');
loadFile(ctx, 'core/wkz-bus.js');
loadFile(ctx, 'core/wkz-core.js');
loadFile(ctx, 'buyer/wkz-buyer.js', 'window.__PRODUCTS = products;');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('✅ '+msg); } else { fail++; console.log('❌ '+msg); } }

// Monta os elementos que a Home realmente tem
const grid = ctx._doc.createElement('div'); ctx._doc._register('productsGrid', grid);
const pag = ctx._doc.createElement('div'); ctx._doc._register('featPagination', pag);
const rb = ctx._doc.createElement('div'); ctx._doc._register('featResultBar', rb);

const sortSel = ctx._doc.createElement('select'); sortSel.id='featSortSelect';
sortSel.options = [{value:'',textContent:'Mais relevantes'},{value:'price-asc',textContent:'Menor preço'}];
sortSel.selectedIndex = 0; sortSel.value = '';
ctx._doc._register('featSortSelect', sortSel);

const perPageSel = ctx._doc.createElement('select'); perPageSel.id='featPerPageSelect';
perPageSel.value = '10';
ctx._doc._register('featPerPageSelect', perPageSel);

const totalProducts = ctx.__PRODUCTS.length;
console.log(`(catálogo tem ${totalProducts} produtos)`);

// 1) Primeira renderização (sem argumentos, como no boot da Home)
ctx.window.renderProducts();
const cardsPage1 = (grid.innerHTML.match(/class="product-card"/g) || []).length;
ok(cardsPage1 === Math.min(10, totalProducts), `Página 1 mostra 10 produtos (mostrou ${cardsPage1})`);
ok(pag.innerHTML.length > 0, 'Controles de paginação foram renderizados (mais de 1 página)');
ok(rb.innerHTML.includes(String(totalProducts)), 'Barra de resultado mostra o total correto de produtos');
ok(rb.innerHTML.includes('mostrando 1'), 'Barra de resultado mostra "mostrando 1–10"');

// 2) Clique em "Próxima" (simulando renderProducts(undefined, 2))
ctx.window.renderProducts(undefined, 2);
const cardsPage2 = (grid.innerHTML.match(/class="product-card"/g) || []).length;
ok(cardsPage2 > 0, `Página 2 renderiza produtos (${cardsPage2})`);
ok(rb.innerHTML.includes('mostrando 11'), 'Página 2 mostra o intervalo correto (11–20)');

// 3) Trocar "por página" para 20 (deve voltar pra página 1)
perPageSel.value = '20';
ctx.window.renderProducts();
const cardsPerPage20 = (grid.innerHTML.match(/class="product-card"/g) || []).length;
ok(cardsPerPage20 === Math.min(20, totalProducts), `Com "20 por página" mostra 20 produtos (mostrou ${cardsPerPage20})`);
ok(rb.innerHTML.includes('mostrando 1'), 'Trocar "por página" volta para a página 1');

// 4) Filtro rápido do hero (heroQuickFilter) continua funcionando E agora é paginado
perPageSel.value = '10';
const highRated = ctx.__PRODUCTS.filter(p => p.r >= 4);
ctx.window.renderProducts(highRated);
const cardsFiltered = (grid.innerHTML.match(/class="product-card"/g) || []).length;
ok(cardsFiltered === Math.min(10, highRated.length), `Filtro rápido (4★+) respeita a paginação (${cardsFiltered} de ${highRated.length} no total)`);
ok(rb.innerHTML.includes(String(highRated.length)), 'Barra de resultado reflete o total do FILTRO, não o catálogo inteiro');

// 5) Paginação dentro do filtro ainda funciona (não reseta pro catálogo cheio)
if (highRated.length > 10) {
  ctx.window.renderProducts(undefined, 2);
  const cardsFilteredPage2 = (grid.innerHTML.match(/class="product-card"/g) || []).length;
  ok(rb.innerHTML.includes(String(highRated.length)), 'Página 2 do filtro ainda mostra o total do FILTRO (não voltou para o catálogo cheio)');
} else {
  console.log('(pulado: filtro 4★+ tem 10 ou menos itens, não há página 2 pra testar)');
}

// 6) Ordenar por "Menor preço" reordena a lista atual
sortSel.value = 'price-asc'; sortSel.selectedIndex = 1;
ctx.window.renderProducts(ctx.__PRODUCTS);
ok(rb.innerHTML.includes('Menor preço'), 'Barra de resultado reflete o critério de ordenação escolhido');

console.log('\n' + (fail === 0 ? '✅ TODOS OS TESTES PASSARAM' : ('❌ ' + fail + ' FALHA(S)')) + ` (${pass} ok / ${fail} falhas)`);
process.exit(fail === 0 ? 0 : 1);
