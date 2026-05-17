# Test レビュー Round 2 — PR #41

**PR:** #41
**Date:** 2026-05-18
**Round:** 2回目（Test 観点）
**対象コミット:** 233f8134 (Round 1 修正)

---

## Round 1 Warnings の解決状況

| ID | 件名 | 状態 |
|---|---|---|
| W-T1 | extendEditLock 他人ロック OR 曖昧 | ✅ ExtendNotOwner に固定 + 理由コメント |
| W-T2 | daily_upload_quota_exceeded リテラル | ✅ ADR-004 #14 で記録 + コメントで根拠明示 |
| W-T3 | createNote content_too_large の OR-of-shapes | ✅ SystemError(DataIntegrityError) + cause=BusinessRuleError(ContentTooLarge) に固定 |
| W-T4 | purgeOrphans R2 失敗の検証不足 | ✅ ADR-004 #15 に記録 + コメントで明示 |
| W-T5 | getIngestionJob happy/Forbidden 同一 it | ✅ 2 it に分割 |
| W-T6 | runIngestionJob 成功経路の assertion 不足 | ✅ 7 経路全てに `errorCode === null` + `'fake structured'` を追加 |
| W-U1 | Outbox 名乖離 ADR 未記載 | ✅ ADR-004 #16/#17 に追記 |
| W-U2 | acquireEditLock 自己再取得の acquiredAt 検証 | ✅ `acquiredAt` 前進を assert + 理由コメント |
| W-U3 | extendEditLock 両方許容 (W-T1 と重複) | ✅ 解消 |
| W-U4 | releaseEditLock happy path 欠落 | ✅ guard test 追加 + ADR-005 に判断記録 |
| W-U5 | restoreNote every() ガード欠落 | ✅ `every(e => e.eventType === "note.restored")` 追加 |
| W-U6 | commitIngestionPreview overwrite outbox 検証なし | ✅ `ingestion.committed` 含有 assert 追加 |
| W-S1 | ListNotesByOwner it.todo ADR 未記録 | ✅ ADR-004 #18 に追記 |
| W-S2 | media に spec 外 NotFoundError test | ✅ 削除 + ADR-005 #2 で判断記録 |

→ **全 16 Warning が解決済み。** ADR-004/005 への記録も plan の方針通り。

---

### Blockers

なし

### Warnings

なし

### Notes

- **[N-001]** Round 1 で指摘した「OR-of-shapes」「OR-of-code」が全て確定的な単一値固定に置換されており、テストが実装仕様の現状を 1:1 で pin する形になった。リグレッション検知能力が大きく上がった。
- **[N-002]** ADR-004 が #1–#13 → #1–#18 に拡張され、テスト中の `it.todo` / `expect` の固定値全てに ADR 番号コメントが対応している。次回 spec-sync で漏れなく拾える状態。
- **[N-003]** `releaseEditLock` happy-path guard と削除した media NotFoundError aux test の取り扱いを ADR-005 で明文化した。「spec 外テストは原則禁止、ただし最小限の guard 例外を判断根拠付きで認める」というルールが透明化された。
- **[N-004]** `runIngestionJob` の 7 成功経路に `errorCode === null` を追加した結果、parser/extractor のいずれかが mid-failure を返した場合に「成功扱いだが previewJson は失敗の残骸」という潜在バグも検知できるようになった。
- **[N-005]** Round 1 修正コミット (233f813) の対象 8 ファイルを個別走行し、77 passed + 3 todo（spec 乖離由来）で安定。副作用なし。
- **[N-006]** acquireEditLock 自己再取得時の `acquiredAt` 前進 assert は、ドメインモデルの実挙動（`Note.acquireEditLock` が無条件に `now` を書き直す）を pin している。将来「再取得時は acquiredAt を保つ」へ仕様が変わったら確実に落ちる。良い回帰防御。
- **[N-007]** `trashLifecycle.integration.test.ts` の deleteNote describe にも note.deleted vs note.trashed 乖離コメントを足したが、`deleteNote` の it 本文には Round 1 で既に `every` ガードがあるため追加不要だった（restoreNote のみ追加）。整合性 OK。

---

## Verdict

**APPROVED**（Test 観点）

Round 1 で挙げた Warning 16 件は全て妥当な形で解消され、ADR-004/005 に乖離・例外判断が網羅的に記録された。新たな Warning は検出されず、修正による副作用も観測されない。

`pnpm vitest run --config vitest.config.integration.ts` 走行で対象 8 ファイル 77 it + 3 todo が安定パス。3 todo は ADR-004 #1 / #10 / #11 / #18 由来の仕様乖離 it.todo（DownloadMedia unlisted, RestoreNote slug_conflict, DuplicateNote trashed 拒否, ListNotesByOwner keyword）であり Phase 4 で別 Issue 起票が予定済み。

Test 観点としては merge 可能。
