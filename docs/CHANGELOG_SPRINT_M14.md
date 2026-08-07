# Sprint M14 — Emojis nativos → Ícones SVG (Painel do Admin)

Arquivos alterados: `wkz-core.js`, `wkz-admin.js`, `wkz-admin.html`, `wkz-form-select.js`.

## Contexto

Terceira etapa da troca de emojis por SVG (depois de Meu Perfil e Painel do
Vendedor, sprints M13). Escopo: Painel do Administrador.

## O que era diferente aqui

O Admin já tinha uma peça de infraestrutura que o Vendedor não tinha:
`admGetIconSVG(key)`, uma função que converte uma emoji-chave em SVG — usada em
2 lugares (histórico de Comunicados e Log de Auditoria). Isso significa que boa
parte dos "emojis" que a auditoria automática encontrava em `wkz-admin.js` eram,
na verdade, **chaves de dado já convertidas para SVG no momento de exibir** (ex.:
`admAuditAdd('🔒', 'IP bloqueado...', 'Admin WeKz')` grava `'🔒'` só como
identificador — quem aparece na tela é sempre o resultado de
`admGetIconSVG('🔒')`, nunca o emoji cru).

Por isso, a auditoria desta etapa teve uma camada a mais: distinguir emoji que é
**exibido diretamente** (precisa virar SVG) de emoji que é **só uma chave interna**
(já seguro, não precisa mexer). Contagem bruta: 248 ocorrências. Depois de excluir
chaves de dado já seguras e avatares de loja/produto mockados (mesmo critério das
etapas anteriores — conteúdo, não decoração): **150 ocorrências reais** (134 em
`wkz-admin.js` + 9 em `wkz-admin.html`, mais 7 corrigidos à parte, ver abaixo).

## Um caso real que a auditoria pegou

Nem tudo que parecia "chave segura" era: `KZ_RADAR_ALERTS` e `COPILOT_VERDICTS`
(a base de conhecimento do parecer de disputas do Kz) também guardam um campo
`icon`, mas — diferente do Log de Auditoria — esses são renderizados **direto**
(`${alert.icon}`, `${vd.icon}`), sem passar por `admGetIconSVG`. Ou seja: pareciam
seguros pelo mesmo padrão visual (`icon: 'X'`), mas na prática apareciam como
emoji cru na tela. Corrigido trocando o valor do campo diretamente por uma
referência a `WKZ_ICO` (9 ocorrências: Radar de Riscos e os 6 pareceres do Kz
Dispute Copilot).

Também achei o mesmo problema no **modal de confirmação genérico**
(`window._wkzConfirm`, em `wkz-core.js`) — usado em Meu Perfil, Config e Saques.
Os 3 ícones padrão por variante (`danger`/`warning`/`info`) eram emoji cru
(🚪⚠️ℹ️), e 2 chamadas no Admin (confirmar envio de comunicado, confirmar
antecipação de saque) também passavam emoji explícito. Como este modal é
compartilhado pelo site inteiro, a correção aqui beneficia todo mundo que já usa
`_wkzConfirm`, não só o Admin.

## Extensão da biblioteca de ícones

`window.WKZ_ICO` (criada na Sprint M13 para o Vendedor) ganhou 8 ícones novos:
`lock`, `user`, `mail`, `ship`, `paperclip`, `idcard`, `image`, `undo` — agora
com 82 ícones ao todo, reutilizável por qualquer painel.

## Limpeza extra: resíduos de seletor de variação (FE0F)

Ao remover um emoji como `⚖️` (que na verdade são 2 caracteres: `⚖` + um
modificador invisível que pede "mostra colorido"), a substituição automática das
3 sprints de emoji deixava o modificador órfão para trás — invisível, sem efeito
visual, mas sujo no código-fonte. Rodei uma limpeza em **todos** os arquivos já
tocados (M13 + M14): **378 caracteres órfãos removidos** em `wkz-admin.js`,
`wkz-admin.html`, `wkz-seller.js`, `wkz-seller.html`, `wkz-buyer.html`,
`wkz-buyer.js` e `wkz-core.js`, preservando os casos onde o modificador ainda
está emparelhado com um símbolo tipográfico mantido de propósito (ex.: ↕️).

## O que ficou de fora (mesmo critério das etapas anteriores)

- **3 `<option>` de idioma/simulação** (`wkz-admin.html`) — `<option>` não
  renderiza HTML/SVG de forma confiável; mantidos como emoji.
- **Avatares mockados de loja e produto** (🛋️📱🏭 etc., em `ADMIN_STORES` e
  `FRAUD_REPORTS`) — mesmo critério de Meu Perfil/Vendedor: representam qual
  produto/loja, é conteúdo, não decoração.
- 🐱 (mascote "Lince Cibernético" do chat) — já tem fallback consciente para
  SVG (`getKzSVG`), o emoji cru só aparece como salvaguarda se essa função não
  estiver disponível; mantido como está.

## Testes

- `node --check` em todos os arquivos alterados — passa.
- Suíte de regressão completa (todos os harnesses + `test-disputes-flow.js` 18/18
  + `test-broadcast-flow.js` 8/8 + `test-form-select-icons.js` 8/8) — sem
  regressão, incluindo depois da limpeza de FE0F.
- Scan automático final: 0 emojis reais restantes em `wkz-admin.html` e
  `wkz-admin.js`, fora das exceções documentadas.

## Status geral da troca de emojis (3 etapas)

| Área | Status |
|---|---|
| Meu Perfil (comprador) | ✅ Concluído — Sprint M13 |
| Painel do Vendedor | ✅ Concluído — Sprint M13 |
| Painel do Admin | ✅ Concluído — Sprint M14 |
| Resto do site do comprador (home, catálogo, carrinho, checkout) | Pendente — `WKZ_ICO` já pronta para reaproveitar |
