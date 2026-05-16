/**
 * Example 09 — Prompt Templates (LiquidJS)
 *
 * Demonstrates createPromptTemplate() for building reusable prompt
 * templates with the full Liquid template language.
 *
 * Prompt templates use LiquidJS syntax — {{ variable }} for interpolation,
 * {% if %} for conditionals, {% for %} for loops, and filters like
 * | upcase, | env, | exec for transformations.
 *
 * Run:
 *   MODEL=openai/gpt-4o bun run examples/09-prompt-templates.ts
 *
 * Concepts:
 *   - createPromptTemplate() for parameterized prompts
 *   - template.render() to fill in variables
 *   - Liquid conditionals, loops, and filters
 *   - Custom filters: env, file, exec
 *   - Using templates with createAgent() system prompts
 */

import { createAgent, createPromptTemplate } from "@comma-agents/core";
import { getModelString } from "./helpers";

async function main() {
  const model = getModelString();

  // --- Create a reusable prompt template with Liquid syntax ---
  const codeReviewTemplate = createPromptTemplate({
    template:
      "You are a {{ role }} specializing in {{ language }}. " +
      "Review the following code for {{ focus }}. " +
      "Be constructive and specific in your feedback." +
      "{% if tools.size > 0 %}\n\nAvailable tools:\n{% for tool in tools %}- {{ tool }}\n{% endfor %}{% endif %}",
  });

  // --- Fill in the template with different configurations ---

  // Security-focused review
  const securityPrompt = await codeReviewTemplate.render({
    role: "security auditor",
    language: "TypeScript",
    focus: "security vulnerabilities, input validation, and injection risks",
    tools: ["run_command", "read_file"],
  });

  // Performance-focused review
  const performancePrompt = await codeReviewTemplate.render({
    role: "performance engineer",
    language: "TypeScript",
    focus:
      "performance bottlenecks, unnecessary allocations, and algorithmic complexity",
    tools: [],
  });

  console.log("--- Security Review Prompt ---");
  console.log(securityPrompt);
  console.log("\n--- Performance Review Prompt ---");
  console.log(performancePrompt);

  // --- Create agents with templated prompts ---
  const securityReviewer = createAgent({
    name: "security-reviewer",
    model,
    systemPrompt: securityPrompt,
  });

  const performanceReviewer = createAgent({
    name: "performance-reviewer",
    model,
    systemPrompt: performancePrompt,
  });

  const codeSnippet = `
function processUserInput(input: string) {
  const query = "SELECT * FROM users WHERE name = '" + input + "'";
  const result = db.query(query);
  const items = [];
  for (let i = 0; i < result.length; i++) {
    items.push(JSON.parse(JSON.stringify(result[i])));
  }
  return items;
}`;

  console.log("\n--- Code to Review ---");
  console.log(codeSnippet);

  // --- Run both reviewers ---
  console.log("\n--- Security Review ---");
  const securityResult = await securityReviewer.call(codeSnippet);
  console.log(securityResult.text);

  console.log("\n--- Performance Review ---");
  const perfResult = await performanceReviewer.call(codeSnippet);
  console.log(perfResult.text);
}

main().catch(console.error);
