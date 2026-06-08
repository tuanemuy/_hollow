# PR Review #001 — feat(#556): wikilink/hashtag 表示レンダリングの横展開とタグ導線

**PR:** #598
**Date:** 2026-06-08
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 2
- Notes: 多数（全レイヤー positive）
- Verdict: **BLOCKED**（Warning 2件を修正してから再レビュー）

---

## Architecture / Domain / Use Case

### Blockers
なし

### Warnings
- **[arch-W-001]** `surface` 型がドメイン port では inline union、adapter では別名 `Surface` 型で二重定義
  - 場所: `app/core/domain/note/ports/noteBodyRenderer.ts`（`options?: { surface: "auth" | "public" }`）/ `app/core/adapters/renderer/noteBodyRenderer.ts`（`type Surface = "auth" | "public"`）
  - 理由: `surface` を「ドメイン語彙の表示文脈」と JSDoc で明言しているが、語彙の SSOT がドメインに無く adapter が独自再宣言。将来サーフェス追加時に片方だけ更新されるドリフト余地。
  - 提案: port 側で `export type NoteBodySurface = "auth" | "public"` を定義し、`options?: { surface: NoteBodySurface }` とした上で adapter がそれを import。

### Notes（抜粋）
- verbatim 不変条件は厳密に維持（DTO `contentHtml` 据え置き・別フィールド `renderedContentHtml`、両 usecase 統合テストで固定）。
- `surface` は I/O・副作用なしの純粋表示文脈フラグで port のドメイン配置を破壊しない。
- ADR-003/004（過去版 refs 流用・public ルート委譲）の application 責務・private 露出防止が正しく実装。
- 後方互換（`options?` 既定 auth、`getNoteDetail` 無変更）OK。消費側型整合 OK。

## Security

### Blockers
なし

### Warnings
なし

### Notes（抜粋）
- hashtag href の XSS 防御が二重に堅牢（`encodeURIComponent(JSON.stringify([tag]))` で `"<>&` を percent-encode + `escapeAttrValue` 多層 + `HASHTAG_PATTERN` が危険文字を捕捉前に除外）。
- wikilink href の `resolvedNoteId` は UUID 由来のみ。display は `escapeTextValue` で両サーフェス維持。
- private 露出は ADR-004 どおりコードで成立（public は `/notes/public/`、`getPublicNote` byId の gate で 404・列挙防止）。
- 公開 hashtag は非リンクで auth `/` へ誘導しない。共有リンク経路も同じ公開 gate を通る。
- 過去版は owner 限定で private 漏洩なし。`<pre>`/`<code>`/`<a>` 抑制が surface 非依存で維持。

## Frontend

### Blockers
なし

### Warnings
なし

### Notes（抜粋）
- 型整合完全（`renderedContentHtml` は非 optional、undefined 経路なし、typecheck クリーン）。
- CSS 追加漏れ・重複なし（#549 先回りの `.hashtag` / `a.hashtag:hover` / `.wikilink` / `[data-unresolved]` が新出力に一致）。
- 3 画面（auth 詳細・公開詳細・過去版）が同形に揃い描画一貫。RSC 適合・クライアント JS 追加なし。
- verbatim とマークアップ版の混在なし。スコープ逸脱なし（各 1 行差し替え）。

## Test

### Blockers
なし

### Warnings
- **[test-W-001]** `getNoteRevision` 統合テストが ADR-003 の核心（現行ノート refs 流用による wikilink 解決）を未検証
  - 場所: `app/core/application/note/__tests__/getNoteRevision.integration.test.ts`（新規 `marks up #hashtag tokens in the revision body`）
  - 理由: 追加テストは `#design` ハッシュタグのマークアップのみ。hashtag 経路は refs を一切参照しない（`hashtagMarkup` は `refsByKey` 不使用）ため、ステップ4/ADR-003 の唯一の非自明な配線「現行ノート refs を渡し、過去版本文の `[[wikilink]]` が現行 refs にマッチすれば解決リンク化、マッチしなければ未解決 degrade」が統合レベルで一度も踏まれない。refs を空配列で渡しても緑のまま（リグレッション検出力ゼロ）。
  - 提案: 現行ノートに解決済み internal link を seed し、過去版本文に当該 `[[target]]` を含めて `<a class="wikilink" href="/notes/$id">` が出ること + 現行 refs に無い `[[古い参照]]` が `<span class="wikilink" data-unresolved>` に degrade することの 2 アサーションを追加（auth サーフェス）。

### Notes（抜粋）
- 最重要の往復アサーション（生成 href を `defaultParseSearch` に通し `{ tagNames: ["design"] }` に戻る）が適切に実装済み。スカラー誤形式を確実に捕捉。
- XSS ペイロードタグの往復+エスケープ検証が堅実。
- 両サーフェス分岐網羅、#549 既存テストの退行なし、ADR-005 アサーション更新も正確。
- `getPublicNote` 統合テストが `renderedContentHtml` を実検証（public ルート指向・auth 非露出・hashtag 非リンク・verbatim 保持）。

---

## Design Decisions

このラウンドで新たな設計判断なし（arch-W-001 は型衛生の改善、test-W-001 はカバレッジ補強で、いずれも既存 ADR の範囲内）。
