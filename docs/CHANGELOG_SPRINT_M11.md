# Sprint M11 — Disputas: fonte única de verdade entre Comprador, Vendedor e Admin

Arquivos alterados: `wkz-core.js`, `wkz-seller.js`, `wkz-admin.js`.
Arquivo novo (ferramenta de teste, não faz parte do produto): `tools/test-disputes-flow.js`.

## Contexto

Relato do fundador, testando com a loja "Tecnologia Brasil": abriu uma
disputa em "Meu Perfil" (comprador) para o pedido `#WKZ-9042`, motivo
"Atraso na entrega além do prazo". Observou 5 sintomas:

1. O painel do vendedor **não mostrava a disputa** aberta pelo comprador
   (ou mostrava um motivo diferente do que foi realmente escolhido).
2. O admin recebeu a disputa corretamente e conseguiu concluir a mediação.
3. Ao voltar em "Meu Perfil", **a disputa tinha sumido** — sem histórico,
   sem o resultado da mediação do admin.
4. No painel do vendedor, a disputa continuava errada/desatualizada, sem
   nenhum registro da conclusão feita pelo admin.

Investiguei o código dos 3 painéis (`wkz-core.js`, `wkz-seller.js`,
`wkz-admin.js`) e confirmei 3 bugs reais e distintos, todos com a mesma
causa raiz: **o registro de uma disputa era só um evento "append-only"
(gravado uma vez na abertura), nunca atualizado depois** — e boa parte da
propagação entre painéis dependia de variáveis de memória que só existem
dentro da MESMA aba do navegador, sem nenhum efeito nas outras 2 abas.

---

## 1. Comprador × Vendedor mostravam motivos diferentes para o mesmo pedido

**Causa:** quando existe mais de um registro salvo para o mesmo `orderId`
(ex.: o comprador testou o fluxo mais de uma vez), `wkz-seller.js` lia a
lista com `.slice().reverse()` (mais **antigo** primeiro) enquanto
`wkz-admin.js` lia sem `reverse()` (mais **novo** primeiro). Cada painel
"ganhava" com um registro diferente do mesmo pedido — o vendedor ficava
preso no motivo desatualizado, admin/comprador viam o motivo atual.

**Correção:** `wkzShareNewDispute()` (em `wkz-core.js`) agora impede a
duplicata na origem — reabrir uma disputa para um pedido que já tem uma
disputa não resolvida **atualiza o registro existente** em vez de criar um
segundo. Cada pedido tem no máximo 1 disputa ativa. O modal "Abrir Nova
Disputa" (comprador) também passou a **bloquear e avisar** antes de
submeter, em vez de deixar o dado ficar inconsistente silenciosamente.

## 2. A disputa "sumia" ao voltar em Meu Perfil

**Causa:** a lista de disputas do comprador (`CP_DISPUTES`) é uma variável
em memória, inicializada sempre com os 3 exemplos fixos do protótipo.
Nada relia o registro partilhado (`kzDisputas_v1`) de volta para dentro
dela — então uma disputa nova sobrevivia só enquanto a aba não recarregava
(o que acontece com frequência em navegadores mobile, que descartam abas
em segundo plano por memória).

**Correção:** nova função `wkzHydrateBuyerDisputes()`, chamada toda vez
que a secção "Meu Perfil" é aberta (`initClientProfile()`), sincroniza
`CP_DISPUTES` com o estado real gravado em `kzDisputas_v1` — incluindo
disputas abertas nesta sessão e, principalmente, o resultado já decidido
pelo admin (ver item 3).

## 3. A resolução do admin nunca chegava ao vendedor nem ao comprador

**Causa mais séria:** `admResolveDispute()` só alterava variáveis dentro
da própria aba do admin (`ADMIN_DISPUTES`) e tentava "avisar" o vendedor
e o comprador chamando funções (`wkzPropagateResolutionToSeller`,
`cpUpdateDisputeVerdict`, `wkzNotifyBuyerDisputeVerdict`) que só têm
efeito **na mesma aba/documento** onde rodam. Como comprador, vendedor e
admin são 3 páginas HTML separadas (sem back-end nesta fase), essas
chamadas eram, na prática, inofensivas no-ops fora da aba do admin. O
veredito nunca era escrito de volta no `localStorage` — nem o **próprio
admin** manteria o "resolvida" se recarregasse a página dele.

**Correção:** novas funções em `wkz-core.js`:

- `wkzUpdateSharedDispute(orderId, patch)` — grava qualquer mudança de
  estado (resposta do vendedor, veredito do admin) no MESMO registro
  partilhado, e emite `WkzBus.emit('dispute:updated', ...)`.
- `wkzFindSharedDispute(orderId)` — consulta pontual (usada para bloquear
  duplicatas e destacar disputas já respondidas).

`enviarRespostaDisputa()` (vendedor) e `admResolveDispute()` (admin) agora
chamam `wkzUpdateSharedDispute()` em vez de só mexer no DOM/memória local.
Resultado:

- O veredito **sobrevive a reload** em qualquer um dos 3 painéis.
- Se duas abas estiverem abertas ao mesmo tempo (ex.: admin resolve
  enquanto o vendedor está com "Disputas" aberto), o evento
  `dispute:updated` (via `WkzBus`/`BroadcastChannel`) atualiza a outra aba
  **na hora**, sem precisar recarregar.

## 4. Vendedor: card duplicado / nunca refletia "respondida" ou "resolvida"

**Causa:** `wkzNotifySellerNewDispute()" existia em **duas cópias
divergentes** (uma em `wkz-core.js`, outra em `wkz-admin.js` — que
prevalecia na página do Admin por carregar depois). Ambas só sabiam
**criar** um card; se um card com o mesmo `orderId` já existisse, a função
desistia em silêncio ("evita duplicar") — então o card nunca mudava de
"Responder Agora" para "Respondido" ou "Resolvida" via replay do
localStorage, só através da manipulação de DOM feita na hora (perdida em
qualquer reload).

**Correção:** as duas cópias foram substituídas por uma única função,
`wkzRenderSellerDisputeCard(d)` (em `wkz-core.js`), que faz **upsert**: cria
o card se não existir, ou atualiza o mesmo card in-place se já existir —
refletindo corretamente os 3 estados (`open` → botão "Responder Agora`,
`answered` → selo "✅ Respondido" + nota de "aguardando decisão da WeKz",
`resolved` → selo colorido com o veredito). `wkzNotifySellerNewDispute()`
continua existindo como wrapper de compatibilidade (assinatura antiga),
delegando para a nova função.

Disputas resolvidas dinamicamente (abertas pelo comprador, não só os
exemplos fixos do HTML) agora também abrem **"Ver Detalhes"**
(`openDisputeDetailModal`) ao clicar, igual às disputas de exemplo já
tinham — antes só as disputas mock do protótipo ofereciam isso.

## 5. Comprador: "Ver Produto/Detalhe" de uma disputa nova vinha incompleto

**Causa:** o objeto empurrado para `CP_DISPUTES` na criação da disputa não
incluía `productName`, `seller`, `amountEUR` nem `description` — campos
que `cpViewDisputeProduct()` usa para montar o modal. Um "Ver
Produto/Detalhe" logo após abrir a disputa mostrava produto/loja/valor em
branco até a página recarregar (e então, por causa do item 2, a disputa
inteira sumia).

**Correção:** esses 4 campos são preenchidos na criação, e voltam a ser
preenchidos consistentemente na reidratação (`wkzHydrateBuyerDisputes` /
`_wkzApplySharedDisputeToCp`), incluindo uma linha do tempo (`timeline`)
que também recebe eventos quando o vendedor responde e quando o admin
resolve — visível no próprio modal do comprador, que já suportava
renderizar linha do tempo mas nunca recebia os dados.

---

## Modelo de dados novo (`kzDisputas_v1`)

Cada disputa gravada em `localStorage` passou a ter um ciclo de vida
explícito, em vez de ser só um evento de criação:

```
{
  orderId, productName, buyerName, reason, dateStr, valor, amountEUR,
  description, seller,
  status: 'open' | 'answered' | 'resolved',
  verdict: null | 'buyer' | 'seller' | 'partial',
  verdictText: string | null,
  sellerReply: null | { position, positionLabel, text, time },
  timeline: [{ date, event }, ...],
  createdAt, updatedAt   // ISO
}
```

## Testes

- `node --check` nos 3 arquivos alterados — **passa**.
- `tools/harness-node.js`, `seller/harness-seller-test.js`,
  `admin/harness-admin-test.js`, `buyer/harness-buyer-test.js` — todos
  **passam** (nenhuma regressão nos módulos existentes).
- **Novo:** `tools/test-disputes-flow.js` — teste funcional de ponta a
  ponta que simula as 3 abas (comprador/vendedor/admin) partilhando a
  mesma `localStorage` + `BroadcastChannel`, exercitando o código real
  (não mocks) dos 3 arquivos. Cobre, na ordem: abertura da disputa →
  bloqueio de duplicata → resposta do vendedor (persistida + refletida no
  próprio card + no chat do admin) → resolução do admin (persistida +
  refletida ao vivo no vendedor, com "Ver Detalhes") → comprador
  reabrindo "Meu Perfil" numa aba nova e vendo o resultado completo
  (produto, motivo e veredito) sem nenhuma ação manual. **18/18
  asserções passam.**

## O que ficou de fora (proposital)

- `wkzCreateTrilateralDispute()` (em `wkz-admin.js`) continua existindo,
  mas é, na prática, código morto no fluxo real de 3 abas separadas (só
  seria alcançável se admin.js e o comprador rodassem na mesma página).
  Não foi removido por segurança/compatibilidade, mas não recebeu a
  mesma atenção — se algum dia for reaproveitado, deveria passar a
  chamar `wkzShareNewDispute()` como ponto único de entrada.
- Fechamento "Encerrada · acordo direto" (fora da mediação do admin) —
  os exemplos fixos do HTML continuam com esse terceiro estado, mas o
  fluxo dinâmico (comprador → vendedor → admin) só produz `resolved` via
  mediação. Não pedido pelo fundador; sinalizado caso um fluxo de
  "resolver diretamente com o vendedor, sem admin" seja desejado depois.
