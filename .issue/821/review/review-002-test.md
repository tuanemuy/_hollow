# PR #823 レビュー (round 2 / フル再レビュー) — 観点: Test

**対象 PR:** #823
**実装計画:** `.issue/821/plan.md` / `.issue/821/adr.md`
**レビュー日:** 2026-07-10
**検証:** `pnpm vitest run` を対象ファイル群で実行（全 PASS）。`TZ=UTC` / `TZ=Asia/Tokyo` の両ランナーで `dateFormat.test.ts` を実行し同一結果を確認。ピン除去を模擬した `node` 実測で各テストの回帰検出能力を確認。

## 検証した受け入れ基準

- **AC-2（TZ 非依存の回帰ガード）** — 実質的に満たされている。ただし「TZ 未指定なら失敗する本物の回帰ガード」がどのテストで担保されるかは注意が必要（W-001 参照）。
- **AC-7（既存テスト整合）** — 満たされている。`dateFormat.test.ts`（新規4件）、`relativeTime.test.ts`（既存6件）、`ProfileForm/__tests__/index.test.tsx`（line 289 期待値更新）、加えて `TagList` / `SecurityForm` / `listSelectors` の既存テスト計 135 件も PASS。`ProfileForm` テストはコンポーネントと同期して `timeZone: "Asia/Tokyo"` が追加されており、期待値の取りこぼしなし。

---

### Test

#### Blockers

なし。

#### Warnings

- **[W-001]** 境界テスト (a)/(b) は「TZ 未指定なら失敗する回帰ガード」として**ランナー TZ に依存し、JST ランナーでは機能しない** / 場所 `app/components/common/__tests__/dateFormat.test.ts:4-9,13-33`（およびコメントの主張）/ 理由: `BOUNDARY = 2026-01-01T16:00:00Z` は UTC+8 以上のゾーンでは既に「翌日」になるため、ヘルパーの `timeZone: "Asia/Tokyo"` ピンを外しても、ランナー TZ が Asia/Tokyo（＝この開発機。`date +%Z` = JST で確認）や UTC+8 系だと (a)/(b) は依然 `2026年1月2日` を返して **PASS してしまう**（`node` 実測で確認済み: JST ランナーでピン除去しても (a) は `2026年1月2日`）。`vitest.config.ts` は `environment: "node"` のみで `env.TZ` を固定していないため、ランナー TZ は実行環境依存であり、CI/開発機が JST の場合この「回帰ガード」は空振りする。ファイル内コメント「Dropping the timeZone pin would make (a)/(b) yield the UTC-side ... regression guard」は *"under a UTC runner"* の条件付きでのみ正しく、無条件のガードのように読める点がミスリーディング。/ 提案: 実際の runner-independent なピン除去ガードは (c)（W-002/N-001 で後述、caller の `America/New_York` が JST に勝てば FAIL）なので、(1) コメントを「無条件のガードは (c)。(a)/(b) は UTC ランナー限定」と訂正する、または (2) `vitest.config.ts` に `test.env = { TZ: "UTC" }`（もしくは当該テストで `TZ` を固定）を入れて (a)/(b) を無条件ガードに昇格させ、`testing.md` に手書きされている `TZ=UTC pnpm test:unit` 手順を設定で常時強制する、のいずれかを推奨。※ (c) がある以上スイート全体としては AC-2 を満たすため Blocker ではないが、「本物の回帰ガード」の所在が (a)/(b) だと誤読される余地は塞ぐべき。

#### Notes

- **[N-001]** timeZone 上書き安全網テスト (c) は**妥当かつ強力**な回帰ガード / `dateFormat.test.ts:39-48`。caller が `timeZone: "America/New_York"` を渡しても JST が勝つことを assert。`node` 実測で、ヘルパーの `timeZone` ピンを除去（またはスプレッド順を `{ timeZone, ...options }` に逆転）すると caller の NY が適用され `2026年1月1日` となり **どのランナー TZ でも FAIL** することを確認した。ADR-002 の「スプレッドの後に timeZone を置く」防御的設計と、W-001 で問題になる「ピン除去」の両方を runner-independent に検出できる。round-1 での追加は的確。
- **[N-002]** ヘルパーテストのオプション網羅は適切 / `dateFormat.test.ts`。(a) 日付のみ・(b) 日時（個別コンポーネント指定）・(c) caller TZ 上書き・(d) NaN 素通し（`"not-a-date"` → そのまま返す）をカバー。移行先の大半が使う「個別コンポーネント指定」系オプションと、`toLocaleDateString` 相当の日付のみ返却（JSDoc の drop-in 主張）を実測で担保している。
- **[N-003]** 副次的改善: `relativeTime.test.ts:33-36` の絶対フォールバック assert（`2026-05-08T00:00:00.000Z` → `2026年5月8日`）は、本 PR 以前は `toLocaleDateString`（ピンなし）だったため非 UTC/非 JST ランナー（例 America/New_York では `2026年5月7日`）で**潜在的に TZ-fragile**だった。ヘルパー経由でピンが入ったことで runner-independent に `2026年5月8日` へ固定され、既存テストが結果的に堅牢化した。期待値の追加変更が不要だった点も plan の想定どおり。
- **[N-004]** `ProfileForm` テストはコンポーネントと**ロックステップ**で更新済み / `ProfileForm/__tests__/index.test.tsx:289`。移行前は「テスト・コンポーネントとも未ピン」で一致、移行後は「両者 JST ピン」で一致。片方だけ更新すると非 JST ランナーで不一致 FAIL するところ、両方に `timeZone: "Asia/Tokyo"` が入っており期待値リークなし（AC-7 の核心を満たす）。なお本テストは期待値をヘルパー import ではなく `toLocaleString("ja-JP", {timeZone, ...})` の逐語再構築で作っており、オプション集合を独立に固定しているため実質的な option-set ガードにもなっている（import 化すれば DRY だが、現状も可）。
- **[N-005]** 軽微な網羅ギャップ: `dateStyle`/`timeStyle` オプション系統がヘルパーテストで未検証 / `SecurityForm/index.tsx:114 formatLoginTime`（`{dateStyle:"medium", timeStyle:"short"}`）が使う系統は、helper テスト (a)-(d) の「個別コンポーネント指定」系統とは別の Intl 経路。`node` 実測では `{dateStyle, timeStyle, timeZone}` は有効に併用でき `2026/01/02 1:00` を返すことを確認済みで実害はないが、将来ヘルパーの options マージを触った際に検知するテストが無い。加えて `SecurityForm.formatLoginTime` / `listSelectors.formatDate` / `TagList.formatLastUsed` の各移行先は既存テストが緩いマッチャ（`toContain("2026")` / `toContain("最終アクセス:")`）のみで、これら呼び出し側の TZ 正確性は**中央ヘルパーテストに全面依存**する構図。ヘルパー集約方針からは許容だが、`dateStyle/timeStyle` の1ケースを `dateFormat.test.ts` に足すと集約の安全性がより明確になる（任意）。

---
**[W-001] → 修正済み（round-2）**: 境界テスト (a)/(b) のコメントを訂正。ピン除去/順序破壊への runner-independent なガードは (c) が担う旨を明示し、(a)/(b) は JST 値のアサート（非JSTランナーではピンも証明）と正確化。テスト構造・挙動は不変。
