import type { Meta, StoryObj } from "@storybook/react-vite";
import { CodeView } from "./CodeView";

/**
 * `CodeView` syntax-highlights code via Shiki and prints ANSI to Ink. The
 * highlighter resolves asynchronously, so the first frame shows raw text
 * until the highlighted output is ready.
 */
const meta: Meta<typeof CodeView> = {
  title: "Components/CodeView",
  component: CodeView,
  args: {
    code: 'function greet(name: string) {\n  return `Hello, ${name}!`;\n}\n\ngreet("world");\n',
    language: "typescript",
    showLineNumbers: false,
  },
  argTypes: {
    language: {
      control: "select",
      options: ["typescript", "javascript", "json", "python", "rust", "bash"],
    },
    showLineNumbers: { control: "boolean" },
  },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const TypeScript: Story = {};

export const WithLineNumbers: Story = {
  args: { showLineNumbers: true },
};

export const JsonPayload: Story = {
  args: {
    language: "json",
    code: '{\n  "id": 42,\n  "name": "alice",\n  "active": true,\n  "tags": ["admin", "beta"]\n}\n',
  },
};

export const Python: Story = {
  args: {
    language: "python",
    showLineNumbers: true,
    code: "def fib(n: int) -> int:\n    if n < 2:\n        return n\n    return fib(n - 1) + fib(n - 2)\n\nprint(fib(10))\n",
  },
};
