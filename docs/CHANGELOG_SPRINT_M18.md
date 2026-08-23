# Sprint M18 — Home do Comprador: Coleções em Destaque, Segurança da Compra e Carrossel de Lojas

Arquivos alterados: `buyer/wkz-buyer.html`, `buyer/wkz-buyer.js`, `shared/wkz-styles-full.css`, `legal/wkz-legal.html`.
Sem arquivos removidos do projeto. Nenhum arquivo de back-end tocado (fase de front-end estrito, conforme diretriz do projeto).

## Pedido do usuário

A partir de 2 screenshots da home (mobile), 4 pontos levantados sobre o
conteúdo exibido logo após a paginação de produtos, com pedido explícito de
avaliação estratégica de e-commerce em cada um (manter/remover/melhorar):

1. Banners "Mega Eletrônicos / Moda Global / Casa & Design" — utilidade real?
2. Bloco "Sua Proteção Garantida" — posição ideal é a home ou uma página própria?
3. "Lojas Verificadas" — viabilidade de rolagem horizontal com fade nas pontas.
4. Barra "Entrega Rápida / Devolução Fácil / Pagamento Seguro / Suporte 24/7" —
   posicionamento acima do footer e possibilidade de torná-la clicável.

## Decisões estratégicas

**1. Banners → "Coleções em Destaque" (mantidos, não removidos)**
Banners de categoria são um padrão consolidado em marketplaces grandes
(Amazon, Shopee, AliExpress) porque convertem navegação passiva em
descoberta de categoria. O problema não era a existência do bloco, e sim ele
ser 100% decorativo — texto fixo, sem prova social, sem ligação com os dados
reais da plataforma. Mantido, porém agora **data-driven**: lê a contagem real
de produtos do mesmo array `categories` que alimenta "Explorar Categorias"
(fonte única — nunca mais diverge), e ganhou uma tag de curadoria
("🔥 Mais procuradas") explicando por que só 3 das 12 categorias aparecem
aqui — evita a sensação de conteúdo redundante com a grade de categorias
logo acima.

**2. "Sua Proteção Garantida" → removida da home, migrada para página própria**
Dois problemas reais identificados: (a) a home mencionava "Pagamento Seguro"
**duas vezes** — uma vez neste bloco, outra na barra de confiança logo
abaixo — exatamente o tipo de repetição que o usuário pediu para evitar; (b)
grandes players não usam um bloco extenso de 3 parágrafos no meio do scroll
da home para reforçar confiança — usam selos/ícones compactos e concentram a
explicação detalhada numa página dedicada. Seguindo esse padrão (e a própria
convenção já usada no projeto para Garantia de Autenticidade/Anti-fraude,
que já vivem em `wkz-legal.html`), o conteúdo foi expandido e movido para a
nova página `wkz-legal.html#pg-seguranca`. A home passou a ter só 1 linha de
reforço com link "saiba como →".

**3. Lojas Verificadas → carrossel horizontal com fade real**
Implementado exatamente como sugerido: arraste no mobile, setas de canto no
desktop, fade nas pontas em ambos, espaçamento entre cards preservado (24px
desktop / 14px mobile, alinhado ao padrão de outras seções). "Ver todas →"
mantido como atalho para quem prefere grade completa. Foi a solução mais
simples e a mais alinhada ao que já existe no projeto: reaproveita o mesmo
padrão de arrasto+setas já usado no Flash Sale Hero (`.flashhero-*`), só que
com fade realmente funcional (ver "Bugs encontrados" abaixo).

**4. Barra de confiança → posição mantida, itens agora clicáveis**
Ao inspecionar a estrutura do HTML, a barra já é o último bloco de
`#page-home` antes do `<footer>` compartilhado — ou seja, na prática **já
renderiza imediatamente acima do rodapé**, então não havia nada para mover
fisicamente. O que faltava era torná-la útil: cada um dos 4 itens agora
navega para a página de explicação correspondente (rastreio, devoluções,
segurança, central de ajuda), com suporte a teclado (`role="link"`,
`tabindex`, `Enter`/`Espaço`) já que passaram a ser interativos.

## Implementação por arquivo

### `buyer/wkz-buyer.html`
- Bloco `<!-- BANNERS -->` (3 cards estáticos) substituído por um container
  vazio `#featuredCollectionsGrid`, injetado por `renderFeaturedCollections()`.
- Bloco `<!-- PROTECTION -->` (`.protection-section`) removido por completo.
- `<!-- TOP STORES -->`: `#storesGrid` agora fica dentro de
  `.stores-scroll-wrap > .stores-scroll-track`, com 2 botões de seta
  (`scrollStores(-1)`/`scrollStores(1)`).
- `<!-- TRUST -->`: os 4 `.trust-item` ganharam `onclick` para as páginas de
  `wkz-legal.html` correspondentes + atributos de acessibilidade; novo bloco
  `.trust-more` (link "saiba como →" para a página de segurança).
- Rodapé (coluna "Suporte"): novo link permanente "Segurança & Proteção da
  Compra" apontando para `wkz-legal.html#pg-seguranca`.

### `buyer/wkz-buyer.js`
- `renderAll()`: adicionada chamada a `renderFeaturedCollections()`.
- Nova constante `FEATURED_COLLECTIONS` (curadoria das 3 categorias) + nova
  função `renderFeaturedCollections()` — lê nome/contagem de `categories`
  (`wkz-core.js`), monta os cards com badge de contagem real e CTA
  "Explorar coleção →".
- Nova função `scrollStores(dir)` — mesmo padrão de `scrollFlashHero(dir)`.
- Nova função `initStoresScrollFade()` — liga/desliga `.fade-left-hidden` /
  `.fade-right-hidden` com base na posição real de `scrollLeft`, com listener
  de `scroll` (passivo) e `resize`.
- `renderStores()`: passou a chamar `initStoresScrollFade()` ao final do
  render (a página "Todas as Lojas", que usa `#storesGridFull`, não tem a
  track e não é afetada).

### `shared/wkz-styles-full.css`
- Novo bloco `.banner-count` / `.banner-cta` / `.banners-strip-tag` (badges e
  CTA dos cards de coleção).
- Novo bloco `.stores-scroll-wrap` / `.stores-scroll-track` /
  `.stores-grid.stores-scroll` — carrossel flex com `scroll-snap`,
  scrollbar oculta, fade nas pontas via pseudo-elementos (ativo em qualquer
  largura de tela, não só mobile).
- Nova classe genérica `.carousel-arrow` (setas com cor teal da marca,
  distinta da laranja `.flashhero-arrow`, que é específica do Flash Sale) —
  reutilizável em futuros carrosséis.
- `.trust-item`: `cursor:pointer`, `:hover` e `:focus-visible` (novo, para
  navegação por teclado).
- Nova classe `.trust-more` (linha de reforço com o link para a página de
  segurança).
- Ajuste no breakpoint mobile (`≤768px`) do carrossel de lojas: gap reduzido
  para 14px e cards para 190px, alinhado ao padrão já usado em outras seções
  do mobile.

### `legal/wkz-legal.html` (nova página)
- Nova página `#page-pg-seguranca` ("Segurança & Proteção da Compra"),
  inserida entre Garantia de Autenticidade e Acessibilidade. Reaproveita as
  classes existentes `.protection-grid`/`.protection-item` (resumo dos 3
  pilares, mesmo texto que estava na home) e `.inner-section` (3 blocos de
  detalhamento: pagamento, proteção ao comprador, vendedores verificados),
  com links cruzados para Mediação de Disputas e Garantia de Autenticidade.
  Nenhuma classe CSS nova foi necessária para esta página.

## Bugs encontrados e corrigidos durante a sprint

Não estavam no escopo do pedido, mas apareceram na mesma superfície de
código mexida e foram corrigidos junto, por serem baratos e diretamente
relacionados:

1. **Card "Casa & Design" filtrava com rótulo errado.** O `onclick` chamava
   `filterCat('Casa')`, mas o nome canônico em `categories`/`CAT_KEY_MAP` é
   `'Casa & Deco'`. Funcionava por coincidência (o fallback
   `.toLowerCase().replace()` gerava a mesma chave `'casa'`), mas o toast de
   confirmação mostrava "Categoria: Casa" em vez de "Casa & Deco". Corrigido
   ao reescrever a seção como data-driven.
2. **`initAllScrollFades()` é código morto.** Referenciada em 6 pontos do
   projeto (`wkz-buyer.js` e `wkz-admin.js`), sempre atrás de
   `typeof === 'function'`, mas **nunca foi definida em lugar nenhum** —
   confirmado por busca em todo o código-fonte. Na prática, o fade estático
   de `.cats-scroll-track` nunca teve seu estado atualizado pelo scroll real
   (fica sempre com a mesma opacidade). Não mexi nos usos existentes (fora
   do escopo desta sprint), mas o carrossel novo de lojas **não repete esse
   padrão**: `initStoresScrollFade()` é uma implementação nova e funcional.
3. **Link morto no bloco de Proteção.** "Ver Garantia de Autenticidade →"
   chamava `showPage('pg-garantia-autenticidade')`, mas essa página vive em
   `wkz-legal.html`, um documento HTML separado — `showPage()` só enxerga
   `#page-X` do mesmo documento, então o clique não fazia nada. Como o bloco
   inteiro foi removido/migrado, o link problemático foi junto; os links
   novos criados nesta sprint já seguem o padrão correto
   (`window.location.href='../legal/wkz-legal.html#pg-x'`).

## Testes / Verificações

- **`harness-buyer-test.js`** (harness oficial do projeto, sem alteração) —
  rodado contra o `wkz-buyer.js` novo montado na estrutura real de pastas
  (`core/` + `buyer/`): **100% passou**, incluindo os 6 checks de regressão
  i18n (que este sprint não tocou, mas precisava continuar intacto).
- **`node --check`** em `buyer/wkz-buyer.js`, `core/wkz-core.js`,
  `core/wkz-bus.js` — sintaticamente válidos.
- **`verify-m18.js`** (novo script de apoio, não faz parte da entrega) — 10
  verificações específicas desta sprint, todas passando:
  `renderFeaturedCollections()`, `scrollStores()`, `initStoresScrollFade()`,
  `renderStores()` e `renderAll()` executam sem erro; as 3 categorias de
  `FEATURED_COLLECTIONS` existem em `categories` com contagem lida
  corretamente; `CAT_KEY_MAP['Casa & Deco']` resolve para `'casa'`; o HTML
  gerado usa `filterCat('Casa & Deco')` e não mais `filterCat('Casa')`.
  Rodei o mesmo script contra o `wkz-buyer.js` **original** para confirmar
  que as funções novas realmente não existiam antes (todas falham com
  "is not defined"), descartando falso positivo.
- Balanceamento de `<div>`/`</div>` conferido em `wkz-buyer.html` e
  `wkz-legal.html`, e de `{`/`}` em `wkz-styles-full.css` — sem divergência
  introduzida pelas edições.
- Conferido que nenhum `id` novo colide com IDs já existentes nos 2 arquivos
  HTML.

## O que ficou de fora (fora do escopo deste pedido)

- Não foi criada uma página "Todas as Coleções" — as mesmas 12 categorias já
  são cobertas pela grade "Explorar Categorias" logo acima; um índice
  separado seria redundante.
- `initAllScrollFades()` continua sem existir nos usos pré-existentes
  (`.cats-scroll-track` em Categorias, `admNavFadeInit` no Admin) — corrigir
  isso seria uma mudança maior, fora do pedido desta sprint, mas fica
  registrado como débito técnico conhecido para um próximo sprint.
- Não criei um harness `.js` formal (`test-m18-*.js`) no padrão dos demais
  arquivos de teste do projeto — usei `verify-m18.js` como script de apoio
  pontual. Se fizer sentido manter uma suíte permanente para a home do
  comprador, um próximo passo natural é formalizar esse script no mesmo
  molde de `harness-buyer-test.js` e registrar em `package.json`
  (`test:m18`).
- Versão em `package.json` não foi incrementada — deixei a critério do
  usuário definir o versionamento.

## Lembrete de processo

Os arquivos desta sprint foram entregues como download (sem acesso de
escrita ao projeto Claude nem ao GitHub do usuário). Após revisão, é preciso
substituir manualmente `buyer/wkz-buyer.html`, `buyer/wkz-buyer.js`,
`shared/wkz-styles-full.css` e `legal/wkz-legal.html` no repositório antes
do próximo deploy.
