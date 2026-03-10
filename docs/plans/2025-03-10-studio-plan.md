# Piano Dettagliato: Studio App MVP

**Data:** 2025-03-10
**Design Doc:** [2025-03-10-studio-design.md](./2025-03-10-studio-design.md)
**Metodologia:** Superpowers (TDD)

---

## Overview

| Fase | Durata | Focus |
|------|--------|-------|
| 1. Setup Progetto | 3-4 giorni | Infrastruttura, Auth, Deploy |
| 2. Document Processing | 4-5 giorni | Upload PDF, Gemini OCR |
| 3. Libreria UI | 3-4 giorni | CRUD libri, capitoli |
| 4. Flashcard Engine | 5-6 giorni | Claude generation, FSRS |
| 5. Studio Session | 4-5 giorni | UI studio, review flow |
| 6. Onboarding | 2-3 giorni | Tutorial interattivo |
| 7. Mobile Companion | 3-4 giorni | PWA scanner |
| 8. i18n + Offline | 2-3 giorni | IT/EN, service worker |
| 9. Polish | 3-4 giorni | Bug fix, UX |
| **TOTALE** | **~6-7 settimane** | |

---

## Fase 1: Setup Progetto (3-4 giorni)

### 1.1 Inizializzazione Repository

**Obiettivo:** Struttura monorepo con frontend e backend separati

#### Task 1.1.1: Creazione struttura cartelle
```bash
Studio/
├── frontend/          # Next.js app
├── backend/           # FastAPI
├── mobile/            # PWA companion
├── shared/            # Types condivisi
├── docs/              # Documentazione
└── docker-compose.yml
```

**Verifica:** `ls -la` mostra tutte le cartelle

#### Task 1.1.2: Init Next.js frontend
```bash
cd frontend && npx create-next-app@latest . --typescript --tailwind --eslint --app
```

**Verifica:** `npm run dev` → localhost:3000 funziona

#### Task 1.1.3: Init FastAPI backend
```bash
cd backend && python -m venv venv && pip install fastapi uvicorn
```

**Verifica:** `uvicorn main:app --reload` → localhost:8000/docs funziona

#### Task 1.1.4: Setup Docker Compose
- File docker-compose.yml con frontend, backend, postgres
- `.env.example` con variabili necessarie

**Verifica:** `docker-compose up` avvia tutti i servizi

---

### 1.2 Database e Supabase

#### Task 1.2.1: Creazione progetto Supabase
- Nuovo progetto su supabase.com
- Salvare URL e anon key in `.env`

**Verifica:** Dashboard Supabase accessibile

#### Task 1.2.2: Schema database iniziale
```sql
-- migrations/001_initial.sql

-- Users (estende Supabase Auth)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users PRIMARY KEY,
  display_name TEXT,
  language TEXT DEFAULT 'it',
  onboarding_completed BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Sources (libri, PDF, appunti)
CREATE TABLE sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT,
  source_type TEXT CHECK (source_type IN ('book', 'pdf', 'notes')),
  cover_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Chapters
CREATE TABLE chapters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES sources(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  order_index INTEGER,
  raw_text TEXT,
  processed_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Pages (immagini/PDF processati)
CREATE TABLE pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE,
  page_number INTEGER,
  image_url TEXT,
  extracted_text TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Flashcards
CREATE TABLE flashcards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chapter_id UUID REFERENCES chapters(id) ON DELETE CASCADE,
  front TEXT NOT NULL,
  back TEXT NOT NULL,
  ai_generated BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- FSRS Review Data
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flashcard_id UUID REFERENCES flashcards(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  difficulty REAL DEFAULT 0,
  stability REAL DEFAULT 0,
  retrievability REAL DEFAULT 1,
  next_review TIMESTAMPTZ,
  last_review TIMESTAMPTZ,
  reps INTEGER DEFAULT 0,
  lapses INTEGER DEFAULT 0,
  state TEXT DEFAULT 'new'
);

-- RLS Policies
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "Users see own profiles" ON profiles
  FOR ALL USING (auth.uid() = id);

CREATE POLICY "Users see own sources" ON sources
  FOR ALL USING (auth.uid() = user_id);

-- ... altre policies
```

**Verifica:** Tabelle visibili in Supabase Table Editor

#### Task 1.2.3: Setup Supabase client (frontend)
```bash
cd frontend && npm install @supabase/supabase-js
```

**File:** `frontend/lib/supabase.ts`

**Verifica:** Test connessione in console browser

---

### 1.3 Autenticazione

#### Task 1.3.1: Configurazione Auth Supabase
- Abilitare Email/Password
- Configurare redirect URLs
- Email templates in italiano

**Verifica:** Email di test arriva

#### Task 1.3.2: Pagina Login/Signup
**File:** `frontend/app/(auth)/login/page.tsx`

- Form email + password
- Link a signup
- Gestione errori

**Test:** Login con credenziali errate mostra errore

#### Task 1.3.3: Pagina Signup
**File:** `frontend/app/(auth)/signup/page.tsx`

- Form email + password + conferma password
- Validazione client-side
- Redirect a verifica email

**Test:** Signup crea utente in Supabase

#### Task 1.3.4: Auth Context e Protected Routes
**File:** `frontend/contexts/AuthContext.tsx`

- useAuth hook
- Middleware per route protette
- Redirect se non autenticato

**Test:** Accesso a /dashboard senza login → redirect a /login

---

### 1.4 Layout Base e Navigation

#### Task 1.4.1: Layout principale desktop
**File:** `frontend/app/(dashboard)/layout.tsx`

```
┌─────────┬──────────────────────────────┐
│ Sidebar │                              │
│         │         Content              │
│ • Home  │                              │
│ • Books │                              │
│ • Study │                              │
│ • Stats │                              │
└─────────┴──────────────────────────────┘
```

**Verifica:** Layout visibile su desktop

#### Task 1.4.2: Responsive per tablet
- Sidebar collassabile
- Menu hamburger
- Touch-friendly

**Verifica:** Layout corretto su iPad (DevTools)

#### Task 1.4.3: Tema e Design System
**File:** `frontend/app/globals.css`

- Colori primari
- Typography scale
- Spacing system
- Dark mode (opzionale MVP)

**Verifica:** Componenti usano design system

---

### 1.5 Deploy Pipeline

#### Task 1.5.1: Deploy frontend su Vercel
- Connettere repo GitHub
- Configurare env variables
- Domain temporaneo

**Verifica:** App live su vercel.app

#### Task 1.5.2: Deploy backend su Railway
- Dockerfile per FastAPI
- Env variables
- Health check endpoint

**Verifica:** `/health` risponde 200

#### Task 1.5.3: CI/CD con GitHub Actions
```yaml
# .github/workflows/ci.yml
- Lint frontend
- Lint backend
- Type check
- Tests
```

**Verifica:** PR trigger CI pipeline

---

## Fase 2: Document Processing (4-5 giorni)

### 2.1 Upload System

#### Task 2.1.1: API endpoint upload
**File:** `backend/routers/upload.py`

```python
@router.post("/upload/pdf")
async def upload_pdf(file: UploadFile, user_id: str):
    # Validazione file
    # Upload a Supabase Storage
    # Return URL
```

**Test:** Upload PDF → URL restituito

#### Task 2.1.2: Upload UI frontend
**File:** `frontend/components/upload/PDFUploader.tsx`

- Drag & drop zone
- Progress bar
- Preview file
- Error handling

**Test:** Drag PDF → upload inizia → progress visibile

#### Task 2.1.3: Supabase Storage bucket
- Bucket "documents" con policy
- Max size 50MB
- Tipi permessi: PDF, PNG, JPG

**Verifica:** Upload via dashboard funziona

---

### 2.2 Gemini Document Processing

#### Task 2.2.1: Setup Gemini API
**File:** `backend/services/gemini_service.py`

```python
import google.generativeai as genai

class GeminiService:
    def __init__(self):
        genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
        self.model = genai.GenerativeModel('gemini-1.5-flash')

    async def process_document(self, file_url: str) -> dict:
        # Download file
        # Send to Gemini
        # Extract text + structure
        pass
```

**Test:** PDF semplice → testo estratto correttamente

#### Task 2.2.2: Estrazione struttura documento
```python
async def extract_structure(self, text: str) -> dict:
    prompt = """
    Analizza questo testo di un libro/documento didattico.
    Estrai:
    - Titoli di capitoli/sezioni
    - Concetti chiave
    - Struttura gerarchica

    Restituisci JSON strutturato.
    """
    # ...
```

**Test:** Documento con capitoli → JSON con struttura

#### Task 2.2.3: Processing pipeline asincrono
**File:** `backend/services/document_processor.py`

1. Ricevi upload
2. Salva in storage
3. Avvia job processing
4. Gemini estrae testo
5. Salva in database
6. Notifica frontend (webhook/polling)

**Test:** Upload → status "processing" → status "completed"

#### Task 2.2.4: UI stato processing
**File:** `frontend/components/upload/ProcessingStatus.tsx`

- Spinner durante processing
- Progress steps
- Errore se fallisce
- Redirect a libreria quando completo

**Test:** Upload → spinner → redirect automatico

---

## Fase 3: Libreria UI (3-4 giorni)

### 3.1 Lista Sources

#### Task 3.1.1: API GET sources
**File:** `backend/routers/sources.py`

```python
@router.get("/sources")
async def get_sources(user_id: str):
    # Query Supabase
    # Return lista sources con count capitoli
```

**Test:** API restituisce sources dell'utente

#### Task 3.1.2: UI griglia libri
**File:** `frontend/app/(dashboard)/library/page.tsx`

- Card per ogni source
- Cover image o placeholder
- Titolo, autore
- Badge "X capitoli"
- Bottone "Aggiungi"

**Test:** Libri visualizzati in griglia responsive

#### Task 3.1.3: Empty state
- Illustrazione
- "Nessun libro ancora"
- CTA "Carica il tuo primo libro"

**Test:** Utente nuovo vede empty state

---

### 3.2 Dettaglio Source

#### Task 3.2.1: Pagina dettaglio libro
**File:** `frontend/app/(dashboard)/library/[sourceId]/page.tsx`

- Header con titolo, autore, cover
- Lista capitoli
- Stats (flashcard generate, etc.)
- Actions (elimina, modifica)

**Test:** Click su libro → pagina dettaglio

#### Task 3.2.2: Lista capitoli
- Accordion o lista
- Ogni capitolo mostra: titolo, n. pagine, n. flashcard
- Click → espande/dettaglio

**Test:** Capitoli visibili e cliccabili

#### Task 3.2.3: Aggiunta capitolo manuale
- Modal "Aggiungi capitolo"
- Nome capitolo
- Upload pagine (opzionale)

**Test:** Nuovo capitolo appare in lista

---

## Fase 4: Flashcard Engine (5-6 giorni)

### 4.1 Generazione con Claude

#### Task 4.1.1: Setup Claude API
**File:** `backend/services/claude_service.py`

```python
import anthropic

class ClaudeService:
    def __init__(self):
        self.client = anthropic.Anthropic()

    async def generate_flashcards(
        self,
        text: str,
        num_cards: int = 10,
        language: str = "it"
    ) -> list[dict]:
        prompt = f"""
        Sei un esperto educatore. Genera {num_cards} flashcard
        dal seguente testo per aiutare uno studente a memorizzare
        i concetti chiave.

        Ogni flashcard deve avere:
        - front: domanda chiara e specifica
        - back: risposta concisa ma completa

        Lingua: {"Italiano" if language == "it" else "English"}

        Testo:
        {text}

        Restituisci un array JSON di flashcard.
        """
        # ...
```

**Test:** Testo semplice → flashcard JSON valido

#### Task 4.1.2: API endpoint generazione
**File:** `backend/routers/flashcards.py`

```python
@router.post("/chapters/{chapter_id}/generate-flashcards")
async def generate_flashcards(
    chapter_id: str,
    num_cards: int = 10,
    user_id: str = Depends(get_current_user)
):
    # Get chapter text
    # Call Claude
    # Save flashcards
    # Return flashcards
```

**Test:** POST genera e salva flashcard

#### Task 4.1.3: UI generazione flashcard
**File:** `frontend/components/flashcards/GenerateButton.tsx`

- Bottone "Genera Flashcard"
- Slider numero cards (5-20)
- Loading state
- Preview risultato

**Test:** Click → loading → flashcard generate visibili

#### Task 4.1.4: Review/Edit flashcard generate
- Lista flashcard generate
- Edit inline (front/back)
- Delete singola
- "Salva tutte" / "Rigenera"

**Test:** Edit flashcard → salvataggio → valore aggiornato

---

### 4.2 FSRS Integration

#### Task 4.2.1: Installazione py-fsrs
```bash
cd backend && pip install fsrs
```

**File:** `backend/services/fsrs_service.py`

```python
from fsrs import FSRS, Card, Rating

class FSRSService:
    def __init__(self):
        self.fsrs = FSRS()

    def schedule_card(
        self,
        card_data: dict,
        rating: Rating
    ) -> dict:
        card = Card.from_dict(card_data)
        card, review_log = self.fsrs.review_card(card, rating)
        return card.to_dict()
```

**Test:** Card + rating → next_review calcolato

#### Task 4.2.2: API review flashcard
```python
@router.post("/flashcards/{flashcard_id}/review")
async def review_flashcard(
    flashcard_id: str,
    rating: int,  # 1-4 (Again, Hard, Good, Easy)
    user_id: str
):
    # Get current card state
    # Apply FSRS
    # Update database
    # Return next review date
```

**Test:** Review con rating → next_review aggiornato

#### Task 4.2.3: Query cards da ripassare
```python
@router.get("/flashcards/due")
async def get_due_flashcards(user_id: str):
    # Query cards where next_review <= now()
    # Order by priority
    # Limit
```

**Test:** Cards con next_review passato ritornate

---

## Fase 5: Studio Session (4-5 giorni)

### 5.1 UI Sessione Studio

#### Task 5.1.1: Pagina studio
**File:** `frontend/app/(dashboard)/study/page.tsx`

- Selezione fonte/capitolo (o "Tutte le cards due")
- Bottone "Inizia sessione"
- Stats preview (cards da fare)

**Test:** Pagina carica con opzioni

#### Task 5.1.2: Componente Flashcard
**File:** `frontend/components/study/FlashcardView.tsx`

- Card flip animation
- Front → Click → Back
- Responsive (touch su tablet)

**Test:** Click su card → flip animation

#### Task 5.1.3: Rating buttons
- 4 bottoni: "Non lo so", "Difficile", "Bene", "Perfetto"
- Keyboard shortcuts (1-4)
- Visual feedback

**Test:** Click rating → prossima card

#### Task 5.1.4: Progress e Stats sessione
- Progress bar (X/Y cards)
- Timer sessione
- Accuracy corrente

**Test:** Progresso visibile durante sessione

#### Task 5.1.5: Schermata fine sessione
- Riepilogo: cards studiate, accuracy
- "Prossimo ripasso: X cards domani"
- Bottoni: "Continua" / "Fine"

**Test:** Ultima card → schermata riepilogo

---

### 5.2 Dashboard Stats

#### Task 5.2.1: API statistiche utente
```python
@router.get("/stats")
async def get_user_stats(user_id: str):
    return {
        "total_cards": ...,
        "cards_due_today": ...,
        "streak_days": ...,
        "cards_reviewed_today": ...,
        "accuracy_7_days": ...
    }
```

**Test:** API restituisce stats corrette

#### Task 5.2.2: Dashboard widget
- Cards da fare oggi
- Streak
- Grafico attività (ultimi 7 giorni)

**Test:** Widget mostrano dati corretti

---

## Fase 6: Onboarding (2-3 giorni)

### 6.1 Tutorial Interattivo

#### Task 6.1.1: Onboarding flow state
**File:** `frontend/contexts/OnboardingContext.tsx`

- Steps: welcome, upload, generate, study, complete
- Progress tracking
- Skip non permesso (obbligatorio)

**Test:** Utente nuovo → onboarding automatico

#### Task 6.1.2: Step 1 - Welcome
- Spiegazione app
- Benefici
- "Iniziamo!" button

**Test:** Bottone → step 2

#### Task 6.1.3: Step 2 - Upload pratico
- Istruzioni
- Upload area attiva
- Utente DEVE caricare qualcosa
- PDF di esempio disponibile

**Test:** Upload completato → step 3

#### Task 6.1.4: Step 3 - Genera flashcard
- Mostra documento caricato
- "Genera le tue prime flashcard"
- Utente DEVE generare

**Test:** Generazione completata → step 4

#### Task 6.1.5: Step 4 - Prima sessione
- Mostra flashcard generate
- "Prova a studiare"
- Minimo 3 cards

**Test:** 3 cards reviewate → step 5

#### Task 6.1.6: Step 5 - Completamento
- Congratulazioni!
- Recap funzionalità
- "Vai alla dashboard"
- Flag onboarding_completed = true

**Test:** Utente non vede più onboarding

---

## Fase 7: Mobile Companion (3-4 giorni)

### 7.1 PWA Scanner

#### Task 7.1.1: Setup PWA separata
**File:** `mobile/` - Nuovo progetto Next.js minimal

- Solo funzionalità scanner
- Auth condivisa (stesso Supabase)
- UI minimal

**Verifica:** PWA installabile su smartphone

#### Task 7.1.2: QR Code pairing
- Desktop genera QR con session token
- Mobile scansiona QR
- Link stabilito

**Test:** QR scan → dispositivi collegati

#### Task 7.1.3: Camera scanner UI
- Accesso camera
- Guida inquadratura
- Scatto foto
- Preview + conferma/riprova

**Test:** Foto scattata → preview visibile

#### Task 7.1.4: Upload e sync
- Foto → Supabase Storage
- Notifica real-time a desktop
- Desktop mostra "Nuova pagina ricevuta"

**Test:** Foto mobile → appare su desktop

#### Task 7.1.5: Batch scan mode
- Modalità "scansiona più pagine"
- Counter pagine
- "Fine scansione"
- Upload batch

**Test:** 5 pagine scattate → tutte caricate

---

## Fase 8: i18n + Offline (2-3 giorni)

### 8.1 Internazionalizzazione

#### Task 8.1.1: Setup next-intl
```bash
cd frontend && npm install next-intl
```

**File:** `frontend/i18n/` - Configurazione

**Test:** Cambio lingua funziona

#### Task 8.1.2: Traduzioni IT/EN
**Files:**
- `frontend/messages/it.json`
- `frontend/messages/en.json`

**Test:** Tutte le stringhe tradotte

#### Task 8.1.3: Language selector
- Dropdown in header
- Persiste in localStorage + DB

**Test:** Selezione lingua → UI cambia

---

### 8.2 Offline Support

#### Task 8.2.1: Service Worker setup
**File:** `frontend/public/sw.js`

- Cache static assets
- Cache API responses (flashcards)

**Test:** Refresh offline → app carica

#### Task 8.2.2: IndexedDB per flashcards
- Sync flashcards localmente
- Queue reviews offline
- Sync quando online

**Test:** Studio offline → sync quando torna online

#### Task 8.2.3: Offline indicator
- Banner "Sei offline"
- Funzionalità limitate chiare

**Test:** Disconnect → banner visibile

---

## Fase 9: Polish (3-4 giorni)

### 9.1 Bug Fixing

- Testing manuale completo
- Fix bug critici
- Performance optimization

### 9.2 UX Improvements

- Loading states ovunque
- Error boundaries
- Toast notifications
- Keyboard shortcuts

### 9.3 Accessibility

- ARIA labels
- Focus management
- Screen reader testing

### 9.4 Final Testing

- Cross-browser (Chrome, Safari, Firefox)
- Cross-device (Desktop, iPad, Android tablet)
- Mobile companion su iOS e Android

---

## Checklist Pre-Launch

- [ ] Auth funziona (signup, login, logout, reset password)
- [ ] Upload PDF funziona
- [ ] Gemini processa documenti
- [ ] Claude genera flashcard di qualità
- [ ] FSRS schedula correttamente
- [ ] Sessione studio completa
- [ ] Onboarding obbligatorio funziona
- [ ] Mobile scanner funziona
- [ ] IT + EN completo
- [ ] Offline mode funziona
- [ ] Performance accettabile
- [ ] Nessun bug critico

---

*Piano generato seguendo la metodologia Superpowers*
*Ogni task segue il ciclo RED-GREEN-REFACTOR*
