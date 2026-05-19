# 動作確認計画 — Issue #42: [spec-sync] follow-up: behavior gaps surfaced by Issue #5 integration tests

**Issue:** #42
**作成日:** 2026-05-20

---

## 確認環境

このIssueの変更を確認するために必要な手順のみ記載。

### マイグレーションの適用（ローカル D1）

```bash
pnpm db:migrate
```

`0007_notes_slug_partial_unique.sql` を追加しているため、partial unique index を反映するために実行する。

### 自動テストの実行

```bash
pnpm typecheck
pnpm test:unit
pnpm test:integration
```

それぞれ:
- `pnpm typecheck` — `tsgo` で型検査（`assertViewableBy` のシグネチャ拡張が呼び出し元に伝播しているかを確認）
- `pnpm test:unit` — `MediaService.assertViewableBy` の hasShareLink 引数追加に伴う domain 単体テストの新規ケース
- `pnpm test:integration` — `it.todo` から `it` 化した 4 件と既存テスト全体の回帰

### 検証環境の起動

```bash
pnpm dev
```

ローカル workerd + Vite で起動。`http://localhost:3000`（vite デフォルト）でアプリが立ち上がる。

### デプロイ方法

本Issueの変更確認は検証環境（ローカル D1 + `pnpm dev`）で完結する。ステージング・本番への反映は通常のリリースフローに従う。

---

## 確認項目

### 1. DownloadMedia: 他人 unlisted + viaShareLinkId 未指定で 403/エラーになる

- **目的:** `BusinessRuleError(media_not_viewable)` が return されることを確認する
- **手順:**
  1. ユーザー A でログイン、ノートを作成し、unlisted の publication state にする
  2. メディアをアップロードしてそのノートに紐付け（attached 状態）
  3. ログアウトしてユーザー B でログイン（または匿名）
  4. share-link を経由せずに直接 media の download URL（`viaShareLinkId` 無し）にアクセスする
- **期待結果:** ダウンロードが拒否され、`media_not_viewable` 由来のエラー画面（403 相当）が表示される
- **確認ポイント:** share-link 経由でアクセスした場合は引き続き download が成功すること

### 2. DuplicateNote: trashed ノートの複製が拒否される

- **目的:** trashed 状態のノートを複製しようとしたら `BusinessRuleError(note_already_trashed)` で拒否されることを確認
- **手順:**
  1. ノートを作成して trash（削除）する
  2. trashed 状態のノートを選択し「複製」を実行する
- **期待結果:** 複製が成功せず、エラー表示が出る。`schema.notes` の件数が増えていない
- **確認ポイント:** active なノートの複製は引き続き成功すること

### 3. RestoreNote: 復元先 slug 衝突で拒否される

- **目的:** trashed ノートを復元する際、同じ owner で同じ slug の active ノートが存在する場合に `BusinessRuleError(slug_conflict)` で拒否されることを確認
- **手順:**
  1. ノート B（slug: `"sample"`、active）を作成 → trash する → ノート B は (slug=`"sample"`, status=`"trashed"`) になる
  2. 続けてノート C を新規作成し slug を `"sample"` にする → partial unique index は `WHERE status='active'` で active 同士の衝突のみ禁じるため、trashed の B と active の C が同 slug で共存できる
  3. ノート B を restore（復元）する
- **期待結果:** ノート B の復元が拒否され、`slug_conflict` 由来のエラー表示が出る
- **確認ポイント:**
  - 復元先 slug が衝突しない通常ケース（C を別 slug にしてから B を復元）は引き続き復元が成功すること
  - active 同士は引き続き同 slug を作れないこと（C を `"sample"` で作成した後、別の active ノート D を `"sample"` で作ろうとすると DB レベルでブロック）

### 4. ListNotesByOwner: spec ドキュメントから keyword 行が削除されている

- **目的:** spec/testcases の整理が反映されていることを確認
- **手順:** `spec/testcases/note/index.md` を開き、ListNotesByOwner 表に `keyword 指定` 行が無いことを目視確認
- **期待結果:** keyword 行が削除されており、`spec/testcases/search/index.md` の `## SearchOwnNotes` 表に「キーワードあり」行があることが確認できる
- **確認ポイント:** コード変更はないため、`pnpm dev` 起動・動作確認は不要

---

## エッジケース・異常系

### 1. partial unique index が想定通り動作する（active + trashed 同一 slug 共存）

- **目的:** マイグレーション 0007 適用後、active と trashed の同一 (owner_id, slug) が共存できることを確認
- **手順:**
  1. `pnpm db:migrate` でマイグレーションを適用
  2. integration test の `trashLifecycle.integration.test.ts` の slug_conflict ケースが green になっていることを確認（fixture で active + trashed の同 slug seed が成功すること）
- **期待結果:** `pnpm test:integration` 全体が PASS する

### 2. unlisted media + viaShareLinkId 有のケースは引き続きアクセス可能

- **目的:** 既存の正常系（share-link 経由）に regression が無いことを確認
- **手順:** Issue #5 で実装済の `media.integration.test.ts` の「unlisted + viaShareLinkId 有」ケース（L572-597 付近）が引き続き PASS することを確認
- **期待結果:** `pnpm test:integration` 全体 PASS

---

## 既存機能への影響確認

- **CreateNote / SaveNote / RenameNote の slug 検証**: 引き続き `NoteService.assertSlugUnique` 経由で `NoteErrorCode.InvalidSlug` が返ること。restoreNote 専用の `SlugConflict` と混在していないこと。
- **DuplicateNote (active ノート)**: trashed 検証追加によって active ノートの複製が壊れていないこと。
- **DownloadMedia の他のパス**: owner 自身のアクセス、public ノート、share-link 経由 unlisted は引き続き機能すること。

## 確認チェックリスト

- [ ] `pnpm db:migrate` がエラーなく完了する
- [ ] `pnpm typecheck` が通る
- [ ] `pnpm test:unit` が全 PASS する（`MediaService.assertViewableBy` の新規ケース含む）
- [ ] `pnpm test:integration` が全 PASS する（`it.todo` から `it` 化した 4 件含む）
- [ ] `pnpm lint:fix && pnpm format` が通る
- [ ] `pnpm dev` が起動する
- [ ] DownloadMedia: 他人 unlisted + share-link 無で拒否される（UI 動作確認）
- [ ] DuplicateNote: trashed ノートの複製が拒否される（UI 動作確認）
- [ ] RestoreNote: slug 衝突で復元が拒否される（UI 動作確認）
- [ ] spec/testcases/note/index.md から keyword 行が削除されている
- [ ] 既存の正常系（unlisted + share-link 有、active 複製、衝突なし復元）に regression がない
