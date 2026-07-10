# PR #829 レビュー（Frontend 観点）— round 1

**対象 PR:** #829
**Issue:** #805（可変単位バイト整形ヘルパ `formatBytes` の重複を共有 util に集約）
**レビュー日:** 2026-07-10
**判定:** APPROVED（Blocker なし）

---

## 検証したこと（実コードと突き合わせ）

- **共有 `formatBytes` とコピー元の1文字一致**
  - `app/components/common/byteSize.ts:32-42` の実装本体は、削除された Dashboard/Metrics のローカル版と `export` 接頭辞を除いて完全一致（`null→"—"`, `0→"0 B"`, `units = ["B","KB","MB","GB","TB"]`, `i = Math.min(units.length-1, Math.floor(Math.log(value)/Math.log(1024)))`, `scaled = value/1024**i`, `` `${scaled.toFixed(scaled >= 100 || i === 0 ? 0 : 1)} ${units[i]}` `` ）。桁ルール `scaled>=100||i===0?0:1` は保存されている。
  - `—` は hexdump で `e2 80 94`（U+2014 EM DASH）を確認。テスト期待値 `byteSize.test.ts:36` の `toBe("—")` も同じく `e2 80 94` で固定されており、EN DASH / ハイフンへの取り違えなし。
- **`number → number | null` の型安全性・出力不変**
  - AccountDeleteForm は `formatBytes(impact.mediaTotalBytes)`（`index.tsx:138`）で `number`（DTO の非 null フィールド）を `number | null` 引数へ渡す。`number` は `number | null` の部分型なので安全な代入。非 null のため null 分岐に入らず出力不変。`pnpm typecheck`（tsgo）はクリーン。
  - 旧 AccountDeleteForm は null 分岐を持たなかったが、共有版が先頭に `if (value === null)` を追加しても number 入力には無影響。
- **import 記法・エイリアス・未使用残留**
  - 3ファイルとも `import { formatBytes } from "@/components/common/byteSize"` を追加し、既存の `@/components/...` エイリアス記法と一致。Biome の import 整列順（Dashboard: byteSize→dateFormat、Metrics: AdminTableSkeleton→byteSize→Icon、AccountDeleteForm: auth/links→common/byteSize→common/Icon）も維持。
  - ローカル `formatBytes` 定義は3ファイルとも完全削除。`grep` で残留する `function formatBytes` は共有版と据え置いた ExportJobDetail のみ。未使用 import / 未使用関数の残留なし。`biome lint` は5ファイルすべてクリーン。
  - `formatNumber` 等の他ヘルパは無変更で引き続き利用されている。
- **JSDoc 品質と provenance 引き継ぎ**
  - 新 `formatBytes` の JSDoc（`byteSize.ts:16-31`）は単位列・桁ルール・`null→"—"`・`0→"0 B"`・TB clamp を正確に記述。「Humanizing a raw byte total is a presentation concern (#573); ... (extracted in #799)」で AccountDeleteForm から `#573` provenance を、出自 `#799` とともに正しく引き継いでいる（plan step4 / arch-risk [S-002] の意図どおり、参照を宙に浮かせていない）。
  - 隣接 `formatMegabytes` の JSDoc も更新済み（`byteSize.ts:7-10`）。旧文言の "variable-unit `formatBytes` **family**" と TB 欠落の "B/KB/MB/GB" 列挙を削除し、`{@link formatBytes}` 単数参照＋「two-function set」表現に修正（arch-risk [S-001] の意図どおり）。単位列挙は正確な `formatBytes` 側 JSDoc へ移動しており、TB 欠落の不整合は解消。CLAUDE.md の library-level JSDoc / コメント規約に沿う。
- **ADR-001 の据え置き判断とスコープ**
  - `export/ExportJobDetail/index.tsx:40-46` は B(整数)→KB(1桁)→MB(**2桁**)、GB/TB なしのローカル版を維持。`ingestion/IngestionJobRow.tsx:182` は `(job.byteSize / 1024).toFixed(1)} KB` の固定 KB を維持。いずれも共有版と出力ポリシーが異なり、寄せれば表示が変わるため据え置きは妥当。スコープ逸脱なし。
- **静的検査・テスト**
  - `pnpm test:unit`：295 ファイル / 4495 テスト全 PASS（`formatBytes` の境界値 describe を含む）。
  - `pnpm typecheck`：エラーなし。`biome lint`：クリーン。

---

## Frontend

### Blockers

なし。

### Warnings

なし。

### Notes

- **[N-001]** 共有 `formatBytes` の実装本体がコピー元と `export` 以外1文字一致で、桁ルール・U+2014・単位列すべて保存されていることを確認。「見た目が1文字も変わらない」絶対制約（AC-3）は、①コピー元との一致 diff、②回帰テストの verbatim ロック、③manual-test のブラウザ検証（3.5 MB / 256 MB の0桁 / null→"—"）の三重で担保されており堅い。
- **[N-002]** `export/ExportJobDetail/index.tsx:40` に別ポリシーのローカル `function formatBytes(bytes: number)` が残るため、コードベース上に同名で挙動の異なる `formatBytes` が2つ存在する状態。import 衝突はなく（ExportJobDetail は共有版を import しない）、ADR-001 が「別ポリシーゆえの意図的残置」として明示的に受容・記録している。将来ポリシーが揃った際の再検討ポインタも ADR に残っており、現状の判断として妥当。指摘というより追跡メモ。
- **[N-003]** 回帰テスト（`byteSize.test.ts:31-77`）は「実出力を verbatim にロック（手計算でなく `toFixed` の IEEE754 丸め込み）」という既存 `formatMegabytes` テストの方針を踏襲。`i===0` の整数表示（512/1023）、各単位境界、`scaled>=100` の0桁切替（100 KB / 100 MB）、TB clamp（1024 TB）、単位内小数丸め（1.5 KB）、代表 in-app 閾値（50.0 MB / 2.0 GB）を網羅し AC-5 を満たす。コメントも WHY（表示ロックの根拠）に限定されており CLAUDE.md のコメント規約に沿う。
- **[N-004]** シグネチャが `number | null` に緩む懸念（ADR-001 トレードオフ）は、JSDoc の「`null` は missing/unknown totals の欠損表示」明記と回帰テストの `null→"—"` ロックで意図が補われており、レビュー上の誤読リスクは十分に抑えられている。
