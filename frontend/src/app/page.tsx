import Link from "next/link";

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-primary-50 to-accent-50">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <nav className="flex justify-between items-center mb-16">
          <div className="text-2xl font-bold gradient-text">Studio</div>
          <div className="space-x-4">
            <Link
              href="/login"
              className="text-gray-600 hover:text-gray-900 transition-colors"
            >
              Accedi
            </Link>
            <Link
              href="/signup"
              className="btn-primary"
            >
              Inizia Gratis
            </Link>
          </div>
        </nav>

        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            Studia in modo
            <span className="gradient-text"> intelligente</span>
          </h1>

          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto">
            Trasforma i tuoi libri e appunti in flashcard intelligenti.
            L&apos;AI genera il materiale di studio, tu impari con la ripetizione spaziata.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/signup"
              className="btn-primary text-lg px-8 py-3"
            >
              Inizia Gratuitamente
            </Link>
            <Link
              href="#features"
              className="btn-secondary text-lg px-8 py-3"
            >
              Scopri di più
            </Link>
          </div>
        </div>

        {/* Features Section */}
        <section id="features" className="mt-32">
          <h2 className="text-3xl font-bold text-center mb-12">
            Come funziona
          </h2>

          <div className="grid md:grid-cols-3 gap-8">
            <FeatureCard
              number="1"
              title="Carica i tuoi materiali"
              description="PDF, foto di libri o appunti. Basta un click o scansiona con il telefono."
            />
            <FeatureCard
              number="2"
              title="L'AI genera le flashcard"
              description="Claude AI analizza il contenuto e crea domande e risposte di qualità."
            />
            <FeatureCard
              number="3"
              title="Studia con la scienza"
              description="L'algoritmo FSRS ti fa ripassare al momento giusto per memorizzare a lungo termine."
            />
          </div>
        </section>

        {/* Stats Section */}
        <section className="mt-32 text-center">
          <div className="grid md:grid-cols-3 gap-8">
            <StatCard number="10x" label="Più veloce del metodo tradizionale" />
            <StatCard number="95%" label="Retention a lungo termine" />
            <StatCard number="0" label="Tempo perso a creare flashcard" />
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-32 py-8">
        <div className="container mx-auto px-4 text-center text-gray-600">
          <p>© 2025 Studio. Studia meglio, non di più.</p>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="card text-center">
      <div className="w-12 h-12 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
        {number}
      </div>
      <h3 className="text-xl font-semibold mb-2">{title}</h3>
      <p className="text-gray-600">{description}</p>
    </div>
  );
}

function StatCard({ number, label }: { number: string; label: string }) {
  return (
    <div>
      <div className="text-4xl font-bold gradient-text">{number}</div>
      <div className="text-gray-600 mt-2">{label}</div>
    </div>
  );
}
