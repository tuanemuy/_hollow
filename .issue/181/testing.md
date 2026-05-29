# 動作確認計画 — Issue #181: directory deletion should mark SavedView broken (Issue #159 follow-up)

**Issue:** #181
**作成日:** 2026-05-29

---

## 確認環境

このIssueは `directory.deleted` 物理ドメインイベントの新規発行（`Directory.DeleteDirectory`）、decoder 登録（relay worker）、dispatcher の `directory.deleted` → `view.handleDirectoryDeletedEvent` routing が中心。DB migration の追加なし、新規環境変数の追加なし、SavedView ドメイン・handler 本体の変更なし。

確認の主な観点:
1. ディレクトリ削除で各ディレクトリについて `directory.deleted` が outbox に enqueue される（**空ディレクトリでも発火する**こと、サブツリー削除で削除ディレクトリ数分発火すること）
2. `directory.deleted` が relay → consumer (dispatch) → `view.handleDirectoryDeletedEvent` に routing され、`directoryId` フィルタを持つ SavedView の broken marker が立つ
3. `media.uploaded` は引き続き skipped 維持（physical event が存在しないため）
4. 自動テスト（typecheck / lint / unit / integration）

### 検証環境の起動

```bash
pnpm db:migrate    # local D1 にマイグレーション適用（初回のみ。本 Issue は migration 追加なし）
pnpm dev           # vite dev + workerd 経由でアプリ起動
```

> 本 Issue では新規 migration / 環境変数は追加しないため、既存の `.dev.vars` のままで動作する。

### 検証環境での dispatcher 確認

`pnpm dev` の workerd 経由では cron トリガーは自動発火しない。Outbox → relay → consumer (dispatch) の経路を確認するには relay / consumer を単体起動する:

```bash
# relay 単体起動（outbox を queue に流す）
pnpm wrangler dev --config wrangler.toml --env relay --test-scheduled

# consumer 単体起動（queue から取り出して dispatchDomainEvent を呼ぶ）
pnpm wrangler dev --config wrangler.toml --env consumer
```

D1 を直接覗いて副作用を確認:

```bash
# 削除したディレクトリの directory.deleted 行が enqueue / processed されているか
pnpm wrangler d1 execute hollow-local-d1 --local --command "SELECT id, event_type, status, processed_at FROM outbox_events WHERE event_type IN ('directory.deleted','note.trashed') ORDER BY occurred_at DESC LIMIT 30;"

# SavedView の broken marker が立っているか（directory 参照 marker）
pnpm wrangler d1 execute hollow-local-d1 --local --command "SELECT id, owner_id, broken_marker_payload, version FROM saved_views ORDER BY updated_at DESC LIMIT 20;"
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
# directory.deleted の発行は app 本体（DeleteDirectory usecase）、decode は relay、routing は consumer に同梱。
# 3 つすべての再 deploy が必要。
pnpm deploy:staging              # app 本体（directory.deleted の発行）
pnpm deploy:staging:relay        # decoder 登録
pnpm deploy:staging:consumer     # dispatcher routing

# production も同じ
pnpm deploy:production
pnpm deploy:production:relay
pnpm deploy:production:consumer
```

> 本 Issue は app（発行）・relay（decode）・consumer（dispatch）の 3 箇所にまたがる。一括なら `pnpm deploy:staging:all` / `pnpm deploy:production:all`。

## 確認項目

### 1. directoryId フィルタの SavedView がディレクトリ削除で broken になる

- **目的:** ディレクトリ削除時に、その directoryId をフィルタ条件に持つ SavedView の broken marker が立つこと（本 Issue の核心要件）
- **手順:**
  1. ブラウザでログインしてダッシュボードへ
  2. ディレクトリ A を作成
  3. 「directory = A の配下のノート」をフィルタ条件とする SavedView を作成
  4. ディレクトリ A を削除する
  5. 数秒待って outbox → relay → consumer の経路が回るのを待つ（または relay/consumer を単体起動）
  6. `outbox_events` を D1 で覗き、`directory.deleted` 行が `status='processed'` であること
  7. `saved_views` を D1 で覗き、当該 SavedView の `broken_marker_payload` に directory 参照 marker が立っていること
  8. UI でも SavedView が broken 表示されること
- **期待結果:** ディレクトリ A の `directory.deleted` が処理され、directoryId=A フィルタの SavedView が broken になる
- **確認ポイント:** これまで（Issue #159 時点）は directory フィルタの SavedView は broken にならなかった。本 Issue で初めて立つ。

### 2. 空ディレクトリ（子ノートなし）の削除でも broken になる

- **目的:** 子ノートを持たない空ディレクトリの削除でも `directory.deleted` が発火し、SavedView が broken になること（案B では塞げないギャップ）
- **手順:**
  1. ノートを一切含まない空ディレクトリ B を作成
  2. directory = B フィルタの SavedView を作成
  3. ディレクトリ B を削除
  4. `outbox_events` を D1 で覗き、`directory.deleted` 行が **存在する**こと（`note.trashed` は 0 件）
  5. `saved_views` で当該 SavedView の broken marker が立っていること
- **期待結果:** 空ディレクトリでも `directory.deleted` が 1 件発火し、SavedView が broken になる
- **確認ポイント:** `note.trashed` が 0 件でも `directory.deleted` 経由で broken マークが立つ（案A 採用の決め手）

### 3. サブツリー削除で削除ディレクトリ数分の directory.deleted が発火

- **目的:** ネストしたディレクトリ（親 P > 子 C1, C2）を削除した際、削除された全ディレクトリについて `directory.deleted` が発火すること
- **手順:**
  1. ディレクトリ P を作り、その配下に C1, C2 を作成（C1 配下にノート1件、C2 は空）
  2. directory = C2（空）フィルタの SavedView と、directory = P フィルタの SavedView を作成
  3. ディレクトリ P を削除（サブツリー全削除）
  4. `outbox_events` を D1 で覗き、`directory.deleted` が P / C1 / C2 の 3 件、`note.trashed` が C1 配下ノート分発火していること
  5. `saved_views` で directory=C2 と directory=P 両方の SavedView が broken になっていること
- **期待結果:** 削除された全ディレクトリ（P, C1, C2）について個別に `directory.deleted` が発火し、各 directoryId を参照する SavedView がそれぞれ broken になる
- **確認ポイント:** post-order（子→親）での削除順だが、view handler は directoryId 単位で独立・冪等なので順序非依存

## エッジケース・異常系

### 1. 再配信（at-least-once）での冪等性

- **目的:** `directory.deleted` が redelivery されても SavedView の broken marker が冪等に収束すること
- **手順:**
  1. ディレクトリ削除後、handler 内部で意図的に D1 transient throw するパッチを当てて dispatch を retry させる
  2. パッチを外して redelivery → 再実行
  3. `saved_views` の broken marker が二重適用でエラーにならず、最終状態が正常な broken marker 1 件に収束していること
- **期待結果:** OCC `expectedVersion` + BrokenConditionMarker のキー衝突 collapse により再配信に耐え、冪等に収束する

### 2. payload schema drift（空文字 directoryId）→ BusinessRuleError → handled

- **目的:** dispatcher の VO 化（`DirectoryId.create`）が空文字/空白の directoryId で BusinessRuleError を投げた際、副作用ゼロで `handled`（ack）確定すること
- **手順:**
  1. outbox に手で `directory.deleted` 行（`directoryId = ""`）を挿入
  2. relay 経由で dispatch が呼ばれる
  3. dispatcher のログに business-rule violation が出力され、`handled` で確定すること
  4. `view.handleDirectoryDeletedEvent` の副作用が発生していないこと（saved_views が変化していない）
- **期待結果:** ADR-159-005 の通り、VO 化失敗で副作用ゼロのまま `handled` 確定（無限 retry や DLQ 行きにならない）
- **補足:** decoder の strict schema 違反（unknown key 等）は別レイヤー。relay の `decodeEntry` で `SystemError` として catch され per-row failure → DLQ になる（dispatcher には到達しない）

## 既存機能への影響確認

- **`note.trashed` 経由の既存挙動が変わらない**: ディレクトリ配下のノートに対する `note.trashed` fan-out（search / publication / view）は従来どおり動く。`directory.deleted` 経由はそれと独立した directory 参照 marker を立てる（2 経路併存）。
- **`media.uploaded` は skipped 維持**: 本 Issue では触らない。dispatcher で skipped のまま。
- **既存 integration テスト（`directory.integration.test.ts`）の更新**: 「空ディレクトリ削除で outbox event が出ない」系テストは挙動変更により `directory.deleted` を 1 件期待するアサーションへ更新済みであること。
- **既存 view handler テスト（`view/__tests__/handlers.test.ts`）が pass**: handler 本体は変更しないため。

## 確認チェックリスト

- [ ] directoryId フィルタの SavedView がディレクトリ削除で broken になる（確認項目1）
- [ ] 空ディレクトリ削除でも `directory.deleted` が発火し SavedView が broken になる（確認項目2）
- [ ] サブツリー削除で削除ディレクトリ数分の `directory.deleted` が発火する（確認項目3）
- [ ] 再配信で broken marker が冪等に収束する（エッジ1）
- [ ] 空文字 directoryId で BusinessRuleError → 副作用ゼロで handled 確定（エッジ2）
- [ ] `note.trashed` 経由の既存挙動が変わらない
- [ ] `media.uploaded` が skipped 維持
- [ ] `pnpm typecheck` pass
- [ ] `pnpm lint:fix` pass
- [ ] `pnpm format` pass
- [ ] `pnpm test:unit` pass
- [ ] `pnpm test:integration` pass
