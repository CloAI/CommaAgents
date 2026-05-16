export const DEFAULT_EXCLUDE_GLOBS: readonly string[] = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/.turbo/**",
  "**/coverage/**",
];

export const DEFAULT_MAX_RESULTS = 100;
export const DEFAULT_CONTEXT_LINES = 0;
export const DEFAULT_MAX_FILE_BYTES = 4 * 1024 * 1024;
export const DEFAULT_TRAVERSAL_DEPTH = 32;
