import katex from "katex";
import { sanitizeHtml } from "./sanitize";

/**
 * Render all LaTeX blocks ($$...$$) and inline ($...$) in a string to KaTeX HTML.
 * Returns the string with LaTeX replaced by rendered HTML spans.
 * Output is sanitized via DOMPurify to prevent XSS.
 */
export function renderLatexInText(text: string): string {
  if (!text) return text;

  // Pre-process: convert [FORMULA: ...] tags to $$...$$ LaTeX
  const preprocessed = text.replace(
    /\[FORMULA:\s*(.*?)\]/g,
    (_, formula) => `$$${unicodeToLatex(formula.trim())}$$`
  );

  // First: render display math $$...$$
  let result = preprocessed.replace(
    /\$\$([\s\S]*?)\$\$/g,
    (_, latex) => {
      try {
        const cleaned = cleanLatexInput(latex.trim());
        return `<div class="katex-display-wrapper" style="text-align:center;margin:1em 0;overflow-x:auto;">${katex.renderToString(cleaned, {
          displayMode: true,
          throwOnError: false,
          strict: false,
          trust: true,
        })}</div>`;
      } catch {
        return `<code class="text-emerald-400">${latex.trim()}</code>`;
      }
    }
  );

  // Then: render inline math $..$ (single dollar, not preceded/followed by space+digit)
  result = result.replace(
    /(?<!\$)\$(?!\$)((?:[^$\\]|\\.)+?)\$(?!\$)/g,
    (_, latex) => {
      try {
        const cleaned = cleanLatexInput(latex.trim());
        return katex.renderToString(cleaned, {
          displayMode: false,
          throwOnError: false,
          strict: false,
          trust: true,
        });
      } catch {
        return `<code class="text-emerald-400">${latex.trim()}</code>`;
      }
    }
  );

  return sanitizeHtml(result);
}

/**
 * Render a single LaTeX string to HTML (for formula slides etc.)
 */
export function renderLatex(latex: string, displayMode = true): string {
  try {
    const cleaned = cleanLatexInput(latex.trim().replace(/^\$+|\$+$/g, ""));
    return sanitizeHtml(katex.renderToString(cleaned, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: true,
    }));
  } catch {
    return sanitizeHtml(`<code class="text-emerald-400">${latex}</code>`);
  }
}

/**
 * Clean up common LaTeX issues from AI-generated output
 */
function cleanLatexInput(latex: string): string {
  let cleaned = latex;

  // Fix double backslashes from JSON escaping
  cleaned = cleaned.replace(/\\\\/g, "\\");

  // Fix common AI mistakes
  cleaned = cleaned.replace(/\\psi\s+\(/g, "\\psi(");
  cleaned = cleaned.replace(/\\frac\s+\{/g, "\\frac{");
  cleaned = cleaned.replace(/\\left\s*\(/g, "\\left(");
  cleaned = cleaned.replace(/\\right\s*\)/g, "\\right)");

  // Add missing backslashes before common commands
  const commands = [
    "frac", "sqrt", "sum", "prod", "int", "infty", "partial",
    "alpha", "beta", "gamma", "delta", "epsilon", "theta", "lambda",
    "mu", "nu", "pi", "sigma", "omega", "psi", "phi", "chi",
    "hbar", "nabla", "cdot", "times", "left", "right", "quad",
    "text", "mathrm", "sin", "cos", "tan", "log", "ln", "exp",
    "lim", "max", "min", "vec", "hat", "bar", "dot",
  ];
  for (const cmd of commands) {
    const regex = new RegExp(`(?<!\\\\)\\b${cmd}(?=[{(\\s])`, "g");
    cleaned = cleaned.replace(regex, `\\${cmd}`);
  }

  return cleaned;
}

/**
 * Convert Unicode math notation to LaTeX
 * e.g. "ħ²/2m d²ψ(x)/dx²" → "\hbar^2 / 2m \frac{d^2 \psi(x)}{dx^2}"
 */
function unicodeToLatex(text: string): string {
  let latex = text;

  // Unicode superscripts → ^{}
  const superscripts: Record<string, string> = {
    "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
    "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9",
    "⁺": "+", "⁻": "-", "ⁿ": "n",
  };
  for (const [uni, repl] of Object.entries(superscripts)) {
    latex = latex.replace(new RegExp(uni, "g"), `^{${repl}}`);
  }

  // Unicode subscripts → _{}
  const subscripts: Record<string, string> = {
    "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
    "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
    "ₙ": "n", "ₘ": "m", "ₓ": "x", "ₖ": "k",
  };
  for (const [uni, repl] of Object.entries(subscripts)) {
    latex = latex.replace(new RegExp(uni, "g"), `_{${repl}}`);
  }

  // Greek letters
  const greeks: Record<string, string> = {
    "α": "\\alpha", "β": "\\beta", "γ": "\\gamma", "δ": "\\delta",
    "ε": "\\epsilon", "ζ": "\\zeta", "η": "\\eta", "θ": "\\theta",
    "λ": "\\lambda", "μ": "\\mu", "ν": "\\nu", "π": "\\pi",
    "ρ": "\\rho", "σ": "\\sigma", "τ": "\\tau", "φ": "\\phi",
    "χ": "\\chi", "ψ": "\\psi", "ω": "\\omega",
    "Δ": "\\Delta", "Σ": "\\Sigma", "Ω": "\\Omega", "Φ": "\\Phi",
    "Ψ": "\\Psi", "Γ": "\\Gamma", "Λ": "\\Lambda", "Π": "\\Pi",
  };
  for (const [uni, repl] of Object.entries(greeks)) {
    latex = latex.replace(new RegExp(uni, "g"), `${repl} `);
  }

  // Special symbols
  latex = latex.replace(/ħ/g, "\\hbar");
  latex = latex.replace(/∞/g, "\\infty");
  latex = latex.replace(/→/g, "\\rightarrow");
  latex = latex.replace(/←/g, "\\leftarrow");
  latex = latex.replace(/≤/g, "\\leq");
  latex = latex.replace(/≥/g, "\\geq");
  latex = latex.replace(/≠/g, "\\neq");
  latex = latex.replace(/≈/g, "\\approx");
  latex = latex.replace(/±/g, "\\pm");
  latex = latex.replace(/×/g, "\\times");
  latex = latex.replace(/÷/g, "\\div");
  latex = latex.replace(/·/g, "\\cdot");
  latex = latex.replace(/√/g, "\\sqrt");
  latex = latex.replace(/∫/g, "\\int");
  latex = latex.replace(/∑/g, "\\sum");
  latex = latex.replace(/∂/g, "\\partial");
  latex = latex.replace(/∇/g, "\\nabla");

  // Merge consecutive superscripts: ^{2}^{3} → ^{23}
  latex = latex.replace(/\^\{([^}]+)\}\^\{([^}]+)\}/g, "^{$1$2}");
  latex = latex.replace(/_\{([^}]+)\}_\{([^}]+)\}/g, "_{$1$2}");

  return latex;
}
