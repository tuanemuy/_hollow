# ADR — Issue #539: インラインアラートを案D（.alert）に統一する実装追従

## ADR-001: 共通 `.alert` を module-scoped 文字列定数として提供（React コンポーネント化しない）

### Status
Proposed

### Context
案D `.alert` を 4 系統（callout/notice/banner/alert）から集約するにあたり、実装の置き場として「React コンポーネント（`<Alert>`）」と「module-scoped 文字列定数群」の 2 案がある。各通知箱は title/body/action/icon/role/severity が箇所ごとに異なり、JSX 構造もわずかに違う（アクション有無・mono 見出し・複数行 body・複数アラートのループ）。

### Decision
`app/components/common/styles.ts` に `ALERT` / `ALERT_INFO` / `ALERT_SUCCESS` / `ALERT_WARNING` / `ALERT_ERROR` / `ALERT_ICON` / `ALERT_CONTENT` / `ALERT_TITLE` / `ALERT_BODY` / `ALERT_BODY_CODE` / `ALERT_ACTION` の文字列定数群として提供する。React コンポーネント化はしない。

### Consequences
- 良い点: CLAUDE.md の「繰り返すユーティリティ文字列は module-scoped 文字列定数へ集約」規約と既存の `common/styles.ts` / `auth/styles.ts` パターンに一致。JIT が文字列を拾える。呼び出し側が必要な parts だけ組めて、role/icon/action/mono 見出しの差異を素直に表現できる。
- トレードオフ: コンポーネントのような型による slot 強制はなく、各呼び出し側でマークアップ（icon + content + title/body）を組み立てる必要がある。マークアップの一貫性は mock 対照のレビューで担保する。

---

## ADR-002: セマンティック切替を `--alert-accent` ローカル変数ユーティリティで行う

### Status
Proposed

### Context
mock の案Dは `--alert-accent` 1 変数で border / icon / title の色を連動させる設計。Tailwind での表現として「`[--alert-accent:var(--color-xxx)]` のローカル変数上書きユーティリティ」と「`data-[tone=...]` variant」の 2 案がある。

### Decision
セマンティックは `[--alert-accent:var(--color-info|success|warning|error)]` のローカル変数上書き定数（`ALERT_INFO` 等）を `ALERT` に連結して切り替える。severity が静的に決まる箇所は文字列連結（`${ALERT} ${ALERT_ERROR}`）。admin の動的 severity（`alert.severity`）は `severity → ALERT_*` の定数 map でトークンを 1 つ選んで連結する。

### Consequences
- 良い点: mock の `--alert-accent` 1 変数設計をそのまま写せる。1 箇所の上書きで border/icon/title が連動。条件付きクラス文字列連結（CLAUDE.md が避ける）を map ルックアップに置き換えられる。
- トレードオフ: `data-[tone]` variant に比べ DOM 上で tone が属性として可視化されない。ただし静的決定が大半で、可視化の必要性は低い。

### 注記（border 幅と arbitrary border-color の生成順）
`ALERT` は `border border-[color-mix(...)]` で **幅 1px（`border`）+ 色（arbitrary `border-color`）** の両方を含める。実機ビルド検証で `.border-[color-mix(...)]` は `border-color` のみを生成し幅は別途 `border` が必要なことを確認済み。本プロジェクトは過去に「同プロパティの解決はクラス文字列順でなく生成 CSS 順」を繰り返し問題化してきた（`pillBtnDanger` 等）が、`border-color` は他ユーティリティと衝突しないため本件では実害なし。

---

## ADR-003: ADR-004（#issue 別管理の旧 callout neutral surface）を案D化で上書き

### Status
Accepted（Issue 本文で確定済み）

### Context
P03/P01b の旧 `.callout` は実装済み `app/components/auth/styles.ts` の `CALLOUT` / `CALLOUT_ICON`（neutral surface + accent アイコン）を鏡写ししていた（旧 ADR-004）。今回 mock を案D化（白地 + セマンティック枠）したため、旧 ADR-004 の neutral surface 方針は失効する。

### Decision
実装の `CALLOUT` 系を削除し案D `.alert` へ移行する。neutral surface（`bg-surface` ベタ塗り）は廃止し、白地 + セマンティックヘアライン枠 + `--shadow-xs` に統一する。

### Consequences
- 良い点: mock（SSOT）と実装の一致。通知箱の意匠が全画面で統一される。
- トレードオフ: 旧 callout の neutral surface に依存した視覚（背景の塗り）が消えるが、これは設計確定済みの意図的変更。

---

## ADR-004: P40 Dashboard の severity アラートを案D化、healthy state（status-banner）は据え置き（実装時判断）

### Status
Accepted（実装時 2026-06-07）

### Context
plan ステップ7 は `Dashboard/index.tsx` を案D変換対象として明示する一方、P40 注意で「`.status-banner` は別意匠で案D 対象外の可能性が高い」とし、mock との 1:1 照合で対象を確定するよう求めていた。実装時に P40 mock（`spec/design/pages/P40-admin-dashboard.html`）を精査すると、mock の CSS は `.status-banner`（healthy: 緑ドット + hairline ボックス、degraded: warning 枠）のみを定義し、`.alert` クラスは含まない。ただし mock のマークアップコメントに「alerts がある場合は banner.error / banner.warning を上に積む」と明記がある。一方、実装の `Dashboard/index.tsx` は `metrics.alerts.length > 0` 分岐で `AlertDTO[]`（severity 駆動、P47 Metrics と同型）をベタ塗りボックス（`BANNER_*`）でレンダリングし、`alerts` が無いときのみ healthy な status-banner を出していた。

### Decision
- `metrics.alerts` を描画する severity 駆動の分岐（`BANNER_*`）を案D `.alert` + tone（P47 と共通の `severity → ALERT_*` map）へ変換する。これは P47 Metrics のアラートと同一の DTO・同一の意味を持つ「severity アラート」であり、mock コメントの「banner.error / banner.warning を積む」に対応する。
- healthy state の `.status-banner`「All systems operational」（緑ドット + hairline ボックス）は**別意匠であり案D `.alert` 対象外**として**据え置く**（変更しない）。

### Consequences
- 良い点: Dashboard / Metrics の severity アラートが単一の案D `.alert` + 共通 tone/icon map に統一される。healthy state の独自意匠（dot インジケータ）は mock どおり保持される。
- トレードオフ: P40 mock は alerts 表示の `.alert` 具体マークアップを描画していないため、case 視覚の最終照合は manual-test に委ねる。severity → tone/icon は P47（mock に具体例あり）と共有することで一貫性を担保した。
