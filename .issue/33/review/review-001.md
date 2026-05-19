# PR Review #001 — fix(d1): eliminate inArray bind-limit risk in noteRepository

**PR:** #44
**Date:** 2026-05-18
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 16 (Infra: 6 / Test: 7 / Performance: 3)
- Notes: 15
- Verdict: **BLOCKED** (Warnings 反映が必要)

---

## Infrastructure (D1 / Drizzle Adapter)

#### Blockers
なし

#### Warnings

- **[W-INF-001]** `findReferrers` 同一 `updatedAt` ms タイブレーカが未テスト
  - 場所: `app/core/adapters/d1/repositories/noteRepository.ts:506-516`
  - 理由: T-bind-004 は seed の updatedAt が 1 秒間隔で全件一意のため、id 降順タイブレーカが実走しない
  - 提案: 同 ms を含むケースを追加（Test レビュー W-TEST-005 と統合）

- **[W-INF-002]** `buildVisibilityNotExistsPredicate` の `sql\`1\`` projection が型情報なし、`outboxRepository` の既存パターンと不整合
  - 場所: `app/core/adapters/d1/repositories/noteRepository.ts:472-477`
  - 理由: `outboxRepository.claimPending` は `select({ id: outboxEvents.id })` で実カラムを使う
  - 提案: `select({ noteId: publicationStates.noteId })` に変更

- **[W-INF-003]** `selectInChunks` がチャンク間直列で、`loadChildren` の Promise.all 並列効果が内側で打ち消される
  - 場所: `app/core/adapters/d1/repositories/_chunks.ts:36-40`
  - 理由: 500 件入力 → 6 チャンク × 3 テーブル並列で、各レーンが 6 直列 RTT
  - 提案: 内部を `Promise.all(chunks.map(runner))` に変更（順序保証は `Promise.all` で input 順保持）

- **[W-INF-004]** `_chunks.ts` の `push(row)` ループ意図が不明
  - 場所: `app/core/adapters/d1/repositories/_chunks.ts:38-39`
  - 理由: `out.push(...rows)` で 1 行短くなる。spread を避ける積極理由が無いなら統一すべき
  - 提案: W-INF-003 と合わせて `(await Promise.all(...)).flat()` で書き換え

- **[W-INF-005]** `inArray(col, [...chunk])` の spread 意図がコードから読み取れない
  - 場所: `app/core/adapters/d1/repositories/noteRepository.ts:218-233, 510-516`
  - 理由: drizzle の inArray が mutable array を要求する型回避だが、コメントが無い
  - 提案: `_chunks.ts` の JSDoc に補足、または無視（軽微）

- **[W-INF-006]** ADR-001 末尾「status filter 先行適用」のラショナル消失
  - 場所: `.issue/33/adr.md`
  - 理由: ADR-004 で削除した実装意図のトレースが失われる
  - 提案: ADR-001 Consequences に「status pre-filter 撤去の影響: 索引選択は planner 任せ」を 1 行追加

#### Notes
- N-INF-001〜006: `notExists` の SQL 単一化、`_chunks.ts` のエラー throw 戦略、early-return 二段防御、PendingBatch 無影響、progress.md の証跡、Promise.all 並列の型保証

---

## Test

#### Blockers
なし

#### Warnings

- **[W-TEST-001]** T-bind-001 / T-bind-002 が結果集合の同値性を未検証
  - 場所: `app/core/adapters/d1/__tests__/noteRepository.integration.test.ts:628-632, :667`
  - 理由: `toHaveLength(N)` だけで、id 重複や別 100 件の混入を検出できない
  - 提案: `expect(new Set(found.map(n => n.id))).toEqual(new Set(expectedIds))` を追加

- **[W-TEST-002]** T-bind-003 が `noteInternalLinks` の chunk 経路を踏まない
  - 場所: 同上 `:675-722`
  - 理由: `loadChildren` 3 並列のうち `noteInternalLinks` 経路だけ未検証
  - 提案: 各 note から 1 件の internalLink を seed し `internalLinks.length === 1` を assert

- **[W-TEST-003]** `nextId` counter が 65535 超で文字列順序が崩れる潜在問題
  - 場所: 同上 `:28-34`
  - 理由: padStart 4 桁 → 5 桁化で UUID 形式破綻
  - 提案: 桁数拡大 or JSDoc 警告（軽微、現状到達せず）

- **[W-TEST-004]** `seedManyNotes` の slug 生成意図が不明
  - 場所: 同上 `:569`
  - 理由: `id.slice(9, 13)` 利用の理由がコメント無し
  - 提案: `\`bulk-\${i}\`` に簡素化

- **[W-TEST-005]** T-bind-004 の id 降順タイブレーカが未検証
  - 場所: 同上 `:727-758`
  - 理由: updatedAt が全件一意で第二キー sort が実走しない
  - 提案: 同 ms 複数件を含む variant 追加（W-INF-001 と統合）

- **[W-TEST-006]** `_chunks.test.ts` で runner reject 後の chunk 停止契約が未検証
  - 場所: `app/core/adapters/d1/repositories/__tests__/_chunks.test.ts`
  - 理由: partial failure 時の挙動契約は呼出側保証として重要
  - 提案: reject 後の chunk が呼ばれないことを assert するテスト追加

- **[W-TEST-007]** `db.batch` キャストの safety が将来可変化で壊れる
  - 場所: integration test 内 batch 呼出箇所
  - 理由: 空配列詐称キャストが入り得る
  - 提案: 軽微、現状の固定 count では問題なし

#### Notes
- N-TEST-001〜006: 1 statement 1 row 守備、progress.md の証跡、ADR-004 canary 品質、境界条件カバレッジ、JSDoc 責務分離、テスト ID 命名一貫性

---

## Performance

#### Blockers
なし

#### Warnings

- **[W-PERF-001]** `selectInChunks` がチャンク間並列でない（W-INF-003 と同一）
  - 場所: `app/core/adapters/d1/repositories/_chunks.ts:36-40`
  - 理由: D1 RTT が直列累積し、`loadChildren` 並列効果を相殺
  - 提案: Promise.all 並列化

- **[W-PERF-002]** `findReferrers` がページネーション無しで全件メモリ展開
  - 場所: `app/core/adapters/d1/repositories/noteRepository.ts:534-563`
  - 理由: 本 PR で chunk 化したが、unbounded fan-out の本質問題は残る
  - 提案: ADR-003 に follow-up Issue として明記（実装は別 Issue）

- **[W-PERF-003]** `for...push` ループの GC 圧（軽微）
  - 場所: `app/core/adapters/d1/repositories/_chunks.ts:38-40`
  - 理由: W-INF-004 と同根
  - 提案: W-INF-003 / W-PERF-001 の並列化と合わせて `flat()` で解決

#### Notes
- N-PERF-001〜004: owner sweep 削除の I/O 効果、NOT EXISTS の PK lookup 最適性、3 並列維持の設計判断、seed の bind-safe 設計

---

## Design Decisions

このラウンドで見つかった設計判断:

- **チャンク間並列化**: `selectInChunks` を逐次 await から `Promise.all` 並列に切り替える。D1 read のレイテンシ削減と `loadChildren` の Promise.all 3 並列効果を内部でも保つため。順序は `Promise.all` で input 順保持される性質に依拠
- **`sql\`1\`` → 実カラム参照**: `outboxRepository.claimPending` の既存パターンに揃え、subquery が「相関」していることを読み手に明示
- **`findReferrers` unbounded**: chunk 化で bind-limit は解消したが、結果集合が無制限である本質問題は別 Issue 化（Phase 4 で起票候補）
