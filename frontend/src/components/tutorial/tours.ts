// ─── Tour Step Definitions ───────────────────────────────────────────────────
// Each tour is a sequence of steps that guide the user through a feature.
// Steps target elements via `data-tutorial="stepId"` attributes.

export interface TourStep {
  id: string;
  target: string; // data-tutorial attribute value
  title: string;
  description: string;
  placement: "top" | "bottom" | "left" | "right";
  icon?: string;
}

export interface Tour {
  id: string;
  name: string;
  description: string;
  steps: TourStep[];
  triggerPath?: RegExp; // auto-start on matching pathname
}

// ─── Dashboard Tour ──────────────────────────────────────────────────────────

export const dashboardTour: Tour = {
  id: "dashboard",
  name: "Benvenuto in Studio!",
  description: "Scopri come usare la tua dashboard",
  triggerPath: /^\/dashboard\/?$/,
  steps: [
    {
      id: "dashboard-welcome",
      target: "dashboard-add",
      title: "Inizia caricando un libro",
      description:
        "Benvenuto! Il primo passo e caricare un PDF o un libro. Clicca qui, seleziona il file e l'AI lo elaborera automaticamente: estrarra il testo, lo dividera in capitoli e generera i riassunti.",
      placement: "bottom",
      icon: "📤",
    },
    {
      id: "sidebar-library",
      target: "sidebar-library",
      title: "La tua Libreria",
      description:
        "Dopo il caricamento, il libro appare qui. Clicca sulla freccia per espandere e vedere tutti i capitoli con le relative funzionalita: Flashcard, Quiz, Riassunti, Mappa, Slides e Infografica.",
      placement: "right",
      icon: "📚",
    },
    {
      id: "sidebar-study",
      target: "sidebar-study",
      title: "Studia Ora",
      description:
        "Il tuo centro di studio completo. Qui trovi tutti gli strumenti organizzati per libro: flashcard da ripassare, quiz per verificarti, riassunti, mappe concettuali, presentazioni e l'AI Guida con risorse suggerite.",
      placement: "right",
      icon: "🎯",
    },
    {
      id: "sidebar-chat",
      target: "sidebar-chat",
      title: "AI Buddy - Il tuo assistente",
      description:
        "Apri la chat AI per chiedere qualsiasi cosa! Se sei sulla pagina di un libro, il Buddy avra accesso al suo contenuto e rispondera in modo specifico. Puoi anche attivare la ricerca web per informazioni aggiornate.",
      placement: "right",
      icon: "💬",
    },
    {
      id: "header-chat",
      target: "header-chat",
      title: "Anche da qui!",
      description:
        "Puoi aprire l'AI Buddy anche da questo pulsante in alto a destra. La chat resta aperta mentre navighi tra le pagine.",
      placement: "bottom",
      icon: "💬",
    },
  ],
};

// ─── Source Page Tour ────────────────────────────────────────────────────────

export const sourceTour: Tour = {
  id: "source",
  name: "Gestisci il tuo libro",
  description: "Scopri tutti gli strumenti AI disponibili",
  triggerPath: /^\/dashboard\/source\/[^/]+\/?$/,
  steps: [
    {
      id: "source-tools",
      target: "source-tools",
      title: "Strumenti AI",
      description:
        "Da qui accedi a tutti gli strumenti AI del libro:\n- Riassunti: genera sintesi complete di ogni capitolo\n- Flashcard: crea carte per la memorizzazione\n- Mappa: visualizza i concetti e le loro relazioni\n- Slides: genera presentazioni pronte da usare\n- Infografica: crea un poster visuale dei concetti chiave",
      placement: "bottom",
      icon: "🧠",
    },
    {
      id: "source-chapters",
      target: "source-chapters",
      title: "I tuoi Capitoli",
      description:
        "Ogni capitolo ha i suoi strumenti dedicati. Il badge verde indica che il capitolo e stato elaborato con successo. Il numero di flashcard create e visibile accanto a ogni capitolo.",
      placement: "top",
      icon: "📖",
    },
    {
      id: "source-chapter-actions",
      target: "source-chapter-actions",
      title: "Azioni per Capitolo",
      description:
        "Per ogni capitolo puoi:\n- Leggi: visualizza il testo completo estratto dal PDF\n- Riassunti: genera un riassunto AI della lunghezza che preferisci\n- Flashcard: crea carte studio con difficolta personalizzata\n- Quiz: genera quiz con domande a scelta multipla e vero/falso",
      placement: "bottom",
      icon: "⚡",
    },
  ],
};

// ─── Summaries Tour ──────────────────────────────────────────────────────────

export const summariesTour: Tour = {
  id: "summaries",
  name: "Riassunti AI",
  description: "Come generare e usare i riassunti",
  triggerPath: /\/summaries\/?$/,
  steps: [
    {
      id: "summaries-segmented",
      target: "summaries-segmented",
      title: "Due modalita di visualizzazione",
      description:
        '"Libro Intero" combina tutti i riassunti in un unico documento completo. "Per Capitoli" mostra ogni riassunto separatamente. Entrambi possono essere scaricati come PDF.',
      placement: "bottom",
      icon: "📑",
    },
    {
      id: "summaries-generate",
      target: "summaries-generate",
      title: "Genera e personalizza",
      description:
        "Clicca per generare un riassunto AI. Puoi scegliere:\n- Lunghezza: breve, medio o dettagliato\n- Numero di parole target\n- Include immagini AI per i concetti piu complessi\n\nIl PDF finale sara formattato con formule matematiche renderizzate.",
      placement: "left",
      icon: "✨",
    },
  ],
};

// ─── Flashcards Tour ─────────────────────────────────────────────────────────

export const flashcardsTour: Tour = {
  id: "flashcards",
  name: "Flashcard Intelligenti",
  description: "Come creare e studiare le flashcard",
  triggerPath: /\/flashcards\/?$/,
  steps: [
    {
      id: "flashcards-generate",
      target: "flashcards-generate",
      title: "Genera Flashcard",
      description:
        "Scegli un capitolo o l'intero libro. Puoi generare:\n- N flashcard per ogni capitolo (es. 10 x 8 capitoli = 80 carte)\n- N flashcard totali distribuite tra i capitoli\n\nScegli la difficolta: Facile, Media o Difficile.",
      placement: "bottom",
      icon: "🃏",
    },
    {
      id: "flashcards-study",
      target: "flashcards-study",
      title: "Come studiare efficacemente",
      description:
        'Le flashcard usano la ripetizione spaziata (FSRS): il sistema calcola quando e il momento ottimale per ripassare ogni carta. Vai su "Studia Ora" per iniziare il ripasso. Dopo aver visto la risposta, valuta da 1 a 4 quanto bene la ricordavi.',
      placement: "bottom",
      icon: "🧠",
    },
  ],
};

// ─── Mindmap Tour ────────────────────────────────────────────────────────────

export const mindmapTour: Tour = {
  id: "mindmap",
  name: "Mappa Concettuale",
  description: "Come usare la mappa interattiva",
  triggerPath: /\/mindmap\/?$/,
  steps: [
    {
      id: "mindmap-generate",
      target: "mindmap-generate",
      title: "Genera la Mappa",
      description:
        "L'AI analizza il contenuto e crea una mappa concettuale interattiva con 40-60 nodi su 3-4 livelli di profondita. Puoi generarla per l'intero libro o per un singolo capitolo.",
      placement: "bottom",
      icon: "🗺️",
    },
    {
      id: "mindmap-interact",
      target: "mindmap-interact",
      title: "Naviga la Mappa",
      description:
        "Interagisci con la mappa:\n- Clicca su un nodo per espandere/chiudere le diramazioni\n- Clicca il nodo centrale per aprire/chiudere tutto\n- Usa scroll per zoomare, drag per spostarti\n- Esporta come PNG per stamparla o condividerla",
      placement: "top",
      icon: "🖱️",
    },
  ],
};

// ─── Slides Tour ─────────────────────────────────────────────────────────────

export const slidesTour: Tour = {
  id: "slides",
  name: "Presentazioni AI",
  description: "Come creare presentazioni",
  triggerPath: /\/slides\/?$/,
  steps: [
    {
      id: "slides-generate",
      target: "slides-generate",
      title: "Genera Presentazione",
      description:
        "L'AI crea 15-25 slide professionali con diversi tipi:\n- Definizioni dei concetti chiave\n- Formule matematiche renderizzate\n- Confronti tra concetti\n- Timeline e processi\n- Riassunto finale con i punti chiave",
      placement: "bottom",
      icon: "🎯",
    },
    {
      id: "slides-navigate",
      target: "slides-navigate",
      title: "Presentazione interattiva",
      description:
        "Naviga con le frecce o i tasti tastiera (sinistra/destra). Clicca una slide nella lista laterale per saltare direttamente. Usa il fullscreen per presentare e 'Esporta PDF' per scaricare.",
      placement: "top",
      icon: "⌨️",
    },
  ],
};

// ─── Infographics Tour ──────────────────────────────────────────────────────

export const infographicsTour: Tour = {
  id: "infographics",
  name: "Infografiche AI",
  description: "Come creare infografiche visuali",
  triggerPath: /\/infographics\/?$/,
  steps: [
    {
      id: "infographics-generate",
      target: "infographics-generate",
      title: "Genera Infografica",
      description:
        "L'AI genera un'immagine infografica professionale che riassume visivamente tutti i concetti, le formule e le relazioni del tuo materiale. Perfetta da stampare o usare come poster di ripasso!",
      placement: "bottom",
      icon: "📊",
    },
  ],
};

// ─── Study Session Tour ──────────────────────────────────────────────────────

export const studyTour: Tour = {
  id: "study",
  name: "Centro di Studio",
  description: "Come funziona Studia Ora",
  triggerPath: /^\/dashboard\/study\/?$/,
  steps: [
    {
      id: "study-coach",
      target: "study-coach",
      title: "Il tuo Coach AI",
      description:
        "Il Coach analizza i tuoi progressi e ti suggerisce cosa studiare oggi. Si basa su: carte flashcard in difficolta, risultati dei quiz e feedback sui riassunti. Segui i suoi consigli per studiare nel modo piu efficace!",
      placement: "bottom",
      icon: "🧠",
    },
    {
      id: "study-due",
      target: "study-due",
      title: "I tuoi Strumenti",
      description:
        "Scegli lo strumento che preferisci: Flashcard per memorizzare, Quiz per verificarti, Riassunti per ripassare, Mappe per visualizzare le connessioni, Slides per le presentazioni, Infografiche per i poster e AI Guida per risorse esterne suggerite.",
      placement: "bottom",
      icon: "🎓",
    },
    {
      id: "study-start",
      target: "study-start",
      title: "Ripassa Tutto",
      description:
        "Inizia una sessione di ripasso con tutte le flashcard in scadenza. Il sistema FSRS (Free Spaced Repetition Scheduler) calcola il momento ottimale: le carte difficili appaiono piu spesso, quelle facili a intervalli sempre piu lunghi.",
      placement: "bottom",
      icon: "▶️",
    },
  ],
};

// ─── Chat Tour ───────────────────────────────────────────────────────────────

export const chatTour: Tour = {
  id: "chat",
  name: "AI Buddy - Il tuo assistente",
  description: "Scopri tutto quello che puo fare",
  steps: [
    {
      id: "chat-context",
      target: "chat-context",
      title: "Contesto intelligente",
      description:
        'Quando sei sulla pagina di un libro, il Buddy ha accesso a TUTTO il suo contenuto. Vedrai "Contesto libro attivo" in alto. Prova a chiedergli: "Spiegami l\'effetto tunnel", "Fammi 5 domande d\'esame", "Qual e il concetto piu importante?"',
      placement: "left",
      icon: "📖",
    },
    {
      id: "chat-web",
      target: "chat-web",
      title: "Ricerca Web in tempo reale",
      description:
        'Attiva il toggle "Web" in basso per far cercare su internet. Perfetto per:\n- Date degli appelli/esami\n- Articoli e paper recenti\n- Spiegazioni alternative da altre fonti\n- Verificare informazioni aggiornate\n\nLe risposte includeranno le fonti citate.',
      placement: "top",
      icon: "🌐",
    },
    {
      id: "chat-input",
      target: "chat-input",
      title: "Cosa puoi chiedere",
      description:
        "Il Buddy puo aiutarti in tantissimi modi:\n- Spiegare concetti difficili\n- Creare esercizi e domande d'esame\n- Fare riassunti mirati\n- Confrontare argomenti\n- Preparare piani di studio\n- Rispondere a dubbi specifici\n\nInvio per mandare, Shift+Invio per andare a capo.",
      placement: "top",
      icon: "✏️",
    },
    {
      id: "chat-conversations",
      target: "chat-conversations",
      title: "Gestisci le conversazioni",
      description:
        "Ogni conversazione e salvata. Puoi:\n- Creare nuove chat con il bottone +\n- Vedere lo storico con l'icona archivio\n- Tornare a conversazioni precedenti\n- Eliminare quelle che non servono piu",
      placement: "left",
      icon: "📋",
    },
  ],
};

// ─── All Tours ───────────────────────────────────────────────────────────────

export const ALL_TOURS: Tour[] = [
  dashboardTour,
  sourceTour,
  summariesTour,
  flashcardsTour,
  mindmapTour,
  slidesTour,
  infographicsTour,
  studyTour,
  chatTour,
];

// Helper: find matching tour for a pathname
export function findTourForPath(pathname: string): Tour | null {
  return ALL_TOURS.find(t => t.triggerPath?.test(pathname)) || null;
}
