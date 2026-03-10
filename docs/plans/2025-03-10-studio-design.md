# Design Doc: Studio - App di Studio AI-Powered

**Data:** 2025-03-10
**Stato:** In attesa di approvazione
**Autore:** Claude + User

---

## 1. Vision

**Studio** è un'applicazione per studenti (liceali e universitari) che trasforma materiale didattico (libri, PDF, appunti) in strumenti di apprendimento attivo: flashcards, quiz, mappe concettuali e infografiche.

### Problema che risolviamo

Gli studenti:
- Passano ore a creare manualmente flashcard e riassunti
- Non hanno metodi di studio strutturati (spaced repetition)
- Faticano a collegare concetti tra fonti diverse
- Non sanno se stanno davvero imparando

### Soluzione

Un'app che:
1. Acquisisce il materiale di studio (PDF, foto, scanner)
2. Usa AI per generare automaticamente materiale di ripasso
3. Organizza tutto per libro/fonte
4. Suggerisce connessioni tra concetti da fonti diverse

---

## 2. Target Users

| Persona | Descrizione | Bisogno primario |
|---------|-------------|------------------|
| **Liceale** | 14-19 anni, studia per verifiche/maturità | Capire e memorizzare velocemente |
| **Universitario** | 19-26 anni, esami più complessi | Gestire grandi quantità di materiale |

---

## 3. Core Features (MVP)

### 3.1 Libreria Personale

Organizzazione **per libro/fonte**:

```
📚 La Mia Libreria
├── Fisica - Amaldi (Zanichelli)
│   ├── Cap. 1: Meccanica [12 pagine]
│   ├── Cap. 2: Termodinamica [8 pagine]
│   └── Cap. 3: Onde [caricamento...]
├── Appunti Lezioni Fisica
│   └── Lezione 15/03 [3 pagine]
└── Storia Moderna - Laterza
    └── Cap. 5: Rivoluzione Francese
```

### 3.2 Input - Caricamento Materiale

**Priorità 1: PDF/eBook**
- Drag & drop
- Estrazione testo automatica
- Supporto multi-pagina

**Priorità 2: Scanner Smart In-App**
- Modalità scansione continua (auto-scatto)
- Auto-crop e enhance
- OCR in background
- Batch upload

**Priorità 3: Foto singole**
- Upload manuale
- OCR
- Supportato ma non promosso

**Bonus: Quick Start senza upload**
- Studente indica titolo libro + capitolo
- AI genera materiale base dagli argomenti noti

### 3.3 Output MVP - Flashcards

**Modalità Classica:**
- Domanda fronte / Risposta retro
- Swipe per navigare
- Mark as "So" / "Non so"

**Modalità Spaced Repetition:**
- Algoritmo stile Anki/SM-2
- Scheduling automatico ripetizioni
- Dashboard progressi

**Generazione AI:**
- Claude analizza il testo
- Genera N flashcard per concetto
- Utente può editare/eliminare/aggiungere

### 3.4 Raccomandazioni Cross-Content

L'AI analizza cosa studi e suggerisce:
- "Questo concetto appare anche nel Cap. 7"
- "Video YouTube che spiega questo argomento"
- "Risorsa Khan Academy correlata"

Fonti suggerimenti: Web, YouTube, Wikipedia, risorse aperte, contenuti AI-generated.

### 3.5 Onboarding Obbligatorio

Tutorial pratico **non skippabile**:

```
Step 1: "Carica la tua prima pagina" → [utente fa azione]
Step 2: "Genera le tue prime flashcard" → [utente clicca]
Step 3: "Prova a rispondere" → [utente interagisce]
Step 4: "Imposta il tuo primo ripasso" → [utente schedula]
Completato: "Bravo! Ora sai usare Studio"
```

---

## 4. Features Future (Post-MVP)

| Feature | Descrizione | Priorità |
|---------|-------------|----------|
| **Quiz** | Multiple choice + Vero/Falso, difficoltà adattiva | Alta |
| **Mappe Concettuali** | Interattive + editabili | Media |
| **Infografiche** | Auto-generate + template | Media |
| **Gamification** | Streak, punti, livelli | Bassa |
| **Social** | Condividi deck con compagni | Bassa |

---

## 5. Architettura Tecnica

### Stack

| Layer | Tecnologia | Motivazione |
|-------|------------|-------------|
| **Frontend** | Next.js 14 + React | Desktop-first responsive, SSR, ottima DX |
| **Styling** | Tailwind CSS | Rapid prototyping, responsive |
| **Backend** | Python FastAPI | Performance, async, type hints |
| **AI Content** | Anthropic Claude API | Qualità pedagogica superiore per flashcard/quiz |
| **AI Documents** | Google Gemini API | Come NotebookLM - eccelle in document processing |
| **OCR STEM** | Mistral OCR (opzionale) | Formule matematiche, LaTeX |
| **Spaced Repetition** | FSRS (open-source) | Algoritmo provato, usato da Anki/RemNote |
| **Database** | PostgreSQL + Supabase | Auth inclusa, realtime, storage |
| **Storage Files** | Supabase Storage / S3 | PDF, immagini |
| **Deploy** | Vercel (FE) + Railway (BE) | Già familiare |

### Strategia AI Ibrida (Ispirata a NotebookLM, Migliorata)

```
┌─────────────────────────────────────────────────────────────┐
│                    STUDIO APP - AI IBRIDA                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  GEMINI (Efficienza)              CLAUDE (Qualità)          │
│  ├── Document Processing          ├── Generazione Flashcard │
│  ├── OCR/Estrazione testo         ├── Generazione Quiz      │
│  ├── Comprensione PDF             ├── Spiegazioni           │
│  ├── Ricerca suggerimenti         └── Riassunti dettagliati │
│  └── Pre-processing                                         │
│                                                             │
│  FSRS (Open-Source)               MISTRAL (Opzionale)       │
│  └── Spaced Repetition            └── OCR formule STEM      │
│                                                             │
└─────────────────────────────────────────────────────────────┘

PRINCIPIO: Gemini fa il lavoro "dietro le quinte"
           Claude genera tutto ciò che lo studente legge
```

### Vantaggi vs NotebookLM

| Feature | NotebookLM | Studio App |
|---------|------------|------------|
| Document Processing | Gemini | Gemini ✅ |
| Flashcard Quality | Gemini | **Claude** (migliore) |
| Spaced Repetition | ❌ Non presente | **FSRS** ✅ |
| Quiz Adattivi | Base | **Claude** (migliore) |
| Desktop + Tablet | ✅ | ✅ |
| Mobile Scanner | ❌ | **Companion PWA** ✅ |
| Italiano + English | ❌ | ✅ |
| Offline Mode | ❌ | ✅ |

### Architettura Multi-Dispositivo

```
┌─────────────────────────────────────────────────────────────┐
│                      STUDIO APP                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   💻 WEB APP PRINCIPALE               📱 MOBILE COMPANION    │
│   ══════════════════════              ════════════════════   │
│   Desktop (browser)                   Solo Smartphone        │
│   Tablet / iPad (browser)             • Scanner fotografico  │
│                                       • Sync real-time       │
│   • Libreria completa                                        │
│   • Genera flashcards                                        │
│   • Sessioni di studio                                       │
│   • Quiz e test                                              │
│   • Statistiche                                              │
│   • Offline support                                          │
│                                                              │
│              ←──── SYNC REAL-TIME (Supabase) ────→           │
│                                                              │
└─────────────────────────────────────────────────────────────┘

DISPOSITIVI SUPPORTATI:
┌──────────────┬─────────────────────┬──────────────────────┐
│ Dispositivo  │ Funzionalità        │ Tecnologia           │
├──────────────┼─────────────────────┼──────────────────────┤
│ PC/Mac       │ Studio completo     │ Browser (PWA)        │
│ iPad/Tablet  │ Studio completo     │ Browser (PWA)        │
│ Smartphone   │ Solo scanner        │ PWA Companion        │
└──────────────┴─────────────────────┴──────────────────────┘
```

### Design Responsive

```
DESKTOP (1200px+)              TABLET (768px-1199px)
┌─────────┬──────────────┐     ┌────────────────────┐
│ Sidebar │   Content    │     │ ≡ │    Content     │
│         │              │     │   │                │
│ • Home  │              │     └────────────────────┘
│ • Books │              │
│ • Study │              │     SMARTPHONE (Scanner Only)
│ • Stats │              │     ┌──────────────┐
└─────────┴──────────────┘     │   📷 SCAN    │
                               │   [Button]   │
                               └──────────────┘
```

### Architettura High-Level

```
┌─────────────────────────────────────────────────────────────┐
│                        FRONTEND                              │
│                    Next.js + React                           │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │ Upload  │  │ Library │  │ Study   │  │ Review  │        │
│  │ Flow    │  │ View    │  │ Session │  │ Stats   │        │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
└───────┼────────────┼────────────┼────────────┼──────────────┘
        │            │            │            │
        ▼            ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────┐
│                     API GATEWAY                              │
│                      FastAPI                                 │
├─────────────────────────────────────────────────────────────┤
│  /upload    /library    /flashcards    /study    /stats     │
└───────┬────────────┬────────────┬────────────┬──────────────┘
        │            │            │            │
        ▼            ▼            ▼            ▼
┌─────────────────────────────────────────────────────────────┐
│                    AI SERVICE LAYER                          │
├──────────────────────┬──────────────────────────────────────┤
│   GEMINI             │         CLAUDE                        │
│   (Processing)       │         (Generation)                  │
│   ├─ PDF parsing     │         ├─ Flashcards                 │
│   ├─ OCR             │         ├─ Quiz                       │
│   ├─ Text extraction │         ├─ Riassunti                  │
│   └─ Web search      │         └─ Spiegazioni                │
└──────────────────────┴──────────────────────────────────────┘
        │                        │
        ▼                        ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────────────────┐
│   FSRS       │ │   Mistral    │ │      Database            │
│   Scheduler  │ │   OCR STEM   │ │      Supabase            │
│  (Spaced Rep)│ │  (Opzionale) │ │  PostgreSQL + Storage    │
└──────────────┘ └──────────────┘ └──────────────────────────┘
```

### Flusso AI Dettagliato

```
UPLOAD PDF/FOTO
      │
      ▼
┌─────────────┐
│   GEMINI    │ ──→ Estrae testo, capisce struttura
└─────────────┘
      │
      ▼
┌─────────────┐
│   CLAUDE    │ ──→ Genera flashcard di qualità
└─────────────┘
      │
      ▼
┌─────────────┐
│    FSRS     │ ──→ Schedula ripetizioni
└─────────────┘
      │
      ▼
   STUDENTE
```

### Schema Database (Semplificato)

```sql
-- Utenti (gestito da Supabase Auth)
users (id, email, created_at, onboarding_completed)

-- Libri/Fonti
sources (id, user_id, title, author, type[book/notes/pdf], created_at)

-- Capitoli/Sezioni
chapters (id, source_id, title, order, created_at)

-- Pagine (contenuto processato)
pages (id, chapter_id, page_number, raw_text, processed_text, image_url)

-- Flashcards
flashcards (id, chapter_id, front, back, created_at, ai_generated)

-- Spaced Repetition Data
reviews (id, flashcard_id, user_id, quality, reviewed_at, next_review)
```

---

## 6. UX Flow MVP

### Flow 1: Primo Accesso

```
[Landing] → [Signup] → [Onboarding Tutorial] → [Dashboard Vuota]
```

### Flow 2: Caricamento Primo Libro

```
[+ Aggiungi Libro] → [Scegli: PDF / Scanner / Foto]
       ↓
[Se PDF: Upload] → [Processing...] → [Libro in Libreria]
       ↓
[Se Scanner: Camera] → [Scatta pagine] → [Fine] → [Processing...] → [Libro in Libreria]
```

### Flow 3: Genera Flashcards

```
[Apri Capitolo] → [Genera Flashcards] → [AI Processing...]
       ↓
[Review Flashcards Generate] → [Modifica/Elimina/Conferma]
       ↓
[Flashcards Salvate] → [Studia Ora / Più Tardi]
```

### Flow 4: Sessione di Studio

```
[Studia] → [Flashcard Fronte] → [Mostra Risposta]
       ↓
[Retro] → [Non lo so 😕 / Difficile 🤔 / Facile 😊 / Perfetto 🎯]
       ↓
[Prossima Card...] → [Sessione Completa]
       ↓
[Stats: 15/20 corrette, prossimo ripasso: domani]
```

---

## 7. Rischi e Mitigazioni

| Rischio | Probabilità | Impatto | Mitigazione |
|---------|-------------|---------|-------------|
| OCR inaccurato | Media | Alto | Permettere editing manuale, migliorare con feedback |
| Flashcard AI di bassa qualità | Media | Alto | Review obbligatoria, rating utente, iterate |
| Onboarding troppo lungo | Media | Medio | Test con utenti reali, accorciare se necessario |
| Costi API Claude | Bassa | Medio | Caching, batch processing, limiti free tier |
| Competitor (Quizlet, Anki) | Alta | Medio | Focus su UX italiana, scanner, AI generation |

---

## 8. Metriche di Successo MVP

| Metrica | Target MVP |
|---------|------------|
| Completamento onboarding | > 80% |
| Upload primo libro | > 60% degli iscritti |
| Flashcards generate | > 50 per utente medio |
| Retention D7 | > 30% |
| NPS | > 40 |

---

## 9. Timeline Stimata MVP

| Fase | Durata | Output |
|------|--------|--------|
| Setup progetto + Auth | 1 settimana | Repo, deploy pipeline, login funzionante |
| Upload PDF + OCR | 1 settimana | Caricamento e processing PDF |
| Libreria UI | 1 settimana | Visualizzazione libri/capitoli |
| Generazione Flashcards | 1 settimana | AI genera flashcards da testo |
| Studio Session | 1 settimana | UI studio + spaced repetition base |
| Onboarding Tutorial | 3-4 giorni | Tutorial interattivo |
| Polish + Testing | 1 settimana | Bug fix, UX improvements |
| **TOTALE MVP** | **~6-7 settimane** | |

---

## 10. Open Questions (Risolte)

| Domanda | Decisione |
|---------|-----------|
| Scanner mobile | ✅ **PWA Companion** - smartphone solo per scan |
| Piattaforma principale | ✅ **Desktop + Tablet/iPad** via browser |
| Multi-lingua | ✅ **Italiano + Inglese** |
| Offline mode | ✅ **Sì, necessario** per web app principale |
| Limiti free tier | ⏳ Da definire dopo MVP |

---

## 11. Decisioni dalla Ricerca (2025-03-10)

### Ricerca completata su servizi AI disponibili

| Decisione | Scelta | Fonte/Motivazione |
|-----------|--------|-------------------|
| Document Processing | **Gemini API** | Come NotebookLM, eccelle in PDF lunghi |
| Contenuti educativi | **Claude API** | Qualità pedagogica superiore |
| Spaced Repetition | **FSRS open-source** | Usato da Anki/RemNote, gratuito |
| OCR STEM | **Mistral OCR** (opzionale) | Migliore per formule matematiche |

### Differenziazione vs NotebookLM

| Noi abbiamo | NotebookLM non ha |
|-------------|-------------------|
| Spaced Repetition (FSRS) | ❌ |
| Claude per qualità contenuti | Usa solo Gemini |
| Scanner da smartphone companion | ❌ |
| Desktop + Tablet + Mobile sync | Solo desktop |
| Italiano + Inglese | Solo inglese |
| Offline mode | ❌ |
| UX ottimizzata per studio | UX generica ricerca |

---

## Approvazione

- [x] Brainstorming completato
- [x] Ricerca AI services completata
- [x] Strategia AI ibrida definita (Gemini + Claude)
- [x] Architettura multi-dispositivo definita
- [x] Open questions risolte
- [x] **User approva il design finale** ✅ (2025-03-10)
- [x] **Piano Dettagliato creato** → [2025-03-10-studio-plan.md](./2025-03-10-studio-plan.md)

---

*Documento generato seguendo la metodologia Superpowers*
*Ultimo aggiornamento: 2025-03-10 - Architettura Desktop+Tablet+Mobile Companion*
