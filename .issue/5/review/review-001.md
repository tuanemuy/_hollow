# PR Review #001 — test: add integration tests for note / media / ingestion (Issue #5)

**PR:** #41
**Date:** 2026-05-18
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 16（重複統合後）
- Notes: 20
- Verdict: **BLOCKED**（Warning 修正のため）

---

## Test レビュー

### Blockers
なし

### Warnings

- **[W-T1]** editLock の「extendEditLock by another user」アサーションが OR で曖昧
  - 場所: `app/core/application/note/__tests__/editLock.integration.test.ts:253-256`
  - 理由: `expect([ExtendNotOwner, EditLockedByOther]).toContain(error.code)` が確定的でない。実装変更時に気付けない。
  - 提案: 実挙動を確認して 1 つに固定。

- **[W-T2]** `daily_upload_quota_exceeded` がリテラル文字列で比較
  - 場所: `app/core/application/ingestion/__tests__/ingestion.integration.test.ts:375`
  - 理由: 他テストは `IngestionErrorCode.XXX` 経由なのにここだけ生文字列。`IngestionErrorCode` に当該定数が無いのが根本原因。
  - 提案: ADR-004 に追加し、コメントで実装側リテラルとの一致を明示。

- **[W-T3]** `createNote` の content_too_large テストが OR-of-shapes で受理
  - 場所: `app/core/application/note/__tests__/createNote.integration.test.ts:256-273`
  - 理由: ADR-004 #9 で「実装は SystemError 経由でしか到達しない」と決めた以上、SystemError パスに固定すべき。
  - 提案: SystemError + cause が BusinessRuleError に絞る。

- **[W-T4]** `purgeOrphans` の R2 失敗テストが「リトライ対象として記録」を検証していない
  - 場所: `app/core/application/media/__tests__/purgeOrphans.integration.test.ts:163-185`
  - 理由: 実装は status=deleting で stuck し、次の sweep で拾い直されないが、これは spec の「リトライ対象として記録」と乖離。ADR-004 未記載。
  - 提案: ADR-004 に追記、テストコメントで明示。

- **[W-T5]** `getIngestionJob` の happy / Forbidden が 1 つの it にまとめられている
  - 場所: `app/core/application/ingestion/__tests__/ingestion.integration.test.ts:773-812`
  - 理由: plan section 4「spec 表 1 行 = 1 it」に反する。失敗時の分岐特定が困難。
  - 提案: 2 it に分割。

- **[W-T6]** runIngestionJob 成功経路の assertion が「fake structured」含有まで踏み込んでいない
  - 場所: `app/core/application/ingestion/__tests__/runIngestionJob.integration.test.ts:218-424`
  - 理由: 各経路で `errorCode === null` の検証も無く、途中失敗を見逃す可能性。
  - 提案: 各成功経路で `errorCode === null` または `fake structured` 含有を追加 assert。

## Use Case 整合性

### Blockers
なし

### Warnings

- **[W-U1]** spec/実装の Outbox 名乖離が ADR-004 に未記載
  - 場所: `app/core/application/note/__tests__/trashLifecycle.integration.test.ts:129, 183, 243`
  - 理由: spec の `note.deleted` / `note.saved` ↔ 実装の `note.trashed` / `note.restored` の乖離が ADR-004 に未記録。
  - 提案: ADR-004 #14, #15 として追記。

- **[W-U2]** `acquireEditLock` 自己ロック再取得時の acquiredAt assertion が不足
  - 場所: `app/core/application/note/__tests__/editLock.integration.test.ts:125-148`
  - 理由: 現実装は `acquiredAt` をリセットする挙動なのに、`expiresAt > initialExpiresAt` のみ assert。
  - 提案: `acquiredAt` の前進も assert して挙動を固定化。

- **[W-U3]** `extendEditLock` 他人ロックの分岐が両方許容（W-T1 と重複）

- **[W-U4]** `releaseEditLock` の happy path テストが欠落
  - 場所: `app/core/application/note/__tests__/editLock.integration.test.ts:261-289`
  - 理由: spec 表は「他人ロック Release」1 行のみだが、本体 happy path の動作が一切検証されていない。実装で常に noop を返すバグが入っても検知不能。
  - 提案: spec 通り「他人ロック」のみで止めるなら ADR に明記、追加するならテスト追記。

- **[W-U5]** `restoreNote` の outbox 検証で every() ガードが欠落
  - 場所: `app/core/application/note/__tests__/trashLifecycle.integration.test.ts:181-186`
  - 理由: deleteNote 等は全行 type 一致まで検証しているが restoreNote は件数のみ。
  - 提案: `every` ガードを追加。

- **[W-U6]** `commitIngestionPreview` overwrite ケースが outbox 検証なし
  - 場所: `app/core/application/ingestion/__tests__/ingestion.integration.test.ts:568-619`
  - 理由: 他の commit ケースは `ingestion.committed` を assert しているが overwrite だけ抜けている。
  - 提案: outbox 行存在 assert を追加。

## Spec カバレッジ・計画整合

### Blockers
なし

### Warnings

- **[W-S1]** ListNotesByOwner の it.todo が ADR-004 未記録
  - 場所: `app/core/application/note/__tests__/listNotesByOwner.integration.test.ts:343-345`
  - 理由: spec 「keyword → Search ドメインへ委譲」を `it.todo` で残しているが ADR-004 未記載。
  - 提案: ADR-004 #16 として追記、Phase 4 で「spec/testcases 側の対応行を `searchOwnNotes` に移動」を起票。

- **[W-S2]** media.integration.test.ts に spec/testcases 未記載の追加 it が 1 件
  - 場所: `app/core/application/media/__tests__/media.integration.test.ts:603`
  - 理由: plan「含まれないもの」に「spec/testcases に書かれていない追加ケース」を明示しているのに NotFoundError 補助テストが入っている。
  - 提案: 削除するか ADR-005 として補助テスト追加判断を記録。

---

## Notes（要点抜粋）

- ADR-004 の乖離記録が極めて丁寧、各テストファイル冒頭の spec アンカーコメントも整備
- ファイル分割方針が plan 通りに守られ identity の 1600 行巨大化を再発させていない
- ローカル fake / stub class が全て徹底されており共通 fakes に手入れなし（ADR-002 完全遵守）
- catch ブロックの fall-through が全ファイルで守られている
- 直接 insert の version=0 指定がスキーマと整合して全箇所で正しい

---

## Design Decisions

- ListNotesByOwner の keyword テスト所在: searchOwnNotes ドメイン側に移管か本ユースケース内に残すかは Phase 4 で判断
- media の NotFoundError 補助テスト: 残す方針なら ADR-005 として記録、スコープ厳守なら削除
