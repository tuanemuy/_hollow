# ADR — Issue #545: 領域6「管理（admin）」(P40〜P47) のモック実装追従

## ADR-001: P40 のチャート / 最近のアクティビティを本 Issue で描かない

### Status
Accepted

### Context
P40 モックは「直近 24 時間」チャート（時系列 sparkline）と「最近のアクティビティ」テーブル（新規ユーザー / 大量アップロード / ジョブ失敗 / 設定変更 / バックアップ）を持つ。これらをそのまま実装すると Issue の追従ポイント「ダッシュボード情報設計（チャート / アクティビティ / 履歴 / プレビュー）」を満たすように見える。

しかし backend を調査した結果:
- `UsageMetricsProvider`（`app/core/application/ports/usageMetricsProvider.ts:20-33`）は scalar snapshot（`userCount` / `storage*Bytes` / `uploadsToday` / `llmCallsToday`）のみを返し、**時系列フィールドが無い**。
- `app/core` 全体に `activityLog` / `auditLog` / `recentActivity` 等の **アクティビティ / 監査ログ subsystem が存在しない**（grep で確認）。

兄弟 Issue #540〜544 で確立された鉄則「虚偽のヘルプ・プレビュー・数値を出さない」に従えば、データ源の無いチャート・活動行を frontend で描くのはダミー数値の虚偽表示になる。

### Decision
P40 のチャート・最近のアクティビティ・関連導線（「期間を変更」「すべて見る」）は本 Issue で描かない。時系列メトリクス provider／アクティビティログ subsystem の新設を伴うため Phase 4 で別 Issue 化する。現状の「管理メニュー」案内セクション（モックに無いが虚偽でない honest filler）は維持する。

### Consequences
- 良い点: 虚偽表示を出さない。frontend 完結スコープを保つ。backend 設計を別 Issue で丁寧に行える。
- トレードオフ: P40 のモック追従は本 Issue では「描かない」判断に留まり、見かけ上の進捗が小さい。Phase 4 起票で補う。

---

## ADR-002: P45/P46 は横スクロール、P47 限度テーブルのみ狭幅で行積層

### Status
Accepted

### Context
admin 一覧テーブル 3 種（P45 ユーザー / P46 ジョブ / P47 限度）の狭幅レスポンシブ方針が、モック CSS 上で異なる:
- P45（mock 134 行）/ P46（mock 123 行）: `.table { min-width: 880px / 920px }` + 横スクロール（積層 CSS 無し）。
- P47（mock 471-493 行）: `@media (max-width: 767px)` で `thead { display:none }` + 各 `td` を `display:block` 化し `data-label` の `::before` でラベル表示（行積層カード化）。

3 種を一律「積層」または一律「横スクロール」に揃えたくなるが、モックは画面ごとに最適形を分けている。

### Decision
モック CSS を逐語確認し、画面ごとの方針に従う。P45/P46 は `min-width` を付与して横スクロール（積層しない）、P47 限度テーブルのみ `max-md:` で行積層カード化する。index.md §2.5「admin 一覧はテーブル基調・密度優先」と「画面最適を優先」に整合。

### Consequences
- 良い点: SSOT（モック）に忠実。各画面が密度と可読性の最適点を保つ。
- トレードオフ: 3 テーブルでレスポンシブ実装が分岐し、共通化したくなるが、共通化リファクタは本 Issue のスコープ外（触る箇所のみ最小変更）。

---

## ADR-003: モックが明示する構造寸法（min-width: 880/920px）はリテラル px 持ち込み回避の対象外

### Status
Accepted

### Context
CLAUDE.md / Issue 本文は「リテラル px の新規持ち込みを避け、デザイントークン経由で寸法を当てる」を求める。一方で P45/P46 モックはテーブル最小幅を `min-width: 880px / 920px` という固定 px で SSOT として明示しており、これに対応するトークンは無い。

### Decision
「リテラル px 持ち込み回避」の趣旨は偶発的な任意値の散布抑止と解釈し、モックが SSOT として明示する構造寸法（テーブル最小幅）は対象外とする。Tailwind 任意値（`min-w-[920px]` 等）または近傍のコンテナトークンで当てる（着手時に判断）。

### Consequences
- 良い点: モック寸法に忠実。トークン未定義の構造寸法でも追従できる。
- トレードオフ: 任意値 px が 2 箇所残る。ただし P45=880 / P46=920 と値が異なることから、これは各テーブルの列構成由来の**局所値**であり共通トークン化の必然性は低い（将来 admin テーブルで再利用される普遍寸法と判明した場合のみトークン化を検討）。

---

## ADR-004: P47 積層テーブルのラベルは `data-label` + `::before` ではなく実 DOM 要素で持つ

### Status
Accepted

### Context
モック P47（471-493 行）は狭幅で `thead { display:none }` にし、各セルの `td::before { content: attr(data-label) }` で「項目」「値」ラベルを CSS 生成する。モックを逐語追従するなら Tailwind で `before:content-[attr(data-label)]` + `data-label` 属性を当てることになるが、2 つの懸念がある:

1. **実現可能性**: Tailwind v4 の `content-[...]` ユーティリティは `--tw-content` 変数経由で値を出力する。リテラル文字列（`content-['']`）は前例があるが、CSS 関数 `attr(data-label)` を渡して正しく素通しされるかはバージョン依存で、リポジトリ内に `content-[attr` の使用が皆無（grep 確認）。
2. **アクセシビリティ**: `::before` の `content` はスクリーンリーダーで読まれない。`thead` 非表示と合わさると、SR ユーザーには列ラベルが一切届かず、値だけが連続読み上げされる。index.md §8 は a11y を「緩めない床」として扱う。

### Decision
`data-label` + `::before` 方式は採らず、ラベルを実 DOM 要素（`<span>`「項目」/「値」を各セル内に描画し `md:hidden` で広幅では隠す）として持つ。視覚的にはモックと同等の積層ラベルになり、SR にもラベルが届き、Tailwind の `attr()` 実現性リスクも回避する。実 DOM のラベルなので虚偽表示にもならない。

### Consequences
- 良い点: a11y 契約（index.md §8）を満たす。Tailwind 実現性リスクを回避。視覚はモック同等。
- トレードオフ: モックの CSS（`::before`）とは実装手法が異なる（見た目は一致）。各セルにラベル span が増えるが軽微。

---
