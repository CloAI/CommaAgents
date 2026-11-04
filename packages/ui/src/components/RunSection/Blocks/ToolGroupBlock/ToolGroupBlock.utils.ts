import type { RunContent } from "../../../../hooks/runs";
import type { RunTool } from "../../RunSection.types";
import type { RunDisplayBlock } from "./ToolGroupBlock.types";

/**
 * Group consecutive calls without letting empty streaming placeholders split them.
 * @param {readonly RunContent[]} content - Original message content in chronological order.
 * @returns {RunDisplayBlock[]} Display blocks preserving original content references.
 */
export function groupRunContent(
  content: readonly RunContent[],
): RunDisplayBlock[] {
  const blocks: RunDisplayBlock[] = [];
  let tools: RunTool[] = [];
  const flush = (): void => {
    if (tools.length === 0) {
      return;
    }
    blocks.push({ type: "tools", key: `tools-${tools[0]!.toolCallId}`, tools });
    tools = [];
  };
  content.forEach((block, index) => {
    if (block.type === "tool") {
      tools.push(block);
    } else if (block.text.trim()) {
      flush();
      blocks.push({ type: "content", key: `content-${index}`, content: block });
    }
  });
  flush();
  return blocks;
}
