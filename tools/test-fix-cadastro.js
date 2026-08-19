const vm = require('vm');
const fs = require('fs');

// Reaproveita o mesmo FakeElement robusto (registro real por id) já usado
// em test-fix-kzlive.js — permite getElementById/appendChild funcionarem
// de verdade, necessário pra validar o que finishRegister()/regQuickFinish()
// escrevem no DOM.
const registry = {};

class FakeClassList {
  constructor() { this._s = new Set(); }
  add(c) { this._s.add(c); }
  remove(c) { this._s.delete(c); }
  toggle(c, f) {
    if (f === true) { this._s.add(c); return true; }
    if (f === false) { this._s.delete(c); return false; }
    if (this._s.has(c)) { this._s.delete(c); return false; }
    this._s.add(c); return true;
  }
  contains(c) { return this._s.has(c); }
}

class FakeElement {
  constructor(tag) {
    this.tagName = (tag || 'DIV').toUpperCase();
    this.childNodes = []; this.children = [];
    this.style = { setProperty(){}, removeProperty(){}, getPropertyValue(){ return ''; } };
    this.dataset = {};
    this.classList = new FakeClassList();
    this._attrs = {};
    this.parentNode = null;
    this.value = '';
    this._id = ''; this._html = ''; this._text = '';
    this.checked = false;
    this.disabled = false;
    this.selectedOptions = [];
  }
  get id() { return this._id; }
  set id(v) { if (this._id && registry[this._id] === this) delete registry[this._id]; this._id = v; if (v) registry[v] = this; }
  setAttribute(k, v) { if (k === 'id') this.id = v; this._attrs[k] = v; }
  getAttribute(k) { return this._attrs[k] || null; }
  removeAttribute(k) { delete this._attrs[k]; }
  appendChild(c) { this.childNodes.push(c); this.children.push(c); c.parentNode = this; return c; }
  insertBefore(c, ref) {
    var idx = ref ? this.childNodes.indexOf(ref) : -1;
    if (idx === -1) { this.childNodes.push(c); this.children.push(c); }
    else { this.childNodes.splice(idx, 0, c); this.children.splice(idx, 0, c); }
    c.parentNode = this; return c;
  }
  removeChild(c) { this.childNodes = this.childNodes.filter(x => x !== c); this.children = this.children.filter(x => x !== c); return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); if (this._id) delete registry[this._id]; }
  get firstChild() { return this.childNodes[0] || null; }
  addEventListener() {} removeEventListener() {}
  querySelector(sel) {
    if (sel && sel.startsWith('.')) {
      var cls = sel.slice(1);
      var found = Object.values(registry).find(function(el) { return el.classList && el.classList.contains(cls); });
      return found || null;
    }
    return null;
  }
  querySelectorAll() { return []; }
  set innerHTML(v) { this._html = v; this.childNodes = []; this.children = []; }
  get innerHTML() { return this._html || ''; }
  set textContent(v) { this._text = String(v); this._html = this._text; }
  get textContent() { return this._text; }
  focus() {} click() {} scrollIntoView() {} insertAdjacentHTML() {}
  getBoundingClientRect() { return { width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }; }
}

const fakeDocument = {
  readyState: 'complete',
  body: new FakeElement('body'),
  head: new FakeElement('head'),
  documentElement: new FakeElement('html'),
  getElementById(id) { return registry[id] || null; },
  querySelector(sel) {
    if (sel && sel.startsWith('.')) {
      var wantActive = sel.indexOf('.active') !== -1;
      var cls = sel.slice(1).replace('.active', '');
      var found = Object.values(registry).find(function(el) {
        return el.classList && el.classList.contains(cls) && (!wantActive || el.classList.contains('active'));
      });
      return found || null;
    }
    return null;
  },
  querySelectorAll() { return []; },
  createElement(tag) { return new FakeElement(tag); },
  addEventListener() {}, removeEventListener() {},
};

class FakeBroadcastChannel { constructor() { this.onmessage = null; } postMessage() {} close() {} }
class FakeDOMParser { parseFromString() { const root = new FakeElement('body'); return { body: root, querySelectorAll: () => [] }; } }

const localStore = {};
const sandbox = {
  console,
  window: {},
  document: fakeDocument,
  navigator: { userAgent: 'node-test', clipboard: undefined },
  location: { origin: 'http://localhost', hash: '', href: 'http://localhost/' },
  localStorage: {
    getItem: k => (k in localStore ? localStore[k] : null),
    setItem: (k, v) => { localStore[k] = String(v); },
    removeItem: k => { delete localStore[k]; },
  },
  sessionStorage: (function () { let s = {}; return { getItem: k => (k in s ? s[k] : null), setItem: (k, v) => { s[k] = String(v); }, removeItem: k => { delete s[k]; }, clear: () => { s = {}; } }; })(),
  BroadcastChannel: FakeBroadcastChannel,
  DOMParser: FakeDOMParser,
  Proxy,
  Node: { ELEMENT_NODE: 1 },
  setTimeout: (function () {
    var budget = 200;
    return function (fn) { if (budget-- <= 0) return 0; try { fn(); } catch (e) { console.log('setTimeout cb error: ' + e.message); } return 0; };
  })(),
  clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
  requestAnimationFrame: (fn) => { fn(); return 0; },
  Blob: class FakeBlob { constructor(parts, opts) { this.parts = parts; this.type = opts && opts.type; } },
  URL: { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} },
  MutationObserver: class { observe() {} disconnect() {} },
  ResizeObserver: class { observe() {} disconnect() {} unobserve() {} },
  innerWidth: 1000, innerHeight: 900,
  showToast: () => {},
};
sandbox.window = sandbox;
sandbox.global = sandbox;
sandbox.addEventListener = () => {};
sandbox.removeEventListener = () => {};
sandbox.dispatchEvent = () => true;

// Pré-registra os elementos que wkz-buyer.html já teria no DOM ANTES dos
// scripts rodarem — inclusive os 3 pontos hardcoded "Alexandre Kz" que
// finishRegister()/regQuickFinish() precisam sobrescrever.
function makeEl(id, tag) { const el = new FakeElement(tag || 'div'); el.id = id; return el; }
[
  'cpUserName','cpUserEmail','cpHdrName','cpHdrAvatarInitial',
  'r1nome','r1sob','r1nick','r1email','r2doc','r3cep','phoneDDI','phoneNumberInput',
  'regCountry','r2lang','r2curr','termsCheck','dataTransferCheck','ageCheck',
  'reg-step1','reg-step2','reg-step3','reg-step4','reg-success','regSuccessProfileCta',
  'rs1','rs2','rs3','rs4',
  'regPassword','r1pw2','termsCheckQuick','dataTransferCheckQuick','ageCheckQuick',
].forEach(id => makeEl(id));
registry['cpUserName'].textContent = 'Alexandre Kz';
registry['cpUserEmail'].textContent = 'alexandre@wekzshop.com';
registry['cpHdrName'].textContent = 'Alexandre Kz';
registry['cpHdrAvatarInitial'].textContent = 'A';
registry['termsCheck'].checked = false;
registry['dataTransferCheck'].checked = false;
registry['ageCheck'].checked = false;

// Simula os selects de país/idioma/moeda tendo uma option selecionada
// (selectedOptions[0].textContent), igual um <select> real do navegador.
function setSelectValue(id, value, label) {
  var el = registry[id];
  el.value = value;
  el.selectedOptions = [{ textContent: label }];
}
setSelectValue('regCountry', 'BR', '🇧🇷 Brasil');
setSelectValue('r2lang', '🇧🇷 Português (Brasil)', '🇧🇷 Português (Brasil)');
setSelectValue('r2curr', '🇧🇷 BRL — Real Brasileiro', '🇧🇷 BRL — Real Brasileiro');

// Duas abas de auth (Entrar/Cadastrar), igual ao HTML real
var loginTab = makeEl('__loginTab', 'div'); loginTab.classList.add('auth-tab'); loginTab.classList.add('active'); loginTab.textContent = 'Entrar';
var registerTab = makeEl('__registerTab', 'div'); registerTab.classList.add('auth-tab'); registerTab.textContent = 'Cadastrar';

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

console.log('\n── Teste: [FIX-CADASTRO-01] finishRegister() salva os dados reais ──');
(function () {
  registry['r1nome'].value = 'Fernanda';
  registry['r1sob'].value = 'Oliveira';
  registry['r1nick'].value = 'fernanda.oliveira';
  registry['r1email'].value = 'fernanda@teste.com';
  registry['r2doc'].value = '123.456.789-00';
  registry['phoneDDI'].textContent = '+55';
  registry['phoneNumberInput'].value = '11 99999-8888';
  registry['r3cep'].value = '01310-100';
  registry['termsCheck'].checked = true;
  registry['dataTransferCheck'].checked = true;
  registry['ageCheck'].checked = true;

  sandbox.finishRegister();

  assert(registry['cpUserName'].textContent === 'Fernanda Oliveira', '#cpUserName mostra o nome real cadastrado (não mais "Alexandre Kz"): ' + registry['cpUserName'].textContent);
  assert(registry['cpHdrName'].textContent === 'Fernanda Oliveira', '#cpHdrName (dropdown do cabeçalho) também sincronizado');
  assert(registry['cpUserEmail'].textContent === 'fernanda@teste.com', '#cpUserEmail mostra o email real cadastrado');
  assert(registry['cpHdrAvatarInitial'].textContent === 'F', 'inicial do avatar no cabeçalho atualizada pra "F"');

  var extra = vm.runInContext('WKZ_PROFILE_EXTRA', sandbox);
  assert(extra.phone === '+55 11 99999-8888', 'telefone salvo com DDI: ' + extra.phone);
  assert(extra.doc === '123.456.789-00', 'CPF/documento salvo');
  assert(extra.cep === '01310-100', 'CEP salvo');
  assert(extra.country === 'BR' && extra.countryLabel === '🇧🇷 Brasil', 'país salvo com bandeira+nome (lido da própria option do select)');

  assert(sandbox.wkzBuyerLoggedIn === true, 'usuário marcado como autenticado após concluir o cadastro (wkzSetBuyerLoggedIn(true))');

  var saved = JSON.parse(sandbox.localStorage.getItem('wkz_registered_profile'));
  assert(saved.name === 'Fernanda Oliveira' && saved.email === 'fernanda@teste.com', 'perfil persistido em localStorage (sobrevive a reload): ' + JSON.stringify(saved));
})();

console.log('\n── Teste: [FIX-CADASTRO-02] tela de auth não fica "presa" no Bem-vindo ──');
(function () {
  registry['reg-success'].style.display = 'block'; // simula estado deixado pelo finishRegister()
  var hooks = vm.runInContext('window._wkzNavHooks', sandbox);
  assert(Array.isArray(hooks) && hooks.length > 0, 'nav hook de reset da tela de auth está registrado');
  hooks.forEach(function (h) { h('home'); }); // simula "Começar a Comprar" → showPage('home')
  assert(registry['reg-success'].style.display === 'none', 'tela de sucesso "Bem-vindo à WeKz Shop!" volta a ficar escondida ao sair do cadastro');
  assert(registry['reg-step1'].style.display === 'block', 'passo 1 volta a ficar visível (formulário pronto pra próxima visita)');
})();

console.log('\n── Teste: [FIX-CADASTRO-01b] regQuickFinish() (cadastro rápido) também salva os dados reais ──');
(function () {
  registry['cpUserName'].textContent = 'Alexandre Kz'; // reseta pro cenário "antes do fix"
  registry['cpHdrName'].textContent = 'Alexandre Kz';
  registry['r1nome'].value = 'Bruno';
  registry['r1email'].value = 'bruno@teste.com';
  registry['regPassword'].value = 'senha1234';
  registry['r1pw2'].value = 'senha1234';
  registry['termsCheckQuick'].checked = true;
  registry['dataTransferCheckQuick'].checked = true;
  registry['ageCheckQuick'].checked = true;

  sandbox.regQuickFinish();

  assert(registry['cpUserName'].textContent === 'Bruno', 'cadastro rápido também atualiza #cpUserName (não fica no "Alexandre Kz")');
  assert(registry['cpHdrName'].textContent === 'Bruno', 'cadastro rápido também atualiza o dropdown do cabeçalho');
  assert(registry['regSuccessProfileCta'].style.display === 'block', 'CTA "Completar Perfil agora" aparece (perfil ficou incompleto de propósito)');
})();

console.log('\n── Teste: cpEditProfile() lê o nome/email real (não mais o fallback fixo) ──');
(function () {
  var name = registry['cpUserName'].textContent;
  assert(name === 'Bruno', 'ponto de leitura usado por cpEditProfile() reflete o último cadastro real (Bruno, do cadastro rápido)');
})();

console.log('\n' + (failed ? '❌ HÁ FALHAS — ver acima' : '✅ TODOS OS TESTES FUNCIONAIS PASSARAM'));
process.exitCode = failed ? 1 : 0;
