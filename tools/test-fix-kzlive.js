const vm = require('vm');
const fs = require('fs');

// ── Fake DOM com registro real por id (permite getElementById funcionar
// de verdade, diferente do mock "sempre null" usado nos testes anteriores
// — aqui precisamos inspecionar o conteúdo renderizado de fato). ──
const registry = {};

class FakeClassList {
  constructor(el) { this._el = el; this._set = new Set(); }
  add(c) { this._set.add(c); }
  remove(c) { this._set.delete(c); }
  toggle(c, force) {
    if (force === true) { this._set.add(c); return true; }
    if (force === false) { this._set.delete(c); return false; }
    if (this._set.has(c)) { this._set.delete(c); return false; }
    this._set.add(c); return true;
  }
  contains(c) { return this._set.has(c); }
}

class FakeElement {
  constructor(tag) {
    this.tagName = (tag || 'DIV').toUpperCase();
    this.childNodes = [];
    this.children = [];
    this.style = { setProperty(){}, removeProperty(){}, getPropertyValue(){ return ''; } };
    this.dataset = {};
    this.classList = new FakeClassList(this);
    this._attrs = {};
    this.parentNode = null;
    this.value = '';
    this._id = '';
    this._html = '';
    this._text = '';
    this.disabled = false;
  }
  get id() { return this._id; }
  set id(v) { if (this._id && registry[this._id] === this) delete registry[this._id]; this._id = v; if (v) registry[v] = this; }
  setAttribute(k, v) { if (k === 'id') { this.id = v; } this._attrs[k] = v; }
  getAttribute(k) { return this._attrs[k] || null; }
  removeAttribute(k) { delete this._attrs[k]; }
  appendChild(c) { this.childNodes.push(c); this.children.push(c); c.parentNode = this; return c; }
  insertBefore(c) { this.childNodes.unshift(c); this.children.unshift(c); c.parentNode = this; return c; }
  removeChild(c) { this.childNodes = this.childNodes.filter(x => x !== c); this.children = this.children.filter(x => x !== c); return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); if (this._id) delete registry[this._id]; }
  get firstChild() { return this.childNodes[0] || null; }
  addEventListener() {}
  removeEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  set innerHTML(v) { this._html = v; this.childNodes = []; this.children = []; }
  get innerHTML() { return this._html || ''; }
  set textContent(v) { this._text = v; this._html = v; }
  get textContent() { return this._text; }
  focus() {}
  click() {}
  scrollIntoView() {}
  insertAdjacentHTML() {}
}

const fakeDocument = {
  readyState: 'complete',
  body: new FakeElement('body'),
  head: new FakeElement('head'),
  documentElement: new FakeElement('html'),
  getElementById(id) { return registry[id] || null; },
  querySelector() { return null; },
  querySelectorAll() { return []; },
  createElement(tag) { return new FakeElement(tag); },
  addEventListener() {},
  removeEventListener() {},
};

class FakeBroadcastChannel { constructor() { this.onmessage = null; } postMessage() {} close() {} }
class FakeDOMParser { parseFromString() { const root = new FakeElement('body'); return { body: root, querySelectorAll: () => [] }; } }

const sandbox = {
  console,
  window: {},
  document: fakeDocument,
  navigator: { userAgent: 'node-test', clipboard: undefined },
  location: { origin: 'http://localhost', hash: '', href: 'http://localhost/' },
  localStorage: (function () {
    let store = {};
    return { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  })(),
  BroadcastChannel: FakeBroadcastChannel,
  DOMParser: FakeDOMParser,
  Proxy,
  Node: { ELEMENT_NODE: 1 },
  setTimeout: (function () {
    var budget = 200; // evita loop infinito do streaming de chat (setTimeout recursivo) neste mock síncrono
    return function (fn) {
      if (budget-- <= 0) return 0;
      try { fn(); } catch (e) { console.log('setTimeout cb error: ' + e.message); }
      return 0;
    };
  })(),
  clearTimeout: () => {},
  setInterval: () => 0,
  clearInterval: () => {},
  requestAnimationFrame: (fn) => { fn(); return 0; },
  Blob: class FakeBlob { constructor(parts, opts) { this.parts = parts; this.type = opts && opts.type; } },
  URL: { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} },
  MutationObserver: class { observe() {} disconnect() {} },
  showToast: () => {},
};
sandbox.window = sandbox;
sandbox.global = sandbox;
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
sandbox.dispatchEvent = () => true;

vm.createContext(sandbox);
let failed = false;
function loadFile(path, label) {
  const code = fs.readFileSync(path, 'utf8');
  try { vm.runInContext(code, sandbox, { filename: path }); console.log('✅ carregado: ' + label); }
  catch (e) { console.log('❌ ERRO ao carregar ' + label + ': ' + e.message); console.log(e.stack.split('\n').slice(0, 6).join('\n')); failed = true; }
}
loadFile('core/wkz-bus.js', 'wkz-bus.js');
loadFile('core/wkz-core.js', 'wkz-core.js');
loadFile('buyer/wkz-buyer.js', 'wkz-buyer.js');

function assert(cond, msg) { if (!cond) { console.log('❌ FALHOU: ' + msg); failed = true; } else { console.log('✅ ' + msg); } }

// Pré-registra os elementos que a página wkz-buyer.html normalmente
// já teria no DOM antes de initKzLive() rodar.
function makeEl(id, tag) { const el = new FakeElement(tag || 'div'); el.id = id; return el; }
['kzliveGrid','kzlivePagination','kzliveChatBody','kzliveChatInput','kzliveChatCount',
 'kzliveFollowBtn','kzliveActiveCd','kzlivePlaceholder','kzliveIframe','kzliveChatCharCount','kzliveChatSendBtn'
].forEach(id => makeEl(id));
makeEl('cpUserName', 'span').textContent = 'Marina Souza';

console.log('\n── Teste: Seguir loja (contabiliza em followedStores) ──');
(function () {
  var r1 = vm.runInContext("(function(){ return { before: followedStores.length }; })()", sandbox);
  assert(r1.before === 0, 'estado inicial: nenhuma loja seguida');
  sandbox.kzliveToggleFollow();
  var r2 = vm.runInContext("(function(){ return { list: followedStores.map(s=>s.n) }; })()", sandbox);
  assert(r2.list.includes('TechStore Brasil'), 'seguir na Kz Live registra "TechStore Brasil" em followedStores — visível em Lojas Seguidas: ' + JSON.stringify(r2.list));
  var followBtn = registry['kzliveFollowBtn'];
  assert(followBtn.textContent.indexOf('Seguindo') !== -1, 'botão da Kz Live reflete o estado "Seguindo"');
  sandbox.kzliveToggleFollow();
  var r3 = vm.runInContext("(function(){ return followedStores.length; })()", sandbox);
  assert(r3 === 0, 'clicar de novo remove de followedStores (deixar de seguir)');
})();

console.log('\n── Teste: Comprar Agora (direciona pra compra de verdade) ──');
(function () {
  var before = vm.runInContext("cartItemsData.length", sandbox);
  assert(before === 0, 'carrinho começa vazio');
  vm.runInContext("showPage = function(p){ window.__lastPage = p; };", sandbox);
  sandbox.kzliveBuyNow(1); // Smartphone Redmi Note 14 Pro
  var after = vm.runInContext("({ len: cartItemsData.length, item: cartItemsData[0] })", sandbox);
  assert(after.len === 1, 'kzliveBuyNow adiciona o produto ao carrinho');
  assert(after.item.id === 'live_1' && after.item._isLive === true, 'item do carrinho é o produto certo (id live_1, marcado _isLive)');
  assert(sandbox.__lastPage === 'cart', 'kzliveBuyNow navega para a página do carrinho (showPage("cart"))');
})();

console.log('\n── Teste: clicar no produto abre a ficha (quick-view) ──');
(function () {
  assert(registry['kzlive-product-modal-overlay'] === undefined, 'nenhum modal aberto inicialmente');
  sandbox.kzliveOpenProduct(2); // Smartwatch Ultra X9
  var modal = registry['kzlive-product-modal-overlay'];
  assert(!!modal, 'kzliveOpenProduct cria o overlay do quick-view');
  assert(modal.innerHTML.includes('Smartwatch Ultra X9'), 'o modal mostra o nome do produto certo');
  assert(modal.innerHTML.includes('TechStore Brasil'), 'o modal mostra a loja corretamente vinculada');
})();

console.log('\n── Teste: paginação da grade "Produtos Nesta Live" ──');
(function () {
  sandbox.initKzLive();
  var grid = registry['kzliveGrid'];
  assert(grid.children.length === 4, 'página 1 mostra 4 produtos (8 produtos / 4 por página): ' + grid.children.length);
  var pag = registry['kzlivePagination'];
  assert(pag.innerHTML.includes('Próxima'), 'controles de paginação são renderizados (botão Próxima presente)');
  sandbox.kzliveGoToPage(2);
  assert(grid.children.length === 4, 'página 2 mostra os 4 produtos restantes');
})();

console.log('\n── Teste: chat usa nome e foto reais do perfil (Meu Perfil) ──');
(function () {
  vm.runInContext("window._cpAvatarState = { mode:'photo', payload:'data:image/png;base64,FAKEPHOTO' };", sandbox);
  var input = registry['kzliveChatInput'];
  input.value = 'Oi pessoal, adorei o produto!';
  sandbox.kzliveSendMsg();
  var chatBody = registry['kzliveChatBody'];
  var lastMsgHtml = chatBody.childNodes[chatBody.childNodes.length - 1].innerHTML;
  assert(lastMsgHtml.includes('Marina Souza'), 'mensagem enviada mostra o nome cadastrado em Meu Perfil (cpUserName)');
  assert(lastMsgHtml.includes('data:image/png;base64,FAKEPHOTO'), 'mensagem enviada usa a FOTO real cadastrada em Meu Perfil (via window._cpAvatarState)');
  assert(lastMsgHtml.includes('VOCÊ'), 'mensagem própria é destacada com a etiqueta "VOCÊ"');
})();

console.log('\n── Teste: reações rápidas usam a mesma identidade real ──');
(function () {
  var chatBody = registry['kzliveChatBody'];
  sandbox.kzliveSendReaction('🔥');
  var lastMsgHtml = chatBody.childNodes[chatBody.childNodes.length - 1].innerHTML;
  assert(lastMsgHtml.includes('🔥'), 'reação rápida injeta a mensagem com o emoji no final do chat');
  assert(lastMsgHtml.includes('Marina Souza'), 'reação também usa o nome real do perfil');
})();

console.log('\n── Teste: bug de "kzlive-active" preso no <body> ao sair pela compra ──');
(function () {
  vm.runInContext("document.body.classList.add('kzlive-active');", sandbox);
  var hooks = vm.runInContext("window._wkzNavHooks", sandbox);
  assert(Array.isArray(hooks) && hooks.length > 0, 'nav hook da Kz Live está registrado');
  hooks.forEach(function (h) { h('cart'); }); // simula navegação para outra página
  var hasClass = vm.runInContext("document.body.classList.contains('kzlive-active')", sandbox);
  assert(hasClass === false, 'sair da live via navegação (ex.: Comprar Agora → carrinho) limpa a classe kzlive-active do body');
})();

console.log('\n' + (failed ? '❌ HÁ FALHAS — ver acima' : '✅ TODOS OS TESTES FUNCIONAIS PASSARAM'));
process.exitCode = failed ? 1 : 0;
