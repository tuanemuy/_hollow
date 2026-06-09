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

## ADR-003: ツールバー「選択」「ビューとして保存」の実装は維持し、モック側のみ統一する

### Status
Proposed

### Context
Issue 不整合 #2 は、デスクトップ `.pill-btn`（surface 塗り）とモバイル `.tool-btn`（ghost、「ビューとして保存」はアイコンのみ）の差。Issue の主眼は **表示モードスイッチの segmented 統一**であり、ボタン群の統一は「それに合わせて」の従属項目。

### Decision
実装 `NoteListToolbar.tsx` の「選択」「ビューとして保存」ボタンは現行 `pillBtn`/`pillBtnPrimary` を**維持**する。統一はモック側のみで行い、**統一先は desktop モックの `.pill-btn`（surface 塗り）= 実装と一致する側**とする。すなわち mobile モックの `.tool-btn`（ghost）を `.pill-btn` トーンへ寄せる（ステップ 3a）。狭幅での「ビューとして保存」のラベル畳み（アイコンのみ）はレスポンシブ適応として残してよく、実装の `max-sm:hidden` と一致する。desktop モックの `.pill-btn` には手を入れない。

当初案（desktop モックを mobile の `.tool-btn` ghost に寄せる）は、現状 desktop モック=実装で一致しているツールバーボタンを逆に乖離させるため撤回した（レビュー P-001）。

### Consequences
- 良い点: 回帰リスクの高いツールバーボタン実装に触れず、Issue の主眼（segmented 統一）に集中できる。`NoteListToolbar.test.tsx`（#382 icon-only 契約）を壊さない。desktop モック・実装・mobile モックの三者がツールバーボタンで一致する。
- トレードオフ: mobile モックを修正する分の差分が増える（が、実装に寄せるため将来の乖離は減る）。完全な視覚統一の細部（hover トーン等）は実機確認で詰める。

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
