# Piano: Smart Chapter Splitting

## Obiettivo
Quando un PDF viene elaborato, l'AI analizza il contenuto e lo divide automaticamente in capitoli/sezioni basati sul significato del testo (non sulla struttura del documento).

## Architettura

### Flusso attuale
```
Upload PDF → 1 Source + 1 Chapter ("Documento completo") → Processing → raw_text + processed_text salvati nel singolo chapter
```

### Nuovo flusso
```
Upload PDF → 1 Source + 1 Chapter temp → Processing → Estrazione testo →
  → AI analizza e identifica N sezioni →
  → Crea N chapters (uno per sezione) →
  → Enhance each chapter text separately →
  → Salva tutto
```

## Tech Stack
- Backend: Python FastAPI (processing pipeline)
- AI: Gemini Flash via OpenRouter (analisi + splitting)
- DB: Supabase PostgreSQL (chapters table)

## Approccio tecnico

### Step 1: AI identifica i punti di split
Dopo l'estrazione del testo (PyPDF2 o Vision), chiediamo all'AI di:
1. Analizzare il contenuto
2. Identificare i macro-argomenti
3. Restituire un JSON con: titolo capitolo + inizio/fine nel testo

### Step 2: Split del testo
Il backend divide il testo estratto secondo i punti identificati dall'AI.

### Step 3: Creazione chapters
Per ogni sezione:
1. Crea un nuovo record `chapters` con `source_id`, `title`, `order_index`
2. Salva `raw_text` con il testo della sezione
3. Esegui `enhance_processed_text` sulla sezione
4. Salva `processed_text`

### Step 4: Cleanup
Elimina il chapter temporaneo iniziale ("Documento completo") o lo aggiorna come primo capitolo.

## Prompt AI per splitting

```
Analizza questo testo estratto da un documento di studio.
Identifica i CAPITOLI o SEZIONI principali basandoti sul CONTENUTO e sugli ARGOMENTI trattati.

REGOLE:
1. Ogni capitolo deve avere un argomento coerente
2. Minimo 2 capitoli, massimo 15
3. Ogni capitolo deve avere almeno 500 caratteri
4. Dai un titolo descrittivo a ogni capitolo
5. Identifica i punti di divisione usando frasi esatte dal testo

Rispondi in JSON:
[
  {
    "title": "Titolo del capitolo",
    "start_marker": "prima frase del capitolo (esatta dal testo)",
    "summary": "breve descrizione di cosa tratta"
  }
]
```

## Impatto sul frontend
- La pagina source già supporta più chapters (li lista tutti)
- Ogni chapter ha già i suoi pulsanti Leggi/Flashcard/Quiz
- Sidebar mostra già la lista chapters sotto ogni source
- **Nessuna modifica frontend necessaria** per la feature base

## Rischi e mitigazioni
- **AI non split bene**: fallback a singolo chapter se il JSON non è valido
- **Testo troppo corto**: se < 2000 chars, skip splitting (un solo chapter)
- **Timeout**: lo splitting è una singola call AI leggera (solo analisi, no generation)

## Tasks

### Task 1: Aggiungere metodo `split_into_chapters` a OpenRouterService
**File:** `backend/services/openrouter_service.py`
- Nuovo metodo che prende il testo e restituisce la lista di split points
- Usa Gemini Flash (economico e veloce)

### Task 2: Modificare il processing pipeline
**File:** `backend/routers/process.py`
- Dopo estrazione testo e prima di enhance:
  1. Chiama `split_into_chapters`
  2. Se ritorna >1 chapter, split il testo
  3. Crea i chapter records in Supabase
  4. Enhance ogni chapter separatamente
  5. Aggiorna progress per ogni chapter

### Task 3: Gestire il chapter iniziale
- Il chapter "Documento completo" creato dal frontend viene riusato come primo capitolo
- I capitoli successivi vengono creati dal backend
