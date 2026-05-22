# 実装計画 — Issue #94: saved_views filter application doesn't reflect in note list

**Issue:** #94
**作成日:** 2026-05-22
**複雑度:** 小規模

---

## 目的

保存ビュー（SavedView）を UI から選択しても、ノート一覧がそのビューの `tagIds` で絞り込まれない不具合を修正する。`/?viewId=...` に遷移した際、SavedView が pin した tag が `loadOwnedNotes` のフィルタに反映されるようにする。

## スコープ

### 含まれるもの

- `app/routes/index.tsx` の home loader で `viewQueryToSearch(view)` に tag 名解決 resolver を渡す
- 既存ユニットテスト（`listSelectors.test.ts`）が引き続きパスすることの確認

### 含まれないもの

- `viewQueryToSearch` のシグネチャ変更（resolver を必須化する破壊的変更はしない）
- `loadAllTags` の `TAG_RESOLVE_LIMIT` 超過時のページネーション対応（別領域）
- ホーム以外のルートで同じ穴がないかの全数調査（grep 結果より `viewQueryToSearch` の利用箇所は home loader とテストのみ）

## 根本原因

`app/routes/index.tsx:61` の以下の呼び出しで第 2 引数（`resolveTagNames`）が省略されている。

```ts
const restored = viewQueryToSearch(view);
```

`listSelectors.ts:138-187` の JSDoc が明示している通り、`viewQueryToSearch` は SavedView の `tagIds` を `tagNames` に変換する責任を caller に委ねており、resolver が渡されないと `tagNames` は `undefined` のまま返る。結果として:

1. `baseSearch.tagNames === undefined`
2. `loadOwnedNotes` の引数で `tagNames` がスプレッドされない（`app/routes/index.tsx:79-81`）
3. `listNotesByOwner` に `tagIds` が乗らず、フィルタなしの一覧が返る

シードの SavedView (`01938f00-...d071`) は `tagIds` のみを持つため「全フィルタが効いていない」ように見える。

## 実装ステップ

### 1. home loader で tag resolver を構築して `viewQueryToSearch` に渡す

- **対象ファイル:** `app/routes/index.tsx`
- **変更内容:** `if (search.viewId !== undefined)` ブロック内で `loadAllTags({ actorUserId: user.id })` を先行 await し、その `byId` マップから resolver を組み立てて `viewQueryToSearch(view, resolver)` に渡す。Promise.all 内の `loadAllTags` 呼び出しはそのまま残す（`cache()` 済みで重複コストなし）。
- **理由:** `listSelectors.ts` の JSDoc が定めた契約（caller が tag 名解決を提供する）を home loader 側で履行する。SavedView の `tagIds` が `tagNames` に展開され、`loadOwnedNotes` の filter path で `tagIds` に再解決されてクエリに乗る。未知 id はサイレントに drop（`brokenConditions` で別途追跡済み）。

## 設計判断

### 「resolver を home loader 側で組み立てる」を採用する理由

代替案として `viewQueryToSearch` 内で resolver を必須化する案もあるが、これは `listSelectors.ts` の既存契約（resolver は optional、caller 責任）を覆す破壊的変更であり、Issue のスコープ（バグ修正）を逸脱する。本Issueでは「caller 側の実装漏れを埋める」ことに留める。

### 未知 tagId のサイレント drop

SavedView の `brokenConditions` で UI 側に既に表示済みのため、loader 側で警告ログを出す等はスコープ外。`tagId → name` 解決に失敗した id は単純に `tagNames` から落とす。

### `loadAllTags` を分岐内で先行 await する

`loadAllTags` は React `cache()` でラップ済み。`viewId` 分岐内で改めて await しても Promise.all 内の呼び出しと重複実行されない。`viewId` なしの通常 path のレイテンシは増えない。

## リスクと注意点

- `TAG_RESOLVE_LIMIT` を超えるタグを持つユーザでは、SavedView の tagId が `byId` に乗らず取りこぼす可能性がある。別領域（タグページネーション）の課題で本修正の責任範囲外。
- 検索キーワード `q` がある場合、`loadOwnedNotes` 内では `searchOwnNotes`（search path）を経由し `tagNames` を直接インデックスに渡す。本修正で `tagNames` が baseSearch に乗るため両 path とも自然に効く。
- 既存ユニットテストは `viewQueryToSearch` のシグネチャ不変で全パスするはず。

## テスト方針

- `pnpm typecheck && pnpm lint:fix && pnpm format`
- `pnpm test:unit` — `listSelectors.test.ts` を含む既存テストが通ること
- 手動テスト（testing.md 参照）— Issue の再現手順で「フィルタ適用後にノートが絞り込まれる」ことを確認
