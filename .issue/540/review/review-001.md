# PR Review #001 — impl: 領域1(P10/P11/P12/P20) のモック実装追従

**PR:** #548
**Date:** 2026-06-07
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 7
- Notes: 多数（良好）
- Verdict: **BLOCKED**（Warning を潰すため）

レビューレイヤー: モック追従・デザイン規約 / フロントエンド correctness / テスト（3視点並列）。

---

## モック追従・デザイン規約

### Blockers
なし

### Warnings
- **[M-W-001]** P12 editor-topbar の autosave 配置がモックの意図とずれる
  - 場所: `app/components/note/editor/NoteEditor.tsx`（`<span className="ml-auto"><AutosaveIndicator/></span>`）
  - 理由: モックの `.editor-topbar` は `mode-tabs → save-status → editor-actions` で `margin-left:auto` は `.editor-actions` のみ。実装は `ml-auto` を autosave 側に付けたため save-status まで右端に寄る。
  - 提案: `ml-auto` を autosave から外し actions 側へ移す。→ **修正する**
- **[M-W-002]** 編集モードの下部 save-row 廃止はモック（編集時）と差分あり
  - 場所: `app/components/note/editor/NoteEditor.tsx`
  - 理由: 編集モードのモックは topbar + 下部 save-row の二段。実装は topbar 単一に集約。ADR-003「topbar 配置」の範囲だが完全一致ではない。
  - 提案: 意図的差分として ADR-003 に追記。→ **ADR 追記で対応**
- **[M-W-003]** P20 chip の icon gap がモックと 2px 差（共有 `chip` の `gap-1.5` vs モック 4px）
  - 提案: 既存トークン優先方針上、現状維持を推奨。→ **対応不要（現状が正）**

### Notes
- ADR 判断と実装が一致（公開状態のメタ非追加、wikilink CSS 死にコードなし、管理導線保持）。
- リテラル px の新規持ち込みなし（任意値はすべて既存慣行 — Menu 幅・タッチターゲット床に倣う）。
- トークン SSOT 準拠、data-* 規約・styles.ts 定数化も丁寧。

---

## フロントエンド correctness

### Blockers
なし

### Warnings
- **[F-W-001]** サイドバー件数 `loadOwnedNotes(limit:1)` が home の `loadOwnedNotes(limit:full)` と別 `cache()` キーになり `/` で count が 2 回走る
  - 理由: 意図的（ADR-006 にトレードオフ記録済み、行 1 件で限定コスト）。N+1・直列化はなし。
  - 提案: count-only usecase は別 Issue。→ **対応不要（ADR-006 記録済み）**
- **[F-W-002]** `applyBtn`（適用 `<Link>`）に `aria-disabled:*` variant が含まれるが `<Link>` は `aria-disabled` を設定しないため死に variant
  - 場所: `app/components/view/SavedViewsList/styles.ts`（`applyBtn`）
  - 提案: 不要な `aria-disabled:opacity-disabled aria-disabled:cursor-not-allowed` を削除。→ **修正する**

### Notes
- P11 場所行・順序反転、エディタ JSX 再配置（reducer 不変）、P20 chip ラベル生成・Menu 化の a11y いずれも健全。

---

## テスト

### Blockers
なし

### Warnings
- **[T-W-001]** chip ラベル生成（P20 コアロジック）にユニット・コンポーネント両層でテストが無い
  - 場所: `app/components/view/SavedViewsList/styles.ts`（`sortChipLabel`/`visibilityChipLabel`/`dateRangeChipLabel`/`directoryChipLabel`）
  - 理由: plan E-1「無条件コア要件」かつ 2 周目レビュー P-002 で最重要視した新規ロジックが実質ノーカバレッジ（`makeView` が常に空 query を返すためコンポーネント経由でも未描画）。分岐が多く回帰しやすい。
  - 提案: 純粋関数ユニットテストを追加（preset 一致/フォールバック、複数 visibility、sort 全 6 組、directory 解決失敗、空配列→null、ISO→date-only、`baseDate` 注入で決定論化）。→ **修正する（テスト追加）**
- **[T-W-002]** `reduceViews` の "直接検証" 3 テストが `expect(true).toBe(true)` の placebo で偽の網羅感を与える
  - 場所: `app/components/view/SavedViewsList/__tests__/SavedViewsList.test.tsx`
  - 提案: `reduceViews` を export して実テスト化、または placebo ブロックを削除。→ **修正する**

### Notes
- メニュー化に伴う既存テスト更新は正当な追従（アサーション弱体化なし）。
- `NoteMetaPanel.test.tsx` の追加テスト（場所行・フォールバック・順序）は良質。公開状態をメタに出さない negative テストを任意で 1 本足すと回帰防止が厚くなる。→ **任意で追加**

---

## Design Decisions

- M-W-002（編集モードの下部 save-row 廃止）を ADR-003 に意図的差分として追記する。
