# PR #834 レビュー（Round 7）

## 対象

- PR: #834（Issue #468: source blob のストレージ衛生 — 保持ポリシー明文化と孤児 blob 回収）
- 観点: Test（テスト網羅性・テスト設計）。ゼロベースのフルレビュー（前ラウンドの結果は前提にしない）
- 検証方法: 追加・変更されたテストを全て精読し、PR head（dc61fac8）の worktree でローカル実行して確認
  - unit（対象ファイル）: `service.test.ts` / `sweepAbandonedSourceIntakes.test.ts` / `runPruneTick.test.ts` — 43 passed
  - unit（全体）: 298 files / 4518 tests passed
  - integration: `r2ObjectStorage` / `mediaAssetRepository` / `sweepAbandonedSourceIntakes` / `purgeOrphans` / `ingestion` / `handlers` — 計 98 passed
  - CI: Lint / Format / Typecheck / Unit tests は SUCCESS。Integration tests はレビュー時点で pending（ローカルで green を確認済み）
  - 変異実験: W-001 の主張（述語変異の生存）を実際に変異を注入して実証した（下記）

## 受け入れ基準とテストの対応

| AC | 担保 | 判定 |
|---|---|---|
| AC-1（保持ポリシー明文化） | ADR-001 + `spec/domains/media.md` 保持ポリシー節 + `docs/runtime_cloudflare.md` の手動リコンサイル手順。ドキュメント成果物（テスト対象外）、manual-test TC-006 で存在確認済み | 充足 |
| AC-2（put 成功・UoW ロールバック → 自動回収） | `ingestion.integration.test.ts`「reclaims the source blob after a commit rollback via sweep → purge」— pending 行 + blob 残存 → outbox 非漏出 → temp 保全 → 再 commit 非干渉 → sweep(swept:1) → purgeOrphans 1 回で blob + 行消滅までを実 DB で実証 | 充足 |
| AC-3（cron 配線） | `runPruneTick.test.ts`（呼び出し・sweep→purge 順序・双方向の失敗 swallow・他ステップ非阻害・outbox 失敗時の非実行・戻り値契約不変）+ `handlers.integration.test.ts` の 2-tick 実経路（container → D1 候補クエリ → 実 R2 delete のシーム検証） | 充足 |
| AC-4（grace window の誤回収防止） | sweep integration の 24h−1min スキップ（swept 側 24h+1min と対で `DEFAULT_GRACE_SEC` を境界ピン留め）、D1 integration の strict `<` 境界（cutoff 同値の除外）、handlers 2-tick テストの 1h fresh 行並置（tick デフォルト猶予の実経路検証、`graceSec: 0` 級の誤配線を検出）、per-row fresh ガード 3 アーム（attached 遷移・行消失・`updatedAt` 再スタンプ）の unit 変異注入 | 充足 |
| AC-5（既存フロー退行なし） | commit 正常系 / overwrite 差し替えの既存テストが metadata-first 化後も green（ローカル実行で確認）。temp 欠損 skip の check-before-insert 順序、put 失敗の row-before-put 順序は新テストが不変条件として固定。`uploadMedia` 系は型変更のみで、transport boundary の zod（`app/components/media/schema.ts` の `z.enum(["image","video","avatar"])`）は元から source 非許容 | 充足 |

`spec/testcases/media/index.md` の SweepAbandonedSourceIntakes 全 8 行、`spec/testcases/ingestion/index.md` の新 5 行（temp 欠損 / main UoW ロールバック / put 失敗 / 行消失 / 非 pending 遷移）は、いずれも実装テストと 1:1 で対応していることを確認した。

既知の見送り（adr.md「pruner 回収の運用強化」: purge スループット上限・malformed 行の listing 耐性・attach/re-stamp 経路の構造的封鎖・テンプレートパリティテスト）は再指摘していない。

### Test

#### Blockers

なし

#### Warnings

- **[W-001]** Round 6 Domain [W-001] 対応で新設された `MediaService.isAbandonedSourceIntake`（放棄判定ルールの単一ソース述語）に、ドメイン層の直接テストがない。
  - 場所: `app/core/domain/media/service.ts:97-108`（述語本体）/ `app/core/domain/media/__tests__/service.test.ts`（追加されたのは `listAbandonedSourceIntakes` の describe のみ）
  - 理由: 述語の 3 条件のうち `kind === 'source'` 分岐と strict `<` 境界は、既存のどのテストからも到達しない。sweep 経由では候補が SQL（D1）/ フェイク repo の source フィルタを通過済みのため、fresh ガードに非 source 行や cutoff 同値行が流れ込むテストが存在しない（D1 の strict `<` テストは SQL を、`service.test.ts` の strict テストは InMemoryRepo のフィルタ + cutoff 計算を検証しており、述語本体は検証しない）。**実証**: 述語から `kind === 'source'` を削除し `<` を `<=` に弱める複合変異を注入したところ、unit 全 4518 件・関連 integration 59 件（sweep / purgeOrphans / ingestion）がすべて green のまま通過した。`spec/domains/media.md` はこの述語を「放棄判定ルールの単一ソース」「sweep の per-row fresh ガードもこれを参照する」と契約化しており、ADR 記載の構造的封鎖の別 Issue もこの述語への依存を検討対象にしているため、契約と実装の乖離を検出できない状態は将来の呼び出し元に対して危うい。docs/test.md の「Domain: ~100% を狙う」方針にも沿わない。
  - 提案: `service.test.ts` に `MediaService.isAbandonedSourceIntake` の直接 describe を追加する（4 ケースで足りる: pending/source/猶予超過 → true、`updatedAt` が cutoff と同値 → false（strict `<` のピン留め）、pending/image の猶予超過 → false（ADR-004 のピン留め）、attached/source → false）。数行の追加で上記の変異がすべて検出可能になる。

#### Notes

- **[N-001]** 変異殺傷力が全体として非常に高いテスト設計。commit フローの順序不変条件（row-before-put / check-before-insert）はそれぞれ「順序を逆にするとこのテストが落ちる」形で固定され、`DEFAULT_GRACE_SEC` は 24h±1min の対で境界ピン留め、handlers 2-tick テストの fresh 行並置は tick 側の `graceSec` 誤配線を実経路で検出し、DataIntegrityError テストの `expect(uowRuns).toBe(3)` は変異フックが依存する UoW トポロジ自体をピン留めして silent rot を防いでいる。W-001 の述語だけが例外的な死角。
- **[N-002]** テストのレイヤー配分の判断が文書化されていて追跡可能: per-row 失敗分離と fresh ガードは「実 D1 経路では作為なしに再現できない」根拠込みで unit（フェイク変異注入）に配分（adr.md 実装時の追加決定）、2-tick + `updatedAt` バックデートの根拠も ADR に記録。各テストファイル冒頭のコメントが「なぜこの層でこれを検証するか」を明示しており、意図の erosion に強い。
- **[N-003]** `ObjectStorage.delete` の冪等性（missing key = 成功）という回収チェーンの構造的依存が、実 R2 アダプター（新規 `r2ObjectStorage.integration.test.ts`: 初回・再削除の両方）と in-memory フェイク（blob なし pending 行の purge 完走テスト）の両実装でピン留めされ、ポート JSDoc / spec と三点で揃っている。
- **[N-004]** ロールバック E2E テストが回収経路の実証に留まらず、outbox への `media.*` 非漏出・temp blob 保全・同一 job の再 commit 非干渉・生存ノートの source 無傷（誤回収なし）まで assert しており、AC-2 を「回収できる」と「回収してはいけないものに触れない」の両面から担保している。

## 総合

Blocker なし。回収チェーン（metadata-first → sweep → purge → cron 配線）の各シームは unit / adapter integration / application integration / worker integration の適切な層で検証され、plan のテスト方針・spec/testcases の全行と実装テストの対応も取れている。W-001（新設述語の直接テスト欠如）のみ、数行の追加で閉じられる実証済みの死角として指摘する。
