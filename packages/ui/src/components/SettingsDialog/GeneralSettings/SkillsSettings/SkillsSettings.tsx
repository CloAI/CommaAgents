import { useState } from "react";
import type { SkillSummary } from "@comma-agents/core";
import { Accordion } from "../../../../design-system/Accordion";
import { Button } from "../../../../design-system/Button";
import { Input } from "../../../../design-system/Input";
import { SearchHighlight } from "../../../../design-system/SearchHighlight";
import { useCommaAgentsDaemon } from "../../../../hooks/useCommaAgentsDaemon";
import { SkillDialog } from "./SkillDialog";
import styles from "./SkillsSettings.module.scss";

/**
 * Browse the daemon's available skills without loading their instructions into a run.
 * @returns {React.ReactElement} The skills subsection.
 */
export function SkillsSettings() {
  const { data, errors, clientError, isLoading } = useCommaAgentsDaemon(
    { command: "skills.list" },
    {},
  );
  return (
    <SkillsSettingsRender
      skills={data?.skills ?? []}
      isLoading={isLoading}
      error={errors?.message ?? clientError?.message}
    />
  );
}

/** Skill summaries and query feedback. */
export interface SkillsSettingsRenderProps {
  /** Available skills from the daemon's default workspace and global directories. */
  readonly skills: readonly SkillSummary[];
  /** Whether discovery is awaiting its response. */
  readonly isLoading: boolean;
  /** Daemon or local transport error. */
  readonly error?: string;
}

/**
 * Present a searchable list and own its optional instruction viewer.
 * @param {SkillsSettingsRenderProps} props - Summaries and discovery feedback.
 * @returns {React.ReactElement} The searchable skills browser.
 */
export function SkillsSettingsRender({
  skills,
  isLoading,
  error,
}: SkillsSettingsRenderProps) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const query = search.trim().toLowerCase();
  const matches = skills.filter(
    (skill) =>
      skill.name.toLowerCase().includes(query) ||
      skill.description.toLowerCase().includes(query),
  );
  return (
    <Accordion title="Skills">
      <div className={styles.content}>
        <Input
          type="search"
          aria-label="Search skills"
          placeholder="Search skills"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
            }
          }}
        />
        {error ? (
          <p role="alert" className={styles.message}>
            {error}
          </p>
        ) : isLoading ? (
          <p role="status" className={styles.message}>
            Loading skills...
          </p>
        ) : (
          <>
            <span role="status" className={styles.message}>
              {matches.length} / {skills.length} skills
            </span>
            {matches.length === 0 ? (
              <p className={styles.message}>
                {skills.length
                  ? "No skills match your search."
                  : "No skills found."}
              </p>
            ) : (
              <ul className={styles.list} aria-label="Available skills">
                {matches.map((skill) => (
                  <li key={skill.name} className={styles.skill}>
                    <h4 className={styles.name}>
                      <SearchHighlight text={skill.name} query={search} />
                    </h4>
                    <p className={styles.description}>
                      <SearchHighlight
                        text={skill.description}
                        query={search}
                      />
                    </p>
                    <Button
                      className={styles.view}
                      onClick={() => setSelected(skill.name)}
                      aria-label={`View full skill: ${skill.name}`}
                    >
                      View full skill
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      {selected && (
        <SkillDialog name={selected} onClose={() => setSelected(null)} />
      )}
    </Accordion>
  );
}
