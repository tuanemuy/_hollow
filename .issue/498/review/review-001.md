# PR Review #001 — コードブロックの shiki シンタックスハイライト / Tab インデント

**PR:** #504
**Date:** 2026-06-05
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 7
- Notes: 多数（対応不要）
- Verdict: **BLOCKED**（Warning 残のため。方針: 全 Warning を修正する）

---

## Frontend

#### Blockers
なし

#### Warnings
- **[W-F-001]** `CodeHighlight` の `previousElementSibling` 依存が暗黙契約で脆い。content と marker の間に要素が挿入されると無言で機能停止。
  - 場所: `app/components/note/content/CodeHighlight.tsx`
  - 提案: `data-*` 属性や `parentElement.querySelector(".note-detail-content")` で明示的にルート解決、または children ラップ。
- **[W-F-002]** 読み取りビューに marker span が常駐する変則設計（W-F-001 の根本原因）。`hidden`/`aria-hidden` で実害はないが、ルート解決を堅牢化すれば同時に整理できる。

## Logic

#### Blockers
なし

#### Warnings
- **[W-L-001]** Esc/外側クリック離脱時の focusout 再ハイライトで、離れたはずの `<pre>` へキャレットが復元されフォーカス/スクロールを奪いうる。selection が DOM に残るため `caretOffset` が非 null になる経路。
  - 場所: `InlineEditor.tsx` `highlightPre` / `onFocusOut`
  - 提案: 再ハイライト後、対象がもうフォーカスを保持していなければキャレット復元をスキップ。
- **[W-L-002]** Tab がキャレットのテキストノードを分割し、`dedentAtCaret` の行頭判定が分割後の片側ノードしか見ないため誤動作しうる（保存 HTML は serialize 正規化で無傷だが編集体感が崩れる）。
  - 場所: `InlineEditor.tsx` `insertTextAtCaret` / `dedentAtCaret`
  - 提案: dedent をブロック全体テキスト（オフセット基準）で行頭探索するよう変更。

## Test

#### Blockers
なし

#### Warnings
- **[W-T-001]** plan.md テスト方針の「structureSignature が `<pre>` 配下の span 有無で変化しない」直接テストが欠落。production ロジックが退行しても全テストが通る。
  - 提案: `<pre><code>` で composition 中に span 注入 → `compositionend` で rollback されないことを assert するテストを追加。
- **[W-T-002]** 読み取りビュー用エンハンサー `CodeHighlight.tsx`（plan step 3）が完全未テスト。
  - 提案: marker の前/同親に複数 `<pre>`（code 有り/bare 混在）を置き、各 target で `highlightCodeElement` が呼ばれることをモック検証。

## Performance

#### Blockers
なし

#### Warnings
- **[W-P-001]** 初回ハイライトで全 14 言語を `Promise.all` 一括ロード（raw 約 1.2MB）。1 ブロックでも全言語取得。
  - 場所: `highlighter.ts` `getHighlighter`
  - 提案: `loadLanguage` でオンデマンドロード（ロード済みは Set でスキップ）。
- **[W-P-002]** HtmlEditor プレビューが毎キーストロークで全 `<pre>` を再トークン化（`contentKey={value}` undebounced）。
  - 場所: `HtmlEditor.tsx` / `CodeHighlight.tsx`
  - 提案: `contentKey` 再実行を debounce する。
- **[W-P-003]** `@shikijs/langs` exact `4.2.0` と `shiki ^4.2.0` のバージョンドリフト懸念。
  - 提案: `@shikijs/langs` も `^4.2.0` に揃える。

---

## Design Decisions

- ハイライトのバンドル分離（ADR-005）は実 build で `dist/server`/`dist/server/rsc` に 0 件混入を再確認（Performance レビュー）。設計は妥当。
- `<pre>` opaque 化の例外閉じ込め（#285 外保護維持）はロジックレビューで実コード追跡により確認済み（N-004）。
