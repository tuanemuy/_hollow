# 動作確認計画 — Issue #663: ローカル検証環境（pnpm start）でジョブ型エクスポートが完走しない（relay/consumer Worker が動かない）

**Issue:** #663
**作成日:** 2026-06-13

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### 検証環境の起動

```bash
pnpm build:local && pnpm start
```

（`pnpm start` = `wrangler dev`。`pnpm build` 後の `wrangler dev` は redirected config（`.wrangler/deploy/config.json` → `dist/server/wrangler.json`）経由で production ビルド（`dist/server/index.js`）を実行するため、素の `pnpm build` ではインライン経路が DCE 済みで動かない。必ず `pnpm build:local` を使うこと。ポートはデフォルトの 8787。ブラウザアクセスは `http://localhost:8787` 表記で行う — `.issue/657/testing.md` と同じ制約。）

ログインユーザーの用意:

```bash
pnpm db:migrate
pnpm seed:dev-admin
```

セッション cookie はスクリプト出力トークンを CDP 経由で注入（`__Host-session`、Secure 必須。`.issue/657/testing.md` と同手順）:

```bash
agent-browser cookies set "__Host-session" "<token>" --url http://localhost:8787 --path / --secure --sameSite Lax
```

AC-4（`pnpm dev` 退行確認）のみ起動コマンドが異なる:

```bash
pnpm dev
```

注: AC-2（DCE grep）と AC-3（テンプレート差分なし）はビルド成果物・git diff の機械検証（plan.md ステップ 7-2 / 7-3）で充足判定するため、本計画の手動確認には含めない。

### デプロイ方法

なし（ローカル検証のみで確認できる）。

## 確認項目

### 1. ジョブ型一括エクスポートが `pnpm start` で完走する

- **対応する受け入れ基準:** AC-1
- **目的:** outbox に積まれたエクスポートジョブが InlineRelayTrigger（`DEV_INLINE_RELAY` var ゲート）で消費され、「待機中」から完了まで進むことを確認（`.issue/657/manual-test/results/TC-5.md` step 6 の再実行）
- **手順:**
  1. `http://localhost:8787` でログインし、ノート一覧を開く
  2. 選択モードに入り、複数ノート（2件以上）を選択する
  3. 一括エクスポート（HTML）を実行する
  4. ジョブのステータス表示を観察する（「待機中」→ 進行 → 完了）
  5. 完了後に表示されるダウンロード URL にアクセスする
- **期待結果:** ジョブが「待機中」のまま止まらず完了し、ダウンロード URL（`http://localhost:8787/dev/r2/...`）が 200 を返してアーティファクトが取得できる
- **確認ポイント:** TC-5 の症状（outbox に積まれたまま処理されない）が再現しないこと。ポーリング中に進行しない場合、二次 outbox イベント滞留（plan.md リスク欄）の挙動かを wrangler dev のログ（`workerId: "inline-dev"` の dispatch ログ）で切り分けて記録する

### 2. 単一ノートの同期エクスポートが従来どおり動く

- **対応する受け入れ基準:** AC-3（実行時挙動不変の傍証）
- **目的:** もともと動いていた同期エクスポート経路に回帰がないことを確認
- **手順:**
  1. ノート詳細から単一ノートのエクスポートを実行する
- **期待結果:** 従来どおり完了し、ダウンロードできる

### 3. `pnpm dev`（Vite）の既存 InlineRelayTrigger 挙動が退行しない

- **対応する受け入れ基準:** AC-4
- **目的:** ゲート式変更後も Vite dev サーバーで outbox イベントが即時 dispatch されることを確認
- **手順:**
  1. `pnpm dev` で起動してログインする
  2. 一括エクスポート（または内部リンク resolved 反映などの outbox 経由機能）を実行する
- **期待結果:** 従来どおりジョブが完了する（即時 dispatch）

### 4. docs の記述が新挙動と一致している

- **対応する受け入れ基準:** AC-5
- **目的:** `docs/runtime_cloudflare.md` の「Local dev outbox dispatch」が更新され、実挙動と一致することを確認
- **手順:**
  1. `docs/runtime_cloudflare.md` の該当セクションを読む
  2. 確認項目1 の実挙動と突き合わせる
- **期待結果:** 「`pnpm start` ではインライン経路が無効」の旧記述が消え、`DEV_INLINE_RELAY` ゲート・DCE 担保・staging/production に var を置かない運用ルール・二次イベント滞留の補足が記載されている

## エッジケース・異常系

### 1. `DEV_INLINE_RELAY` を外した場合に従来挙動（無効）へ戻る

- **目的:** var ゲートが実際に効いていること（常時有効化ではないこと）を確認
- **手順:**
  1. ローカル `wrangler.toml` の `DEV_INLINE_RELAY = "true"` を一時的にコメントアウトする
  2. `pnpm build:local && pnpm start` で一括エクスポートを実行する
  3. 確認後、コメントアウトを戻す
- **期待結果:** ジョブが「待機中」のまま進まない（Issue の元症状 = ゲート OFF の期待挙動）。エラーにはならない

## 既存機能への影響確認

- **DCE 保証（AC-2）**: `pnpm build` 後に `grep -rn "InlineRelayTrigger\|inline-dev\|import.meta.env" dist/` が何もヒットしないこと（手動確認ではなく機械検証だが、E2E 前に必ず実施）
- **staging/production テンプレート（AC-3）**: `git diff` で `infra/templates/wrangler.{staging,production}.toml.tmpl` に差分がないこと
- **presigned ダウンロード経路（#657）**: 確認項目1 のダウンロードが `/dev/r2/...` 経由で完走することで同時に確認される
- **通常ページ配信**: エントリポイント変更による回帰がないこと（トップ・ノート一覧/詳細が表示される）
