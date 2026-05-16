import type { ToolErrorKind } from "../tool.types";

/** Single input parameter description. */
export interface DescribeToolInput {
  /** Parameter name as it appears in the JSON schema. */
  readonly name: string;
  /** Human-readable type, e.g. `"string"`, `"number"`, `"object<string, string>"`. */
  readonly type: string;
  /** Whether the parameter is required. Optional parameters render their default when supplied. */
  readonly required: boolean;
  /** Default value when omitted, rendered as text. Only used when `required: false`. */
  readonly defaultValue?: string;
  /** One-line description of the parameter's semantics. */
  readonly description: string;
}

/** Single error-kind row. */
export interface DescribeToolError {
  /** A {@link ToolErrorKind} this tool may emit. */
  readonly kind: ToolErrorKind;
  /** Why this kind fires and what the model should do next. */
  readonly description: string;
}

/** Input to {@link describeTool}. */
export interface DescribeToolOptions {
  /**
   * One-line purpose sentence (no trailing period required — the helper
   * will not add one). Multi-line purposes are allowed; each entry is
   * rendered as its own paragraph above the `Inputs:` section.
   */
  readonly purpose: string | readonly string[];
  /** Inputs in declaration order. */
  readonly inputs: readonly DescribeToolInput[];
  /**
   * One or more lines describing the structured `data` payload returned
   * on success. The string `"data"` should NOT be repeated — the helper
   * prefixes the section with `Outputs (\`data\`):`.
   */
  readonly outputs: string | readonly string[];
  /** Error kinds this tool may surface. */
  readonly errors: readonly DescribeToolError[];
  /**
   * Optional usage examples. Each entry is rendered verbatim on its own
   * line under the `Examples:` heading.
   */
  readonly examples?: readonly string[];
  /**
   * Optional free-form notes (cross-references to protocols, host
   * platform info for run_command, etc.). Each entry becomes its own
   * line under `Notes:`.
   */
  readonly notes?: readonly string[];
}

/**
 * Render a tool description in the canonical built-in format.
 *
 * Layout (sections emitted in fixed order):
 *   Purpose → Inputs → Outputs → Errors → Examples → Notes.
 * Token-efficient plain-text — no Markdown, no XML — so every provider
 * sees the same content. Deterministic: same options produce the same
 * string, which backs the snapshot test catching accidental drift.
 */
export function describeTool(options: DescribeToolOptions): string {
  const lines: string[] = [];

  // Purpose paragraph(s).
  const purposeLines =
    typeof options.purpose === "string" ? [options.purpose] : options.purpose;
  for (let i = 0; i < purposeLines.length; i += 1) {
    lines.push(purposeLines[i]!);
    if (i < purposeLines.length - 1) lines.push("");
  }

  // Inputs.
  lines.push("");
  lines.push("Inputs:");
  if (options.inputs.length === 0) {
    lines.push("  (none)");
  } else {
    for (const input of options.inputs) {
      lines.push(`  - ${formatInput(input)}`);
    }
  }

  // Outputs.
  lines.push("");
  lines.push("Outputs (`data`):");
  const outputLines =
    typeof options.outputs === "string" ? [options.outputs] : options.outputs;
  for (const line of outputLines) {
    lines.push(`  ${line}`);
  }

  // Errors.
  lines.push("");
  lines.push("Errors:");
  if (options.errors.length === 0) {
    lines.push("  (none)");
  } else {
    for (const err of options.errors) {
      lines.push(`  - \`${err.kind}\` — ${err.description}`);
    }
  }

  // Examples (optional).
  if (options.examples && options.examples.length > 0) {
    lines.push("");
    lines.push("Examples:");
    for (const example of options.examples) {
      lines.push(`  ${example}`);
    }
  }

  // Notes (optional).
  if (options.notes && options.notes.length > 0) {
    lines.push("");
    lines.push("Notes:");
    for (const note of options.notes) {
      lines.push(`  ${note}`);
    }
  }

  return lines.join("\n");
}

function formatInput(input: DescribeToolInput): string {
  const requiredText = input.required ? "required" : "optional";
  const defaultText =
    !input.required && input.defaultValue !== undefined
      ? `, default ${input.defaultValue}`
      : "";
  return `\`${input.name}\` (${input.type}, ${requiredText}${defaultText}) — ${input.description}`;
}
