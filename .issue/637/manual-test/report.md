# ブラウザ検証レポート — Issue #637: 高度なローディングUX

**実行日:** 2026-06-12
**テストソース:** `.issue/637/testing.md`
**サーバー:** http://localhost:5173（`pnpm dev`、ローカル D1）
**認証:** `dev-admin@example.com`（`pnpm seed:dev-admin`）+ `__Host-session` cookie 注入

## 検証方針と制約

このプロジェクトの `docs/test.md` に「ボタン経由の mutation を介する操作はブラウザ自動検証には不向き（agent-browser の click が React の onClick に届かないことがある）」と明記されている。本 Issue の機能は大半がボタン起点（アップロード実行・リトライ押下・フォーム送信）であるため、**動的な pending / retry 挙動の検証はユニットテスト（新規6テストファイル＋更新済みテスト、`pnpm test:unit` で3551件全通過）で担保**し、ブラウザ検証は**「描画されること」「回帰がないこと」の視覚確認**に絞った。

`processing` / `pending` 状態の取り込みジョブはローカル D1 に SQL で直接投入して可視化した（ボタン操作不要）。

## 結果サマリー

| TC | テスト名 | 種別 | 結果 |
|----|---------|------|------|
| TC-1 | 取り込みキューの processing/pending カードに進捗インジケータ | 正常系 | PASS |
| TC-2 | 主要6ページが回帰なく描画される | 回帰 | PASS |
| TC-3 | useFormStatus 導入フォームの送信ボタン描画（idle） | 正常系 | PASS |

**合計: 3 件（PASS: 3 / FAIL: 0）**

起票した Issue: なし

## TC-1: 取り込みキュー進捗インジケータ — PASS

- `/upload` を開き、SQL 投入済みの2ジョブを確認:
  - `processing-doc.md`（status=processing）: 状態文言「処理中」+「タイトルとメタデータを解析中...」、`.bg-surface` トラック内に `.bg-accent` の不確定バー（`w-2/5 motion-safe:animate-pulse`）を描画。
  - `pending-doc.md`（status=pending）: 状態文言「待機中」+「処理を待っています...」、同上の不確定バーを描画。
- ProgressBar は `IngestionJobRow` で `decorative` モード（`aria-hidden="true"`、`role="progressbar"` 無し）で使用。これは `ProgressBar.tsx` の JSDoc に明記された意図的な設計で、隣接する状態テキスト（親 `IngestionQueue` の `aria-live` 領域）が進行状態をアナウンスするため、進捗バーの二重アナウンスを避ける狙い（plan.md のリスク「aria-live 二重読み上げ」への対応と一致）。進捗バー描画・状態文言ともに正常で仕様通り。

## TC-2: 主要ページ回帰確認 — 全URL PASS

`/`, `/tags`, `/trash`, `/upload`, `/settings/security`, `/settings/profile` のいずれもエラーフォールバックは出ず、主要要素が正常描画。RouteErrorFallback リファクタ・各 `errorComponent` 差し替えによる回帰は確認されず。

## TC-3: useFormStatus フォーム送信ボタン描画 — PASS

| ページ | ボタン | type | disabled |
|---|---|---|---|
| `/settings/security` | パスワードを変更 | submit | false |
| `/settings/security` | 確認メールを送信（メール変更） | submit | false |
| `/settings/profile` | ユーザー名を変更 | submit | false |

すべて idle（非 disabled）で正常描画。`ShareLinkGate`（public）は公開ノート共有リンクの準備が必要なため指示通りスキップ。

## 補足

- agent-browser 0.27.1 では `get count` / `get html --selector` が live DOM に正しくマッチしないため、検証は `eval`（`document.querySelectorAll` 等）で実施。
- 動的挙動（送信中の pending ラベル・retry ボタン押下・件数進捗の進行）はユニットテストでカバー済み。ブラウザ自動検証では docs/test.md の制約により対象外。
</content>
</invoke>
