# PR #829 レビュー（Frontend 観点）— round 2

**対象 PR:** #829
**Issue:** #805（可変単位バイト整形ヘルパ `formatBytes` の重複を共有 util に集約）
**レビュー日:** 2026-07-10
**判定:** APPROVED（Blocker なし）
**前提:** review-001 を参照せずゼロベースで再検証。今回はワーキングツリー上に `byteSize.test.ts` の未コミット修正が入っているため、その修正込みの現状態を対象にした。

---

## 検証したこと（実コードと突き合わせ）

### AC-1: 共有 `formatBytes` の存在と `formatMegabytes` との共存
- `app/components/common/byteSize.ts` に `formatBytes(value: number | null): string`（L32-42）が1本だけ存在。`formatMegabytes`（L12-14, 固定 MB）と別関数として同居。JSDoc で「two-function set: variable-unit = formatBytes / fixed-MB = formatMegabytes」を明記。AC-1 充足。

### AC-2: 3コンポーネントのローカル定義削除と共有版 import
- Dashboard・Metrics・AccountDeleteForm いずれもローカル `formatBytes` を完全削除し、`import { formatBytes } from "@/components/common/byteSize"` を追加（各 `@/components/...` エイリアス記法・Biome import 整列順を維持）。呼び出し箇所（Dashboard 3・Metrics 7・AccountDeleteForm 1）は無変更。`function formatBytes` の残留は共有版と据え置き ExportJobDetail のみ。未使用 import / 未使用関数なし（biome lint 5ファイルクリーン）。AC-2 充足。

### AC-3: 出力の1文字不変（絶対制約）
- 共有版の実装本体（`null→"—"`, `0→"0 B"`, `units=["B","KB","MB","GB","TB"]`, `i=Math.min(units.length-1, Math.floor(Math.log(value)/Math.log(1024)))`, `scaled=value/1024**i`, `` `${scaled.toFixed(scaled>=100||i===0?0:1)} ${units[i]}` `` ）は、削除された Dashboard/Metrics コピーと `export` 接頭辞以外で1文字一致。桁ルール `scaled>=100||i===0?0:1` 保存。
- `—` は node で U+2014（EM DASH）をソース・テスト両方で確認（U+2013/ハイフンへの取り違えなし）。AC-3 充足。

### AC-4: ExportJobDetail・IngestionJobRow の据え置き
- `export/ExportJobDetail/index.tsx:40-46` は B(整数)→KB(1桁)→MB(**2桁**)・GB/TB なしのローカル版を維持。`ingestion/IngestionJobRow.tsx:182` は `(job.byteSize / 1024).toFixed(1)} KB` の固定 KB を維持。両ファイルとも PR コミットで無変更。共有版と出力ポリシーが異なり寄せれば表示が変わるため据え置きは妥当で、ADR-001 に記録済み。AC-4 充足。

### AC-5: 境界値の回帰テスト
- `formatBytes` describe が null(U+2014)/0/B レンジ(512,1023,i===0)/各単位境界(KB/MB/GB/TB)/`scaled>=100` 切替/TB clamp(1024 TB)/単位内丸めをカバー。今回の未コミット修正で `99*1024→"99.0 KB"`（99は小数保持）を追加し `scaled>=100` スイッチを両側からブラケット、`1280→"1.3 KB"`（1.25 の IEEE754 丸め）を追加、代表閾値を `256 MB`(0桁)/`32.0 MB`(1桁)/`2.0 GB` に更新。全期待値を手計算で追検証し一致、10テスト PASS。AC-5 充足かつ round-1 時点より厳密化。

### 型安全・静的検査
- AccountDeleteForm は `formatBytes(impact.mediaTotalBytes)`（`index.tsx:138`）で `number`（DTO 非 null）を `number | null` 引数へ渡す安全な代入。非 null のため null 分岐に入らず出力不変。`pnpm typecheck`（tsgo）exit 0、`biome lint` クリーン、`vitest` 10 PASS。
- JSDoc は `formatBytes` 側に単位列・桁ルール・null→"—"・TB clamp を正確に記述し、AccountDeleteForm から `#573`（表示整形はプレゼンテーション層の関心事）provenance と出自 `#799` を引き継ぎ。隣接 `formatMegabytes` JSDoc も "family" 表現削除・TB 欠落解消・`{@link}` 単数参照へ更新済み。CLAUDE.md の library-level JSDoc / コメント規約に準拠。

---

## Frontend

### Blockers

なし。

### Warnings

なし。

### Notes

- **[N-001]** 共有 `formatBytes` 実装本体はコピー元と `export` 以外1文字一致で、桁ルール・U+2014・単位列すべて保存。絶対制約（AC-3）は ①コピー元一致 diff ②回帰テストの verbatim ロック ③manual-test の三重で担保され堅い。
- **[N-002]** 今回対象の `byteSize.test.ts` 修正は**ワーキングツリー上で未コミット**（PR HEAD `6860b03d` にはまだ入っておらず、コミット済みテストは修正前の緩い版）。修正内容自体は improvement（99/100 ブラケット・1.25→"1.3" の IEEE754 丸めケース・代表閾値を実表示に近い 256/32 MB へ）で全て正確・PASS。ただし PR に反映するには**コミットが必要**。現状のままだと PR にマージされるのは旧テストなので、コミット漏れに注意。
- **[N-003]** `byteSize.test.ts:71-74` のコメントは代表閾値を「admin/Metrics の export-artifact cap(256 MB, 0桁)/ingestion cap(32 MB, 1桁)」と紐付け。Metrics は実際に `limits.maxExportArtifactBytes`/`maxIngestionBytes` を `formatBytes` で描画（`Metrics/index.tsx:54,59`）しており文脈は正確。256/32 MB はインスタンス設定値（実行時可変）ゆえ literal な既定値との一致は保証されないが、テストの目的（出力フォーマットのロック）には代表値で十分で、指摘というより追跡メモ。
- **[N-004]** `export/ExportJobDetail/index.tsx:40` に別ポリシーのローカル `formatBytes(bytes: number)` が残り、同名で挙動の異なる `formatBytes` が2つ存在。import 衝突はなく（ExportJobDetail は共有版を import しない）、ADR-001 が「別ポリシーゆえの意図的残置」として受容・記録済み。将来ポリシーが揃った際の再検討ポインタも ADR にあり妥当。
- **[N-005]** シグネチャが `number | null` に緩む懸念（ADR-001 トレードオフ）は、JSDoc の「null は missing/unknown totals の欠損表示」明記と回帰テストの `null→"—"` ロックで意図が補われており、誤読リスクは十分抑制。
