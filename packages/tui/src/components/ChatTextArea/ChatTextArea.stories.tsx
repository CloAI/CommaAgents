import type { Meta, StoryObj } from "@storybook/react-vite";
import { ChatTextArea } from "./ChatTextArea";

// const meta: Meta<typeof ChatTextArea> = {
//   title: "Components/ChatTextArea",
//   component: ChatTextArea,
//   args: {
//     strategies,
//     onSubmit: (path: string, text: string) => {
//       // eslint-disable-next-line no-console
//       console.log("[ChatTextArea] submit", { path, text });
//     },
//   },
// };

// export default meta;

// type Story = StoryObj<typeof meta>;

// export const Default: Story = {};

// export const FixedWidth: Story = {
//   args: {
//     id: "chat-input",
//     width: 80,
//     height: 8,
//     placeholder: "Ask the agent anything...",
//   },
// };

// export const SingleStrategy: Story = {
//   args: {
//     strategies: [strategies[0]!],
//     height: 6,
//     placeholder: "Type your prompt and press Ctrl+S to submit",
//   },
// };

// export const ManyStrategies: Story = {
//   args: {
//     strategies: [
//       ...strategies,
//       {
//         label: "Review",
//         value: "/strategies/review.ts",
//         description: "Audit changes",
//       },
//       {
//         label: "Summarize",
//         value: "/strategies/summarize.ts",
//         description: "Condense long content",
//       },
//     ],
//     height: 6,
//   },
// };
