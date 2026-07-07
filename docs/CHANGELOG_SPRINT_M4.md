# Sprint M4 — Admin Matrix — Changelog

**Saída:** `admin/wkz-admin.html` + `admin/wkz-admin.js`

## ⚠️ Contexto importante: primeira tentativa descartada

A primeira versão do Sprint M4 (produzida em outra conversa) foi **rejeitada por completo antes de qualquer push**. Não era extração do monólito — era código reescrito do zero, com os mesmos nomes de função mas lógica, dados e campos totalmente diferentes. Evidência (comparação linha a linha contra o monólito real):

| | Monólito REAL | Arquivo descartado |
|---|---|---|
| `syncOverviewKPIs` | parâmetro `flash`, usa `d.severity`, atualiza `kpiDisputasAtivas`/`kpiVolumeRetido` | parâmetro `adminSide`, usa `d.status`, só emite evento WkzBus |
| `ADMIN_DISPUTES` | vendedores reais ("TechNova Store", "GadgetDiscount BR"), com análise automática da Kz IA embutida no chat | nomes inventados ("João Silva"), sem a feature de IA |
| `validateCNPJ` | já existia, corretamente extraída em `wkz-seller.js` no M3 | reimplementada do zero, duplicando lógica |

Nenhum arquivo dessa tentativa foi commitado. Esta versão foi refeita inteiramente do zero, seguindo o mesmo processo cirúrgico de M1–M3.

## ✅ O que foi extraído (8 sub-etapas, todas com origem de linha citada)

- 4.1 Navegação Admin + Aprovação de Lojas — 38723–38938
- 4.2 Revisão de KYC + Denúncias/Moderação — 38939–39295
- 4.3 Banner Kz + Nav Hook (adm-mode) — 39296–39363 + 39421–39432
- 4.4 Broadcast + Segurança/Fraude + Configurações — 39436–39975
- 4.5 Kz IA Admin Copilot — 39976–40165
- 4.6 Disputas + Saques + Patches de Integração — 40166–40859
- 4.7 Sistema de Disputa Trilateral (cross-module, adiado do M2/M3) — 33061–33341
- 4.8 Kz Dispute Copilot (achado durante auditoria de `onclick`, IIFE separado) — 41610–41771

**HTML:** `page-admin-dashboard` (linhas 17032–18043, 422 divs balanceados).

## 🔒 Patch de Segurança aplicado (BUG-ADM01)

O backdoor `_wkzDevAdminActivate()` (acesso não autenticado via hash `#wkz-dev-admin` ou 5 toques rápidos no rodapé, linhas 39364–39420) foi **deliberadamente excluído**. Isso não é só recomendação minha — o próprio monólito já documentava isso: *"Para produção: remover este bloco inteiro e integrar /api/auth/admin."* O nav hook legítimo logo depois (`wkzAdminPageHook`, só alterna a classe CSS `adm-mode`) foi mantido.

`window.currentAdminUser` (placeholder `{nome:'Admin WeKz', role:'superadmin'}`) foi mantido — o próprio monólito já comenta que é "preenchido após autenticação real", ou seja, não é o backdoor, é um mock de estado pendente de integração de backend.

## 🔧 Bugs reais encontrados e corrigidos durante a extração

1. **`FRAUD_REPORTS` duplicado.** Já havia sido movido para `core/wkz-core.js` numa sessão anterior (decisão correta: é compartilhado entre o formulário de fraude do Legal e a revisão do Admin). Minha extração inicial redeclarava o mesmo array — removido, o Admin agora só consome o array do core.

2. **`formatLogTime()` ausente — crash real no painel de Fraude.** `renderFraudReports()` chama `formatLogTime()` sem guard, mas essa função só existia em `wkz-buyer.js` — arquivo diferente do Admin, geraria `ReferenceError` ao abrir o painel de Segurança. Movida para o core (compartilhada), cópia idêntica mantida em `wkz-buyer.js` (mesmo padrão já usado com `FAQ_THEMES_DATA`).

3. **`activateKzDisputeCopilot` não fazia parte de nenhuma sub-etapa planejada.** Encontrada durante a auditoria de todo `onclick` do HTML contra as funções extraídas — é um IIFE separado no monólito (`COPILOT_VERDICTS`, base de conhecimento com % de confiança e referências ao CDC para cada motivo de disputa). Adicionada como sub-etapa 4.8.

## 🧩 Achado de arquitetura: sincronização cross-module das disputas trilaterais

As 6 funções do sistema de disputa trilateral (`wkzNotifySellerNewDispute`, `wkzCreateTrilateralDispute`, etc.) foram escritas no monólito assumindo que Buyer, Seller e Admin **compartilham o mesmo DOM** — uma disputa aberta pelo comprador atualiza instantaneamente o painel do vendedor E do admin, porque tudo vivia na mesma página.

Agora que os 3 são arquivos separados, isso tem uma limitação real: `wkzNotifySellerNewDispute()` rodando no contexto do Admin procura `#sellerDisputesList` (que só existe em `wkz-seller.html`) — o guard (`if (!list) return;`) já existente no código original evita o crash, mas a função fica **funcionalmente inerte** se a aba do Seller não estiver aberta no mesmo navegador. Como o `WkzBus` usa `BroadcastChannel`, a sincronização funciona se Seller e Admin estiverem abertos em abas diferentes do mesmo navegador simultaneamente — mas não há persistência entre sessões sem um backend real. Isso não é um bug desta extração; é uma consequência inerente de dividir uma SPA de página única em múltiplos arquivos. Fica documentado para quando o backend (Supabase, conforme a Seção 10 do plano) entrar em cena — aí a sincronização passa a ser via banco de dados, não via DOM compartilhado.

## 🧪 Validação realizada nesta máquina

- `node --check` em todas as 8 sub-etapas + arquivo final: OK
- Harness Node (execução real via `vm`): `wkz-bus.js` + `wkz-core.js` + `wkz-admin.js` rodam de ponta a ponta sem erro
- Parser HTML nativo: zero erros estruturais, pilha balanceada
- Auditoria completa de `onclick` (HTML → função) e `getElementById` (JS → HTML): zero órfãos reais, todos os "ausentes" confirmados como criação dinâmica de modal ou guardados com `if(el)`
- Nenhuma colisão de declaração com `core`/`buyer`/`seller`
- `test-m4.html` criado (mesmo padrão dos anteriores), incluindo verificação específica de que os dados são os REAIS do monólito (nomes de loja reais), não os fabricados na tentativa descartada
- Teste real em navegador ainda pendente, fica com você.
