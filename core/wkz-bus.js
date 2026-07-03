/**
 * WkzBus v2.0 — Barramento de Estado Reativo WeKz Shop
 * Retrocompatível com: WkzApp, _wkzNavHooks, registerNavHook
 * Não depende de nenhum outro módulo — carregado PRIMEIRO em toda página.
 *
 * Sprint M1 — Core Foundation
 * Fonte: Seção 4 do plano "WeKzShop_Arquitetura_Modular_v2_9_36"
 */
var WkzBus = (function () {
  'use strict';

  var _listeners = {}; // { 'event:name': [fn, fn, ...] }
  var _once = {};       // (reservado — once() usa unsub via on())

  /* ── on(event, fn) — inscreve um listener. Retorna função de unsub ── */
  function on(event, fn) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(fn);
    return function () { off(event, fn); };
  }

  /* ── once(event, fn) — dispara apenas 1× ── */
  function once(event, fn) {
    var unsub = on(event, function _onceWrapper(data) {
      fn(data);
      unsub();
    });
  }

  /* ── off(event, fn) — cancela listener ── */
  function off(event, fn) {
    if (!_listeners[event]) return;
    _listeners[event] = _listeners[event].filter(function (f) { return f !== fn; });
  }

  /* ── emit(event, data) — dispara evento local + broadcast entre abas ── */
  function emit(event, data) {
    var fns = _listeners[event] || [];
    fns.forEach(function (fn) {
      try { fn(data); }
      catch (e) { console.warn('[WkzBus] Erro em listener de ' + event, e); }
    });
    /* Broadcast via BroadcastChannel para outros tabs/módulos.
       Em produção (Supabase), este transporte é substituído por
       Realtime/WebSocket — a interface on/emit permanece idêntica. */
    try {
      if (window._wkzBroadcast) window._wkzBroadcast.postMessage({ event: event, data: data });
    } catch (e) {}
  }

  /* ── BroadcastChannel: sincroniza abas/módulos abertos no mesmo browser ── */
  try {
    window._wkzBroadcast = new BroadcastChannel('wkz_bus');
    window._wkzBroadcast.onmessage = function (e) {
      var fns = _listeners[e.data.event] || [];
      fns.forEach(function (fn) {
        try { fn(e.data.data); } catch (err) {}
      });
    };
  } catch (e) {}

  /* ── makeReactive(obj, namespace) — Proxy que emite eventos em mutações ──
     Uso: cartItemsData = WkzBus.makeReactive([], 'cart')
     Toda atribuição/push/splice (via índice) emite 'cart:change' automaticamente.
     NOTA: para arrays, .push()/.splice() disparam via trap 'set' porque
     internamente escrevem em índices numéricos + 'length'; o filtro abaixo
     ignora apenas a própria mutação de 'length' para não duplicar o evento. */
  function makeReactive(obj, ns) {
    return new Proxy(obj, {
      set: function (target, prop, value) {
        target[prop] = value;
        if (prop !== 'length') emit(ns + ':change', { prop: prop, value: value, state: target });
        return true;
      },
      deleteProperty: function (target, prop) {
        delete target[prop];
        emit(ns + ':change', { prop: prop, value: undefined, state: target });
        return true;
      }
    });
  }

  /* ── CATÁLOGO DE EVENTOS PADRONIZADOS ──────────────────────────────────
     Namespaces:  cart:*  buyer:*  seller:*  admin:*  nav:*  auth:*  fiscal:*

     Emitidos pelo Buyer Core:
       cart:change            { cartItemsData, totalQty }
       cart:coupon:apply      { code, disc, type, seller }
       cart:coupon:remove     {}
       order:placed           { orderId, items, total, sellerId }
       dispute:opened         { orderId, reason, buyerName }
       auth:login              { userId, role:'buyer' }
       nav:change              sectionId (string)
       pdp:opened               { productIndex, product }

     Emitidos pelo Seller Hub:
       seller:coupon:created   { code, sellerId, disc, type }
       seller:flash:created    { productId, price, until }
       seller:frete:updated    { sellerId, active }
       seller:dispute:replied  { disputeId, text, resolution }
       seller:kpi:update       { gmv, orders, nps }
       seller:product:published{ productData }
       auth:seller:login       { sellerId, role:'seller' }

     Emitidos pelo Admin Matrix:
       admin:dispute:resolved  { disputeId, decision, refund }
       admin:store:approved    { storeId, sellerId }
       admin:kyc:approved      { sellerId, riskScore }
       admin:payout:approved   { payoutId, amount }
       admin:broadcast:sent    { audience, msg }

     Emitido por qualquer módulo ao terminar seu boot:
       module:ready             { module: 'buyer'|'seller'|'admin' }
     ─────────────────────────────────────────────────────────────────── */

  /* ── Retrocompatibilidade: window._wkzNavHooks / registerNavHook ──
     O código legado do monólito chama window._wkzNavHooks.push(fn) e
     window.registerNavHook(fn). Ambos continuam funcionando: por baixo
     dos panos, cada hook registrado também vira um listener de 'nav:change'
     no WkzBus, então MapsTo() (wkz-core.js) só precisa fazer
     WkzBus.emit('nav:change', sectionId) para dispará-los todos. */
  var _navHooks = [];
  function _registerHook(fn) {
    if (typeof fn === 'function' && _navHooks.indexOf(fn) === -1) {
      _navHooks.push(fn);
      on('nav:change', fn); // duplica no bus moderno
    }
  }
  window._wkzNavHooks = new Proxy(_navHooks, {
    get: function (t, k) {
      return k === 'push' ? (function (fn) { _registerHook(fn); }) : t[k];
    }
  });
  window.registerNavHook = _registerHook;

  /* ── API Pública ── */
  return { on: on, once: once, off: off, emit: emit, makeReactive: makeReactive };
})();

/* Expõe globalmente */
window.WkzBus = WkzBus;
