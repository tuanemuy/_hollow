# 動作確認計画 — Issue #539: インラインアラートを案D（.alert）に統一する実装追従

**Issue:** #539
**作成日:** 2026-06-07

---

## 確認環境

このIssueの変更はフロントエンドの通知箱コンポーネント（`app/components/` 配下の styles / JSX）に閉じる。確認の主体は**各画面の通知箱が案D（白地 + セマンティックヘアライン枠 + `--shadow-xs` + アイコン/見出し/本文）になっているかのブラウザ目視**と、型/lint/既存ユニットテストの非回帰。

### 検証環境の起動

```bash
pnpm db:apply:local   # ローカル D1 にマイグレーション適用（初回 / 未適用時）
pnpm seed:dev-admin   # 管理者シードを投入（admin 画面・auth 画面の確認に必要）
pnpm dev              # 開発サーバー起動（vite dev / Cloudflare ランタイム）
```

### デプロイ方法

なし（検証環境＝ローカル開発サーバーで目視確認できる）。本番反映は通常の `pnpm deploy:production:all` フローに従う（本Issue固有の追加手順なし）。

### 静的チェック

```bash
pnpm typecheck
pnpm lint
pnpm test:unit
```

## 確認項目

各項目で共通して確認する案Dの特徴:
- **白地**（`--color-bg`）＋ セマンティックカラーの**ヘアライン枠**（`color-mix(in oklab, var(--alert-accent) 30%, transparent)`）＋ `--shadow-xs`
- 旧パターンの**塗りつぶし背景（`bg-*-surface`）が消えている**こと
- アイコン・見出しが `--alert-accent` 色、本文が `--color-ink-secondary`
- 新規のリテラル px が混入していないこと

### 1. P03 ログイン未認証案内

- **目的:** 未確認メールでログイン試行時の案内ボックスが案D（neutral グレー）になっている。
- **手順:**
  1. メール未確認のユーザーでログイン画面を開く（`/login`）。
  2. 未認証案内ボックスと「確認メール再送」アクションを確認する。
- **期待結果:** neutral グレーの案D `.alert`（`role="status"`）。アイコン + 見出し + 本文 + 再送アクションが mock P03 と一致。
- **確認ポイント:** 旧 `CALLOUT` の neutral surface 塗りが消えていること。

### 2. P01b admin setup info 案内

- **目的:** 管理者初期セットアップの info 案内が案Dになっている。
- **手順:** admin サインアップ画面（`/admin/signup` 等）を開く。
- **期待結果:** 案D `.alert`（neutral/info グレー、`role="note"`）。
- **確認ポイント:** info に彩度の高い青が出ていない（無彩色グレー維持）。

### 3. P04 パスワードリセット補助 notice

- **目的:** リセット要求画面の補助 notice が案Dになっている。
- **手順:** `/password-reset`（要求画面）を開く。
- **期待結果:** 案D `.alert`（neutral、`role="note"`）。旧 `NOTICE` の素ボックス塗りが消えている。

### 4. P06 メール変更確定 warning

- **目的:** メール変更確定画面の warning が案D（warning tone）になっている。
- **手順:** メール変更確認リンクの確定画面を開く。
- **期待結果:** 案D `.alert-warning`（`role="status"`）。アイコン/見出しが warning 色のヘアライン枠、本文 ink-secondary。旧 `bg-warning-surface` 塗りが消えている。

### 5. P13 アップロードのエラー/警告

- **目的:** アップロードの既存エラー/警告のページ内通知箱が案Dに格上げされている。
- **手順:**
  1. ノートのアップロードダイアログを開く（取り込み画面）。
  2. 対応外形式のファイルなど、既存のエラー/警告表示を発生させる。
- **期待結果:** 案D `.alert-error` / `.alert-warning`。フィールド直下の素テキストエラー（箱でない用途）は据え置き。
- **確認ポイント:** 既存表示の格上げのみで、純新規 UI を増やしていない（progress.md の判定と一致）。

### 6. P44 登録ポリシー案内（admin）

- **目的:** 登録ポリシー編集の案内ボックスが案D（neutral）になっている。
- **手順:** `/admin/registration`（登録ポリシー編集）を開く。
- **期待結果:** 「既存ユーザーには影響しません」案内が案D `.alert`（neutral）。旧 `bg-accent-surface` 塗りが消えている。ステータスバッジ（公開中/停止中）は**変更されていない**。

### 7. P47 admin メトリクスアラート

- **目的:** メトリクスアラートが案D（severity tone）になっている。
- **手順:** admin ダッシュボード（`/admin`）/ メトリクス画面（`/admin/metrics`）でアラートが出る状態を用意し表示する。
- **期待結果:** 案D `.alert`。`critical → error tone` / `warning → warning tone`。`alert.code` 見出しが mono、`alert.message` が本文。`role="alert"` 維持。旧 filled banner が消えている。
- **確認ポイント:** P40 のヘルス系 status-banner は**変更されていない**（案D 対象外）。

## エッジケース・異常系

### 1. 複数アラートの同時表示（admin）

- **目的:** メトリクスアラートが複数同時に出ても案D の枠/余白が崩れない。
- **手順:** 複数 severity のアラートが並ぶ状態を用意して表示する。
- **期待結果:** 各 `.alert` が独立した白地ヘアライン枠で縦に並び、余白（gap/mb）が整っている。

### 2. info の無彩色維持

- **目的:** info tone が誤って彩度の高い青にならない。
- **手順:** info 系の案内（P01b 等）を表示し、枠/アイコン色を確認。
- **期待結果:** `--color-info = var(--color-accent)` のグレー。青みが出ていない。

## 既存機能への影響確認

- **auth フォーム送信エラー（FORM_ERROR）:** 本Issueでは案D化対象外。ログイン失敗等の送信エラー summary が従来どおり表示されること（壊れていないこと）を確認。
- **ステータスバッジ（#461）:** P44 のバッジが従来どおり表示されること。
- **export 画面:** 本Issueは ExportForm を変更しない（共通 `ALERT_INFO` 提供のみ）。export 画面が従来どおり表示されること。
- **ConfirmDialog / その他通知箱:** 領域子 Issue 担当分（P12/P17/P20/P24 等）は本Issueで未変更。従来表示が維持されていること。

## 確認チェックリスト

- [ ] P03 ログイン未認証案内が案D（neutral）
- [ ] P01b admin setup info が案D（無彩色グレー）
- [ ] P04 リセット補助 notice が案D
- [ ] P06 メール変更確定 warning が案D（warning tone）
- [ ] P13 アップロードのエラー/警告が案D（既存格上げのみ）
- [ ] P44 登録ポリシー案内が案D（neutral、バッジ不変）
- [ ] P47 メトリクスアラートが案D（severity tone、code は mono、P40 status-banner 不変）
- [ ] info に彩度の高い青が出ていない
- [ ] 旧塗りつぶし背景（bg-*-surface）が全対象で消えている
- [ ] 新規リテラル px の持ち込みが無い
- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm test:unit` が PASS
- [ ] auth FORM_ERROR / ステータスバッジ / export 画面など対象外の既存機能が壊れていない
