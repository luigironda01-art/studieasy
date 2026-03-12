# Design Doc: Studio UX Redesign

**Data:** 2026-03-12
**Versione:** 1.0
**Status:** In attesa approvazione

---

## 1. Contesto e Obiettivi

### 1.1 North Star
Creare un'app di studio AI che sia **intuitiva come Instagram, potente come Notion, e gratificante come Duolingo**. L'utente deve capire immediatamente cosa fare e sentirsi motivato a tornare ogni giorno.

### 1.2 Requisiti dall'Utente
- **Qualità > Velocità** - "Meglio metterci più lavoro ma che siano impeccabili"
- **Struttura gerarchica**: Libri → Capitoli → Strumenti di studio
- **La sezione "Studia" sostituisce e migliora la dashboard attuale**
- **Animazioni smooth** - Transizioni fluide, non scattose
- **Sidebar ridimensionabile** - L'utente controlla lo spazio
- **Badge notifiche** - Mostrare carte da studiare, nuovi contenuti

### 1.3 Features Richieste (Roadmap)
1. **Flashcard** con FSRS (già implementato, da migliorare UX)
2. **Quiz** (già implementato, da integrare meglio)
3. **Riassunti** - Generati AI per ogni capitolo
4. **Concept Maps** - Mappe concettuali visive
5. **Infografiche** - Visualizzazioni dei concetti chiave
6. **Presentazioni** - Slide generate dal contenuto
7. **Registrazioni/Audio** - Sezione per note vocali

---

## 2. Stato Attuale (Cosa Esiste)

### 2.1 Struttura File Frontend
```
frontend/src/
├── app/
│   ├── dashboard/
│   │   ├── layout.tsx        ✅ Wraps con AppLayout
│   │   ├── page.tsx          ✅ Lista libri
│   │   ├── source/[id]/      ✅ Dettaglio libro/capitoli
│   │   ├── study/            ⚠️ Sessione flashcard (UX da rifare)
│   │   └── quiz/[id]/        ✅ Quiz page
│   ├── feedback/             ✅ Form feedback
│   ├── help/                 ✅ FAQ page
│   ├── settings/             ✅ Settings page
│   ├── stats/                ⚠️ Placeholder "Prossimamente"
│   └── login/signup/         ✅ Auth pages
├── components/layout/
│   ├── AppLayout.tsx         ✅ Wrapper principale
│   ├── Sidebar.tsx           ⚠️ Funziona ma UX povera
│   ├── Header.tsx            ✅ Con breadcrumb
│   ├── BottomNav.tsx         ✅ Mobile nav
│   └── Breadcrumb.tsx        ✅ Navigazione
└── contexts/
    ├── AuthContext.tsx       ✅ Autenticazione
    ├── LayoutContext.tsx     ✅ Stato sidebar
    └── BreadcrumbContext.tsx ✅ Breadcrumb dinamico
```

### 2.2 Problemi Attuali Identificati
1. **Sessione Studio confusa** - Non si capisce cosa fare, brutta UI
2. **Nessun onboarding** - Utente nuovo è perso
3. **Sidebar generica** - Non mostra la struttura libri/capitoli
4. **Nessuna gamification** - Manca streak, progressi, motivazione
5. **Stats vuote** - Solo placeholder
6. **Mobile UX povera** - Bottom nav basica

---

## 3. Design Proposto: "Organized Scholar"

### 3.1 Architettura Navigazione

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              HEADER                                      │
│  [≡]  📖 Studio     Breadcrumb: Studia > Libro > Capitolo    🔍  👤    │
├───────────────┬─────────────────────────────────────────────────────────┤
│               │                                                         │
│   SIDEBAR     │                    MAIN CONTENT                         │
│   (240-400px) │                                                         │
│   Resizable   │                                                         │
│               │                                                         │
│  ┌──────────┐ │                                                         │
│  │Dashboard │ │                                                         │
│  └──────────┘ │                                                         │
│               │                                                         │
│  LIBRERIA     │                                                         │
│  ▾ 📘 Chimica │                                                         │
│    ▸ Cap 1    │                                                         │
│    ▸ Cap 2    │                                                         │
│  ▸ 📗 Biologia│                                                         │
│  + Aggiungi   │                                                         │
│               │                                                         │
│  ───────────  │                                                         │
│  📊 Statistiche                                                         │
│  💬 Feedback  │                                                         │
│  ❓ Aiuto     │                                                         │
│  ⚙️ Impostaz. │                                                         │
│               │                                                         │
└───────────────┴─────────────────────────────────────────────────────────┘
```

### 3.2 Pagine Principali

#### A. Dashboard (Home) - `/dashboard`

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  Buongiorno, Marco!                                   🔥 12 giorni      │
│  Hai 47 carte da studiare oggi                                          │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                                                                 │   │
│  │   🎯  INIZIA SESSIONE DI STUDIO                                │   │
│  │       47 carte · ~25 minuti · 3 libri                          │   │
│  │                                                                 │   │
│  │   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━░░░░░░░░░░░░  68% settimana │   │
│  │                                                                 │   │
│  │                    [ Inizia ora → ]                            │   │
│  │                                                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐         │
│  │ 📊 OGGI         │  │ 🎯 RETENTION    │  │ 📚 TOTALE       │         │
│  │                 │  │                 │  │                 │         │
│  │    23/70        │  │     85%         │  │    342          │         │
│  │    carte        │  │   accuratezza   │  │    carte        │         │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘         │
│                                                                         │
│  DA RIPASSARE OGGI                                      Vedi tutto →   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ 📘 Chimica Farmaceutica                                         │   │
│  │    Cap 4: Sintesi Imipramina                                    │   │
│  │    15 carte · ⏱️ ~8 min                         [ Studia → ]    │   │
│  ├─────────────────────────────────────────────────────────────────┤   │
│  │ 📗 Biologia Cellulare                                           │   │
│  │    Cap 2: Divisione Cellulare                                   │   │
│  │    8 carte · ⏱️ ~4 min                          [ Studia → ]    │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ATTIVITÀ QUESTA SETTIMANA                                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │  Lun   Mar   Mer   Gio   Ven   Sab   Dom                        │   │
│  │  ███   ███   ██░   ░░░   ░░░   ░░░   ░░░                        │   │
│  │   45    62    38    --    --    --    --                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### B. Pagina Libro - `/dashboard/source/[id]`

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  📘 Chimica Farmaceutica                                               │
│  Autore: Prof. Rossi · 8 capitoli · 156 flashcard                      │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ [ 🎴 Flashcard ]  [ 📝 Quiz ]  [ 📄 Riassunti ]  [ 🗺️ Mappe ]    │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  CAPITOLI                                                              │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │ ✅ Cap 1: Introduzione                                            │ │
│  │    12 flashcard · 2 quiz · Completato 100%                        │ │
│  ├───────────────────────────────────────────────────────────────────┤ │
│  │ ⏳ Cap 2: Farmacocinetica                                         │ │
│  │    18 flashcard · 1 quiz · Completato 60%                         │ │
│  │    ━━━━━━━━━━━░░░░░░░░░                                           │ │
│  ├───────────────────────────────────────────────────────────────────┤ │
│  │ 🆕 Cap 3: Farmacodinamica                                         │ │
│  │    Nessun contenuto · [ + Genera flashcard ]                      │ │
│  ├───────────────────────────────────────────────────────────────────┤ │
│  │ 🔴 Cap 4: Sintesi Imipramina                                      │ │
│  │    15 flashcard da ripassare OGGI                                 │ │
│  │    [ Studia ora → ]                                               │ │
│  └───────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  STRUMENTI LIBRO COMPLETO                                              │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐          │
│  │ 📄         │ │ 🗺️         │ │ 📊         │ │ 🎬         │          │
│  │ Riassunto  │ │ Mappa      │ │ Infografica│ │ Slides     │          │
│  │ completo   │ │ concetti   │ │            │ │            │          │
│  │ [Genera]   │ │ [Genera]   │ │ [Genera]   │ │ [Genera]   │          │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘          │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### C. Sessione Studio - `/dashboard/study`

```
┌─────────────────────────────────────────────────────────────────────────┐
│  ← Esci    Chimica > Cap 4: Sintesi Imipramina           12/47  ━━━░░  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│                                                                         │
│                                                                         │
│                                                                         │
│         ┌───────────────────────────────────────────────────┐          │
│         │                                                   │          │
│         │                                                   │          │
│         │    Quali sono i reagenti principali nello        │          │
│         │    step iniziale della sintesi dell'imipramina?  │          │
│         │                                                   │          │
│         │                                                   │          │
│         │                                                   │          │
│         │         ─────────────────────────────            │          │
│         │                                                   │          │
│         │    Acido antranilico + Cloruro di acile          │          │
│         │    in presenza di base (piridina)                │          │
│         │                                                   │          │
│         │                                                   │          │
│         └───────────────────────────────────────────────────┘          │
│                                                                         │
│                                                                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│  │    😓       │ │    😕       │ │    🙂       │ │    😎       │       │
│  │   Again     │ │    Hard     │ │    Good     │ │    Easy     │       │
│  │    <1m      │ │     6m      │ │    10m      │ │     4d      │       │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘       │
│                                                                         │
│  💡 Suggerimento: Swipe ← per Again, → per Good                        │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### D. Sessione Completata

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│                                                                         │
│                                                                         │
│                           🎉                                            │
│                                                                         │
│                   Sessione Completata!                                  │
│                                                                         │
│                                                                         │
│         ┌─────────────────┐       ┌─────────────────┐                  │
│         │       47        │       │      87%        │                  │
│         │  carte studiate │       │   accuratezza   │                  │
│         └─────────────────┘       └─────────────────┘                  │
│                                                                         │
│                                                                         │
│                      🔥 13 giorni di streak!                           │
│                                                                         │
│         ┌─────────────────────────────────────────────┐                │
│         │  Prossima sessione tra: 4 ore               │                │
│         │  (quando le prossime carte saranno pronte)  │                │
│         └─────────────────────────────────────────────┘                │
│                                                                         │
│                                                                         │
│    [ Studia altro libro ]              [ Torna alla Dashboard ]        │
│                                                                         │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 3.3 Sidebar Dettagliata

```
┌────────────────────────────────────┐
│                                    │
│  📖 Studio              [−]        │  ← Collapse button
│                                    │
├────────────────────────────────────┤
│                                    │
│  🏠 Dashboard                      │  ← Active state: bg-blue/20
│                                    │
│  🎯 Studia Ora              47 🔴  │  ← Badge carte due
│                                    │
├────────────────────────────────────┤
│  LIBRERIA                    [+]   │  ← Add book button
│                                    │
│  ▾ 📘 Chimica Farmaceutica   15   │  ← Expandable, badge
│     ├─ Cap 1: Intro          ✓    │  ← Completed
│     ├─ Cap 2: Farmaco...     3    │  ← 3 due
│     ├─ Cap 3: Farmaco...     ●    │  ← New content
│     └─ Cap 4: Sintesi       12    │  ← 12 due
│                                    │
│  ▸ 📗 Biologia               8    │  ← Collapsed
│  ▸ 📙 Storia                24    │
│                                    │
├────────────────────────────────────┤
│  STRUMENTI                         │
│                                    │
│  📊 Statistiche                    │
│  💬 Feedback                       │
│  ❓ Aiuto                          │
│                                    │
├────────────────────────────────────┤
│  ⚙️ Impostazioni                   │
│                                    │
│  ┌────────────────────────────┐   │
│  │ 👤 Marco R.               │   │
│  │    marco@email.com        │   │
│  └────────────────────────────┘   │
│                                    │
└────────────────────────────────────┘

← Resize handle (drag to resize) →
```

### 3.4 Platform Priority

**DESKTOP-FIRST** (90% users su PC)
- Sidebar sempre visibile di default
- Hover states elaborati
- Keyboard shortcuts (1-4 per rating, Space per flip)
- Layout multi-colonna
- Resize sidebar con drag

**Mobile** (supporto base, non prioritario)
- Bottom nav semplice
- Sidebar come drawer
- Touch gestures per flip card

---

## 4. Design System

### 4.1 Colori

```css
/* Primary - Azioni principali */
--primary-500: #6366F1;  /* Indigo */
--primary-600: #4F46E5;  /* Hover */
--primary-700: #4338CA;  /* Active */

/* Background Dark Mode */
--bg-primary:   #0F172A;  /* Slate 900 */
--bg-secondary: #1E293B;  /* Slate 800 */
--bg-tertiary:  #334155;  /* Slate 700 */

/* Text */
--text-primary:   #F8FAFC;  /* Slate 50 */
--text-secondary: #94A3B8;  /* Slate 400 */
--text-muted:     #64748B;  /* Slate 500 */

/* Semantic */
--success: #10B981;  /* Green - Correct, completed */
--warning: #F59E0B;  /* Amber - Due soon */
--error:   #EF4444;  /* Red - Again, overdue */
--info:    #3B82F6;  /* Blue - Info, new */

/* Accents per stati card */
--again: #EF4444;   /* Red */
--hard:  #F97316;   /* Orange */
--good:  #22C55E;   /* Green */
--easy:  #3B82F6;   /* Blue */
```

### 4.2 Typography

```css
/* Font Family */
font-family: 'Inter', -apple-system, sans-serif;

/* Scale */
--text-xs:   0.75rem;   /* 12px - timestamps */
--text-sm:   0.875rem;  /* 14px - captions */
--text-base: 1rem;      /* 16px - body */
--text-lg:   1.125rem;  /* 18px - card content */
--text-xl:   1.25rem;   /* 20px - headings */
--text-2xl:  1.5rem;    /* 24px - page titles */
--text-3xl:  1.875rem;  /* 30px - hero numbers */
```

### 4.3 Spacing & Sizing

```css
/* Spacing (4px base) */
--space-1: 0.25rem;  /* 4px */
--space-2: 0.5rem;   /* 8px */
--space-3: 0.75rem;  /* 12px */
--space-4: 1rem;     /* 16px */
--space-6: 1.5rem;   /* 24px */
--space-8: 2rem;     /* 32px */

/* Border Radius */
--radius-sm: 0.375rem;  /* 6px - buttons */
--radius-md: 0.5rem;    /* 8px - cards */
--radius-lg: 0.75rem;   /* 12px - modals */
--radius-xl: 1rem;      /* 16px - hero cards */

/* Sidebar */
--sidebar-min: 200px;
--sidebar-default: 280px;
--sidebar-max: 400px;
--sidebar-collapsed: 64px;
```

### 4.4 Animazioni

```css
/* Transitions */
--transition-fast: 150ms ease-out;
--transition-base: 200ms ease-out;
--transition-slow: 300ms ease-out;

/* Sidebar resize */
transition: width var(--transition-base);

/* Card flip */
transition: transform var(--transition-slow);
transform-style: preserve-3d;

/* Hover states */
transition: background-color var(--transition-fast),
            border-color var(--transition-fast),
            transform var(--transition-fast);

/* Hover lift effect */
&:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
```

---

## 5. Componenti da Creare/Modificare

### 5.1 Nuovi Componenti

| Componente | Descrizione | Priorità |
|------------|-------------|----------|
| `DashboardHome` | Homepage con stats e CTA | P0 |
| `StudySessionCard` | Card flashcard migliorata | P0 |
| `StudySessionComplete` | Schermata fine sessione | P0 |
| `SidebarTree` | Albero libri/capitoli navigabile | P0 |
| `StatsCard` | Card statistiche riutilizzabile | P1 |
| `ProgressRing` | Cerchio progresso animato | P1 |
| `StreakBadge` | Badge streak con animazione | P1 |
| `ActivityChart` | Grafico attività settimanale | P2 |
| `EmptyState` | Stati vuoti con CTA | P1 |
| `OnboardingFlow` | Wizard primo accesso | P2 |

### 5.2 Componenti da Modificare

| Componente | Modifiche | Priorità |
|------------|-----------|----------|
| `Sidebar.tsx` | Aggiungere tree navigazione libri | P0 |
| `Header.tsx` | Migliorare breadcrumb, aggiungere streak | P1 |
| `BottomNav.tsx` | Icone migliori, badge | P1 |
| `study/page.tsx` | Rifare completamente UX | P0 |
| `dashboard/page.tsx` | Trasformare in DashboardHome | P0 |

---

## 6. Data Schema

### 6.1 Struttura Dati Esistente (Supabase)

```typescript
// Già esistenti
interface Source {
  id: string;
  user_id: string;
  title: string;
  author?: string;
  source_type: 'pdf' | 'manual' | 'photo';
  created_at: string;
}

interface Chapter {
  id: string;
  source_id: string;
  title: string;
  content?: string;
  chapter_order: number;
  processing_status: 'pending' | 'processing' | 'completed' | 'error';
}

interface Flashcard {
  id: string;
  chapter_id: string;
  user_id: string;
  front: string;
  back: string;
  created_at: string;
}

interface Review {
  id: string;
  flashcard_id: string;
  user_id: string;
  due: string;
  state: number;  // FSRS state
  // ... altri campi FSRS
}
```

### 6.2 Nuovi Dati Necessari

```typescript
// User stats (cache o computed)
interface UserStats {
  user_id: string;
  streak_days: number;
  streak_last_date: string;
  total_cards_studied: number;
  total_correct: number;
  retention_rate: number;
}

// Daily activity (per grafico)
interface DailyActivity {
  user_id: string;
  date: string;
  cards_studied: number;
  correct_count: number;
  time_spent_minutes: number;
}
```

---

## 7. Piano di Implementazione

### Fase 1: Foundation (Priorità P0)
1. [ ] Refactor Sidebar con tree navigation
2. [ ] Creare DashboardHome component
3. [ ] Rifare StudySession UX completa
4. [ ] Creare StudySessionComplete
5. [ ] Aggiungere stato streak (basic)

### Fase 2: Polish (Priorità P1)
1. [ ] StatsCard components
2. [ ] EmptyState components
3. [ ] Badge notifiche sidebar
4. [ ] Migliorare BottomNav mobile
5. [ ] Animazioni smooth

### Fase 3: Features (Priorità P2)
1. [ ] ActivityChart settimanale
2. [ ] OnboardingFlow primo accesso
3. [ ] Statistiche page completa
4. [ ] Feedback backend integration

### Fase 4: Advanced (Priorità P3)
1. [ ] Generazione Riassunti AI
2. [ ] Concept Maps
3. [ ] Infografiche
4. [ ] Slides/Presentazioni
5. [ ] Sezione Audio/Registrazioni

---

## 8. Checklist Approvazione

Prima di procedere, conferma:

- [ ] **Struttura navigazione** - Sidebar con tree libri/capitoli OK?
- [ ] **Dashboard design** - Hero CTA + stats + carte da studiare OK?
- [ ] **Sessione studio** - Card centrata + 4 bottoni rating OK?
- [ ] **Colori** - Palette indigo/slate dark mode OK?
- [ ] **Priorità** - Partire da P0 (Foundation) OK?

---

## Note

Questo documento sarà aggiornato dopo ogni fase completata. Ogni modifica richiede ri-approvazione prima dell'implementazione.
