/**
 * Example 09 — Prompt Templates
 *
 * Demonstrates createPromptTemplate() for building reusable prompt
 * templates with typed variable substitution.
 *
 * Prompt templates let you define a template string with {{variable}}
 * placeholders, then fill them in at call time. This is useful for:
 *   - Reusable system prompts across agents
 *   - Dynamic context injection (e.g., user name, date, project info)
 *   - Parameterized agent configurations
 *
 * Run:
 *   MODEL=openai/gpt-4o bun run examples/09-prompt-templates.ts
 *
 * Concepts:
 *   - createPromptTemplate() for parameterized prompts
 *   - template.format() to fill in variables
 *   - Using templates with createAgent() system prompts
 */

import { createAgent, createPromptTemplate } from "@comma-agents/core";
import { getModel } from "./helpers";

async function main() {
  const model = await getModel();

  // --- Create a reusable prompt template ---
  const codeReviewTemplate = createPromptTemplate({
    template:
      "You are a {{role}} specializing in {{language}}. " +
      "Review the following code for {{focus}}. " +
      "Be constructive and specific in your feedback.",
  });

  // --- Fill in the template with different configurations ---

  // Security-focused review
  const securityPrompt = codeReviewTemplate.format({
    role: "security auditor",
    language: "TypeScript",
    focus: "security vulnerabilities, input validation, and injection risks",
  });

  // Performance-focused review
  const performancePrompt = codeReviewTemplate.format({
    role: "performance engineer",
    language: "TypeScript",
    focus: "performance bottlenecks, unnecessary allocations, and algorithmic complexity",
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
