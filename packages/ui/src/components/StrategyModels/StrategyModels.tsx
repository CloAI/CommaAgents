import { ChevronDown } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "../../design-system/Button";
import { Modal } from "../../design-system/Modal";
import { useCommaAgentsDaemon } from "../../hooks/useCommaAgentsDaemon";
import { useModelRoles } from "../../hooks/useModelRoles";
import {
  ModelRoleFields,
  ModelSelect,
  useModelChoices,
} from "../ModelRoleFields";
import styles from "./StrategyModels.module.scss";

/** The conversation's own role choices and how to change them. */
export interface StrategyModelBinding {
  /** Roles chosen for this conversation, as `provider/model` per role name. */
  readonly roles: Readonly<Record<string, string>>;
  /** Replace this conversation’s role overrides with the supplied choices. */
  readonly onChange: (changes: Readonly<Record<string, string>>) => void;
  /** Drop this conversation's choices so the daemon's models apply again. */
  readonly onReset: () => void;
}

/** The strategy whose model roles are shown and the conversation they belong to. */
export interface StrategyModelsProps {
  /** Path of the selected strategy; undefined while none is available. */
  readonly strategyPath: string | undefined;
  /** Choices made for this conversation only. */
  readonly binding: StrategyModelBinding;
}

/**
 * Choose the models behind the roles the selected strategy uses, for this conversation only.
 * Always available: without a strategy's own role list it offers the daemon's roles instead.
 * Roles without a choice here use the daemon's models, which Settings edits for every conversation.
 * @param {StrategyModelsProps} props - Component properties.
 * @returns {React.ReactElement} A dropdown for one role, or a button opening the editor for several.
 */
export function StrategyModels({ strategyPath, binding }: StrategyModelsProps) {
  // Keyed so each strategy starts with fresh state.
  return strategyPath === undefined ? (
    <RoleControls strategyRoles={undefined} binding={binding} />
  ) : (
    <DescribedStrategyModels
      key={strategyPath}
      strategyPath={strategyPath}
      binding={binding}
    />
  );
}

function DescribedStrategyModels({
  strategyPath,
  binding,
}: {
  strategyPath: string;
  binding: StrategyModelBinding;
}) {
  const described = useCommaAgentsDaemon(
    { command: "core.strategies.describe" },
    { strategyPath },
  );
  // An older daemon, a failed request, or a strategy without roles all fall back to the daemon's roles.
  const strategyRoles = described.data?.modelRoles;
  return (
    <RoleControls
      strategyRoles={strategyRoles?.length ? strategyRoles : undefined}
      binding={binding}
    />
  );
}

function RoleControls({
  strategyRoles,
  binding,
}: {
  strategyRoles: readonly string[] | undefined;
  binding: StrategyModelBinding;
}) {
  const { modelRoles, defaults } = useModelRoles();
  const models = useModelChoices();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Readonly<Record<string, string>>>({});
  const handleOpen = useCallback(() => {
    setDraft(binding.roles);
    setOpen(true);
  }, [binding.roles]);
  const handleClose = useCallback(() => setOpen(false), []);
  const roles = strategyRoles ?? [
    ...defaults.map((entry) => entry.name),
    ...Object.keys(modelRoles).filter(
      (name) => !defaults.some((entry) => entry.name === name),
    ),
  ];
  const [only] = roles;
  const values = { ...modelRoles, ...binding.roles };
  const overridden = roles.filter((role) => binding.roles[role] !== undefined);
  const reset = overridden.length > 0 && (
    <>
      <span className={styles.tag} data-tone="primary">
        Overridden
      </span>
      <Button
        className={styles.action}
        aria-label="Reset models"
        onClick={binding.onReset}
      >
        Reset
      </Button>
    </>
  );
  if (roles.length === 1 && only !== undefined) {
    return (
      <div className={styles.quick}>
        <ModelSelect
          label={`Model for @${only}`}
          value={values[only]}
          models={models}
          onChange={(model) =>
            binding.onChange({ ...binding.roles, [only]: model })
          }
        />
        {reset}
      </div>
    );
  }
  const unset = roles.filter((role) => values[role] === undefined).length;
  const summary =
    roles.length === 0
      ? "Models"
      : `${roles.length} models${overridden.length > 0 ? ` - ${overridden.length} overridden` : ""}`;
  const notSet = unset > 0 ? `${unset} not set` : undefined;
  return (
    <>
      <button
        type="button"
        aria-label={`Strategy models: ${summary}${notSet ? ` - ${notSet}` : ""}`}
        aria-haspopup="dialog"
        className={styles.trigger}
        onClick={handleOpen}
      >
        <span>
          {summary}
          {notSet && (
            <>
              {" - "}
              <span className={styles.notSet}>{notSet}</span>
            </>
          )}
        </span>
        <ChevronDown aria-hidden="true" className={styles.chevron} />
      </button>
      {open && (
        <Modal
          open
          title="Strategy models"
          onClose={handleClose}
          className={styles.modal}
        >
          <div className={styles.dialog}>
            <div className={styles.dialogToolbar}>
              <span className={styles.tag} data-tone="primary">
                {Object.keys(draft).length > 0
                  ? "Overridden"
                  : "Using defaults"}
              </span>
              <Button
                onClick={() => setDraft({})}
                disabled={Object.keys(draft).length === 0}
              >
                Reset
              </Button>
            </div>
            <p className={styles.intro}>
              {strategyRoles === undefined
                ? "Choices here apply to this conversation only. Roles you leave alone use the models set in Settings."
                : "Choices here apply to this conversation only, for the roles this strategy uses. Roles you leave alone use the models set in Settings."}
            </p>
            {roles.length === 0 ? (
              <p className={styles.intro}>
                No model roles are available from the daemon yet.
              </p>
            ) : (
              <ModelRoleFields
                roles={roles}
                definitions={defaults}
                values={{ ...modelRoles, ...draft }}
                onChange={(changes) =>
                  setDraft((current) => ({ ...current, ...changes }))
                }
              />
            )}
            <div className={styles.footer}>
              <Button onClick={handleClose}>Cancel</Button>
              <Button
                onClick={() => {
                  if (Object.keys(draft).length === 0) {
                    binding.onReset();
                  } else {
                    binding.onChange(draft);
                  }
                  handleClose();
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
