import type { Meta, StoryObj } from "@storybook/react-vite";
import { MarkdownView } from "./MarkdownView";

const FULL_MARKDOWN = `# Storybook coverage

This view supports **bold**, *emphasis*, \`inline code\`, and [links](https://storybook.js.org).

> Terminal-first components can still have useful visual fixtures.

1. Inventory the component
2. Add representative states
   - default
   - empty
   - error

| Component | Covered |
| --- | --- |
| MarkdownView | yes |
| ToolCallView | yes |

---

\`\`\`ts
const covered = stories.length > 0;
\`\`\`
`;

const meta: Meta<typeof MarkdownView> = {
  title: "Components/MessageList/MarkdownView",
  component: MarkdownView,
  args: {
    markdown: FULL_MARKDOWN,
    width: 72,
  },
  parameters: { xterm: { cols: 90, rows: 30 } },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const FullDocument: Story = {};

export const StreamingFragment: Story = {
  args: {
    markdown:
      "## Partial response\n\nThe agent is still writing a paragraph with **formatting",
  },
};

export const Empty: Story = {
  args: { markdown: "" },
};
