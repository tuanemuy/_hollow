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
 * Mobile touch-target floor (single source of truth).
 *
 * The design guideline (`spec/design/index.md` §3 / §7.1) intentionally keeps
 * only the *intent* — "don't mis-tap on touch" — and the WCAG references
 * (floor = 2.5.8 Target Size (Minimum) AA, target = 2.5.5 Target Size
 * (Enhanced) AAA). The concrete px lives here so it is managed in one place
 * and the guideline does not depend on this constant's name (spec → impl
 * dependency direction; see `.issue/633/adr.md` ADR-001).
 *
 * `TOUCH_TARGET` floors height only; `TOUCH_TARGET_SQUARE` floors both width
 * and height for square icon-only buttons that must hit the target as a
 * square.
 */
export const TOUCH_TARGET = "max-sm:min-h-[44px]";

/** Square touch-target floor — both axes (icon-only / close buttons). */
export const TOUCH_TARGET_SQUARE = "max-sm:min-w-[44px] max-sm:min-h-[44px]";

/**
 * Pill button base — apply to every variant.
 *
 * The standard button/input height is unified at `h-10` (40px) so a pill sits
 * flush with an adjacent `fieldControl` input on desktop. On mobile the
 * `TOUCH_TARGET` floor lifts the effective height to the touch target. See
 * `.issue/633/adr.md` ADR-002.
 *
 * hover/active utilities are guarded with `not-disabled:not-aria-disabled:`
 * so disabled buttons show no hover/active visual change. Both guards are
 * required because `pillBtn` is applied to anchors (`<Link>`) as well as
 * `<button>`: anchors cannot match `:disabled` and express the disabled
 * state via `aria-disabled` instead (hence the `aria-disabled:*` opacity
 * rules below). See `.issue/152/adr.md` ADR-001.
 */
export const pillBtn = `inline-flex items-center gap-1.5 h-10 px-4 rounded-pill bg-surface text-sm font-medium text-ink whitespace-nowrap transition-colors motion-reduce:transition-none hover:not-disabled:not-aria-disabled:bg-surface-hover active:not-disabled:not-aria-disabled:bg-surface-hover active:not-disabled:not-aria-disabled:scale-[0.985] motion-reduce:active:scale-100 disabled:opacity-disabled disabled:cursor-not-allowed aria-disabled:opacity-disabled aria-disabled:cursor-not-allowed ${TOUCH_TARGET}`;

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
 * Append for neutral ghost pill button — drives "data-ghost" variant.
 *
 * Transparent at rest with secondary ink (a low-emphasis secondary action),
 * turning to surface + primary ink on hover/active. The `data-on` compound
 * (`data-[ghost]:data-[on]:…`) gives the same surface fill as a *persistent*
 * toggled-on state, for buttons that latch (e.g. the 選択 select-mode toggle).
 *
 * Apply as `` `${pillBtn} ${pillBtnGhost}` `` with `data-ghost=""` (and
 * `data-on` for the latched state). The `data-[ghost]:` variant is required
 * for the same reason as `pillBtnGhostDanger`: variant utilities sort after
 * the base `bg-surface` / `text-ink` and win deterministically. The base's
 * `active:…:bg-surface-hover` press color is overridden to `bg-surface` so the
 * press does not flash a darker gray over the ghost. See `.issue/273/adr.md`
 * ADR-003 and `.issue/442/adr.md` ADR-001.
 */
export const pillBtnGhost =
  "data-[ghost]:bg-transparent data-[ghost]:text-ink-secondary data-[ghost]:hover:not-disabled:not-aria-disabled:bg-surface data-[ghost]:hover:not-disabled:not-aria-disabled:text-ink data-[ghost]:active:not-disabled:not-aria-disabled:bg-surface data-[ghost]:active:not-disabled:not-aria-disabled:text-ink data-[ghost]:data-[on]:bg-surface data-[ghost]:data-[on]:text-ink";

/**
 * Tall size add-on for pill buttons — overrides the base `h-10 / px-4 / text-sm`
 * dimensions with `h-12 / px-8 / text-md` and adds `justify-center`.
 *
 * The size utilities win over the base ones because Tailwind resolves
 * same-property utilities by generated-CSS order (not class-string order),
 * and both spacing (`h-12 > h-10`, `px-8 > px-4`) and the custom `text-md`
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
 * Overrides the base `h-10 / px-4 / text-sm` with `h-7 / px-3 / text-xs`. The
 * base mobile tap-target floor (`TOUCH_TARGET`) is intentionally **kept**, so a
 * small button still meets the touch target on mobile by default (it grows from
 * 28px to the floor below `sm`). Desktop-dense contexts that want to keep the
 * compact height on mobile opt out via `pillBtnSmDense`. See
 * `.issue/633/adr.md` ADR-003 (the floor-strip was inverted to opt-in here).
 *
 * Unlike `pillBtnTall` (an enlarging add-on usable as plain utilities), this
 * is a *shrinking* size, so plain utilities lose: same-property utilities are
 * resolved by generated-CSS order, and the smaller `h-7` / `px-3` sort
 * *before* the base `h-10` / `px-4` and therefore cannot override them. The
 * `data-[sm]:` variant sorts after the base utilities and wins
 * deterministically. See `.issue/416/adr.md` ADR-005 (shrink-direction
 * constraint) and `.issue/442/adr.md` ADR-003.
 *
 * `gap` is intentionally not overridden (the base `gap-1.5` is harmless for
 * text-only small buttons; mirrors `pillBtnTall`, #416 ADR-001).
 *
 * Consumers must keep `data-sm=""` on the element — dropping the attribute
 * disables the `data-[sm]:` size variant entirely.
 *
 * Apply by appending after the other variants, e.g.
 * `` `${pillBtn} ${pillBtnGhostDanger} ${pillBtnSm}` `` with
 * `data-ghost-danger="" data-sm=""`.
 */
export const pillBtnSm = "data-[sm]:h-7 data-[sm]:px-3 data-[sm]:text-xs";

/**
 * Dense variant of `pillBtnSm` — the small size add-on **plus** an explicit
 * mobile tap-target floor strip (`data-[sm]:max-sm:min-h-0`).
 *
 * For desktop-density-first contexts only (admin row actions etc.) where the
 * compact `h-7` height should be preserved on mobile too. This is the single
 * place the floor-strip token lives (it was previously baked into `pillBtnSm`
 * and forced `!important` floor-restores elsewhere; see `.issue/633/adr.md`
 * ADR-003). The strip `data-[sm]:max-sm:min-h-0` (0,2,0) beats the base
 * `TOUCH_TARGET` (0,1,0) deterministically without `!important`.
 *
 * Consumers must keep `data-sm=""` on the element (same contract as
 * `pillBtnSm`). The floor strip still keeps the AA minimum (h-7 = 28px).
 *
 * Apply as `` `${pillBtn} ${pillBtnSmDense}` `` with `data-sm=""`.
 */
export const pillBtnSmDense = `${pillBtnSm} data-[sm]:max-sm:min-h-0`;

/**
 * Icon-only add-on for pill buttons — drives "data-icon" variant. Turns the
 * text-oriented pill (`h-10 px-4`) into a square `h-10 w-10` button so a lone
 * icon sits centered without the `px-4` text padding that otherwise stretches
 * it into an awkward oblong. With the base `rounded-pill` (`--radius-pill:
 * 980px`) a square renders as a circle, keeping it in the same radius family as
 * the labeled pills.
 *
 * `px-0` is a *shrinking* override of the base `px-4`, so like `pillBtnSm` it
 * must be a `data-[icon]:` variant rather than a plain utility: same-property
 * utilities are resolved by Tailwind's generated-CSS order, and the smaller
 * `px-0` sorts *before* `px-4` and would lose. The variant sorts after the base
 * and wins deterministically. `w-10` / `justify-center` have no base
 * counterpart but are kept under the same variant for cohesion. The base mobile
 * tap-target floor (`TOUCH_TARGET`) only sets `min-h`; the matching `min-w`
 * floor (from `TOUCH_TARGET_SQUARE`) is added under the variant so the circle
 * meets the square touch target (§7.1). See `.issue/416/adr.md` ADR-005
 * (shrink-direction constraint) and `.issue/459/adr.md` ADR-002.
 *
 * Composes with the color variants, e.g.
 * `` `${pillBtn} ${pillBtnIcon} ${pillBtnPrimary}` `` with `data-icon="" data-primary`.
 */
export const pillBtnIcon =
  "data-[icon]:w-10 data-[icon]:px-0 data-[icon]:justify-center data-[icon]:max-sm:min-w-[44px]";

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

/**
 * Hide the native scrollbar on a horizontally-scrolling row while keeping it
 * scrollable (mock `P10-home.html` `.filter-bar` / `.bulk-actions`:
 * `scrollbar-width: none` + `::-webkit-scrollbar { display: none }`). These are
 * arbitrary Tailwind utilities (no handwritten CSS), shared across the FilterBar
 * narrow横スクロール row, the BulkActionBar mobile actions row, the NoteActions
 * mobile rail and the editor mode-tabs / toolbar rows. Domain-agnostic primitive,
 * so it lives here alongside the other shared shells (#588 W-003).
 */
export const scrollbarHidden =
  "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

/**
 * Status/tag badge base — the pill chip used by the admin tables (P46 Jobs
 * status tags, P40 Dashboard activity tags). Mirrors the mock `.tag`
 * (`padding: 2px 9px`, `radius-pill`, `gap: 5px`, `text-xs`,
 * `weight-medium`). The rest-state surface/ink colors come from {@link tagTone}
 * (or a per-call neutral default), so the base intentionally omits color.
 *
 * Hoisted here (single source of truth) so the two admin surfaces render the
 * same chip shape.
 */
export const tagBadge =
  "inline-flex items-center gap-[5px] px-[9px] py-[2px] rounded-pill text-xs font-medium whitespace-nowrap";

/**
 * Semantic tone classes for {@link tagBadge}, keyed by the 案D semantic
 * palette. `info` maps to the neutral accent surface (`--color-info` aliases
 * `--color-accent`). Consumers that need a truly neutral (无印) chip — e.g. the
 * mock's variant-less `.tag` — apply {@link tagToneNeutral} instead.
 */
export const tagTone = {
  info: "bg-accent-surface text-accent-ink",
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  error: "bg-error-surface text-error",
} as const satisfies Record<string, string>;

/**
 * Semantic tone keys for {@link tagBadge}/{@link tagTone}. Single source of
 * truth shared by status-tag helpers (`exportStatusTag`/`ingestionStatusTag`)
 * so the admin Jobs board and the export screens map a status to the same
 * tone vocabulary.
 */
export type Tone = keyof typeof tagTone;

/** Neutral (无印) tone for {@link tagBadge} — mock's variant-less `.tag`. */
export const tagToneNeutral = "bg-surface text-ink-secondary";

/** Field wrapper. */
export const field = "flex flex-col gap-2 mb-4";

/** Field label. */
export const fieldLabel = "text-sm font-medium text-ink-secondary";

/** Field input/textarea/select base. */
export const fieldControl = `w-full h-10 ${TOUCH_TARGET} rounded-md border border-transparent bg-surface px-3 py-2.5 text-sm text-ink outline-none transition-colors motion-reduce:transition-none focus:border-accent focus:bg-bg disabled:opacity-disabled disabled:cursor-not-allowed`;

/** Field textarea modifier. */
export const fieldTextarea = "font-mono text-mono min-h-[320px] resize-y";

/** Form error message (inline). */
export const formError = "text-error text-sm mt-2";

/** Chip base. */
export const chip =
  "inline-flex items-center gap-1.5 h-7 px-3 rounded-pill bg-surface text-xs text-ink";

/**
 * Modal dialog backdrop.
 *
 * Below `sm` the backdrop bottom-aligns its panel (`items-end p-0`) so the
 * dialog reads as a bottom sheet; at `sm` and up it returns to the centered
 * modal (`sm:items-center sm:p-4`). The split is a static viewport-driven
 * variant, not runtime state (#587 ADR-001).
 */
export const dialogBackdrop =
  "fixed inset-0 z-[100] bg-black/35 flex justify-center items-end p-0 sm:items-center sm:p-4";

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
  "relative flex flex-col bg-bg rounded-t-lg sm:rounded-lg p-6 max-sm:pb-[calc(var(--space-5)+env(safe-area-inset-bottom))] max-w-[480px] w-full max-sm:max-h-[calc(100%-var(--space-8))] sm:max-h-[90vh] overflow-y-auto shadow-lg";

/**
 * Decorative grabber handle for the bottom-sheet dialog (mock `.dialog::before`,
 * 36×4px / `--radius-full` / `--color-hairline-strong` / `margin:0 auto var(--space-4)`).
 *
 * Shown only below `sm` (`hidden max-sm:block`). Rendered as a non-focusable,
 * `aria-hidden` `<span>` at the very top of the panel (before the close button)
 * so it never enters the focus trap's `FOCUSABLE_SELECTOR`/`INITIAL_FOCUS_SELECTOR`
 * and `focusables[0]` stays the close button (#587 ADR-002).
 */
export const dialogGrabber =
  "hidden max-sm:block mx-auto mb-4 h-1 w-9 rounded-full bg-hairline-strong";

/**
 * Opt-in close ("×") button rendered at the top-right of the dialog panel
 * when `Dialog` receives `showCloseButton`. Pairs with the `relative` token
 * on `dialog` for the absolute positioning context. See `Dialog`'s JSDoc
 * for the surrounding a11y contract (focus trap inclusion, initial-focus
 * exclusion, `closable=false` disabling).
 */
export const dialogCloseButton = `absolute top-3 right-3 inline-flex items-center justify-center w-8 h-8 ${TOUCH_TARGET_SQUARE} rounded-pill text-ink-secondary text-xl leading-none hover:not-disabled:bg-surface hover:not-disabled:text-ink transition-colors motion-reduce:transition-none disabled:opacity-disabled disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent`;

/**
 * Modal dialog title.
 *
 * `[overflow-wrap:anywhere]` + `min-w-0` mirror the mock's `.dialog-title`
 * rule so a long unbreakable subject woven into the title (e.g. a directory
 * name with no break opportunities in 「{name}」を移動) wraps instead of
 * forcing horizontal scroll in the narrow bottom sheet (#588 Step 2,
 * overflow=0 requirement).
 */
export const dialogTitle =
  "text-lg font-medium mb-4 min-w-0 [overflow-wrap:anywhere]";

/**
 * Modal dialog actions row.
 *
 * `sm` and up: the desktop right-aligned inline row (`inline-flex justify-end`).
 * Below `sm`: the mock's bottom-sheet treatment stacks the buttons full-width
 * (`flex-col-reverse` so the DOM-first Cancel sits *below* the DOM-second
 * primary/danger action — every dialog in #588's P10 group emits the buttons
 * in `[cancel, primary]` order, and the mocks render the primary on top). Each
 * button is stretched to full width and its label re-centered (the base
 * `pillBtn` only sets `items-center`, not `justify-center`). The tap floor
 * comes from `pillBtn`'s own `TOUCH_TARGET`. See `.issue/588` Step 2.
 */
export const dialogActions =
  "inline-flex gap-2 mt-4 justify-end w-full max-sm:flex-col-reverse max-sm:[&>button]:w-full max-sm:[&>button]:justify-center";

/**
 * Popover panel shell for the WAI-ARIA `role="menu"` dropdowns
 * (`<Menu>`/`<MenuItem>` primitive). Holds only the panel chrome
 * (border / surface / shadow / vertical padding / stacking); width and
 * anchor position differ per consumer (Directory 160px, Note 180px, and the
 * sidebar-foot User menu which spans the row full-width and opens upward —
 * `bottom-full left-0 right-0`, #628 ADR-003) and are supplied via the
 * caller's `panelClassName` (`absolute … min-w-[…]`). See `.issue/467`.
 */
export const menuPanel =
  "rounded-md border border-hairline bg-bg shadow-sm py-1";

/**
 * Popover panel chrome for the narrow full-width sheet treatment.
 *
 * Base is the floating card (`rounded-lg border / bg-bg / shadow-md / p-4`);
 * below `sm` it becomes a viewport-fixed, bottom-anchored full-width sheet.
 * `max-sm:fixed` is load-bearing: the consumers position the panel `absolute`
 * inside the popover's `relative inline-flex` trigger wrapper, so without it
 * `left-0 / right-0` resolve against the (chip-sized) wrapper and the panel
 * collapses to the trigger's width.
 * Stays non-modal (no backdrop) — `usePopover` keeps its dismiss-on-outside
 * behaviour unchanged. When a consumer goes full-width the `clampToViewport`
 * shift (both axes) is unnecessary.
 *
 * This is the common base for the narrow-sheet treatment; the domain-owned
 * `FILTER_POPOVER_PANEL` (FilterBar) replacement onto this constant is #588.
 */
export const popoverSheetPanel =
  "rounded-lg border border-hairline bg-bg shadow-md p-4 max-sm:pb-[calc(var(--space-4)+env(safe-area-inset-bottom))] max-sm:fixed max-sm:bottom-0 max-sm:top-auto max-sm:mt-0 max-sm:left-0 max-sm:right-0 max-sm:w-auto max-sm:rounded-b-none";

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
 *
 * Focus uses an accent inset outline (`focus-visible:outline-accent
 * -outline-offset-2`) on top of `bg-surface` so the keyboard-focused row is
 * perceivable at ≥3:1 contrast on the white panel (WCAG 2.4.7) — `bg-surface`
 * alone is ~1.08:1. This unifies the menu/option focus ring with ViewSwitcher's
 * `OPTION_ITEM` (#660 / ADR-011 horizontal rollout). danger items keep the same
 * accent ring: the focus indicator stays neutral and the danger semantics are
 * carried by text(error) + bg(error-surface), not a second outline color
 * (#660 ADR-003).
 */
export const menuItem =
  "flex items-center gap-2 w-full px-3 py-2 text-left text-sm text-ink outline-none hover:not-aria-disabled:bg-surface focus-visible:bg-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2 aria-disabled:opacity-disabled aria-disabled:cursor-not-allowed data-[danger]:text-error data-[danger]:hover:not-aria-disabled:bg-error-surface data-[danger]:focus-visible:bg-error-surface";

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
 * so the plain `border` is required for the 1px width.
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
 * Mono title variant for monitoring-key headings (P47 admin-metrics): the mock's
 * local `.alert-title` override uses `--font-mono` + `--text-xs` and drops the
 * sans tracking, so this is not just `${ALERT_TITLE} font-mono`.
 */
export const ALERT_TITLE_MONO =
  "m-0 text-xs font-mono font-semibold text-[var(--alert-accent)]";

/**
 * Alert body — secondary ink. `<strong>` inside is promoted to primary ink +
 * medium weight, and inline `<a>` is always underlined accent (mock
 * `.alert-body a`), to match the mock.
 */
export const ALERT_BODY =
  "m-0 text-sm text-ink-secondary leading-relaxed [&_strong]:text-ink [&_strong]:font-medium [&_a]:text-accent [&_a]:underline [&_a]:[text-underline-offset:3px]";

/** Inline `<code>` inside an alert body (P15 / P47 mono local variant). */
export const ALERT_BODY_CODE = "font-mono text-xs";

/**
 * Alert action — an inline button/link beneath the body, accent-colored with a
 * hover underline. Disabled state dims via `opacity-disabled`.
 */
export const ALERT_ACTION =
  "inline-flex items-center gap-1 mt-2 text-sm font-medium text-[var(--alert-accent)] hover:underline hover:[text-underline-offset:3px] disabled:opacity-disabled disabled:cursor-not-allowed";

/**
 * Skeleton placeholder primitives — surface-colored pulsing shapes shared by
 * every Suspense-fallback skeleton (`Skeleton`, the archetype skeletons and
 * the page-local ones). Height/width are supplied at the call site; only the
 * shared look (surface, radius family, `motion-safe:` pulse) lives here.
 */
export const SKELETON_BAR = "bg-surface rounded-md motion-safe:animate-pulse";

/** Pill-shaped skeleton placeholder (chips / pill-button placeholders). */
export const SKELETON_PILL =
  "bg-surface rounded-pill motion-safe:animate-pulse";

/** Radio/checkbox row. */
export const radioRow =
  "flex items-center gap-2 py-1 text-sm cursor-pointer [&_input]:accent-accent";

/** Checkbox row. */
export const checkboxRow =
  "flex items-start gap-3 text-sm text-ink-secondary leading-normal cursor-pointer [&_input]:w-4 [&_input]:h-4 [&_input]:mt-[2px] [&_input]:accent-accent [&_input]:cursor-pointer [&_input]:shrink-0";

/**
 * Dropzone visual primitive — the shared utility-class foundation for
 * file-upload interactive areas (editor in-body media-upload, ingestion
 * upload page / modal). Domain-agnostic: the dropzone renders the same
 * interactive affordance (dashed border, hover/drag states) across all
 * consumers; validation and callback logic stay in each domain
 * (media vs. ingestion). See Issue #795 ADR-001.
 *
 * The label wraps a hidden `<input type="file">` and responds to:
 * - click: native input triggers file picker
 * - drag: `onDragOver/onDragLeave/onDrop` handlers managed by the consumer
 * - `data-dragover=""`: activates the hover-emphasize variant (`data-[dragover]:…`)
 * - `data-disabled=""`: suppresses interaction during upload or parent-disabled state
 *
 * Consumers must supply `data-dragover={isDragOver ? "" : undefined}` to toggle
 * the accent border/surface state during a drag, and `data-disabled={disabled ? "" : undefined}`
 * to visually suppress interaction during uploading or when the parent is disabled.
 */
export const DROPZONE =
  "block border-2 border-dashed border-hairline-strong rounded-xl px-6 py-12 text-center text-ink-secondary bg-surface-elevated transition-all motion-reduce:transition-none cursor-pointer hover:border-accent hover:bg-accent-surface data-[dragover]:border-accent data-[dragover]:bg-accent-surface data-[disabled]:pointer-events-none data-[disabled]:opacity-disabled [&_input[type=file]]:hidden";
