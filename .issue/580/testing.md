# 動作確認計画 — Issue #580: 領域3 P18 タグ統合のバックグラウンド進捗バナー（非同期化前提）

**Issue:** #580
**作成日:** 2026-06-26

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。

### 検証環境の起動

非同期ジョブ（outbox → relay → consumer → `runTagMergeJob`）を含むため、**ローカルで inline relay 経路が有効なサーバー**を使う必要がある。`pnpm dev`（vite dev, :3000）は `import.meta.env.DEV === true` で `InlineRelayTrigger` が有効になり、同一 isolate 内で outbox をディスパッチするため、別 Worker（relay/consumer）を起動せずにジョブが流れる（`docs/runtime_cloudflare.md`「Local dev outbox dispatch」）。

```bash
pnpm db:migrate   # ローカル D1 に 0021_tag_merge_jobs.sql まで適用（初回 / マイグレーション追加後に必須）
pnpm dev          # vite dev（workerd）on http://localhost:3000、inline relay 経路 ON
```

- **注意（#663 の罠）:** `pnpm build && pnpm start` は `InlineRelayTrigger` が DCE で除去され、ジョブが「待機中」のまま固まる。`pnpm start` 経由で確認したい場合は **`pnpm build:local && pnpm start`** を使う（`vite build --mode development`、inline 経路を保持）。本Issueの確認は `pnpm dev`（:3000）で足りる。
- スキーマ変更（`schema.ts`）を drizzle から再生成する場合のみ `pnpm db:generate` 後に `pnpm db:migrate`。本Issueはマイグレーション SQL を手書き追加するため、`pnpm db:migrate` の再実行で適用される。

### ログインユーザーの用意

`/admin` ではなくユーザー領域（`/app/tags`）の検証なので、通常ユーザーが要る。`docs/test.md` に従い、いずれか:

- ブラウザで signup 後、メール確認をスキップするため `wrangler d1 execute hollow-local-d1 --local`（= `pnpm db:execute:local <file>`）で `UPDATE users SET email_verified=1 WHERE email='...'` を流してログイン（パスワードは 12 文字以上）。
- もしくは `pnpm seed:dev-admin` で決定論的ユーザー＋セッションを投入し、出力トークンを `agent-browser cookies set "__Host-session" "<token>" --url http://localhost:3000 --path / --secure --sameSite Lax` で注入（`docs/test.md` 手順）。

### シードデータ（タグと、そのタグを持つノート）

進捗 n/total を観測するには「統合元タグを持つノートが複数件」必要。SQL で直接投入するのが速い（`pnpm db:execute:local <SQLファイル>`）。最低限:

- 同一 owner の `tags` を 2 件（source / target）。
- source タグを参照する `notes` + `note_tags`（または該当スキーマの関連）を**複数件**（進捗バーの分母 total を 1 より大きくするため。理想は数十件以上。下記「進捗の中間状態」の注意も参照）。

### デプロイ方法

なし（検証環境のみで確認できる）。実 Queue 経路（Service Binding → Queue → consumer、リトライ/DLQ/レイテンシ）はローカルで再現されないため、必要なら staging（`pnpm deploy:staging:all`）で別途確認するが、本Issueの受け入れ確認はローカルで完結する。

---

## 確認項目

### 1. タグ統合がジョブとして即時受付される（非同期化）

- **対応する受け入れ基準:** AC-1
- **目的:** 統合 submit がブロッキングな同期処理ではなく、ジョブ受付で即時応答することを確認する。
- **手順:**
  1. `/app/tags` を開き、source タグの統合操作から `MergeTagDialog` を開く。
  2. 統合先（target）を選び submit する。
  3. submit 直後のダイアログ挙動を観察する。
- **期待結果:** submit 後すぐにダイアログが「統合中（進捗バー表示）」状態へ遷移し、リクエストが長時間ブロックされない。`tag_merge_jobs` に pending/processing 行が作られる（`pnpm db:execute:local` で `SELECT * FROM tag_merge_jobs` を確認）。
- **確認ポイント:** submit のレスポンスが即時か。ジョブ行の `status` が pending→processing→completed と進むか。

### 2. ダイアログ内 determinate バーが実進捗（processed/total）を反映する

- **対応する受け入れ基準:** AC-2, AC-3, AC-4
- **目的:** ダイアログを開いたまま自ジョブを polling し、determinate バーが実 `processed/total` を表示することを確認する。
- **手順:**
  1. 確認項目1の続きで、ダイアログを閉じずに進捗バーを観察する。
  2. DevTools の Elements で進捗バー要素を確認する。
- **期待結果:** バーが `role="progressbar"` を持ち、`aria-valuenow` / `aria-valuemin=0` / `aria-valuemax`（= total）が実値で設定され、幅% が processed/total に追従して進む。完了でバーが 100% に到達する。
- **確認ポイント:** indeterminate（pulse のみ）ではなく determinate（幅が実値で動く）になっているか。`aria-valuenow` がポーリングごとに更新されるか。
- **注意（進捗の中間状態）:** ローカル inline dev は 1 kick で 1 バッチをドレインし、`runTagMergeJob` は完了状態を自 UoW で保存する（`docs/runtime_cloudflare.md`）。ノート件数が少ないと中間進捗を挟まず pending→completed に飛ぶことがある。中間の幅変化を観測したい場合はシードのノート件数を **バッチサイズ（500）を意識して十分多く**するか、`processed/total` の最終値（= total/total）と aria 反映で判定する。

### 3. 統合完了でダイアログが閉じ、一覧に結果が反映される

- **対応する受け入れ基準:** AC-4, AC-5
- **目的:** 完了でポーリングが止まり、ソースタグ消滅・参照ノートの統合先への付け替えが一覧へ反映されることを確認する。
- **手順:**
  1. 統合完了までダイアログを開いたまま待つ。
  2. 完了後の `/app/tags` 一覧を確認する。
  3. 統合先タグのノート一覧／件数を確認する。
- **期待結果:** 完了でダイアログが閉じ、`routerInvalidate` で一覧が再取得され、source タグが一覧から消える。元 source を参照していたノートが target タグへ付け替わっている（既存 `mergeTags` と同一結果）。
- **確認ポイント:** ソースタグが残っていないか。ノートの付け替えが漏れていないか（`SELECT` でも裏取り可）。

---

## エッジケース・異常系

### 1. 統合失敗時のエラー表示と一覧の保全

- **対応する受け入れ基準:** AC-6
- **目的:** ジョブが `failed` になったとき、ダイアログ内でエラーが伝わり、一覧の楽観状態が壊れない（source タグが消えたまま等にならない）ことを確認する。
- **手順:**
  1. 失敗を誘発する（例: 一時的に runner が失敗する状況を作る、または無効なジョブ状態を SQL で投入してポーリングさせる）。失敗誘発が難しければ、`tag_merge_jobs` の対象行を `status='failed', error_reason='...'` に更新してダイアログのポーリング表示を確認する。
  2. ダイアログ内表示と一覧を確認する。
- **期待結果:** ダイアログ内にエラーが表示され、ソースタグは一覧に残ったまま（楽観削除で消えていない）。`useOptimistic` 状態が壊れない。
- **確認ポイント:** 失敗時にタグが消えたまま不整合にならないか（ADR-005）。

### 2. 他オーナーのジョブIDを推測しても進捗を読めない（IDOR 防止）

- **対応する受け入れ基準:** AC-8
- **目的:** `getTagMergeJobFn` がクライアント state の jobId を直接 polling するため、他オーナーのジョブIDでは読めないことを確認する。
- **手順:**
  1. ユーザーA でタグ統合を実行し、`tag_merge_jobs` から別オーナー（B 所有）のジョブIDを SQL で確認する。
  2. ユーザーA のセッションで、その別オーナーの jobId を `getTagMergeJobFn` に渡す経路（ダイアログのポーリング state を差し替える等）を試す。
- **期待結果:** 所有者検証（`assertOwnedBy`）で弾かれ、進捗・source/target タグIDが漏れない（NotFound / Forbidden 相当）。
- **確認ポイント:** 他オーナーのジョブ進捗が表示できてしまわないか。

---

## 既存機能への影響確認

- **タグ統合のドメイン結果（AC-5）:** 非同期化後も、統合結果（ソースタグ消滅・ノートの付け替え・重複付与の no-op）が同期版 `mergeTags` と同一であること。`runTagMergeJob` への移設による回帰がないか、複数ノート・既に target を持つノート混在ケースで確認する。
- **タグ一覧の既存表示（A/B/C: 検索・ソート・最終使用列）:** #569/PR #577 で実装済みの機能が統合フロー変更後も壊れていないこと（一覧の検索・ソート・列表示を一通り操作）。
- **楽観 UI（`TagList` の `useOptimistic`）:** 統合中→完了/失敗の遷移で一覧の楽観状態が破綻しないこと。
- **自動テスト:** `pnpm test:unit` と `pnpm test:integration` がグリーン（AC-7）。`pnpm typecheck && pnpm lint:fix && pnpm format` も実施。
