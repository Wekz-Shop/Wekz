# Sprint M21 — Compliance: arrependimento CDC e responsabilidade solidária

Arquivos alterados: `buyer/wkz-buyer.html`, `buyer/wkz-buyer.js`, `legal/wkz-legal.html`.
Nenhum arquivo de back-end tocado (fase de front-end estrito).

## Correção de rota em relação à auditoria anterior

Na auditoria multidisciplinar eu tinha afirmado: *"não localizei uma
política explícita de 7 dias de arrependimento em compra online destacada
na PDP/checkout"*. **Essa afirmação estava errada.** Ao investigar a fundo
para esta sprint, encontrei uma cláusula 7 completa nos Termos de Uso
("Devolução e Direito de Arrependimento", já implementada na sprint
JUR-01 anterior a este histórico), FAQ dedicado, e badges de política em
pelo menos 5 pontos diferentes do site. O erro foi meu, de varredura
superficial na auditoria — fica registrado aqui por transparência.

O achado **real e mais valioso** desta sprint acabou sendo outro: o site
tinha **três números diferentes** para a mesma política (7, 15 e 30 dias)
espalhados por Home, PDP e Checkout, todos contradizendo a própria
explicação detalhada e correta que já existia na página de Devoluções
(`#sec-devolucao`) e nos Termos (t7). Isso é mais grave do que "faltar"
uma informação — é uma **inconsistência que pode configurar publicidade
enganosa (CDC art. 37)**, além de ser um problema de confiança/UX (usuário
vê números diferentes andando pelo site).

## 1. Padronização das claims de devolução (FIX-JUR-02)

Política de referência (já correta e mais detalhada, mantida como fonte
única): **7 dias corridos, sem necessidade de justificativa** (CDC art.
49) **+ até 30 dias** para casos de defeito/produto diferente do anunciado
(extensão comercial voluntária da WeKz, não CDC-obrigatória). Frete de
retorno é por conta do comprador no arrependimento simples (7 dias) e por
conta da WeKz nos casos de defeito/divergência — essa distinção também
estava sendo perdida nas claims "grátis" genéricas.

| Local | Antes | Depois |
|---|---|---|
| Home — trust bar | "30 dias sem perguntas" | "7 dias sem justificativa" |
| PDP — box de proteção (perto do botão de compra) | "Devolução gratuita dentro de 15 dias" | "7 dias de arrependimento + até 30 dias em caso de defeito" |
| Checkout — badges de confiança (perto do botão de finalizar) | "Devolução grátis em 30 dias" | "7 dias de arrependimento" |

A claim da Home também existia **traduzida nas 7 línguas** suportadas
(`trustReturnSub` em `TRANSLATIONS`, `wkz-buyer.js`) — como é lida
dinamicamente por `updateLang()` e sobrescreve o HTML estático no
carregamento, uma correção só no HTML teria sido silenciosamente desfeita
pelo JS. Corrigidas as 7: pt, en, es, zh, fr, de, ja — todas trocando
"30 dias/days/días/天/jours/Tage/日間" por "7", mantendo a estrutura de
cada idioma. As outras duas edições (PDP e checkout) não são
i18n-controladas, então a edição direta no HTML é suficiente.

## 2. Cláusula 5 (Limitação de Responsabilidade) — minuta de responsabilidade solidária (FIX-JUR-03)

**Isto NÃO foi publicado como texto final — é uma minuta.** A cláusula 5
original limitava a responsabilidade da WeKz de forma ampla ("não se
responsabiliza por... qualidade, segurança dos produtos anunciados por
terceiros"). A jurisprudência do STJ reconhece responsabilidade solidária
de marketplaces em hipóteses específicas — falha de segurança da própria
plataforma, recusa em identificar o vendedor, erro operacional próprio —
mesmo quando o defeito do produto em si é responsabilidade exclusiva do
vendedor terceiro.

Adicionei um novo parágrafo 5.2 reconhecendo essas hipóteses, sem alterar
a lógica geral da cláusula 5.1 (que continua correta para o caso comum:
vendedor terceiro responde por vício do próprio produto). O trecho está
marcado no código com um comentário `[FIX-JUR-03 — MINUTA PENDENTE DE
REVISÃO JURÍDICA HUMANA]`, bem visível para quem for editar o arquivo
depois. Versão dos Termos incrementada para 3.4 com data de hoje, seguindo
a convenção do próprio projeto (`Versão 3.3 — JUR-01` → `Versão 3.4 —
JUR-03`).

**Isto não substitui a revisão de um advogado antes do lançamento —
como eu mesmo já tinha sinalizado na auditoria.** O que fiz foi deixar o
texto mais próximo do que a legislação/jurisprudência brasileira
realmente prevê, para que a revisão jurídica parta de uma base melhor, não
para fechar o assunto sozinho.

## Testes / Verificações

- **`harness-buyer-test.js`** (oficial) rodado contra `wkz-buyer.js` novo:
  **100% passou**, incluindo os 6 checks de regressão i18n — confirmando
  que as 7 traduções de `trustReturnSub` continuam com exatamente as
  mesmas chaves que o pt (nenhuma removida/adicionada por engano).
- **`node --check`** em `buyer/wkz-buyer.js`: sintaticamente válido.
- **Balanceamento de tags** (`<div>`, `<p>`, `<h3>`) verificado em
  `wkz-buyer.html` e `wkz-legal.html` antes/depois das edições — nenhuma
  tag aberta ou fechada indevidamente pelas minhas alterações (só texto e
  comentários HTML foram tocados, nenhuma tag estrutural nova).
- **Varredura final** confirmando que nenhuma das claims antigas ("15
  dias", "30 dias sem perguntas", "grátis em 30 dias") sobrou em nenhum
  arquivo, fora dos meus próprios comentários explicativos.

## O que ficou de fora (fora do escopo deste pedido)

- Selo de arrependimento como pop-up/interstitial no fluxo de checkout —
  avaliei que não é necessário: a informação já é visível perto dos
  botões de compra (PDP) e de finalização (checkout), só precisava ficar
  precisa, que era o problema real.
- Demais itens da auditoria (gatilhos de conversão, segurança/onclick
  inline) — não pedidos nesta sprint.
- CNPJ da WeKz nos Termos continua como placeholder
  (`[a preencher antes do lançamento]`) — não é algo que eu deva inventar.

## Lembrete de processo

Arquivos entregues como download (sem acesso de escrita ao GitHub do
usuário nem ao projeto Claude). Substituir `buyer/wkz-buyer.html`,
`buyer/wkz-buyer.js` e `legal/wkz-legal.html` no repositório antes do
próximo deploy. **A cláusula 5.2 precisa passar por advogado antes de ir
para produção** — isso não é opcional, é o único item desta sprint que
carrega risco jurídico real se publicado sem revisão.
