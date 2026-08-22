/* Teste funcional (código real, não mocks de negócio) da ponte
   [FIX-seller-approval v1.0]: cadastro de vendedor → "Aprovação de
   Lojas" no Admin. Duas "abas" simuladas como dois contextos `vm`
   SEPARADOS (cada uma com seu próprio DOM falso, exatamente como
   wkz-seller.html e wkz-admin.html são páginas HTML distintas na vida
   real) — mas compartilhando o MESMO objeto localStorage, que é
   precisamente como elas se comunicam de verdade. */
const vm = require('vm');
const fs = require('fs');

class FakeClassList {
  constructor() { this._s = new Set(); }
  add(c) { this._s.add(c); } remove(c) { this._s.delete(c); }
  toggle(c, f) { if (f===true){this._s.add(c);return true;} if(f===false){this._s.delete(c);return false;} if(this._s.has(c)){this._s.delete(c);return false;} this._s.add(c); return true; }
  contains(c) { return this._s.has(c); }
}
function makeFakeElementClass(registry) {
  return class FakeElement {
    constructor(tag) {
      this.tagName = (tag || 'DIV').toUpperCase();
      this.childNodes = []; this.children = [];
      this.style = { setProperty(){}, removeProperty(){}, getPropertyValue(){return '';} };
      this.dataset = {}; this.classList = new FakeClassList();
      this._attrs = {}; this.parentNode = null; this.value = '';
      this._id=''; this._html=''; this._text=''; this.selectedOptions = [];
    }
    get id(){return this._id;} set id(v){ if(this._id && registry[this._id]===this) delete registry[this._id]; this._id=v; if(v) registry[v]=this; }
    setAttribute(k,v){
      if(k==='id') this.id=v;
      this._attrs[k]=v;
      if (k.indexOf('data-') === 0) {
        var camel = k.slice(5).replace(/-([a-z])/g, function(_, c){ return c.toUpperCase(); });
        this.dataset[camel] = v;
      }
    }
    getAttribute(k){ return this._attrs[k]||null; }
    removeAttribute(k){ delete this._attrs[k]; }
    appendChild(c){ this.childNodes.push(c); this.children.push(c); c.parentNode=this; return c; }
    insertBefore(c,ref){ var i=ref?this.childNodes.indexOf(ref):-1; if(i===-1){this.childNodes.push(c);this.children.push(c);} else {this.childNodes.splice(i,0,c);this.children.splice(i,0,c);} c.parentNode=this; return c; }
    removeChild(c){ this.childNodes=this.childNodes.filter(x=>x!==c); this.children=this.children.filter(x=>x!==c); return c; }
    remove(){ if(this.parentNode) this.parentNode.removeChild(this); if(this._id) delete registry[this._id]; }
    get firstChild(){ return this.childNodes[0]||null; }
    addEventListener(){} removeEventListener(){}
    querySelector(sel){
      if (sel && sel.startsWith('#')) return registry[sel.slice(1)] || null;
      if (sel && sel.startsWith('.')) {
        var cls = sel.slice(1);
        var found = Object.values(registry).find(function(el){ return el.classList && el.classList.contains(cls); });
        return found || null;
      }
      return null;
    }
    querySelectorAll(sel){
      if (sel === '.adm-panel' || sel === '.adm-nav-item') {
        return Object.values(registry).filter(function(el){ return el.classList && el.classList.contains(sel.slice(1)); });
      }
      // Suporte a '#seller-stepN select' / '#seller-stepN input[type="text"]' —
      // usados de verdade por finishSellerRegister() para coletar o formulário.
      var m = sel.match(/^#([\w-]+)\s+(select|input\[type="text"\]|textarea)$/);
      if (m) {
        var container = registry[m[1]];
        if (!container) return [];
        var wantTag = m[2].indexOf('input') === 0 ? 'INPUT' : m[2].toUpperCase();
        var out = [];
        (function walk(el) {
          el.childNodes.forEach(function(c) {
            if (c.tagName === wantTag && (wantTag !== 'INPUT' || c._attrs.type === 'text')) out.push(c);
            walk(c);
          });
        })(container);
        return out;
      }
      return [];
    }
    set innerHTML(v){ this._html=v; this.childNodes=[]; this.children=[]; }
    get innerHTML(){ return this._html||''; }
    set textContent(v){ this._text=String(v); this._html=this._text; }
    get textContent(){ return this._text; }
    focus(){} click(){
      var el = this;
      while (el) {
        if (typeof el.onclick === 'function') { el.onclick({ target: this, currentTarget: el }); return; }
        el = el.parentNode;
      }
    }
    closest(sel) {
      var el = this;
      while (el) {
        if (sel === '[data-saction]' && el._attrs && el._attrs['data-saction']) return el;
        el = el.parentNode;
      }
      return null;
    }
    scrollIntoView(){} insertAdjacentHTML(){}
    getBoundingClientRect(){ return {width:0,height:0,top:0,left:0,right:0,bottom:0}; }
  };
}

// ── localStorage PARTILHADO entre as duas "abas" — exatamente como no navegador real ──
const sharedLocalStore = {};
const sharedLocalStorage = {
  getItem: k => (k in sharedLocalStore ? sharedLocalStore[k] : null),
  setItem: (k, v) => { sharedLocalStore[k] = String(v); },
  removeItem: k => { delete sharedLocalStore[k]; },
};

function matchTagSel(el, tagSel) {
  // tagSel como 'select', 'textarea', 'input[type="text"]'
  var m = tagSel.match(/^(\w+)(\[type="([^"]+)"\])?$/);
  if (!m) return false;
  if (el.tagName !== m[1].toUpperCase()) return false;
  if (m[3] && el._attrs.type !== m[3]) return false;
  return true;
}
function walkFindDescendants(container, tagSel, stopAtFirst) {
  var results = [];
  (function walk(el) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var c = el.childNodes[i];
      if (matchTagSel(c, tagSel)) { results.push(c); if (stopAtFirst) return true; }
      if (walk(c) && stopAtFirst) return true;
    }
    return false;
  })(container);
  return results;
}

function buildSandbox() {
  const registry = {};
  const FakeElement = makeFakeElementClass(registry);
  const fakeDocument = {
    readyState: 'complete',
    body: new FakeElement('body'), head: new FakeElement('head'), documentElement: new FakeElement('html'),
    getElementById(id){ return registry[id]||null; },
    querySelector(sel){
      if (sel && sel.startsWith('#')) {
        var spaceIdx = sel.indexOf(' ');
        if (spaceIdx === -1) return registry[sel.slice(1)] || null;
        var container = registry[sel.slice(1, spaceIdx)];
        if (!container) return null;
        var found = walkFindDescendants(container, sel.slice(spaceIdx + 1).trim(), true);
        return found[0] || null;
      }
      if (sel && sel.indexOf('input[name="payMode"]:checked') === 0) {
        return Object.values(registry).find(function(el){ return el._attrs.name === 'payMode' && el.checked; }) || null;
      }
      if (sel && sel.startsWith('.')) {
        var cls = sel.slice(1);
        var found2 = Object.values(registry).find(function(el){ return el.classList && el.classList.contains(cls); });
        return found2 || null;
      }
      return null;
    },
    querySelectorAll(sel){
      if (sel && sel.startsWith('#')) {
        var spaceIdx = sel.indexOf(' ');
        if (spaceIdx !== -1) {
          var container = registry[sel.slice(1, spaceIdx)];
          if (!container) return [];
          return walkFindDescendants(container, sel.slice(spaceIdx + 1).trim(), false);
        }
      }
      if (sel === '.adm-panel' || sel === '.adm-nav-item') {
        return Object.values(registry).filter(function(el){ return el.classList && el.classList.contains(sel.slice(1)); });
      }
      return [];
    },
    createElement(tag){ return new FakeElement(tag); },
    addEventListener(){}, removeEventListener(){},
  };
  class FakeBroadcastChannel { constructor(){this.onmessage=null;} postMessage(){} close(){} }
  class FakeDOMParser { parseFromString(){ const root=new FakeElement('body'); return {body:root, querySelectorAll:()=>[]}; } }

  const sandbox = {
    console,
    window: {},
    document: fakeDocument,
    navigator: { userAgent: 'node-test' },
    location: { origin: 'http://localhost', hash: '', href: 'http://localhost/' },
    localStorage: sharedLocalStorage,
    sessionStorage: (function(){ let s={}; return {getItem:k=>(k in s?s[k]:null), setItem:(k,v)=>{s[k]=String(v);}, removeItem:k=>{delete s[k];}, clear:()=>{s={};}}; })(),
    BroadcastChannel: FakeBroadcastChannel,
    DOMParser: FakeDOMParser,
    Proxy, Node: { ELEMENT_NODE: 1 },
    setTimeout: (function(){ var budget=200; return function(fn){ if(budget--<=0) return 0; try{fn();}catch(e){console.log('setTimeout cb error: '+e.message);} return 0; }; })(),
    clearTimeout: () => {}, setInterval: () => 0, clearInterval: () => {},
    requestAnimationFrame: (fn) => { fn(); return 0; },
    Blob: class FakeBlob { constructor(p,o){this.parts=p;this.type=o&&o.type;} },
    URL: { createObjectURL: () => 'blob:fake', revokeObjectURL: () => {} },
    MutationObserver: class { observe(){} disconnect(){} },
    ResizeObserver: class { observe(){} disconnect(){} unobserve(){} },
    innerWidth: 1000, innerHeight: 900,
    scrollTo: () => {},
    showToast: (msg) => { console.log('   [showToast] ' + msg); },
    Promise,
  };
  sandbox.window = sandbox; sandbox.global = sandbox;
  sandbox.addEventListener = () => {}; sandbox.removeEventListener = () => {}; sandbox.dispatchEvent = () => true;
  vm.createContext(sandbox);
  return { sandbox, registry, FakeElement };
}

function loadFile(sandbox, path, label) {
  const code = fs.readFileSync(path, 'utf8');
  try { vm.runInContext(code, sandbox, { filename: path }); console.log('✅ carregado: ' + label); return true; }
  catch (e) { console.log('❌ ERRO ao carregar ' + label + ': ' + e.message); console.log(e.stack.split('\n').slice(0,6).join('\n')); return false; }
}

function makeEl(FakeElement, registry, id, tag) { const el = new FakeElement(tag||'div'); el.id = id; return el; }

let failed = false;
function assert(cond, msg) { if (!cond) { console.log('❌ FALHOU: ' + msg); failed = true; } else { console.log('✅ ' + msg); } }

/* ═══════════════════════ ABA 1: VENDEDOR ═══════════════════════ */
console.log('══════════ Aba 1: Vendedor completa o cadastro (wizard 4 passos) ══════════');
const seller = buildSandbox();
loadFile(seller.sandbox, 'core/wkz-bus.js', 'wkz-bus.js (seller ctx)');
loadFile(seller.sandbox, 'core/wkz-core.js', 'wkz-core.js (seller ctx)');
loadFile(seller.sandbox, 'seller/wkz-seller.js', 'wkz-seller.js');

(function () {
  const { sandbox, registry, FakeElement } = seller;
  // Monta o DOM mínimo dos 4 passos do wizard, igual ao wkz-seller.html real
  const step1 = makeEl(FakeElement, registry, 'seller-step1');
  const nomeLojaInput = new FakeElement('input'); nomeLojaInput.setAttribute('type','text'); nomeLojaInput.value = 'Ferramentas & Cia';
  const sellerTypeSel = new FakeElement('select'); sellerTypeSel.value = 'mei';
  const catSel = new FakeElement('select'); catSel.value = 'Automotivo';
  const paisSel = new FakeElement('select'); paisSel.value = 'BR';
  [nomeLojaInput, sellerTypeSel, catSel, paisSel].forEach(el => step1.appendChild(el));

  const step2 = makeEl(FakeElement, registry, 'seller-step2');
  const cnpjInput = new FakeElement('input'); cnpjInput.setAttribute('type','text'); cnpjInput.value = '22.333.444/0001-55';
  const razaoInput = new FakeElement('input'); razaoInput.setAttribute('type','text'); razaoInput.value = 'Ferramentas Cia LTDA';
  const fantasiaInput = new FakeElement('input'); fantasiaInput.setAttribute('type','text'); fantasiaInput.value = 'Ferramentas & Cia';
  [cnpjInput, razaoInput, fantasiaInput].forEach(el => step2.appendChild(el));

  makeEl(FakeElement, registry, 'seller-step3');
  const step4 = makeEl(FakeElement, registry, 'seller-step4');
  const submitBtn = new FakeElement('button'); submitBtn.classList.add('btn-submit');
  step4.appendChild(submitBtn);

  const payRadio = new FakeElement('input'); payRadio.setAttribute('type','radio'); payRadio._attrs.name = 'payMode'; payRadio.checked = true; payRadio.value = 'pix';
  registry['__payRadio'] = payRadio;

  makeEl(FakeElement, registry, 'ss1'); makeEl(FakeElement, registry, 'ss2'); makeEl(FakeElement, registry, 'ss3'); makeEl(FakeElement, registry, 'ss4');
  const success = makeEl(FakeElement, registry, 'seller-success');

  return sandbox.finishSellerRegister().then(function () {
    assert(success._html === 'block' || success.style, 'finishSellerRegister() concluiu sem lançar erro');
    const raw = sharedLocalStore['kzLojasAprovacao_v1'];
    assert(!!raw, 'kzLojasAprovacao_v1 foi gravado no localStorage (fonte partilhada) após o cadastro');
    const list = JSON.parse(raw || '[]');
    assert(list.length === 1, 'Exatamente 1 solicitação de loja foi publicada: ' + list.length);
    const s = list[0];
    assert(s.name === 'Ferramentas & Cia', 'Nome da loja capturado corretamente do form real: "' + s.name + '"');
    assert(s.cnpj === '22.333.444/0001-55', 'CNPJ capturado corretamente: "' + s.cnpj + '"');
    assert(s.cat === 'Automotivo', 'Categoria capturada corretamente: "' + s.cat + '"');
    assert(s.owner === 'Ferramentas & Cia', 'Owner cai de volta pro nome fantasia/loja (não há campo de nome pessoal no wizard): "' + s.owner + '"');
    assert(s.status === 'pending', 'Status inicial = pending (aguardando revisão do Admin): "' + s.status + '"');
    global.__NEW_STORE_ID = s.id;
    console.log('   → id gerado: ' + s.id);
  }).catch(function (e) {
    console.log('❌ FALHOU: finishSellerRegister() lançou/rejeitou: ' + e.message);
    console.log(e.stack.split('\n').slice(0,6).join('\n'));
    failed = true;
  });
})().then(function () {

/* ═══════════════════════ ABA 2: ADMIN (carrega DEPOIS do cadastro) ═══════════════════════ */
console.log('\n══════════ Aba 2: Admin carrega a página (localStorage já tem a loja nova) ══════════');
const admin = buildSandbox();
loadFile(admin.sandbox, 'core/wkz-bus.js', 'wkz-bus.js (admin ctx)');
loadFile(admin.sandbox, 'core/wkz-core.js', 'wkz-core.js (admin ctx)');
loadFile(admin.sandbox, 'admin/wkz-admin.js', 'wkz-admin.js');

(function () {
  const { sandbox, registry, FakeElement } = admin;
  ['admMain','admStoreList','navBadgeStores','kpiStoresNum','storeApprovalSub',
   'countStoresAll','countStoresPending','countStoresDocs',
   'admInfoModal','admInfoModalTitle','admInfoModalSub','admInfoModalBody',
  ].forEach(id => makeEl(FakeElement, registry, id));

  // Replica exatamente o bootstrap real de wkz-admin.html (linha ~1098-1100)
  sandbox.wkzHydrateSharedStoresForAdmin();
  sandbox.renderAdminStores();

  const count = vm.runInContext('ADMIN_STORES.length', sandbox);
  assert(count === 8, 'ADMIN_STORES tem as 7 lojas mock + 1 loja real recém-cadastrada = 8 (era ' + count + ')');
  assert(registry['admStoreList'].innerHTML.indexOf('Ferramentas &amp; Cia') !== -1 || registry['admStoreList'].innerHTML.indexOf('Ferramentas & Cia') !== -1,
    'A loja real cadastrada pelo vendedor aparece no HTML de #admStoreList');
  assert(registry['admStoreList'].innerHTML.indexOf('Casa Moderna Decor') !== -1,
    'As 7 lojas de demonstração continuam aparecendo normalmente (não foram substituídas)');

  console.log('\n── Admin aprova a loja recém-cadastrada ──');
  const newId = global.__NEW_STORE_ID;
  sandbox.admApproveStore(newId, 'Ferramentas & Cia');
  const countAfter = vm.runInContext('ADMIN_STORES.length', sandbox);
  assert(countAfter === 7, 'Loja aprovada saiu da fila do Admin (8 → 7): ' + countAfter);

  const rawAfterApprove = sharedLocalStore['kzLojasAprovacao_v1'];
  const listAfterApprove = JSON.parse(rawAfterApprove);
  const approved = listAfterApprove.find(x => x.id === newId);
  assert(approved && approved.status === 'approved', 'Decisão "approved" foi persistida de volta em kzLojasAprovacao_v1');

  console.log('\n── Simula um reload do Admin: a loja aprovada NÃO deve voltar pra fila ──');
  const admin2 = buildSandbox();
  loadFile(admin2.sandbox, 'core/wkz-bus.js', 'wkz-bus.js (admin ctx #2, "reload")');
  loadFile(admin2.sandbox, 'core/wkz-core.js', 'wkz-core.js (admin ctx #2, "reload")');
  loadFile(admin2.sandbox, 'admin/wkz-admin.js', 'wkz-admin.js (admin ctx #2, "reload")');
  ['admMain','admStoreList','navBadgeStores','kpiStoresNum','storeApprovalSub',
   'countStoresAll','countStoresPending','countStoresDocs',
   'admInfoModal','admInfoModalTitle','admInfoModalSub','admInfoModalBody',
  ].forEach(id => makeEl(admin2.FakeElement, admin2.registry, id));
  admin2.sandbox.wkzHydrateSharedStoresForAdmin();
  admin2.sandbox.renderAdminStores();
  const countReload = vm.runInContext('ADMIN_STORES.length', admin2.sandbox);
  assert(countReload === 7, 'Após "reload", ADMIN_STORES volta a ter só as 7 mock (loja aprovada não reaparece): ' + countReload);
})();

}).then(function () {

/* ═══════════════════════ Cenário "ao vivo": Admin já estava com a aba aberta ═══════════════════════ */
console.log('\n══════════ Cenário: Admin JÁ está com a aba aberta quando o vendedor cadastra (WkzBus) ══════════');
const admin3 = buildSandbox();
loadFile(admin3.sandbox, 'core/wkz-bus.js', 'wkz-bus.js (admin ctx #3, "já aberto")');
loadFile(admin3.sandbox, 'core/wkz-core.js', 'wkz-core.js (admin ctx #3, "já aberto")');
loadFile(admin3.sandbox, 'admin/wkz-admin.js', 'wkz-admin.js (admin ctx #3, "já aberto")');
['admMain','admStoreList','navBadgeStores','kpiStoresNum','storeApprovalSub',
 'countStoresAll','countStoresPending','countStoresDocs',
 'admInfoModal','admInfoModalTitle','admInfoModalSub','admInfoModalBody',
].forEach(id => makeEl(admin3.FakeElement, admin3.registry, id));
admin3.sandbox.wkzHydrateSharedStoresForAdmin(); // já tem 7 mock, a loja aprovada não volta
admin3.sandbox.renderAdminStores();
const countBeforeLive = vm.runInContext('ADMIN_STORES.length', admin3.sandbox);

// [FIX-seller-approval v1.0] Dispara localmente o mesmo evento que
// wkzShareNewStoreRequest() emitiria numa aba do vendedor de verdade —
// suficiente pra validar o listener 'store:registered' registado em
// wkzHydrateSharedStoresForAdmin(), sem depender de simular o
// BroadcastChannel real entre processos.
const liveEntry = { id: 'ST-LIVE01', avatar: '🎮', name: 'Games do Zé', owner: 'Games do Zé', cnpj: '55.666.777/0001-11', cat: 'Games & Consoles', date: '21/08/2026', status: 'pending', docs: true };
vm.runInContext('window.WkzBus.emit', admin3.sandbox)('store:registered', liveEntry);
const countAfterLive = vm.runInContext('ADMIN_STORES.length', admin3.sandbox);
assert(countAfterLive === countBeforeLive + 1, 'Loja nova aparece AO VIVO na lista do Admin (sem reload) via WkzBus: ' + countBeforeLive + ' → ' + countAfterLive);
assert(admin3.registry['admStoreList'].innerHTML.indexOf('Games do Z') !== -1, 'A lista já renderizada (#admStoreList) foi atualizada com a loja ao vivo');
assert(admin3.registry['navBadgeStores'].textContent === String(countAfterLive), 'Badge do menu lateral atualizado ao vivo: ' + admin3.registry['navBadgeStores'].textContent);

console.log('\n' + (failed ? '❌ HÁ FALHAS — ver acima' : '✅ TODOS OS TESTES DA PONTE VENDEDOR→ADMIN PASSARAM'));
process.exitCode = failed ? 1 : 0;

}).catch(function (e) {
  console.log('❌ ERRO INESPERADO NO TESTE: ' + e.message);
  console.log(e.stack);
  process.exitCode = 1;
});
