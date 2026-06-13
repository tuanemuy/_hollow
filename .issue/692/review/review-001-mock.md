# PR #719 レビュー — Mock / Spec 整合性

- **PR:** #719 `fix(ui): フォーカス表現を caret-only 化 + グローバルリングを 2px に細線化 (#692)`
- **対象 head:** `origin/issue/692/focus-caret-only-thin-ring` (93203060)
- **観点:** デザインモック・spec ドキュメントの `--shadow-focus` 一括同期の正確性
- **基準:** `.issue/692/plan.md` AC-5

> 検証はすべて PR head ref（`origin/issue/692/focus-caret-only-thin-ring`）に対して `git show` / `git diff` / `git grep` で実施。
> ローカル作業ツリーは別コミット（PR #714, `241ade3b`）に detached HEAD でチェックアウトされており、ディスク上の grep は PR #719 を反映しないため使用していない（後述 N-002）。

## Mock / Spec 整合性

### Blockers

- なし

### Warnings

- なし

### Notes

- **[N-001]** 置換の正確性: 検証OK。
  - 旧値 `0 0 0 4px oklch(37.1% 0 0 / 0.28)` は `spec/design/pages/**` に **0 件**（完全に除去）。`spec/design/tokens.md` も 0 件。
  - 新値 `0 0 0 2px var(--color-accent)` は `spec/design/pages/**` の **105 ファイル**に存在し、`--shadow-focus` を持つファイル数（105）と一致（過不足なし）。
  - 内訳も計画どおり: PC 55 + mobile 49 + drafts 1（`drafts/P10-header-refined.html`）= 105。

- **[N-002]** モック単体での `var(--color-accent)` 解決: **退行なし（重要確認・合格）**。
  - 新値を使う 105 ファイル全てが同一ファイルの `:root` 内に `--color-accent:`（= `oklch(37.1% 0 0)`）を定義しており、モックを単体で開いても `var(--color-accent)` が解決される。リングが消える退行は発生しない。
  - 例: `P44-admin-registration.html` は 10 行で `--color-accent: oklch(37.1% 0 0)` を定義、151 行 `.switch:focus-visible { box-shadow: var(--shadow-focus); }` 経由でも解決する。

- **[N-003]** 連結行の非破壊: 検証OK。
  - admin 系（P42〜P46 の PC/mobile、計 11 ファイル）の `--shadow-md: …; --shadow-focus: …;` 連結行（各 32 行）を直接確認。`--shadow-none/-xs/-sm/-md` は元の値のまま温存され、`--shadow-focus` の値文字列のみが新値に置換されている。サブストリング置換が正しく機能し、隣接トークンを巻き込んでいない。

- **[N-004]** P12 caret-only 上書き: 検証OK（PC / mobile 両方）。
  - `spec/design/pages/P12-editor.html`: 488 行 `.title-input:focus-visible { box-shadow: none; }` / 715 行 `.editor:focus-visible { box-shadow: none; }` / 117 行 `--shadow-focus: 0 0 0 2px var(--color-accent);`。
  - `spec/design/pages/mobile/P12-editor.html`: 503 行 / 784 行 / 117 行 で同等。
  - P12 の diff は「トークン値の置換 + caret-only 上書き 2 行追加」のみ（PC/mobile 各 6 行）で、余計な構造変更なし。

- **[N-005]** tokens.md 同期: 検証OK。
  - 226 行（トークン表）: `` | `--shadow-focus` | `0 0 0 2px var(--color-accent)` | フォーカスリング | `` に同期。
  - 535 行（mobile 用 `:root`）: 新値に同期。
  - 311 行（section 10 prose）: 「すべてのインタラクティブ要素に共通適用する。…ただし書く面（エディタ本文・タイトル）はこの箱リングを適用せず caret + 選択色で示す（caret-only の例外。Issue #692）。」と caret-only 例外を追記済み（ドキュメント乖離なし）。

- **[N-006]** SSOT（tokens.css）整合: 検証OK。
  - `app/styles/tokens.css:120` = `--shadow-focus: 0 0 0 2px var(--color-accent);`。`tokens.md` / 全モックと同値。

- **[N-007]** スコープ外モックの誤変更: なし。
  - drafts は `P10-header-refined.html`（`--shadow-focus` を持つ唯一の draft）のみ変更。`P10-header-options.html` / `P10-toolbar-options.html`（いずれも `--shadow-focus` 非定義）は未変更で正しい。
  - PR で変更された `spec/design/pages` 配下の HTML は計 105 件で、AC-5 の同期対象と完全一致。

- **[N-008]** 実装側直値（AC-6, スコープ隣接）: 検証OK。
  - `app/components/auth/styles.ts:40` の error+focus 影は `0_0_0_4px_oklch(37.1%_0_0_/_0.28)` → `0_0_0_2px_var(--color-error)` に追従済み。inset の error 枠 `inset_0_0_0_1px_var(--color-error)` は維持。4px の取り残しなし（計画 ADR-003 の方針どおり error 文脈は error 色リング）。

## 結論

`--shadow-focus` の SSOT（tokens.css）→ ミラー（tokens.md 226/535 + 311 prose）→ 全 105 モック HTML への一括同期は正確に実施されている。旧 4px 値の残存ゼロ、新値の過不足なし、連結行の非破壊、モック単体での `var(--color-accent)` 解決性（退行なし）、P12 PC/mobile の caret-only 上書き、drafts スコープ、auth 直値追従——いずれも合格。Mock / Spec 整合性の観点で Blocker / Warning はなし。
