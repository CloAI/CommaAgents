import { MultiSelect } from "../../../design-system/MultiSelect";
import { MODEL_CAPABILITIES } from "../../ModelDetails";
import type { ModelCapability } from "../ModelFilters.types";

/** Required capabilities and how to change them. */
export interface CapabilityFilterProps {
  /** Capabilities every shown model must have. */
  readonly value: readonly ModelCapability[];
  /** Commit a new set of required capabilities. */
  readonly onChange: (value: readonly ModelCapability[]) => void;
}

/**
 * Choose required model capabilities through the shared multi-select.
 * @param {CapabilityFilterProps} props - Controlled capability selection.
 * @returns {React.ReactElement} The capability filter.
 */
export function CapabilityFilter({ value, onChange }: CapabilityFilterProps) {
  return (
    <MultiSelect
      label="Filter by capabilities"
      listLabel="Capabilities"
      emptyLabel="All capabilities"
      options={MODEL_CAPABILITIES.map((capability) => ({
        value: capability.id,
        label: capability.label,
        icon: <capability.icon aria-hidden="true" />,
      }))}
      value={value}
      onChange={onChange}
    />
  );
}
