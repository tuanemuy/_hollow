# Browser Verify Report — Issue #542

**実行日時**: 2026-06-07
**テストソース**: .issue/542/testing.md
**サーバー**: http://localhost:3001/
**修正ラウンド**: 0回（全TC初回PASS。検証中に発見した軽微な文言差をその場で1点修正）

---

## サマリー

| 項目 | 値 |
|---|---|
| テストケース総数 | 9 |
| PASS | 9 |
| FAIL | 0 |
| PASS率 | 100% |
| 起票Issue数 | 0 |

---

## シードデータ

ローカル D1 に dev-admin ユーザー（`pnpm seed:dev-admin`）+ Issue #542 用データ（`.issue/542/manual-test/seed.sql`）を投入。

- **アカウント**: `dev-admin@example.com` / セッション Cookie `__Host-session` = `dev-admin-session-token` を CDP 注入してログイン
- **ゴミ箱(P17)**: trashed ノート4件（削除日の異なるもの・長いタイトル1件含む）
- **タグ(P18)**: 6タグ（frontend=4 / llm=2 / design=2 / bug=1 / archived=1 / unused=0）
- **公開設定(P14)**: public 2 / unlisted 1 / private 2、unlisted ノートに共有リンク2本（最終アクセスあり1・なし1）

詳細: `.issue/542/manual-test/seed-data.md`

---

## テスト結果一覧

| TC | テスト名 | 種別 | 最終結果 | 初回結果 | 修正ラウンド | 備考 |
|----|---------|------|---------|---------|-------------|------|
| TC-001 | P17 保存期間案内カード | 正常系 | PASS | PASS | - | `role="note"` カード・太字導入文を確認 |
| TC-002 | P17 完全削除の確認ダイアログ（赤アラート） | 正常系 | PASS | PASS | - | 赤アラートに対象名・取消不可文太字・二重アイコンなし |
| TC-003 | P17 復元と完全削除の動作 | 正常系 | PASS | PASS | - | 復元・完全削除とも実動作 |
| TC-004 | P18 行アクション hover/focus + 狭幅ケバブ | 正常系 | PASS | PASS | - | 1280でhover表示、800(lg未満)でケバブ+件数非表示 |
| TC-005 | P18 ボタンのサイズ/バリアント | 正常系 | PASS | PASS | - | リネーム/統合=小型、削除=ghost-danger |
| TC-006 | P18 inline rename ブロック | 正常系 | PASS | PASS | - | 見出し+accent-surface背景、楽観保存 |
| TC-007 | P18 統合ダイアログ（回帰） | 正常系 | PASS | PASS | - | 統合先select・対象件数を確認 |
| TC-008 | P14 ラジオ説明文 + 公開時URLプレビュー | 正常系 | PASS | PASS | - | 3ラジオに説明文、public選択でURL表示 |
| TC-009 | P14 限定公開リンクの link-card | 正常系 | PASS | PASS | - | head行チップ+最終アクセス、URL行+コピー |

---

## 起票した Issue

なし（FAIL ゼロ）。

---

## 検証中に直した軽微な差分（その場で修正）

- **P17 破壊操作ボタンの文言**: 一覧ピル + 確認ダイアログの確認ボタンを「完全削除」→「完全に削除」へ修正（モック `P17-trash.html` L678/L787 に追従）。`TrashRowActions.tsx`。typecheck / lint / format / test:unit(3323件) 全パス。

---

## 要手動確認（断定回避項目・致命でない）

| 項目 | 状況 |
|------|------|
| P18 639px未満のケバブ44pxタップターゲット | クラス `max-sm:min-h-[44px]` をコード確認済み、500px未満の目視は未取得 |
| P18 統合実行中の indeterminate progressbar 動的描画 | `role="progressbar"` を MergeTagDialog.tsx に実装確認、破壊操作回避のため実行せず |
| P18 hover時の削除ボタン error-surface 背景 | CSS クラス定義で担保確認、静止スクショでhover取得困難 |
| P18 candidates.length===0（統合項目消滅） | 統合候補=「自分以外の全タグ」仕様のためタグ1個のアカウントでのみ再現（件数ばらつきシードと両立不可）、実装確認済み |

いずれも実装コード上は担保確認済み。動的目視のみ未取得で FAIL ではない。

---

## スクリーンショット一覧

| TC | ファイル |
|----|---------|
| TC-001 | `screenshots/p17/tc-001.png` |
| TC-002 | `screenshots/p17/tc-002-dialog.png` |
| TC-003 | `screenshots/p17/tc-003-restore.png`, `tc-003-purge.png` |
| TC-004 | `screenshots/p18/tc-004-wide.png`, `tc-004-narrow.png`, `tc-004-kebab.png` |
| TC-005 | `screenshots/p18/tc-005.png` |
| TC-006 | `screenshots/p18/tc-006.png`, `tc-006-saved.png` |
| TC-007 | `screenshots/p18/tc-007.png`, `tc-007-selected.png` |
| TC-008 | `screenshots/p14/tc-008-modal.png`, `tc-008-url.png` |
| TC-009 | `screenshots/p14/tc-009-linkcard.png`, `tc-009-copy.png` |

---

## 環境情報

- **OS**: Darwin 25.4.0
- **agent-browser**: 0.27.0
- **サーバーコマンド**: `pnpm dev`（vite dev / Cloudflare ランタイム）
- **ポート**: 3001（PORT env 無視で 3000→3001 フォールバック）
