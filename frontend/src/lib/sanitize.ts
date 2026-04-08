import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitizes HTML content to prevent XSS attacks.
 * Use this on any AI-generated or user-generated HTML before rendering
 * with dangerouslySetInnerHTML.
 *
 * Allowed tags include common formatting + KaTeX math output spans.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["math", "semantics", "mrow", "mi", "mo", "mn", "msup", "msub", "mfrac", "msqrt", "annotation"],
    ADD_ATTR: ["aria-hidden", "data-mml-node", "data-c", "data-mjx-texclass", "data-latex", "style"],
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "link"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur", "onchange", "onsubmit"],
    ALLOW_DATA_ATTR: true,
  });
}
