# ADR — Issue #620: ホーム画面（P10）表示モードスイッチの segmented 統一

## ADR-001: segmented スタイル定数は `note/list/styles.ts` に複製する（共通昇格しない）

### Status
Proposed

### Context
P30 `PublicTopControls` は `public/styles.ts` の `SEGMENTED` / `SEGMENTED_BTN`（SSOT）を使う。P10 `DisplayModeSwitch`（auth 側 `note/list`）から同じ segmented 表現を再利用するにあたり、配置の選択肢:
- A. `public/styles.ts` の定数を `note/list` から直接 import する。
- B. `common/styles.ts` に昇格して両者で共有する。
- C. `note/list/styles.ts` に同値で複製する。

### Decision
**C を採用**: `note/list/styles.ts` に複製する。
- A は layer/surface 境界違反。`public/styles.ts` は公開面 (P30–P34) 専用の局所定数群であり、auth 側がそこへ依存すると surface 間の不要な結合が生まれる。
- B（common 昇格）は一見 DRY だが、現状 segmented を使うのは P30（public）と P10（note/list）の 2 箇所のみで、しかも tag 系（`tag/styles.ts`）は**別値の独自 `SEGMENTED`**（`p-0.5 rounded-md`）を持つ。「segmented」という名前で値が複数あるため、common への単一 SSOT 昇格はむしろ誤用を招く。
- C は CLAUDE.md Styling 規約「Repeated utility strings can be hoisted into a module-scoped string constant」に沿い、surface ごとに局所定数を置く既存パターン（`common/auth/layout/public/note-list/tag` の styles.ts 分割）と整合する。tag が独自 SEGMENTED を持つ前例がそのまま根拠。

### Consequences
- 良い点: surface 境界が保たれる。値は P30 SSOT と一致させるため見た目は同一。Tailwind JIT は両定義の同一トークンを問題なく拾う。
- トレードオフ: P30 と P10 で同値の文字列が二重定義になる。将来 segmented の意匠を変える際は両所更新が要る。ただし両者は「同じであるべき」制約が弱く（公開面と認証面で独立に動きうる）、結合を避ける方を優先する。

---

## ADR-002: segmented のアイコンは `Icon` ラッパーを経由せず lucide を直接描画する

### Status
Proposed

### Context
`Icon`（`common/Icon.tsx`）は `strokeWidth=1.5` 固定・`size` を 16/20/24 に限定する設計 SSOT。一方 segmented のアイコンはモック/P30 実装で 13px・`strokeWidth=1.8` を用いる。

### Decision
P30 `PublicTopControls` の既存実装と同様、lucide コンポーネントを直接描画し `className="size-[var(--icon-xs)]" strokeWidth={1.8} aria-hidden="true"` を付ける。`Icon` は使わない。

### Consequences
- 良い点: モック/P30 と同一のアイコン寸法・ストロークを再現。P10/P30 で表現が一致する。
- トレードオフ: `Icon` ラッパーの a11y 正規化を通らないが、segmented ボタンの accessible name はラベルテキストが担い、SVG は `aria-hidden` の装飾なので問題ない（`spec/design/index.md` §7 の icon-only でない「アイコン+テキスト」契約に合致）。

---

## ADR-003: ツールバー「選択」「ビューとして保存」を ghost 表現に統一する（実装・モック両方）

### Status
Accepted（ユーザーフィードバックで改訂）

### Context
Issue 不整合 #2 は、デスクトップ `.pill-btn`（surface 塗り）とモバイル `.tool-btn`（ghost、「ビューとして保存」はアイコンのみ）の差。Issue の主眼は **表示モードスイッチの segmented 統一**であり、ボタン群の統一は「それに合わせて」の従属項目。

レビュー時点（当初の Decision）では「実装 `pillBtn` を維持し、モックを実装＝ pill 側に寄せて統一」する判断だった。しかし PR 提出後、ユーザーから「『選択』『ビューとして保存』はモバイルの ghost のほうがシンプルで良かった」とのフィードバックがあり、統一の方向を **ghost 側**に倒すよう改訂する。#620 の肝は「モック⇔実装の一致」なので、モックだけ ghost にして実装を pill のまま残すと再び乖離する。よって**実装・desktop モック・mobile モックの三者すべてを ghost に統一**する。

### Decision
- 共通スタイルに **`pillBtnGhost`**（`common/styles.ts`）を新設。`pillBtn` を土台に `data-ghost` で透明背景・`ink-secondary` 文字、hover/active と latch 状態（`data-on`）で `surface` + `ink`。`pillBtnGhostDanger` と同じ「変数バリアントで base を確実に上書きする」パターン（`.issue/273/adr.md` ADR-003 / `.issue/442/adr.md` ADR-001）に準拠。
- `NoteListToolbar.tsx` の「選択」「ビューとして保存」を `pillBtn + pillBtnGhost` に変更。「選択」の選択モードON は `data-primary`（accent 塗り）→ `data-on`（surface 塗り）に変え、ghost の latch 表現にする。「新規作成」（accent pill）「アップロード」（surface pill）は CTA 階層を残すため **pill のまま据え置き**。
- desktop / mobile モックとも「選択」「ビューとして保存」を `.pill-btn.ghost`（pill 形のまま透明 ghost）に揃える。
- 形態は **pill 形 ghost**（角丸 pill・`h-9`・44px タップ床を流用）を採用。モバイルが元採っていた角丸md・コンパクト ghost ではなく、ツールバーの pill 言語と形を揃えつつ低強調にする（ユーザー選択）。

### Consequences
- 良い点: ユーザーの好み（シンプルな ghost）を満たしつつ、実装・desktop・mobile の三者が完全一致。`pillBtn` の a11y（タップ床・disabled 処理）を流用でき、`pillBtnGhostDanger` の確立パターンに沿うため Tailwind の上書き順問題も回避。`NoteListToolbar.test.tsx`（#382 icon-only 契約）は無改変で緑（全 3464 テストパス）。CTA 階層（新規作成の accent pill）は維持。
- トレードオフ: 実装の見た目を変える（当初は回避していた）が、PR 未マージ・変更は2ボタンの配色のみで挙動不変、ブラウザ検証で OFF=透明/ON=surface/disabled も確認済みのため回帰リスクは低い。

---

## ADR-004: #292 ADR-002（DisplayModeSwitch はテキストのみ）を本 Issue で上書きする

### Status
Proposed

### Context
`.issue/292/adr.md` ADR-002 と `spec/design/index.md` §7.1（行 157 / 170）は「`DisplayModeSwitch` はテキストのみのタブで維持する」を方針として確立していた。本 Issue の決定（segmented + アイコンへ統一）はこれと矛盾する。過去 ADR は履歴として改変しない方針。

### Decision
本 Issue (#620) の ADR でこれを上書きする旨を明記し、**生きた SSOT である `spec/design/index.md` §7.1 を更新**する（行 157 / 170 の `DisplayModeSwitch` 例示・#292 参照を、segmented+アイコン採用へ整合させる）。`.issue/292/adr.md` 自体は過去記録として残置し、index.md から本 Issue を参照させる。

### Consequences
- 良い点: モック・実装・設計ドキュメントの三者で SSOT が一致する。
- トレードオフ: 過去 ADR (#292) と現行方針の差分は、index.md の参照（#620）を辿って初めて分かる。index.md の更新を省略すると不整合が再発するため、ステップ 7 を必須とする。
