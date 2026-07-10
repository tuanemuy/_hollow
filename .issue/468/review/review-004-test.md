# Review 004 — Test（テスト網羅性・テスト設計）

- 対象: PR #834（Issue #468: source blob のストレージ衛生）
- 観点: テスト網羅性・テスト設計（ゼロベースのフルレビュー）
- 実行確認: 対象の unit 3 ファイル（42 tests）/ integration 4 ファイル（81 tests）をローカルで実行し全て green を確認済み

## 受け入れ基準とテストの対応（検証結果）

| AC | 担保状況 |
|---|---|
| AC-1（保持ポリシーの明文化） | ドキュメント成果物（`spec/domains/media.md` 保持ポリシー節 / `docs/runtime_cloudflare.md` 運用ノート）が存在。テスト対象外で妥当 |
| AC-2（put 成功・UoW ロールバック → 自動回収） | `ingestion.integration.test.ts`「reclaims the source blob after a commit rollback via sweep → purge」が rollback → pending 残存 → sweep → purge の全経路を実 DB で実証。put 失敗経路も別テストで担保 |
| AC-3（cron 配線） | `runPruneTick.test.ts`（呼び出し・順序・失敗 swallow・戻り値契約）+ `handlers.integration.test.ts` の 2-tick 実 DB テスト（container → adapter → D1/R2 の実配線）で担保 |
| AC-4（grace window の保護） | sweep integration「skips a pending source still inside the grace window」+ D1 の strict `<` 境界テスト + `service.test.ts` の cutoff 計算テストの3層で担保 |
| AC-5（既存フローの退行なし） | commit 正常系 / overwrite 差し替え / 既存 prune ステップのテストが維持され green。rollback テスト内で「再 commit が放棄行に干渉されない」ことも追加検証 |

spec/testcases（media の Sweep テーブル 7 行・ingestion の Commit 追加 4 行）と実テストのトレーサビリティも全行一致を確認した。

### Test

#### Blockers

なし

#### Warnings

- **[W-001]** temp 欠損 skip パス（`prepareSourcePersist` の `isTempFileNotFoundError` → `null` 返却）を exercise するテストがどこにも存在しない。
  - 場所: `app/core/application/ingestion/commitIngestionPreview.ts`（`prepareSourcePersist` の temp-missing 分岐）/ `app/core/application/ingestion/__tests__/ingestion.integration.test.ts`
  - 理由: 本 PR はこの関数を metadata-first に書き換え、plan ステップ 4 と JSDoc が「temp 欠損 skip 判定を行 insert より**前**に済ませ、行だけ残る無駄を作らない」という新しい順序不変条件を明示的に導入した。しかしこの順序はコメントでしか表明されておらず、将来「行 insert → temp 取得」に並べ替えられても既存テストは一切落ちない（結果は temp 欠損 commit ごとに無駄な pending 行が sweep 経路へ流れる挙動劣化で、typecheck でも検出不能）。パス自体が #452 以来未テストである点も含め、本 PR がこの分岐の直上を書き換えた以上、退行検知の網を張るべき。
  - 提案: integration テストを 1 本追加 — `tempStorageKey` を実在しないキーにした previewing job を commit → ①commit は成功しノートの `sourceFileId` が null、②`media_assets` が 0 件（stray pending 行なし）、③`logger.warn("ingestion.commit.source_temp_missing")` 相当の観測、を assert する。②が新不変条件のピン留めになる。
- **[W-002]** `findAbandonedSourceIntakes` の並び順の第 2 キー（id 昇順タイブレーク）が「Port contract」とコメントされているのに、ポート JSDoc に記載がなく、D1 integration テストでも検証されていない。
  - 場所: `app/core/application/media/__tests__/sweepAbandonedSourceIntakes.test.ts`（MutableFakeRepo.findAbandonedSourceIntakes 内コメント）/ `app/core/domain/media/__tests__/service.test.ts`（InMemoryRepo 内コメント）/ `app/core/domain/media/ports/mediaAssetRepository.ts`（JSDoc は「ordered oldest-first」のみ）/ `app/core/adapters/d1/__tests__/mediaAssetRepository.integration.test.ts`
  - 理由: 2 つのフェイクが「Port contract: ordered oldest-first (updatedAt, then id), matching the D1 implementation, so limit-crossing tests see the same rows」と主張しているが、契約の SSOT であるポート JSDoc は updatedAt 昇順しか約束していない。かつ D1 テストの ordering 検証は updatedAt が異なる 2 行のみで、`updatedAt` 同値時の id タイブレークは一度も exercise されない。同一秒に一括生成された放棄 intake（bulk commit 失敗など）では同値 updatedAt が現実に起こり、limit 跨ぎの決定性はこのタイブレークに依存する。フェイクとアダプターの挙動一致を「テストの前提」として使うなら、その一致自体をテストで固定すべき。
  - 提案: D1 integration に「updatedAt 同値の pending/source 3 行 + limit 2 → id 昇順の先頭 2 行が返る」を追加し、ポート JSDoc にタイブレークを明記する。契約に昇格させないなら、フェイクのコメントから「Port contract」の文言を外す。

#### Notes

- **[N-001]** DataIntegrityError ガードの 2 テスト（行消失 / 非 pending 遷移）が、UoW 実行回数をカウントして 3 回目直前に変異を注入し、さらに `expect(uowRuns).toBe(3)` で UoW トポロジー自体をピン留めしている。将来 UoW が増減して注入位置がずれた場合にテストが黙って無意味化するのを防ぐ、堅牢な fail-loud 設計。
- **[N-002]** unit / integration の分担が docs/test.md の方針（実 DB で作為なしに再現できない経路のみフェイク注入）に忠実で、fresh `findById` ガードと per-row 失敗分離を unit に寄せた判断が adr.md「実装時の追加決定」に根拠込みで記録され、integration 側のテスト（クエリレベル冪等性）にも「per-row ガードはこの経路では exercise されない」と意図が明記されている。カバレッジの空白が「知らない穴」ではなく「文書化された分担」になっている。
- **[N-003]** put 失敗テストのコメント「with the order reversed, a failed put would leave no pending row and this test fails」のとおり、row-before-put の順序不変条件そのものを殺すミューテーションで落ちる assert（blob なし + pending 行あり）になっており、metadata-first の核心が変異耐性のある形で固定されている。加えて outbox に `media.*` が漏れないことの検証（stage (a) の小 UoW は独立 commit されるため、イベントを collect していたら残ってしまう）まで押さえている。
- **[N-004]** strict `<` 境界の扱いが 3 層（D1: cutoff 同値行の除外テスト / domain service: graceSec=1 での境界テスト / integration: クロックピン留め + 前進）で一貫しており、plan のレビュー履歴で指摘された同時刻フレークが構造的に排除されている。`handlers.integration.test.ts` も SystemClock 前提を 25h バックデート（1h マージン）で吸収しておりフレーク耐性が高い。
- **[N-005]** `runPruneTick.test.ts` は新ステップ追加時に既存テスト「isolates a tag-merge prune failure」を単に維持するのではなく「media hygiene pair still runs」まで assert を強化しており、best-effort ステップ間の非阻害性がステップ追加後も網羅されている。sweep → purge の順序 assert も call-order 配列で明示的。

## 補足（指摘に至らなかった確認事項）

- `UploadableMediaKind`（`Exclude<MediaKind, "source">`）の型レベル封鎖は、transport boundary の `mediaKindSchema = z.enum(["image","video","avatar"])`（`app/components/media/schema.ts`、既存）が runtime 側を既に塞いでおり、enum を広げれば usecase 入力型との typecheck が落ちる構造のため、追加のランタイムテストは不要と判断。
- 既知の見送り（purge スループット上限 / malformed 行の listing 耐性 / reconcileRefs の構造的封鎖）は adr.md 記録済みのため対象外とした。
