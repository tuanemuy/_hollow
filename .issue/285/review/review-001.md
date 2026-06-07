# PR Review #001 — Support <pre> code block editing in inline mode

**PR:** #494
**Date:** 2026-06-05
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2（重複統合後）
- Notes: 多数（良好）
- Verdict: **BLOCKED**（Warning を残さず潰す方針のため）

---

## Frontend

### Blockers
- なし

### Warnings
- **[W-001]** `<pre>foo</pre>`（`<code>` ラップ無しの直接テキスト）構造の Enter 改行・編集テストが無い（追加 5 テストはすべて `<pre><code>…</code></pre>` のみ）。
  - 場所: `app/components/note/editor/__tests__/inlineEditor.test.tsx:314` 付近
  - 理由: 計画リスク欄・ADR-001 が「両構造を確実にカバーするためテストで両方 pin する」と明記しているが、直接テキスト構造のテストが欠けており計画と乖離。
  - 提案: `<pre>foo</pre>` での装飾（contenteditable=true）と Enter 改行を pin するテストを追加。
- **[W-002]** `disabled` トグルで `<pre>` の `contenteditable` が外れ／再付与されることを pin するテストが無い（既存 disabled テストは `<p>` のみ）。
  - 場所: `app/components/note/editor/__tests__/inlineEditor.test.tsx:214`
  - 理由: `<pre>` は `hasDirectTextChild` ゲートを迂回する唯一の特例で、`clearEditable`→`applyEditable` の往復が `<pre>` でも対称に動くことは自明でない（実装上は属性走査なので正しく動くが回帰ガードが無い）。
  - 提案: `disabled` 切替で `<pre contenteditable>` が外れ、再有効化で戻ることを pin するテストを追加。

### Notes
- **[N-001]** `insertTextAtCaret` の切り出しは良いリファクタ。`onPaste` のロジックと完全同一でペースト挙動に差分なし（既存テスト #6 で回帰ガード）。
- **[N-002]** `isWithinPre` は text node 起点・`null` 安全・`host` 境界停止すべて正しく、`closest` を使わない理由を why コメントで説明（CLAUDE.md 準拠）。
- **[N-003]** Enter 分岐の `preventDefault` 先頭実行＋早期 return で `<pre>` 外の新規ブロック生成防止を維持（既存テスト #4 PASS）。IME 早期 return も維持。
- **[N-004]** `serializeHostContent` の `[contenteditable]` 一括除去で `<pre>` 属性も漏れない（W-F-003 ガードがそのまま有効）。
- **[N-005]** ADR-002 の `<pre>` 最終行 `\n` 視覚クォークは既知制限として妥当に受容。
- **[N-006]** `pnpm typecheck` PASS、対象テスト 23 件 PASS。`:521` の lint 警告は main 由来の既存問題で本 PR 差分外。
- **[N-007]** CSS/className 変更なし。`.note-detail-content` の `white-space: pre` を再利用、新規 CSS 追加なしで計画と整合。

---

## Test

### Blockers
- なし

### Warnings
- **[W-001]**（Frontend W-001 と同一）`<pre>code</pre>`（直接テキスト）構造のテストが無い。実機で動作確認済みだが回帰ガードが欠けている。`<code>` ラップ専用の `isPre` 迂回が効いていることと、直接テキストが従来ゲートで通ることを切り分けるためにも追加すべき。
  - 場所: `app/components/note/editor/__tests__/inlineEditor.test.tsx:299-421`
  - 提案: `<pre>ab</pre>` で（a）contenteditable=true、（b）Enter で `a\nb` になり `<br>`/要素が増えないことを pin。

### Notes
- **[N-001]** 計画ステップ4 の 5 テストはすべて実装され、mutant 注入（`isWithinPre` 常時 false / `isPre` 迂回削除 / Tab preventDefault 削除）で回帰検出力を実測。いずれも確実に fail し、トートロジー・偽陽性でないことを確認。全 23 PASS。
- **[N-002]** characterData テストは「onChange 発火」＋「編集後テキスト生存」＋「`<pre>` 1 個維持」まで assert。要素強制挿入ロールバックテストと対で `classifyRecords` の境界を両側から固定。
- **[N-003]** 既存回帰テスト（#4 / #5 / #6）維持。paste は `insertTextAtCaret` 切り出し後も挿入点まで pin。
- **[N-004]** happy-dom の selection seed と実装の `host.ownerDocument.getSelection()` は同一 document で整合。
- **[N-005]** 軽微: Enter テストは onChange を握りつぶすが characterData テストが onChange 経路をカバーするため重複不要。

---

## 対応方針

両 Warning ともテストファイル内で完結する軽微な穴で、計画の自己宣言（両構造を pin する）とのズレ。このPRで修正する:
- W-A（Frontend W-001 + Test W-001）: `<pre>foo</pre>` 直接テキスト構造の装飾＋Enter 改行テストを追加
- W-B（Frontend W-002）: `<pre>` の disabled トグル回帰テストを追加

## Design Decisions

特になし（既存 ADR-001〜003 の範囲内）。
