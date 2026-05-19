import type { FrontMatterDTO } from "@/core/application/dto/note";

/**
 * Pure presentational panel for FrontMatter.
 *
 * Known keys (`title`, `date`, `tags`, `description`, `slug`) are shown
 * first as a structured list. Any remaining keys are collapsed under a
 * `<details>` block.
 *
 * `renderFrontMatterValue` is exported as a pure recursive renderer so
 * tests / external callers can reuse the same nested-value formatter.
 */
const KNOWN_KEY_ORDER = [
  "title",
  "date",
  "tags",
  "description",
  "slug",
] as const;

type KnownKey = (typeof KNOWN_KEY_ORDER)[number];

const KNOWN_KEY_SET = new Set<string>(KNOWN_KEY_ORDER);

export type FrontMatterPanelProps = Readonly<{
  frontMatter: FrontMatterDTO;
}>;

const EMPTY = "text-ink-tertiary italic";
const SCALAR = "font-mono text-mono";
const ARRAY_LIST = "flex flex-wrap gap-[6px] m-0 p-0 list-none";
const ARRAY_ITEM = "bg-surface-hover px-2 py-[2px] rounded-xs text-xs";
const OBJ_DL = "grid gap-1 m-0 p-2 bg-surface-hover rounded-xs";
const OBJ_ROW = "grid grid-cols-[auto_1fr] gap-2";
const OBJ_DT = "font-mono text-xs text-ink-tertiary";
const KNOWN_DL = "grid grid-cols-1 gap-2 m-0";
const KNOWN_ROW =
  "grid grid-cols-[120px_1fr] gap-3 items-start py-2 border-b border-hairline last:border-0";
const KNOWN_DT = "text-xs font-medium text-ink-tertiary font-mono";
const KNOWN_DD = "m-0 text-[13px] text-ink break-words";

export function renderFrontMatterValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className={EMPTY}>—</span>;
  }
  if (typeof value === "string") {
    return <span>{value}</span>;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <span className={SCALAR}>{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className={EMPTY}>[]</span>;
    }
    return (
      <ul className={ARRAY_LIST}>
        {value.map((item, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: positional rendering of pure value
          <li key={i} className={ARRAY_ITEM}>
            {renderFrontMatterValue(item)}
          </li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return <span className={EMPTY}>{"{}"}</span>;
    }
    return (
      <dl className={OBJ_DL}>
        {entries.map(([k, v]) => (
          <div className={OBJ_ROW} key={k}>
            <dt className={OBJ_DT}>{k}</dt>
            <dd className="m-0">{renderFrontMatterValue(v)}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span className={SCALAR}>{String(value)}</span>;
}

export function FrontMatterPanel({ frontMatter }: FrontMatterPanelProps) {
  const keys = Object.keys(frontMatter);
  if (keys.length === 0) return null;

  const knownPresent: KnownKey[] = KNOWN_KEY_ORDER.filter(
    (k) => k in frontMatter,
  );
  const others = keys.filter((k) => !KNOWN_KEY_SET.has(k));

  return (
    <section
      className="mt-8 px-5 py-4 rounded-lg border border-hairline bg-surface"
      aria-label="FrontMatter"
    >
      <h2 className="text-lg font-semibold mb-3">FrontMatter</h2>
      {knownPresent.length > 0 ? (
        <dl className={KNOWN_DL}>
          {knownPresent.map((k) => (
            <div className={KNOWN_ROW} key={k}>
              <dt className={KNOWN_DT}>{k}</dt>
              <dd className={KNOWN_DD}>
                {renderFrontMatterValue(frontMatter[k])}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {others.length > 0 ? (
        <details className="mt-3">
          <summary className="cursor-pointer py-2 text-[13px] text-ink-secondary">
            その他 ({others.length})
          </summary>
          <dl className={KNOWN_DL}>
            {others.map((k) => (
              <div className={KNOWN_ROW} key={k}>
                <dt className={KNOWN_DT}>{k}</dt>
                <dd className={KNOWN_DD}>
                  {renderFrontMatterValue(frontMatter[k])}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
    </section>
  );
}
