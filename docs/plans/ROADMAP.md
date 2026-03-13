# Studio App - Roadmap Completa

> Documento vivente che guida lo sviluppo di Studio, l'app AI-powered per lo studio intelligente.
> **Ultimo aggiornamento**: 13 Marzo 2026

---

## Visione

**Studio** trasforma qualsiasi materiale di studio in strumenti di apprendimento attivo. Dall'upload di un PDF alla padronanza completa dell'argomento, accompagniamo studenti e professionisti in ogni fase del percorso.

**Principio guida**: Qualità impeccabile su ogni feature. Meglio meno funzionalità perfette che tante mediocri.

---

## Stato Attuale

### Completato
- [x] Autenticazione utenti (Supabase Auth)
- [x] Upload PDF e note testuali
- [x] Elaborazione documenti con AI (Gemini)
- [x] Generazione flashcard con difficoltà selezionabile (Facile/Media/Difficile)
- [x] Raggruppamento flashcard per batch di generazione
- [x] FSRS (Free Spaced Repetition Scheduler)
- [x] Sessione studio flashcard con rating
- [x] Generazione quiz misti (scelta multipla, vero/falso, risposta aperta)
- [x] Valutazione AI per risposte aperte
- [x] Design system "Aurora Flow" (dark theme, glassmorphism)
- [x] Sidebar navigation
- [x] Pagina Study con accordion per difficoltà

### In Sviluppo (Sprint Corrente)
- [ ] **Riassunti AI** - Generazione riassunti per capitolo con lunghezza configurabile

### Limitazioni Attuali
- Solo PDF e note supportati (no audio/video)
- Statistiche base
- Mobile experience da migliorare

---

## Fasi di Sviluppo

---

### FASE 1: Fondamenta Solide
**Durata stimata**: 2 settimane
**Priorità**: Critica
**Obiettivo**: Creare una base UX solida su cui costruire tutto il resto

#### 1.1 Navigazione e Architettura

**Problema da risolvere**
L'utente si perde nell'app. Non c'è una struttura chiara, non sa dove trovare le cose, non capisce dove si trova.

**Soluzione**
Implementare una sidebar persistente con navigazione chiara e breadcrumb per il contesto.

**Struttura proposta**

```
┌────────────────────────────────────────────────┐
│  Studio                        🔍  👤  ⚙️     │
├──────────┬─────────────────────────────────────┤
│          │                                     │
│ 📚 STUDIA│  Studia > Economia > Capitolo 1    │
│  └ Fonti │                                     │
│          │  ┌─────────────────────────────┐   │
│ 🎙️ AUDIO │  │                             │   │
│  └ Regist│  │   Area contenuto principale │   │
│          │  │                             │   │
│ 📊 STATS │  └─────────────────────────────┘   │
│          │                                     │
│ ⚡ QUICK │                                     │
│          │                                     │
│ 💬 FEEDBK│                                     │
└──────────┴─────────────────────────────────────┘
```

**Deliverable**
- Componente Sidebar riutilizzabile
- Sistema breadcrumb
- Layout persistente tra pagine
- Responsive: sidebar diventa bottom nav su mobile

---

#### 1.2 Ricerca Globale

**Problema da risolvere**
Con molti contenuti, l'utente non trova quello che cerca. Deve navigare manualmente in ogni cartella.

**Soluzione**
Barra di ricerca globale che cerca in tutto: fonti, capitoli, flashcard, quiz.

**Funzionalità**
- Ricerca full-text nel contenuto elaborato
- Filtri per tipo (fonte, flashcard, quiz)
- Risultati raggruppati per categoria
- Scorciatoia tastiera (Cmd/Ctrl + K)
- Ricerche recenti salvate

---

#### 1.3 Sessione Studio Migliorata

**Problema da risolvere**
L'utente studia senza obiettivi, non vede i progressi durante la sessione, non sa quando fermarsi.

**Soluzione**
Aggiungere goal di sessione e visualizzazione progresso.

**Funzionalità**
- Selezione obiettivo all'inizio:
  - "Completa tutte le card in scadenza"
  - "Studia per X minuti"
  - "Ripassa X card"
- Barra progresso durante sessione
- Timer visibile (se scelto tempo)
- Riepilogo a fine sessione

---

#### 1.4 Sistema Feedback Utenti

**Problema da risolvere**
Non sappiamo cosa funziona e cosa no. Gli utenti non hanno modo di comunicare problemi o suggerimenti.

**Soluzione**
Sistema di feedback strutturato con categorizzazione intelligente.

**Categorie feedback**
1. **Bug Report** - Qualcosa non funziona
   - Descrizione problema
   - Passi per riprodurre
   - Screenshot automatico (opzionale)
   - Info sistema (browser, device)

2. **Feature Request** - Vorrei che l'app facesse...
   - Descrizione funzionalità
   - Caso d'uso
   - Priorità percepita (nice-to-have vs essenziale)

3. **Miglioramento UX** - Questo potrebbe essere più facile
   - Area dell'app interessata
   - Problema attuale
   - Suggerimento

4. **Contenuto/AI** - La generazione non è accurata
   - Tipo contenuto (flashcard, quiz, riassunto)
   - Esempio specifico
   - Cosa ti aspettavi

**UI proposta**

```
┌─────────────────────────────────────┐
│  💬 Invia Feedback                  │
├─────────────────────────────────────┤
│                                     │
│  Che tipo di feedback vuoi dare?    │
│                                     │
│  ┌─────────┐  ┌─────────┐          │
│  │ 🐛 Bug  │  │ 💡 Idea │          │
│  └─────────┘  └─────────┘          │
│  ┌─────────┐  ┌─────────┐          │
│  │ 🎨 UX   │  │ 🤖 AI   │          │
│  └─────────┘  └─────────┘          │
│                                     │
│  [Avanti →]                         │
└─────────────────────────────────────┘
```

**Database**
- Tabella `feedback` con: id, user_id, type, category, title, description, metadata (JSONB), status, created_at

**Admin view** (futura)
- Dashboard feedback raggruppati
- Filtri per tipo/stato
- Trend tematici

---

#### 1.5 Gestione Errori Robusta

**Problema da risolvere**
Quando qualcosa fallisce, l'utente vede errori criptici o peggio, niente. Non sa cosa fare.

**Soluzione**
Sistema di error handling consistente con messaggi utili e azioni di recovery.

**Principi**
- Ogni errore ha un messaggio comprensibile
- Suggerimento su cosa fare
- Pulsante "Riprova" dove appropriato
- Log errori per debugging (non visibili all'utente)
- Fallback graceful quando possibile

---

### FASE 2: Strumenti di Studio Avanzati
**Durata stimata**: 2 settimane
**Priorità**: Alta
**Obiettivo**: Completare il toolkit di studio con riassunti e mappe concettuali

#### 2.1 Riassunti Multi-Livello

**Descrizione**
Generare riassunti del materiale a diversi livelli di dettaglio, permettendo all'utente di scegliere quanto approfondire.

**Livelli disponibili**
1. **Tweet** (max 280 caratteri) - L'essenza in una frase
2. **Abstract** (1 paragrafo) - I punti chiave
3. **Riassunto** (1 pagina) - Copertura completa ma sintetica
4. **Dettagliato** - Tutto il contenuto riorganizzato

**Funzionalità chiave**
- Citazioni inline che linkano al testo originale
- Evidenziazione concetti chiave
- Export in PDF/DOCX
- Confronto side-by-side con originale

**Schema database**
- Tabella `summaries` con campi: id, chapter_id, user_id, level, content, created_at

---

#### 2.2 Mappe Concettuali Interattive

**Descrizione**
Visualizzazione grafica delle relazioni tra concetti estratti dal materiale.

**Funzionalità**
- Generazione automatica da AI
- Canvas interattivo (zoom, pan, search)
- Click su nodo per vedere definizione e fonte
- Modalità editing per modifiche manuali
- Layout multipli (gerarchico, radiale, forza)
- Export PNG/PDF/SVG

**Tecnologie suggerite**
- React Flow o D3.js per il canvas
- dagre per layout automatico

**Schema database**
- Tabella `concept_maps` con campi: id, chapter_id, user_id, nodes (JSONB), edges (JSONB), layout, created_at

---

#### 2.3 Modal Generazione Avanzato

**Descrizione**
Prima di generare qualsiasi strumento, l'utente può personalizzare i parametri.

**Opzioni universali**
- Sorgente: singolo capitolo, multipli, intero libro
- Argomenti specifici (se rilevabili)
- Quantità (dove applicabile)
- Difficoltà: facile, media, difficile
- Lingua

**Opzioni specifiche per tipo**
- Flashcard: tipo (definizioni, concetti, applicazioni)
- Quiz: distribuzione tipi domanda, timer
- Riassunto: livello dettaglio
- Mappa: layout preferito, profondità

**Preview**
- Mostrare anteprima prima di confermare
- Possibilità di rigenerare singoli elementi
- Editing inline

---

#### 2.4 Editing Contenuti Generati

**Descrizione**
Permettere modifica di flashcard, domande quiz, e altri contenuti generati.

**Funzionalità**
- Edit inline per testi brevi
- Modal editor per contenuti lunghi
- Elimina singolo elemento
- Rigenera singolo elemento con AI
- Storico modifiche (undo)

---

### FASE 3: Analytics e Gamification
**Durata stimata**: 2 settimane
**Priorità**: Media-Alta
**Obiettivo**: Motivare l'utente e dargli visibilità sui progressi

#### 3.1 Dashboard Statistiche

**Metriche da tracciare**

*Attività*
- Card studiate oggi/settimana/mese
- Quiz completati
- Tempo totale di studio
- Sessioni completate

*Performance*
- Retention rate per materia
- Accuratezza quiz nel tempo
- Aree di forza e debolezza
- Previsione padronanza

*Visualizzazioni*
- Grafico attività (stile GitHub contributions)
- Trend performance nel tempo
- Distribuzione tempo per materia
- Heatmap orari studio

---

#### 3.2 Sistema Gamification

**Elementi motivazionali**

*Streak*
- Giorni consecutivi di studio
- Notifica a rischio perdita streak
- Recovery con "streak freeze" (limitati)

*XP e Livelli*
- XP per card completata, quiz finito, etc.
- Livelli con soglie crescenti
- Badge per traguardi

*Achievement*
- "Prima settimana completata"
- "100 card padroneggiate"
- "Quiz perfetto"
- "Streak di 30 giorni"

**Principi**
- Mai punitivo, sempre incoraggiante
- Opzionale/disattivabile
- Focus su consistenza, non intensità

---

#### 3.3 Review Errori Strutturata

**Descrizione**
Dopo un quiz, guida l'utente attraverso gli errori per consolidare l'apprendimento.

**Flusso**
1. Riepilogo quiz con evidenza errori
2. Per ogni errore:
   - Mostra domanda e risposta data
   - Mostra risposta corretta con spiegazione
   - Link al materiale originale
   - Opzione "Converti in flashcard"
3. Quiz di recupero solo sugli errori
4. Tracking errori ricorrenti nel tempo

---

### FASE 4: Infografiche e Presentazioni
**Durata stimata**: 2 settimane
**Priorità**: Media
**Obiettivo**: Strumenti per comunicare e visualizzare la conoscenza

#### 4.1 Generazione Infografiche

**Template disponibili**
- Timeline (eventi cronologici)
- Comparison (confronto A vs B)
- Process (step sequenziali)
- Statistics (dati numerici)
- Hierarchy (struttura organizzativa)
- Cycle (processi ciclici)

**Personalizzazione**
- Palette colori predefinite + custom
- Font selection
- Dimensione (social, A4, poster)
- Icone e immagini

**Export**
- PNG (web/social)
- PDF (stampa)
- SVG (editing esterno)

---

#### 4.2 Generazione Presentazioni

**Input richiesto**
- Sorgente contenuto
- Durata target (5/10/15/20 min)
- Stile (professionale, accademico, creativo)
- Pubblico target

**Output generato**
- Slide con struttura ottimale
- 1 concetto principale per slide
- Bullet points concisi
- Suggerimenti per immagini/grafici
- Speaker notes per ogni slide
- Timing suggerito

**Export**
- PDF
- PPTX (PowerPoint/Keynote)
- Google Slides (via API)

---

### FASE 5: Registrazioni Audio
**Durata stimata**: 3 settimane
**Priorità**: Media
**Obiettivo**: Catturare conoscenza da lezioni e meeting

#### 5.1 Upload e Trascrizione

**Formati supportati**
- Audio: MP3, WAV, M4A, OGG
- Video: MP4, MOV, WEBM (estrazione audio)

**Processing**
- Trascrizione con Whisper (via OpenRouter o API dedicata)
- Identificazione speaker (diarization)
- Rilevamento lingua automatico
- Punteggiatura e formattazione AI

**Chunking per file lunghi**
- Elaborazione in segmenti
- Progress tracking granulare
- Merge risultati trasparente

---

#### 5.2 Navigazione Intelligente

**Funzionalità**
- Player audio con trascrizione sincronizzata
- Click su testo → salta a quel punto
- Highlight automatico durante riproduzione
- Capitoli/sezioni auto-generati da AI
- Ricerca nel testo con jump al timestamp
- Filtro per speaker

**Annotazioni**
- Note timestamped
- Bookmark momenti importanti
- Tag per categorizzare sezioni

---

#### 5.3 Generazione da Audio

**Strumenti disponibili**
Tutti gli strumenti esistenti funzionano anche su trascrizioni:
- Flashcard dai concetti chiave
- Quiz sulla lezione
- Riassunto della registrazione
- Mappa concettuale
- Action items (per meeting)

---

### FASE 6: Polish e Scaling
**Durata stimata**: 2 settimane
**Priorità**: Pre-lancio
**Obiettivo**: Esperienza impeccabile e pronta per utenti reali

#### 6.1 Onboarding

**Flusso primo accesso**
1. Welcome screen con value proposition
2. "Cosa vuoi studiare?" (università/lavoro/personale)
3. Upload primo documento guidato
4. Tour interattivo delle feature principali
5. Generazione automatica primo set flashcard
6. Prima sessione studio guidata

**Empty states**
- Ogni sezione vuota spiega cosa fare
- Suggerimenti contestuali
- Link a tutorial/help

---

#### 6.2 PWA e Offline

**Funzionalità offline**
- Studio flashcard scaricate
- Quiz già generati
- Visualizzazione contenuti cached
- Sync automatica al ritorno online

**PWA features**
- Installabile su mobile
- Push notifications (streak reminder, cards due)
- Splash screen branded

---

#### 6.3 Accessibilità

**Requisiti WCAG AA**
- Contrasto colori sufficiente
- Navigazione completa da tastiera
- Screen reader compatibility
- Focus states visibili
- Testi alternativi per immagini
- Reduced motion option

**Personalizzazione**
- Dimensione font regolabile
- Tema chiaro/scuro
- Density layout

---

#### 6.4 Performance

**Obiettivi**
- First Contentful Paint < 1.5s
- Time to Interactive < 3s
- Lighthouse score > 90

**Ottimizzazioni**
- Code splitting per route
- Image optimization
- API response caching
- Lazy loading contenuti
- Prefetch intelligente

---

## Principi di Sviluppo

### Qualità del Codice

**Testing**
- Unit test per logica business
- Integration test per API
- E2E test per flussi critici
- Coverage minimo 80%

**Code Review**
- Ogni PR richiede review
- Checklist: funzionalità, performance, accessibilità, sicurezza

**Documentation**
- JSDoc per funzioni pubbliche
- README aggiornato per ogni modulo
- Storybook per componenti UI

---

### Design System

**Componenti base**
- Button (primary, secondary, ghost, danger)
- Input (text, textarea, select, checkbox, radio)
- Card (standard, interactive, highlight)
- Modal (standard, confirmation, form)
- Toast (success, error, warning, info)
- Loading states (skeleton, spinner, progress)

**Tokens**
- Colori: palette slate + accent colors
- Spacing: scala 4px
- Typography: font sizes, weights, line heights
- Border radius: small, medium, large
- Shadows: sm, md, lg, xl

---

### Architettura

**Frontend**
- Next.js 14 App Router
- React Server Components dove possibile
- Client components per interattività
- Zustand per state management (se necessario)

**Backend**
- API Routes Next.js per operazioni semplici
- FastAPI Python per elaborazioni pesanti
- Queue system per job asincroni (future)

**Database**
- Supabase PostgreSQL
- Row Level Security per ogni tabella
- Indici ottimizzati per query frequenti

**AI**
- OpenRouter come gateway principale
- Fallback su provider alternativi
- Prompt versioning e testing

---

## Metriche di Successo

### Engagement
- DAU/MAU ratio > 40%
- Sessioni studio per utente/settimana > 3
- Retention D7 > 50%
- Retention D30 > 30%

### Learning
- Completion rate flashcard session > 80%
- Quiz score improvement over time
- Content generated per user > 100 cards

### Satisfaction
- NPS > 50
- App store rating > 4.5
- Support ticket ratio < 5%

---

## Timeline Visiva

```
MESE 1                    MESE 2                    MESE 3
├─────────────────────────┼─────────────────────────┼─────────────────────┤
│                         │                         │                     │
│  FASE 1: Fondamenta     │  FASE 3: Analytics      │  FASE 5: Audio      │
│  ████████████           │  ████████████           │  ██████████████████ │
│                         │                         │                     │
│  FASE 2: Strumenti      │  FASE 4: Infografiche   │  FASE 6: Polish     │
│        ████████████████ │  ████████████           │            ████████ │
│                         │                         │                     │
└─────────────────────────┴─────────────────────────┴─────────────────────┘
```

---

## Note Finali

Questa roadmap è un documento vivente. Verrà aggiornata in base a:
- Feedback utenti reali
- Metriche di utilizzo
- Cambiamenti tecnologici
- Risorse disponibili

**Prossimo step**: Iniziare con FASE 1.1 (Navigazione e Architettura), creando il design document dettagliato.

---

*Ultimo aggiornamento: Marzo 2026*
