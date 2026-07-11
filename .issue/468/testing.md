# 動作確認計画 — Issue #468: ソースファイルのストレージ衛生: 保持期間ポリシー(TTL)と孤児blobの回収

**Issue:** #468
**作成日:** 2026-07-10

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載（プロジェクト全体のセットアップは省略）。新規マイグレーションはない（既存インデックス `idx_media_status_updated` を使用）。

このIssueの変更は (1) commit フロー（metadata-first 化）と (2) pruner cron tick（sweep + purgeOrphans 配線）が中心。pruner Worker は `pnpm dev` / `pnpm start` では起動しない（`docs/runtime_cloudflare.md` L50）ため、cron tick の確認は wrangler dev の pruner 単体起動 + scheduled 手動発火で行う。

### 検証環境の起動

Web アプリ（commit フローの確認用）。mutation を伴うブラウザ操作は `pnpm dev`（vite、:3000）だと CSRF の Origin 照合（`APP_URL=http://localhost:8787`）で 403 になるため、`pnpm start`（wrangler dev、:8787）を使う。さらに plain `pnpm build` は inline relay が DCE されて取り込みジョブが「待機中」で停滞する（`docs/runtime_cloudflare.md` の既知の罠）ため、ビルドは `build:local` を使う:

```bash
pnpm build:local && pnpm start
```

pruner Worker 単体起動 + scheduled 手動発火（cron tick の確認用。過去の `.issue/145` / `.issue/181` の testing.md で確認済みのパターン）。アプリサーバーが :8787 を使っている場合は `--port 8788` を付ける:

```bash
pnpm wrangler dev --config wrangler.toml --env pruner --test-scheduled --port 8788
```

`--test-scheduled` を付けると scheduled ハンドラを HTTP で手動発火できる（実測で確認済みの形式）:

```bash
curl "http://localhost:8788/__scheduled?cron=0+3+*+*+*"
```

前提: `.dev.vars` の `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` に**空でないダミー値**が入っていること（`docs/runtime_cloudflare.md` — 空だと DI が unavailable objectStorage にフォールバックし purge の delete が失敗する。`.dev.vars` は `wrangler dev` にも自動ロードされる）。

ローカル D1 の状態確認・seed 投入（`.issue/181` の testing.md で確認済みのパターン）:

```bash
pnpm wrangler d1 execute hollow-local-d1 --local --command "<SQL>"
```

自動テスト（回収チェーンの主たる担保。E2E 回収経路・sweep・冪等性はここで検証される）:

```bash
pnpm typecheck
pnpm test:unit
pnpm test:integration
```

infra テンプレート変更（ステップ7）のレンダリング確認:

```bash
pnpm infra:render:staging
pnpm infra:render:production
```

### デプロイ方法

ローカル確認で完結する場合は不要。ステージング／本番の pruner Worker へ反映する場合（`package.json` scripts で確認済み）:

```bash
pnpm deploy:staging:pruner:dry   # ドライラン（ビルド検証のみ）
pnpm deploy:staging:pruner
pnpm deploy:production:pruner:dry
pnpm deploy:production:pruner
```

注意（#783 testing.md と同じ運用前提）: pruner env の `OBJECT_STORAGE` binding + `R2_OBJECT_BUCKET_NAME` var + presign 3 secrets が揃わないと purge の R2 delete が `StorageUnavailableError` になる。本Issueのテンプレート修正が反映されたレンダリング結果でデプロイすること。

## 確認項目

AC-1（保持ポリシーの明文化）はドキュメント成果物なので、実機操作ではなく成果物の存在確認（確認項目6）で充足を判定する。

### 1. 取り込み commit 正常系が退行していない（metadata-first 化後）

- **対応する受け入れ基準:** AC-5
- **目的:** commit のステージ (a) が「pending 行 → put」の順に変わった後も、正常系の取り込み確定が従来どおり動くこと。
- **手順:**
  1. `pnpm build:local && pnpm start`（:8787）でログインし、取り込み画面から PDF（または画像）をアップロードする。
  2. プレビュー生成を待って「確定（commit）」する。
  3. 作成されたノートの詳細画面で「元ファイル」セクションから閲覧・ダウンロードする。
  4. DB を確認する: `pnpm wrangler d1 execute hollow-local-d1 --local --command "SELECT id, kind, status, ref_count FROM media_assets WHERE kind='source' ORDER BY created_at DESC LIMIT 5;"`
- **期待結果:** ノートに元ファイルが紐付き、閲覧/DL できる。該当 `media_assets` 行が `kind='source', status='attached', ref_count=1` になっている。
- **確認ポイント:** `pending` のまま残る source 行が増えていないこと（正常系では小 UoW の pending 行が同一リクエスト内で attached に遷移する）。

### 2. 放棄された source intake が pruner tick で orphan 化される（sweep）

- **対応する受け入れ基準:** AC-2, AC-3
- **目的:** commit 失敗後に残る `pending/source` 行（put 成功・UoW ロールバックの残骸に相当）を、cron 起動の sweep が猶予期間（24h）経過後に orphan 化すること。ロールバック自体の再現は UI からは困難なため、ロールバック後と同じ状態（放棄された pending/source 行）を SQL で seed して回収経路を確認する（ロールバック → pending 残存はステップ8の integration test が担保）。
- **手順:**
  1. 既存ユーザー ID と既存行の日時フォーマットを確認する: `pnpm wrangler d1 execute hollow-local-d1 --local --command "SELECT owner_id, updated_at FROM media_assets LIMIT 1;"`（users が空なら先に確認項目1を実施）
  2. 3日前に放棄された source intake を seed する（`<owner>` は手順1の値。日時は手順1で確認したフォーマットに合わせる。**id は UUIDv7 形式必須** — 非 UUIDv7 だとリポジトリ再水和の検証で `DATA_INTEGRITY_ERROR` になり sweep 自体が失敗する。テスト識別子は storage_key 側に持たせる）:
     `pnpm wrangler d1 execute hollow-local-d1 --local --command "INSERT INTO media_assets (id, owner_id, kind, mime_type, byte_size, backend, storage_key, ref_count, status, created_at, updated_at) VALUES ('019f0000-0000-7000-8000-000000468002', '<owner>', 'source', 'application/pdf', 100, 'r2', '<owner>/source/test-468-abandoned', 0, 'pending', strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 days'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 days'));"`
  3. `pnpm wrangler dev --config wrangler.toml --env pruner --test-scheduled` で pruner を起動し、scheduled を手動発火する。
  4. `pnpm wrangler d1 execute hollow-local-d1 --local --command "SELECT id, status, updated_at FROM media_assets WHERE id='019f0000-0000-7000-8000-000000468002';"`
- **期待結果:** 行が `status='orphan'` に遷移し、`updated_at` が現在時刻に再スタンプされている。pruner のログに sweep の件数（swept）が出る。
- **確認ポイント:** tick がエラーなく完走すること（sweep / purge の失敗は swallow されるため、ログの `error` 有無を必ず見る）。`media.orphaned` が outbox に載ること: `pnpm wrangler d1 execute hollow-local-d1 --local --command "SELECT event_type, processed_at FROM outbox_events ORDER BY occurred_at DESC LIMIT 5;"`

### 3. orphan 化された行が次の tick で purge される（回収チェーンの完走）

- **対応する受け入れ基準:** AC-2, AC-3
- **目的:** sweep が orphan 化した行を、既存 purge 機構（今回 cron に配線された `purgeOrphans`）が blob ごと回収すること。
- **手順:**
  1. 確認項目2の orphan 行の `updated_at` をバックデートして purge 猶予（24h）を経過させる:
     `pnpm wrangler d1 execute hollow-local-d1 --local --command "UPDATE media_assets SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days') WHERE id='019f0000-0000-7000-8000-000000468002';"`
  2. pruner の scheduled を再度手動発火する。
  3. `pnpm wrangler d1 execute hollow-local-d1 --local --command "SELECT id, status FROM media_assets WHERE id='019f0000-0000-7000-8000-000000468002';"`
- **期待結果:** 行が削除されている（0件）。1回の tick で markDeleting → purge まで完走する（「再実行」は不要）。
- **確認ポイント:** この seed 行は blob を持たない（put 失敗相当）が、`ObjectStorage.delete` の冪等性（missing key = 成功）により purge が完走すること — `deleting` のまま stall しないこと。tick ログに purge 件数が出ること。

### 4. pruner tick の既存刈り込みが退行していない

- **対応する受け入れ基準:** AC-5
- **目的:** `runPruneTick` へのステップ追加（sweep → purgeOrphans）後も、既存の outbox / processed_events / job-state prune / export purge が動き、tick が完走すること。
- **手順:**
  1. 確認項目2〜3の手動発火時の pruner ログを確認する。
- **期待結果:** 既存ステップのログ（outbox / processed_events の削除件数等）が従来どおり出力され、新ステップの失敗が他ステップを阻害しない。
- **確認ポイント:** 新ステップは best-effort（独立 try/catch）なので、仮に失敗しても tick 全体が落ちないこと。

### 5. infra テンプレートに pruner の R2 配線が入っている

- **対応する受け入れ基準:** AC-3（本番で回収チェーンが動く前提）
- **目的:** production / staging テンプレートの `[env.pruner]` に `OBJECT_STORAGE` binding と `R2_OBJECT_BUCKET_NAME` が追加され、レンダリングが通ること。
- **手順:**
  1. `pnpm infra:render:staging` / `pnpm infra:render:production` を実行する。
  2. レンダリング結果の `[env.pruner]` セクションに `[[env.pruner.r2_buckets]] binding = "OBJECT_STORAGE"` と `R2_OBJECT_BUCKET_NAME` があることを確認する。
  3. `pnpm deploy:staging:pruner:dry` でビルドが通ることを確認する（実デプロイはしない）。
- **期待結果:** レンダリング・ドライランともエラーなし。ローカル `wrangler.toml` の pruner セクションと同等の R2 配線がテンプレートに存在する。

### 6. 保持ポリシーと運用ノートが明文化されている（AC-1）

- **対応する受け入れ基準:** AC-1
- **目的:** TTL 不採用の保持ポリシーが spec に、手動リコンサイル手順が運用ドキュメントに存在すること。
- **手順:**
  1. `spec/domains/media.md` に保持ポリシー（TTL なし・Note ライフサイクル連動・orphan 化 → purge 回収）の記載があることを確認する。
  2. `spec/usecases/media.md` に `SweepAbandonedSourceIntakes` と `PurgeOrphans` の pruner tick 起動の記載があることを確認する。
  3. `docs/runtime_cloudflare.md` に手動リコンサイル手順（デプロイ以前に漏れた blob の突合削除）の運用ノートがあることを確認する。
- **期待結果:** 3箇所すべてに対応する記載がある。

## エッジケース・異常系

### 1. 猶予期間内の pending/source は回収されない（進行中 commit の保護）

- **対応する受け入れ基準:** AC-4
- **目的:** 直近の（進行中の commit に相当する）`pending/source` 行を sweep が誤って orphan 化しないこと。
- **手順:**
  1. `updated_at` を現在時刻にした `pending/source` 行を seed する（確認項目2の INSERT の日時を `strftime('%Y-%m-%dT%H:%M:%fZ','now')`、id を `019f0000-0000-7000-8000-000000468101`（UUIDv7 形式必須）、storage_key を `test-468-fresh` に変えて実行）。
  2. pruner の scheduled を手動発火する。
  3. 行の status を SELECT で確認する。
- **期待結果:** 行は `pending` のまま変化しない（猶予 24h 未経過のため候補に載らない）。
- **確認後:** seed 行を削除する: `pnpm wrangler d1 execute hollow-local-d1 --local --command "DELETE FROM media_assets WHERE id='019f0000-0000-7000-8000-000000468101';"`

### 2. pending/image は sweep の対象外（ADR-004）

- **目的:** 編集中エディタの attach 待ち等、source 以外の古い pending を誤回収しないこと。
- **手順:**
  1. 3日前の `pending` / `kind='image'` 行を seed する（確認項目2の INSERT の kind を `image`、mime_type を `image/png`、id を `019f0000-0000-7000-8000-000000468102`（UUIDv7 形式必須）、storage_key を `test-468-image` に変えて実行）。
  2. pruner の scheduled を手動発火する。
  3. 行の status を SELECT で確認する。
- **期待結果:** 行は `pending` のまま変化しない（kind='source' 限定のクエリに載らない）。
- **確認後:** seed 行を削除する。

### 3. R2 presign 設定が欠けた状態での tick

- **目的:** objectStorage が unavailable フォールバックでも tick がクラッシュせず、行が回収可能な状態のまま残ること。
- **手順:**
  1. `.dev.vars` の `R2_*` を一時的に空にして pruner を再起動し、purge 対象（バックデートした orphan 行）がある状態で scheduled を手動発火する。
  2. ログと行の status を確認する。
  3. `.dev.vars` を元に戻す。
- **期待結果:** per-row catch でエラーがログに落ち、tick 自体は完走する。行は `orphan` または `deleting` のまま残り、設定復旧後の次の tick で回収される。

## 既存機能への影響確認

- **通常メディア（画像・avatar）のアップロード / 表示:** commit 以外の media フロー（`uploadMedia` / presigned upload → attach）は変更対象外。画像添付付きノートの作成・表示が従来どおり動くこと。
- **overwrite 差し替え / note purge 経由の orphan 化（#452 の既存挙動）:** 上書き取り込み・ノート完全削除で旧 source が orphan 化すること（#452 testing.md の項目）。加えて本Issueの配線により、その orphan が**実際に purge まで到達する**ようになった — バックデート + tick 発火で行と blob が消えることを確認項目3と同じ手順で確認できる。
- **export purge（#783）:** `runPruneTick` 内の `purgeExpiredExports` は呼び出し位置・ロジックとも無変更であること（tick ログで従来どおり実行されていることを確認）。
- **`uploadMediaPresigned` の放置 pending（image / video）:** 挙動は従来どおり回収されない（JSDoc の誤記修正のみ）。エッジケース2がこの非対象を裏付ける。

## 実測メモ（2026-07-11 のブラウザ検証で確定）

- `/__scheduled` の手動発火形式は `curl "http://localhost:8788/__scheduled?cron=0+3+*+*+*"` で動作確認済み（「確認環境」に反映済み）。
- seed 行の id は UUIDv7 形式必須（非 UUIDv7 はリポジトリ再水和検証で `DATA_INTEGRITY_ERROR`）。各手順の INSERT に反映済み。
- `outbox_events` に `status` 列は無い。イベント確認は `event_type, processed_at` を使う（確認項目2に反映済み）。
- アプリを `pnpm start`（wrangler dev）で動かせば pruner（wrangler dev 別ポート）と同じ `.wrangler/state` の R2 シミュレータ・D1 を共有するため、blob 跨プロセスの懸念は解消。
