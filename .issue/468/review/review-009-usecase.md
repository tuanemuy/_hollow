# Review 009 — Use Case（ゼロベース・フルレビュー）

対象: PR #834（Issue #468: source blob のストレージ衛生）
観点: アプリケーション層（ユースケースのオーケストレーション、UoW 境界、エラー契約、ポート利用、受け入れ基準の充足）。前ラウンドの結果は前提にせず、diff・実装（`commitIngestionPreview.ts` / `sweepAbandonedSourceIntakes.ts` / `purgeOrphans.ts` / `handlers.ts`）・spec・テスト・transport スキーマを一次情報として再検証した。

## 受け入れ基準の検証結果

| AC | 判定 | 根拠 |
|---|---|---|
| AC-1 | 満たす | 保持ポリシー（TTL なし・Note ライフサイクル連動・二重猶予 24h+24h・再検討トリガー）が `.issue/468/adr.md` ADR-001 と `spec/domains/media.md` 冒頭の「保持ポリシー」セクションに明文化。手動リコンサイル手順も `docs/runtime_cloudflare.md` に運用ノートとして着地 |
| AC-2 | 満たす | metadata-first（小 UoW で pending 行 → put → main UoW で `findById → isPending ガード → markAttached`）により「行なし blob」が構造的に発生しない。`ingestion.integration.test.ts` の「rollback → pending 残存 → sweep → purge → blob+行消滅」E2E、put 失敗（blob なし行）の回収完走、temp 欠損時に stray 行を残さない ordering の 3 経路が回収の自動性を実証 |
| AC-3 | 満たす | `runPruneTick` 末尾に `sweepAbandonedSourceIntakes` → `purgeOrphans` を独立 best-effort try/catch で配線（未配線だった `purgeOrphans` の spec 乖離を解消）。順序・失敗分離・戻り値契約不変は `runPruneTick.test.ts`、container → D1/R2 実経路は `handlers.integration.test.ts` の 2-tick テストで検証 |
| AC-4 | 満たす | strict `<` cutoff + デフォルト猶予 24h。境界近傍（24h−1min）スキップの integration テスト、fresh ガード 3 態様（attach 遷移・`updatedAt` 再スタンプ・行消失）の unit テスト、tick がデフォルト猶予で走ることを in-grace 行（1h-old）の 2-tick 生存で検証する handlers integration テストが揃う |
| AC-5 | 満たす | commit 正常系のイベント収集は旧実装と同一（`markAttached` の drafts のみ collect。`MediaAsset.create` の drafts は旧実装でも destructure で落としていた）。overwrite 差し替え・temp delete・`purgeOrphans` 本体は無変更。`uploadMedia` / `uploadMediaPresigned` は型絞り込み（`UploadableMediaKind`）と JSDoc 修正のみで、transport スキーマ（`z.enum(["image","video","avatar"])`）が元々 source を通さないため実行時挙動も不変。失敗 commit 後の同一 job 再 commit が放棄行に干渉されないことまでテスト済み |

### Use Case

#### Blockers

なし

#### Warnings

なし

- 検討のうえ棄却した候補（粗探しではなく判断根拠として記録する）:
  - `purgeOrphans` の per-row fresh ガードが cutoff を再検査しない非対称（sweep は `isAbandonedSourceIntake` で再検査する）: orphan / deleting 行の `updatedAt` を状態遷移なしに再スタンプする経路が存在しない（`reconcileRefs` は orphan/deleting を拒否、`markDeleting` は状態ごと変える）ため、状態ガードだけで十分。かつ `purgeOrphans` は本 PR で「変更なし（配線のみ）」が計画上の合意。
  - sweep のスループット上限（日次 1 tick × batch 100）と malformed 行による候補列挙の全体 throw: adr.md「pruner 回収の運用強化」で別 Issue 送りが記録済みの既知の見送り。
  - 候補列挙 → per-row UoW 間の残余窓での reconcileRefs / updateProfile / finalizeUpload 経由 attach・re-stamp: 同上（構造的封鎖は別 Issue）。本 PR は sweep JSDoc と `PendingMedia` JSDoc に残余リスクと許容根拠を正確に記述しており、見送りの条件（実態に合わせた文書化）を満たしている。
  - 失敗 commit の放置・連打で pending 行 + blob が試行回数分蓄積する点: ADR-002 Consequences に明記済みの許容（sweep が定期回収、1 件あたりアップロード上限で拘束）。

#### Notes

- **[N-001]** AC-2 の核心である「回収不能状態を作れなくする」が、補償処理の追加ではなく操作順序の再設計（row-before-bytes）で達成されている。CLAUDE.md の「アプリケーションレベルの補償トランザクションを持たない」方針と整合し、失敗時の後始末が sweep → purge という単一の既存経路に一本化されている。main UoW 側の `findById → isPending` ガードが null / 非 pending を `SystemError(DataIntegrityError)` で fail-loud にする判断（黙って `sourceFileId` を落とさない）も、integration テスト 2 本（行消失・非 pending 遷移）で UoW 全体ロールバックまで検証されており適切。
- **[N-002]** `sweepAbandonedSourceIntakes` の per-row fresh ガードが、状態チェック（`isPending`）だけでなく `MediaService.isAbandonedSourceIntake` による cutoff 再検査まで行っている。計画（ステップ 5）が要求した「pending/source ガード」を超えて、`finalizeUpload` 型の `updatedAt` 再スタンプ（= 回収先送りシグナル）を fresh 読みでも尊重する実装になっており、放棄判定ルールがドメインサービスの単一関数に集約されている（list とpredicate が同一ルールの 2 表現であることが JSDoc で明示）。unit テストの変異注入 3 態様がこのガードを直接叩いている。
- **[N-003]** `UploadableMediaKind`（`Exclude<MediaKind, "source">`）により、ADR-004 の安全前提「pending source は commit フローでのみ誕生する」がアップロード系エントリポイントで型レベル強制になった。transport スキーマ（`app/components/media/schema.ts` の `z.enum(["image","video","avatar"])`）と応用層の型が一致し、境界検証と静的型の二重防御という CLAUDE.md の入力検証方針どおり。
- **[N-004]** 入力由来 VO 構築のステージ (a) 前への hoist（前ラウンド W-001 の反映）が完全で、`spec/usecases/ingestion.md` 処理フロー 0 として文書化され、「malformed title → pending 行なし・put 呼び出しなし・temp/job 無傷」の専用回帰テストで ordering が固定されている。temp 欠損 skip 判定 → 行 insert → put の順序も同様にテストで pin されており、この関数の副作用順序はすべてテストが守っている。
- **[N-005]** sweep は objectStorage に一切触れない純 DB ステップとして設計されているため、R2 設定欠落時でも orphan 化（回収チェーンの前進）自体は止まらない。tick 配線は既存の「独立 try/catch + swallow + ログ」パターンを踏襲し戻り値契約を変えず、sweep → purge の順序が「1 tick で 1 段ずつ進む」二重猶予の意味論と一致している。concurrent 実行（tick 重複・commit との競合）も fresh ガードと OCC（job save の expectedVersion）で安全に収束する。
- **[N-006]** `SourcePersist` を `{ mediaId: MediaAssetId }` に縮小した実装時判断（真実を DB 行に一本化、branded 型でキャスト不要）は、read-modify-write 化した main UoW と整合的で、metadata の二重運搬による曖昧さを排除している。adr.md「実装時の追加決定」に記録済み。
