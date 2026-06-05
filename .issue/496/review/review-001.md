# PR Review #001 — refactor(#496): publication state 読み取りを usecase 経由に整理

**PR:** #519
**Date:** 2026-06-06
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数（良い点・確認事項）
- Verdict: **APPROVED**

3レイヤー（Use Case/アーキ、Presentation/Loader、Test）を並列レビュー。全レイヤーで Blocker 0 / Warning 0。1ラウンドでクリーン。

---

## Use Case / アーキテクチャ

#### Blockers
なし

#### Warnings
なし

#### Notes
- **[N-001]** `getPublicationState` は `listShareLinks` と所有権ゲート（`loadOwnedNote` → trashed チェック → findById）が verbatim で一致。契約一致が正しく担保。
- **[N-002]** hexagonal 確立パターン遵守。id 橋渡しを usecase 内に閉じ込め、presentation からキャストを排除（本Issue主目的）。
- **[N-003]** barrel 再export は厳密アルファベット順（`getPublicNote` の前）。二重 export 衝突なし。
- **[N-004]** エラーハンドリングは CLAUDE.md 方針適合（domain エラーを再翻訳せず透過、broad catch なし）。
- **[N-005]** 挙動変更ゼロを担保（publishedAt 同一 ISO、trashed 逐次順序ガード）。

## Presentation / Loader

#### Blockers
なし

#### Warnings
なし

#### Notes
- **[N-001]** 返り値の形・型・null/フォールバックが変更前と完全一致。
- **[N-002]** `publishedAt` は `toInstantOrNull` → `.toISOString()` で旧 `.toISOString()` と同一文字列。
- **[N-003]** 2つの個別パス dynamic import（`Promise.all`）は既存 `loadOwnedNotes` と同一慣習。分割代入も正しい。
- **[N-004]** 逐次順序（listShareLinks → getPublicationState）保持で throw 経路は変更前と等価。NoteDetail.tsx の catch も従来どおり機能。
- **[N-005]** 直接 repo アクセスと `Parameters<...>` キャストを完全除去。
- **[N-006]** 判断B（loadReferencingNoteTitle 現状維持）は妥当。

## Test

#### Blockers
なし

#### Warnings
なし

#### Notes
- **[N-001]** 6分岐（null/private行/public/Forbidden/NotFound/Trashed）を網羅、漏れなし。
- **[N-002]** note slice 規約に準拠（setupTestContainer、nextId、seed ヘルパー、エラー検証スタイル）。
- **[N-003]** publishedAt の ISO round-trip 一致が load-bearing に pin されている。エラーコードも実値一致。
- **[N-004]** seed の FK・必須カラム整合性に問題なし。
- **[N-005]** 軽微な冗長: `publicationState?.noteId as string` の `as string` は no-op（DTO で既に string）。→ **本ラウンドで修正済み（`as string` 削除）**。

---

## Design Decisions

特になし（計画時の ADR-001 / ADR-002 から逸脱なし）。
