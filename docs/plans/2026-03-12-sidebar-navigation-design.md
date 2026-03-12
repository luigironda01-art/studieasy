# Design Document: Sidebar e Sistema di Navigazione

**Data**: 12 Marzo 2026
**Fase**: 1.1 - Fondamenta
**Priorità**: Critica

---

## Obiettivo

Creare un sistema di navigazione chiaro e consistente che permetta agli utenti di:
- Sapere sempre dove si trovano nell'app
- Accedere rapidamente a qualsiasi sezione
- Avere un'esperienza fluida su desktop e mobile

---

## Stato Attuale

### Problemi identificati
1. **Nessuna sidebar** - L'utente deve usare il browser back/forward
2. **Nessun contesto** - Non sa dove si trova nella gerarchia
3. **Header inconsistente** - Cambia tra pagine senza logica
4. **Mobile confuso** - Navigazione non ottimizzata

### Struttura pagine esistente
```
/login
/signup
/dashboard                    ← Lista fonti
/dashboard/source/[id]        ← Dettaglio fonte con capitoli
/dashboard/study              ← Sessione flashcard
/dashboard/quiz/[id]          ← Sessione quiz
```

---

## Proposta di Design

### Layout Principale

```
┌──────────────────────────────────────────────────────────────┐
│  ┌──────┐                                      🔍  👤  ⚙️   │  HEADER
│  │ LOGO │   Studio                                          │  (fisso)
├──────────┬───────────────────────────────────────────────────┤
│          │                                                   │
│  📚      │  Breadcrumb: Studia > Economia > Cap. 1          │
│  Studia  │                                                   │
│          │  ┌─────────────────────────────────────────────┐  │
│  🎯      │  │                                             │  │
│  Studio  │  │                                             │  │
│          │  │         CONTENUTO PRINCIPALE                │  │
│  📊      │  │                                             │  │
│  Stats   │  │                                             │  │
│          │  └─────────────────────────────────────────────┘  │
│  💬      │                                                   │
│  Feedback│                                                   │
│          │                                                   │
│  ─────── │                                                   │
│  ❓ Help │                                                   │
│          │                                                   │
├──────────┴───────────────────────────────────────────────────┤
│  [Mobile: Bottom Navigation quando sidebar nascosta]         │
└──────────────────────────────────────────────────────────────┘
```

### Comportamento Responsive

| Viewport | Sidebar | Header | Navigation |
|----------|---------|--------|------------|
| Desktop (>1024px) | Visibile, fissa | Compatto | Sidebar |
| Tablet (768-1024px) | Collassabile | Standard | Sidebar + Toggle |
| Mobile (<768px) | Nascosta | Standard | Bottom Nav |

---

## Componenti da Creare

### 1. AppLayout
**File**: `frontend/src/components/layout/AppLayout.tsx`

Wrapper principale per tutte le pagine autenticate.

```tsx
<AppLayout>
  <PageContent />
</AppLayout>
```

**Responsabilità**:
- Renderizza Sidebar (desktop/tablet)
- Renderizza BottomNav (mobile)
- Renderizza Header
- Gestisce stato sidebar (open/collapsed)
- Persiste preferenza utente

---

### 2. Sidebar
**File**: `frontend/src/components/layout/Sidebar.tsx`

**Elementi**:
```
┌────────────────────┐
│  ┌──────┐          │
│  │ Logo │  Studio  │  ← Logo + Nome app
│  └──────┘          │
├────────────────────┤
│                    │
│  📚 Studia         │  ← Link principale
│     └ I miei libri │  ← Sotto-sezione
│                    │
│  🎯 Sessione       │  ← Studio attivo
│     └ Flashcard    │
│     └ Quiz         │
│                    │
│  📊 Statistiche    │  ← Dashboard stats
│                    │
│  💬 Feedback       │  ← Invia feedback
│                    │
├────────────────────┤
│  ❓ Aiuto          │  ← Link help/docs
│  ⚙️ Impostazioni   │  ← Settings
└────────────────────┘
```

**Stati visuali**:
- Item attivo: background evidenziato + bordo sinistro accent
- Item hover: background leggero
- Item con sotto-menu: freccia espandibile
- Notifica badge: cerchietto colorato (es. card in scadenza)

---

### 3. Header
**File**: `frontend/src/components/layout/Header.tsx`

```
┌──────────────────────────────────────────────────────────────┐
│  [≡]  Breadcrumb: Studia > Economia > Capitolo 1    🔍 👤 ⚙️│
└──────────────────────────────────────────────────────────────┘
  │                   │                                    │
  │                   │                                    └── User menu dropdown
  │                   └── Navigazione gerarchica
  └── Toggle sidebar (tablet/mobile)
```

**Breadcrumb logic**:
- `/dashboard` → "Studia"
- `/dashboard/source/[id]` → "Studia > [Nome Fonte]"
- `/dashboard/source/[id]#cap1` → "Studia > [Nome Fonte] > [Nome Cap]"
- `/dashboard/study` → "Sessione Studio"
- `/dashboard/quiz/[id]` → "Quiz > [Nome Quiz]"

---

### 4. BottomNav (Mobile)
**File**: `frontend/src/components/layout/BottomNav.tsx`

```
┌──────────────────────────────────────────────────────────────┐
│   📚        🎯        📊        💬        👤                 │
│  Studia   Studio    Stats   Feedback   Profilo              │
└──────────────────────────────────────────────────────────────┘
```

**Comportamento**:
- Sempre visibile su mobile
- Nasconde su scroll down, riappare su scroll up
- Badge per notifiche/card in scadenza

---

### 5. UserMenu
**File**: `frontend/src/components/layout/UserMenu.tsx`

Dropdown dal click su avatar/icona utente.

```
┌─────────────────────┐
│  👤 Mario Rossi     │
│  mario@email.com    │
├─────────────────────┤
│  Profilo            │
│  Impostazioni       │
│  Tema: [🌙/☀️]      │
├─────────────────────┤
│  Esci               │
└─────────────────────┘
```

---

## Navigazione e Routing

### Struttura URL aggiornata

```
/                           → Redirect a /dashboard o /login
/login                      → Login (no layout)
/signup                     → Signup (no layout)

/dashboard                  → Lista fonti (Studia > I miei libri)
/dashboard/source/[id]      → Dettaglio fonte
/dashboard/study            → Sessione flashcard
/dashboard/quiz/[id]        → Sessione quiz

/stats                      → Dashboard statistiche (futuro)
/feedback                   → Invia feedback
/settings                   → Impostazioni utente
/help                       → Centro assistenza (futuro)
```

### Breadcrumb Data

Ogni pagina fornisce i propri dati breadcrumb:

```tsx
// Esempio in source/[id]/page.tsx
useBreadcrumb([
  { label: "Studia", href: "/dashboard" },
  { label: source.title, href: `/dashboard/source/${source.id}` }
]);
```

---

## Schema Colori e Stili

### Sidebar
```css
/* Background */
--sidebar-bg: #1e293b;           /* slate-800 */
--sidebar-border: #334155;        /* slate-700 */

/* Items */
--item-default: #94a3b8;         /* slate-400 */
--item-hover-bg: #334155;        /* slate-700 */
--item-active-bg: #3b82f6/20;    /* blue-500/20 */
--item-active-text: #3b82f6;     /* blue-500 */
--item-active-border: #3b82f6;   /* blue-500 */
```

### Header
```css
--header-bg: #0f172a;            /* slate-900 */
--header-border: #1e293b;        /* slate-800 */
--breadcrumb-text: #64748b;      /* slate-500 */
--breadcrumb-active: #f8fafc;    /* slate-50 */
```

---

## Persistenza Stato

### LocalStorage
```typescript
interface LayoutPreferences {
  sidebarCollapsed: boolean;
  sidebarWidth: number;  // per resize futuro
  theme: 'light' | 'dark' | 'system';
}
```

**Key**: `studio_layout_prefs`

---

## Accessibilità

### Requisiti
- [ ] Navigazione completa da tastiera
- [ ] Focus trap nel mobile menu
- [ ] Skip link "Vai al contenuto"
- [ ] ARIA labels per icone
- [ ] Role="navigation" per sidebar
- [ ] Current page indicator (aria-current)

### Scorciatoie tastiera
- `Cmd/Ctrl + B` → Toggle sidebar
- `Cmd/Ctrl + K` → Apri search (futuro)
- `Escape` → Chiudi menu/modal aperti

---

## Piano di Implementazione

### Task 1: Setup struttura base
**File**: `frontend/src/components/layout/AppLayout.tsx`
- Crea componente wrapper
- Setup context per stato sidebar
- Import placeholder per Sidebar, Header

### Task 2: Implementa Sidebar
**File**: `frontend/src/components/layout/Sidebar.tsx`
- Struttura base con items
- Stili hover/active
- Logo e branding

### Task 3: Implementa Header
**File**: `frontend/src/components/layout/Header.tsx`
- Layout base
- Toggle button
- Placeholder breadcrumb

### Task 4: Sistema Breadcrumb
**File**: `frontend/src/hooks/useBreadcrumb.ts`
**File**: `frontend/src/components/layout/Breadcrumb.tsx`
- Context per dati breadcrumb
- Componente visualizzazione
- Integration in Header

### Task 5: BottomNav Mobile
**File**: `frontend/src/components/layout/BottomNav.tsx`
- Componente bottom navigation
- Hide on scroll logic
- Responsive breakpoints

### Task 6: UserMenu
**File**: `frontend/src/components/layout/UserMenu.tsx`
- Dropdown menu
- Logout funzionante
- Placeholder per settings

### Task 7: Integrazione pagine esistenti
- Wrap pagine dashboard con AppLayout
- Aggiungere useBreadcrumb a ogni pagina
- Test navigazione completa

### Task 8: Responsive testing
- Test su viewport desktop
- Test su viewport tablet
- Test su viewport mobile
- Fix eventuali problemi

---

## Dipendenze

### Nessuna nuova dipendenza richiesta
- Tailwind CSS (già presente)
- React hooks (già presente)
- Next.js navigation (già presente)

### Opzionali (da valutare)
- `framer-motion` per animazioni sidebar (se vogliamo animazioni smooth)
- `@headlessui/react` per dropdown accessibili (già usato?)

---

## Rischi e Mitigazioni

| Rischio | Probabilità | Impatto | Mitigazione |
|---------|-------------|---------|-------------|
| Layout break su resize | Media | Alto | Test accurati breakpoints |
| Performance sidebar render | Bassa | Medio | Memoization componenti |
| Conflitti con pagine esistenti | Media | Alto | Implementazione graduale |

---

## Criteri di Accettazione

- [ ] Sidebar visibile su desktop, nascondibile
- [ ] Bottom nav su mobile
- [ ] Breadcrumb mostra percorso corrente
- [ ] Click su sidebar naviga correttamente
- [ ] Stato sidebar persiste tra sessioni
- [ ] Nessun layout shift durante caricamento
- [ ] Accessibile da tastiera
- [ ] Funziona su Chrome, Safari, Firefox

---

## Domande Aperte

1. **Animazioni**: Vuoi animazioni smooth per apertura/chiusura sidebar o transizioni immediate?

2. **Resize sidebar**: Vuoi che la sidebar sia resizable dall'utente (drag del bordo)?

3. **Notifiche**: Mostriamo badge con numero card in scadenza sulla sidebar?

---

*Documento pronto per review e approvazione.*
