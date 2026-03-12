# Studio - AI-Powered Study App

## Descrizione Progetto
App di studio AI-powered per studenti. Trasforma libri, PDF e appunti in flashcard intelligenti con spaced repetition.

## Tech Stack
- **Frontend**: Next.js 14 + React + Tailwind CSS (porta 3000)
- **Backend**: Python FastAPI (porta 8000)
- **AI**: Claude (content) + Gemini (document processing)
- **Database**: Supabase (PostgreSQL)
- **Spaced Repetition**: FSRS

## Struttura Progetto
```
Studio/
├── frontend/          # Next.js web app
├── backend/           # FastAPI server
├── mobile/            # PWA scanner companion
├── shared/            # Shared types
├── supabase/          # Database config
└── docs/              # Documentation
```

## Comandi Avvio

### Backend
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

### Frontend
```bash
cd frontend
npm run dev
```

## Convenzioni
- Seguire TDD per nuove feature
- Commit atomici e frequenti
- Design doc prima di implementazioni significative
