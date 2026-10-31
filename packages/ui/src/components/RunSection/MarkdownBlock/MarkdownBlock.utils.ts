const CODE_SEGMENT = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/;
const BRACKET_MATH = /\\\[([\s\S]*?)\\\]/g;
const PAREN_MATH = /\\\(([\s\S]*?)\\\)/g;
const ALLOWED_URL = /^(https?:|mailto:)/i;

/**
 * Rewrite `\[...\]` and `\(...\)` math as the `$$` and `$` forms that remark-math reads.
 * Code fences and code spans are left alone, and an unclosed delimiter stays as typed.
 * @param {string} text - Markdown source.
 * @returns {string} Markdown with dollar-delimited math.
 */
export function normalizeMathDelimiters(text: string): string {
  return text
    .split(CODE_SEGMENT)
    .map((segment, index) =>
      // Capturing the split pattern puts code segments at odd positions.
      index % 2 === 1
        ? segment
        : segment
            .replace(
              BRACKET_MATH,
              (_match, body: string) => `\n\n$$\n${body.trim()}\n$$\n\n`,
            )
            .replace(PAREN_MATH, (_match, body: string) => `$${body.trim()}$`),
    )
    .join("");
}

/**
 * Keep only web and mail links, since agent output is untrusted.
 * @param {string} url - Link or image address.
 * @returns {string | undefined} The address when allowed, otherwise undefined.
 */
export function allowUrl(url: string): string | undefined {
  return ALLOWED_URL.test(url) ? url : undefined;
}
