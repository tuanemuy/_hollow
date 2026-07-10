# Test レビュー（2周目） — PR #829 / Issue #805（formatBytes 集約）

対象: `app/components/common/__tests__/byteSize.test.ts`（`formatBytes` describe）
実装計画: `.issue/805/plan.md`（AC-3 表示不変 / AC-5 境界値カバレッジ）
前回: `.issue/805/review/review-001-test.md`（W-001 丸め未 exercise / N-001 合成閾値 / N-002 100 直下未ブラケット）

## 検証したこと

- `npx vitest run app/components/common/__tests__/byteSize.test.ts` → **10 tests passed（緑）**。
- コピー元と1文字一致の `formatBytes` を node で再実装し、テストの全 17 期待値を検算 → **全件一致**（em dash は U+2014 = `0x2014` を確認）。
  - 単位境界 `1024/1024²/1024³/1024⁴ → "1.0 KB/MB/GB/TB"`（`Math.floor(Math.log(1024^n)/Math.log(1024))` の浮動小数ズレは発生せず）。
  - `scaled>=100` 0桁切替: `99*1024 → "99.0 KB"`（直下1桁）／`100*1024 → "100 KB"`／`100*1024² → "100 MB"`。
  - `i===0` 0桁: `512 → "512 B"`, `1023 → "1023 B"`。
  - TB clamp: `1024⁵ → "1024 TB"`（`i=min(4,5)=4`, `scaled=1024`）。
  - 丸め: `1536 → "1.5 KB"`（exact）／`1280 → "1.3 KB"`（`1.25.toFixed(1)="1.3"` を確認、実際に丸めを踏む）。
  - 実閾値: `256*1024² → "256 MB"`, `32*1024² → "32.0 MB"`, `2*1024³ → "2.0 GB"`。
- コピー元 3 コンポーネント（Dashboard L43-53 / Metrics L45-55 / AccountDeleteForm L54-63）の削除前ロジックを diff で確認 → 本体（`units`, `Math.log`, `Math.min` clamp, `scaled>=100||i===0?0:1`）は共有版と**バイト一致**。AccountDeleteForm のみシグネチャが `(number)` だが非 null パスは同一で出力不変。AC-3 は成立。
- `256 MB`（`maxExportArtifactBytes`）/`32 MB`（`maxIngestionBytes`）は admin/Metrics の実 call-site（L59 / L54）に対応。前回 N-001 の合成値（`50 MB`「around tens of MB」）より忠実になっている。

### 前回指摘の消化状況

- **W-001（丸め未 exercise）** → 解消。`1280 → "1.3 KB"` を追加し、`toFixed(1)` の丸め判断（1.25→1.3）を実際に踏む。sibling `formatMegabytes`（1.25 MiB → "1.3 MB"）と粒度が揃い、コメントの「incl. IEEE754 toFixed rounding」が実効化した。
- **N-001（実閾値の合成値）** → 解消。`256 MB`（export cap, `scaled>=100` 0桁パスを実値で固定）/`32 MB`（ingestion cap, 1桁パス）へ差し替え、コメントも実 call-site（admin/Metrics）へ紐づけ。
- **N-002（100 直下未ブラケット）** → 解消。`99*1024 → "99.0 KB"` を追加し `>=100` 境界を上下両側から固定。

AC-5 が要求する境界（null / 0 / B・KB・MB・GB・TB 各境界 / `scaled>=100` 桁切替 / `i===0` 桁 / TB 打ち止め / 丸め）はすべて網羅。実装内部でなく出力文字列をアサートしており、単位列変更・桁ルール変更・em dash 取り違え・clamp 除去・丸め変更を確実に検出する。

## Blockers

なし。

## Warnings

- **[W-001]** 今回の3修正（丸め `1280`・実閾値 `256/32MB`・`99` 境界）が **PR にコミットされていない**（working-tree 未追跡）
  - 場所: `app/components/common/__tests__/byteSize.test.ts`（`git diff` は差分あり／PR HEAD `6860b03d` は旧テスト）
  - 理由: `gh pr diff 829` が返すのは旧版（`it("drops the decimal once the scaled value reaches 100")` に `99` ブラケットなし、`it("rounds to one decimal within a unit")` に `1280` なし、閾値は `50MB` 合成のまま）。前回 W/N の修正はレビュー対象ブランチにまだ push されておらず、このままマージすると本レビューで確認した改善が PR に載らない。テスト品質自体は working-tree 版で満たされているが、**PR へコミット/push してから承認へ進むこと**を要件とする。

## Notes

- **[N-001]** `256/32 MB` は「代表 call-site 形状」であり limits の **既定値定数そのものには pin していない**
  - 場所: `app/components/common/__tests__/byteSize.test.ts:70-77`
  - 理由: `formatBytes` は整形のみで上限値は config 側にあるため、実値定数（`maxExportArtifactBytes` 等の default）と乖離しても本テストは追随しない。集約の目的（出力不変のロック）には形状固定で十分だが、コメントが具体値（256/32MB）を断定している分、将来 default が変わるとコメントだけ陳腐化しうる。`formatMegabytes` 側が `DEFAULT_MAX_INGESTION_BYTES` 等を定数名でコメント参照しているのと同水準にするなら、定数名を併記すると忠実度が上がる（任意）。

- **[N-002]** `scaled>=100` の 0桁パスを GB/TB レンジで exercise していない
  - 場所: `app/components/common/__tests__/byteSize.test.ts:52-57`
  - 理由: 桁ルールは単位非依存で KB/MB で両側固定済みのため機能的な穴ではない。厳密には `100*1024³ → "100 GB"` 等を1件挟めば全単位で桁切替を確認できるが、回帰検出力は現状で十分。優先度低（任意）。

## 総評

前回 Warning/Notes（W-001 丸め・N-001 合成閾値・N-002 100 直下）はいずれも的確に修正され、期待値はコピー元の実出力と1文字一致で検算済み、テストは緑（10 tests）。AC-3（表示不変）・AC-5（境界カバレッジ）はテストとして満たされている。テスト内容に Blocker はない。唯一の実務的な留意点は **W-001（修正が PR に未コミット）** で、push してから承認すること。Notes 2 件はいずれも任意。
