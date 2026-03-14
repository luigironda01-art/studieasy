# Piano: Smart Image Generation per PDF

## Obiettivo
Generare immagini nel PDF solo dove aggiungono valore didattico reale, usando un'analisi AI del contenuto.

## Architettura

```
Testo capitolo
    │
    ▼
[1] POST /api/images/analyze  ←  Gemini Flash (economico)
    Analizza il testo, identifica max 5 sezioni che beneficerebbero
    di un'immagine (formule, diagrammi, testo mal estratto, strutture)
    │
    ▼
[2] POST /api/images/generate  (già esistente, fixato)
    Genera in parallelo solo le immagini selezionate
    │
    ▼
[3] PDF Builder
    Inserisce le immagini nel punto corretto del PDF
```

## Flusso dettagliato

### Step 1 — Analisi AI (1 chiamata)
- Modello: `google/gemini-2.0-flash-lite-001` via OpenRouter (~0.01$/chiamata)
- Input: testo completo del capitolo
- Output: JSON array con max 5 oggetti:
  ```json
  [
    {
      "anchor": "testo unico vicino a dove inserire l'immagine",
      "description": "descrizione dettagliata dell'immagine da generare",
      "reason": "formula | diagram | structure | poor_text"
    }
  ]
  ```

### Step 2 — Generazione parallela (max 5 chiamate)
- Modello: `google/gemini-2.5-flash-preview-image-generation` via OpenRouter
- Tutte le immagini generate in parallelo con `Promise.all`
- Timeout 30s per immagine

### Step 3 — Inserimento PDF
- Per ogni immagine generata, cerca l'`anchor` nel testo
- Inserisce l'immagine dopo il blocco corrispondente
- Fallback: se anchor non trovato, skip

## Tech Stack
- OpenRouter API (raw fetch)
- jsPDF (client-side PDF)
- Next.js API routes

## Tasks

### Task 1: API /api/images/analyze
- Endpoint POST che riceve il testo
- Chiama Gemini Flash via OpenRouter
- Restituisce JSON con max 5 immagini da generare

### Task 2: Fix API /api/images/generate
- Già aggiornato per OpenRouter
- Verificare parsing risposta `message.images`

### Task 3: Aggiornare handleDownloadPdf
- Chiamare /api/images/analyze col testo
- Generare le immagini in parallelo
- Inserirle nel PDF nei punti corretti
