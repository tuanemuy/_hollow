# PR Review #001 — fix(ui): 公開ノートのコピーボタンが公開URLをコピーするよう修正 (#525)

**PR:** #526
**Date:** 2026-06-06
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 6
- Verdict: **APPROVED**

---

## General Review

検証結果: PR #526 は Issue #525 の期待挙動テーブルと plan.md を正確に満たしている。`pnpm vitest` / `pnpm typecheck` / `biome check` すべてクリーンを確認済み。

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001]** `copyUrl` の visibility 分岐が Issue の期待テーブルを完全に満たすことを確認。
  - `public` → `publicNoteUrl`（共有リンク残存時も公開 URL 優先、不具合①解消。test で固定済み）
  - `unlisted` + アクティブリンク有り → `shareLinkUrl`
  - `unlisted` リンク無し / `private` → `internalUrl`（`/notes/{id}` fallback、従来挙動踏襲）
  - 4 分岐すべてが `NoteActions.test.tsx:189-216` で網羅・固定されている。
- **[N-002]** 公開 URL 組み立て `${appUrl.replace(/\/$/, "")}/u/${user.username}/${note.slug}`（`NoteDetail.tsx`）は既存パターンと完全一致。`view.ts` の `shareLinkUrlFromId` と同じ trailing-slash 除去方式で、共有リンクと同じ正規ホストに揃う。
- **[N-003]** URL エンコード省略の妥当性を検証。`note.slug` は `[a-z0-9][a-z0-9-]*`、`user.username` も lowercase letters / digits / hyphens で URL-safe、エンコード不要は正しい。両 DTO フィールドとも非 optional の `string` で null 考慮不要も妥当。
- **[N-004]** props リネームの漏れなし。`publicShareUrl` の残存参照ゼロを確認。
- **[N-005]** 命名是正が的確。`publicShareUrl` → `shareLinkUrl`、公開 URL は `publicNoteUrl` として明示分離。両 prop に責務を説明する JSDoc コメントが付き、CLAUDE.md のコメント方針に沿っている。
- **[N-006]** `UrlCopyButton.tsx` の JSDoc が "public share URL vs. internal" と表現しており、本 PR の用語整理（shareLinkUrl / publicNoteUrl）とは僅かにズレる。差分外・ジェネリックな説明だが軽微なので本 PR で用語を揃える。→ 本ラウンドで対応。

総じて、小規模 fix として過不足なく、回帰テストで分岐を固定し、既存 URL 組み立てパターンとの一貫性も保たれている。マージ可能。

---

## Design Decisions

特になし（plan.md の設計判断から逸脱なし）。
