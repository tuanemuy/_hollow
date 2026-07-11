# Review 009 — Test（テスト網羅性・テスト設計）

対象: PR #834 (Issue #468) / ゼロベースフルレビュー
方法: `gh pr diff 834` 全差分精読、`.issue/468/plan.md` の受け入れ基準・テスト方針との突合、追加・変更テスト全ファイル精読、既存テスト（ingestion 正常系 / overwrite / dispatchDomainEvent skip guards）と transport 境界（`app/components/media/schema.ts`）の現物確認。

## 受け入れ基準 × テストの突合

| AC | 担保 | 判定 |
|---|---|---|
| AC-1（ポリシー明文化） | `adr.md` ADR-001 + `spec/domains/media.md` 保持ポリシーセクション（ドキュメント成果物） | ✅ |
| AC-2（rollback → 自動回収） | `ingestion.integration.test.ts`「reclaims the source blob after a commit rollback via sweep → purge」— put 成功 → main UoW ロールバック → pending 行 + blob 残存 → sweep(orphan 化) → purgeOrphans 1 回で blob + 行の消滅まで実 DB で実証。put 失敗側も「leaves a reclaimable pending row and no blob」で回収完走まで実証 | ✅ |
| AC-3（cron 配線） | `runPruneTick.test.ts`（呼び出し・順序 sweep→purge・失敗 swallow・他ステップ非阻害・戻り値契約不変）+ `handlers.integration.test.ts` 2-tick 実 DB テスト（container → D1/R2 実経路） | ✅ |
| AC-4（猶予内の誤回収なし） | sweep integration「skips ... inside the grace window (24h − 1min)」（デフォルト猶予の境界ピン留め）+ handlers integration の in-grace 2 本目行（tick が `graceSec: 0` 誤配線なら fail する設計）+ E2E 内の attached 行非対象 assert | ✅ |
| AC-5（既存フロー退行なし） | commit 正常系（sourceFileId 束縛・attached・temp delete）/ overwrite 旧 source orphan 化（#452）の既存テストは差分で無変更のまま残存。`UploadableMediaKind` 化は transport スキーマ（`z.enum(["image","video","avatar"])`、source 非含有）と typecheck で構造的に整合 | ✅ |

`spec/testcases/media/index.md` の SweepAbandonedSourceIntakes 8 行、`spec/testcases/ingestion/index.md` の追加 5 行（temp 欠損 / rollback / put 失敗 / 行消失 / 非 pending 遷移）は、いずれも対応する実装テストに 1:1 で存在することを確認した。unit / integration の分担（fresh ガード・再スタンプ再検査・per-row 失敗分離 = フェイク注入 unit、それ以外 = 実 DB integration）は adr.md の実装時決定どおりで、`docs/test.md` の「振る舞い検証は integration に寄せる」方針とも矛盾しない（フェイクはテストローカルで、在庫 fakes には追加していない）。

### Test

#### Blockers

なし

#### Warnings

- **[W-001]** `media.orphaned` の dispatch skip 契約が実行可能な形でピン留めされていない。
  - 場所: `app/core/application/workers/__tests__/dispatchDomainEvent.test.ts`（「skipped regression guards」describe）
  - 理由: plan のリスク項「`media.orphaned` イベントの新規発火点 … `dispatchDomainEvent` は `media.*` を skip するため consumer 側影響なし（確認済み）」の「確認」は目視のみ。本 PR により `media.orphaned` は cron 駆動で無人・定常的に outbox → relay → consumer に流れるようになるが、skip 保証をピンするテストは `media.uploaded`（クラス代表）と `share_link.*` のみで、`media.orphaned` 自体の guard がない。なお `media.orphaned` の dispatch 到達自体は #468 以前から存在する経路（overwrite / reconcile の decrement）であり、クラス代表 guard も既在のため、影響度は低い。
  - 提案: 既存の skipped-regression-guards describe に `MediaEvents.orphaned` を流して `{ kind: "skipped" }` を assert する 1 テストを追加する（既存ハーネス流用で数行）。本 PR で対応しない場合も許容範囲。

#### Notes

- **[N-001]** 境界値の押さえ方が模範的。strict `<` 境界を、ドメイン述語（`isAbandonedSourceIntake`: cutoff 一致 → false）、D1 SQL（`updatedAt == cutoff` 除外）、運用デフォルト（24h−1min skip / 24h+1min sweep のペアで `DEFAULT_GRACE_SEC` の縮小 typo を検知）の 3 層でそれぞれ独立にピン留めしている。tie-break（`updatedAt` 同値 → `id` 昇順）も limit 跨ぎで検証し、ポート契約として fake（service.test の InMemoryRepo / unit の MutableFakeRepo）にも同一順序を実装している。
- **[N-002]** `r2ObjectStorage.integration.test.ts` の新設は的確。`ObjectStorage.delete` の冪等性（missing key = 成功）は回収チェーンが構造的に依存する契約だが、アプリ層テストは in-memory fake でしか踏まない — 実 R2 アダプター（miniflare binding）に対する契約ピンで fake/real 乖離の穴を塞いでいる。
- **[N-003]** `handlers.integration.test.ts` の 2-tick テストに in-grace の 2 本目 pending/source を同居させた点が良い。tick がオプション上書きなしのデフォルト猶予で走ることを実 DB 経路で保証し、`graceSec: 0` 誤配線という現実的な退行モードを直接検知できる（AC-4 の本番経路検証）。
- **[N-004]** DataIntegrityError 2 テストの UoW 実行回数フック（`uowRuns === 3` で行を変異）は usecase 内部の UoW トポロジーに結合するが、`expect(uowRuns).toBe(3)` で当のトポロジー自体をピンしているため、構造変更時はサイレントに素通りせず必ず fail する。境界（container seam）での介入という点で既存パターンとも整合しており、許容できる設計。
- **[N-005]** 失敗系テストの assert が「例外の種類」だけでなく「残存状態の完全な形」（pending 行の kind/status、blob の有無、note/job の不変、outbox の `media.*` 不漏出、temp blob の保全と再 commit 可能性）まで踏み込んでおり、回収チェーンの前提となる不変条件を回帰検知可能な形で固定している。

## 既知の見送り（再指摘しない）

adr.md「pruner 回収の運用強化」記載の purge スループット上限・malformed 行の listing 耐性（`.filter(isPending)` のサイレント drop を含む再水和系）・attach/re-stamp 経路の構造的封鎖・テンプレートパリティテストは、別 Issue 対応の記録を確認済みのため対象外とした。
