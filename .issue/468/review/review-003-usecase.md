# Review 003 — Use Case（ゼロベース・フルレビュー）

対象: PR #834（Issue #468: source blob のストレージ衛生）
観点: アプリケーション層（ユースケースのオーケストレーション、UoW 境界、エラー契約、受け入れ基準の充足）

## 受け入れ基準の検証結果

| AC | 判定 | 根拠 |
|---|---|---|
| AC-1 | 充足 | `spec/domains/media.md` に保持ポリシー（TTL なし・Note ライフサイクル連動・二重猶予・再検討トリガー）が明文化。ADR-001 と整合 |
| AC-2 | 充足 | `prepareSourcePersist` が metadata-first（temp 欠損チェック → 小 UoW で pending 行 commit → put）に変更され、`ingestion.integration.test.ts` の rollback E2E（NotFoundError ロールバック → pending/source 残存 → sweep → purgeOrphans 1 回で blob+行消滅）で実証 |
| AC-3 | 充足 | `runPruneTick` に `sweepAbandonedSourceIntakes` → `purgeOrphans` が独立 best-effort try/catch で配線（戻り値契約不変）。未配線だった `purgeOrphans` の spec 乖離も解消。`handlers.integration.test.ts` に 2-tick 実 DB 経路の裏付けあり |
| AC-4 | 充足 | 猶予内スキップ（integration ②）、strict `<` cutoff のドメイン unit テスト、orphan 化での `updatedAt` 再スタンプによる二重猶予（integration ①⑤）を確認 |
| AC-5 | 充足（CI integration は本レビュー時点で pending） | commit 正常系 / overwrite / uploadMedia 系の既存テストは無変更。unit / build は green |

### Use Case

#### Blockers

なし

#### Warnings

- **[W-001]** sweep の安全性前提「`pending(kind='source')` は commit フロー内でのみ生成され、同一リクエスト内で attach される」（ADR-004）が、アプリケーション層の型ではなく transport 境界の zod enum だけで守られている
  - 場所: `app/core/application/media/uploadMedia.ts`（`UploadMediaInput.kind: MediaKind`）、`app/core/application/media/uploadMediaPresigned.ts`（同様）、`app/components/media/schema.ts`（`mediaKindSchema = z.enum(["image", "video", "avatar"])`）
  - 理由: `MediaKind` は `"source"` を含むため、両アップロードユースケースは型上 `kind='source'` の pending 行を作れる。現状は `mediaKindSchema` が `"source"` を除外しているため到達不能だが、この enum が sweep の誤回収防止（attach 待ちの正当な pending source を作らせない）を担っていることはどこにも記録されていない。将来「source の直接アップロード」等で schema を広げる・新しい呼び出し元が生えると、正当に attach 待ちの source pending が 24h 後に sweep → purge され blob が黙って消える。ユーザーデータを黙って消さないという ADR-001 の原則を破る経路が「ドキュメントされていない暗黙の結合」で封じられている状態であり、CLAUDE.md「Make illegal states unrepresentable at the type level」に照らすと弱い
  - 提案: `UploadMediaInput` / `UploadMediaPresignedInput` の `kind` を `Exclude<MediaKind, "source">` に絞り、source intake の生成経路を commit フローに型レベルで限定する（アダプタ・presentation の変更不要のはず）。それが本 PR のスコープ外なら、最低限 `mediaKindSchema` と sweep の JSDoc に「source を除外しているのは #468 ADR-004 の sweep 前提を守るため」という WHY コメントを残す

#### Notes

- **[N-001]** metadata-first の実装順序が計画どおり正確: temp 欠損 skip 判定 → 小 UoW insert → `safeStoragePut`。temp 欠損時に行だけ残る無駄を作らない（plan ステップ 4 の要件）。ownership / previewing 不一致時も insert 前に `null` return するため、非 owner のリクエストでゴミ行・blob を作れない
- **[N-002]** `SourcePersist` を `{ mediaId: MediaAssetId }`（branded）へ縮小し、main UoW が永続化済み行を `findById` で再読して真実を DB 行に一本化した判断（実装時 ADR）は、二重運搬の曖昧さを消す良い縮小。cast なしで branded id が流れる点も丁寧
- **[N-003]** main UoW の fail-loud ガード（null / 非 pending → `SystemError(DataIntegrityError)`）が「黙って sourceFileId を落とす」劣化を防いでおり、両アーム（行消失 / 非 pending 遷移）が実経路（3 つの UoW の間への変異注入）integration テストで検証されている。「行消失 ⇒ blob も purge 済み」の含意も成立しており（`delete` は purge のみが呼び、purge は storage delete → DB delete の順）、このガードで行なし blob が漏れる経路はない
- **[N-004]** rollback E2E テストの assert が厚い: outbox に `media.*` が漏れないこと（stage (a) の collectEvents 省略と main UoW ロールバックの両方の検証）、temp blob 保全、同一 job 再 commit が放棄行と干渉しないこと、purge が放棄 intake のみを消し再 commit した source が無傷なことまで押さえており、AC-2 の実証として十分
- **[N-005]** `sweepAbandonedSourceIntakes` は `purgeOrphans` と同型（候補列挙 UoW → per-row UoW + fresh `findById` ガード + per-row try/catch）で、CLAUDE.md の「worker → root が唯一の broad catch」ポリシーに整合。fresh ガード・per-row 失敗分離を integration では作為なしに再現できないという判断で unit（変異注入フェイク）に分担した実装時 ADR も、既存の purgeOrphans テスト分担と整合的
- **[N-006]** `ObjectStorage.delete` の冪等性（missing key = 成功）のポート契約化が、blobless 行の purge 完走テストとして sweep integration と commit 実経路（put 失敗）の二重で検証されている。回収チェーンが暗黙に踏む前提を契約＋テストに固定した点は堅実
- **[N-007]** `runPruneTick` の配線は既存パターン（per-step 独立 try/catch、`createRequestContainer` を try 内で生成し設定不備も swallow、戻り値契約不変）を正確に踏襲。sweep → purge の順序・失敗分離が unit で、container → D1/R2 の実配線が 2-tick integration で担保されている
- **[N-008]** `uploadMedia` / `uploadMediaPresigned` の JSDoc 修正（「PurgeOrphans が pending を回収する」という誤記の実態化）は挙動変更なしでドキュメントの正確性だけを直しており、plan ステップ 5 の意図どおり
- **[N-009]** 軽微: 2 つの DataIntegrityError integration テストが「usecase は UoW をちょうど 3 回、この順で開く」という内部実装のカウント（`uowRuns === 3`）に結合している。コメントで前提は明記されているが、将来 usecase に UoW が 1 つ増えると変異が別の UoW 前に注入され、テストが意図と異なる経路を検証し始める。壊れたら気付ける類の脆さなので Warning とはしない

## 既知の見送り（再指摘しない）

purge スループット上限（日次 100 行）、malformed 行での候補列挙全体 throw、`reconcileRefs` の構造的封鎖（残余窓での attach 上書き）は `.issue/468/adr.md` に別 Issue 対応として記録済みであることを確認した。sweep の JSDoc が残余窓の存在と許容根拠を正確に記述していることも確認した。
