# PR Review #001 — chore(#372): タグ note_count 死蔵コードの撤去

**PR:** #376
**Date:** 2026-05-31
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 0
- Notes: 多数（各レイヤー良好）
- Verdict: **APPROVED**

レビュー対象レイヤー: Domain / Use Case / Adapter・Infrastructure（migration含む）/ Test の4視点を並列実施。全レイヤーで Blocker・Warning ともに 0件。1ラウンドでクリーン。

---

## Domain

#### Blockers
なし

#### Warnings
なし

#### Notes
- **[N-001]** `Tag` から noteCount/increment/decrement/不変条件・不要 import・JSDoc がクリーンに撤去（ADR-003 整合、残骸なし）。
- **[N-002]** `reconstruct`/`create` の契約が一貫。唯一の呼び出し元 adapter も noteCount を渡さず型で担保。
- **[N-003]** `TagErrorCode.NoteCountNegative` 撤去は `errorCodeNaming.test.ts`（glob 走査）と矛盾なし。`tag_note_count_negative` 参照の残存なし。
- **[N-004]** ポート `findByOwner` の `{ tag; noteCount }` ペア返却はヘキサゴナル原則に反しない（集計値を運ぶペアであり I/O ではない）。JSDoc で集計値・非対称性を明示。
- **[N-005]** 列値/集計値の二重性が消え、make-illegal-states-unrepresentable はむしろ前進。

## Use Case

#### Blockers
なし

#### Warnings
なし

#### Notes
- **[N-001]** mergeTags は source delete OCC・各 note save OCC で正当性維持。increment＋target save 撤去・残骸なし（ADR-002）。target version を進めない波及先は listTags のみで副作用なし。
- **[N-002]** listTags のペア配列ページング（limit+1/slice/cursor）が正しい。cursor は実ページサイズ分進み、ズレなし。
- **[N-003]** createTag/renameTag が 0 を渡す設計が妥当。両 server function は戻り値の noteCount を読まない（actions.ts で `{ tagId }` のみ返す）ことを実機 grep 確認。表示供給源は listTags/loader のみ。
- **[N-004]** renameTag の no-op 早期 return でも `toTagView(result.tag, 0)` は問題なし。
- **[N-005]** DTO/ポート/entity の JSDoc が「read-time aggregate」と明示し誤解を防ぐ。ドメインロジックの漏出なし。

## Adapter / Infrastructure

#### Blockers
なし

#### Warnings
なし

#### Notes
- **[N-001]** migration 0013 の table 再構築 SQL は `0001:193-207` から note_count/索引/check のみ除いたものと完全一致（列順・型・default・NOT NULL・FK・unique 索引再作成・INSERT 範囲・DROP 順序すべて正確）を1行ずつ検証。
- **[N-002]** `PRAGMA defer_foreign_keys = ON` による note_tags FK の commit 遅延は integration（tagRepository 16件）green で実地検証。`readD1Migrations` 経路でも適用成功。
- **[N-003]** schema.ts の tags 定義と migration 最終形が一致（drizzle journal 不在のため手作業レビュー依存＝ADR-005 既知トレードオフ、本 PR では一致）。
- **[N-004]** `desc` import は他索引で継続使用、未使用 import なし（typecheck green）。
- **[N-005]** D1TagRepository の toTag/insert/save から noteCount 除去漏れなし。`noteCountExpr`（owner-scope active-only COUNT）は #365 維持。`sort: "noteCount"` は索引撤去後も集計式 alias で機能（索引は性能最適化のみ、per-user bounded で実害なし）。
- **[N-006]** `Number(row.noteCount)` 変換は D1 の COUNT 文字列返却への妥当な対処。`COUNT(notes.id)` で未使用タグ 0。
- **[N-007]** adapter→application のエラー変換契約（mapDbError / ConflictError 等）は不変。

## Test

#### Blockers
なし

#### Warnings
なし

#### Notes
- **[N-001]** 撤去対象 API 参照テストは漏れなく追従・削除、残骸なし。未使用 import なし、typecheck クリーン。
- **[N-002]** #365 の read-time 集計回帰（sort desc/asc・tie-break・owner-scope・active-only・cascade-to-0）が全て維持され、戻り値形変更（`e.tag.name`/`e.noteCount`）に正しく追従。アサーション値は骨抜きにされていない。
- **[N-003]** 「ignores the stored note_count column」テスト削除は妥当（列が消えシナリオ表現不能。読み取りカバレッジは他テストで担保）。
- **[N-004]** seed ヘルパーの noteCount 除去が schema 一致。対象5 integration ファイルすべて green。
- **[N-005]** mergeTags テストは source 削除・note_tags 張り替えを検証。version アサートは元々 renameTag のみで回帰なし（ADR-002）。
- **[N-006]** typecheck クリーン、unit 13件 + integration（tag 35 / note 94）green。消しすぎ・骨抜きなし。

---

## Design Decisions

このラウンドで新たに見つかった設計判断は特になし（既存 ADR-001〜005 で網羅済み）。
