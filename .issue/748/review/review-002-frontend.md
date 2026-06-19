# PR #760 レビュー Round 2 — Frontend

対象: PR #760 / Issue #748 / 計画 `.issue/748/plan.md` / モック `spec/design/pages/P40-admin-dashboard.html`
種別: Round 2 フルレビュー（ゼロベース）
変更フロントファイル: `app/components/admin/Dashboard/index.tsx`（chart.ts は本 PR で実質無変更、`buildSparkline`/`sumCounts` を再利用）

## サマリ
- Blockers: 0 / Warnings: 0 / Notes: 3

Round 1 の指摘（`md:grid-cols-2` → `lg:grid-cols-2`、失敗プレースホルダの max-sm 高さ対称、Sparkline 汎用化）はいずれも正しく反映されている。Blocker / Warning なし。残りは仕様/モック解釈に関する軽微な Note のみ。

---

## Frontend

### Blockers
なし

### Warnings
なし

### Notes

- **[N-1] LLM チャートカードのタイトル文言がモックと不一致（ただし意図的な対称化）**
  - 場所: `app/components/admin/Dashboard/index.tsx:327`（`LLM 呼び出し数`）
  - 事実: モック `spec/design/pages/P40-admin-dashboard.html:679` の chart-card-title は「LLM 呼び出し」（数なし）。アップロード側はモック「アップロード数」(L663) と一致。実装は LLM 側に「数」を付けて「アップロード数 / LLM 呼び出し数」と左右対称にしている。scalar カード側は「LLM 呼び出し (24h)」でモック (L649) と一致。
  - 理由: 厳密にはモックの chart タイトル文言と差異がある。一方で 2 枚カードのタイトルを「◯◯数」で揃える方が視覚的整合は良く、虚偽表示でもない（回数系列を指す文言として正確）。
  - 提案: 意図的対称化であればこのままで可。モック厳密準拠を採るなら LLM カードタイトルを「LLM 呼び出し」に戻す。どちらでも実害なし。判断は実装者に委ねる。

- **[N-2] chart-svg の `max-sm:h-[120px]` はモックに無いがプロジェクト既定の #749 整合パターン**
  - 場所: `index.tsx:80`（Sparkline svg）, `:310` / `:336`（失敗プレースホルダ）
  - 事実: モック `.chart-svg` は `height:140px` 固定でモバイル縮小指定が無い (L498)。実装は svg を `h-[140px] max-sm:h-[120px]` とする。これは本 PR の新規追加ではなく、main の `UploadsSparkline` に既に存在した #749 由来のモバイル調整であり、本 PR は LLM カードへ同型に展開しているだけ。Round 1 で失敗プレースホルダ側にも `max-sm:h-[120px]` を足して svg と高さを揃えた（main では placeholder が `h-[140px]` 固定で非対称だった）のは正しい修正。
  - 理由: モック厳密値とは差があるが、#749 のモバイル最適化方針との整合を優先した既定パターンで、2 カード・成功/失敗の両状態すべてで対称（120px）に統一されており回帰リスクは無い。
  - 提案: 対応不要。記録目的の Note。#749 と干渉せず、むしろ整合している。

- **[N-3] グラデーション defs が各カード svg 内にインライン複製される**
  - 場所: `index.tsx:88-93`（`gradientId` ごとに `<defs><linearGradient>` を svg 内に描画）
  - 事実: Sparkline を 2 回描くと同一形状の linearGradient が 2 つ DOM に出る。`gradientId` を prop 化（`uploads-spark-fill` / `llm-spark-fill`）して衝突は正しく回避済み。これは汎用化に伴う妥当なトレードオフ。
  - 理由: コンポーネント自己完結（外部 defs に依存しない）を優先した結果で、DOM ノードが各1個増えるだけ。パフォーマンス/可読性とも無視できる範囲。モックも g1/g2 を別 defs として持つ (L668/L684) ため、むしろモック構造に忠実。
  - 提案: 対応不要。

---

## 個別確認結果（重点項目）

- **LLM sparkline カード追加 / null・0件出し分け**: `metrics.llmCallsHourly === null` → 「取得失敗」プレースホルダ（svg 非描画）、非 null → `Sparkline` 描画。0 件平坦線は `buildSparkline` の `max===0 → ratio 0`（chart.ts:33）でベースライン平坦線。null と 0 の出し分けは「null は呼び出し側でプレースホルダ、0 はチャート層で平坦線」の 2 層分離（chart.ts JSDoc に明記）で正しい。虚偽表示禁止に整合。アップロードカードと完全対称。OK。
- **2カラム breakpoint（lg:grid-cols-2）**: モック `@media (min-width:1024px){ .charts{grid-template-columns:1fr 1fr} }`（L478）に一致。Round 1 で `md:` → `lg:` に修正済み（first commit fb238e8e は `md:grid-cols-2`、修正 commit 5de8275d で `lg:`）。モック準拠 OK。
- **max-sm 高さ対称**: svg・失敗プレースホルダとも `h-[140px] max-sm:h-[120px]` で統一。Round 1 で placeholder にも `max-sm:h-[120px]` を追加し非対称を解消。アップロード/LLM 両カードで同値。OK。
- **キャプション対称**: 両カードとも「{null?取得失敗:◯ / 24h（毎時）}」を `text-xs text-ink-tertiary mt-2` で同型描画（件 / 回 のみ差）。OK。なお当該キャプションはモックに無い既存追加だが、両カード対称かつ虚偽でないため許容（#595/#746 由来）。
- **UploadsSparkline → 汎用 Sparkline 化**: `ariaLabel` / `gradientId` を prop 化し両カードで再利用（arch[S-005] 反映）。アップロードは既存文言「アップロード数の直近 24 時間の推移」、LLM は「LLM 呼び出し数の直近 24 時間の推移」を渡す。`role="img"`+`aria-label` で命名、重複 `<title>` を避ける旨コメント有り。gradientId は両者ユニークで衝突なし。OK。
- **scalar カード無改変 / 虚偽表示なし**: LLM scalar カード（index.tsx:277-287）は `formatNumber(metrics.llmCallsToday)` + `null?取得失敗:回 / 24h` で、main から構造変更なし（データ源新設で値が null→実数に変わるだけ, arch[S-005] どおり）。他 scalar（userCount/storage/uploadsToday）は無改変、null 固定挙動維持（AC-7）。OK。
- **utility-first 準拠**: 新規 CSS / `@apply` なし。トークン経由 utility（`text-accent` 等）のみ。tokens.css 改変なし。OK。
- **不要な client 化なし**: `AdminDashboard` は async server component のまま。`Sparkline` も純描画関数で client directive なし。OK。
- **#749 モバイル整合との干渉なし**: `max-sm:` 系（gap-3 / mb-6 / h-120px / break-words / stack-label 等）は main の #749 パターンをそのまま踏襲・対称展開。新規の競合 utility なし。むしろ placeholder 高さ対称化で #749 方針に整合。干渉なし。

## 結論
APPROVE（Frontend 観点）。Blocker / Warning なし。Note 3 件はいずれも対応任意。typecheck 通過確認済み。
