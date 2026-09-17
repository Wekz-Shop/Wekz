# Sprint M30 — i18n/moeda: detecção automática, idiomas/moedas fantasma e tradução parcial

Arquivos alterados: `buyer/wkz-buyer.js`, `buyer/wkz-buyer.html`.
Motivado por prints do usuário mostrando a interface em chinês com várias
áreas (loja, categoria, rodapé, rastreio) ainda em português, e pela
pergunta sobre detecção automática de idioma/moeda por região.

## Pergunta 1 — detecção automática por região

Hoje o site **não detecta** região automaticamente; idioma/moeda só mudam
por ação explícita do usuário nos seletores. Não implementado nesta
sprint (é uma decisão de produto, não um bug) — documentado para decisão
futura. Recomendação: seguir o padrão comum entre grandes players
(detecção por IP + banner sugerindo a troca, nunca troca silenciosa
forçada).

## Pergunta 2 — causa raiz da tradução parcial

1. **Dicionário incompleto para 9 dos 16 idiomas do seletor.** `WKZ_LANGS`
   listava 16 opções, mas `TRANSLATIONS` só tinha conteúdo para 7
   (pt/en/es/zh/fr/de/ja). Escolher qualquer um dos outros 9 (ko/ar/hi/ru/
   tr/it/nl/pl/sv) fazia `t()` cair silenciosamente no fallback para 'pt'
   em 100% da interface.
2. **Mesmo problema em moeda.** `WKZ_CURRENCIES` listava 28 opções, mas
   `rates`/`symbols` (wkz-core.js) só tinham cotação real para 8. As
   outras 20 caíam silenciosamente em BRL.
3. **`applyTranslations()` nunca re-renderizava página de Loja, Categoria
   ou Rastreio de Pedido** ao trocar idioma/moeda — cada uma tem template
   próprio, construído uma única vez com texto fixo em PT.
4. **Os templates de card de produto (usados em Home/Categoria/Loja)
   tinham texto 100% fixo em PT** dentro do próprio template literal —
   mesmo quando a função que os desenha *era* re-chamada (`renderProducts`
   já estava na lista de re-render), ela só reimprimia o mesmo PT de novo.
5. **Seletor quebrado havia anos:** `applyTranslations()` buscava
   `.footer-col h4` para traduzir os títulos do rodapé (Comprar/Vender/
   Suporte/WeKz), mas o HTML usa `<details><summary>`, não `h4` — o
   `querySelectorAll` sempre retornava vazio, então os 4 títulos NUNCA
   traduziram, silenciosamente, desde sempre.

## O que foi corrigido

- `WKZ_LANGS` reduzido a pt/en/es/zh/fr/de/ja — os únicos com dicionário
  completo (442 chaves cada, sincronizadas). Nenhuma tradução existente
  foi descartada; os 9 removidos não tinham conteúdo algum.
- `WKZ_CURRENCIES` reduzido a BRL/USD/EUR/GBP/JPY/ARS/MXN/CNY — as únicas
  com cotação real; nomes de moeda agora usam `t()` em vez de texto fixo.
- +~194 chaves novas × 7 idiomas adicionadas a `TRANSLATIONS` (badges de
  produto, chrome da página de Loja, políticas de loja, sidebar de
  filtros de Categoria, rodapé completo, chrome da página de Rastreio de
  Pedido incluindo o bloco de custódia/escrow).
- `renderProducts`, `renderCatProducts` e `renderStoreProducts` (os 3
  templates de card de produto) convertidos para usar `t()`.
- `openStore()` reescrito: estatísticas, políticas (via mapa
  `POLICY_I18N_MAP`, já que são um conjunto fechado reaproveitado por
  todas as lojas), selo "Compra verificada" e botão Seguir agora traduzem.
- `openCategory()` agora traduz nome da categoria/breadcrumb reaproveitando
  `CAT_I18N_MAP` (já existente em core.js, usado antes só pela home).
- `loadTracking()`: stepper, ETA/contagem regressiva, histórico, ações,
  card do pacote e bloco de custódia inteiro (5 estados) traduzidos.
- `_stockConfig()` (widget de urgência/escassez de estoque da PDP —
  "Restam apenas X unidades!", "Esgotado temporariamente" etc., os 5
  estados) traduzido; hook de re-render adicionado via `currentPdpIndex`.
- **Bug de moeda no Carrinho (não era só tradução):** `renderCart()` e
  `renderSavedForLater()` tinham sua própria função `fmt()` local que
  formatava preço fixo em `R$`, ignorando `currentCurrency` por completo
  — o carrinho continuava em Reais mesmo com o resto do site já em outra
  moeda. Substituído por `formatPrice()` (a mesma usada em Home/Categoria/
  Loja). Também traduzido: estado de carrinho vazio, sugestões, botões de
  quantidade/remover/salvar, badge Flash Sale, e a sidebar de resumo
  inteira (Subtotal/Frete/Desconto/Total/cupom/nota de segurança).
- Corrigido o seletor `.footer-col h4` → `.footer-nav-col summary`; todos
  os 22 links do rodapé receberam `data-i18n`.
- `applyTranslations()`/`updateCurrency()` agora re-renderizam Loja,
  Categoria e Rastreio quando essa é a página ativa — com trava para
  nunca navegar o usuário para outra tela só por causa da troca de
  idioma/moeda (guarda por `document.body.dataset.view`).
- Corrigida a inversão de ordem "Produtos da {Loja}" → "{Loja} 的商品"
  para zh/ja (possessivo vem depois do nome nesses idiomas).
- Adicionados handlers genéricos `data-i18n-placeholder` / `data-i18n-title`
  em `applyTranslations()`, para que novos campos não exijam mais uma
  linha nova em JS a cada um.

## Decisão de escopo — o que ficou de fora, de propósito

- **`_TRK_DATA[].events`** (histórico detalhado de cada pedido demo, ex.:
  "Liberado pela alfândega HK") e **`s.desc`/tags de cada loja** continuam
  em PT. Tratado como conteúdo (dado específico do pedido/loja), não como
  rótulo de interface — mesma lógica de por que uma descrição de vendedor
  não é auto-traduzida em marketplaces reais.
- **`title` de compliance no rodapé** (menções a Art. 49 CDC, Art. 19 MCI,
  NF-e) mantidos só em PT — são referências à legislação brasileira
  especificamente; recomendo não traduzir automaticamente texto legal.
- **Não auditado ainda nesta sprint:** o "Checkout Engine" inteiro
  (abertura do checkout, métodos de pagamento Pix/Cartão/Boleto,
  endereços salvos, revisão do pedido) — é um bloco de ~2.000 linhas só
  ele, com o mesmo padrão de texto fixo em PT encontrado em todo o resto.
  Não tentei fazer isso nesta sprint por ser justamente a etapa mais
  sensível do fluxo (dinheiro muda de mão ali) — prefiro tratar como uma
  sprint dedicada (M31) em vez de apressar. Também não auditados: Wishlist,
  Chat/mensagens, ticker social da PDP ("18 vendidos nas últimas 2h"),
  ferramenta de Comparar Produtos.

## Como validar

Todas as edições em `wkz-buyer.js` foram checadas com `node -c` após cada
alteração (sintaxe válida). Não foi possível testar visualmente nesta
sessão (sem acesso a navegador) — recomendo abrir o site, trocar para
cada um dos 7 idiomas e navegar por Loja → Categoria → Rastreio antes de
publicar.
