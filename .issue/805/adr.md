# ADR — Issue #805: 可変単位バイト整形ヘルパ（formatBytes）の集約

## ADR-001: 共有 `formatBytes` のシグネチャと、別ポリシー2件を寄せない判断

### Status
Proposed

### Context
可変単位バイト整形が3コンポーネントに同一コピーで存在するが、シグネチャだけが割れている:

- admin/Dashboard・admin/Metrics: `formatBytes(value: number | null)` — `null → "—"`。
- identity/AccountDeleteForm: `formatBytes(value: number)` — null 分岐なし。

ロジック本体（`0 → "0 B"`, `Math.log` 単位選択, `toFixed(scaled >= 100 || i === 0 ? 0 : 1)`）は3者で完全一致。共有 util の単一シグネチャをどう決めるかが論点。選択肢:

1. `(value: number | null)` の上位互換1本にする。
2. `(value: number)` にして、null は呼び出し側（Dashboard/Metrics）で事前に `"—"` へ分岐する。
3. オーバーロード / ジェネリクスで両対応する。

さらに、別ポリシーの2件をこの共有版に寄せるか:

- export/ExportJobDetail: B(整数)→KB(1桁)→MB(**2桁**)、GB/TB なし。
- ingestion/IngestionJobRow: 常に KB・1桁固定（単位を切り替えない）。

これらを共有 `formatBytes` に置換すると出力が変わる:
- ExportJobDetail の MB は2桁だが共有版は1桁（かつ `scaled>=100` で0桁）。さらに大きい値で共有版は GB/TB に切り替わる。
- IngestionJobRow は小さい値でも大きい値でも常に KB 表示だが、共有版は B や MB/GB に切り替わる。

「既存の表示が1文字も変わらない」が絶対制約。

### Decision
1. 共有 `formatBytes` は **選択肢1（`(value: number | null): string`）** を採用する。
   - Dashboard/Metrics はそのまま（`null → "—"`）。
   - AccountDeleteForm は `number` を `number | null` 引数へ渡す（TypeScript 上は安全な代入で、null 分岐に入らないため出力不変）。
   - 選択肢2は呼び出し側に null 分岐を再散らばらせ、集約の意味を薄める。選択肢3はこの単純なヘルパにはオーバースペック。
2. export/ExportJobDetail・ingestion/IngestionJobRow は **共有版に寄せず現状維持**。オプション引数（桁数・上限単位・固定単位）での吸収も**行わない**。
   - 寄せれば出力が変わり絶対制約に反する。
   - 2つの一度きりの分岐ポリシーのために共有 util をオプションで肥大化させるのは、集約による重複削減の便益を上回るコスト（可読性・テスト面積）を生む。Issue のデフォルト方針「変わるなら別管理のまま」に一致。

### Consequences
- 良い点:
  - 同一だった3コピーが1本化され、`byteSize.ts` が「可変単位=`formatBytes` / 固定MB=`formatMegabytes`」という明快な2関数構成になる。
  - AccountDeleteForm を含め全呼び出し側の出力が不変。型も緩めずに（`number` は `number | null` の部分型）吸収できる。
- トレードオフ:
  - 共有シグネチャが `number | null` になり、null を渡さない呼び出し側からは「やや緩い」型に見える。JSDoc と回帰テストで意図（"—" は欠損表示、通常値は non-null）を明示して補う。
  - ExportJobDetail・IngestionJobRow のバイト整形は共有化されず重複が一部残る。ただしこれは「別ポリシー」であり、無理な統合よりポリシー分離を優先した意図的な残置。将来ポリシーが揃った時点で再検討する。

---
