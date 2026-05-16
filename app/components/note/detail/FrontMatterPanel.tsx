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

export function renderFrontMatterValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="front-matter-empty">—</span>;
  }
  if (typeof value === "string") {
    return <span className="front-matter-string">{value}</span>;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="front-matter-scalar">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="front-matter-empty">[]</span>;
    }
    return (
      <ul className="front-matter-array">
        {value.map((item, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: positional rendering of pure value
          <li key={i}>{renderFrontMatterValue(item)}</li>
        ))}
      </ul>
    );
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return <span className="front-matter-empty">{"{}"}</span>;
    }
    return (
      <dl className="front-matter-object">
        {entries.map(([k, v]) => (
          <div className="front-matter-object-row" key={k}>
            <dt>{k}</dt>
            <dd>{renderFrontMatterValue(v)}</dd>
          </div>
        ))}
      </dl>
    );
  }
  return <span className="front-matter-scalar">{String(value)}</span>;
}

export function FrontMatterPanel({ frontMatter }: FrontMatterPanelProps) {
  const keys = Object.keys(frontMatter);
  if (keys.length === 0) return null;

  const knownPresent: KnownKey[] = KNOWN_KEY_ORDER.filter(
    (k) => k in frontMatter,
  );
  const others = keys.filter((k) => !KNOWN_KEY_SET.has(k));

  return (
    <section className="front-matter-panel" aria-label="FrontMatter">
      <h2 className="front-matter-panel-title">FrontMatter</h2>
      {knownPresent.length > 0 ? (
        <dl className="front-matter-known">
          {knownPresent.map((k) => (
            <div className="front-matter-known-row" key={k}>
              <dt>{k}</dt>
              <dd>{renderFrontMatterValue(frontMatter[k])}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {others.length > 0 ? (
        <details className="front-matter-others">
          <summary>その他 ({others.length})</summary>
          <dl className="front-matter-known">
            {others.map((k) => (
              <div className="front-matter-known-row" key={k}>
                <dt>{k}</dt>
                <dd>{renderFrontMatterValue(frontMatter[k])}</dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
    </section>
  );
}
