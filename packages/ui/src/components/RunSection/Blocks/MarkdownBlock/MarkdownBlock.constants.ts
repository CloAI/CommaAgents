import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";

/** Markdown extensions: tables and task lists, then math. */
export const REMARK_PLUGINS = [remarkGfm, remarkMath];

/** HTML transforms: math typesetting, then code highlighting that tolerates unknown languages. */
export const REHYPE_PLUGINS = [
  rehypeKatex,
  [rehypeHighlight, { detect: false, ignoreMissing: true }],
] satisfies Parameters<
  typeof import("react-markdown").default
>[0]["rehypePlugins"];
