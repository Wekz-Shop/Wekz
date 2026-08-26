# Sprint M19 — Persistência Real do "Meu Perfil" (FIX-CADASTRO-04)

Arquivos alterados: `core/wkz-core.js`, `buyer/wkz-buyer.js`.
Sem arquivos removidos do projeto. Nenhum arquivo de back-end tocado (fase de front-end estrito, conforme diretriz do projeto).

## Pedido do usuário

A partir de 2 screenshots do "Meu Perfil" (mobile), reportado que toda
conta nova criada após logout continuava a mostrar Kz Copilot, Rastreador
de Encomendas, Histórico de Compras, Nível Kz, Avaliação Pendente, Central
de Disputas e Carteira Multimoedas da conta anterior ("Alexandre"), em vez
de nascer zerada — com pedido explícito de diagnóstico (falta de back-end
vs. bug de front-end) e correção baseada no padrão de grandes marketplaces
(AliExpress, Shopee, Mercado Livre, Amazon).

## Diagnóstico

Não é ausência de back-end — é uma lacuna de persistência no front-end.
O app já tinha DUAS camadas de estado de conta, mas só uma era gravada em
`localStorage`:

1. **Identidade** (nome, e-mail, telefone, CPF, CEP, "membro desde") —
   já persistida desde o FIX-CADASTRO-01/03 via a chave
   `wkz_registered_profile`, sobrevive a reload.
2. **Atividade** (pedidos, compras, disputas, cartões, pontos/nível,
   indicações, micro-histórico) — `CP_ORDERS`, `CP_PURCHASE_HISTORY`,
   `CP_DISPUTES`, `CP_CARDS`, `CP_SAVED_EUR`, `CP_HISTORY`, `userPoints`,
   `WKZ_REFERRAL_STATE`, `WKZ_USER_INTERESTS` — **nunca eram gravados em
   lugar nenhum**. O reset já existente (`wkzResetProfileForNewAccount`,
   FIX-CADASTRO-03) funcionava perfeitamente *dentro da mesma sessão* (SPA,
   sem reload), mas qualquer recarregamento de página (F5, nova aba,
   reabrir o site depois) fazia essas variáveis voltarem aos valores fixos
   da persona de demonstração "Alexandre" hardcoded no topo do módulo —
   os mesmos, exibidos por cima de qualquer conta, independentemente de
   quem tivesse se registado.

Confirmado batendo os números dos screenshots com o código-fonte: os IDs
de disputa `#WKZ-8801`/`#WKZ-8777`/`#WKZ-8720`, os "8.340 pts"
(`userPoints.lifetime`) e o "R$ 242,86 economizado" (`CP_SAVED_EUR = 42.50`
convertido) são exatamente os valores hardcoded — não dados vazando de uma
conta real anterior.

Bug irmão encontrado no mesmo diagnóstico: a saudação do Kz Copilot
("Olá, Alexandre!") tinha o nome literalmente fixo no código
(`cpBuildLevelInsight()` fazia `.replace('{NAME}', 'Alexandre')`),
ignorando por completo o nome da conta logada.

## Correção

**Nova camada de persistência de atividade**, no mesmo padrão já usado
para identidade — chave própria `wkz_account_activity` no `localStorage`:

- `window.wkzSaveActivityState()` — serializa `CP_ORDERS`,
  `CP_PURCHASE_HISTORY`, `CP_DISPUTES`, `CP_CARDS`, `CP_SAVED_EUR`,
  `CP_HISTORY` (sem as closures de `action`, reconstruídas como no-op ao
  restaurar), `userPoints`, `WKZ_REFERRAL_STATE` e `WKZ_USER_INTERESTS`.
- `window.wkzRestoreActivityState()` — lê o snapshot e substitui os
  valores fixos de demo pelos dados reais da conta antes de qualquer
  render. Sem snapshot (visita nunca registada), mantém o comportamento
  de demo inalterado.
- `window.wkzClearActivityState()` — remove o snapshot (chamada no
  logout).

**Pontos de gravação:** em vez de instrumentar individualmente cada local
que cria um pedido/disputa/cartão, o save foi conectado às funções de
render já centrais (`renderOrders`, `cpSyncOrdersHeroCount`,
`cpSyncLevelDisplay`, `cpPushHistoryItem`, `wkzHydrateBuyerDisputes`) e aos
poucos pontos de mutação que não passam por elas (`cpRegisterNewPurchase`,
criação de disputa, adicionar cartão) — como todo fluxo existente já
chama uma dessas funções logo após alterar os arrays, a cobertura é
praticamente total sem duplicar lógica de mutação.

**Restauração automática:** hook em `DOMContentLoaded` no fim de
`wkz-core.js`, que dispara só depois de `wkz-buyer.js` (carregado depois)
já ter declarado `userPoints`/`WKZ_USER_INTERESTS` — evita erro de
referência e garante que a conta certa aparece já no primeiro paint.

**Ordem de reset corrigida** em `cpLogout()` e `_wkzResetForNewRegistration()`:
`userPoints`/`WKZ_REFERRAL_STATE`/`WKZ_USER_INTERESTS` agora são zerados
*antes* de `wkzResetProfileForNewAccount()`, para que o snapshot vazio
gravado por esta última já saia correto, sem precisar de um segundo save
para sobrescrever valores stale.

**Nome real no Kz Copilot:** nova `_cpDisplayFirstName()` lê o primeiro
nome de `#cpUserName` (mesma fonte já sincronizada por
`wkzSyncProfileDisplay`) em vez do literal `'Alexandre'`.

## Implementação por arquivo

### `core/wkz-core.js`
- Novo bloco `[FIX-CADASTRO-04]` após `wkzResetProfileForNewAccount()`:
  `wkzSaveActivityState`, `wkzRestoreActivityState`, `wkzClearActivityState`.
- `renderOrders()`, `cpSyncLevelDisplay()`, `cpPushHistoryItem()`,
  `cpRegisterNewPurchase()`, criação de disputa, `wkzHydrateBuyerDisputes()`,
  adicionar cartão: cada um ganhou uma chamada a `wkzSaveActivityState()`
  logo após a mutação correspondente.
- `cpLogout()`: reordenado (pontos/indicações zerados antes do reset de
  perfil) + chamada a `wkzClearActivityState()` como reforço.
- `cpBuildLevelInsight()`: nova `_cpDisplayFirstName()`, substitui o
  `'Alexandre'` hardcoded nos dois templates de insight.
- Novo hook `DOMContentLoaded` no fim do arquivo, chamando
  `wkzRestoreActivityState()`.

### `buyer/wkz-buyer.js`
- `_wkzResetForNewRegistration()`: mesma reordenação de `cpLogout()`
  (pontos/indicações zerados antes de `wkzResetProfileForNewAccount()`).

## Limitações conhecidas / próximos passos sugeridos

- Este fix resolve especificamente o cenário reportado: **conta nova
  nasce zerada e permanece zerada entre reloads**, e ações feitas durante
  o uso normal (nova compra, nova disputa, novo cartão) agora sobrevivem a
  F5 também. Ainda é um "backend simulado" via `localStorage` no mesmo
  navegador — não uma conta real na nuvem: limpar o site data do navegador
  ou trocar de dispositivo continua reiniciando tudo. Isso só muda com um
  back-end real (fora do escopo desta fase, conforme diretriz do projeto).
- `kzDisputas_v1` (registo partilhado comprador/vendedor/admin) continua
  sendo global por navegador, não por conta — já é limpo no logout
  (`SEC-02`), o que mitiga o caso mais óbvio, mas vale revisitar quando o
  projeto tiver múltiplas contas persistidas simultaneamente (ex.: trocar
  de conta sem logout explícito).

---

## Adenda — FIX-ENDERECO-01 (mesma sprint, achado após reporte de bug)

**Pedido do usuário:** screenshot da página "Meu Carrinho" mostrando o
nome "João da Silva" na barra de fidelidade (pontos/nível), divergente da
conta logada ("Wekz", visível no dropdown do cabeçalho ao lado). Pedido
para corrigir e auditar por bugs semelhantes.

**Diagnóstico:** mesma classe de bug do FIX-CADASTRO-04 acima (nome
escrito directamente no código, nunca lido da conta real), mas em módulos
diferentes — o `.clb-name` da barra de fidelidade do carrinho
(`renderCartLoyaltyBar()`) tinha `'João da Silva'` fixo, enquanto
pontos/nível ao lado já eram corretamente dinâmicos. Auditoria encontrou
mais 3 ocorrências do mesmo padrão, todas no fluxo de checkout:
`_SAVED_ADDRS[1]`/`[2]` (endereços "Casa"/"Trabalho" salvos), o endereço
de retirada gerado ao escolher um ponto de coleta (`_SAVED_ADDRS[99]`), e
os cartões visuais estáticos "Endereços salvos" (`#addrCard1`/
`#addrCard2`) no HTML do checkout, que nunca eram regenerados por JS.

**Correção:** nova função única `window.wkzGetDisplayName()` em
`wkz-core.js` (contraparte de leitura de `wkzSyncProfileDisplay`, que já
existia só para gravação) — lê o nome da conta do `localStorage`
(`wkz_registered_profile`), com fallback para o cabeçalho sincronizado e,
por fim, para a persona de demonstração. Os 4 pontos identificados
(barra de fidelidade do carrinho, os 2 endereços salvos, o endereço de
retirada e os cartões estáticos do checkout) passaram a usar essa mesma
fonte. `_cpDisplayFirstName()` (Kz Copilot, do fix acima) foi também
simplificada para reaproveitá-la, eliminando a duplicação de lógica de
leitura de nome. `openCheckout()` agora sincroniza os cartões visuais de
endereço a cada abertura do checkout, cobrindo também troca de conta na
mesma sessão sem reload.

Arquivos: `core/wkz-core.js`, `buyer/wkz-buyer.js`. Diff cirúrgico
(~57 e ~70 linhas respectivamente, sobre a versão já entregue acima).
Sintaxe validada com `node -c` nos dois arquivos.

**Fora do escopo desta correção:** `wkz-seller.js` tem uma ocorrência
semelhante (`nome: 'João da Silva Santos'`, persona de loja) — é uma
página/conta completamente separada (vendedor), com seu próprio sistema
de perfil ainda não auditado; não foi tocada aqui. O placeholder
"Ex: João da Silva Santos" no formulário de denúncia (`wkz-core.js`) é só
texto de exemplo dentro de um campo de input, nunca exibido como dado
real — não é um bug.
