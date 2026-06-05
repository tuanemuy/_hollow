# PR Review #001 — refactor: presentation → domain の id 型漏れを全スライスで解消

**PR:** #495
**Date:** 2026-06-05
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 3（うち 2 件は同一箇所 `loadPublishStateForNote`）
- Notes: 多数（網羅性・パターン整合・ADR 遵守を確認）
- Verdict: **BLOCKED**（Warning 解消のため。Blocker はゼロ）

3レイヤー（Use Case / Presentation / Architecture依存方向）並列レビュー。

---

## Use Case 層

### Blockers
なし

### Warnings
- **[W-UC-001]** 橋渡しキャストの配置がファイル間で不統一（`actorUserId` をローカルに束ねる流儀と、`ownerId !== input.actorUserId` で string 直比較する流儀の混在）
  - 場所: `deleteNote.ts:25`, `purgeNote.ts:27`, `duplicateNote.ts:32`, `getNoteDetail.ts:45`
  - 理由: 他ファイルは冒頭で `const actorUserId = input.actorUserId as UserId` を束ねるが、この4ファイルは `noteId` のみキャストし所有者比較は string 直比較。型成立・挙動完全不変。
  - **対応: 修正しない（許容）**。owner 比較は domain 境界呼出ではなく単純な文字列等価比較であり、`string` のまま比較するのは Issue の趣旨（id を string で扱い、domain 境界でのみ橋渡し）にむしろ沿う。挙動・型ともに問題なし。統一のための強制キャストは改善にならないと判断。

### Notes
- 対象 usecase（export 残り / note 全件 / search / publication / media）すべて網羅、漏れなし。
- #482 `getExportJob`/`retryExportJob` パターンへの整合良好。複数接点（`enqueueExportJob`/`downloadMedia` 3接点/`startExportJob` 2接点）も散発的重複キャストなし。
- ADR-002 の graceful fallback 温存を確認。バルク出力型 string 化・cross-usecase 互換も確認。ADR-001（worker/event 起点対象外）遵守、`dispatchDomainEvent.test.ts` 無傷。

---

## Presentation 層

### Blockers
なし

### Warnings
- **[W-PR-001]** `loadPublishStateForNote` の id 剥がしキャスト取りこぼし（計画の「loaders.ts の Parameters 経由の冗長キャスト除去」未達）
  - 場所: `app/components/note/loaders.ts:504-510`（no-op）/ `:514-518`（直接 repo ブランドキャスト）
  - **対応:**
    - L504-510（string化済み `listShareLinks` への no-op `Parameters<>` キャスト）→ **修正済み**。`args.actorUserId, args.noteId` を直接渡す形に変更。
    - L514-518（`publicationStateRepository.findById(args.noteId as Parameters<...>)`）→ **別 Issue でフォローアップ**。これは loader が usecase を介さず domain repo を直接叩く別系統の既存スメル（`Parameters<>` 形は domain id 型を import せずブリッジする意図的パターンで、import 漏れではない）。クリーンに消すには読み取り usecase 化（スコープ拡大）か `.create()`（挙動変更）が必要なため本 PR スコープ外。→ 別Issue #496 で対応

### Notes
- ADR-002 の不正 URL id graceful fallback 完全温存（`.create()` を検証ゲートとしてのみ使用、条件付きスプレッドのゲート維持、why コメント付与）。
- バルクのブランド漏れ（`failures[].noteId`）解消を確認。値型 `PublicationVisibility`・定数 `MAX_DIRECTORY_DEPTH` は正しく温存（過剰除去なし）。

---

## アーキテクチャ（依存方向）

### Blockers
なし

### Warnings
- **[W-AR-001]** `loadPublishStateForNote:504-509` の no-op `Parameters<>` キャスト取りこぼし（W-PR-001 と同一）
  - **対応: 修正済み**（上記 W-PR-001 と同じ修正で解消）。

### Notes
- 網羅 grep 検証: 対象4スライスの presentation→domain id 型直接依存は解消。残る domain import は値型（`PublicationVisibility`/`FrontMatterRecord`）・定数（`MAX_DIRECTORY_DEPTH`）・`.create()` 検証用の値 import のみで、id 型漏れではない。
- ADR-001 の判断（worker/event 起点対象外）は依存方向上妥当。内部専用 usecase 8件はブランド入力のままだが presentation 漏れなし（`searchPublicNotes` は `viewerUserId: null` のみ渡し、`app/components/public` 配下に domain import ゼロを確認）。
- L514-518 の直接 repo キャストは pre-existing（本 PR で増えていない）。フォローアップ候補。

---

## Design Decisions

- L514-518 の loader→domain repo 直接アクセスは、本 Issue（usecase の id 入力 string 統一）のスコープ外の既存アーキテクチャスメル。Phase 4 で別 Issue 化する。
