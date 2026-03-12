# Deploy Studieasy su Railway

## Prerequisiti
- Account Railway (https://railway.app)
- Repository GitHub con il codice

## Passo 1: Push su GitHub

```bash
cd /Users/lavoro/Desktop/Studio
git add .
git commit -m "Prepare for Railway deploy"
git push origin main
```

## Passo 2: Crea nuovo progetto su Railway

1. Vai su https://railway.app/dashboard
2. Click "New Project"
3. Seleziona "Deploy from GitHub repo"
4. Autorizza Railway ad accedere al tuo repo

## Passo 3: Configura il Backend (FastAPI)

1. Nella dashboard Railway, click "New Service"
2. Seleziona il repo GitHub
3. **Root Directory**: `backend`
4. Aggiungi queste **Environment Variables**:
   - `SUPABASE_URL` = (la tua URL Supabase)
   - `SUPABASE_ANON_KEY` = (la tua anon key)
   - `SUPABASE_SERVICE_ROLE_KEY` = (la tua service role key)
   - `OPENROUTER_API_KEY` = (la tua API key OpenRouter)
5. Railway builderà automaticamente con il Dockerfile

## Passo 4: Configura il Frontend (Next.js)

1. Click "New Service" di nuovo
2. Seleziona lo stesso repo GitHub
3. **Root Directory**: `frontend`
4. Aggiungi queste **Environment Variables**:
   - `NEXT_PUBLIC_SUPABASE_URL` = (la tua URL Supabase)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = (la tua anon key)
   - `NEXT_PUBLIC_API_URL` = (URL del backend Railway, es: https://backend-xxx.railway.app)

## Passo 5: Configura il Dominio Personalizzato

1. Click sul servizio Frontend
2. Vai su "Settings" → "Networking" → "Generate Domain"
3. Oppure aggiungi un dominio custom

### Per avere un nome carino (es. studieasy.up.railway.app):
- Vai su Settings → Domains
- Click "Generate Domain"
- Railway genererà un nome tipo `studieasy-production.up.railway.app`

## Passo 6: Aggiorna Supabase

Aggiungi la URL di produzione ai **Redirect URLs** in Supabase:
- `https://studieasy-xxx.railway.app/update-password`

## Variabili d'Ambiente Necessarie

### Backend
| Variabile | Descrizione |
|-----------|-------------|
| SUPABASE_URL | URL del tuo progetto Supabase |
| SUPABASE_ANON_KEY | Chiave anonima Supabase |
| SUPABASE_SERVICE_ROLE_KEY | Chiave service role (per bypass RLS) |
| OPENROUTER_API_KEY | API key per Claude via OpenRouter |

### Frontend
| Variabile | Descrizione |
|-----------|-------------|
| NEXT_PUBLIC_SUPABASE_URL | URL del tuo progetto Supabase |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Chiave anonima Supabase |
| NEXT_PUBLIC_API_URL | URL del backend su Railway |
