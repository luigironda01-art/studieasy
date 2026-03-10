# Studio

App di studio AI-powered per studenti. Trasforma libri, PDF e appunti in flashcard intelligenti con spaced repetition.

## Features

- Upload PDF e scanner fotografico
- Generazione automatica flashcard con AI (Claude)
- Spaced repetition con algoritmo FSRS
- Desktop + Tablet + Mobile companion
- Supporto offline
- Italiano + English

## Tech Stack

- **Frontend**: Next.js 14 + React + Tailwind CSS
- **Backend**: Python FastAPI
- **AI**: Claude (content) + Gemini (document processing)
- **Database**: Supabase (PostgreSQL)
- **Spaced Repetition**: FSRS

## Project Structure

```
Studio/
├── frontend/          # Next.js web app (Desktop + Tablet)
├── backend/           # FastAPI server
├── mobile/            # PWA scanner companion
├── shared/            # Shared types
└── docs/              # Documentation
```

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.11+
- Supabase account

### Installation

```bash
# Frontend
cd frontend
npm install
npm run dev

# Backend
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

## Documentation

- [Design Doc](docs/plans/2025-03-10-studio-design.md)
- [Development Plan](docs/plans/2025-03-10-studio-plan.md)
