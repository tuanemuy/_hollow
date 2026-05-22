# 動作確認計画 — Issue #145: search dispatch routing 拡張

**Issue:** #145
**作成日:** 2026-05-23

---

## 確認環境

このIssueは `dispatchDomainEvent` の routing 拡張、IndexJob drainer worker の新設、`IndexJobRepository.nextBatch` のシグネチャ拡張が中心。DB migration の追加は不要（既存テーブル `index_jobs` / `search_documents` をそのまま使う）。動作確認の主な観点は:

1. note 系 usecase の操作（create / save / rename / trash / publish）→ `index_jobs` テーブルへの enqueue
2. `indexer` worker の cron tick で `index_jobs` 行が drain されて `search_documents` に反映されること
3. trashed status guard により蘇生レースが起こらないこと
4. fan-out（`note.trashed` で search + publication 両 handler 起動）
5. 自動テスト（typecheck / lint / unit / integration）

### 検証環境の起動

```bash
pnpm db:migrate    # local D1 にマイグレーション適用（初回または migration 追加時のみ）
pnpm dev           # vite dev + workerd 経由でアプリ起動
```

> `pnpm dev` は `vite dev --config vite.config.cloudflare.ts` 経由で Cloudflare Workers + D1 + Queues 環境を起動する。`.dev.vars` の設定は既存のままで OK（本 Issue では新規環境変数は追加しない予定。ただしステップ 5 で `INDEXER_BATCH_SIZE` / `INDEXER_MAX_BATCHES` を vars に追加する場合は `.dev.vars` の見直しが必要）。

### 検証環境での indexer 単発起動

`pnpm dev` の workerd 経由では cron トリガーは自動発火しないため、`indexer` worker の動作確認は次のいずれかで行う:

```bash
# 方法 A: wrangler dev で indexer ワーカー単体を起動して scheduled を手動 invoke
pnpm wrangler dev --config wrangler.toml --env indexer --test-scheduled

# 方法 B: D1 を直接覗いて enqueue/drain 結果を SQL 確認（GUI または wrangler d1 execute）
pnpm wrangler d1 execute tanstack-start-template-d1 --local --command "SELECT id, op, attempts, processed_at FROM index_jobs ORDER BY enqueued_at DESC LIMIT 20;"
pnpm wrangler d1 execute tanstack-start-template-d1 --local --command "SELECT note_id, title, visibility, indexed_at FROM search_documents ORDER BY indexed_at DESC LIMIT 20;"
```

### 自動テスト

```bash
pnpm typecheck
pnpm lint:fix
pnpm format
pnpm test:unit
pnpm test:integration
```

### デプロイ方法

```bash
# staging への deploy（順序遵守: consumer → indexer → relay 再起動 / app）
pnpm deploy:staging:consumer
pnpm deploy:staging:indexer    # 新規追加スクリプト（ステップ 6 で wrangler.toml に env.indexer 追加）
pnpm deploy:staging:relay      # routing 変更を含む relay 側の再起動（明示再 deploy）
pnpm deploy:staging             # app の deploy（必要に応じて）

# production も同じ順序で
pnpm deploy:production:consumer
pnpm deploy:production:indexer
pnpm deploy:production:relay
pnpm deploy:production
```

> deploy 順序が逆になっても害は最小（indexer 不在期間に IndexJob が滞留するだけで、後続の indexer 起動で消化される）。ただし「consumer の dispatch 拡張 → 即時に indexer 配線」を満たすため、上記順序を推奨。詳細は `docs/runtime_cloudflare.md` に追記する deploy 順序の節を参照（ステップ 6）。

## 確認項目

### 1. `note.created` → IndexJob upsert → search_documents 反映

- **目的:** ノート新規作成 → outbox → relay → dispatch → IndexJob enqueue → drainer → SearchIndex.upsert の経路全体が動くこと
- **手順:**
  1. ブラウザでログインしてダッシュボードへ
  2. 「新しいノート」でタイトル + 本文を入力して保存
  3. 数秒待ち、`index_jobs` テーブルを覗く（前項のクエリ）
  4. `indexer` worker を手動発火（`--test-scheduled`）または cron 待ち
  5. `search_documents` テーブルに該当行が現れることを確認
  6. 検索ページ（`/search` 等）で当該タイトルでヒットすることを確認
- **期待結果:** `index_jobs` に `op='upsert'` 行が enqueue → drainer で `processed_at` が埋まる → `search_documents` に反映 → 検索ヒット
- **確認ポイント:** `index_jobs.attempts` が 1 のまま完了している（retry が起きていない）

### 2. `note.content_updated` → 既存 SearchDocument の更新

- **目的:** ノート編集（本文/タイトル変更）が index に反映されること
- **手順:**
  1. 確認項目 1 で作成したノートを編集（本文に「TEST_KEYWORD_145」など特徴的な文字を追加）
  2. 数秒〜数分待ち（cron 1 tick 待ち）
  3. 検索ページで「TEST_KEYWORD_145」を検索
- **期待結果:** 編集後のノートがヒットする。編集前のノートはヒットしない（最新 snapshot で上書きされている）
- **確認ポイント:** `search_documents.indexed_at` が更新されている

### 3. `note.renamed` / `note.moved` / `note.tags_replaced` の反映

- **目的:** 各「save 系」event がいずれも IndexJob を enqueue すること
- **手順:**
  1. ノートのタイトル変更 → 検索ページで新タイトルが title field にヒット
  2. ノートを別ディレクトリへ移動 → `search_documents.directory_path` が変わる
  3. ノートのタグを変更 → `search_documents.tag_names_json` が変わる
- **期待結果:** 各操作後 1 tick で反映される

### 4. `note.trashed` → search delete + publication 連動

- **目的:** trash 時に search index から消えること、publication 側（visibility=private + ShareLink 失効）も同時に進むこと
- **手順:**
  1. 確認項目 1 のノートを公開状態にしておく（事前操作）
  2. 「ゴミ箱へ移動」を実行
  3. `index_jobs` に `op='delete'` 行が enqueue されることを確認
  4. drainer 動作後、`search_documents` から該当行が消える
  5. 検索ページで該当ノートがヒットしないことを確認
  6. publication 側: `publication_states.visibility` が `'private'` に、関連 ShareLink が失効状態
- **期待結果:** search delete + publication state 更新が両方反映される
- **確認ポイント:**
  - fan-out 順序（search → publication）どちらが先でも最終状態は同じ
  - publication 内部で発火する `note.publish_changed` event が後追いで dispatch されたときに index が**蘇生しない**（ADR-007 の検証）

### 5. `note.publish_changed` → visibility 反映

- **目的:** 公開設定変更時の SearchDocument.visibility 更新
- **手順:**
  1. 別のノート（trashed でないもの）を作成
  2. 公開設定を `private` → `public` → `unlisted` と切り替える
  3. 各切り替え後、検索結果での出現条件が変わることを確認（public 検索ページ `/explore` 等で）
- **期待結果:** visibility 変更が即時に search 公開検索の絞り込みに反映される

### 6. `note.publish_changed` × trashed note（trashed status guard 検証）

- **目的:** ADR-007 の蘇生レース対策が機能すること
- **手順:**
  1. ノートを作成して `index_jobs` / `search_documents` に反映させる
  2. trash する → `search_documents` から該当行が消える
  3. その後すぐに「公開設定を変更」相当の操作（または手動で `note.publish_changed` event を emit するテスト経路）
  4. `index_jobs` を確認: `op='upsert'` の新規行が**作られない**こと（trashed status guard により handled + skip）
- **期待結果:** trashed ノートが index に蘇生しない
- **確認ポイント:** consumer worker のログに `[dispatch] skipping snapshot build for trashed note ...` 等の info ログが出る

## エッジケース・異常系

### 1. Note が dispatch 時点で既に消えている（trash → purge の連続）

- **目的:** purge 直後の publish_changed 後追い dispatch で `findById` null → handled
- **手順:**
  1. ノートを作成 → trash → admin 操作で purge
  2. 直後に `note.publish_changed` 経路（既に発火済みなら relay で再 dispatch を待つ）
- **期待結果:** dispatcher は `findById === null` を検知し、handled + logger.info で skip。queue は汚さない

### 2. dispatch 中の transient エラー（D1 一時 unavailable 等）

- **目的:** error classification が機能（retry に倒れる）
- **手順:** ローカルで D1 を一時切断 / 過負荷を再現できる場合のみ。難しければ unit テストで保証
- **期待結果:** dispatcher は `retry` outcome を返し、queue redelivery で再試行

### 3. IndexJob の DLQ 化（attempts >= 3）

- **目的:** dlq 行が `nextBatch` で除外されること、admin re-drive 経路が機能すること
- **手順:**
  1. SearchIndex を意図的に壊す（local D1 で `search_documents` table を drop など）
  2. note 操作 → IndexJob enqueue → drainer が 3 回失敗
  3. `SELECT * FROM index_jobs WHERE attempts >= 3` で dlq 行を確認
  4. SearchIndex を復旧 → `pnpm wrangler d1 execute ... "UPDATE index_jobs SET attempts = 0, last_error = NULL WHERE id = ?"` で手動 re-drive、または admin 画面の rebuild index 機能で全件再構築
- **期待結果:** dlq 行は drainer の `nextBatch` で再選択されない（attempts < maxAttempts フィルタが効く）。re-drive で復活する

### 4. fan-out 失敗時の partial retry

- **目的:** search 成功 → publication 失敗 → 全体 retry で冪等に再実行されること
- **手順:** unit テストで確認（ローカル再現は難しい）
- **期待結果:** 2 回目の search delete は no-op、publication trash は成功 → 全体 handled

## 既存機能への影響確認

- **`bulkRebuildFromSnapshots`（AdminSettings.RebuildSearchIndex）**: 並走しても idempotent。本 Issue の有効化後、admin の手動 rebuild と event-driven 更新が両立することを確認。
- **検索機能（`SearchOwnNotes` / `SearchPublicNotes` / `SearchUserPublicNotes`）**: 既存検索クエリには影響なし。読み取り経路は `SearchService.runQuery` 経由で変わらない。
- **既存 ingestion / export 経路**: dispatcher の switch 拡張は note.* / publication.* のみ。ingestion / export 系の routing は触らないため影響なし。
- **既存 outbox / relay / consumer worker**: routing 先 handler が増えただけで、relay や outbox の挙動自体は変わらない。

## 確認チェックリスト

- [ ] `pnpm typecheck` がパス
- [ ] `pnpm lint:fix` で lint エラーなし
- [ ] `pnpm format` で format 差分なし
- [ ] `pnpm test:unit` 全パス
- [ ] `pnpm test:integration` 全パス
- [ ] 確認項目 1: note.created → search_documents 反映 → 検索ヒット
- [ ] 確認項目 2: note.content_updated → 最新 snapshot で上書き
- [ ] 確認項目 3: rename / move / tags_replaced 反映
- [ ] 確認項目 4: trash で search 削除 + publication state 更新（fan-out）
- [ ] 確認項目 5: publish_changed で visibility 反映
- [ ] 確認項目 6: trashed status guard が機能（蘇生しない）
- [ ] エッジケース 1: Note 不在で handled + skip
- [ ] エッジケース 3: dlq 行が nextBatch で除外される
- [ ] 既存機能（rebuild / 検索 / ingestion / export）への regression なし
