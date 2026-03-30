"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { Tour, TourStep, findTourForPath, ALL_TOURS } from "./tours";

// ─── LocalStorage keys ───────────────────────────────────────────────────────

const COMPLETED_TOURS_KEY = "studio_completed_tours";
const TUTORIALS_DISMISSED_KEY = "studio_tutorials_dismissed";

function getCompletedTours(): Set<string> {
  try {
    const stored = localStorage.getItem(COMPLETED_TOURS_KEY);
    return new Set(stored ? JSON.parse(stored) : []);
  } catch {
    return new Set();
  }
}

function markTourCompleted(tourId: string) {
  const completed = getCompletedTours();
  completed.add(tourId);
  localStorage.setItem(COMPLETED_TOURS_KEY, JSON.stringify(Array.from(completed)));
}

function isTutorialsDismissed(): boolean {
  try {
    return localStorage.getItem(TUTORIALS_DISMISSED_KEY) === "true";
  } catch {
    return false;
  }
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function TutorialOverlay() {
  const pathname = usePathname();
  const [activeTour, setActiveTour] = useState<Tour | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showHelpMenu, setShowHelpMenu] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);

  // ─── Auto-trigger tour on first visit to a page ─────────────────────────────

  useEffect(() => {
    if (activeTour || isTutorialsDismissed()) return;

    const timer = setTimeout(() => {
      const tour = findTourForPath(pathname);
      if (tour && !getCompletedTours().has(tour.id)) {
        // First time on dashboard → show welcome, otherwise start tour directly
        if (tour.id === "dashboard" && !getCompletedTours().has("__welcome_shown")) {
          setShowWelcome(true);
        } else {
          startTour(tour);
        }
      }
    }, 800); // Wait for page to render

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // ─── Highlight target element ───────────────────────────────────────────────

  const updateTargetRect = useCallback(() => {
    if (!activeTour) return;
    const step = activeTour.steps[currentStep];
    if (!step) return;

    const el = document.querySelector(`[data-tutorial="${step.target}"]`);
    if (el) {
      setTargetRect(el.getBoundingClientRect());
    } else {
      setTargetRect(null);
    }
  }, [activeTour, currentStep]);

  useEffect(() => {
    updateTargetRect();

    // Track scroll and resize
    window.addEventListener("scroll", updateTargetRect, true);
    window.addEventListener("resize", updateTargetRect);

    // Watch for DOM changes (elements appearing/disappearing)
    resizeObserverRef.current = new ResizeObserver(updateTargetRect);
    resizeObserverRef.current.observe(document.body);

    return () => {
      window.removeEventListener("scroll", updateTargetRect, true);
      window.removeEventListener("resize", updateTargetRect);
      resizeObserverRef.current?.disconnect();
    };
  }, [updateTargetRect]);

  // ─── Keyboard navigation ───────────────────────────────────────────────────

  useEffect(() => {
    if (!activeTour) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeTour();
      if (e.key === "ArrowRight" || e.key === "Enter") nextStep();
      if (e.key === "ArrowLeft") prevStep();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTour, currentStep]);

  // ─── Tour controls ─────────────────────────────────────────────────────────

  const startTour = (tour: Tour) => {
    setActiveTour(tour);
    setCurrentStep(0);
    setShowWelcome(false);
    setShowHelpMenu(false);
  };

  const nextStep = () => {
    if (!activeTour) return;
    if (currentStep < activeTour.steps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      completeTour();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const closeTour = () => {
    if (activeTour) {
      markTourCompleted(activeTour.id);
    }
    setActiveTour(null);
    setCurrentStep(0);
    setTargetRect(null);
  };

  const completeTour = () => {
    if (activeTour) {
      markTourCompleted(activeTour.id);
    }
    setActiveTour(null);
    setCurrentStep(0);
    setTargetRect(null);
  };

  const startWelcomeTour = () => {
    localStorage.setItem(COMPLETED_TOURS_KEY, JSON.stringify(["__welcome_shown"]));
    const tour = findTourForPath(pathname);
    if (tour) {
      startTour(tour);
    } else {
      setShowWelcome(false);
    }
  };

  const dismissWelcome = () => {
    localStorage.setItem(TUTORIALS_DISMISSED_KEY, "true");
    setShowWelcome(false);
  };

  // ─── Tooltip position calculation ───────────────────────────────────────────

  const getTooltipStyle = (step: TourStep, rect: DOMRect): React.CSSProperties => {
    const gap = 16;
    const tooltipW = 340;
    const tooltipH = 200; // approximate

    switch (step.placement) {
      case "bottom":
        return {
          top: rect.bottom + gap,
          left: Math.max(16, Math.min(rect.left + rect.width / 2 - tooltipW / 2, window.innerWidth - tooltipW - 16)),
        };
      case "top":
        return {
          top: Math.max(16, rect.top - tooltipH - gap),
          left: Math.max(16, Math.min(rect.left + rect.width / 2 - tooltipW / 2, window.innerWidth - tooltipW - 16)),
        };
      case "right":
        return {
          top: Math.max(16, rect.top + rect.height / 2 - tooltipH / 2),
          left: Math.min(rect.right + gap, window.innerWidth - tooltipW - 16),
        };
      case "left":
        return {
          top: Math.max(16, rect.top + rect.height / 2 - tooltipH / 2),
          left: Math.max(16, rect.left - tooltipW - gap),
        };
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  const step = activeTour?.steps[currentStep];
  const totalSteps = activeTour?.steps.length || 0;

  return (
    <>
      {/* ── Welcome Modal ── */}
      {showWelcome && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={dismissWelcome} />
          <div className="relative bg-slate-800 border border-white/10 rounded-2xl p-8 max-w-md mx-4 shadow-2xl">
            <div className="text-center">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500/20 to-purple-500/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
                <span className="text-4xl">🎓</span>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Benvenuto in Studio!</h2>
              <p className="text-slate-400 mb-6 leading-relaxed">
                Vuoi fare un tour guidato per scoprire tutte le funzionalit&agrave; della piattaforma? Ti mostreremo come usare ogni strumento per studiare al meglio.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={dismissWelcome}
                  className="flex-1 px-4 py-3 bg-white/5 border border-white/10 text-slate-400 rounded-xl hover:bg-white/10 transition-colors text-sm font-medium"
                >
                  Magari dopo
                </button>
                <button
                  onClick={startWelcomeTour}
                  className="flex-1 px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-xl hover:opacity-90 transition-opacity text-sm font-medium"
                >
                  Inizia il tour!
                </button>
              </div>
              <p className="text-slate-500 text-xs mt-4">
                Puoi sempre rifare il tour dal pulsante <span className="text-purple-400">?</span> in basso a destra
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Active Tour Overlay ── */}
      {activeTour && step && (
        <div ref={overlayRef} className="fixed inset-0 z-[9998]">
          {/* Dark overlay with hole for target */}
          <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "none" }}>
            <defs>
              <mask id="tutorial-mask">
                <rect width="100%" height="100%" fill="white" />
                {targetRect && (
                  <rect
                    x={targetRect.left - 8}
                    y={targetRect.top - 8}
                    width={targetRect.width + 16}
                    height={targetRect.height + 16}
                    rx="12"
                    fill="black"
                  />
                )}
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="rgba(0,0,0,0.65)"
              mask="url(#tutorial-mask)"
              style={{ pointerEvents: "auto" }}
              onClick={closeTour}
            />
          </svg>

          {/* Highlight border around target */}
          {targetRect && (
            <div
              className="absolute border-2 border-purple-500 rounded-xl pointer-events-none animate-pulse"
              style={{
                top: targetRect.top - 8,
                left: targetRect.left - 8,
                width: targetRect.width + 16,
                height: targetRect.height + 16,
                boxShadow: "0 0 0 4px rgba(139, 92, 246, 0.2), 0 0 20px rgba(139, 92, 246, 0.3)",
              }}
            />
          )}

          {/* Tooltip card */}
          {targetRect && (
            <div
              className="absolute z-10 w-[340px]"
              style={getTooltipStyle(step, targetRect)}
            >
              <div className="bg-slate-800 border border-white/15 rounded-xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="px-5 pt-4 pb-2 flex items-start gap-3">
                  {step.icon && <span className="text-2xl mt-0.5">{step.icon}</span>}
                  <div className="flex-1">
                    <h3 className="text-white font-semibold text-base">{step.title}</h3>
                    <p className="text-slate-400 text-sm mt-1 leading-relaxed">{step.description}</p>
                  </div>
                </div>

                {/* Footer */}
                <div className="px-5 py-3 flex items-center justify-between border-t border-white/5 mt-2">
                  {/* Step indicator */}
                  <div className="flex items-center gap-1.5">
                    {activeTour.steps.map((_, i) => (
                      <div
                        key={i}
                        className={`w-2 h-2 rounded-full transition-colors ${
                          i === currentStep ? "bg-purple-500" : i < currentStep ? "bg-purple-500/40" : "bg-slate-600"
                        }`}
                      />
                    ))}
                    <span className="text-slate-500 text-xs ml-2">
                      {currentStep + 1}/{totalSteps}
                    </span>
                  </div>

                  {/* Navigation */}
                  <div className="flex items-center gap-2">
                    {currentStep > 0 && (
                      <button
                        onClick={prevStep}
                        className="px-3 py-1.5 text-slate-400 hover:text-white text-xs transition-colors"
                      >
                        Indietro
                      </button>
                    )}
                    <button
                      onClick={nextStep}
                      className="px-4 py-1.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg text-xs font-medium hover:opacity-90 transition-opacity"
                    >
                      {currentStep === totalSteps - 1 ? "Fine" : "Avanti"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Fallback if target not found */}
          {!targetRect && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
              <div className="bg-slate-800 border border-white/15 rounded-xl shadow-2xl p-5 w-[340px] text-center">
                {step.icon && <span className="text-3xl">{step.icon}</span>}
                <h3 className="text-white font-semibold mt-2">{step.title}</h3>
                <p className="text-slate-400 text-sm mt-1">{step.description}</p>
                <div className="flex items-center justify-center gap-2 mt-4">
                  <button
                    onClick={closeTour}
                    className="px-3 py-1.5 text-slate-400 text-xs"
                  >
                    Chiudi
                  </button>
                  <button
                    onClick={nextStep}
                    className="px-4 py-1.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg text-xs font-medium"
                  >
                    {currentStep === totalSteps - 1 ? "Fine" : "Avanti"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Help FAB (floating action button) ── */}
      {!activeTour && !showWelcome && (
        <div className="fixed bottom-6 right-6 z-[100] md:bottom-8 md:right-8">
          {/* Tour menu */}
          {showHelpMenu && (
            <div className="absolute bottom-14 right-0 w-72 bg-slate-800 border border-white/10 rounded-xl shadow-2xl overflow-hidden mb-2">
              <div className="px-4 py-3 border-b border-white/10">
                <h4 className="text-white font-medium text-sm">Tutorial disponibili</h4>
                <p className="text-slate-500 text-xs mt-0.5">Clicca per avviare un tour guidato</p>
              </div>
              <div className="max-h-64 overflow-y-auto">
                {ALL_TOURS.map(tour => {
                  const completed = getCompletedTours().has(tour.id);
                  return (
                    <button
                      key={tour.id}
                      onClick={() => startTour(tour)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left"
                    >
                      <span className="text-lg">{tour.steps[0]?.icon || "📖"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-300 text-sm truncate">{tour.name}</p>
                        <p className="text-slate-500 text-xs truncate">{tour.description}</p>
                      </div>
                      {completed && (
                        <span className="text-emerald-400 text-xs shrink-0">Visto</span>
                      )}
                    </button>
                  );
                })}
              </div>
              {/* Reset all tutorials */}
              <div className="px-4 py-2.5 border-t border-white/10">
                <button
                  onClick={() => {
                    localStorage.removeItem(COMPLETED_TOURS_KEY);
                    localStorage.removeItem(TUTORIALS_DISMISSED_KEY);
                    setShowHelpMenu(false);
                  }}
                  className="text-slate-500 text-xs hover:text-slate-300 transition-colors"
                >
                  Resetta tutti i tutorial
                </button>
              </div>
            </div>
          )}

          {/* FAB button */}
          <button
            onClick={() => setShowHelpMenu(!showHelpMenu)}
            className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all ${
              showHelpMenu
                ? "bg-purple-600 text-white rotate-45"
                : "bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:scale-110"
            }`}
            title="Tutorial e guide"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
      )}
    </>
  );
}
