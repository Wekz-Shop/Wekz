# WeKz Shop — Patch de Correções de Mascotes (v2.1)

**Data:** 2026-07-22
**Arquivos afetados:** wkz-core.js, wkz-buyer.html, wkz-legal.html, wkz-kz-illustrations.css

---

## 📋 Resumo das Correções

| # | Problema | Arquivo | Solução |
|---|----------|---------|---------|
| 1 | Favoritos — mascote não aparece | wkz-buyer.js | Verificar path da imagem |
| 2 | Notificações — mascote não aparece | wkz-core.js | Adicionar imagem no empty state |
| 3 | Segurança — mascote não aparece | wkz-legal.html | Adicionar hero-corner nas páginas |
| 4 | Sair da conta — mascote cortado/sobre texto | wkz-core.js | Corrigir dimensões do modal |
| 5 | Meu Perfil — mascote sobre texto (mobile/desktop) | wkz-buyer.html | Corrigir posicionamento |
| 6 | Loja Oficial — remover mascote | wkz-buyer.html | Remover badge loja-oficial |

---

## 1. FAVORITOS — Mascote não aparece

**Arquivo:** `wkz-buyer.js`
**Linha:** ~547

O path `assets/mascot/favorito.png` está correto, mas a imagem pode não estar sendo carregada corretamente. Verificar se o arquivo existe no repositório em `assets/mascot/favorito.png`.

**Se a imagem não existir**, criar o arquivo `assets/mascot/favorito.png` com a imagem fornecida (mascote com coração).

**Se a imagem existir mas não carregar**, o fallback já está configurado via `_wkzWishlistEmptyImgError()`.

---

## 2. NOTIFICAÇÕES — Mascote não aparece

**Arquivo:** `wkz-core.js`
**Linha:** ~2204-2205

**ANTES:**
```javascript
list.innerHTML = `<div class="wkz-inbox-empty">
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(148,163,184,0.4)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
  <p>Nenhuma notificação ainda</p></div>`;
```

**DEPOIS:**
```javascript
list.innerHTML = `<div class="wkz-inbox-empty" style="display:flex;flex-direction:column;align-items:center;padding:24px 16px;">
  <img src="assets/mascot/notificacao.png" alt="Kz com sino de notificação"
    style="max-height:100px;width:auto;margin-bottom:12px;object-fit:contain;"
    onerror="this.outerHTML='<svg width=\\'36\\' height=\\'36\\' viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'rgba(148,163,184,0.4)\\' stroke-width=\\'1.5\\' stroke-linecap=\\'round\\' stroke-linejoin=\\'round\\'><path d=\\'M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9\\'/><path d=\\'M13.73 21a2 2 0 0 1-3.46 0\\'/></svg>'">
  <p style="margin:0;color:var(--muted);font-size:13px;">Nenhuma notificação ainda</p></div>`;
```

**Verificar se a imagem existe em:** `assets/mascot/notificacao.png`
**Se não existir:** criar o arquivo com a imagem fornecida (mascote com sino).

---

## 3. SEGURANÇA — Mascote não aparece nas páginas Anti-Fraude e Privacidade

**Arquivo:** `wkz-legal.html`

### 3a. Página Anti-Fraude (linha ~636-640)

**ANTES:**
```html
<div id="page-pg-antifraude" class="page">
  <div class="inner-page-hero wcag-hero">
    <div class="inner-page-hero-inner">
      <div class="inner-breadcrumb"><span onclick="window.location.href='../buyer/wkz-buyer.html'">Home</span> › Anti-Fraude</div>
      <h1 class="inner-page-title">...
```

**DEPOIS (adicionar img após inner-page-hero-inner):**
```html
<div id="page-pg-antifraude" class="page">
  <div class="inner-page-hero wcag-hero">
    <div class="inner-page-hero-inner">
      <img class="wkz-kz-illus wkz-kz-illus-hero-corner wkz-kz-illus-fade-in" src="../shared/assets/mascot/seguranca.png"
        alt="Kz protegendo você" onerror="this.style.display='none'">
      <div class="inner-breadcrumb"><span onclick="window.location.href='../buyer/wkz-buyer.html'">Home</span> › Anti-Fraude</div>
      <h1 class="inner-page-title">...
```

### 3b. Página Privacidade (linha ~589-593)

**ANTES:**
```html
<div id="page-pg-privacy" class="page">
  <div class="inner-page-hero wcag-hero">
    <div class="inner-page-hero-inner">
      <div class="inner-breadcrumb"><span onclick="window.location.href='../buyer/wkz-buyer.html'">Home</span> › Privacidade & LGPD</div>
      <h1 class="inner-page-title">...
```

**DEPOIS (adicionar img após inner-page-hero-inner):**
```html
<div id="page-pg-privacy" class="page">
  <div class="inner-page-hero wcag-hero">
    <div class="inner-page-hero-inner">
      <img class="wkz-kz-illus wkz-kz-illus-hero-corner wkz-kz-illus-fade-in" src="../shared/assets/mascot/seguranca.png"
        alt="Kz protegendo sua privacidade" onerror="this.style.display='none'">
      <div class="inner-breadcrumb"><span onclick="window.location.href='../buyer/wkz-buyer.html'">Home</span> › Privacidade & LGPD</div>
      <h1 class="inner-page-title">...
```

**Verificar se a imagem existe em:** `../shared/assets/mascot/seguranca.png` (ou `assets/mascot/seguranca.png` dependendo da estrutura)
**Se não existir:** usar a imagem `seguranca.png` fornecida.

---

## 4. SAIR DA CONTA — Mascote cortado e sobre o texto

**Arquivo:** `wkz-core.js`
**Linha:** ~5216-5218

**ANTES:**
```javascript
var logoutIcon = '<img src="../shared/assets/mascot/ate-logo.png" alt="Kz acenando um até logo" '
  + 'style="width:104px;height:104px;object-fit:cover;border-radius:24px;box-shadow:0 8px 20px rgba(0,0,0,0.35);" '
  + 'onerror="_wkzLogoutIconError(this)">';
```

**DEPOIS:**
```javascript
var logoutIcon = '<img src="../shared/assets/mascot/ate-logo.png" alt="Kz acenando um até logo" '
  + 'style="width:80px;height:80px;object-fit:contain;border-radius:20px;box-shadow:0 8px 20px rgba(0,0,0,0.35);display:block;margin:0 auto 8px;" '
  + 'onerror="_wkzLogoutIconError(this)">';
```

**Mudanças:**
- `width: 104px` → `80px` (menor, não corta)
- `height: 104px` → `80px` (proporcional)
- `object-fit: cover` → `contain` (não corta a imagem)
- Adicionado `display:block;margin:0 auto 8px;` (centraliza e espaça do título)

---

## 5. MEU PERFIL — Mascote sobre texto (mobile) e atrás dos botões (desktop)

**Arquivo:** `wkz-buyer.html`
**Linha:** ~3549-3551

**ANTES:**
```html
<img class="wkz-kz-illus wkz-kz-illus-fade-in" src="assets/mascot/meu-perfil.png" alt="Kz no seu perfil"
  style="position:absolute;right:8px;top:8px;max-height:120px;width:auto;opacity:0.9;z-index:0;pointer-events:none;"
  onerror="this.style.display='none'">
```

**DEPOIS:**
```html
<img class="wkz-kz-illus wkz-kz-illus-fade-in wkz-kz-illus-profile" src="assets/mascot/meu-perfil.png" alt="Kz no seu perfil"
  onerror="this.style.display='none'">
```

**Explicação:** O estilo agora viene do CSS (`wkz-kz-illus-profile`), que:
- **Desktop:** posiciona no canto direito, sem sobrepor botões (`z-index: 1` abaixo dos botões)
- **Mobile:** posiciona relativo, centralizado, acima do conteúdo, sem sobrepor nada

---

## 6. LOJA OFICIAL — Remover mascote

**Arquivo:** `wkz-buyer.html`
**Linha:** ~3383

**ANTES:**
```html
<span class="wkz-kz-illus-badge" title="Loja Oficial WeKz"><img src="assets/mascot/loja-oficial.png" alt="Selo Loja Oficial" onerror="this.parentElement.style.display='none'"></span>
```

**DEPOIS:**
```html
<!-- [REMOVIDO] Badge loja-oficial solicitado pelo usuário -->
```

**Simplesmente comentar ou remover a linha inteira.**

---

## 📁 Imagens Necessárias

Verificar se estas imagens existem em `assets/mascot/`:

| Imagem | Uso | Status |
|--------|-----|--------|
| `favorito.png` | Favoritos (empty state) | Verificar se existe |
| `notificacao.png` | Notificações (empty state) | Verificar se existe |
| `seguranca.png` | Páginas Anti-Fraude/Privacidade | **Fornecida pelo usuário** |
| `ate-logo.png` | Modal Sair da conta | Já existe (verificar path) |
| `meu-perfil.png` | Página Meu Perfil | Já existe (verificar path) |
| `loja-oficial.png` | Badge Loja Oficial | **Removido** |

---

## 🔧 Instruções de Aplicação

1. **Fazer backup** dos arquivos originais
2. Aplicar cada patch na linha indicada
3. Verificar se todas as imagens necessárias existem em `assets/mascot/`
4. Testar em mobile e desktop
5. Fazer commit e push para o GitHub Pages

---

## 🧪 Checklist de Teste

- [ ] Favoritos: mascote aparece no estado vazio
- [ ] Notificações: mascote aparece no dropdown vazio
- [ ] Anti-Fraude: mascote aparece no hero corner (desktop)
- [ ] Privacidade: mascote aparece no hero corner (desktop)
- [ ] Sair da conta: mascote não cortado, não sobre texto
- [ ] Meu Perfil (mobile): mascote acima do conteúdo, sem sobrepor
- [ ] Meu Perfil (desktop): mascote no canto, atrás dos botões
- [ ] Loja Oficial: badge removido
