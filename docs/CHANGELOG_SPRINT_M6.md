# Sprint M6 — Correções e melhorias da página "Meu Perfil" (Desktop + Mobile)

Arquivos alterados: `wkz-buyer.html`, `wkz-core.js`, `wkz-buyer.js`, `wkz-styles-full.css`.
Todas as edições foram validadas com `node --check` (sintaxe JS) e checagem de
balanceamento de tags (`<div>`, `<button>`, `<span>`, `<label>`) no HTML.

---

## 1. Divergência entre o topo do perfil e o Guia de Níveis Kz — CORRIGIDO
**Causa raiz:** `userPoints.lifetime = 8.340 pts`, que pelo cálculo real
(`_wkzLevel()`) cai no nível **Cyber** (5.000–9.999 pts) — exatamente o que o
Guia de Níveis já mostrava corretamente. Mas o hero banner (`#cpLevelName`),
o stat "Nível Atual" (`#cpStatLvl`) e a bolha inicial do Kz Copilot tinham
**"Neon Cyber"/"Neon" fixos no HTML**, nunca recalculados.

**Fix:** nova função `cpSyncLevelDisplay()` como fonte única de verdade,
chamada no init do perfil e sempre que os pontos mudam (compra, missão).
A bolha do Copilot agora nasce dinâmica (`{{LEVEL_INSIGHT}}`), sem depender
de o utilizador clicar "Novo insight" para corrigir o texto.

## 2. Botão "Rastrear" no Rastreador de Encomendas — CORRIGIDO
**Antes:** disparava apenas um toast genérico; o histórico de eventos só
existia na página dedicada de rastreio, com um dataset totalmente separado
(`_TRK_DATA`, chaves `WKZ-8821...`) dos pedidos do perfil (`CP_ORDERS`,
chaves `#WKZ-9042...`).

**Fix:** cada pedido do perfil ganhou um histórico de eventos completo.
"Rastrear" agora abre um modal overlay com stepper + timeline completa de
eventos (comprovando o pedido continua rastreável sem sair do perfil), mais
um atalho "Ver Página Completa de Rastreio" que leva à página cheia — os
dados são espelhados em `_TRK_DATA` na primeira consulta, para as duas
telas mostrarem exatamente a mesma informação.

## 3. Missões do Dia — marcação imediata e real — CORRIGIDO
**Antes:** clicar na própria linha da missão já marcava como concluída,
mesmo sem a ação real ter acontecido (bug de UX / brecha).

**Fix:** criado `window.cpCompleteMission(id)` como ponto único de
conclusão, chamado pelas ações reais em toda a app:
- **Comprar** → confirmação real de pedido no checkout;
- **Usar cupom** → `window._activeCoupon` ativo no momento da confirmação;
- **Ver produtos** → 3 produtos distintos abertos de verdade (`openProduct`);
- **Avaliar** → publicação real de avaliação (item 4 abaixo);
- **Compartilhar** → novo botão "Compartilhar" na página do produto (Web
  Share API nativa, com fallback WhatsApp + copiar link).

A UI atualiza imediatamente (sem refresh) e credita pontos reais a
`userPoints`, mantendo o nível sincronizado. Também corrigido: o
contador da missão "Ver produtos" (X/3) e um `setInterval` que se
acumulava a cada vez que a página era reaberta.

## 4. Avaliações Pendentes — texto, fotos/vídeos, rota real — CORRIGIDO
**Antes:** clicar numa estrela já "enviava" a avaliação sozinha — sem
texto, sem mídia, e sem nenhuma ligação com o produto real.

**Fix:** novo modal completo (estrelas + título + comentário + até 6
fotos/vídeos). A publicação de verdade acontece através do **mesmo
formulário já existente na página do produto** (`#writeReviewForm` →
`submitReview()`), então a avaliação realmente aparece lá — não é uma
simulação isolada no perfil. Quando o produto do pedido mock não existe
no catálogo navegável desta simulação (gap de dados herdado de sprints
anteriores — nomes de pedidos/disputas mock nunca foram cadastrados no
catálogo), o sistema avisa honestamente em vez de fabricar uma página de
produto inexistente.

> **Hotfix pós-entrega:** o `onclick` inicial só estava na fileira de
> estrelinhas (alvo pequeno) — clicar no nome/imagem do produto não fazia
> nada. Corrigido para o card inteiro (`.cp-review-item`) ser clicável,
> com hover de destaque para indicar que é interativo.

## 5. Micro-histórico de interações — cada item agora é clicável — CORRIGIDO
Cada linha leva ao local exato a que se refere:
cupom desbloqueado → aba de cupons (com o código já copiado); encomenda →
modal de rastreio; disputa → modal de detalhe da disputa; nível atingido →
Guia de Níveis; cartão adicionado → Carteira. Uso do mesmo destaque visual
(scroll + brilho temporário) em toda a app para consistência.

## 6. Histórico de Compras (novo) — IMPLEMENTADO
Novo card "Histórico de Compras", com produtos reais do catálogo
navegável (garantindo que os botões funcionam de verdade): **"Ver
Produto"** abre a página real do produto; **"Comprar Novamente"**
adiciona ao carrinho e já mostra o produto.

## 7. Carteira Multimoedas & Cupons Smart — botão duplicado — CORRIGIDO
Removido o botão "+ Adicionar novo cartão / conta" (com ícone de cartão)
dentro do corpo do card — redundante com o "+ Adicionar" já existente no
cabeçalho, que abre o mesmo modal (cartão, banco, MB Way, Pix, cripto).
Mantido apenas o do cabeçalho, com o rótulo simplificado para "+
Adicionar" (sem a palavra "Cartão", já que cobre outras formas de
pagamento).

## 8. Central de Disputas — botões estáticos — CORRIGIDO
"Ver Reembolso na Carteira" e "Ver Cupão de Compensação" só fechavam o
modal, sem fazer mais nada.
- **Reembolso:** agora navega até a Carteira e mostra um comprovante
  temporário (valor + método de pagamento creditado). Não há gateway de
  pagamento real nesta fase (front-end puro) — esta é a confirmação
  visual possível até a integração com backend.
- **Cupão de Compensação:** agora gera de verdade um cupom na Carteira
  (uma única vez por disputa), com badge "COMPENSAÇÃO" para não se
  confundir com cupões promocionais, e leva o utilizador até lá.

## 9. Indicação WeKz — créditos funcionais — CORRIGIDO
**Pergunta respondida — onde ficam os créditos:** são somados a um saldo
de "Créditos WeKz" sempre visível dentro da própria Carteira Multimoedas
(explicado também no card de indicação).
Como este é o estágio 100% front-end do projeto (sem backend para
confirmar a compra real de um amigo indicado), foi adicionado um botão
de simulação claramente rotulado como demo ("🧪 Simular: um amigo
indicado concluiu a 1ª compra"), que demonstra o fluxo ponta a ponta:
soma R$50 ao saldo, atualiza o contador de indicações ativas, credita na
Carteira e regista no micro-histórico. Em produção, este gatilho seria
substituído por um evento real de backend.

## 10. Varredura geral de botões estáticos + polish — CONCLUÍDO
Conferidos todos os `onclick` da página de perfil (hero, cartões,
missões, disputas, carteira, indicação, acesso rápido) — todos levam a
funções implementadas. Corrigidos durante a varredura:
- Grid mobile de 2 colunas nos botões utilitários da página de produto
  (Negociar / Comparar) que ficaria quebrado com o novo 3º botão
  "Compartilhar" — agora 3 colunas.
- Duplicação de `display:none`/`display:flex` na mesma tag (bug que
  faria o indicador de Créditos WeKz aparecer sempre, mesmo com saldo
  zero).
- `setInterval` do contador de missões duplicando a cada reabertura da
  página de perfil.

---

## Observações técnicas para o próximo sprint
- **Gap de dados herdado:** os nomes de produto usados em `CP_ORDERS`,
  `CP_DISPUTES` e nas avaliações pendentes (mock do perfil) não
  correspondem a nenhum item do catálogo navegável `products` (PDP). Isso
  é anterior a este sprint. O novo matcher `_cpFindProductIndexByName()`
  já lida com isso graciosamente, mas o ideal é alinhar os nomes (ou
  IDs) quando o backend/catálogo real existir.
- `.cp-add-card-btn` (CSS) ficou sem uso após a remoção do item 7 —
  inofensivo, pode ser limpo num próximo sprint de housekeeping de CSS.
