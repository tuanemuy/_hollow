# PR #682 レビュー — Styling / CSS規約

対象: PR #682（branch `issue/671/p32-filter-ui-fixes`）/ Issue #671
観点: CLAUDE.md「Styling」節準拠・ユーティリティ衝突の根絶・`max-sm:` ボトムシート方式・任意プロパティ記法・トークン使用・レスポンシブ一貫性
基準: `app/components/public/styles.ts` / `SearchFilterDrawer.tsx` / `PublicSearch.tsx` / `PublicNoteDetail.tsx`

## 総評

CLAUDE.md Styling 規約に対して全体的に高水準で準拠している。新規 CSS / `@apply` ゼロ、ユーティリティは全て `styles.ts` のモジュールスコープ定数 or インライン、状態は `data-[open]` / `data-[active]` の `data-*` バリアントと `data-x={value || undefined}` パターンで統一されている。最大の懸念だった `AUTHOR_AVATAR` のユーティリティ衝突（ADR-001）は、全消費者（`ACTIVE_CHIP_AVATAR` / `TOKEN_AVATAR` / `SUGGESTION_AVATAR` / `PublicSearch` ヒット行 / `PublicNoteDetail`）で `w-/h-/text-` の二重指定が**完全に解消**されていることを確認した。`max-sm:` ボトムシート方式（ADR-002）も translate 軸の差し替えが正しく、既存先例（`common/styles.ts` modal/dropdown, `BulkActionBar`）と書式が整合している。

`pnpm typecheck` 通過、PR 対象 4 ファイルの `biome lint` もクリーン（残る 24 warnings は `PublishSettings` 等 PR 範囲外）。

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001] `DRAWER_RESET` が共有 `TOUCH_TARGET` 定数ではなく `max-sm:min-h-[44px]` をハードコードしている**
  場所: `app/components/public/styles.ts:289`
  このファイルは既に `TOUCH_TARGET`（`= "max-sm:min-h-[44px]"`、`app/components/common/styles.ts:25`）を import 済み（`styles.ts:7`、`BACK_LINK` で使用）。`DRAWER_RESET` の `max-sm:min-h-[44px]` はその定数と完全に同一の意味なので、リテラル直書きより `${TOUCH_TARGET} max-sm:inline-flex max-sm:items-center` と合成する方が「44px タップフロアの SSOT」に従い意図も明確になる。ただし
  - 同ファイル内に他の `min-h-[44px]`/`min-h-[48px]` 直書き（後述）が併存しており、`DRAWER_APPLY` の 48px は `TOUCH_TARGET`（44px）では表現できない以上、ここだけ定数化しても一貫性が完璧になるわけではない。
  - `DRAWER_RESET` は本 PR の plan.md ステップ5 / AC-15 / ADR-004 系列で「リテラル `min-h-[44px]` を採用する」と明記された確定タスクであり、計画と一致している。
  機能・描画は完全に正しく、規約違反でもないため Note 扱い。今後リファクタの余地として。

- **[N-002] 任意プロパティ記法 `[scrollbar-width:none]` / `[&::-webkit-scrollbar]:hidden` は既存先例があり問題ない**
  場所: `app/components/public/styles.ts:260`（`ACTIVE_CHIPS` の `max-sm:[scrollbar-width:none] max-sm:[&::-webkit-scrollbar]:hidden`）
  まったく同じ記法が `app/components/common/styles.ts:257`（`"[scrollbar-width:none] [&::-webkit-scrollbar]:hidden"`、JSDoc 付き）に既存。Biome lint・typecheck とも通過済みで lightningcss の問題もない。`max-sm:` プレフィクスを付けた点も妥当（sm+ では横スクロールしないのでスクロールバー非表示は不要）。規約準拠。

- **[N-003] safe-area padding の書式が既存先例と整合**
  場所: `app/components/public/styles.ts:287`（`DRAWER_FOOTER` の `max-sm:pb-[calc(var(--space-3)+env(safe-area-inset-bottom))]`）
  `common/styles.ts:299`（modal: `pb-[calc(var(--space-5)+env(safe-area-inset-bottom))]`）/ `:378`（dropdown: `var(--space-4)`）と同一書式で、`--space-3`（=12px, `tokens.css:81`）トークンを使用。`BulkActionBar.tsx:46` は `calc(10px+...)` とリテラル px だが、本 PR は `var(--space-3)` トークン版を選んでおりむしろ望ましい。ADR-002・plan.md と一致。

- **[N-004] トークン使用は適切。`rounded-t-lg` は `--radius-lg`（12px）を経由**
  場所: `app/components/public/styles.ts:279`（`DRAWER` の `max-sm:rounded-t-lg`）/ `:287`（`--space-3`）
  ボトムシート上角丸 `rounded-t-lg` は `common/styles.ts` modal / `BulkActionBar` と同じトークン経由ユーティリティ。`tokens.css` に `--radius-lg: 12px`（:103）が存在し SSOT を踏襲。新規トークン追加・ハードコード角丸は無し。

- **[N-005] ハードコード px（`min-h-[48px]` / `w-[22px]` / `h-[22px]` / `max-h-[88vh]` / `w-[18px]` 等）はモック追従として妥当**
  場所: `styles.ts:265`（`ACTIVE_CHIP_REMOVE` の `max-sm:w-[22px] max-sm:h-[22px]`）/ `:279`（`max-sm:max-h-[88vh]`）/ `:291`（`DRAWER_APPLY` の `max-sm:min-h-[48px]`）/ `PublicSearch.tsx:214`（`w-[18px] h-[18px]`）
  arbitrary px は本ファイル既存の `FILTER_BTN_BADGE`（`min-w-[18px] h-[18px]`, :248）/ `ACTIVE_CHIP_REMOVE` 既定（`w-[18px] h-[18px]`, :264）/ `TOKEN`（`h-[26px]`, :303）/ `SEARCH_FORM_INPUT`（`pl-[54px]`, :203）等で広く先例がある。Tailwind 標準スケールに該当値がない（22px/18px/88vh/48px）ためモック追従の arbitrary value は規約上許容範囲。plan.md「px 完全一致は不要・rem 慣習で評価」とも整合。`max-h-[88vh]`/`w-[22px]` は相対値・最小タップターゲットで妥当。

- **[N-006] `max-sm:` バリアントの使い方が既存と一貫**
  場所: `styles.ts:260,262,265,267,279,287,289,291`
  sm 境界の `max-sm:` 適用は、同ファイルの `PUBLIC_HEADER`（:11）/ `NOTE_ROW`（:62）/ `SORT_MENU_PANEL`（:118）/ `FILTER_BTN`（:246）等の既存用法と同じく「sm+ がデフォルト、`max-sm:` でモバイル上書き」の方向で統一されている。新たに導入した `ACTIVE_CHIPS` の `flex-wrap`（既定）⇄ `max-sm:flex-nowrap` の切替も同方向。逆向き（`sm:` で上書き）の混在は無く一貫している。

- **[N-007] translate 軸の差し替えが ADR-002 どおり正しい**
  場所: `app/components/public/styles.ts:279`（`DRAWER`）
  `DRAWER` は既定で `translate-x-full ... data-[open]:translate-x-0`（右スライド）、`max-sm:` で `translate-x-0`（右スライド軸を無効化）＋ `translate-y-full`（下に退避）＋ `data-[open]:translate-y-0`（せり上がり）を併記。Tailwind の translate 系は CSS 変数（`--tw-translate-x` / `--tw-translate-y`）で合成されるため両軸は独立に効き、`max-sm:translate-x-0` を明記して右スライド軸を打ち消している点が plan.md リスク欄「`max-sm:translate-x-0` 併記必須」と完全に一致。`max-sm:data-[open]:translate-y-0` がソース順で後勝ちする前提も維持されている（typecheck/lint 通過済み・plan.md で実機ビルド検証済みと記録）。SSR markup テストでは検証不可な挙動だが構造的に正しい。

- **[N-008] ユーティリティ衝突の根絶を全消費者で確認**
  `AUTHOR_AVATAR`（:162-163）はサイズなしベース（グラデ・`rounded-full`・centering・色・`font-medium`）に再定義され、消費者は単一サイズのみ付与:
  - `AUTHOR_AVATAR_MD`（:165）= `+ w-7 h-7 text-[11px]`（28px, `PublicNoteDetail.tsx:112` で使用）
  - `ACTIVE_CHIP_AVATAR`（:263）= `+ w-4 h-4 text-[8px]`（16px）
  - `TOKEN_AVATAR`（:306）= `+ w-4 h-4 text-[8px] shrink-0`（16px）
  - `SUGGESTION_AVATAR`（:321）= `+ w-5 h-5 text-[9px] shrink-0`（20px）
  - `PublicSearch.tsx:214` = `${AUTHOR_AVATAR} w-[18px] h-[18px] text-[9px]`（18px）
  いずれも `w-` / `h-` / `text-` の重複指定なし。`grep` で `AUTHOR_AVATAR` 消費者は上記 5 箇所のみ（漏れなし）、旧サイズ込みベースを直接使う残存箇所も無し。CLAUDE.md「サイズを文字列合成で上書きする設計を避ける」「ユーティリティ衝突は生成 CSS 順で勝敗が決まる」に正面から対応しており、新たな衝突も生んでいない。
