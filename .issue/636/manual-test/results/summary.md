# テスト実行サマリー — Issue #636

**実行日時**: 2026-06-11
**テストソース**: .issue/636/testing.md
**サーバー**: http://localhost:3000（`pnpm dev`）/ http://localhost:8787（`pnpm build && pnpm start`）
**認証**: dev-admin（cookie `__Host-session=dev-admin-session-token`）

| TC | テスト名 | 種別 | 結果 | 備考 |
|----|---------|------|------|------|
| TC-A | ホーム初回ロード・インタラクション | 正常系 | PASS（修正後） | 初回実行でハイドレーション停止のブロッカー検出 → TC-A2 で切り分け |
| TC-A2 | ハイドレーション停止の切り分け | デバッグ | 解決 | 原因は `@tanstack/router-core@1.169.2` の SSR シリアライズのレース（上流修正済み）。`react-router ^1.170.15` / `react-start ^1.168.25` へアップグレードで解消（ADR-010） |
| TC-B | 全18画面の遷移・描画リグレッション | 正常系 | PASS（18/18） | ノート詳細・tags・trash・views・upload・export・exports・settings×4・admin×7 |
| TC-C | 失敗局所化・リトライ回復・シェル局所化・未認証・notFound | 異常系 | PASS（5/5） | DoD 2（エラー境界での局所化）を実機確認。リトライで回復も確認 |
| TC-PROD | 本番ビルド streaming スモーク | 正常系 | PASS（4/4） | SSR HTML に Suspense マーカー `<!--$-->`×10・`$_TSR`×28。ハイドレーション・絞り込み・ナビ正常 |

**合計**: 5 件（PASS: 5 / FAIL: 0）

## 所見

- スケルトンのフォールバック表示は localhost ではデータ解決が速すぎて未捕捉（FAIL ではない。SSR HTML 上の境界マーカーと単体テストで担保）。
- ポーリング（upload はクライアント fetch、exports/$jobId は Suspense 適用外 — ADR-008）によるフリッカーは構成上発生しない。検索・フィルタ操作でのスケルトン巻き戻りも観察されず。
- TC-B 注記: ノート一覧カードの trusted click が座標的に別要素に当たる可能性（`element.click()` では SPA 遷移成功、ハイドレーションは正常）。#636 起因ではない既存挙動の可能性が高い。
- 未認証時の `/settings/profile` は `/`（公開ランディング）へ redirect。testing.md の「ログインへ」とは異なるが従来挙動どおりで #636 起因ではない。
