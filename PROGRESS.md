# PROGRESS.md - Studio App

> Project Memory - Aggiornato: 2025-03-11

---

## Discovery Answers

| # | Domanda | Risposta |
|---|---------|----------|
| 1 | **North Star** | App che trasforma documenti in flashcard, quiz, mappe concettuali, riassunti, infografiche, presentazioni |
| 2 | **Integrations** | Supabase (DB+Storage+Auth), Gemini (doc processing), Claude (content generation), ts-fsrs, mermaid, pptxgenjs |
| 3 | **Source of Truth** | Supabase PostgreSQL + Storage buckets |
| 4 | **Delivery** | Web app (principale), export file nativi (.pptx, .png) |
| 5 | **Behavioral Rules** | IT/EN, rate limit con cooldown 2h, conferme UX, limiti sotto |

### Limiti Configurati

| Risorsa | Limite |
|---------|--------|
| Pagine PDF | Max 50 |
| Dimensione file | Max 20MB |
| Elaborazioni | Cooldown 2h dopo limite |
| Flashcard/generazione | 5-30 (scelta utente) |
| Storage/utente | 200MB |

---

## Research Findings

### Librerie Selezionate

| Funzionalità | Package | Versione | Link |
|--------------|---------|----------|------|
| Mappe concettuali | `mermaid` + `@mermaid-js/react` | latest | [GitHub](https://github.com/mermaid-js/mermaid) |
| Presentazioni | `pptxgenjs` | ^3.x | [GitHub](https://github.com/gitbrent/PptxGenJS) |
| Export immagini | `html-to-image` | ^1.x | [npm](https://www.npmjs.com/package/html-to-image) |
| FSRS (frontend) | `ts-fsrs` | ^4.x | [GitHub](https://github.com/open-spaced-repetition/ts-fsrs) |
| Quiz UI | Custom Tailwind | - | Librerie esistenti datate |
| Infografiche | HTML/CSS + Claude | - | Generazione dinamica, no API esterne |

### Decisioni Architetturali

1. **Backend Python (FastAPI)** - Mantiene separazione concerns, FSRS Python già pronto
2. **ts-fsrs nel frontend** - Per calcoli real-time senza round-trip al server
3. **Infografiche HTML** - Claude genera HTML styled, esportato con html-to-image (evita costi API esterne)
4. **Quiz custom** - Tailwind + React, le librerie npm sono datate o troppo opinionated

---

## Data Schema

### Input: Documento Caricato

```json
{
  "source": {
    "id": "uuid",
    "user_id": "uuid",
    "title": "string",
    "author": "string | null",
    "source_type": "book | pdf | notes",
    "cover_url": "string | null",
    "created_at": "timestamp"
  },
  "chapters": [
    {
      "id": "uuid",
      "source_id": "uuid",
      "title": "string",
      "file_url": "string",
      "raw_text": "string | null",
      "processed_text": "string | null",
      "processing_status": "pending | processing | completed | error"
    }
  ]
}
```

### Output: Materiali Generati

```json
{
  "flashcards": [
    {
      "id": "uuid",
      "chapter_id": "uuid",
      "front": "string",
      "back": "string",
      "difficulty": "easy | medium | hard",
      "ai_generated": true
    }
  ],
  "quiz": {
    "id": "uuid",
    "chapter_id": "uuid",
    "questions": [
      {
        "type": "multiple_choice | true_false",
        "question": "string",
        "options": ["A", "B", "C", "D"],
        "correct": "A",
        "explanation": "string"
      }
    ]
  },
  "summary": {
    "id": "uuid",
    "chapter_id": "uuid",
    "content": "markdown string",
    "detail_level": "brief | medium | detailed"
  },
  "concept_map": {
    "id": "uuid",
    "chapter_id": "uuid",
    "mermaid_code": "string (mermaid syntax)",
    "title": "string"
  },
  "infographic": {
    "id": "uuid",
    "chapter_id": "uuid",
    "html_content": "string (styled HTML)",
    "exported_url": "string | null"
  },
  "presentation": {
    "id": "uuid",
    "chapter_id": "uuid",
    "slides": [
      {
        "title": "string",
        "content": "string",
        "type": "title | content | bullets | image"
      }
    ],
    "pptx_url": "string | null"
  }
}
```

### FSRS Review State

```json
{
  "review": {
    "flashcard_id": "uuid",
    "user_id": "uuid",
    "due": "timestamp",
    "stability": 0.0,
    "difficulty": 0.0,
    "elapsed_days": 0,
    "scheduled_days": 0,
    "reps": 0,
    "lapses": 0,
    "state": 0,
    "last_review": "timestamp | null"
  }
}
```

---

## Project Phases

### Phase 1: MVP Core ✅ COMPLETATO
- [x] Auth (login/signup)
- [x] Upload PDF
- [x] Dashboard fonti
- [x] Pagina dettaglio fonte
- [x] API elaborazione PDF (OpenRouter/Claude)
- [x] Generazione flashcard (da processed_text)
- [x] Pagina studio con FSRS (ts-fsrs)
- [ ] Generazione quiz → spostato a Phase 2

### Phase 2: Content Generation ⬅️ NEXT
- [ ] Generazione riassunti
- [ ] Generazione mappe concettuali (Mermaid)
- [ ] Generazione infografiche (HTML)
- [ ] Generazione presentazioni (pptxgenjs)

### Phase 3: Export & Polish
- [ ] Export infografiche come PNG
- [ ] Export presentazioni come .pptx
- [ ] Loading states e toast
- [ ] Rate limiting con cooldown

### Phase 4: Mobile & Extra
- [ ] PWA responsive
- [ ] Statistiche studio
- [ ] Export Anki

---

## Link Verification

| Service | Status | Notes |
|---------|--------|-------|
| Supabase DB | ✅ Verificato | Connesso |
| OpenRouter | ✅ Verificato | $25 crediti, Claude + Gemini funzionanti |
| Claude (via OpenRouter) | ✅ Verificato | Model: anthropic/claude-3.5-sonnet |
| Gemini (via OpenRouter) | ✅ Verificato | Model: google/gemini-2.0-flash-001 |

---

## Maintenance Log

| Data | Azione | Note |
|------|--------|------|
| 2025-03-11 | Inizializzazione progetto | Discovery completata |
| 2025-03-11 | Migrazione a OpenRouter | Sostituito API dirette Anthropic/Gemini con OpenRouter |
| 2025-03-11 | Phase 1 MVP completato | Flashcard generation + Study page con FSRS |
| 2026-03-12 | UX Redesign | Studio Hub + Session page + Dashboard migliorata |

---

## UX Redesign (2026-03-12)

### Struttura Implementata

1. **Dashboard** (`/dashboard`) - Homepage con statistiche, streak, carte da ripassare
2. **Study Hub** (`/dashboard/study`) - Hub centrale con tabs per tutti gli strumenti:
   - Flashcards (attivo)
   - Quiz (attivo)
   - Riassunti (coming soon)
   - Mappe (coming soon)
   - Infografiche (coming soon)
   - Slides (coming soon)
3. **Study Session** (`/dashboard/study/session`) - Sessione ripasso flashcard con FSRS
4. **Stats** (`/stats`) - Statistiche complete con streak, retention, attività 30 giorni

### Componenti Aggiornati

- `Sidebar.tsx` - Navigazione ad albero libri/capitoli, badge due cards
- `AppLayout.tsx` - Layout unificato con sidebar resizable
- `LayoutContext.tsx` - Gestione stato sidebar + fix hydration
- `BreadcrumbContext.tsx` - Breadcrumbs dinamici

### Frontend Excellence Protocol

Aggiunto a MEMORY.md per garantire qualità frontend impeccabile in tutte le sessioni future.

