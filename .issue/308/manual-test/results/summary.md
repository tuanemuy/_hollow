# テスト実行サマリー

**実行日時**: 2026-05-29
**テストソース**: `.issue/308/testing.md`
**サーバー**: http://localhost:3000
**ブランチ**: issue/308/button-form-domain-actions
**コミット時点**: 実装エージェント完了直後 (typecheck/lint/format/test:unit すべて PASS)

## TC 一覧

| TC | テスト名 | 種別 | 結果 | 失敗ステップ |
|----|---------|------|------|-------------|
| TC-001 | TagActions の編集・統合・削除動線 | 正常系 | PASS | - |
| TC-002 | AccountDeleteForm の ConfirmDialog 化 + 削除フロー | 正常系 | PASS（コア + EC-1）/ EC-2/3/4 SKIP | - |
| TC-003 | UsersTable のアイコン+ラベル化 (4 アクション) | 正常系 | PASS（削除済み行確認のみ SKIP） | - |
| TC-004 | Cross-cutting (size=16 / aria-hidden / contrast / reduced-motion) | Cross | 実質確認済み（TC-1/2/3 で SVG 16x16 / aria-hidden=true を DOM 検査済）+ reduced-motion は OS 設定変更が必要で目視レビュー必須 | - |

**合計**: 4 件（PASS: 3 件 / 部分 PASS: 1 件 / FAIL: 0 件 / SKIP（テスト全体）: 0 件）

## SKIP の理由

- **TC-002 EC-2 (validation エラー時 dialog 残置)**: server-side バリデーションを意図的に再現する手段なし（testing.md 上でも skip 可と記載）
- **TC-002 EC-3 (system エラー時 dialog 閉じ + summary)**: ネットワーク切断のシミュレーション未実施
- **TC-002 EC-4 (isPending 連打ガード)**: 1 回の削除で対象ユーザーが消失するため同一セッション再現不可
- **TC-003 削除済みユーザー行のアクションなし確認**: 現在 DB に該当データなし
- **TC-004 reduced-motion**: OS 設定変更が必要で agent-browser での再現困難。目視確認は推奨

## 主要な確認結果

### 完了条件チェック

- ✅ 3 領域それぞれ「ガイドラインに整合（アイコン+ラベル化）」を記録（ADR-001/002/003）
- ✅ アイコン+ラベル化で `Icon` ラッパー経由・SVG `width=16 height=16`・`aria-hidden=true` を全領域で DOM 確認
- ✅ AccountDeleteForm が `ConfirmDialog` パターンに移行済（独自 inline 確認 UI を廃止）
- ✅ icon-only 化はなし → 44×44 タップ領域 / `aria-label` 必須要件は対象外
- ✅ マニュアルテストで主要 3 動線（TagActions / AccountDeleteForm / UsersTable）の視覚一貫性を確認

### rule 1（不変条件）実機検証

- AccountDeleteForm 削除フローで `await router.invalidate()`（生 invalidate）が `_app` の cached userDto も破棄することを実機確認: 削除後ホーム遷移時に Header が即時で未ログイン状態（「ログイン」「アカウント作成」リンク）に切り替わった
- 静的 guard: `grep "router.invalidate()"` / `grep "rule 1"` 両方 1 件ヒット、WHY コメント保持

### ADR-005 (初期 focus は panel、Tab 1 回で input) 実機検証

- ConfirmDialog 開いた直後のアクティブ要素は `<div role="alertdialog" tabIndex={-1}>` panel
- Tab 1 回で `<input name="confirmation">` にフォーカス遷移
- ヒントテキスト「Tab キーで入力欄に移動できます」が機能を補助

## 範囲外で発見された懸念（スコープ外 Issue 候補）

- **TC-003 で発見**: admin-user 自身の行にも「管理者を解除」「一時停止」アクションボタンが表示される（多くの admin 画面は自身の demote/suspend を防ぐべきだが、本 Issue #308 はボタン形態のみが対象でロジック変更は含まない）。Phase 4 で起票候補

## 成果物

- 結果: `.issue/308/manual-test/results/TC-001.md` / `TC-002.md` / `TC-003.md`
- スクリーンショット: `.issue/308/manual-test/screenshots/tc-001/*` / `tc-002/*` / `tc-003/*`
- シードデータ: `.issue/308/manual-test/seed.sql` / `seed-data.md`
- サーバー情報: `.issue/308/manual-test/server-info.md`
