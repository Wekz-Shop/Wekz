# Sprint M8 — Fix: drift entre fixtures de teste e o app real

Arquivos alterados: `test-m1.html`, `test-m2.html`, `wkz-core.js`
(só o comentário de documentação — nenhuma lógica mudou).

## Contexto

Após o deploy voltar a funcionar (fix de concorrência do Sprint M7), os
harnesses ao vivo (`test-m1.html`, `test-m2.html`) mostraram 2 falhas.
Não eram regressões — eram **números fixos no teste que ficaram velhos**
enquanto o catálogo e o conjunto de páginas cresceram em sprints
posteriores, sem ninguém atualizar o valor esperado no teste.

## 1. `test-m1.html` — "products[] carregado com 28 itens" ❌

**Causa raiz:** o array `products` em `wkz-core.js` tem **29** itens reais
(confirmado por contagem de `cat:`/`stockMax:` — sem duplicata, sem item
quebrado). O item 29 é `Teclado Mecânico RGB TKL`, um Eletrônicos incluído
no fim do array depois que a categoria já tinha sido comentada como
`/* ── Eletrônicos (6) ── */`. `harness-node.js` (o harness Node,
separado) já esperava 29 corretamente — só o harness de browser
(`test-m1.html`) ficou para trás.

**Fix:**
- `test-m1.html`: `products.length === 28` → `=== 29`.
- `wkz-core.js`: comentário `Eletrônicos (6)` → `Eletrônicos (7)`
  (só documentação; o array em si não mudou).

## 2. `test-m2.html` — "As 23 páginas Buyer existem no DOM" ❌

**Causa raiz:** `wkz-buyer.html` tem hoje **24** elementos `[id^="page-"]`
(contados diretamente no HTML). O conjunto de 23 vem do desenho original
do Sprint M2; páginas como `page-404` e `page-pg-flash` foram adicionadas
em sprints seguintes (M3–M6) sem que este teste fosse atualizado. Todas as
24 páginas correspondem a seções reais e navegáveis — não há id duplicado
nem elemento órfão.

**Fix:** `test-m2.html`: `.length === 23` → `=== 24` (label do teste
também atualizado para "As 24 páginas Buyer...").

## Por que corrigir o teste em vez do app

Em ambos os casos o app está correto e funcionando — o número "certo" era
o do teste, desatualizado. Mudar o catálogo/as páginas para forçar os
números antigos removeria produto e página reais que já estão em uso.
Recomendação para os próximos sprints: sempre que adicionar um produto ou
uma página, rodar `test-m1.html`/`test-m2.html` localmente antes do commit
— esse tipo de drift é silencioso até o deploy.
