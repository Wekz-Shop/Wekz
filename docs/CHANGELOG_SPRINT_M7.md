# Sprint M7 — Guia de Níveis Kz: cards completos (Meu Perfil)

Arquivos alterados: `wkz-core.js`, `wkz-buyer.js`, `wkz-styles-full.css`.
Arquivos novos: `shared/assets/levels/card-bronze.png`, `card-silver.png`,
`card-gold.png`, `card-cyber.png`, `card-neon-cyber.png`.
`wkz-buyer.html` **não precisou de alteração** — o container
`#cpLevelGuideBody` já existia e continua sendo preenchido via JS.
Todas as edições foram validadas com `node --check` (sintaxe JS), checagem
de balanceamento de chaves no CSS, e testes visuais automatizados
(Playwright) em desktop (900px), mobile (375px) e temas claro/escuro,
cobrindo os 5 estados de nível (Bronze → Neon Cyber, incluindo nível
máximo atingido).

---

## 1. Trilha de badges pequenos/recortados → cards completos ilustrados

**Antes:** `renderLevelGuideSection()` desenhava cada nível como uma linha
de texto com um ícone genérico (`CP_ICO.award`/`cyclone`/`zap`) — nenhuma
ligação visual com a arte de marca (mascote Kz) usada no resto do app.

**Fix:** cada nível agora renderiza o **card ilustrado completo**
(`card-bronze.png` … `card-neon-cyber.png`, arte fornecida em
`Estética Visual - Níveis Kz.pdf` / referências `card-*.png`), sem cortes —
a imagem ocupa 100% da largura do cartão, altura automática, preservando a
proporção original (~1024×1536). Nenhuma parte da arte é recortada; apenas
selos de estado são sobrepostos via CSS puro:

- **Nível atual** — relevo (`scale(1.07)`), brilho na cor própria do nível
  (`box-shadow` usando `lvl.color`) e selo flutuante "⚡ Você está aqui",
  no mesmo estilo do mockup de referência (`Referência.jpg`).
- **Níveis já alcançados** — cor cheia + selo de check verde.
- **Níveis ainda bloqueados** — dessaturados (`grayscale` + `brightness`
  reduzido) com selo de cadeado, para comunicar progressão.

A trilha (`.cp-lvlcard-track`) é um carrossel horizontal com scroll-snap;
ao abrir o Guia, a página já rola automaticamente até o card do nível
atual (`scrollIntoView`-like via `scrollTo` centralizado), sem depender do
usuário arrastar para se localizar entre os 5 níveis.

**Fallback:** se a imagem de um card não carregar (ex.: caminho do asset
ainda não publicado), o card exibe um placeholder com o nome do nível na
cor correspondente, em vez de um ícone de imagem quebrada.

## 2. Bônus da categoria + progresso — de empilhados para lado a lado

**Antes:** os cards "2x pontos em [categoria]" e "Faltam X pts" ocupavam
cada um 100% da largura, empilhados, mesmo havendo espaço de sobra em
telas largas — divergindo do mockup de referência.

**Fix:** novo `.cp-lvlgoal-grid` (flexbox responsivo, `flex-wrap`) — os
dois cards dividem o espaço 50/50 quando há largura suficiente (≥ ~560px
de conteúdo) e empilham automaticamente em telas estreitas, sem precisar
de media query dedicada.

## 3. Dados: `WKZ_REWARDS.levels` ganhou o campo `img`

Cada nível em `wkz-buyer.js` agora aponta para a arte do seu card:
```
img: '../shared/assets/levels/card-bronze.png'
```
Caminho segue a mesma convenção já usada por
`../shared/assets/mascot/*.png` no restante do app. Nenhum outro módulo
(admin, seller, harnesses de teste) referenciava `WKZ_REWARDS`, então a
adição do campo é 100% retrocompatível.

## 4. Onde colocar os assets no repositório

Copie a pasta `shared/assets/levels/` (5 arquivos `.png`, ~1,5 MB no
total) para o mesmo nível de `shared/assets/mascot/` no seu repo. Sem
esse passo, os cards caem no fallback do item 1 (nome do nível colorido)
em vez de mostrar a arte.

**Nota de performance:** os 5 PNGs somam ~1,5 MB. Para produção, vale
comprimir (ex. `pngquant` ou re-exportar em WebP) antes do deploy — não é
bloqueante para a fase atual de front-end, mas fica registrado.
