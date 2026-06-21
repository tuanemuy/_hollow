# レビュー — Issue #509 PR #769（Architecture / Styling 観点・Round 2 / フル再レビュー）

対象: PR #769（`app/components/export/` のデザイン未実装解消）
計画: `.issue/509/plan.md` / ADR: `.issue/509/adr.md`（ADR-001〜007）
前ラウンド: `.issue/509/review/review-001-architecture.md`（Blocker/Warning なし、Note 9件）

検証:
- `pnpm typecheck` ✅（exit 0）
- `pnpm build` ✅（exit 0）— 生成 CSS を実物 grep で裏取り
- `pnpm vitest run ExportForm.test.tsx` ✅（6/6 PASS）
- `pnpm biome check`（3 ファイル）✅（No fixes）

総評: **APPROVE 相当**。Round 1 以降の 4 修正（`has-[:focus-visible]:` 採用、`PAGE_TITLE`/`PAGE_SUBTITLE` の共通 import 化、aria-live の DOM 単一化、ADR-007 追記）はいずれも規約・設計と整合し、ビルドで正しく CSS が生成されることを実物で確認した。Blocker・Warning なし。Note を 5 件記録する（うち N-001 は今回唯一の新規論点＝既存先例との focus 手法の不一致）。

## Architecture / Styling

### Blockers
なし

### Warnings
なし

### Notes

- **[N-001] `has-[:focus-visible]:` 採用は ADR-007 として妥当だが、構造同型の既存先例 `publication/styles.ts` RADIO_CARD が `focus-within:` を採るため手法が二系統に分かれた（新規論点）**
  場所: `app/components/export/styles.ts:58`（`SEGMENTED_BTN`）vs `app/components/publication/styles.ts:37`（`RADIO_CARD`、`.issue/464/adr.md` ADR-004）
  両者とも「`<label>` が `sr-only` な `<input type="radio">` を内包し、ラベル側にフォーカスリングを引き上げる」**完全に同型の構造**。ADR-007 は `focus-within:`（マウスクリックでもリングが出る）を退け `has-[:focus-visible]:`（キーボード巡回時のみ）を選んだ判断で、UX 上は ADR-007 の方が望ましい。しかし `RADIO_CARD` は同じ構造で `focus-within:outline focus-within:outline-2 focus-within:outline-accent` を使っており、ADR-007 が指摘した「マウスクリックで不要なリングが出る」欠点を publication 側はそのまま抱えている。ADR-007 は plan（`focus-within:`）との乖離は記録しているが、この**既存実装先例**との不一致には言及していない。
  本 PR のスコープ（export のスタイリング）内では `has-[:focus-visible]:` 採用は正しく、publication の修正は別 Issue であって本 PR で直す必然性は薄い。ただし「sr-only radio 内包 label のフォーカスリング」は今後も再発するパターンなので、どちらを正とするか（推奨は ADR-007 の `has-[:focus-visible]:`）を将来共通化の留意点として記録に残す。本 PR のマージは妨げない。

- **[N-002] `has-[:focus-visible]:` は CLAUDE.md の Tailwind/lightningcss 制約と矛盾せず、ビルドで CSS 生成を実証**
  場所: `app/components/export/styles.ts:58`
  CLAUDE.md の lightningcss 制約は「`@media (width >= …)` 内の `var()` を minify が拒否する」ことに限定された話で、`:has()` セレクタや `has-[…]:` バリアントには無関係。`pnpm build` 後の生成 CSS（`dist/client/assets/index-*.css`）を grep し、`:has(:focus-visible){outline-style:…;outline-width:2px}` / `:has(:focus-visible){outline-color:var(--color-accent)}` が実在することを確認した。`has-[` は既に `directory/styles.ts:22`・`publication/styles.ts:37`・`tag/TagList.tsx:227` 等で使われる確立済みパターンで、新規の規約逸脱は無い。`data-active={format === v || undefined}` も ADR-003 の `data-x={value || undefined}` 規約どおり。

- **[N-003] `PAGE_TITLE`/`PAGE_SUBTITLE` の共通 import 化は既存パターンと一貫し、視覚的退行なし**
  場所: `app/components/export/ExportForm/index.tsx:25,188,191`
  ローカル `PAGE_TITLE_CLASS`/`PAGE_SUBTITLE_CLASS` を削除し `@/components/layout/styles` から `PAGE_TITLE`/`PAGE_SUBTITLE` を import に差し替え。`ingestion/UploadPage.tsx`・`trash/TrashList.tsx`・`tag/TagList.tsx` が同経路で import する既存パターンと完全に一貫。クラス文字列も等価で退行なし:
  - 旧 `PAGE_TITLE_CLASS` ＝ `layout/styles.ts` の `PAGE_TITLE` と**文字列完全一致**（`text-3xl font-normal tracking-tightest leading-tight text-ink mb-2.5 [overflow-wrap:anywhere] min-w-0`）。
  - 旧 `PAGE_SUBTITLE_CLASS`（`text-[15px] text-ink-secondary mb-7 leading-snug`）＝ `${PAGE_SUBTITLE} leading-snug` に展開され**同一**。export 固有の `leading-snug` だけを共通定数に追記する形で、`tag/TagList.tsx:182` の `${PAGE_SUBTITLE} !mb-6` と同じ「共通定数 + 局所上書き」イディオムに沿う。ExportJobsList/Page・ExportJobDetail/Page も同様に共通 `PAGE_TITLE`/`PAGE_SUBTITLE`/`EMPTY_STATE` を流用しており、重複定義の解消が export 3 画面で一貫している。

- **[N-004] aria-live 成功メッセージの単一化は退行ではなく改善（重複排除）**
  場所: `app/components/export/ExportForm/index.tsx:341-345`
  従来は `success` メッセージを single/bulk 二つの `FORM_FOOTER` 分岐**それぞれの内側**に `aria-live="polite"` で重複レンダリングしていた。本 PR で `<section>` 末尾の 1 箇所に集約し、`summary`（`role="alert"`）と並べた。分岐は排他なので機能的に等価だが、重複定義が消えて DOM 上の live region が 1 つに統一された。`aria-live` 領域が条件レンダリング（`success !== "" ?`）である点は本 PR 以前からの既存挙動で、本 PR が新たに導入した退行ではない（`summary`/`formError` も同じ条件レンダリング方式）。`ExportForm.test.tsx`（6/6 PASS）も破壊していない。

- **[N-005] ADR-007 の記述は妥当で、plan との乖離を正しく記録**
  場所: `.issue/509/adr.md:136-149`
  ADR-007 は (1) plan L199 が `focus-within:` を指定していたこと、(2) 初回実装が `<label>` 自身の `:focus-visible` を当てて発火しなかった B-001 の原因（sr-only radio が実フォーカス先で label はタブフォーカスを受けない）、(3) `focus-within:` だとマウスクリックでもリングが出る欠点、(4) 最終的に `has-[:focus-visible]:` で `:focus-visible` セマンティクスを親へ引き上げる決定、を正確に記述。実装（`SEGMENTED_BTN` L58 の `has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent`）・マークアップ（`ExportForm/index.tsx:202-218` で `<label class={SEGMENTED_BTN}>` が `sr-only` radio を内包）と一致し、生成 CSS でも裏が取れている。WCAG 2.4.7 の根拠も正当。plan との文言乖離を ADR として残す運用は適切。唯一の不足は N-001 の publication 先例への言及だが、ADR-007 の判断自体の妥当性には影響しない。

## Round 1 Note の再確認（回帰なし）

Round 1 の N-001〜N-009（`exportStatus.ts` の配置・`Tone` 型の SSOT 化と二重定義解消・dot 色の 4 系統集約・hoisting 一貫性・リテラル px の正当性・影トークン合成・スコープ厳守・ペア `data-*` 属性付与）は本 Round の差分で破壊されていないことを再確認した。特に:
- `common/exportStatus.ts` は DTO 依存を `styles.ts` に持ち込まず純関数として独立、`Tone` 型のみ `styles.ts:291` から import（ADR-006 どおり）。
- `admin/Jobs/index.tsx` は共通 `Tone`（L21）・`exportStatusTag`（L15 import, L307 使用）を参照し、ローカル `type Tone` 二重定義は解消済み。`ingestionStatusTag`（L110）も同 `Tone` を返す。
- `export/styles.ts` の `STATUS_DOT_COLOR: Record<Tone, string>` は 4 系統に閉じ `data-status` 多分岐を排除（ADR-004）、影合成 `shadow-[var(--shadow-xs),0_0_0_0.5px_rgba(0,0,0,0.04)]` は生成 CSS に `var(--shadow-xs), 0 0 0 .5px …` として実在（ADR-005）。
- 新規リテラル px（`max-w-[720px]`/`max-w-[1100px]`/`rounded-[7px]`）は意匠固有値で `--container-max`(1280) と不一致のため正当（plan S-003）。
