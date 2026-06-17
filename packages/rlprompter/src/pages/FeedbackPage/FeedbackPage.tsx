import { isLLMAgentDef } from "@comma-agents/core";
import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Header, TextField } from "../../components";
import { useExperiment } from "../../hooks/useExperiment";
import { useTheme } from "../../theme";

const FIELDS = ["notes", "score", "agent", "append"] as const;

/** Capture human feedback for an iteration and queue prompt overrides. */
export function FeedbackPage() {
  const theme = useTheme();
  const navigate = useNavigate();
  const {
    active,
    baseStrategy,
    selectedIterationId,
    queuedOverrides,
    submitFeedback,
    queueOverride,
  } = useExperiment();

  const [focus, setFocus] = useState(0);
  const [notes, setNotes] = useState("");
  const [score, setScore] = useState("");
  const [agent, setAgent] = useState("");
  const [append, setAppend] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const iteration = active?.iterations.find(
    (it) => it.id === selectedIterationId,
  );

  useEffect(() => {
    if (!active || !iteration) navigate("/experiment");
  }, [active, iteration, navigate]);

  async function saveFeedback(): Promise<void> {
    if (!iteration) return;
    const parsedScore = score.trim() ? Number(score.trim()) : undefined;
    await submitFeedback(iteration.id, {
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(parsedScore !== undefined && !Number.isNaN(parsedScore)
        ? { score: parsedScore }
        : {}),
    });
    setStatus("Feedback saved.");
  }

  function queue(): void {
    if (agent.trim().length === 0 || append.trim().length === 0) {
      setStatus("Provide an agent name and override text to queue.");
      return;
    }
    queueOverride({
      agentName: agent.trim(),
      appendToSystemPrompt: append.trim(),
    });
    setAppend("");
    setStatus(`Override queued for "${agent.trim()}".`);
  }

  useInput((input, key) => {
    if (key.escape) {
      navigate("/experiment");
      return;
    }
    if (key.tab) setFocus((current) => (current + 1) % FIELDS.length);
    if (key.ctrl && input === "s") void saveFeedback();
    if (key.ctrl && input === "q") queue();
  });

  if (!iteration || !active) return null;

  const llmAgents = baseStrategy
    ? Object.entries(baseStrategy.agents)
        .filter(([, def]) => isLLMAgentDef(def))
        .map(([agentName]) => agentName)
    : [];

  return (
    <Box flexDirection="column" gap={1}>
      <Header
        title={`Feedback — Iteration #${iteration.index}`}
        subtitle="Tab move · Ctrl+S save feedback · Ctrl+Q queue override · Esc back"
        hint={`${queuedOverrides.length} queued`}
      />

      <Box paddingX={theme.spacing.sm} flexDirection="column">
        <Text color={theme.colors.secondary}>Output under review</Text>
        <Text>{iteration.summary.text.slice(0, 800) || "(empty)"}</Text>
      </Box>

      <Box paddingX={theme.spacing.sm} flexDirection="column" gap={1}>
        <TextField
          label="Notes"
          value={notes}
          onChange={setNotes}
          isActive={focus === 0}
          placeholder="What was wrong or right about this output?"
        />
        <TextField
          label="Score (optional number)"
          value={score}
          onChange={setScore}
          isActive={focus === 1}
          placeholder="0–10"
        />
        <TextField
          label="Override agent"
          value={agent}
          onChange={setAgent}
          isActive={focus === 2}
          placeholder={llmAgents.join(", ") || "agent name"}
        />
        <TextField
          label="Append to that agent's system prompt"
          value={append}
          onChange={setAppend}
          isActive={focus === 3}
          placeholder="Be more concise; never invent file paths."
        />
        {status ? <Text color={theme.colors.success}>{status}</Text> : null}
      </Box>
    </Box>
  );
}
