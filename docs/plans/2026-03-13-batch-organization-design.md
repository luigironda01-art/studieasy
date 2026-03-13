# Design: Organizzazione Contenuti per Difficoltà e Batch

## Obiettivo
Organizzare flashcard, quiz e futuri contenuti (riassunti, mappe, ecc.) in sottocategorie per difficoltà, con possibilità di ordinare per quantità o data di generazione.

## Struttura UI Desiderata

```
📚 Chimica Farmaceutica (37 carte totali) ▼
│
├── 🟢 Facile (27 carte) ▼
│   │ [Ordina: Quantità ▼ | Data ▼]
│   ├── 27 flashcard - 13/03/2026 14:30  [Ripassa 25] [🗑]
│   └── 5 flashcard - 10/03/2026 09:00   [Ripassa 3] [🗑]
│
├── 🟡 Media (10 carte) ▼
│   │ [Ordina: Quantità ▼ | Data ▼]
│   └── 10 flashcard - 12/03/2026 11:20  [Ripassa 8] [🗑]
│
└── 🔴 Difficile (0 carte)
    └── Nessuna flashcard generata
```

## Database Changes

### 1. Migrazione Flashcards
```sql
-- Aggiunge difficulty e batch_id alla tabella flashcards
ALTER TABLE flashcards
ADD COLUMN IF NOT EXISTS difficulty TEXT
CHECK (difficulty IN ('easy', 'medium', 'hard'))
DEFAULT 'medium';

ALTER TABLE flashcards
ADD COLUMN IF NOT EXISTS batch_id UUID;

-- Index per query efficienti
CREATE INDEX IF NOT EXISTS idx_flashcards_difficulty ON flashcards(difficulty);
CREATE INDEX IF NOT EXISTS idx_flashcards_batch_id ON flashcards(batch_id);
```

### 2. Migrazione Quizzes
```sql
-- Aggiunge difficulty alla tabella quizzes
ALTER TABLE quizzes
ADD COLUMN IF NOT EXISTS difficulty TEXT
CHECK (difficulty IN ('easy', 'medium', 'hard'))
DEFAULT 'medium';

CREATE INDEX IF NOT EXISTS idx_quizzes_difficulty ON quizzes(difficulty);
```

### 3. Future Tables (per riassunti, mappe, ecc.)
Stesso pattern: ogni tabella avrà `difficulty` e eventualmente `batch_id`.

## Backend Changes

### 1. Generazione Flashcards (routers/flashcards.py)
- Generare `batch_id` (UUID) per ogni richiesta di generazione
- Salvare `difficulty` passato dal frontend
- Salvare `batch_id` su tutte le flashcard generate insieme

### 2. Generazione Quiz (routers/study.py o nuovo router)
- Salvare `difficulty` passato dal frontend

### 3. Nuovi Endpoint
```
GET /api/flashcards/by-chapter/{chapter_id}/grouped
  → Ritorna flashcard raggruppate per difficulty → batch

Response:
{
  "easy": {
    "total": 32,
    "due": 25,
    "batches": [
      { "batch_id": "...", "count": 27, "due": 22, "created_at": "..." },
      { "batch_id": "...", "count": 5, "due": 3, "created_at": "..." }
    ]
  },
  "medium": { ... },
  "hard": { ... }
}
```

## Frontend Changes

### 1. Study Page (study/page.tsx)
Modificare la struttura del contenuto espanso per ogni source:

```tsx
// Invece di mostrare solo i capitoli:
<ChapterItem chapter={chapter} />

// Mostrare la struttura per difficoltà:
<DifficultySection
  difficulty="easy"
  batches={chapter.flashcardBatches.easy}
  onStudy={(batchId) => ...}
  onDelete={(batchId) => ...}
  sortBy={sortBy}
  onSortChange={setSortBy}
/>
```

### 2. Nuovo Componente: DifficultySection
```tsx
interface DifficultySection {
  difficulty: 'easy' | 'medium' | 'hard';
  batches: Batch[];
  sortBy: 'count' | 'date';
  onStudy: (batchId: string) => void;
  onDelete: (batchId: string) => void;
}
```

### 3. Filtri/Ordinamento
- Toggle per ordinare batch: "Quantità" | "Data"
- Direzione: ascendente/discendente
- Stato salvato in localStorage per persistenza

## Tasks di Implementazione

### Phase 1: Database (30 min)
- [ ] Creare file migrazione SQL
- [ ] Eseguire migrazione su Supabase
- [ ] Verificare che i dati esistenti abbiano default 'medium'

### Phase 2: Backend (45 min)
- [ ] Modificare generazione flashcards per salvare difficulty + batch_id
- [ ] Modificare generazione quiz per salvare difficulty
- [ ] Creare endpoint GET grouped flashcards
- [ ] Test endpoint

### Phase 3: Frontend Study Page (1.5h)
- [ ] Creare tipo TypeScript per BatchGroup
- [ ] Fetch dati raggruppati invece di flat list
- [ ] Creare componente DifficultyAccordion
- [ ] Creare componente BatchItem
- [ ] Implementare filtri ordinamento
- [ ] Implementare "Studia batch specifico"
- [ ] Implementare "Elimina batch"

### Phase 4: Test & Deploy (30 min)
- [ ] Test manuale completo
- [ ] Fix eventuali bug
- [ ] Deploy backend
- [ ] Deploy frontend

## Stima Totale: ~3 ore

## Note Tecniche

1. **Backward Compatibility**: Le flashcard esistenti avranno `difficulty='medium'` e `batch_id=NULL`. Il frontend le raggrupperà come "Batch legacy" se batch_id è null.

2. **Performance**: Gli index su difficulty e batch_id garantiscono query veloci anche con molte flashcard.

3. **Estendibilità**: Stesso pattern per quiz, riassunti, mappe, infografiche, slides.
