# Test レビュー — PR #829 / Issue #805（formatBytes 集約）

対象: `app/components/common/__tests__/byteSize.test.ts`（`formatBytes` describe 追加）
実装計画: `.issue/805/plan.md`（AC-3 表示不変 / AC-5 境界値カバレッジ）

## 検証したこと

- `npx vitest run app/components/common/__tests__/byteSize.test.ts` → **10 tests passed（緑）**。
- 各期待値が「集約前コピー元ロジックの実出力」と一致するか、コピー元と1文字一致の `formatBytes` を node で再実行して検算。全件一致:
  - `null → "—"`（codePoint = `0x2014` = U+2014 EM DASH を確認）, `0 → "0 B"`
  - B レンジ `i===0`: `512 → "512 B"`, `1023 → "1023 B"`
  - 単位境界: `1024 → "1.0 KB"`, `1024**2 → "1.0 MB"`, `1024**3 → "1.0 GB"`, `1024**4 → "1.0 TB"`（浮動小数の `Math.floor(Math.log(1024**n)/Math.log(1024))` 境界ズレは発生せず）
  - `scaled>=100` 0桁切替: `100*1024 → "100 KB"`, `100*1024**2 → "100 MB"`（さらに実データの `256*1024**2 → "256 MB"` も 0 桁で一致）
  - TB 打ち止め clamp: `1024**5 → "1024 TB"`（`i = min(4, 5) = 4`, `scaled = 1024`）
  - 丸め: `1536 → "1.5 KB"`
  - 実閾値: `50*1024*1024 → "50.0 MB"`, `2*1024**3 → "2.0 GB"`
- describe/it 構成・verbatim ロックのコメント方針は既存 `formatMegabytes` テストと一貫。実装内部ではなく出力文字列をアサートしており、単位列変更・桁ルール変更・em dash 取り違え・clamp 除去を確実に検出できる設計。

AC-5 が要求する境界（null / 0 / B・KB・MB・GB・TB 各境界 / `scaled>=100` 桁切替 / `i===0` 桁 / TB 打ち止め）はすべてテストで網羅されている。AC-3（表示不変）はコピー元との1文字一致 diff（コピー元ロジックが完全同一であることを diff で確認済み）＋本境界値ロックの二段で担保されており妥当。

## Blockers

なし。

## Warnings

- **[W-001]** 「丸め」ケースが実際には toFixed の丸めを exercise していない
  - 場所: `app/components/common/__tests__/byteSize.test.ts:61-63`（`"rounds to one decimal within a unit"` / `1536 → "1.5 KB"`）
  - 理由 / 提案: `1536/1024 = 1.5` は正確な二進小数で、`toFixed(1)` は丸め処理を通らない（値がそのまま出るだけ）。一方でファイル冒頭コメント（L30-33）は「incl. IEEE754 toFixed rounding」を verbatim ロックの根拠として明記しており、隣の `formatMegabytes` テストは意図的に `1.25*MIB → "1.3 MB"`（実際に第2位以下を丸める値）で丸めをロックしている。`formatBytes` 側には第2小数位で丸めが発生する 1 桁ケースが1件も無いため、`toFixed` の丸め挙動（half-up 相当）を実質検証できていない。例えば `1126 → "1.1 KB"`（`1126/1024 = 1.0996…`）のような、丸めが実際に走る値を1件追加すると、コメントが謳う「丸め込みのロック」が本当に成立する。sibling テストと粒度を揃える意味でも推奨。

## Notes

- **[N-001]** 「実呼び出し閾値」ケースが実定数ではなく合成値
  - 場所: `app/components/common/__tests__/byteSize.test.ts:65-70`（`"locks representative in-app thresholds"`）
  - 理由: 既存 `formatMegabytes` テストは `DEFAULT_MAX_INGESTION_BYTES` / `MAX_RECORDING_BYTES` 等の実定数名をコメントで紐づけて閾値をロックしている。対して `formatBytes` 側は `50MB`・`2GB` を「around tens of MB」「in the GB range」という曖昧なコメントで合成しており、実 UI の値（manual-test 記録では 1 日アップロード上限 = `1.0 GB`、エクスポート成果物上限 = `256 MB`）と対応していない。とくに `scaled>=100` 0桁パスを踏む実値は `256 MB`（export cap）だが、ユニットテストは合成の `100 MB` でしか 0 桁を固定していない。カバレッジ自体は足りているため任意だが、実 call-site 値（例: 上限系は `formatMegabytes` 管轄なので、`formatBytes` の実 call-site である storage 系や account-delete media 合計の代表値）に寄せると「実表示のロック」という意図がより忠実になる。

- **[N-002]** `scaled>=100` 境界の直下（just-below-100 の1桁パス）を明示的にブラケットしていない
  - 場所: `app/components/common/__tests__/byteSize.test.ts:52-55`
  - 理由: `scaled>=100`（inclusive）の境界は `100*1024` で「ちょうど100 → 0桁」をロックできているが、直下（例 `99*1024 → "99.0 KB"`）で「99 → 1桁」を挟むと `>=` 境界を上下両側から固定できる。1桁パス自体は `1.0/1.5 KB`・`50.0 MB` 等で担保されているため任意。

## 総評

計画（AC-3 / AC-5）が要求する境界はすべてカバーされ、期待値はコピー元の実出力と1文字一致で検算済み、テストは緑。実装べったりでなくリグレッション検出力のある設計で、既存テストとも一貫。Blocker なし。W-001（丸めを実際に踏むケースの追加）だけ、sibling テストとの粒度合わせとコメント整合の観点で対応を推奨する。
