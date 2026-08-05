# Sprint M12 — Auditoria do Painel do Administrador

Arquivos alterados: `wkz-core.js`, `wkz-admin.js`, `wkz-admin.html`, `wkz-buyer.html`, `wkz-seller.html`.
Arquivo novo (ferramenta de teste, não faz parte do produto): `tools/test-broadcast-flow.js`.

## Contexto

Pedido do fundador: revisar as 12 páginas do menu lateral do Admin
(Visão Geral, Aprovação de Lojas, KYC/KYB, Moderação de Produtos,
Faturamento, Usuários, Comunicados, Segurança, Config, Kz IA, Disputas,
Saques/Payouts), com foco em botões sem rota de ação, estética e — em
especial — o funcionamento real da página **Comunicados**.

Metodologia: em vez de ler as ~3800 linhas manualmente, cruzei
automaticamente todo `onclick="..."` (estático no HTML e dentro dos
templates JS) contra as funções realmente definidas em `wkz-admin.js` /
`wkz-core.js`, o que aponta direto para botões "mortos" (chamam função
inexistente) ou decorativos (sem handler nenhum). Disputas já tinha sido
corrigida na Sprint M11.

---

## 1. Comunicados nunca entregava nada a ninguém (bug crítico)

Era a pergunta central do pedido — "verificar funcionamento da página
Comunicados" — e o resultado foi o bug mais sério encontrado nesta
auditoria inteira.

**Causa:** `wkz-core.js` tentava adicionar entrega real (push/banner/
inbox) "emprestando" a função `sendBroadcast()` do Admin via
`window.sendBroadcast = function(){...}`. Como `wkz-core.js` carrega
**antes** de `wkz-admin.js`, e este último declara sua própria
`function sendBroadcast(){}` no topo do ficheiro, essa declaração
**sobrescreve silenciosamente** o wrapper assim que `wkz-admin.js`
termina de carregar — sem nenhum erro no console. Confirmei isso
reproduzindo a ordem real de carregamento dos 3 scripts antes de tocar
em qualquer código. Resultado: o admin clicava "Enviar Comunicado", via
"✅ enviado com sucesso!"... e nenhum comprador ou vendedor recebia
absolutamente nada, em nenhuma circunstância.

**Correção** (mesmo padrão já usado nas Disputas — Sprint M11):
- `sendBroadcast()` agora grava o comunicado num registro compartilhado
  (`kzComunicados_v1`) via nova função `wkzShareBroadcast()`.
- Comprador e vendedor sincronizam esse registro ao abrir a aba
  (histórico entra silenciosamente na caixa de entrada) e **ao vivo**,
  via `WkzBus`, se a aba já estiver aberta no momento do envio — nova
  função `wkzSyncBroadcastsForRole('buyer'|'seller')`, chamada no
  bootstrap de `wkz-buyer.html` e `wkz-seller.html`.
- Segmentação por audiência (Todos/Vendedores/Compradores) agora usa uma
  chave estável (`all`/`sellers`/`buyers`, do `id` do botão) em vez do
  texto visível do botão — mais robusto a mudanças de copy.
- Adicionada confirmação antes de enviar (reaproveitando o modal
  `window._wkzConfirm`, já usado em Config → Modo Manutenção) — um
  comunicado atinge até ~318K contas de um único clique e não pode ser
  desfeito; antes não havia nenhuma barreira.
- `maxlength="280"` no campo de mensagem, consistente com o contador
  visual que já existia.

**Teste novo:** `tools/test-broadcast-flow.js` simula admin + comprador
(aba já aberta) + vendedor (abre a aba depois do envio) partilhando a
mesma `localStorage`/`BroadcastChannel`, e confirma: persistência,
entrega ao vivo, entrega por hidratação tardia, e que um comunicado só
para "Vendedores" não vaza para a aba do comprador. **8/8 passando.**

## 2. Botões mortos confirmados (sem handler ou chamando função inexistente)

| Local | Problema | Correção |
|---|---|---|
| Visão Geral → card Uptime | `<button class="adm-kpi-btn">Status →</button>` sem `onclick` nenhum (os que você circulou na captura) | Abre modal "Status da Plataforma" com uptime por serviço + histórico de incidentes |
| Visão Geral → card NPS | Mesmo caso, "Detalhes →" sem `onclick` | Abre modal "NPS da Plataforma" com breakdown por segmento (comprador/vendedor) e distribuição promotor/neutro/detrator |
| Saques → botão "⚡ Antecipar" | `onclick="admAnteciparSaque(...)"` chamava função **nunca definida** — clique gerava `ReferenceError` no console e nada acontecia na tela | Implementada: calcula o valor líquido expresso (taxa de 3%), pede confirmação, aprova o saque e registra a receita de antecipação no log de auditoria |
| Aprovação de Lojas → "Ver Docs" | Só mostrava um toast ("Abrindo dossiê...") — nenhum documento era exibido; o admin aprovava/recusava "às cegas" | Abre modal com o dossiê da loja: CNPJ + 4 documentos exigidos no KYB, com status recebido/pendente por item |
| Config → "💾 Salvar Limites" | Os 5 campos (máx. produtos, máx. imagens, prazo mín., valor mín., chargeback máx.) **não tinham `id`** — a função só mostrava "✅ salvo com sucesso" e um log de auditoria genérico, sem ler nenhum valor real. Reload sempre voltava aos 5 valores fixos do HTML | Campos ganharam `id`; `saveLimits()` agora lê, valida contra os próprios min/max de cada input, e persiste em `localStorage`. Um `loadSavedLimits()` novo restaura os valores salvos ao recarregar a página |

## O que ficou de fora desta rodada (mapeado, não corrigido)

- **Segurança → "🔍 Ver" numa conta suspeita** (`secViewAccount`): mesmo
  padrão do antigo "Ver Docs" — só mostra toast, não abre um dossiê de
  verdade. Não corrigido ainda; mesma solução (modal reaproveitando
  `#admInfoModal`) se aplicaria.
- **Faturamento**: página 100% estática — sem seletor de período, sem
  exportação, sem drill-down por transação/loja. Compete diretamente com
  o que Mercado Livre/Amazon Seller Central oferecem no financeiro do
  admin; recomendo tratar como um item à parte (maior escopo).
- **Usuários**: mostra um aviso "disponível na versão Enterprise" — não
  há busca, listagem, nem ações (suspender, ver histórico) sobre
  compradores/vendedores individualmente. Dado que o pedido menciona
  explicitamente "Usuários: compradores e vendedores", este é o maior
  gap remanescente da auditoria e também recomendo como item à parte.
- **Kz IA**: ainda não auditada linha a linha nesta rodada.

## Testes

- `node --check` em `wkz-core.js` e `wkz-admin.js` — passa.
- `tools/harness-node.js`, `seller/harness-seller-test.js`,
  `admin/harness-admin-test.js`, `buyer/harness-buyer-test.js` — todos
  passam (sem regressão).
- `tools/test-disputes-flow.js` (Sprint M11) — 18/18, sem regressão.
- `tools/test-broadcast-flow.js` (novo) — 8/8.
- Smoke test manual das 5 novas funções de UI (`admShowUptimeDetail`,
  `admShowNpsDetail`, `admShowStoreDocs`, `admAnteciparSaque`,
  `saveLimits`/`loadSavedLimits`) — todas executam sem lançar erro e
  produzem HTML não-trivial no modal.
