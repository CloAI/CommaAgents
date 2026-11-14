import type { QuestionField, QuestionValue } from "./questions.types";

/**
 * Validate a field value against the original question's constraints.
 * @param {QuestionField} field - Original input definition.
 * @param {QuestionValue} value - Entered or recommended value.
 * @returns {string | undefined} The violation, or undefined for a valid value.
 * @internal
 */
export function fieldValueError(
  field: QuestionField,
  value: QuestionValue,
): string | undefined {
  if (field.type === "text") {
    return typeof value !== "string"
      ? "Enter a text answer."
      : field.required && value.trim().length === 0
        ? "Enter an answer."
        : undefined;
  }
  if (field.type === "choice") {
    if (
      !Array.isArray(value) ||
      value.some((selection) => typeof selection !== "string")
    ) {
      return "Select options by ID.";
    }
    if (new Set(value).size !== value.length) {
      return "Select each option only once.";
    }
    if (
      value.some(
        (selection) => !field.options.some((option) => option.id === selection),
      )
    ) {
      return "Select only listed options, or use Other for this question.";
    }
    return value.length < field.minSelections ||
      value.length > field.maxSelections
      ? `Select between ${field.minSelections} and ${field.maxSelections} options.`
      : undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "Choose a numeric value.";
  }
  if (value < field.min || value > field.max) {
    return `Choose a value between ${field.min} and ${field.max}.`;
  }
  const steps = (value - field.min) / field.step;
  const tolerance = Math.min(
    1e-4,
    Math.max(1e-8, Number.EPSILON * Math.abs(steps) * 8),
  );
  return Math.abs(steps - Math.round(steps)) > tolerance
    ? `Choose a value in steps of ${field.step}.`
    : undefined;
}
