# テスト実行サマリー — Issue #840

**実行日時**: 2026-07-19
**テストソース**: .issue/840/testing.md
**サーバー**: http://localhost:8787（wrangler dev --local）

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-1 | img 付近テキスト入力 → img Backspace で TAIL 道連れ消失しない（TC-005 相当） | 変更起因/正常系 | PASS | img アップロード〜削除試行まで完走。`before<img>afterTAIL` に復元 |
| TC-2 | 複数ブロック編集後の空セル入力で先行編集が消えず上書き保存もされない（TC-007 相当） | 変更起因/正常系 | PASS | 追記A/追記B 保持、サイレント上書きなし（再読込確認） |
| TC-3 | 空プレースホルダブロックへの非 IME 1 文字入力が定着（候補C/AC-4） | 変更起因/正常系 | PASS | `<td>`/`<p>` とも定着・永続、contenteditable 漏れなし |
| TC-4 | デバウンス窓経由のサイレント消失防止（AC-3′/P-001） | 変更起因/正常系 | PASS（近似） | TAIL2 永続。厳密な <50ms 窓は CLI レイテンシで再現不可、主保証は自動テスト 4-T3 |
| TC-5 | 装飾要素の remove は従来どおり rollback（#233 回帰防止/AC-5） | 回帰/正常系 | PASS | `<strong>` 削除は rollback で復元。img 部分は TC-1 でカバー |
| TC-6 | IME 変換の回帰なし（AC-6） | 回帰 | PASS（代替） | 日本語入力の定着・保存を確認。真の IME 合成イベントは agent-browser 制約で BLOCKED |
| TC-7 | `<pre>` ハイライト回帰・rollback 復元後の平文性（AC-7） | 回帰 | PASS | 編集中平文/focusout 再ハイライト/保存 HTML に span・contenteditable 漏れなし |

**合計**: 7 件（PASS: 7 / FAIL: 0 / うち近似・代替検証: 2）

## BLOCKED（agent-browser ツール制約 — 実装の問題ではない）
- TC-4 厳密なデバウンス窓（<50ms）: agent-browser のコマンド間レイテンシで忠実再現不可。近似（追加入力なしで保存 → TAIL2 永続）で受け入れ達成。主保証は自動テスト 4-T3（`pnpm test:unit`）。
- TC-6 真の IME 合成（compositionstart/update/end）: agent-browser 0.32.0 は合成イベントを送出できない。通常キー入力での日本語定着で代替検証。testing.md 手順3（空セルへ IME 最初の 1 文字＝ADR-002 の既知残存制約）は合成不可のため判定不能。日本語通常入力では他ブロック本文の消失は観測されず。

## 変更起因の FAIL
なし。

## 補足（testing.md 改善メモ、非ブロッカー）
- ノートB本文の `<pre><code>const x = 1;</code></pre>` は言語クラス無しのためハイライタが plaintext で早期 return し span が付かない（仕様どおり・回帰でない）。ハイライト経路は `class="language-js"` 付与の補助ケースで実効検証し PASS。testing.md の本文に言語クラスを含めるとより忠実に検証できる。
