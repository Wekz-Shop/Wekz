# Sprint M20 — FIX-SCROLL-FADE-01 (débito técnico do Sprint M18)

Arquivos alterados: `admin/wkz-admin.js`, `buyer/wkz-buyer.js`, `buyer/wkz-buyer.html`.
Sem arquivos removidos do projeto. Nenhum arquivo de back-end tocado (fase de front-end estrito, conforme diretriz do projeto).

## Pedido do usuário

Auditoria multidisciplinar solicitada (engenharia, tributário, compliance,
growth/UX). Deste levantamento, o usuário escolheu como prioridade do
sprint os **bugs pendentes** já registrados no histórico do projeto:
`initAllScrollFades()`/`admNavFadeInit()` nunca definidas (débito técnico
anotado no Sprint M18) e a persona `'João da Silva Santos'` hardcoded em
`wkz-seller.js` (apontada como "ainda não auditada" no Sprint M19).

## 1. `initAllScrollFades()` e `admNavFadeInit()` — implementadas

**Diagnóstico confirmado:** as duas funções eram chamadas em ~6 pontos do
projeto (sempre atrás de `typeof === 'function'`, então nunca quebravam a
app), mas **nunca tinham sido definidas em lugar nenhum** do código-fonte.
O CSS do fade nas pontas já existia e estava correto
(`.cats-scroll-track.fade-left-hidden/.fade-right-hidden` e
`.adm-nav-track.fade-left-hidden/.fade-right-hidden`) — só nunca era
alternado, então o degradê ficava sempre estático, nas duas pontas, mesmo
no início/fim do scroll.

Adicionalmente, `wkz-admin.html` já tinha `onscroll="admNavScroll(this)"`
amarrado ao `<nav id="admNav">`, e essa função **também nunca existia** —
cada scroll do menu no mobile lançava um `ReferenceError` silencioso (não
travava a aplicação, mas nunca atualizava nada).

**Correção:** implementadas as duas funções seguindo exatamente o mesmo
padrão já validado e em produção em `initStoresScrollFade()`
(carrossel de Lojas Verificadas, Sprint M18) — a única implementação de
fade real que já existia no projeto:

- `initAllScrollFades()` (`wkz-buyer.js`) — track `#catsScrollTrack`,
  scroll real em `#catsGrid`. No desktop, `.cats-grid` vira CSS grid sem
  overflow (`maxScroll <= 0`), então ambos os fades ficam corretamente
  ocultos — nada aparece indevidamente fora do mobile.
- `admNavFadeInit()` + `admNavScroll(el)` (`wkz-admin.js`) — track
  `#admNavTrack`, scroll real em `#admNav`. `admNavScroll()` foi definida
  como a fonte única da lógica de atualização (reaproveitada tanto pelo
  `onscroll` inline já existente no HTML quanto pela chamada
  pós-troca-de-aba em `switchAdminTab()`), eliminando o `ReferenceError`
  sem precisar tocar em `wkz-admin.html`.

Nenhum CSS foi alterado — os seletores `.fade-left-hidden`/
`.fade-right-hidden` já existiam e só passaram a ser efetivamente usados.

## 2. Persona `'João da Silva Santos'` em `wkz-seller.js` — investigada, **não é um bug**

O Sprint M19 tinha marcado esta ocorrência como "página/conta separada,
ainda não auditada". Auditei agora e o resultado é diferente do suspeito
inicial: **não é o mesmo padrão de bug** corrigido no comprador
(FIX-ENDERECO-01/FIX-CADASTRO-04), onde um nome fixo vazava para a tela
por cima da conta real logada.

Aqui, o nome vive dentro de `mockOCR()`, uma função que **simula a
extração por OCR de um documento de identidade (RG) enviado no fluxo de
KYC do vendedor** — é o dado que o "documento" supostamente contém, não o
nome da conta logada. Rastreei todo o consumo desse retorno
(`wkzProcessKYCDocument()`, único ponto que o usa) e confirmei que o campo
`nome` **nunca é lido nem exibido em lugar nenhum** — a tela mostra apenas
o nome do arquivo e o "% de confiança do OCR". O painel de KYC do Admin
também não consome esse dado. Ou seja: é um valor de simulação morto, sem
qualquer vazamento visual para o usuário — não há o que corrigir hoje.

**Nenhuma alteração foi feita neste ponto.** Fica registrado para não ser
reaberto por engano em auditorias futuras, a menos que uma sprint futura
passe a exibir esse dado simulado em alguma tela (ex.: revisão de KYC no
Admin) — nesse caso, aí sim faria sentido trocá-lo por
`window.wkzGetDisplayName()` para consistência com a conta real.

## Testes / Verificações

- **`harness-buyer-test.js`** (oficial, sem alteração) rodado contra
  `wkz-buyer.js` novo, montado na estrutura real de pastas (`core/` +
  `buyer/`): **100% passou**, incluindo os 6 checks de regressão i18n.
- **`harness-admin-test.js`** (oficial, sem alteração) rodado contra
  `wkz-admin.js` novo: **100% passou** ("roda de ponta a ponta sem erro").
- **`node --check`** em `admin/wkz-admin.js` e `buyer/wkz-buyer.js`:
  sintaticamente válidos.
- **Simulação isolada da lógica de fade** (script de apoio pontual, não
  faz parte da entrega) — 4 cenários verificados numericamente (início,
  meio e fim do scroll, e desktop sem overflow): todos corretos.
  Como o mock de DOM do harness oficial sempre retorna `null` em
  `getElementById`, ele valida que as funções não quebram nada (guarda
  `if(!track || !grid) return`), mas não substitui um teste manual real
  de scroll no navegador — recomendado antes do próximo deploy.

## O que ficou de fora (fora do escopo deste pedido)

- Refatoração dos ~1000 `onclick` inline (item de segurança da auditoria,
  não pedido nesta sprint).
- Item da auditoria de gatilhos psicológicos (prova social em tempo real,
  barra de progresso de frete grátis, carrinho abandonado) — não pedido
  nesta sprint.
- Item de compliance (selo de direito de arrependimento CDC Art. 49) —
  não pedido nesta sprint.
- Versão em `package.json` não foi incrementada — segue o mesmo critério
  do Sprint M18, a critério do usuário definir o versionamento.

## Lembrete de processo

Os arquivos desta sprint foram entregues como download (sem acesso de
escrita ao projeto Claude nem ao GitHub do usuário). Após revisão, é
preciso substituir manualmente `admin/wkz-admin.js`, `buyer/wkz-buyer.js`
e `buyer/wkz-buyer.html` no repositório antes do próximo deploy, e
lembrar de atualizar os arquivos armazenados no projeto Claude conforme
solicitado no início da conversa.
