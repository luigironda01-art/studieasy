-- Add topic_emoji field to sources table
-- This emoji represents the content/topic of the source

ALTER TABLE sources ADD COLUMN IF NOT EXISTS topic_emoji TEXT DEFAULT NULL;

-- Example values:
-- 💊 Farmacia/Medicina
-- ⚗️ Chimica
-- 📐 Matematica
-- 🧬 Biologia
-- ⚖️ Diritto/Legge
-- 💰 Economia
-- 🖥️ Informatica
-- 🌍 Geografia
-- 📜 Storia
-- 🎨 Arte
-- 📚 Letteratura
-- 🔬 Fisica
-- 🧠 Psicologia
-- 🏛️ Filosofia
-- 🗣️ Lingue
-- 🏥 Medicina
-- 🔧 Ingegneria
-- 📊 Statistica
