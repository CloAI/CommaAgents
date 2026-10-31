import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  resolve: { dedupe: ["react", "react-dom"] },
  optimizeDeps: {
    include: [
      "react",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "react-markdown",
      "remark-gfm",
      "remark-math",
      "rehype-katex",
      "rehype-highlight",
    ],
  },
  build: { target: "es2022" },
});
