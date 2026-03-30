import katex from "katex";

/**
 * Render all LaTeX blocks ($$...$$) and inline ($...$) in a string to KaTeX HTML.
 * Returns the string with LaTeX replaced by rendered HTML spans.
 */
export function renderLatexInText(text: string): string {
  if (!text) return text;

  // First: render display math $$...$$
  let result = text.replace(
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

  return result;
}

/**
 * Render a single LaTeX string to HTML (for formula slides etc.)
 */
export function renderLatex(latex: string, displayMode = true): string {
  try {
    const cleaned = cleanLatexInput(latex.trim().replace(/^\$+|\$+$/g, ""));
    return katex.renderToString(cleaned, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: true,
    });
  } catch {
    return `<code class="text-emerald-400">${latex}</code>`;
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
