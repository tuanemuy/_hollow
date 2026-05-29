# 実装計画 — Issue #152: disabled 中の hover utility 無効化を pill button ファミリーに横断適用

**Issue:** #152
**作成日:** 2026-05-29
**複雑度:** 小〜中規模

---

## 目的

pill-style button 系の共有定数で `disabled:opacity-55 disabled:cursor-not-allowed`（および `aria-disabled:*`）は適用されているが、Tailwind の `hover:*` / `active:*` utility は disabled 状態で自動無効化されないため、無効化されたボタンでも hover で背景色・文字色が変わってしまう。これを `hover:not-disabled:*` 系の variant に置き換え、disabled なボタンで hover による視覚変化が起きないようにする。

## スコープ

### 含まれるもの

pill-style button（`rounded-pill` / `rounded-full` のボタン）系定数で、`hover:` / `active:` と `disabled:`（または `aria-disabled:`）を併用しているもの:

- `app/components/common/styles.ts`
  - `pillBtn`（base）
  - `pillBtnPrimary`（`data-[primary]` variant）
  - `pillBtnDanger`（`data-[danger]` variant）
  - `dialogCloseButton`（×ボタン）
- `app/components/note/editor/WysiwygEditor.tsx`
  - `EDITOR_TOOLBAR_BTN`（pillBtn を模した bespoke なツールバーボタン定数。コメント上も「pillBtn 相当」と明記されており同じ pill ファミリー）

### 含まれないもの

- **既に `hover:not-disabled:` 適用済みの定数**（`auth/styles.ts`、`public/styles.ts`、`admin/*`、`routes/admin/route.tsx` 等）— 調査の結果、コードベースには既に `hover:not-disabled:` / `active:not-disabled:` のコンベンションが広く確立されている。本 Issue は未対応の pill 定数をその確立済みパターンに揃える作業。
- **pill ではない別コンポーネントファミリー**:
  - `app/components/directory/styles.ts` のドロップダウンメニュー項目（`flex items-center w-full` の行、`hover:bg-surface` + `disabled:` + `data-[danger]:hover:bg-error-surface`）— pill ボタンではなくメニュー項目。同種のバグ傾向はあるが別動線・別ファミリーのため本 Issue のスコープ外。Phase 4 で起票要否を判断する。
  - `auth/styles.ts` / `directory/DirectoryTree.tsx` の `hover:underline` テキストリンク — 下線変化であり pill ボタンの背景色変化とは別物。スコープ外。

## 調査結果

- **あるべきパターン:** Tailwind v4 の `not-disabled:` variant（`:not(:disabled)`）を `hover:` / `active:` と組み合わせ、`hover:not-disabled:<util>` の形にする。コードベース内の既存 pill ボタン（`authPrimaryBtn` 等）が既にこの形を採用しているため、それに合わせる。
- **アンカー要素の disabled は `aria-disabled` で表現される点が重要:** `pillBtn` は `<button>` だけでなく `<Link>`（アンカー）にも適用される（例: `note/history/NoteRevisionRestorePanel.tsx:70` の `<Link className={pillBtn}>`）。アンカーは `:disabled` 疑似クラスを持てないため、disabled 表現は `aria-disabled="true"` で行う。`pillBtn` が `aria-disabled:opacity-55 aria-disabled:cursor-not-allowed` を併記しているのはこのため。したがって `pillBtn` 系の hover 抑制は `:disabled` だけでなく `[aria-disabled="true"]` でも効く必要がある → `not-aria-disabled:` も併用する（ADR-001 参照）。
- **`dialogCloseButton` / `EDITOR_TOOLBAR_BTN` は常に `<button>`** で、`aria-disabled:` スタイルを持たない契約。よって `not-disabled:` のみで十分（`not-aria-disabled:` は付けない）。
- 依存関係: 本変更は CSS utility 文字列のみ。挙動（有効時の hover）は不変。PR #328（Issue #273）でマージ済みの common 集約後の構造を前提とする。

## 実装ステップ

### 1. `pillBtn` の hover/active を disabled・aria-disabled で抑制

- **対象ファイル:** `app/components/common/styles.ts`
- **変更内容:**
  - `hover:bg-surface-hover` → `hover:not-disabled:not-aria-disabled:bg-surface-hover`
  - `active:bg-surface-hover` → `active:not-disabled:not-aria-disabled:bg-surface-hover`
  - `active:scale-[0.985]` は視覚的に問題ない（押下スケール）が、一貫性のため同様に `active:not-disabled:not-aria-disabled:scale-[0.985]` にする。`motion-reduce:active:scale-100` はそのまま。
- **理由:** disabled / aria-disabled の pill ボタンで hover/active による色・スケール変化を止める。

### 2. `pillBtnPrimary` の hover/active を抑制

- **対象ファイル:** `app/components/common/styles.ts`
- **変更内容:**
  - `data-[primary]:hover:bg-accent-hover` → `data-[primary]:hover:not-disabled:not-aria-disabled:bg-accent-hover`
  - `data-[primary]:active:bg-accent-pressed` → `data-[primary]:active:not-disabled:not-aria-disabled:bg-accent-pressed`
- **理由:** primary variant も base と同じ disabled 契約（`<Link>` 利用あり）に従う。

### 3. `pillBtnDanger` の hover を抑制

- **対象ファイル:** `app/components/common/styles.ts`
- **変更内容:**
  - `data-[danger]:hover:bg-error-surface` → `data-[danger]:hover:not-disabled:not-aria-disabled:bg-error-surface`
- **理由:** danger variant も同様。

### 4. `dialogCloseButton` の hover を抑制

- **対象ファイル:** `app/components/common/styles.ts`
- **変更内容:**
  - `hover:bg-surface hover:text-ink` → `hover:not-disabled:bg-surface hover:not-disabled:text-ink`
- **理由:** ×ボタンは常に `<button>` 要素で `aria-disabled:` 契約を持たないため `not-disabled:` のみ。

### 5. `EDITOR_TOOLBAR_BTN` の hover/active を抑制

- **対象ファイル:** `app/components/note/editor/WysiwygEditor.tsx`
- **変更内容:**
  - `hover:bg-surface-hover` → `hover:not-disabled:bg-surface-hover`
  - `active:bg-surface-hover` → `active:not-disabled:bg-surface-hover`
  - `data-[primary]:hover:bg-accent-hover` → `data-[primary]:hover:not-disabled:bg-accent-hover`
  - `data-[primary]:active:bg-accent-pressed` → `data-[primary]:active:not-disabled:bg-accent-pressed`
- **理由:** 常に `<button>` のため `not-disabled:` のみ。pill ファミリーの一員として同じ挙動に揃える。

### 6. JSDoc コメントの追補

- **対象ファイル:** `app/components/common/styles.ts`
- **変更内容:** `pillBtn` の JSDoc に「hover/active は `:disabled` および `[aria-disabled]` で抑制される（アンカー利用のため両方が必要）」旨を 1 行追記し、WHY を残す。
- **理由:** `not-aria-disabled:` が付いている理由（アンカー対応）は非自明なため。

### 7. 検証

- `pnpm typecheck && pnpm lint:fix && pnpm format`
- `pnpm build` で Tailwind が `not-aria-disabled:` variant を正しくコンパイルすること（生成 CSS に該当 class が出力されること）を確認。
  - 万一 `not-aria-disabled:` がコンパイルされない場合のフォールバック: `aria-disabled:hover:bg-surface`（base 色を hover 時に再表明して打ち消す）方式に切り替える。ADR-001 に記載。

## 設計判断

- **ADR-001:** `pillBtn` 系で `:disabled` に加えて `[aria-disabled]` でも hover を抑制するため `not-aria-disabled:` を併用する。詳細は `adr.md` 参照。

## リスクと注意点

- `not-aria-disabled:` は Tailwind v4 の `not-*` variant + 組み込み `aria-disabled` variant の合成。コードベースに前例がないため、`pnpm build` で生成 CSS を確認する（ステップ7）。
- variant をスタックしても同一要素上の複合セレクタになるため、`hover:` と `not-disabled:` の記述順による挙動差はない。コードベースの既存コンベンション（`hover:` を先頭）に揃える。
- 有効状態の hover/active 挙動は不変であることを必ず確認する（リグレッション防止）。

## テスト方針

- CSS utility のみの変更で自動テスト対象外。`testing.md` に従いブラウザで実機確認する。
  - disabled な pill ボタン（`<button disabled>`）に hover → 色変化なし。
  - aria-disabled な pill アンカー/ボタン（例: NoteRevisionRestorePanel の trashed 時「この版に復元」）に hover → 色変化なし。
  - 有効な pill ボタンに hover → 従来通り色が変わる。
  - ダイアログの×ボタン、エディタツールバーボタンの有効/無効 hover 挙動。

## レビュー履歴

（小〜中規模のため issue-planner のレビューループは省略。実装後の Phase 3 PR レビューで品質担保する。）
