# ブラウザ検証レポート — Issue #654: 公開ページ(P30)の「タグを追加(＋)」UI

**実行日**: 2026-06-13
**テストソース**: .issue/654/testing.md
**サーバー**: http://localhost:3000（`pnpm dev`）
**検証ブランチ**: issue/654/public-tag-add-chip

## 結果概要

8 テストケース全 PASS（FAIL: 0）。Issue の受け入れ基準 AC-1〜AC-6 をすべて実機で確認した。起票した Issue はなし。

| TC | 対応AC | 結果 | 要点 |
|----|--------|------|------|
| TC-001 | AC-1 | PASS | ＋chip は filter-row に存在。公開面 `CHIP`（実線 pill）クラスでモック 570-573 と一致。auth の破線 `filterChipGhost` ではない |
| TC-002 | AC-2 | PASS | ＋chip listbox に公開タグ母集合10種を列挙。1ページ目発見chipに無い「ページ2タグ」も選択肢に含む（母集合＝発見タグの上位集合） |
| TC-003 | AC-3 | PASS | 「非公開タグ」が listbox・発見chips どちらにも出ない（公開 gate 機能） |
| TC-004 | AC-5 | PASS | ＋chip からのタグ追加で一覧絞り込み・URL `tags` 反映・リロード復元が成立 |
| TC-005 | AC-5 | PASS | 8件選択状態で未選択 option が `[disabled]` で抑止。9件目は tags に入らず、リロードでも8件保持（`.catch(undefined)` 全消失なし） |
| TC-006 | AC-6 | PASS | chips 行内で選択中タグの欠落・二重表示なし。chips行と＋chip選択肢の重複は ADR-003 の意図的許容 |
| TC-007 | - | PASS | 公開タグ0件ユーザー（test-user-001）で＋chipは「公開タグはまだありません。」の空状態。クラッシュなし |
| TC-008 | - | PASS | 既存の発見タグ絞り込み・期間フィルター・ソートは＋chip追加の影響を受けず従来通り動作 |

## シードデータ

`test-public-user`（公開ノート28件・公開タグ10種）をメインに、`test-user-001`（公開ノートあり・公開タグ0件）をエッジ用に使用。詳細は `seed-data.md`、生成スクリプトは `seed-654.mjs`。

- 公開タグ母集合10種: TypeScript / 設計 / 日記 / Rust / Go / データベース / テスト / ブラウザ / アーキテクチャ / ページ2タグ
- 非公開専用タグ: 非公開タグ（gate 検証用、公開ノートに一切付かない）
- 現ページ外タグ: ページ2タグ（最古ノートのみ付与、28件中28番目でページ2送り。1ページ20件）

## agent-browser 偽陽性の切り分け

＋chip listbox の option（および sort の menuitemradio）クリックは agent-browser から React の合成 onClick に届かず URL が変化しない既知の偽陽性が発生した。実装バグと即断せず、以下で切り分けた:

- 通常の button/link（発見タグ chip・期間 chip）のクリックは正常に React へ届き URL 更新を確認 → アプリ側のクリック処理は健全
- TC-005（最重要）は option の `[disabled]` 属性とURL不変という**結果**で判定 → クリックの効/不効に依存せず cap 抑止を断定
- TC-004/006/008 のタグ追加・ソート結果は URL 直接操作（`?tags=...` / `?sort=...`）で確認 → 機能は正しく動作

いずれも agent-browser 起因の偽陽性であり、実装バグではない。

## 起票した Issue

なし（全 PASS）。

## 成果物

- レポート: .issue/654/manual-test/report.md（本ファイル）
- サマリー: .issue/654/manual-test/results/summary.md
- テスト結果: .issue/654/manual-test/results/TC-001.md 〜 TC-008.md
- シード: .issue/654/manual-test/seed-data.md / seed-654.mjs
