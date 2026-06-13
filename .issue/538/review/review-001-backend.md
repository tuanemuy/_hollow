# Review 001 — Backend (Domain / Use Case / Adapter)

対象: PR #677（Issue #538）/ 計画: `.issue/538/plan.md` / 設計判断: `.issue/538/adr.md`

レビュー範囲: ポート `IngestionJobRepository.countByOwner`・d1 アダプター実装・usecase `countActiveIngestionJobs`・server-fn `getIngestionQueueCountFn`、および各テスト。

## 受け入れ基準との照合（担当レイヤー分）

| 基準 | 判定 | 根拠 |
|---|---|---|
| AC-5 のバックエンド経路（バッジ件数取得） | 満たす | port → d1 adapter → usecase → input-less GET server-fn が plan ステップ 1–4 どおり実装され、`requireCurrentUser` で actor スコープが強制されている |
| plan ステップ 1（ポート拡張 + JSDoc 契約） | 満たす | read-only / write-intent なしの契約、`findByOwner` と opts 語彙が異なる理由、空配列 = DB に行かず 0 の契約がすべて JSDoc に明記（`app/core/domain/ingestion/ports/ingestionJobRepository.ts:59-79`） |
| plan ステップ 2（d1 実装 + 統合テスト: IN フィルタ / owner スコープ / 空 statuses） | 満たす | `app/core/adapters/d1/repositories/ingestionJobRepository.ts:411-429`、テスト 4 ケース（`__tests__/ingestionJobRepository.integration.test.ts`） |
| plan ステップ 3（usecase + status 定数 + failed 除外理由の JSDoc + UoW 経由） | 満たす | `ACTIVE_INGESTION_STATUSES` が usecase 内定数、failed 除外理由を JSDoc に記載、`unitOfWorkProvider.run` 経由（`app/core/application/ingestion/countActiveIngestionJobs.ts`） |
| plan ステップ 4（server-fn: GET・入力なし・requireCurrentUser → usecase） | 満たす | `app/components/ingestion/actions.ts:162-177`、`getEffectiveIngestionPromptsFn` と同型 |

### Backend

#### Blockers

なし

#### Warnings

- **[W-001]** ポート `countByOwner` の opts がインライン匿名型で、隣接する契約型の規約（named `Readonly<{...}>`）から外れている / 場所: `app/core/domain/ingestion/ports/ingestionJobRepository.ts:76-79` / 理由: 同ファイルの `IngestionJobListOpts` や `NoteRepository` の `NoteOwnerCountOpts` は named `Readonly<>` 型として輸出されており、呼び出し側（usecase・adapter・テスト）が opts 型を参照したいとき匿名型は再記述を強いる。配列要素は `readonly` だがラッパーオブジェクト自体は `Readonly` でない点も sibling と不揃い / 提案: `export type IngestionJobCountOpts = Readonly<{ statuses: readonly IngestionStatus[] }>;` を定義してポートとアダプターの両シグネチャで使う。ブロッカーではない（実害は型の重複記述のみ）

#### Notes

- **[N-001]** 確立パターンへの忠実な追従が良い。usecase は `getIngestionJobs` と同じ構造（`ServiceArgs` / 境界での `UserId.create` / `unitOfWorkProvider.run` 経由の read）、adapter のエラー変換は `mapDbError` 経由、集計は同ファイルの `sumByteSizeByOwnerSince` と同じ `sql<number>` スタイルで一貫している。presentation に status 集合が漏れておらず、依存方向の違反なし。
- **[N-002]** 空 statuses の短絡（`ingestionJobRepository.ts:413`）は drizzle の `inArray` に空配列を渡すランタイムエラーを回避しつつ、ポート JSDoc（MUST resolve to 0 without touching the database）と統合テストの両方で契約として固定されている。設計として丁寧。
- **[N-003]** count クエリの `WHERE owner_id = ? AND status IN (...)` は既存の複合インデックス `idx_ij_owner_status`（`app/core/adapters/d1/schema.ts:528`）にそのまま乗る。ヘッダー表示ごとに発行されるクエリとして性能上の懸念なし。
- **[N-004]** plan ステップ 3 の「テスト用 in-memory フェイクへの `countByOwner` 追加」は実体なし（リポジトリ系フェイクは `docs/test.md` の方針で意図的に存在しない）。実装は real-DB の `countActiveIngestionJobs.integration.test.ts` で振る舞い検証しており、これはリポジトリ規約（「振る舞い検証は integration test に寄せる」）に合致した正しい逸脱。plan の文言が規約と食い違っていただけで、実装判断は妥当。
- **[N-005]** usecase 統合テスト（3 ケース）と adapter 統合テスト（4 ケース）は同じ DB 経路をなぞるため検証範囲がかなり重複するが、usecase 側は `ACTIVE_INGESTION_STATUSES` の集合（saved/failed/discarded を数えない）を契約として固定する役割があり、許容範囲。
- **[N-006]** バッジの fetch 失敗を 0 扱いで握りつぶすのは presentation 層（`IngestionQueueBadge.tsx`）の判断で、server-fn / usecase はエラーを正しく `errorResponseMiddleware` に流している。レイヤーごとの catch ポリシー（broad catch は境界のみ）に適合。

## 結論

担当レイヤーに Blocker なし。バックエンド 4 点（port / adapter / usecase / server-fn）は plan・ADR-003 の記載どおりで、JSDoc 契約・テストカバレッジ・依存方向・エラー契約のいずれも規約に適合。W-001 のみ型定義の整理余地あり。
