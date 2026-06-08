# ブラウザ検証レポート — Issue #589: admin 高密度テーブルのカード化

**実行日:** 2026-06-08
**サーバー:** http://localhost:3000（`pnpm dev`）
**テストソース:** `.issue/589/testing.md`
**認証:** `pnpm seed:dev-admin` の dev-admin セッション（`__Host-session=dev-admin-session-token`）
**ビューポート:** `set viewport <w> <h>` で 320 / 390 / 430（mobile）・1280（lg 非回帰）

---

## サマリー

**最終結果: 全項目 PASS。** 初回検証で主対象 3 ルートのタッチ床（44px）未達（FAIL）を検出 → 変更箇所起因のため Phase 2 に戻り `!important`（mobile 限定）で修正 → 再検証で全 PASS。

| ルート | パス | 320 | 390 | 430 | lg 非回帰 | カード化 | 44px 床 | 判定 |
|---|---|---|---|---|---|---|---|---|
| P45 ユーザー一覧 | `/admin/users` | over=0 | over=0 | over=0 | PASS（thead 表示・`min-w-[880px]`・ボタン28px密度） | PASS | 44px | **PASS** |
| P46 ジョブ監視 | `/admin/jobs` | over=0 | over=0 | over=0 | PASS（3 thead 表示・`min-w-[920px]`） | PASS | 44px | **PASS** |
| P43 デザイントークン | `/admin/design` | over=0 | over=0 | over=0 | — | PASS（行縦積み・220px列溢れなし） | 入力44px/ボタン44px | **PASS** |
| P47 メトリクス | `/admin/metrics` | over=0 | over=0 | over=0 | PASS | PASS（既対応の維持） | — | **PASS** |
| P40 ダッシュボード | `/admin` | — | over=0 | — | — | （テーブルなし） | — | PASS |
| P41 LLM 設定 | `/admin/llm` | — | over=0 | — | — | （テーブルなし） | — | PASS |
| P42 プロンプト | `/admin/prompts` | — | over=0 | — | — | （テーブルなし） | — | PASS |
| P44 登録設定 | `/admin/registration` | — | over=0 | — | — | （テーブルなし） | — | PASS |

over = `document.documentElement.scrollWidth - clientWidth`（0 が合格）。

## 各画面の所見

- **P45**: 390px で thead=`display:none`、各行がボーダー付きカード（アバター + @handle/メール見出し、登録日/ロール/状態に実 DOM ラベル）。行アクション（一時停止 / 管理者に昇格 等）が全幅・44px で縦積み。lg で thead 復帰 + `min-w-[880px]` 密度テーブル + ボタン28px に戻り非回帰。
- **P46**: 取り込み/エクスポート/Cleanup の 3 テーブルすべてカード化。ジョブID 見出し + 状態/種別/所有者/更新/エラーのラベル付きスタック。所有者ID・エラーが `break-words` で折り返し。操作セクション（再構築/バックフィル/再暗号化）も全幅縦積み・44px。lg で 3 thead 復帰 + `min-w-[920px]` 非回帰。
- **P43**: トークン行が縦積み（キー入力 / 既定値 / スウォッチ+値入力 / 既定に戻す）。220px 固定列由来の横溢れなし。キー入力・値入力・削除ボタンすべて 44px。
- **P47**: メトリクスカード 1 カラム + 上限テーブルのカード化、既対応の維持を確認（変更なし）。

## 検出 → 修正した不具合（変更箇所起因・即時修正）

**初回 FAIL: カード内ボタン/入力の 44px タッチ床が未達（P45=26px / P46=26px / P43 入力39px・ボタン25px）。**

原因は CSS specificity。`pillBtnSm` の床打ち消し `data-[sm]:max-sm:min-h-0`（セレクタ `.class[data-sm]` = (0,2,0)）が、床回復 `[&>button]:max-sm:min-h-[44px]`（`.parent > button` = (0,1,1)）に specificity で勝っていた。ADR-004 の「子結合子で specificity が上がる」前提が誤り（属性セレクタには勝てない）。

**修正:** mobile（`max-sm:`）限定で `!important` を付与（`[&>button]:max-sm:min-h-[44px]!`、P43 入力は `max-sm:min-h-[44px]!`）。specificity 勝負を回避し確定化。desktop は `max-sm:` スコープで非影響。詳細は adr.md ADR-007。

**再検証実測（修正後）:**
- P45 行アクション: minHeight=44px / 高さ44px（320/390/430 すべて over=0）
- P46 操作ボタン: 44px（同上）
- P43: 値入力44px / キー入力44px / 削除ボタン44px（320px over=0）
- lg（1280px）: P45/P46 とも thead 表示・ボタン28px 密度・over=0（非回帰）

## 環境メモ（#589 実装とは無関係）

- 検証用に `pnpm db:migrate` + `pnpm seed:dev-admin` を実行（local D1 に dev-admin と無期限セッションを投入）。
- 初回検証時、過去のテストデータに混入した不正 UUID（"bob" を含む id）の users 行が `D1UserRepository.toUser` の id バリデーションで描画クラッシュを起こしていたため、当該 local D1 行を削除して描画を回復（テスト DB のみ・実装非関連）。
- `__Host-`/Secure cookie は http ナビゲーションで送出されないため、認証は `set headers '{"Cookie":...}'` で付与。

## 成果物

- スクリーンショット（修正後）: `.issue/589/manual-test/screenshots/reverify/P-{users,jobs,design,metrics}-390.png`
- 初回検証スクリーンショット（修正前・FAIL 時含む）: `.issue/589/manual-test/screenshots/`
