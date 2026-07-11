# PR #834 レビュー — Round 10

## 対象

- PR: #834（Issue #468: source blob のストレージ衛生）
- 観点: Domain
- 方式: ゼロベースのフルレビュー（前ラウンドの結果を前提にしない）

## 検証手順

- `gh pr diff 834` の全差分を取得し、ドメイン層（`app/core/domain/media/` の entity / service / ports / tests）と `spec/domains/media.md` を精読
- `.issue/468/plan.md` の受け入れ基準（AC-1〜AC-5）のうち Domain レイヤーに関わるものを実装と突き合わせ
- ドメイン契約の消費側（`commitIngestionPreview` / `sweepAbandonedSourceIntakes` / D1 リポジトリ / R2 アダプター / transport schema）まで追跡して契約と実装の一致を確認

### 受け入れ基準の検証（Domain 関連）

| AC | 判定 | 根拠 |
|---|---|---|
| AC-1（保持ポリシーの明文化） | 満たす | `spec/domains/media.md` に「保持ポリシー（source, Issue #468 ADR-001）」セクションが追加され、対象・保持・回収契機（overwrite / note purge / intake 放棄）・二重猶予（24h+24h）・再検討トリガーが ADR-001 と一致した内容で明文化されている |
| AC-2（自動回収のドメイン部品） | 満たす | 新しい状態・イベントを増やさず、既存の `decrementRef(pending) → orphan` 遷移（entity.ts:143-156、「Intake abandoned」としてドキュメント済み）を再利用。ポート `findAbandonedSourceIntakes` + サービス `isAbandonedSourceIntake` / `listAbandonedSourceIntakes` が回収候補の抽出ルールをドメイン内側で定義 |
| AC-4（grace window の誤回収防止） | 満たす | 放棄判定は `pending ∧ kind='source' ∧ updatedAt < now − graceSec`（strict `<`）が `MediaService.isAbandonedSourceIntake` に単一ソース化され、境界（cutoff 同時刻 → false）・kind 除外・attached 除外が `service.test.ts` でピン留め。sweep の per-row fresh ガードも同じ述語を再適用（`sweepAbandonedSourceIntakes.ts:82-87`）。D1 実装の `lt(updatedAt, cutoff.toISOString())`（ISO 8601 ms 精度・辞書順=時系列）とインメモリフェイクの `getTime() <` は strict 性・精度とも一致 |

### 検証した消費側の契約整合

- **D1 `findAbandonedSourceIntakes`**: SQL フィルタ（`status='pending' AND kind='source' AND updated_at < ?`）・順序（`updatedAt ASC, id ASC`）がポート JSDoc の契約（oldest-first + id タイブレーク）と一致。`PendingMedia[]` への絞り込みは cast ではなく `filter(MediaAsset.isPending)` による静的 narrowing。
- **`ObjectStorage.delete` の冪等性契約**: R2 アダプターの `delete` は `bucket.delete` 失敗時のみ `StorageUnavailableError`（missing key で throw しない）で契約と一致。新設の `r2ObjectStorage.integration.test.ts` が実バインディングで「missing key = 成功」「二重 delete = 成功」をピン留め。`spec/domains/media.md` のエラーケースも「`StorageNotFoundError`（get / stat のみ）」に修正済み。
- **`UploadableMediaKind = Exclude<MediaKind, "source">`**（uploadMedia.ts）: ADR-004 の安全前提「pending source を作るのは commit フローだけ」のうちアップロード入口 2 本を型レベルで封鎖。transport boundary（`app/components/media/schema.ts` の `z.enum(["image", "video", "avatar"])`）が実行時にも同じ集合を強制していることを確認 — 型の主張が boundary validation に裏打ちされている。
- **`media.orphaned` の新規発火点**（sweep 起点）: `dispatchDomainEvent` が `media.*` を skip する既存方針のまま、skip 回帰ガードのテストが追加されている。

## レビュー結果

### Domain

#### Blockers

なし

#### Warnings

なし

#### Notes

- **[N-001]** 設計の最小性が良い。metadata-first 化（`prepareSourcePersist` の小 UoW → put）は「blob は誕生時点から必ず DB 行を持つ」不変条件の回復を、新しい状態・イベント・遷移を一切足さずに達成している。「intake 放棄 → orphan」はエンティティに以前からドキュメントされていた `decrementRef(pending)` 遷移をそのまま使い、回収は既存 purge 機構に一本化 — ドメインの状態機械が変更前後で同一なのは ADR-002 の意図に忠実。
- **[N-002]** `MediaService.isAbandonedSourceIntake` の設計判断が的確。放棄判定ルール（`pending ∧ kind='source' ∧ strict <`）を単一関数に集約し、一括クエリ（`listAbandonedSourceIntakes`）と sweep の per-row fresh ガードの両方が同じルールを参照する構造。戻り値を型述語ではなく `boolean` にした理由（値条件を含むため false 分岐の narrowing が不健全になる）が JSDoc に明記されており、型安全性の判断として正しい。strict `<` 境界は unit テストで cutoff 同時刻 = false までピン留めされている。
- **[N-003]** ポート契約の精度が高い。`findAbandonedSourceIntakes` が `readonly PendingMedia[]` を返すことで「pending しか返らない」を型で表明し、oldest-first + id タイブレークまで JSDoc で契約化（同一秒に生まれた行の limit 跨ぎ決定性の根拠付き）。`service.test.ts` のインメモリフェイクも同じ順序契約を実装しており、フェイクと実装の挙動乖離を防いでいる。`runExportJob` の null-repo スタブへの追随も漏れなし。
- **[N-004]** `PendingMedia` の JSDoc に「`kind='source'` では `updatedAt` が放棄判定のアンカーであり、re-stamp は回収を先送りする」と書かれたことで、別 Issue に切り出された finalizeUpload の re-stamp 問題が型定義から発見可能になっている。既知の見送り（reconcileRefs / updateProfile / finalizeUpload の構造的封鎖）についても、sweep の JSDoc が残余窓の存在と許容根拠を隠さず記述しており、契約と実態が一致している。
- **[N-005]** `spec/domains/media.md` の同期が丁寧。保持ポリシーセクション（AC-1）に加え、`isAbandonedSourceIntake` / `listAbandonedSourceIntakes` / `findAbandonedSourceIntakes` の spec 追記が実装のルール（strict `<`・kind 限定・戻り型 `PendingMedia[]`・猶予=ドメインルール/アダプター=フィルタのみという責務分割）と正確に一致している。なお `listAbandonedSourceIntakes` の spec シグネチャが `limit`（実装のデフォルト 100）を省略しているのは、隣の `listPurgeCandidates` の既存記法に揃えたもので乖離ではない。

## 結論

Blockers 0 / Warnings 0。Domain レイヤーに関わる受け入れ基準（AC-1, AC-2/AC-4 のドメイン部品）はすべて実装で満たされており、ドメイン契約（状態機械・ポート・サービスルール・spec）と消費側実装の不一致は見つからなかった。
