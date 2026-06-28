# Plan Review (round-1) — Issue #803: タグ入力候補パネルの viewport クランプ / 外側クリッククローズ

**視点:** あるべきアーキテクチャとの整合性・実現可能性・リスク
**対象:** `.issue/803/plan.md` / `.issue/803/adr.md`
**調査基準:** origin/main の `TagsInput.tsx` / `styles.ts` / `tagSuggestModel.ts` / `usePopover.ts` / `__tests__/TagsInput.test.tsx` / `__tests__/Popover.test.tsx`

---

#### 問題点（要修正）

- **[P-001] 動的高さ再クランプ（AC-3）が「測定 rect は natural=未シフト」という `computeShiftY` の前提を破る — transform フィードバックで誤クランプする。**

  - **説明:** plan ステップ2は `useLayoutEffect` の依存に `candidates.length` / `isNewDraft` を含め、パネルが**開いたまま**高さが変わったら `computeShiftY(panelRef.current.getBoundingClientRect(), window.innerHeight)` で再測定する設計。しかし再測定時、パネルには前回の measurement で当てた `transform: translateY(shiftY)`（shiftY≠0）が**すでに適用済み**。よって `getBoundingClientRect()` が返すのはシフト後の rect であり、natural（未シフト）位置ではない。

  - **理由:** `usePopover.ts` の `computeShiftY` は「測定 rect は natural 位置で、補正値は絶対値」という不変条件に依存している（usePopover の L161-166 コメント「`shiftX`/`shiftY` are 0 here (reset on the previous close), so the measured rect is the natural, unshifted position and each correction is an absolute value」）。usePopover が破綻しないのは依存配列が `[open, clampToViewport]` のみで、**開いたまま再測定しない**ため（content は静的前提）。本 plan は「typing で高さが変わるので候補件数を deps に含める」と意図的に開いたまま再測定する（plan ステップ2 理由欄）が、その瞬間 transform が効いているため二重計上になる。

    具体例（viewport 633, margin 8）: natural top=500/bottom=760 → 初回 shiftY=-135（正）。次に候補が減って natural bottom=720 のパネルに変化。再測定時は前回の -135 が適用されており rect は top=365/bottom=585。`computeShiftY({365,585},633)` は両端 in-range → **0**。結果パネルは natural の top=500/bottom=720 に戻り 95px はみ出したまま、effect は再走しない（candidates.length 安定）→ **AC-3 が実 DOM で失敗**。

  - **提案:** 再測定時に現在の shiftY を引いて natural rect に復元してから計算する。例:
    `computeShiftY({ top: rect.top - shiftY, bottom: rect.bottom - shiftY }, window.innerHeight)`。
    これに伴い `shiftY` を effect の依存に含める必要があるが、補正後 natural 値は不変なので 2 パスで `Object.is` 同値→ React がバイルアウトして収束し無限ループにはならない（初回 shiftY=0 では補正項ゼロで現状と等価）。あるいは usePopover と同様「高さ変化時はいったん shiftY=0 にリセット→次フレームで再測定」する二段構えでもよいが、ちらつきが出るため compensation 方式を推奨。
    併せて **テスト側の落とし穴**も是正が必要: plan ステップ5/テスト方針の AC-3 検証は `Element.prototype.getBoundingClientRect` を**固定 rect** に spy する（`Popover.test.tsx` 流用）。固定 rect は transform の有無で値が変わらないため、この transform フィードバックのバグを**検出できず緑になる（誤った安心）**。AC-3 を本当に守るなら、再測定パスで rect を変化させる（spy の `mockReturnValueOnce` を連ねる等）か、最低限「2 回目の測定でも正しい絶対 shift に収束する」ことを固定 rect ではなく段階 rect で固定するテストにすること。

---

#### 改善提案（検討推奨）

- **[S-001] 純粋クランプヘルパの所属モジュールを再考（構造的 DRY）。** `computeShiftY` / `VIEWPORT_MARGIN` は現状 `app/components/common/usePopover.ts` から export され、すでに `Popover.test.tsx` も import する事実上の共有 API。`note/editor/TagsInput` がここから import するのはレイヤー違反ではない（共に presentation）し ADR-001 の (B) 判断も妥当。ただし「popover フックのモジュール名」に viewport-clamp 数学が同居しており、本 Issue で 2 つ目の利用者が増える。中立な `viewportClamp.ts` 等への切り出しは構造的に綺麗だが**本 Issue のスコープ外でリスク増**なので、今回は現状 import で可、将来 popover 的要件が増えた時の抽出候補として ADR に一文残す程度で十分。必須ではない。

- **[S-002] outside-click `useEffect` の依存と listener churn。** plan ステップ4は依存 `[panelOpen]` で `closePanel()` を呼ぶ。`closePanel` は毎レンダー再生成されるため、`useExhaustiveDependencies`（biome）が指摘するか、deps に入れると draft 変化のたび listener が貼り直される churn が起きる。`usePopover` は `onDocMouseDown` 内で ref を読み deps を `[open, onOpenChange]` に限定している。本 Issue でも handler 内で `setOpen(false)` / `setActiveIndex(-1)` を直接呼ぶ（closePanel を経由しない）か、ref 経由にして deps を `[panelOpen]` に固定するのが安全。既存ファイルは別箇所で `biome-ignore ... useExhaustiveDependencies` を使っているので方針は一貫させられる。

- **[S-003] 測定 effect の null / 環境ガードを usePopover に合わせる。** plan ステップ2の擬似コードは `panelRef.current.getBoundingClientRect()` を直書きだが、`usePopover` は `const el = panelRef.current; if (el === null) return;` とガードしている。SSR では panelOpen が初期 false（`open` は client 操作でのみ true）でパネル自体が描画されず effect も早期 return するため `window`/`getBoundingClientRect` 不在は実害ないが、null ガードは踏襲すること。`useLayoutEffect` を "use client" で使う点も `usePopover` と同パターンで非回帰（新たな SSR 警告は増えない）。

---

#### 良い点

- **スコープ最小・レイヤー方向順守。** 変更は `TagsInput.tsx`（必要なら `styles.ts`）に閉じ、domain/usecase/adapter 非変更。`usePopover.ts` は無改変（既存 export 利用のみ）で他の popover 利用者（FilterBar / Menu / DirectoryTreeSelect）に非干渉。hexagonal の依存方向・関心の閉じ込めに沿う。
- **ADR-001 の (B)（純粋ヘルパ流用＋自前配線）判断は妥当。** `usePopover` は button トリガー前提（`triggerProps`・Escape→button フォーカス復帰・`panelId` 配線）で、ADR-003 の「実フォーカス input 固定インライン combobox／独自 aria 契約（`aria-expanded=panelOpen` / `aria-controls=listboxId` / `aria-autocomplete=list`）」と契約衝突する。全面移行 (A) は a11y 契約の再実装＝高リスク。純粋 math だけ再利用し outside-click を 10 行で自前実装する判断は DRY の本質を取りつつ非干渉で、トレードオフ（document リスナの概念重複）も正しく受容している。
- **ADR-002 の shift 採用も一貫。** アプリ全体（`usePopover.clampToViewport`）が shift 方式で統一、flip 既存実装なし。`computeShiftY` をそのまま使え、アンカー（`top-[calc(100%+6px)]`）と activedescendant の `scrollIntoView` 基準を変えずに済む。
- **outside-click の配置が正しい。** origin/main では `tagSuggestPanel` div は `tagsRow`（= containerRef）の**子**として描画される。よってパネル/option への mousedown は container 内 → 早期 return で閉じない。加えて option は既に `onMouseDown preventDefault` で input blur を抑止しているため、outside-click と blur コミット・option クリックの三者は競合しない。plan の「mousedown→blur 順／closePanel は open のみ変更／コミット可否は onBlur 条件依存で不変」という相互作用分析は実コードと一致しており、二重コミットは発生しない（blur 側で 1 回のみ）。
- **a11y/IME/キーボード非回帰の担保。** `onKeyDown`（↑↓/Enter/`,`/Escape/Backspace、`isComposing` ガード）・aria 配線・`onBlur` valid draft コミットには一切触れず、ref と effect を「外側に乗せる」設計。回帰面は最小。
- **テスト方針が既存慣習に整合。** happy-dom レイアウト無し→ `getBoundingClientRect` spy 差し替え＋ `window.innerHeight` 上書きという手法は `Popover.test.tsx` と完全一致で実現可能（ただし AC-3 については P-001 の通り固定 rect の限界に留意）。クランプ math 自体は `computeShiftY` 既存純粋関数テストで担保済みという切り分けも妥当。
</content>
</invoke>
