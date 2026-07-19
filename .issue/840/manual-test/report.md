# ブラウザ検証レポート — Issue #840

**Issue:** #840 — inline モード: 保守的 rollback が最後の rebuild snapshot まで全体を巻き戻し、rebuild 前の編集がサイレント消失する
**PR:** #845
**実行日時:** 2026-07-19
**テストソース:** .issue/840/testing.md
**サーバー:** http://localhost:8787（`pnpm build:local && pnpm start`, wrangler dev --local）

## 結論

**全 7 確認項目 PASS / 変更起因の FAIL ゼロ。** Issue #840 の保守的 rollback 修正（候補B: snapshot 追従 / P-001: rollback reconciliation / 候補C: プレースホルダ `<br>` 許容）は、実機ブラウザで意図どおり動作することを確認した。

- **TC-005（img 道連れ消失）解消**: img 直後に入力した `TAIL` が、img の Backspace 削除試行による rollback 後も DOM に保持される（従来は最後の rebuild snapshot まで全体巻き戻りで消失）。
- **TC-007（td の DOM 消失＋サイレント上書き保存）解消**: 複数ブロックへ追記して自動保存到達後、空 `<td><br></td>` へ入力しても先行編集（追記A/追記B）が DOM から消えず、後続保存でのサイレント上書きも発生しない。
- **候補C 定着**: 空 `<td>`/`<p>` プレースホルダブロックへの非 IME 1 文字入力が rollback されず定着・永続する。
- **回帰なし**: 装飾要素の remove は従来どおり rollback（#233 の安全機構維持）、IME 通常入力の定着、`<pre>` ハイライトの再適用・保存 HTML の平文性いずれも維持。

詳細は `results/summary.md` および `results/TC-1.md`〜`TC-7.md` を参照。

## ツール制約による BLOCKED（実装の問題ではない）

- **厳密なデバウンス窓（<50ms, TC-4）**: agent-browser のコマンド間レイテンシで忠実再現不可。近似（追加入力なしで保存 → `TAIL2` 永続）で受け入れ達成。この経路の主保証は自動テスト 4-T3（`pnpm test:unit`、52 passed）。
- **真の IME 合成イベント（TC-6）**: agent-browser 0.32.0 は compositionstart/update/end を送出できない。通常キー入力での日本語定着・保存で代替検証。空セルへの IME 最初の 1 文字（ADR-002 の既知残存制約）は合成不可のため判定不能だが、日本語通常入力では他ブロック本文の消失は観測されなかった。

## 起票した Issue

なし（変更起因の FAIL がないため）。

## testing.md 改善メモ（非ブロッカー）

- ノートB本文の `<pre><code>const x = 1;</code></pre>` は言語クラス無しのためハイライタが plaintext で早期 return し span が付かない（仕様どおり・回帰でない）。TC-7 のハイライト経路は `class="language-js"` 付与の補助ケースで実効検証し PASS。testing.md の本文に言語クラスを含めるとより忠実に検証できる。

## 成果物

- レポート: .issue/840/manual-test/report.md（本ファイル）
- サマリー: .issue/840/manual-test/results/summary.md
- 各テスト結果: .issue/840/manual-test/results/TC-1.md 〜 TC-7.md
- サーバー情報: .issue/840/manual-test/server-info.md
- シードデータ: .issue/840/manual-test/seed-data.md
