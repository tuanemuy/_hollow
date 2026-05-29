# PR Review #001 — feat(#321): 内部リンクの後追い再解決

**PR:** #327
**Date:** 2026-05-29
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 3
- Notes: 多数（各レイヤー positive）
- Verdict: **BLOCKED**（Warning 修正のため。Blocker は 0）

レイヤー: Domain / Application(Usecase) / Adapter(Infrastructure) / Test の4視点で並列レビュー。

---

## Domain

#### Blockers
なし

#### Warnings
なし

#### Notes
- `chooseResolutionForTitle` 抽出は #127 既存挙動を逐語的に保存（ソート比較子・self除外・empty→null）。リグレッションなし。
- 純関数性・型・命名・ポート契約（生 row 形 projection の露出は opaque ハンドルとして妥当）すべて良好。
- 追加4ポートメソッドの JSDoc が where 条件・owner join 必要性・index 非効率・self除外の所在まで明記。

## Application / Usecase

#### Blockers
なし

#### Warnings
- **[W-A1]** `backfillInternalLinkResolution` の offset ページングが並行更新下でスキップ/重複読みを起こしうる。`scannedNotes` カウントが実ノート数と乖離しうる（出力カウントの意味のブレ）。冪等性で最終収束はするが単発網羅は保証されない。
  - 場所: `app/core/application/note/backfillInternalLinkResolution.ts`
  - 提案: id カーソル化、または JSDoc にセマンティクス（走査回数・再実行前提・単発非保証）を明記。

#### Notes
- dispatch の4イベント判定 `[...].includes(event.type)`（バグ形回避）、search 早期 return と独立呼び出し、NoteId VO 先行、trashed fan-out 末尾追加、JSDoc routing 更新すべて計画通り。
- handler の read→計算→write 順序、stale解除/title解決(勝者一致)/id解決、collectEvents 非発行、冪等性すべて正しい。
- ドメインロジック漏出なし、broad catch 増加なし。

## Adapter / Infrastructure

#### Blockers
なし

#### Warnings
- **[W-Ad1]** `setLinkResolution` のチャンクは現状 90 IDs + 1 SET = 91 < 100 で正しいが、将来 where に追加バインドを足すと逼迫しうる（実害なし・注意喚起）。
  - 場所: `app/core/adapters/d1/repositories/noteRepository.ts` setLinkResolution
  - 提案: 将来の追加バインドを考慮するコメントを残す。

#### Notes
- 4メソッドの SQL は全てパラメータバインド（インジェクション安全）。`findResolvedLinkRowsByTarget` は `findReferrers` と同 where。owner+active join・self除外・mapDbError・pending batch 遅延書き込みすべて既存パターン整合。
- no-op 時は `pending.isEmpty()` で `db.batch()` スキップ（ADR-008 の主張がコード上で成立）。
- 統合テストが実 D1 で end-to-end に4メソッドを叩く。

## Test

#### Blockers
なし

#### Warnings
- **[W-T1]** 自己参照除外（exceptId / kind=id 自己除外、#127 ADR-005 の不変条件）が handler/integration レベルで未検証（純関数ユニット＋手動のみ）。handler/integration テストは全て `fromNoteId ≠ noteId` で組まれ、self-link 経路を区別できない。
  - 場所: `handleLinkTargetResolution.test.ts` / `internalLinkBackfill.integration.test.ts`
  - 提案: 「A が `[[A自身のタイトル]]` / `[[<A自身のid>]]` を持つ状態で dispatch → 自己リンクは null のまま」を integration に追加。

#### Notes
- `chooseResolutionForTitle` parity テスト、dispatch 新 fan-out 検証、port 追従 stub、解除/解決双方向アサーション、冪等アサーションいずれも妥当（実装の言い換えでない）。

---

## 対応（このラウンドで修正）

- **W-T1（最重要）**: `internalLinkBackfill.integration.test.ts` に自己参照2ケース追加（title 自己リンク・id 自己リンクとも null のまま／別ノートからの参照は解決される）。テスト 7→9 件、全PASS。
- **W-A1**: `backfillInternalLinkResolution.ts` の JSDoc と `scannedNotes` フィールドコメントに、offset ページングのセマンティクス（走査回数・並行更新下の skip/重複・再実行で収束・単発スナップショットでない）を明記。id カーソル化はスコープ膨張のため見送り（運用・冪等・履歴修復用途、Warning 止まり）。
- **W-Ad1**: `setLinkResolution` に将来の追加バインドを考慮するコメントを追記。

## Design Decisions
特になし（既存 ADR-008〜011 の範囲内）。
