import picomatch from "picomatch";

/**
 * Compile workspace glob rules with dotfile matching and whole-pattern negation.
 * @param {string} pattern - Workspace-relative glob expression.
 * @returns {(path: string) => boolean} Predicate preserving workspace glob matching rules.
 */
export function compileGlob(pattern: string): (path: string) => boolean {
  let negated = false;
  let patternStart = 0;
  while (pattern[patternStart] === "!") {
    negated = !negated;
    patternStart++;
  }
  if (patternStart === pattern.length) {
    return (path) => negated !== (path === "");
  }
  // Parentheses and pipes are literals in workspace globs, rather than regex groups/extglobs.
  const literalPattern = pattern
    .slice(patternStart)
    .replace(/\\.|[()|]/g, (token) =>
      token.startsWith("\\") ? token : `\\${token}`,
    );
  const expression = picomatch.makeRe(literalPattern, {
    dot: true,
    nonegate: true,
    noextglob: true,
    strictSlashes: true,
    posixSlashes: false,
  });
  // Picomatch excludes special dot segments even with dot:true; Bun matched them in policy rules.
  let source = expression.source
    .replaceAll("(?!(?:^|\\/)\\.{1,2}(?:\\/|$))", "")
    .replaceAll("(?!\\.{1,2}(?:\\/|$))", "")
    .replaceAll("(?!\\.{0,1}(?:\\/|$))", "");
  // A terminal single star accepts an empty segment; globstar/single-star traversal requires a name.
  if (!literalPattern.endsWith("**/*")) {
    source = source.replaceAll("(?=.)", "");
  }
  const matches = new RegExp(source, expression.flags);
  return (path) => negated !== matches.test(path);
}
