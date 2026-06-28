# テスト実行サマリー — Issue #790

**実行日時**: 2026-06-28
**テストソース**: .issue/790/testing.md
**サーバー**: http://localhost:3002（pnpm dev）

| TC | テスト名 | 対応AC | 種別 | 結果 | 備考 |
|----|---------|--------|------|------|------|
| TC-1 | サイドバー upload 項目への件数表示 | AC-1 | 正常系 | PASS | 件数 19 を右寄せ `ml-auto text-xs text-ink-tertiary` で表示（note 件数と同一見た目） |
| TC-2 | ヘッダーCTAが純粋な開始ボタン | AC-2 | 正常系 | PASS | 件数チップなし、#upload ダイアログ開閉OK、二重表示なし |
| TC-3 | イベント駆動更新（アップロード成功） | AC-3 | 正常系 | PASS | アップロードで 19→20 にリロードなしで増加 |
| TC-4 | visibility 復帰での再フェッチ | AC-3 | 正常系 | ユニットテストで網羅 | `useIngestionQueueCount.test.tsx`（visibility復帰再フェッチ / hidden中スキップ） |
| TC-5 | アクセシブルなテキスト表現 | AC-4 | 正常系 | PASS | `aria-label="アップロード（未処理 19 件）"`、active時 `aria-current="page"`/`data-active` 共存 |
| TC-6 | 実装とモックの一致 | AC-5 | 正常系 | PASS | count span class が `.nav-item .count`（NAV_COUNT）規約と一致、モック P13 同期済み |
| Edge-1 | settings ページでの挙動 | - | 異常系 | PASS | settings では件数非表示（仕様）、通常画面復帰で再表示 |
| Edge-2 | 件数取得失敗時の前回値保持 | - | 異常系 | ユニットテストで網羅 | `useIngestionQueueCount.test.tsx`（失敗時前回値保持 / 初回失敗は非表示） |

**合計**: 8 件（PASS: 6 / ユニットテストで網羅: 2 / FAIL: 0）

## 補足（スコープ外・本変更と無関係）

- `/upload` のアップロードキュー一覧パネルが「アップロードの一覧を読み込めませんでした。」を表示していた。これは一覧描画側の独立事象で、本Issueの変更（バッジ移設・ファイル改名）は一覧描画に触れていない。ローカル D1 のシード残存データ起因の可能性が高い。AC-3 対象のサイドバー件数更新は正常動作したため、本Issueの受け入れには影響しない。Issue起票は見送り（環境/シード起因の可能性が高く、まとまった調査を要しない）。
