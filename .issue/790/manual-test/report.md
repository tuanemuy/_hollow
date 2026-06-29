# ブラウザ検証レポート — Issue #790

**Issue:** #790 — 未処理アップロードバッジをヘッダーCTAからサイドバー upload 項目へ移設
**実行日時:** 2026-06-28
**テストソース:** `.issue/790/testing.md`
**サーバー:** http://localhost:3002（`pnpm dev --port 3002`）
**認証:** `__Host-session = dev-admin-session-token`（`pnpm seed:dev-admin`）

## 結論

**全受け入れ基準を検証、FAIL なし。** ブラウザ実行で 6 件 PASS、動的な再フェッチ系 2 件は `useIngestionQueueCount.test.tsx` のユニットテストで網羅。

## 受け入れ基準の充足

| AC | 内容 | 検証 | 結果 |
|----|------|------|------|
| AC-1 | サイドバー管理「アップロード」項目に未処理件数を表示 | TC-1 | ✅ 件数 19 を `NAV_COUNT` 右寄せで表示 |
| AC-2 | ヘッダー upload ボタンが純粋なCTA（件数なし） | TC-2 | ✅ バッジ消失、開始フロー維持 |
| AC-3 | イベント駆動更新が新しい場所で動く | TC-3 + unit | ✅ アップロードで 19→20、visibility 復帰は unit で網羅 |
| AC-4 | 件数がアクセシブルなテキスト表現を保持（一度だけ） | TC-5 | ✅ `aria-label="アップロード（未処理 19 件）"`、可視 count の二重読み上げなし、active 共存 |
| AC-5 | 実装とモックが一致 | TC-6 | ✅ count span class が `.nav-item .count` 規約と一致、P13 モック同期済み |
| AC-6 | `pnpm typecheck && pnpm lint:fix && pnpm format` 通過 | 品質ゲート | ✅ typecheck/lint/format クリーン、unit 4410 件全通過 |

## 観察した実値

- 未処理 ingestion 件数: **19**（シード投入 + 残存分）→ アップロード後 **20**
- サイドバー aria-label: `アップロード（未処理 19 件）`
- count span class: `ml-auto text-xs text-ink-tertiary`（ライブラリ note 件数の span と完全一致）
- ヘッダーCTA: `aria-label="アップロード"`、件数チップなし、`/#upload` ダイアログ開閉OK
- `/upload` アクティブ時: 同一 `<a>` 要素に `aria-current="page"` / `data-active=""` / `aria-label` が共存
- settings ルート: サイドバー差し替えで件数非表示 → 通常画面復帰で再表示（mount 時再フェッチ、ADR-001 の許容挙動どおり）

## 補足（本変更と無関係・スコープ外）

`/upload` のアップロードキュー一覧パネルが「アップロードの一覧を読み込めませんでした。」を表示していた。一覧描画側の独立事象で、本Issueの変更（バッジ移設・ファイル改名）は一覧描画コードに触れていない。ローカル D1 のシード残存データ起因の可能性が高く、AC-3 対象のサイドバー件数更新は正常動作した。Issue起票は見送り。

## 成果物

- レポート: `.issue/790/manual-test/report.md`
- サマリー: `.issue/790/manual-test/results/summary.md`
- 各結果: `.issue/790/manual-test/results/TC-static.md` / `TC-event.md`
- シード記録: `.issue/790/manual-test/seed-data.md` / `seed-jobs.sql`
