/**
 * Shared Tailwind utility-class constants for common UI primitives (domain-agnostic).
 *
 * These are plain string constants (not `@apply` CSS rules) — Tailwind
 * JIT still sees the static utility tokens, so the bundle stays the same
 * as inline strings while authoring stays terse. Adopted under Issue
 * #70's utility-first migration as a practical concession to repetition;
 * see `.issue/70/adr.md` (ADR-002) for the broader policy.
 */

/**
 * Pill button base — apply to every variant.
 *
 * hover/active utilities are guarded with `not-disabled:not-aria-disabled:`
 * so disabled buttons show no hover/active visual change. Both guards are
 * required because `pillBtn` is applied to anchors (`<Link>`) as well as
 * `<button>`: anchors cannot match `:disabled` and express the disabled
 * state via `aria-disabled` instead (hence the `aria-disabled:*` opacity
 * rules below). See `.issue/152/adr.md` ADR-001.
 */
export const pillBtn =
  "inline-flex items-center gap-1.5 h-9 px-4 rounded-pill bg-surface text-sm font-medium text-ink whitespace-nowrap transition-colors motion-reduce:transition-none hover:not-disabled:not-aria-disabled:bg-surface-hover active:not-disabled:not-aria-disabled:bg-surface-hover active:not-disabled:not-aria-disabled:scale-[0.985] motion-reduce:active:scale-100 disabled:opacity-disabled disabled:cursor-not-allowed aria-disabled:opacity-disabled aria-disabled:cursor-not-allowed max-sm:min-h-[44px]";

/** Append for primary pill button — drives "data-primary" variant. */
export const pillBtnPrimary =
  "data-[primary]:bg-accent data-[primary]:text-white data-[primary]:hover:not-disabled:not-aria-disabled:bg-accent-hover data-[primary]:active:not-disabled:not-aria-disabled:bg-accent-pressed";

/**
 * Append for danger pill button — drives "data-danger" variant.
 *
 * Apply as `` `${pillBtn} ${pillBtnDanger}` `` with `data-danger=""`, mirroring
 * `pillBtnPrimary`. The `data-[danger]:` variant is required: a plain
 * `bg-error-surface` appended to `pillBtn` does NOT reliably override the
 * base `bg-surface` / `text-ink`, because same-property utilities are
 * resolved by Tailwind's generated-CSS order, not class-string order.
 * Variant utilities sort after base utilities and therefore win
 * deterministically. See `.issue/273/adr.md` ADR-003.
 */
export const pillBtnDanger =
  "data-[danger]:bg-error-surface data-[danger]:text-error data-[danger]:hover:not-disabled:not-aria-disabled:bg-error-surface";

/**
 * Append for ghost-danger pill button — drives "data-ghost-danger" variant.
 *
 * Unlike `pillBtnDanger` (a *filled* chip: error-surface background at rest),
 * this is a *ghost* destructive button — transparent at rest with secondary
 * ink text, turning to error-surface + error text only on hover/active. Used
 * for low-emphasis destructive actions (reset / delete rows) where a
 * permanently red chip would be too loud.
 *
 * Apply as `` `${pillBtn} ${pillBtnGhostDanger}` `` with `data-ghost-danger=""`,
 * mirroring `pillBtnDanger`. The `data-[ghost-danger]:` variant is required
 * for the same reason as `pillBtnDanger`: same-property utilities are resolved
 * by Tailwind's generated-CSS order, not class-string order, so variant
 * utilities (which sort after base utilities) win deterministically over the
 * base `bg-surface` / `text-ink`. See `.issue/273/adr.md` ADR-003.
 *
 * The base's `active:…:bg-surface-hover` is also overridden here
 * (`data-[ghost-danger]:active:…:bg-error-surface`) so that pressing the
 * button does not momentarily flash the gray base hover/active color over the
 * error-surface — see `.issue/442/adr.md` ADR-001.
 */
export const pillBtnGhostDanger =
  "data-[ghost-danger]:bg-transparent data-[ghost-danger]:text-ink-secondary data-[ghost-danger]:hover:not-disabled:not-aria-disabled:bg-error-surface data-[ghost-danger]:hover:not-disabled:not-aria-disabled:text-error data-[ghost-danger]:active:not-disabled:not-aria-disabled:bg-error-surface data-[ghost-danger]:active:not-disabled:not-aria-disabled:text-error";

/**
 * Tall size add-on for pill buttons — overrides the base `h-9 / px-4 / text-sm`
 * dimensions with `h-12 / px-8 / text-md` and adds `justify-center`.
 *
 * The size utilities win over the base ones because Tailwind resolves
 * same-property utilities by generated-CSS order (not class-string order),
 * and both spacing (`h-12 > h-9`, `px-8 > px-4`) and the custom `text-md`
 * token sort after their base counterparts. This holds only for the
 * *enlarging* direction; a shrinking size would lose and require a
 * `data-[…]:` variant. See `.issue/416/adr.md` ADR-005 (and ADR-001 for why
 * `gap` is intentionally omitted: a `gap-0` add-on cannot override the base
 * `gap-1.5`, and the gap is harmless for text-only buttons anyway).
 *
 * `justify-center` is required because tall pills are run width-constrained
 * (full-width or `min-w-[200px]`), so the base `inline-flex items-center`
 * (horizontal default `flex-start`) would otherwise left-align the label.
 * It is inert for content-width usage.
 *
 * Apply as either:
 * - primary: `` `${pillBtn} ${pillBtnTall} ${pillBtnPrimary}` `` with `data-primary=""`
 * - surface: `` `${pillBtn} ${pillBtnTall}` `` (no `data-primary` — base surface colors apply)
 */
export const pillBtnTall = "h-12 px-8 text-md justify-center";

/**
 * Small size add-on for pill buttons — drives "data-sm" variant.
 *
 * Overrides the base `h-9 / px-4 / text-sm` with `h-7 / px-3 / text-xs` and
 * cancels the base mobile tap-target floor (`max-sm:min-h-[44px]`).
 *
 * Unlike `pillBtnTall` (an enlarging add-on usable as plain utilities), this
 * is a *shrinking* size, so plain utilities lose: same-property utilities are
 * resolved by generated-CSS order, and the smaller `h-7` / `px-3` sort
 * *before* the base `h-9` / `px-4` and therefore cannot override them. The
 * `data-[sm]:` variant sorts after the base utilities and wins
 * deterministically. See `.issue/416/adr.md` ADR-005 (shrink-direction
 * constraint) and `.issue/442/adr.md` ADR-003.
 *
 * `gap` is intentionally not overridden (the base `gap-1.5` is harmless for
 * text-only small buttons; mirrors `pillBtnTall`, #416 ADR-001).
 *
 * Apply by appending after the other variants, e.g.
 * `` `${pillBtn} ${pillBtnGhostDanger} ${pillBtnSm}` `` with
 * `data-ghost-danger="" data-sm=""`.
 */
export const pillBtnSm =
  "data-[sm]:h-7 data-[sm]:px-3 data-[sm]:text-xs data-[sm]:max-sm:min-h-0";

/**
 * Icon-only add-on for pill buttons — drives "data-icon" variant. Turns the
 * text-oriented pill (`h-9 px-4`) into a square `h-9 w-9` button so a lone icon
 * sits centered without the `px-4` text padding that otherwise stretches it
 * into an awkward oblong. With the base `rounded-pill` (`--radius-pill: 980px`)
 * a 36×36 square renders as a circle, keeping it in the same radius family as
 * the labeled pills.
 *
 * `px-0` is a *shrinking* override of the base `px-4`, so like `pillBtnSm` it
 * must be a `data-[icon]:` variant rather than a plain utility: same-property
 * utilities are resolved by Tailwind's generated-CSS order, and the smaller
 * `px-0` sorts *before* `px-4` and would lose. The variant sorts after the base
 * and wins deterministically. `w-9` / `justify-center` have no base counterpart
 * but are kept under the same variant for cohesion. The base mobile tap-target
 * floor only sets `min-h`; `data-[icon]:max-sm:min-w-[44px]` adds the matching
 * width floor so the circle meets the 44×44 touch target (§7.1). See
 * `.issue/416/adr.md` ADR-005 (shrink-direction constraint) and
 * `.issue/459/adr.md` ADR-002.
 *
 * Composes with the color variants, e.g.
 * `` `${pillBtn} ${pillBtnIcon} ${pillBtnPrimary}` `` with `data-icon="" data-primary`.
 */
export const pillBtnIcon =
  "data-[icon]:w-9 data-[icon]:px-0 data-[icon]:justify-center data-[icon]:max-sm:min-w-[44px]";

/**
 * Nav-item link base — the shared primitive behind the sidebar nav links
 * (`layout/styles.ts` `NAV_ITEM`) and the directory-tree links
 * (`directory/styles.ts` `TREE_ITEM_LINK`).
 *
 * Only the genuinely common tokens live here: box model, typography, the
 * `rounded-md` shape, and the active-state font-weight bump (`data-[active]` /
 * `aria-[current=page]`, mirroring TanStack Router's `activeProps`). The
 * selection *background* is intentionally NOT included: the sidebar paints it
 * on the link itself, whereas the tree paints it on the surrounding row
 * (`TREE_ITEM_ROW`) so the highlight spans the caret/action columns. Each
 * consumer composes its own surface/layout add-ons (`relative hover:bg-surface
 * …` for the sidebar, `flex-1 min-w-0 truncate` for the tree). See `.issue/336`.
 */
export const navItem =
  "flex items-center gap-2 px-3 py-[7px] rounded-md text-sm text-ink cursor-pointer transition-colors motion-reduce:transition-none select-none no-underline data-[active]:font-medium aria-[current=page]:font-medium";

/**
 * Text-link decoration — accent color + hover-only underline (with offset).
 * The shared primitive behind the auth footer/field links
 * (`auth/styles.ts` `AUTH_FOOTER_LINK` / `FIELD_LINK`) and the inline
 * terms/privacy links in `SignUpForm` / `AdminSignUpForm`.
 *
 * Only the decoration is shared; each consumer composes its own size/layout
 * add-ons: `AUTH_FOOTER_LINK` is `textLink` verbatim and `FIELD_LINK` is
 * `` `text-sm ${textLink}` ``. Keeping size out is deliberate —
 * `AUTH_FOOTER_LINK` inherits its size whereas `FIELD_LINK` sets `text-sm`
 * explicitly, so decoration-only is the correct SSOT boundary.
 *
 * The pill-style `PUBLIC_TEXT_LINK` (`public/styles.ts`) is intentionally a
 * separate primitive: it is a surface-hover pill, not an accent-underline link.
 *
 * Note-body links (`.note-detail-content a` in `app/styles/index.css`) are a
 * near-relative — they share the accent color and the hover 3px offset, but
 * are *always* underlined (prose convention) whereas `textLink` underlines on
 * hover only. They also cannot be utility-ified — their `<a>` comes from
 * `dangerouslySetInnerHTML`, so they stay as CSS (documented exception; see
 * `.issue/70/adr.md` ADR-002). See `.issue/336`.
 */
export const textLink =
  "text-accent hover:underline hover:[text-underline-offset:3px]";

/** Field wrapper. */
export const field = "flex flex-col gap-2 mb-4";

/** Field label. */
export const fieldLabel = "text-sm font-medium text-ink-secondary";

/** Field input/textarea/select base. */
export const fieldControl =
  "w-full h-10 rounded-md border border-transparent bg-surface px-3 py-2.5 text-sm text-ink outline-none transition-colors motion-reduce:transition-none focus:border-accent focus:bg-bg disabled:opacity-disabled disabled:cursor-not-allowed";

/** Field textarea modifier. */
export const fieldTextarea = "font-mono text-mono min-h-[320px] resize-y";

/** Form error message (inline). */
export const formError = "text-error text-sm mt-2";

/** Chip base. */
export const chip =
  "inline-flex items-center gap-1.5 h-7 px-3 rounded-pill bg-surface text-xs text-ink";

/** Modal dialog backdrop. */
export const dialogBackdrop =
  "fixed inset-0 z-[100] bg-black/35 flex items-center justify-center p-4";

/**
 * Modal dialog body.
 *
 * `relative` establishes the position context required by the opt-in close
 * button (`dialogCloseButton`, `absolute top-3 right-3`) in `Dialog`. It is
 * inert for panels whose children do not use `absolute`; see `.issue/104/adr.md`
 * (ADR-005) for the audit confirming no visual `absolute` descendants exist
 * in current consumers (SR_ONLY clipped text is unaffected).
 */
export const dialog =
  "relative flex flex-col bg-bg rounded-lg p-6 max-w-[480px] w-full max-h-[90vh] overflow-y-auto shadow-lg";

/**
 * Opt-in close ("×") button rendered at the top-right of the dialog panel
 * when `Dialog` receives `showCloseButton`. Pairs with the `relative` token
 * on `dialog` for the absolute positioning context. See `Dialog`'s JSDoc
 * for the surrounding a11y contract (focus trap inclusion, initial-focus
 * exclusion, `closable=false` disabling).
 */
export const dialogCloseButton =
  "absolute top-3 right-3 inline-flex items-center justify-center w-8 h-8 max-sm:min-w-[44px] max-sm:min-h-[44px] rounded-pill text-ink-secondary text-xl leading-none hover:not-disabled:bg-surface hover:not-disabled:text-ink transition-colors motion-reduce:transition-none disabled:opacity-disabled disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent";

/** Modal dialog title. */
export const dialogTitle = "text-lg font-medium mb-4";

/** Modal dialog actions row. */
export const dialogActions = "inline-flex gap-2 mt-4 justify-end w-full";

/**
 * Popover panel shell for the WAI-ARIA `role="menu"` dropdowns
 * (`<Menu>`/`<MenuItem>` primitive). Holds only the panel chrome
 * (border / surface / shadow / vertical padding / stacking); width and
 * anchor position differ per consumer (Directory 160px, User 220px, Note
 * 180px) and are supplied via the caller's `panelClassName`
 * (`absolute right-0 mt-1 min-w-[…]`). See `.issue/467`.
 */
export const menuPanel =
  "rounded-md border border-hairline bg-bg shadow-sm py-1";

/**
 * A single `role="menuitem"` row inside `menuPanel`.
 *
 * Highlight uses `focus-visible:` (not `focus:`) because the roving-tabindex
 * primitive moves DOM `.focus()` to the active item programmatically — a plain
 * `focus:` would paint the hover-gray on mouse-driven open. `focus-visible:`
 * restricts the highlight to keyboard navigation (#463 ADR-001, #467 ADR-002).
 *
 * Disabled items use `aria-disabled` (not the `disabled` attribute) so they
 * stay focusable and keep their place in the roving cycle (#467 ADR-003).
 * Hover (base and danger) is guarded with `not-aria-disabled:` so disabled
 * items show no hover change. The `data-[danger]:…:bg-error-surface` 2-stack
 * variants sort after the single `focus-visible:`/`hover:` rules and win
 * deterministically (same mechanism as `auth/styles.ts` INPUT / ADR-003).
 */
export const menuItem =
  "flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-ink outline-none hover:not-aria-disabled:bg-surface focus-visible:bg-surface aria-disabled:opacity-disabled aria-disabled:cursor-not-allowed data-[danger]:text-error data-[danger]:hover:not-aria-disabled:bg-error-surface data-[danger]:focus-visible:bg-error-surface";

/** Separator (`<hr>`) between menu item groups inside `menuPanel`. */
export const menuSeparator = "my-1 h-0 border-0 border-t border-hairline";

/**
 * Inline alert ("案D") — the single page-embedded notification box that
 * unifies the former `.callout` / `.notice` / `.banner` patterns. White
 * surface + a semantic hairline border + `--shadow-xs`, with the border,
 * icon and title all driven by one `--alert-accent` variable (see
 * `spec/design/index.md`「フィードバック・エラー表示原則」). Compose from the
 * parts below: `ALERT` (+ optional semantic modifier) on the box, `ALERT_ICON`
 * on the leading icon span, `ALERT_CONTENT` wrapping `ALERT_TITLE` + `ALERT_BODY`.
 *
 * `margin` is intentionally excluded from `ALERT` — callers vary between
 * form-gap layouts (0) and standalone placement (`mt-6` / `mb-8`), so the
 * spacing is supplied at the call site.
 *
 * The border carries both width (`border`) and color (the arbitrary
 * `border-[color-mix(...)]`): the arbitrary utility only emits `border-color`,
 * so the plain `border` is required for the 1px width. See `.issue/539/adr.md`
 * (ADR-001/002).
 */
export const ALERT =
  "flex items-start gap-3 p-4 rounded-lg bg-bg shadow-xs text-left border border-[color-mix(in_oklab,var(--alert-accent)_30%,transparent)] [--alert-accent:var(--color-accent)]";

/** Info semantic modifier (無彩色 grey — `--color-info` aliases `--color-accent`). */
export const ALERT_INFO = "[--alert-accent:var(--color-info)]";

/** Success semantic modifier. */
export const ALERT_SUCCESS = "[--alert-accent:var(--color-success)]";

/** Warning semantic modifier. */
export const ALERT_WARNING = "[--alert-accent:var(--color-warning)]";

/** Error semantic modifier. */
export const ALERT_ERROR = "[--alert-accent:var(--color-error)]";

/** Leading icon span — colored by `--alert-accent`, decorative (`aria-hidden`). */
export const ALERT_ICON = "text-[var(--alert-accent)] shrink-0 mt-px";

/** Title + body column. */
export const ALERT_CONTENT = "flex flex-col items-start gap-0.5 min-w-0";

/** Alert title — accent-colored, semibold. */
export const ALERT_TITLE =
  "m-0 text-sm font-semibold tracking-[-0.01em] text-[var(--alert-accent)]";

/**
 * Alert body — secondary ink. `<strong>` inside is promoted to primary ink +
 * medium weight to match the mock.
 */
export const ALERT_BODY =
  "m-0 text-sm text-ink-secondary leading-relaxed [&_strong]:text-ink [&_strong]:font-medium";

/** Inline `<code>` inside an alert body (P15 / P47 mono local variant). */
export const ALERT_BODY_CODE = "font-mono text-xs";

/**
 * Alert action — an inline button/link beneath the body, accent-colored with a
 * hover underline. Disabled state dims via `opacity-disabled`.
 */
export const ALERT_ACTION =
  "inline-flex items-center gap-1 mt-2 text-sm font-medium text-[var(--alert-accent)] hover:underline hover:[text-underline-offset:3px] disabled:opacity-disabled disabled:cursor-not-allowed";

/** Radio/checkbox row. */
export const radioRow =
  "flex items-center gap-2 py-1 text-sm cursor-pointer [&_input]:accent-accent";

/** Checkbox row. */
export const checkboxRow =
  "flex items-start gap-3 text-sm text-ink-secondary leading-normal cursor-pointer [&_input]:w-4 [&_input]:h-4 [&_input]:mt-[2px] [&_input]:accent-accent [&_input]:cursor-pointer [&_input]:shrink-0";
