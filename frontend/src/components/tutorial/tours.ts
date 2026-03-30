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
      id: "sidebar-library",
      target: "sidebar-library",
      title: "La tua Libreria",
      description:
        "Qui trovi tutti i tuoi libri e materiali. Clicca su un libro per espanderlo e accedere a capitoli, flashcard, riassunti e altro.",
      placement: "right",
      icon: "📚",
    },
    {
      id: "sidebar-study",
      target: "sidebar-study",
      title: "Studia Ora",
      description:
        "Il tuo centro di studio! Qui trovi flashcard da ripassare, quiz, mappe concettuali e presentazioni. Tutto organizzato per libro e capitolo.",
      placement: "right",
      icon: "🔥",
    },
    {
      id: "header-chat",
      target: "header-chat",
      title: "AI Buddy",
      description:
        "Il tuo assistente AI personale! Cliccalo per aprire la chat. Puoi chiedergli qualsiasi cosa e attivare la ricerca web.",
      placement: "bottom",
      icon: "💬",
    },
    {
      id: "dashboard-add",
      target: "dashboard-add",
      title: "Aggiungi Materiale",
      description:
        "Clicca qui per caricare un nuovo PDF o libro. Verrà elaborato automaticamente con l'AI e diviso in capitoli.",
      placement: "bottom",
      icon: "➕",
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
        "Questi sono i tuoi strumenti AI. Da qui puoi generare riassunti, flashcard, mappe concettuali e presentazioni per ogni capitolo.",
      placement: "bottom",
      icon: "🧠",
    },
    {
      id: "source-chapters",
      target: "source-chapters",
      title: "I tuoi Capitoli",
      description:
        "Ogni capitolo elaborato ha i suoi strumenti: puoi leggere il testo estratto, generare riassunti, flashcard e quiz specifici per quel capitolo.",
      placement: "top",
      icon: "📖",
    },
    {
      id: "source-chapter-actions",
      target: "source-chapter-actions",
      title: "Azioni per Capitolo",
      description:
        'Per ogni capitolo puoi: "Leggi" il testo completo, generare "Riassunti", creare "Flashcard" per lo studio e fare "Quiz" per verificare la preparazione.',
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
      title: "Vista Libro Intero / Per Capitoli",
      description:
        'Scegli come visualizzare i riassunti: "Libro Intero" combina tutti i capitoli, "Per Capitoli" li mostra singolarmente.',
      placement: "bottom",
      icon: "📑",
    },
    {
      id: "summaries-generate",
      target: "summaries-generate",
      title: "Genera Riassunto",
      description:
        "Clicca per generare un riassunto AI del capitolo. Puoi scegliere la lunghezza (breve, medio, dettagliato) e scaricare il PDF.",
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
        "Seleziona un capitolo e clicca per generare flashcard AI. Puoi scegliere il numero e la difficoltà.",
      placement: "bottom",
      icon: "🃏",
    },
    {
      id: "flashcards-study",
      target: "flashcards-study",
      title: "Studia le Flashcard",
      description:
        'Vai su "Studia Ora" nella sidebar per ripassare le flashcard con la ripetizione spaziata. Il sistema ti mostrerà le carte al momento ottimale.',
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
        "Clicca per generare una mappa concettuale interattiva. L'AI analizzerà il contenuto e creerà nodi e connessioni tra i concetti.",
      placement: "bottom",
      icon: "🗺️",
    },
    {
      id: "mindmap-interact",
      target: "mindmap-interact",
      title: "Esplora la Mappa",
      description:
        "Clicca su un nodo per espandere/chiudere le sue diramazioni. Usa lo zoom e il drag per navigare. Puoi esportare come PNG.",
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
        "Seleziona un capitolo e genera una presentazione AI completa con slide formattate. Puoi esportarla in PDF.",
      placement: "bottom",
      icon: "🎯",
    },
    {
      id: "slides-navigate",
      target: "slides-navigate",
      title: "Naviga le Slide",
      description:
        "Usa le frecce o i tasti da tastiera per navigare. Puoi andare in fullscreen per presentare.",
      placement: "top",
      icon: "⌨️",
    },
  ],
};

// ─── Study Session Tour ──────────────────────────────────────────────────────

export const studyTour: Tour = {
  id: "study",
  name: "Sessione di Studio",
  description: "Come funziona la ripetizione spaziata",
  triggerPath: /^\/dashboard\/study\/?$/,
  steps: [
    {
      id: "study-due",
      target: "study-due",
      title: "Carte da Ripassare",
      description:
        "Qui vedi quante flashcard devi ripassare oggi. Il numero si aggiorna in base all'algoritmo FSRS che ottimizza la tua memorizzazione.",
      placement: "bottom",
      icon: "🔥",
    },
    {
      id: "study-start",
      target: "study-start",
      title: "Inizia a Studiare",
      description:
        'Clicca "Inizia Sessione" per iniziare il ripasso. Vedrai la domanda, prova a rispondere mentalmente, poi gira la carta e valuta quanto bene hai risposto.',
      placement: "bottom",
      icon: "▶️",
    },
  ],
};

// ─── Chat Tour ───────────────────────────────────────────────────────────────

export const chatTour: Tour = {
  id: "chat",
  name: "AI Buddy Chat",
  description: "Come usare l'assistente AI",
  steps: [
    {
      id: "chat-context",
      target: "chat-context",
      title: "Contesto Libro",
      description:
        "Quando sei sulla pagina di un libro, il Buddy ha accesso al suo contenuto. Puoi fargli domande specifiche sui tuoi materiali.",
      placement: "left",
      icon: "📖",
    },
    {
      id: "chat-web",
      target: "chat-web",
      title: "Ricerca Web",
      description:
        'Attiva il toggle "Web" per far cercare informazioni su internet al Buddy. Utile per dati aggiornati, date esami, articoli recenti.',
      placement: "top",
      icon: "🌐",
    },
    {
      id: "chat-input",
      target: "chat-input",
      title: "Scrivi un Messaggio",
      description:
        "Scrivi la tua domanda e premi Invio. Usa Shift+Invio per andare a capo. Puoi chiedere spiegazioni, riassunti, esercizi e molto altro.",
      placement: "top",
      icon: "✏️",
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
  studyTour,
  chatTour,
];

// Helper: find matching tour for a pathname
export function findTourForPath(pathname: string): Tour | null {
  return ALL_TOURS.find(t => t.triggerPath?.test(pathname)) || null;
}
