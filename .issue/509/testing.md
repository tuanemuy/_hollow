# 動作確認計画 — Issue #509: エクスポート画面（P15 フォーム / P16 ジョブ一覧・詳細）のデザイン未実装を解消する

**Issue:** #509
**作成日:** 2026-06-21

---

## 確認環境

このIssueは `app/components/export/` 配下の tsx に className を付与する純スタイリング変更（＋必要に応じ `app/components/common/styles.ts` への共通定数追加）。ロジック・ルーティング・データフローは変更しない。確認は「実画面がモックの意匠どおりに描画されるか」を、デスクトップ／モバイル両モックと突き合わせて行う。

### 検証環境の起動

```bash
pnpm db:migrate      # ローカル D1 にスキーマ適用（初回・スキーマ変更時）
pnpm build           # dist/worker を生成（pnpm start は build 済み成果物を配信）
pnpm start           # wrangler dev で起動
```

エクスポート画面は認証必須ルート。決定論的な管理者ユーザー＋セッションを投入する:

```bash
pnpm seed:dev-admin  # dev-admin@example.com / role=admin / email_verified=1（冪等）
```

セッション cookie 名は `__Host-session`（Secure 必須）。スクリプトが出力するトークンを CDP 経由で注入する:

```bash
agent-browser cookies set "__Host-session" "<token>" \
  --url http://localhost:<port> --path / --secure --sameSite Lax
```

ジョブ一覧・詳細（P16）の状態バリアント（queued / processing / completed / failed / cancelled / expired）を一覧で確認するには、各 status のエクスポートジョブ行が必要。フォーム（P15）からエクスポートを実行してジョブを発生させ、必要に応じて D1 に直接 status を投入する:

```bash
echo "UPDATE export_jobs SET status='<status>' WHERE id='<jobId>';" | pnpm db:execute:local /dev/stdin
```

（テーブル名・カラム名は実スキーマを確認の上で読み替える。）

### 対象ルート

| ルート | コンポーネント | モック（desktop / mobile） |
|---|---|---|
| `/export` | `ExportForm` | `spec/design/pages/P15-export.html` / `spec/design/pages/mobile/P15-export.html` |
| `/notes/$noteId/export` | `ExportForm`（単一ノート対象） | 同上 |
| `/exports` | `ExportJobsList` | `spec/design/pages/P16-export-jobs.html` / `spec/design/pages/mobile/P16-export-jobs.html` |
| `/exports/$jobId` | `ExportJobDetail` | `spec/design/pages/P16-export-jobs.html`（詳細部） |

### デプロイ方法

なし（検証環境のみで確認できる。本番反映不要）。

---

## 確認項目

### 1. P15 エクスポートフォームの意匠（形式選択・対象範囲・オプション）

- **対応する受け入れ基準:** AC-1
- **目的:** フォームがモック（segmented control・カードレイアウト・トークン適用）どおりに描画されることを確認する。
- **手順:**
  1. `/export` を開く。
  2. `spec/design/pages/P15-export.html` を `open` して並べる。
  3. 形式選択（segmented control）、対象範囲、オプション（チェックボックス行）のレイアウト・余白・角丸・色をモックと突き合わせる。
  4. 中央寄せのコンテナ幅・page-title / subtitle の見た目を確認する。
- **期待結果:** 各セクションがモックの意匠に沿ってスタイルされ、トークン由来の色・寸法が適用されている。
- **確認ポイント:** segmented control の active カードの背景・影（`shadow-[var(--shadow-xs),...]`）が出ているか。native radio/checkbox が `sr-only` でも見た目が崩れず機能すること。

### 2. P15 フォームのインタラクション・状態（操作で見た目が破綻しない）

- **対応する受け入れ基準:** AC-1 / AC-2
- **目的:** 選択操作・送信前後で意匠が破綻しないことを確認する。
- **手順:**
  1. 形式・対象範囲・オプションを切り替え、active 表現が追従するか確認する。
  2. キーボード（Tab / Space / 矢印）で各コントロールにフォーカス・操作できるか確認する。
  3. エクスポート実行ボタンを押し、送信状態・遷移を確認する。
- **期待結果:** 選択状態が `data-*` バリアントで正しく反映され、フォーカスリングが見える。送信導線が機能する。
- **確認ポイント:** sr-only 化した入力でもラベルクリック・キーボード操作が効くこと（a11y 非破壊）。

### 3. P16 エクスポートジョブ一覧の意匠（job-card・status チップ・進捗バー）

- **対応する受け入れ基準:** AC-1 / AC-3
- **目的:** ジョブ一覧が job-card レイアウトでスタイルされ、status チップ・進捗バーがモックどおり描画されることを確認する。
- **手順:**
  1. `/exports` を開く。
  2. `spec/design/pages/P16-export-jobs.html` を `open` して並べる。
  3. 各ジョブ行が card 化され、status チップの色（`exportStatusTag` 由来の Tone）が status ごとに変わることを確認する。
  4. processing 状態のジョブで進捗バーが表示され、`{processed}/{total}` の count が全 status で表示されることを確認する。
- **期待結果:** card・status チップ・進捗バーがモックの意匠で描画され、各 status の色分けが対応表どおり。
- **確認ポイント:** count（`{processed}/{total}`）が進捗バーに置換されず維持されていること。バーは processing 時のみ追加表示されること。

### 4. P16 ジョブ詳細の意匠（meta グリッド・状態表示）

- **対応する受け入れ基準:** AC-1 / AC-3
- **目的:** 詳細ページが meta グリッドでスタイルされることを確認する。
- **手順:**
  1. 一覧から任意のジョブを開く（`/exports/$jobId`）。
  2. モック P16 の詳細部と並べ、meta グリッド（ジョブ情報の項目・値レイアウト）・status 表示を突き合わせる。
  3. 見出し（`エクスポートジョブ詳細`）が現状文言のまま page-title 相当でスタイルされていることを確認する。
- **期待結果:** meta グリッドがモックの意匠で描画され、status バリアントが一覧と一貫している。

### 5. モバイルモック追従（#588 申し送り）

- **対応する受け入れ基準:** AC-1 / AC-2
- **目的:** デスクトップだけでなくモバイル幅でもモック（`spec/design/pages/mobile/`）の意匠に追従していることを確認する。
- **手順:**
  1. ブラウザをモバイル幅（sm 未満）にして `/export`・`/exports`・`/exports/$jobId` を表示する。
  2. `spec/design/pages/mobile/P15-export.html`・`P16-export-jobs.html` と並べて突き合わせる。
  3. 横スクロール（overflow）が発生しないこと、segmented control・job-card がモバイル意匠に切り替わることを確認する。
- **期待結果:** モバイル幅で意匠がモックに追従し、横スクロールが発生しない。
- **確認ポイント:** 新規リテラル px の持ち込みが意匠固有値（`max-w-[...]` 等、ADR 記載分）に限定されていること。

---

## エッジケース・異常系

### 1. ジョブ一覧の空状態

- **目的:** ジョブが0件のときの空状態（`EMPTY_STATE`）が崩れず表示されることを確認する。
- **手順:**
  1. ジョブが存在しない状態で `/exports` を開く。
- **期待結果:** 空状態メッセージが共通の `EMPTY_STATE` 意匠で表示される。

### 2. ジョブ詳細の not-found

- **目的:** 存在しない jobId にアクセスしたときの「ジョブが見つかりません」表示が崩れないことを確認する。
- **手順:**
  1. `/exports/<存在しないid>` を開く。
- **期待結果:** 現状文言「ジョブが見つかりません」が維持され、意匠が破綻しない。

### 3. 全 status バリアントの色分け

- **目的:** queued / processing / completed / failed / cancelled / expired の6 status すべてで status チップの色が対応表どおりに分かれることを確認する。
- **手順:**
  1. 各 status のジョブを用意（D1 に直接投入可）し、`/exports` で並べる。
- **期待結果:** plan.md の status→Tone 対応表どおりに色分けされる（`expired`/`cancelled` = warning など）。

---

## 既存機能への影響確認

- **ExportForm のユニットテスト:** `app/components/export/ExportForm/__tests__/ExportForm.test.tsx` が pass し続けること（`findMediaCheckbox` の `item(1)` 依存 = checkbox の DOM 出現順を維持）。`pnpm test:unit` で確認。
- **エクスポート実行フロー:** スタイリングのみの変更のため、フォーム送信→ジョブ生成→一覧表示→詳細表示の一連のロジックが従来どおり動作すること。
- **admin Jobs 画面:** `Tone` 型・`exportStatusTag` を共通化する場合、`app/components/admin/Jobs/` の status 表示が従来どおり描画されること（回帰確認）。
