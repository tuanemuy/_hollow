# PR Review #001 — fix(tag): P18 タグ管理のデザイン追従と作成/統合/並び替えの楽観的更新を統一

**PR:** #610
**Date:** 2026-06-09
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 4（Frontend 1 / Test 2 / Design 1）
- Notes: 多数（良好な実装の確認）
- Verdict: **BLOCKED**（Warning を残さず潰す方針のため）

---

## Frontend / React 状態管理・楽観的更新

### Blockers
なし

### Warnings
- **[FE-W-001]** `CreateTagForm` の `submitting` ガードが実質デッドコード（二重送信防止が `submitting` state ではなく入力クリアの副作用に依存）
  - 場所: `app/components/tag/CreateTagForm.tsx:27-42`
  - 理由: `setSubmitting(true)` → `onCreate(name)` → `setSubmitting(false)` が全て同期ハンドラ内で完結し、次の submit 時には `submitting` が既に `false`。`if (submitting) return;` ガードは常に通過する。実際に連打を止めているのは「`onCreate` 前に input を空にし、2回目以降を `name.length === 0` の early return で弾く」点。コメントと実装が乖離。
  - 提案: `submitting` state を撤去し、入力クリアによる early return が二重送信を防ぐ事実をコメントに明記する（実害なし）。

### Notes
- onMerge 親リフトが onDelete と完全同型で一貫（`MergeTagDialog` から `useServerFn`/`routerInvalidate`/`useTransition`/`closable`/進捗バナーが正しく除去、サーバー呼び出しは `TagList.onMerge` に集約）。
- 楽観 add の一時 id `tmp-${crypto.randomUUID()}` で key 安定・snap back 収束、reducer 純粋で二重表示なし。
- `TagListToolbar` の楽観化が `FilterBar` の `run(action, nav)` パターンに忠実。disabled 撤廃 + aria-busy。
- 検索 q は uncontrolled 維持・`key={query ?? ""}` 据え置きで P-002 の干渉を正しく回避。
- エラーは作成=フォーム直下 / 統合=行 snap back 後 actionError と確定タイミングに沿って分離。

---

## Test

### Blockers
なし

### Warnings
- **[TEST-W-001]** 作成フォームの「二重送信防止（連打ガード）」がテスト未検証（実装ガードも実質無効）
  - 場所: `app/components/tag/__tests__/TagList.test.tsx`（optimistic create describe）／実装 `CreateTagForm.tsx:27-42`
  - 理由: plan ステップ2/7（S-002）で要求された連打ガードのテストが無い。FE-W-001 と同根（`submitting` デッドコード）。
  - 提案: 連打（未解決 createMock 状態で2回 submit）で `createMock` が1回しか呼ばれないことを検証するテストを追加。
- **[TEST-W-002]** 作成 submit 後の「入力欄即時クリア」が未検証
  - 場所: `app/components/tag/__tests__/TagList.test.tsx`（optimistic create describe）
  - 理由: ADR-002 の要件「submit 後に即クリア」が未アサート。クリア処理を消す回帰を捕捉できない。
  - 提案: 作成 submit 後に入力欄 value が `""` であることを1行で固定。

### Notes
- P-001 完全履行: 旧 `disables ...` 2テストが pending 中 enabled + `aria-busy` + 楽観 active 即時反映の検証へ反転・改名済み。
- `reduceTags` の add 単体テスト十分（追加/不変/空リスト/非破壊・snap back 収束）。
- 統合の楽観 remove テスト（即時消去・失敗 snap back + alert）十分。submit セレクタが行トリガと曖昧さなく弁別。

---

## Design / Styling 整合

### Blockers
なし

### Warnings
- **[DESIGN-W-001]** SSOT の `.tag-create input` がトークン値を全文複製しており「既存トークンのみ・上書きしない方針」と整合がやや弱い
  - 場所: `spec/design/pages/P18-tags.html`（`.tag-create input` ルール）/ `spec/design/pages/mobile/P18-tags.html`
  - 理由: ツールバー検索欄は `.search` クラスを再利用しレイアウト差分のみ上書きするのに対し、`.tag-create input` は `.search input` の意匠（bg/radius/padding/hover/focus 等）を丸ごと再宣言。値は全て既存トークン参照なので方針違反ではないが DRY を外し、将来 `.search input` のトークン変更時に追従しない乖離リスク。
  - 提案: `.tag-create input` に「`.search input` の意匠を意図的に複製（検索アイコン無しで pl 差分のみ）」とコメントで明記し、監査時の誤判定を避ける。

### Notes
- `!mb-6`/`!mt-0` のページ局所オーバーライドは既存作法（`pillBtnDanger` 先例）に沿い CLAUDE.md 規約から逸脱せず、共有トークン不変で他画面に波及しない。
- 縦リズムが desktop/mobile 両 SSOT と一致（`--space-6`/`--space-5`、`<ul>` の `mt-6` 撤去、空状態 `!mt-0`）。
- 作成フォームのトークンがタグページ意匠（`.search`+`.btn-primary`）に準拠、`FIELD_*` 排除、高さ 36px 整合。
- モバイル `max-sm:flex-none` 修正が SSOT mobile と整合。utility-first 遵守、`data-*` 規約維持。

---

## Design Decisions

特になし（ADR-001〜005 で既出。修正は既存方針の範囲内）。
