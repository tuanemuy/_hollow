# 動作確認計画 — Issue #159: dispatch routing 拡張 (note.purged / note.trashed view fan-out / tag.deleted / user.deleted)

**Issue:** #159
**作成日:** 2026-05-23

---

## 確認環境

このIssueは `app/core/application/workers/dispatchDomainEvent.ts` の switch 拡張、対応する unit test の更新、`spec/domains/index.md` の修正が中心。DB migration の追加なし、既存 handler の振る舞い変更なし、新規環境変数の追加なし。

確認の主な観点:
1. `note.purged` → search + publication + media + view の 4 handler が fan-out で全部呼ばれる
2. `note.trashed` → search + publication + view の 3 handler が呼ばれる（既存 fan-out に view を追加）
3. `tag.deleted` → view handler が呼ばれて SavedView の broken marker が更新される
4. `user.deleted` → publication + export の順で fan-out
5. `directory.deleted` / `media.uploaded` は skipped 維持（physical event が発行されない/存在しないため）
6. 自動テスト（typecheck / lint / unit / integration）

### 検証環境の起動

```bash
pnpm db:migrate    # local D1 にマイグレーション適用（初回または migration 追加時のみ）
pnpm dev           # vite dev + workerd 経由でアプリ起動
```

> 本 Issue では新規 migration / 環境変数は追加しないため、既存の `.dev.vars` のままで動作する。

### 検証環境での dispatcher 確認

`pnpm dev` の workerd 経由では cron トリガーは自動発火しない。Outbox → relay → consumer (dispatch) の経路を確認するには:

```bash
# relay 単体起動（outbox を queue に流す）
pnpm wrangler dev --config wrangler.toml --env relay --test-scheduled

# consumer 単体起動（queue から取り出して dispatchDomainEvent を呼ぶ）
pnpm wrangler dev --config wrangler.toml --env consumer
```

D1 を直接覗いて handler の副作用を確認:

```bash
# Note trash / purge 後の publication_states / share_links / saved_views の状態確認
pnpm wrangler d1 execute hollow-local-d1 --local --command "SELECT note_id, visibility, is_pinned, updated_at FROM publication_states ORDER BY updated_at DESC LIMIT 20;"
pnpm wrangler d1 execute hollow-local-d1 --local --command "SELECT id, note_id, revoked_at FROM share_links ORDER BY issued_at DESC LIMIT 20;"
pnpm wrangler d1 execute hollow-local-d1 --local --command "SELECT id, owner_id, broken_marker_payload FROM saved_views ORDER BY updated_at DESC LIMIT 20;"
pnpm wrangler d1 execute hollow-local-d1 --local --command "SELECT id, status, processed_at FROM outbox_events WHERE event_type IN ('note.purged','note.trashed','tag.deleted','user.deleted') ORDER BY occurred_at DESC LIMIT 20;"

# Media refs decrement の確認
pnpm wrangler d1 execute hollow-local-d1 --local --command "SELECT id, ref_count, orphaned_at FROM media_assets ORDER BY created_at DESC LIMIT 20;"
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
# staging への deploy（dispatcher は consumer に同梱されているため consumer を再 deploy）
pnpm deploy:staging:consumer
pnpm deploy:staging              # app 本体（必要に応じて。switch 拡張のみなら consumer のみで足りる）

# production も同じ順序で
pnpm deploy:production:consumer
pnpm deploy:production
```

> 本 Issue の主な配線変更は consumer 側の `dispatchDomainEvent`。app / relay の振る舞いは変わらない。

## 確認項目

### 1. `note.trashed` → search + publication + view の fan-out

- **目的:** Note を trash した際に view 側で broken marker が立つこと（既存の search delete + publication 削除に加え、新規に view fan-out が動くこと）
- **手順:**
  1. ブラウザでログインしてダッシュボードへ
  2. ノートを新規作成
  3. 別途、当該ノートを参照する SavedView（フィルタ条件で当該ノートが対象になるもの）を作成
  4. ノートを trash する
  5. 数秒待って outbox → relay → consumer の経路が回るのを待つ
  6. `saved_views` を D1 で覗き、broken marker が立っていることを確認
  7. `publication_states` の visibility が public → private に変わっていることを確認（既存挙動）
- **期待結果:** outbox の `note.trashed` 行が `status='processed'` で処理済み。SavedView の broken marker が立ち、UI でも broken 表示される。
- **確認ポイント:** view fan-out が追加されている = SavedView の broken marker が立つ。これまでは立たなかった。

### 2. `note.purged` → search + publication + media + view の 4 handler fan-out

- **目的:** Note を purge した際に 4 つの handler すべてが動くこと
- **手順:**
  1. ノートを作成し、本文に画像を添付（MediaAsset の ref が attached になる）
  2. 当該ノートを参照する ShareLink / SavedView を作成
  3. ノートを trash → 管理画面の「purge」操作で物理削除
  4. 数秒待って outbox を処理
  5. `share_links` を D1 で覗き、当該ノートに紐づく行が物理削除されていることを確認
  6. `publication_states` の当該行が削除されていることを確認
  7. `media_assets` の `ref_count` が減算され、ref_count = 0 になっていれば `orphaned_at` が立つことを確認
  8. `saved_views` の broken marker が立っていることを確認
- **期待結果:** 4 handler すべてが処理を完了し、それぞれのテーブルに反映される
- **確認ポイント:** これまでは search delete のみで、publication / media / view の cleanup が outbox 経由では動いていなかった

### 3. `tag.deleted` → view handler が呼ばれる

- **目的:** Tag を削除した際に SavedView の tag 参照クリーンアップが動くこと
- **手順:**
  1. Tag を作成して幾つかのノートに付与
  2. 当該 Tag を参照する SavedView（フィルタ条件で当該 Tag を含むもの）を作成
  3. Tag を削除（Tag.DeleteTag）
  4. 数秒待って outbox を処理
  5. `saved_views` を D1 で覗き、broken marker または tag 参照クリーンアップが反映されていることを確認
- **期待結果:** `tag.deleted` event が `handled` で処理され、SavedView が更新される

### 4. `user.deleted` → publication + export の順 fan-out

- **目的:** User account 削除時に Publication の visibility を private 化し、Export の進行中 job を cancel する経路
- **手順:**
  1. 新規 user を作って公開ノートと進行中の export job を持たせる（fixture でもよい）
  2. 当該 user の account を削除（`Identity.DeleteAccount` / `SuspendUser`）
  3. 数秒待って outbox を処理
  4. `publication_states` を D1 で覗き、当該 user の公開ノートが private に変わっていること
  5. `export_jobs` を覗き、active な行が cancelled に変わっていること
- **期待結果:** publication → export の順で fan-out が完了。両方の cleanup が反映される
- **確認ポイント:** publication 完了後に export が動いていること（順序を確認するには outbox の `note.publish_changed` / `share_link.revoked` の再 emit を観察する）

### 5. `directory.deleted` / `media.uploaded` は dispatcher で skipped 維持

- **目的:** spec 修正後でも physical event が発火しないこと、dispatcher 側で skipped を返すこと
- **手順:**
  1. Directory を削除（配下にノートあり）
  2. `outbox_events` を D1 で覗き、`directory.deleted` 行が **存在しない** ことを確認（配下ノートの `note.trashed` のみ enqueue される）
  3. Media を upload しても `media.uploaded` 行が enqueue されないこと
- **期待結果:** `directory.deleted` / `media.uploaded` 物理 event が outbox に存在しない。spec の文言修正と一致する。

## エッジケース・異常系

### 1. `note.purged` の partial failure → retry での冪等性

- **目的:** fan-out 途中で transient エラーが起きた際、redelivery で再実行されても全体が冪等に収束すること
- **手順:**
  1. D1 を一時的に閉じる、または handler 内部で意図的に throw するパッチで media handler を失敗させる
  2. dispatch が retry を返し、queue から redelivery されることを確認
  3. パッチを外して再 dispatch → 4 handler すべてが冪等に完了
- **期待結果:** 先行 handler の commit が再実行で重複してもエラーにならず、最終状態が正常な cleanup 後と一致する

### 2. payload schema drift (`noteId = ""` 等) → BusinessRuleError → handled+warn

- **目的:** validation 失敗で BusinessRuleError が出た際、partial commit せずに `handled+warn` で確定すること
- **手順:**
  1. outbox に手で不正な payload (`noteId = ""`) を持つ `note.purged` 行を挿入
  2. relay 経由で dispatch が呼ばれる
  3. dispatcher のログに `[dispatch] business-rule violation` が出力されること
  4. publication / media / view のどの handler も呼ばれていないこと（D1 を覗いて確認）
- **期待結果:** ADR-005 の通り、validation 失敗で副作用ゼロのまま `handled+warn` で確定

### 3. `tag.deleted` / `user.deleted` の transient error → retry

- **目的:** D1 transient エラーで dispatch が retry を返すこと
- **手順:**
  1. handler 内部で意図的に D1 throw するパッチを当てる
  2. dispatcher の outcome が `retry` で queue.retry() が呼ばれること
  3. パッチを外して redelivery → 冪等に完了
- **期待結果:** redelivery のループで最終的に `handled` に到達

## 既存機能への影響確認

- **`note.trashed` 経路の publication 側挙動が変わらない**: 既存の `publication.handleNoteTrashedEvent` が `note.publish_changed` を再 emit する経路は維持される。新たに追加された view fan-out は publication と独立で動く。
- **search index 更新の挙動が変わらない**: `searchHandleNoteTrashedEvent` の呼出は既存どおり最初に発火。後続の fan-out 追加は search 側に影響しない。
- **既存 single-handler case (`note.created` 等) は触らない**: ADR-005 の規約は新規 case のみ適用。既存ルーティングは無変更。
- **既存 integration テスト群（`publication.integration.test.ts`, `media.integration.test.ts`, `view/handlers.test.ts`）が引き続き pass する**: handler 自体は変更しないため。

## 確認チェックリスト

- [ ] `note.trashed` で SavedView の broken marker が立つ
- [ ] `note.purged` で publication_states / share_links / media_assets.ref_count / saved_views の 4 つが更新される
- [ ] `tag.deleted` で SavedView の tag 参照クリーンアップが動く
- [ ] `user.deleted` で publication → export の順で cleanup が動く
- [ ] `directory.deleted` / `media.uploaded` の outbox 行が enqueue されない（spec と一致）
- [ ] `note.purged` partial failure で retry が起き、冪等に収束する
- [ ] BusinessRuleError 時に副作用ゼロで `handled+warn` 確定
- [ ] `pnpm typecheck` pass
- [ ] `pnpm lint:fix` pass
- [ ] `pnpm format` pass
- [ ] `pnpm test:unit` pass
- [ ] `pnpm test:integration` pass
