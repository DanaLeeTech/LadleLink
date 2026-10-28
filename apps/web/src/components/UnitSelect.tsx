import type { ProduceSize } from "@ladlelink/types";
import {
  MASS_UNITS,
  PORTION_UNITS,
  pluralUnitLabel,
  VOLUME_UNITS,
  unitLabel,
} from "@ladlelink/units";

const PRODUCE_SIZES: ProduceSize[] = ["small", "medium", "large"];
const PRODUCE_SIZE_SET = new Set<string>(PRODUCE_SIZES);

const MEASURE_UNIT_SET = new Set<string>([
  ...VOLUME_UNITS,
  ...MASS_UNITS,
  ...PORTION_UNITS,
  "",
]);

export function isProduceSize(value: string): value is ProduceSize {
  return PRODUCE_SIZE_SET.has(value);
}

interface UnitSelectProps {
  value: string;
  onChange: (unit: string) => void;
  "aria-label"?: string;
  id?: string;
  className?: string;
  /** Prefix option labels (e.g. "display: "). */
  labelPrefix?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  title?: string;
  /** Include small/medium/large (reader produce conversion). */
  includeSizes?: boolean;
  /**
   * Restrict the Countable optgroup.
   * - `undefined` (default): full PORTION_UNITS list (edit/import).
   * - `null`: hide Countable entirely (reader, non-countable authored unit).
   * - string: show only that countable (reader, authored countable).
   */
  allowedCountable?: string | null;
  /**
   * Reader only: pluralize the unit/countable labels for this amount
   * ("2 cups", "6 eggs"). Omit on edit/import so the stored unit stays neutral.
   */
  quantity?: number;
}

/** Unit label for an option; pluralized only when the reader passes an amount. */
function unitOptionLabel(unit: string, quantity?: number): string {
  const base = unitLabel(unit);
  if (quantity == null) return base;
  return pluralUnitLabel(unit, quantity) || base;
}

export function UnitSelect({
  value,
  onChange,
  "aria-label": ariaLabel = "Unit",
  id,
  className = "unit-select",
  labelPrefix = "",
  allowEmpty = true,
  emptyLabel = "—",
  title,
  includeSizes = false,
  allowedCountable,
  quantity,
}: UnitSelectProps) {
  const countableUnits =
    allowedCountable === undefined
      ? [...PORTION_UNITS]
      : allowedCountable
        ? [allowedCountable]
        : [];

  const countableSet = new Set(countableUnits);
  const extra =
    value &&
    !MEASURE_UNIT_SET.has(value) &&
    !countableSet.has(value) &&
    !(includeSizes && isProduceSize(value)) ? (
      <option value={value}>
        {labelPrefix}
        {unitOptionLabel(value, quantity)}
      </option>
    ) : null;

  return (
    <select
      id={id}
      className={className}
      value={value}
      title={title}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
    >
      {allowEmpty && (
        <option value="">
          {labelPrefix}
          {emptyLabel}
        </option>
      )}
      {includeSizes && (
        <optgroup label="Size">
          {PRODUCE_SIZES.map((s) => (
            <option key={s} value={s}>
              {labelPrefix}
              {s}
            </option>
          ))}
        </optgroup>
      )}
      {extra}
      <optgroup label="Volume">
        {VOLUME_UNITS.map((u) => (
          <option key={u} value={u}>
            {labelPrefix}
            {unitOptionLabel(u, quantity)}
          </option>
        ))}
      </optgroup>
      <optgroup label="Mass">
        {MASS_UNITS.map((u) => (
          <option key={u} value={u}>
            {labelPrefix}
            {unitOptionLabel(u, quantity)}
          </option>
        ))}
      </optgroup>
      {countableUnits.length > 0 && (
        <optgroup label="Countable">
          {countableUnits.map((u) => (
            <option key={u} value={u}>
              {labelPrefix}
              {unitOptionLabel(u, quantity)}
            </option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
