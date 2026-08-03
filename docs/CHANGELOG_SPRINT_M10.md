# Sprint M10 — Varredura funcional do Painel do Vendedor: Disputas, Marketing
↔ Seller Premium, Prova Social, Denúncias, Configurações, Minhas Indicações

Arquivos alterados: `wkz-seller.html`, `wkz-seller.js`, `wkz-core.js`.

## Contexto

Pedido: revisar função por função, botão por botão, nas páginas **Disputas**,
**Marketing** (com foco na relação Anúncios Patrocinados ↔ WeKz Seller
Premium), **Relatórios**, **Configurações** (+ logotipo do painel e opção de
deixar de ser vendedor), **Denúncias**, **Prova Social** e **Minhas
Indicações**, com liberdade para adotar melhorias com base em concorrência.

Cada página foi lida por completo (HTML + JS) antes de qualquer alteração.
O achado mais significativo (item 3, Denúncias) reverte uma conclusão errada
registrada no Sprint M5.

---

## 1. Disputas

**Bugs reais encontrados:**

- Os números das abas (`Abertas (2)` / `Resolvidas (3)` / `Fechadas (2)`) e o
  banner `"Você tem 2 disputas aguardando resposta"` eram texto fixo no
  HTML, nunca recalculados. Depois que o vendedor respondia a uma disputa
  (`enviarRespostaDisputa`), o card ficava marcado "✅ Respondido" mas
  **continuava contando para sempre** como "aguardando resposta" — o banner
  de urgência nunca zerava, mesmo com todas as disputas respondidas.
- Disputas **resolvidas/fechadas não tinham nenhuma interação**: nenhum
  grande marketplace (Mercado Livre, Amazon Seller Central) deixa o
  histórico de um caso encerrado inacessível.

**Correções:**

- Nova função `updateDisputeTabCounts()`: recalcula os 3 contadores das
  abas e o banner a partir do estado real do DOM (`data-dispute-status` +
  novo `data-answered`), chamada ao entrar na aba, no bootstrap da página e
  toda vez que uma disputa é respondida.
- `enviarRespostaDisputa()` agora marca `data-answered="1"` no card e
  adiciona uma nota "⏳ Resposta enviada — aguardando decisão da WeKz",
  deixando claro que a disputa saiu das mãos do vendedor sem fingir que ela
  "sumiu".
- Nova `openDisputeDetailModal(...)`: as 5 disputas resolvidas/fechadas
  agora abrem um modal somente-leitura com pedido, produto, comprador,
  motivo e veredito completo.
- Removido o `showToast()` a cada clique de filtro (`filterMyDisputes`) —
  nenhum outro filtro do painel (`filterOrders`, `filterDenuncias`) notifica
  a cada troca de aba; era ruído e inconsistência.

---

## 2. Marketing ↔ WeKz Seller Premium (Anúncios Patrocinados)

**O achado central do pedido:** o card "Anúncios Patrocinados" exibe um selo
`PREMIUM`, e o próprio texto dos planos promete *"Anúncios patrocinados
liberados"* como benefício exclusivo dos planos **Pro** e **Enterprise**
(ver `PLANS` no controller do Seller Premium). Na prática, **nada
verificava isso**: não existia, em lugar nenhum do projeto, uma variável
guardando qual plano o vendedor tinha assinado. `salvarMarketing('ads')`
ativava o anúncio pago para qualquer vendedor, com ou sem plano. O selo era
puramente decorativo.

**Correções:**

- `confirmPremiumSubscription()` agora persiste o plano assinado
  (`wkzSecureStorage.set('seller_premium_plan', plano)`) ao concluir a
  "compra" — mesma origin do Buyer/Admin, então sobrevive à navegação entre
  módulos e a reloads.
- Novas funções `getSellerPremiumPlan()` e `sellerHasAdsAccess()` (só
  `pro`/`enterprise` têm acesso, batendo com `PLANS.*.benefits`).
- `openMarketingModal('ads')` agora checa `sellerHasAdsAccess()` **antes**
  de abrir o formulário de CPC: sem plano elegível, abre um modal explicando
  a exigência com atalho direto para "Ver Planos". `salvarMarketing`'s `ads`
  handler ganhou a mesma checagem como defesa em profundidade.
- Nova `refreshSellerPremiumUI()`: mantém o widget "WeKz Seller Premium" do
  Painel Geral (badge, descrição e texto do botão) e o card de Anúncios
  Patrocinados (nota de cadeado "Requer plano Pro ou Enterprise")
  sincronizados com o plano real — sem precisar recarregar a página depois
  de assinar. Chamada no bootstrap e em toda troca de aba.

---

## 3. Denúncias — reavaliação da decisão do Sprint M5

O `CHANGELOG_SPRINT_M5.md` registrou: *"reportsStore (Buyer) e
ADMIN_REPORTS (Admin) são estruturas genuinamente diferentes [...] não existe
uma terceira estrutura 'visão do vendedor'."* Nova varredura encontrou o
oposto: **`wkz-buyer.js` já tinha uma implementação completa e correta**
— `reportsStore`, `renderReports()`, `filterDenuncias()`, `toggleDenuncia()`,
`updateDenunciasCount()`, `toggleDefesaForm()`, `submitDefesa()`,
`advanceStatus()` — renderizando especificamente nos IDs `#dash-denuncias` /
`#denunciasList` / `#denunciasCount`. **Esses IDs só existem em
`wkz-seller.html`.** Não existem em `wkz-buyer.html`. Ou seja: essa sempre
foi a "visão do vendedor sobre denúncias recebidas", só que ficou fisicamente
no arquivo errado durante a divisão do monólito (Sprint M2/M3) — e
`wkz-seller.html` nunca carrega `wkz-buyer.js`. O próprio `wkz-seller.js`
tinha um comentário reconhecendo isso e deixando um stub vazio no lugar:

```js
/* filterDenuncias: ... O dado (reportsStore) e a renderização real
   (renderReports) ficaram em wkz-buyer.js no Sprint M2 — arquivo
   diferente, sem acesso cross-file possível sem redesenho. [...]
   Stub apenas evita o crash ao clicar. */
```

Resultado prático: a aba "Denúncias" do painel do vendedor estava **vazia
para sempre** (`#denunciasList` nunca preenchido), o badge de contagem na
sidebar sempre mostrava `0`, e os 3 botões de filtro só trocavam a classe
`active` sem filtrar nada.

**Correção:** a implementação real foi portada para `wkz-seller.js`,
adaptada ao contexto do vendedor (mesmo shape de dados, `storeName` agora
vem de `currentSeller.store`). Inclui o fluxo completo: pipeline visual
Recebida → Análise → Defesa → Resolvida, textarea de defesa do vendedor,
histórico de logs com timestamp, e um botão "[Demo] Simular avanço da
análise WeKz" para visualizar o fluxo sem esperar. `updateDenunciasCount()`
agora atualiza o badge da sidebar de verdade, e é chamada no bootstrap da
página (não só ao abrir a aba).

---

## 4. Prova Social

**Bugs reais encontrados:**

- O toggle "Ativar notificações" chama `kzSocialProofToggleChange(this)` no
  `onchange` — função **referenciada mas nunca definida** em lugar nenhum do
  projeto (erro de `ReferenceError` no console a cada clique).
- O botão "Guardar" chama `window.kzSocialAdminStatus()` — **também nunca
  definida** (só não quebrava porque a chamada tinha `if (window.kzSocialAdminStatus)`
  como guarda). Resultado: o selo de status ao lado do toggle nunca saía de
  "🔘 Desativado", mesmo depois de salvar como ativo.
- O valor salvo nunca era lido de volta: reabrir a aba sempre mostrava o
  toggle desmarcado, mesmo com uma preferência já salva.
- Mais grave: `kzSocialProofStart()` — a função que de fato liga os
  pop-ups no marketplace — **nunca era chamada automaticamente em lugar
  nenhum do código**, em nenhum dos 4 módulos. A única forma de ver um
  pop-up real era clicar manualmente em "Pré-visualizar" na própria aba do
  vendedor. Ou seja: mesmo "ativada e salva", a prova social nunca aparecia
  de verdade para um comprador navegando o marketplace.

**Correções:**

- `kzSocialProofToggleChange(el)` e `kzSocialAdminStatus()` implementadas
  (`wkz-seller.js`), com feedback visual imediato no toggle e selo final
  após salvar.
- Nova `initDashSocialProof()`: restaura toggle + selo com a última
  preferência salva ao abrir a aba (chamada em `switchDashTab`).
- `kzSocialProofSync()` (`wkz-core.js`) agora tem fallback: quando o toggle
  não existe no DOM (ou seja, em qualquer página que não seja o painel do
  vendedor — Buyer, Admin), lê a preferência persistida diretamente do
  `wkzSecureStorage` em vez de assumir "desativado".
- **Bootstrap automático**: ao final do bloco de Prova Social em
  `wkz-core.js`, `window.kzSocialProofSync()` agora roda uma vez ao carregar
  qualquer página — é isso que conecta o toggle do vendedor ao
  comportamento real visto pelos compradores, coisa que nunca acontecia
  antes.

---

## 5. Configurações

**Implementado (pedido explícito):**

- **Logotipo do painel**: avatar da sidebar (antes só a letra "M" fixa em
  HTML) ganhou um botão de edição (ícone de lápis) e um controle espelhado
  dentro do card "Dados da Loja". Upload via `FileReader → dataURL` (mesmo
  padrão já usado no upload de imagem de produto), validação de tipo/tamanho
  (até 2MB), persistido via `wkzSecureStorage` e restaurado no carregamento
  da página (`restoreSellerLogo()`).
- **Deixar de ser vendedor**: novo card "Zona de Risco". Antes de permitir o
  encerramento, valida pendências reais (pedidos `pending`/`dispute` na
  tabela de pedidos, disputas abertas sem resposta) e bloqueia com uma lista
  específica do que precisa ser resolvido primeiro — em vez de deixar a
  conta "sumir" com pendências, como nenhum marketplace sério permite.
  Sem pendências, exige digitar `ENCERRAR` para confirmar (mesmo padrão de
  fricção deliberada usado em ações destrutivas noutras partes do app) e
  redireciona para o módulo Buyer.

**Recurso novo, sem duplicar o que já existe nas outras abas (pedido
explícito, base: LGPD/Lei 13.709/2018):**

- Card **"Privacidade & Dados (LGPD)"** com botão "Baixar meus dados
  (JSON)" — exporta um JSON com os dados da loja, produtos, disputas,
  denúncias e plano premium, via `Blob`/`URL.createObjectURL`, sem chamada
  de rede (mesma filosofia "sem back-end nesta fase" do resto do projeto).
  Nenhuma outra página do painel oferece exportação de dados pessoais —
  Relatórios exporta números de negócio (vendas/estoque/financeiro), não os
  dados cadastrais do titular.

---

## 6. Minhas Indicações

Os 4 cards de estatística ("2.450 Pontos Kz", "7 Indicados", "19 Vendas",
"3 Pendentes") eram texto fixo no HTML que só *coincidia* com a soma do mock
`AFFILIATE_REFERRALS` — qualquer alteração nos dados ficaria dessincronizada
silenciosamente, o mesmo tipo de bug já corrigido em outras páginas em
sprints anteriores. `initAffiliates()` agora soma os dados reais
(`reduce`) toda vez que a lista é renderizada.

Restante da página (cópia do link de indicação, tabela de indicados) já
funcionava corretamente — sem alterações além da correção acima.

---

## 7. Relatórios

Revisão completa: `openReportVendas/Estoque/Financeiro/Avaliacoes` e
`exportarRelatorio()` já geram e baixam um arquivo real (`Blob` + link
`download`), com conteúdo específico por tipo de relatório — **não havia
bug funcional**. Nenhuma alteração necessária.

Limitação conhecida e proposital, não alterada nesta sprint: o "PDF" e o
"Excel" exportados são texto simulado com a extensão correspondente (não um
PDF/XLSX binário de verdade), consistente com a fase atual do projeto
("front-end estrito", sem geração de documento binário real no cliente).
Sinalizado aqui para quando fizer sentido trocar por uma lib de geração real
(ex.: exceljs/pdf-lib) — hoje o ganho não compensa a complexidade para dados
100% mock.

---

## Testes

- `npm run check:seller` (`node --check seller/wkz-seller.js`) e o mesmo
  para `wkz-core.js` — **passam**.
- `npm run test:m3` (`seller/harness-seller-test.js`) — carrega
  `wkz-bus.js` → `wkz-core.js` → `wkz-seller.js` de ponta a ponta num DOM
  simulado — **passa**, incluindo o novo bootstrap automático de
  `kzSocialProofSync()` em `wkz-core.js` (que agora roda no carregamento de
  qualquer módulo).
- Rodei também `test:m2` (Buyer) e `test:m4` (Admin) por completo, já que
  `wkz-core.js` é compartilhado pelos 4 módulos — **ambos passam**,
  confirmando que o bootstrap novo não quebra Buyer/Admin.
- `npm run test:m1` (`tools/harness-node.js`) — **passa**.
- Verificação manual de integridade do HTML: contagem de `<div>`/`</div>`
  balanceada antes e depois das edições (954/954 → 967/967, as 13 novas
  divs correspondem exatamente aos elementos novos adicionados).
- Sem duplicidade de função: conferido que cada função nova
  (`updateDisputeTabCounts`, `openDisputeDetailModal`, `sellerHasAdsAccess`,
  `getSellerPremiumPlan`, `refreshSellerPremiumUI`,
  `kzSocialProofToggleChange`, `kzSocialAdminStatus`,
  `initDashSocialProof`, `renderReports`, `toggleDenuncia`,
  `updateDenunciasCount`, `advanceStatus`, `toggleDefesaForm`,
  `submitDefesa`, `formatLogTime`, `handleSellerLogoUpload`,
  `applySellerLogo`, `restoreSellerLogo`, `baixarMeusDadosVendedor`,
  `abrirModalDeixarDeVender`, `confirmarDeixarDeVender`) existe exatamente
  uma vez no arquivo final.

## O que ficou de fora (proposital)

- `WkzApp.state.socialProof` (helpers `socialProofSetInterval`/`Clear`/
  `NextUid` em `wkz-core.js`) é um sistema de estado paralelo, nunca
  conectado ao `kzSocialProofStart/Stop/Show` real (que usa variáveis de
  módulo próprias). Parece resíduo de uma refatoração anterior para o State
  Manager que não foi concluída. Não é usado por nada funcional hoje —
  sinalizado para limpeza futura, fora do escopo desta sprint (que era
  consertar o toggle, não redesenhar o gerenciamento de estado).
- Exportação de relatório em PDF/Excel real (ver seção 7).
- "Deixar de ser vendedor" reativa a conta automaticamente se o
  vendedor cadastrar um produto de novo? Não implementado — o encerramento é
  tratado como definitivo nesta fase (redireciona para o Buyer), sem um
  fluxo de "reabrir loja". Sinalizado para quando houver uma tela de
  "Tornar-se vendedor" com estado explícito para reaproveitar.
