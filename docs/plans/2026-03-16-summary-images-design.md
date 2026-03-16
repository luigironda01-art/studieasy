# Piano: Immagini AI nel Riassunto Intero

## Obiettivo
Dopo aver generato i riassunti dei capitoli, analizzare il testo completo e generare fino a 5 immagini AI che spiegano argomenti chiave. Le immagini vengono salvate in Supabase e inserite nel PDF del riassunto intero.

## Architettura

### Flusso
```
Elaborazione PDF → Riassunti capitoli → Assemblaggio testo completo
→ AI analizza e identifica 5 topic → Genera 5 immagini (Gemini)
→ Salva in Supabase Storage + metadati in DB → PDF le include
```

### Infrastruttura Esistente
- `frontend/src/app/api/images/generate/route.ts` — Genera immagini via Gemini
- `frontend/src/app/api/images/analyze/route.ts` — Analizza testo e suggerisce 5 posizioni
- `summaries/page.tsx` — Già supporta `doc.addImage()` nel PDF
- `backend/routers/process.py` — Auto-genera riassunti dopo elaborazione

### Nuovi Componenti

#### 1. Tabella `summary_images`
```sql
CREATE TABLE summary_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
  title TEXT NOT NULL,           -- Titolo dell'argomento
  description TEXT NOT NULL,     -- Descrizione/didascalia
  image_url TEXT NOT NULL,       -- URL in Supabase Storage
  position_index INT NOT NULL,   -- Ordine nel documento (0-4)
  anchor_text TEXT,              -- Testo di riferimento nel riassunto
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 2. Supabase Storage Bucket
- Bucket: `summary-images`
- Path: `{source_id}/{position_index}.png`
- Policy: authenticated read, service role write

#### 3. API Route: `/api/images/generate-for-summary`
- Input: `{ sourceId, userId }`
- Flow:
  1. Fetch tutti i riassunti capitoli per la source
  2. Chiama `/api/images/analyze` per identificare 5 topic
  3. Per ogni topic, chiama `/api/images/generate`
  4. Upload immagine in Supabase Storage
  5. Salva metadati in `summary_images`
- Output: `{ success, images: [...] }`

#### 4. Integrazione nel flusso
- **Backend (process.py)**: Dopo aver generato i riassunti, chiama l'API frontend per generare le immagini
- **Alternativa migliore**: Il frontend, dopo il bulk generate dei riassunti, chiama la generazione immagini
- **Scelta**: Frontend-driven — dopo che tutti i riassunti sono pronti, il frontend lancia la generazione immagini con progress bar

#### 5. PDF "Libro Intero"
- Fetch immagini da `summary_images` per la source
- Distribuisci le 5 immagini equamente nel documento
- Ogni immagine ha titolo + didascalia sotto

## Tech Stack
- Gemini (via OpenRouter) per generazione immagini
- Supabase Storage per persistenza
- jsPDF per inserimento nel PDF

## Tasks

### Task 1: Migration SQL — Tabella `summary_images`
**File:** `supabase/migrations/20260316_add_summary_images.sql`
1. CREATE TABLE summary_images
2. CREATE INDEX su source_id
3. RLS policies

### Task 2: Supabase Storage Bucket
**File:** `supabase/migrations/20260316_add_summary_images_bucket.sql`
1. Crea bucket `summary-images`
2. Policy per read/write

### Task 3: API Route `/api/images/generate-for-summary`
**File:** `frontend/src/app/api/images/generate-for-summary/route.ts`
1. Fetch riassunti capitoli
2. Analisi AI per 5 topic
3. Genera 5 immagini
4. Upload in Storage
5. Salva metadati

### Task 4: Integrazione nel frontend — Generazione automatica
**File:** `frontend/src/app/dashboard/source/[id]/summaries/page.tsx`
1. Dopo bulk summary generation, lancia generazione immagini
2. Progress bar per le immagini
3. Fetch immagini esistenti all'avvio

### Task 5: PDF "Libro Intero" — Inserimento immagini
**File:** `frontend/src/app/dashboard/source/[id]/summaries/page.tsx`
1. Nella funzione di generazione PDF intero, fetch immagini
2. Distribuisci 5 immagini nel documento
3. Titolo + didascalia per ogni immagine
