# Sprint M17 — [FIX-seller-approval] Loja cadastrada não aparecia no Admin

Arquivos alterados: `wkz-core.js`, `wkz-seller.js`, `wkz-admin.js`, `wkz-admin.html`.
Teste novo: `test-seller-admin-store-bridge.js` (20 asserções, 0 falhas) — simula
duas "abas" (vendedor e admin) em contextos JS separados, comunicando pelo
mesmo `localStorage`, exatamente como duas páginas reais do site.
Regressão: os 10 arquivos de teste/harness já existentes continuam 100% ok
(90+ asserções, 0 falhas).

## Perguntas do usuário e diagnóstico

**"A loja nova não aparece no Admin — depende de back-end ou é só front-end?"**
Confirmado: é só front-end, sem nenhuma dependência de back-end.
`finishSellerRegister()` (conclusão do wizard Loja→Empresa→Banco→KYC) nunca
escrevia os dados do formulário em lugar nenhum — só simulava um delay e
mostrava a tela "Loja em Análise!". A lista `ADMIN_STORES` no Admin é (e
continua sendo) um array de 7 lojas fictícias fixo no código — não existia
nenhuma ponte entre um cadastro real e essa lista.

**"Os botões Ver Docs/Aprovar/Recusar não têm rota de ação"**
Testado empiricamente clicando nos 3 botões via harness: **estão
corretamente wireados no código** (delegação por `data-saction`,
`admApproveStore`/`admRejectStore`/`admShowStoreDocs` executam e produzem
efeito real). Porém, ao investigar, encontrei um bug real e mais amplo:
`admNavFadeInit` é chamada 2x em `wkz-admin.js` (dentro de
`switchAdminTab()`) mas **nunca foi definida em lugar nenhum do projeto**.
Sem blindagem `typeof === 'function'` (que o resto do código já usa pra
essa mesma função — inclusive `wkz-buyer.js`), toda troca de aba no menu
lateral do Admin lançava `ReferenceError` sem ser capturado, interrompendo
a função ANTES de rodar `renderAdminStores()`/`renderAdminKyc()`/
`renderAdminReports()`/`renderCommHistory()`/`renderSecurityPanel()`, e
antes do `patchSwitchAdminTabAll()` rodar os refreshes de Kz IA/Disputas/
Saques/Overview ao trocar de aba. Provável causa da sensação de "nada
funciona direito" no Admin, mesmo com os botões em si corretos.

## Correção

**`wkz-core.js`** — nova entrada `storeRequests: 'kzLojasAprovacao_v1'` em
`WKZ_SHARED_KEYS`, e 3 funções novas (mesma arquitetura já usada pra
disputas/comunicados: fonte única em `localStorage` + `WkzBus` pra
atualização ao vivo entre abas):
- `wkzShareNewStoreRequest(entry)` — publica uma nova solicitação.
- `wkzGetSharedStoreRequests()` — lê todas as solicitações.
- `wkzUpdateSharedStoreRequest(id, patch)` — persiste uma decisão
  (aprovado/recusado) de volta na fonte partilhada.

**`wkz-seller.js`** — `finishSellerRegister()` agora lê os campos reais do
wizard (nome da loja, tipo de vendedor, categoria, país, CNPJ, razão
social, nome fantasia — antes só nome/tipo/CNPJ eram lidos, e nem eram
usados pra nada) e chama `wkzShareNewStoreRequest()` antes de mostrar a
tela "Loja em Análise!". Como o wizard não pede nome pessoal do
responsável, o campo "owner" cai pro nome fantasia/razão social/nome da
loja, nessa ordem.

**`wkz-admin.js`**:
- Nova `wkzHydrateSharedStoresForAdmin()` — mescla as lojas reais
  (`status: pending/docs`) por cima das 7 mock ao carregar a página,
  ANTES do primeiro `renderAdminStores()`; e registra um listener
  `WkzBus.on('store:registered', ...)` pra atualizar a lista + badge +
  toast ao vivo, sem reload, se o Admin já estiver com a aba aberta
  quando um vendedor termina o cadastro.
- `admApproveStore()`/`admRejectStore()` agora chamam
  `wkzUpdateSharedStoreRequest()` pra persistir a decisão — sem isso, um
  reload do Admin faria a loja aprovada "voltar" pra fila.
- Fix do crash: as 2 chamadas de `admNavFadeInit` (linhas ~55 e ~2148)
  ganharam a mesma blindagem `typeof === 'function'` já usada em outros 5
  lugares do projeto pra essa função — nenhum comportamento visual novo
  foi inventado (não há nenhum CSS/HTML no projeto associado a essa
  função, então a correção é apenas parar de quebrar, sem chutar o que
  ela "deveria" fazer).

**`wkz-admin.html`** — bootstrap (`DOMContentLoaded`) chama
`wkzHydrateSharedStoresForAdmin()` antes do primeiro `renderAdminStores()`.

## O que ficou de fora (fora do escopo deste pedido)

- `spdSetApprovalStatus` continua sendo chamada (já era assim antes) mas
  nunca foi definida em lugar nenhum — é sempre blindada com
  `typeof === 'function'`, então nunca quebra nada; parece ser resquício
  de um "Painel do Fornecedor" que nunca chegou a ser construído. Não
  mexi nisso — seria uma feature nova, não uma correção.
- O lado do vendedor (`wkz-seller.js`) ainda não tem nenhuma tela que
  mostre "sua loja foi aprovada/recusada" — a tela "Loja em Análise!"
  continua estática depois do cadastro. Dá pra construir isso num
  próximo sprint reaproveitando o mesmo `wkzUpdateSharedStoreRequest` +
  `WkzBus.on('store:statusChanged', ...)` que já ficou pronto aqui.
