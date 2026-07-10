# PR #834 レビュー — Test（テスト網羅性・テスト設計）

対象: Issue #468「source blob のストレージ衛生」 / head `issue/468/source-storage-hygiene`
参照: `.issue/468/plan.md`（受け入れ基準 AC-1〜AC-5・テスト方針）、`.issue/468/adr.md`、`docs/test.md`

## 受け入れ基準とテストの対応（検証結果）

| AC | 担保状況 | 根拠テスト |
|---|---|---|
| AC-1（ポリシー明文化） | OK（ドキュメント。manual TC-006 で確認済み） | — |
| AC-2（put 成功・UoW ロールバック → 自動回収） | OK（E2E 実証あり）。ただし「put 失敗」側の経路に穴 → **B-001** | `ingestion.integration.test.ts:736` |
| AC-3（cron 配線） | OK | `runPruneTick.test.ts:300`（順序・分離）+ `handlers.integration.test.ts:558`（実 DB 2-tick） |
| AC-4（grace window の誤回収防止） | OK | sweep integration「skips … inside the grace window」+ 域界 strict `<` テスト（domain / adapter 両層） |
| AC-5（既存フロー非退行） | OK | commit 正常系 / #452 source 束縛 / overwrite 差し替え（`ingestion.integration.test.ts:1214`）が green のまま維持 |

### Test

#### Blockers

- **[B-001]** metadata-first の核心不変条件「blob は誕生時点から必ず DB 行を持つ」のうち、**put 失敗経路が `commitIngestionPreview` を通しては一切テストされていない**（row-before-put の順序が無テスト）
  - 場所: `app/core/application/ingestion/__tests__/ingestion.integration.test.ts:736`（rollback E2E はあるが put 失敗経路がない）/ `app/core/application/ingestion/commitIngestionPreview.ts:444-464`（無防備な順序依存）
  - 理由: ADR-002 の設計は「pending 行の save → `safeStoragePut`」という**実行順序**にのみ依存して成立している。既存テストを全部走らせても、この順序を逆転させる回帰（例: 「put 失敗時に無駄な行が残るのを避ける」つもりの善意のリファクタで put を先に移動）は**どのテストも落とさない** — rollback E2E は put が成功するケースなので順序が逆でも green のまま。順序が逆転すると put 失敗時に「行なし blob」という Issue #468 の元バグが静かに復活する。sweep integration の「blobless pending row」テスト（`sweepAbandonedSourceIntakes.integration.test.ts:197`）は行を直接 seed しており、**回収側**の担保にしかならず、**生産側**（commit が put 失敗時に pending 行を残すこと）は担保しない。`spec/usecases/ingestion.md` がステージ (a) を metadata-first と明記した以上、これは spec 化された観測可能挙動であり、テストの裏付けが要る。
  - 提案: `ingestion.integration.test.ts` の commit describe に1本追加する。`purgeOrphans.integration.test.ts:124` の `ThrowingObjectStorage`（container の `objectStorage` を throw するラッパーに差し替える確立済みパターン）を流用し、(1) `commitIngestionPreview` が reject する（`safeStoragePut` は `SystemError(ExternalApiError)` に変換して rethrow）、(2) `media_assets` に `pending/source` 行が1件残る、(3) note・job は未変更（job は `previewing` のまま）、(4) blob は存在しない、を assert。続けて sweep → purge で行が消えることまで繋げば spec/testcases/media の「blob なし pending/source（put 失敗相当）」行が実経路で閉じる。

#### Warnings

- **[W-001]** `listAbandonedSourceIntakes` の limit テストが「通るだけ」のアサーションになっている
  - 場所: `app/core/domain/media/__tests__/service.test.ts:364-376`
  - 理由: 候補3件・limit 2 で `expect(result.length).toBeLessThanOrEqual(2)` は、limit 委譲が壊れて 0 件返る回帰（例: limit に 0 や graceSec を誤って渡す）でも green になる。上限しか検査しない limit テストは委譲検証として実効性がない（既存 `listPurgeCandidates` の同型テスト（:312-326）からのコピーだが、新規追加分は直せる）。
  - 提案: `expect(result).toHaveLength(2)` に強める。アダプター側の同テスト（`mediaAssetRepository.integration.test.ts:180`）は既に `toHaveLength(2)` なので、揃えるだけでよい。

- **[W-002]** rollback E2E が「temp blob が保全され commit をリトライできる」ことを assert していない
  - 場所: `app/core/application/ingestion/__tests__/ingestion.integration.test.ts:777-791`
  - 理由: main UoW ロールバック後、ユーザーの回復経路は「同じ job を再 commit」であり、その前提は temp blob の残存（temp delete は UoW 成功後にのみ走る）。テストは job が `previewing` のままであることは assert するが temp blob の残存は見ていない。temp delete を `finally` に移す・UoW 前に移すといった回帰（放棄 intake だけでなく**原本まで**失うデグレ）を検知できない。
  - 提案: 失敗 commit の直後に `tempStorage.has(tempKey)` が `true` であることを1行 assert する（同ファイルの正常系テスト :659-662 と同じ手口の反転）。

#### Notes

- **[N-001]** strict `<` 境界が3層すべてで明示的に検証されている: domain（`service.test.ts:330-350` cutoff ちょうどの排除）、adapter（`mediaAssetRepository.integration.test.ts:198` `updatedAt == cutoff` 排除の専用テスト）、そして sweep → purge 連鎖テストは全箇所でクロックを前進させてから次段を呼んでおり、plan のレビュー指摘（同時刻フレーク）が漏れなく反映されている。クロックは `withFixedClock` / 固定 `Date` でピン留めされ、実時間依存は `handlers.integration.test.ts` の 25h バックデート（1h マージン）のみで、フレーク窓は実質ゼロ。

- **[N-002]** 二重実行の担保の分担が正しい: integration はクエリレベル冪等（orphan 化済み行が候補に載らない）を検証しつつ、「この経路では fresh ガードは exercise されない」ことをコメントで明示（`sweepAbandonedSourceIntakes.integration.test.ts:140-144`）し、候補列挙〜per-row UoW 間の遷移（attached 化・削除）と per-row 失敗分離は unit の変異注入（`sweepAbandonedSourceIntakes.test.ts`）で別途担保。実 D1 で作為なく再現できない分岐だけを file-local フェイクに逃がす判断は ADR に記録されており、`docs/test.md` の「fake は在庫しない（共有 fakes は2つのみ）」とも矛盾しない。

- **[N-003]** `runPruneTick.test.ts` の失敗分離マトリクスは網羅的（sweep 失敗 → purgeOrphans 続行、purgeOrphans 失敗 → tick 完走、outbox 失敗 → 新2ステップ含め未実行、順序 sweep < purgeOrphans、戻り値契約不変）。さらに unit がモックで塞ぐ container → adapter シームは `handlers.integration.test.ts:558` の 2-tick + `updatedAt` バックデートが実 D1/R2 で閉じており、プロダクションコードにテスト用オプションを増やさない選択（ADR 記載）も適切。

- **[N-004]** spec/testcases と実テストが 1:1 で同期している: `spec/testcases/media/index.md` の SweepAbandonedSourceIntakes 表7行はすべて対応する実テストを持ち（4行は integration ①〜⑥、save 失敗行は unit）、`spec/testcases/ingestion/index.md:47` の rollback 行は E2E テストに対応。テストファイル側にも spec アンカーコメントがある。B-001 のテストを足す際、「blob なし pending/source（put 失敗相当）」行の記述を「実経路（commit の put 失敗）でも検証」と更新するとなお良い。

- **[N-005]** アダプターテストの除外集合が丁寧: `findAbandonedSourceIntakes` に対し fresh pending/source・old pending/image・attached/orphan の source を1つのテストで並べて負例を張っており、status/kind 二軸のフィルタ漏れを単独で検知できる。並び順の `id ASC` タイブレーク（同一 `updatedAt`）だけは未検証だが、バッチが毎 tick 再列挙される設計上、挙動影響はないため指摘対象とはしない。
