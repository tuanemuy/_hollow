# 実装計画 — Issue #379: ゴミ箱(trashed)ノートの詳細ページがエラーになり表示できない

**Issue:** #379
**作成日:** 2026-05-31
**複雑度:** 小規模

---

## 目的

ゴミ箱に入れた（trashed）ノートの詳細ページ `/notes/$noteId` を開いたときに、エラー境界（「エラーが発生しました」）に落ちず、本文・下部メタ・「ゴミ箱を開く」アクションが正しく表示されるようにする。

ゴミ箱ビュー（`TrashList.tsx`）は各ノートを `/notes/$noteId` にリンクしているため、通常の UI 操作から到達する実害がある。

## 原因

`NoteDetail`（`app/components/note/detail/NoteDetail.tsx`）は全ノートに対し `loadPublishStateForNote` を無条件で `Promise.all` 内から呼ぶ。これが内部で呼ぶ `listShareLinks`（`app/core/application/publication/listShareLinks.ts:37-42`）は、`note.status !== "active"` のとき `BusinessRuleError(NoteErrorCode.Trashed, "Note <id> is trashed; share links are not listable")` を throw する。

`NoteDetail` の `catch` は `isNotFoundError` のみ `notFound()` に変換し、それ以外は再 throw するため、この `BusinessRuleError` がページ全体のエラー境界に伝播する。

## 調査で判明した事実

- ノートをゴミ箱に移動すると、`handleNoteTrashedEvent`（`app/core/application/publication/handleNoteTrashedEvent.ts`）が domain event 駆動で publication state を `private` に強制遷移し、share link を一括失効する。よって trashed ノートの公開状態は本来 `private`・active link なし。
- 詳細ページで `publishState.links` が使われるのは `publicShareUrl` の算出のみ。`publicShareUrl` を使う `NoteActions` は `status === "trashed"` で早期 return し（「ゴミ箱を開く」だけ表示）、共有 URL を一切出さない。よって trashed ノートで share link 情報は不要。
- `loadPublishStateForNote` の利用箇所は `NoteDetail.tsx` のみ。
- `listShareLinks` の throw は `issueShareLink` / `changePublicationVisibility` の trashed ガードと同じ `NoteErrorCode.Trashed` を使う一貫した仕様であり、これ自体は正しい。変更しない。
- 既存に同型の前例あり: `app/components/export/ExportJobDetail/Page.tsx` が `isBusinessRuleError(error) && error.code === ExportErrorCode.Unauthorized` で特定の `BusinessRuleError` を presentation 層で識別・ハンドリングしている。

## スコープ

### 含まれるもの
- `NoteDetail` が trashed ノートでもエラー境界に落ちず描画されるよう修正する（presentation 層のみ）。

### 含まれないもの
- `listShareLinks` / `loadPublishStateForNote` の application 層の挙動変更（trashed の throw は仕様として維持）。
- `NoteMetaPanel` / `NoteActions` の表示ロジック変更（trashed 表示は既に対応済み）。
- `listShareLinks` の trashed ガードに対するユニットテスト追加（本 Issue のスコープ外。Phase 4 で起票判断）。

## 実装ステップ

### 1. `NoteDetail` で trashed 由来の `BusinessRuleError` を吸収する

- **対象ファイル:** `app/components/note/detail/NoteDetail.tsx`
- **変更内容:**
  - `loadPublishStateForNote(...)` の呼び出しに `.catch` を付け、`isBusinessRuleError(e) && e.code === NoteErrorCode.Trashed` のときだけ trashed 用デフォルト `{ visibility: "private", publishedAt: null, links: [] }` を返す。それ以外のエラーは再 throw（既存の `notFound` 変換ロジックに到達させる）。
  - `import { isBusinessRuleError } from "@/core/domain/error"` と `import { NoteErrorCode } from "@/core/domain/note/errorCode"` を追加。
- **理由:** active ノート（ホットパス）の `Promise.all` 並列ロードを一切犠牲にせず、trashed ノートだけフォールバックする。デフォルト値は domain event 適用後の実データ（private・link なし）と一致するため、`NoteMetaPanel` は「非公開」＋「ゴミ箱」チップを正しく表示し、`NoteActions` は「ゴミ箱を開く」のみ表示する。

## 設計判断

詳細は `.issue/379/adr.md`（ADR-001）参照。要約: application 層の `listShareLinks` の throw は仕様として維持し、presentation 層（`NoteDetail`）で trashed 由来エラーを吸収する。`Promise.all` 全体を catch するとほかのローダー結果も失う／active のホットパスに直列化のレイテンシ回帰を生むため、`loadPublishStateForNote` の promise 単体に `.catch` を付けて並列性を維持する。

## リスクと注意点

- `.catch` は `NoteErrorCode.Trashed` のコード一致時のみフォールバックし、それ以外は再 throw する。trashed 以外の障害（NotFound・権限・システムエラー）を握りつぶさないこと。
- フォールバック値の `visibility` は `Visibility` 型（`"private"`）、`links` は `readonly ShareLinkDTO[]`（`[]`）として `loadPublishStateForNote` の戻り型に整合させる。`as const` 等で型を合わせる。
- eventual-consistency の窓（trashed 直後で event 未処理）でも `listShareLinks` は `note.status` ベースで throw するため、フォールバックの「非公開」表示になる。trashed ノードとしては妥当。

## テスト方針

- `pnpm typecheck && pnpm lint:fix && pnpm format` で静的検証。
- ブラウザ検証（manual-test）: ノートを1件ゴミ箱に移動 → `/trash` から該当ノートのリンクをクリック → 詳細ページがエラーにならず、本文・メタ（非公開＋ゴミ箱チップ）・「ゴミ箱を開く」アクションが表示されることを確認。
- 既存機能への影響: active ノートの詳細ページが従来どおり表示されること（公開状態チップ・共有 URL 含む）を確認。
