# ブラウザ検証レポート — Issue #819 ページ遷移フィードバック

**実行日時**: 2026-07-10
**テストソース**: `.issue/819/testing.md`
**サーバー**: http://localhost:3000（`pnpm dev`, vite/cloudflare, miniflare ローカル D1）
**ツール**: agent-browser 0.31.0（`__Host-session` cookie を CDP 注入して認証）

## 結果サマリー

| TC | テスト名 | 結果 |
|----|---------|------|
| TC-001 | グローバル進捗バーの DOM 常設＋decorative 契約 | PASS |
| TC-002 | 編集ルートが RSC 再構成後も正常描画（AC-2 機能面） | PASS |
| TC-003 | 非存在ノート編集→インライン not-found（AC-7） | PASS |
| TC-004 | 一覧→詳細→編集の機能チェーン（AC-4 機能面） | PASS |

**自動検証 4 件すべて PASS / FAIL 0。**

## 検証できた受け入れ基準

- **AC-2**（編集ルートの Suspense ストリーミング化）: 機能面で確認。`renderNoteEditor` を await せず即返す RSC 再構成後もエディタが正常描画され、機能回帰なし（TC-002）。
- **AC-4**（一覧→詳細→編集の一貫性）: 機能面で確認。各ルートで進捗バーが body 直下に常設され、遷移フィードバックの土台が全画面で一貫（TC-001/004）。
- **AC-5**（ページ側で完結・押下スピナー非依存）: 進捗バーが decorative（aria-hidden）でページ側に常設されていることを確認（TC-001）。
- **AC-7**（非存在ノート編集→インライン not-found）: `role="alert"`「ノートが見つかりません」がシェル保持で表示され、フルページ `RouteErrorFallback` ではないことを確認（TC-003）。

## 自動検証の対象外（ユニット＋手動手順で担保）

- **AC-1**（クリック後 200ms 以内の進捗バー出現）・**AC-3**（モバイル/hover 無効での出現）・**AC-6**（reduced-motion 静的化）は、遷移中の**一過的**表示状態。agent-browser は `wait --load networkidle` 後に snapshot するため、loading 完了後しか観測できず一瞬の可視化を捕捉できない。
- 担保: `RouteProgressBar.test.tsx`（`isLoading=true` での可視化・reduced-motion クラス契約）等のユニットテスト＋`.issue/819/testing.md` の手動手順（Network throttling＋目視）。

## 発見（非ブロッカー・Issue 819 スコープ外）

- **`/notes` で RootDocument が二重描画される既存挙動**: 進捗バーが 2 個描画されるが、これは head の `<meta charset>`/`<meta viewport>` も同じく 2 個になる既存挙動に**完全連動**（バー数＝charset数＝viewport数、詳細/編集ルートでは 1 個）。charset/viewport は Issue 819 で未変更のため、この二重描画は本 Issue 以前から存在する RootDocument レンダリング挙動。進捗バーは装飾（aria-hidden・pointer-events-none・完全重複）のため影響ゼロ。詳細は `results/analysis.md`。
  - → コード変更不要。既存の RootDocument 二重描画は Issue 819 と独立した既存の軽微な smell として **Issue #827** に起票済み。

## 環境メモ

- 本番確認（`pnpm build && pnpm start`, wrangler dev :8787）は、当セッションのローカル D1 状態不一致で `/notes` が 404 になり本番相当の認証ページを再現できなかった（検証環境側の制約）。RootDocument 二重描画の切り分けは dev サーバーの正常描画ページで確定済み。

## 成果物

- レポート: `.issue/819/manual-test/report.md`
- テスト結果: `.issue/819/manual-test/results/`（TC-001〜004, summary, analysis）
- シードデータ: `.issue/819/manual-test/seed-data.md`
- サーバー情報: `.issue/819/manual-test/server-info.md`
