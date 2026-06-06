# ADR — Issue #520: admin/metrics のデザインモック新設

## ADR-001: モック番号は P47

### Status
Accepted

### Context
新設する admin モックの番号をどう振るか。既存 admin モックは P40〜P46 の連番。

### Decision
連番の自然な次として **P47**（`P47-admin-metrics.html`）とする。実シェル nav 上は「利用状況」が「ユーザー（P45）」と「ジョブ監視（P46）」の間に位置するが、ファイル番号は新設順（連番末尾）に従い P47 とし、nav の表示順（位置）とファイル番号は分離する。

### Consequences
- 良い点: 既存の `P4x-admin-*` 命名・連番規則を壊さない。
- トレードオフ: nav 表示順（…P45→P47→P46）とファイル番号順（…P45→P46→P47）が一致しないが、ファイル番号は「作成順の識別子」であり表示順を表さないため許容。

---

## ADR-002: `:root` は §11 ではなく兄弟モックと同一でコピーする（`--opacity-disabled` を含めない）

### Status
Accepted（plan.md「リスクと注意点」の §11 準拠方針を実態に合わせて上書き）

### Context
index.md §9 は「`:root` は tokens.md §11 の最終形をコピー」と定める。一方 tokens.md §11 には `--opacity-disabled: 0.55;` が含まれるが、出荷済みの admin モック（P40〜P46）の `:root` には**いずれも含まれていない**（§11 に未追従）。plan.md 当初案は「§11 準拠で P47 に opacity-disabled を含め、1トークン差は意図的」としていた。

### Decision
本 Issue の主目的は「net-new モックを出荷済みモックに**馴染ませる**」こと。P47 だけ `--opacity-disabled` を持つと逆に兄弟から浮く。P47 は disabled なコントロールを持たず当該トークンを使わないため、**兄弟（P40 等）と完全に同一の `:root` をコピー**し、`--opacity-disabled` は含めない。

### Consequences
- 良い点: P47 の `:root` が兄弟と 1 バイトも違わず、馴染ませる目的に最も忠実。
- トレードオフ: §9 の「§11 をコピー」と厳密には一致しないが、これは既存 admin モック全体が §11 に未追従という既存乖離の側に倒した判断。admin モック群を §11（opacity-disabled 追加）へ一括追従させるのは本 Issue のスコープ外。

---

## ADR-003: ヘッダーの検索・通知は維持で描く

### Status
Accepted

### Context
実装 `MetricsPage`（および admin シェル）にはヘッダー検索・通知が未実装。一方 index.md §2.4 は「検索・通知は admin の標準 affordance として維持」を SSOT として宣言済みで、最適化済みの兄弟モック（P40〜P46）も検索 input + 通知ベル + avatar を描画している。

### Decision
P47 も §2.4 と兄弟モックに合わせ、検索・通知・avatar を持つヘッダーで描く。実装が未実装である差分は、ファイル末尾の HTML コメントで「追従は #514、シェル去就の最終判断は #500 横断#7」と明記し、後続が辿れるようにする。

### Consequences
- 良い点: §2.4 と兄弟モックに完全整合。横断#7 の最終判断を先取りしない。
- トレードオフ: モックと実装の見た目に差が残るが、admin モック共通の既知差分であり #514 が受け皿。

---

## ADR-004: 責務境界の SSOT 反映先と、P40↔P47 導線の不追加

### Status
Accepted

### Context
「ダッシュボード=概況 / metrics=詳細」の責務境界をどこに、どう明記するか。また P40 に「詳細を見る（→P47）」の相互導線を足すか。

### Decision
責務境界は (a) `spec/design/index.md` §2.4 の admin 項に1段落、(b) `spec/pages/index.md` の P40・P47 双方に相互参照と「粒度違いの意図的重複」注記、の2箇所に明記する。**P40→P47 の導線リンクは追加しない** — 実装の P40 ダッシュボードにその導線は存在せず、モックにだけ net-new UI を足すと「実装に馴染ませる／実装変更はスコープ外」という Issue 原則に反するため。導線を実装側に入れる判断は #514 に委ねる。

### Consequences
- 良い点: 責務境界が機能仕様 SSOT に自己完結し、spec-sync での「二重定義」誤検出を防ぐ。実装と乖離する net-new UI を増やさない。
- トレードオフ: モック間のクリック導線は nav 経由のみ（相互リンクなし）だが、責務はドキュメントで担保。

---

## ADR-005: アラートとインスタンス上限テーブルは既存プリミティブで表現

### Status
Accepted

### Context
実装のアラートは severity 3 段（critical→error-surface / warning→warning-surface / low→accent-surface）。インスタンス上限は項目/値の 2 列で値は mono 右寄せ。新規プリミティブ・トークンは作らない方針（Issue 原則）。

### Decision
- アラートは P40 が定義済みの `.banner.error` / `.banner.warning` のみで表現し、`.banner.info`（accent-surface）variant は新設しない。代表として critical（error）と warning の 2 件を見本表示する。`<strong>` のコードは admin の `err-code` 慣例に合わせ mono で表示。
- インスタンス上限は P40/P46 の `.table` プリミティブを流用し、値セルに `.num`（右寄せ + mono + tabular-nums）修飾だけを足す。狭幅では `.table` の積層表示（`data-label`）で対応する。

### Consequences
- 良い点: 新規トークン・新規 variant を増やさず既存プリミティブで完結。admin の密度・タイポ慣例（mono の数値・コード）に整合。
- トレードオフ: 実装 `LimitsCard` は `overflow-x-auto` でモバイルカード化しない点がモックと異なる（追従は #514。末尾コメントに明記）。`.num` 修飾は P47 ローカルの最小追加で、汎用 `.table` への影響はない。
