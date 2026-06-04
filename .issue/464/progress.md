# 進捗メモ — Issue #464

## 実装済み

- ルート移動: `app/routes/notes/$noteId/publish.tsx` → `app/routes/_app/notes/$noteId/publish.tsx`（git mv）。`createFileRoute` を `/_app/notes/$noteId/publish` に変更し、leaf 側の `import "...action"` 副作用 import を削除（`_app/route.tsx` が登録済み）。
- `errorComponent`/`notFoundComponent` に `_app` トーンの最小スタイルを適用。
- `PublishSettingsPage.tsx`: `<main>` → `<section className={PUBLISH_BODY}>`（二重 `<main>` 回避）。
- `app/components/publication/styles.ts` 新設（P14 固有定数）。
- `PublishSettings/index.tsx` 各ブロックをスタイリング（radio-card / link-row / URL preview / status バッジ / 操作ボタン）。`<h2>公開設定</h2>` を `<h1>` + `PAGE_TITLE` に格上げ、`<h3>限定公開リンク</h3>` を `<h2>` に繰り上げ。

## フォロー候補

- **STATUS_DOT の SSOT 統合**: `note/detail/NoteActions.tsx` の `VISIBILITY_DOT`（非 export）と `publication/styles.ts` の `STATUS_DOT` は同一トークン語彙（`unlisted`→`status-link`）。本Issueでは NoteActions に手を入れないため別定義としたが、将来的に共通定数（`common/styles.ts` 等）へ移設して一本化する余地がある。
