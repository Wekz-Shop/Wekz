# Sprint M1 — Core Foundation — Changelog

**Base:** `WeKzShop_v2_9_36_CORRIGIDO.html` (49.261 linhas)
**Saída:** `wkz-bus.js` + `wkz-core.js` + `wkz-styles-base.css`
**Princípio:** Zero Rewrite — nada foi reescrito, apenas movido e conectado via `WkzBus`.

## ✅ O que foi extraído (com linha de origem no monólito)

| Bloco | Conteúdo | Linhas origem |
|---|---|---|
| 1 | `escapeHtml()`, `wkzLog()`, `WkzApp` | 10376–10480 |
| 1b | `wkzSanitizeHTML()`, `wkzFreezeApp()`, `wkzSecureStorage` | 10489–10857 |
| 2 | `wkzUid()` | 30731–30740 |
| 2 | `showToast()` completo, `wkzCopyToClipboard()`, `wkzRenderEmpty()`, `wkzSanitize()`, scroll-to-top, keyboard nav | 44818–45257 |
| 3+4+5 | `wkzExactPrice/Off()`, `products[]` (28 itens), catálogo de ícones, `SELLER_COUPONS`, `cartItemsData`/`wishlistItems`/`followedStores` | 19379–19819 |
| 6 | `NAV_PAGE_MAP`, `MapsTo()`, `showPage()` | 34838–35001 |
| 7 | `WkzFiscalSplit` completo (IBS/CBS, Remessa Conforme) | 46645–46983 |
| 8 | `WKZ_NOTIF`, `wkzShowPush/AlertBar()`, `wkzAddToInbox/RenderInbox()`, `wkzInjectBellBtn()`, `wkzDeliverBroadcast()` | 41271–41601 |
| 10 | LGPD Consent Banner (`wkzConsentAcceptAll/Reject`) | 49033–49258 |
| Tokens | `:root` design tokens + escala tipográfica DM Sans | 213–246 |

Todos os blocos passaram individualmente e em conjunto (`wkz-bus.js` + `wkz-core.js`) em `node --check` (Node 24 LTS).

## 🔧 Correções de arquitetura aplicadas durante a extração (não estavam no plano original, descobertas ao codificar)

1. **Colisão `window._wkzNavHooks`/`window.registerNavHook` entre `WkzApp` e `WkzBus`.**
   No monólito, `WkzApp` declarava seu próprio Proxy de `_wkzNavHooks`. Como `wkz-bus.js` carrega primeiro e também declara esse símbolo, `WkzApp` (carregado depois, dentro de `wkz-core.js`) sobrescreveria silenciosamente o Proxy do `WkzBus` — hooks registrados via `WkzBus.on('nav:change', fn)` parariam de disparar. **Fix:** `WkzApp` agora delega para `window.registerNavHook`/`WkzBus.emit('nav:change', ...)` em vez de redeclarar. Isso é exatamente o padrão de "duplicata silenciosa" descrito no RISCO 1/3 da Seção 1 do plano — só que entre o core novo e o legado, não dentro do monólito.

2. **`cartItemsData`, `wishlistItems`, `followedStores` convertidos para `WkzBus.makeReactive()`** (Bloco 5 do plano). Antes eram arrays mutáveis sem nenhum listener possível; agora emitem `cart:change` / `wishlist:change` / `stores:change` a cada mutação.

## ⚠️ Pendências / gaps encontrados (não existiam no monólito, precisam de decisão)

- **`wkzRateLimit()` e `wkzStore` (TTL wrapper)** — listados no Bloco 2 do plano como utilitários-alvo, mas **não existem** no monólito v2.9.36. São itens novos a implementar, não extração. Não foram inventados aqui para não violar o princípio Zero Rewrite com lógica de negócio não verificada.
- **`wkzInjectMobileBell()`** — referenciada dentro do bloco de notificações mas não localizada na faixa de linhas extraída; provavelmente vive dentro do território Buyer. Verificar no Sprint M2.
- **PATCH 7 (backdoor `#wkz-dev-admin`, linha 39387)** — confirmado ainda presente no monólito, mas está fisicamente dentro do bloco Admin (38722–40860), que só será extraído no Sprint M4. **Recomendação mantida do plano: tratar como hotfix isolado antes de prosseguir em produção**, independente do cronograma de sprints.
- **PATCH 2/3 (openProduct/showToast duplicados)** — `showToast()` já foi consolidado em `wkz-core.js` (uma única versão, a mais completa). `openProduct()` tem 3 definições, todas dentro do território Buyer (23189/24581/24963) — consolidação fica para o Sprint M2, conforme o plano já previa.

## 🧪 Critério de saída do Sprint M1 (ainda pendente de execução manual)

O plano pede: *"monólito original com wkz-bus.js e wkz-core.js injetados — zero regressão"*. Isso requer testar no navegador (Playwright/Chromium), não apenas `node --check` de sintaxe — recomendo como próximo passo antes de iniciar o Sprint M2.
