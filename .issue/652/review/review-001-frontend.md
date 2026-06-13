# PR #686 レビュー — Frontend 観点 (Round 1)

対象: Issue #652「共有 Popover の垂直ビューポート処理」/ 主変更 `app/components/common/usePopover.ts` + `app/components/common/__tests__/Popover.test.tsx`

検証環境: `pnpm vitest run app/components/common/__tests__/Popover.test.tsx` → 22 passed。

## 総評

計画 (`.issue/652/plan.md`) / ADR (`.issue/652/adr.md`) と実装はほぼ完全に一致している。AC-1〜AC-5 はすべてコードまたはユニットテストで担保されており、`computeShiftX` との対称性、layout effect への相乗り、`translate(x, y)` 合成、狭幅スキップの共有はいずれも設計どおり。Blocker はなし。指摘は軽微な Warning とドキュメントの追従漏れに留まる。

---

## Frontend

### Blockers

なし

### Warnings

- **[W-001]** `clampToViewport` の JSDoc / 行コメントが「horizontal だけ」のまま残り、垂直対応を反映していない / 場所: `app/components/common/Popover.tsx:18-19`, `Popover.tsx:35`（`/** Opt-in horizontal viewport clamp (FilterBar). */`）, `app/components/common/usePopover.ts:118-122`（`UsePopoverOptions.clampToViewport` の JSDoc が「nudged **horizontally** after open」のみ）, `app/components/note/list/FilterBar.tsx:581,584`（`clampToViewport shiftX is unnecessary` / `clampToViewport nudges it`） / 理由: 本 PR で `clampToViewport` の責務は水平+垂直の両軸に拡張された。`usePopover.ts` 本体の主 JSDoc（`:13-38`）と `VIEWPORT_MARGIN`/`POPOVER_SHEET_BREAKPOINT`/`computeShiftY` のコメントは「shiftX horizontal + shiftY vertical」と正しく更新されているのに対し、`clampToViewport` という**公開 API の入口の説明**だけが片肺のまま。consumer の実装者がこの prop を読んだとき「水平だけ」と誤解する。CLAUDE.md の「Library-level JSDoc on exported APIs is welcome」の精神からも、公開オプションの説明は実態に合わせるべき / 提案: `UsePopoverOptions.clampToViewport`（`usePopover.ts:117-122`）と `PopoverProps.clampToViewport`（`Popover.tsx:35`）の JSDoc を「nudged horizontally **and vertically**」相当に更新。`FilterBar.tsx:581/584` の `shiftX is unnecessary` は「the `clampToViewport` shift (both axes) is unnecessary」へ。`Popover.tsx:18-19` のファイル JSDoc の「horizontal shift is unnecessary」も同様。実害はないがコメントだけの修正なので低コスト。

- **[W-002]** `panelStyle` が毎レンダー新規オブジェクトを生成し、shift 非0 の間は `<div style={...}>` に参照不一致の style が渡り続ける / 場所: `app/components/common/usePopover.ts:188-191` / 理由: `panelStyle` は `useMemo` でなく素の三項式なので、popover が open でクランプ中（shiftX/shiftY のいずれか非0）の間、親が再レンダーするたびに新しい `{ transform: ... }` オブジェクトが生成される。React は `style` を浅い比較せず**プロパティ単位で DOM に適用**するため、`transform` 値が同一なら実 DOM 書き込みは発生せず**機能・パフォーマンス上の実害はない**（これが「Warning 止まり」の理由）。ただし FilterBar / PublicTopControls は `useOptimistic` + `useTransition` で navigation 中に高頻度で再レンダーするコンテキストであり、厳密には不要なオブジェクト生成が走る。既存の水平版も同じ書き方だったので本 PR が新規に持ち込んだ劣化ではない / 提案: 必須ではない。気になるなら `const panelStyle = useMemo(() => (shiftX !== 0 || shiftY !== 0 ? { transform: \`translate(${shiftX}px, ${shiftY}px)\` } : undefined), [shiftX, shiftY])` 化。ただし shift が両0のときは `undefined`（安定参照）で、クランプ発火は open 遷移ごとに1回なので、現状でも余分な再レンダーを**誘発はしない**（style の参照変化が子の再レンダーを引き起こすわけではない）。優先度低。

### Notes

- **[N-001]** `computeShiftY` のロジックは `computeShiftX` と完全対称で正しい。`bottom > viewportHeight - margin` を先に補正 → `top + shift < margin` を後で補正、の順序により、縦長パネル（両端はみ出し）で上端補正が後勝ちして先頭が見える挙動になる。`Popover.test.tsx:60-68`（`prefers the top edge when the panel is taller than the viewport`）が `{top:200, bottom:900}, vh=600` → `+ (8-200) = -192` ではなく上端優先で `VIEWPORT_MARGIN - 200` を返すことを固定しており、計画 S-002 の「将来の max-height パスとの境界」が回帰テストで守られている。順序依存の挙動を明示テストしているのは良い。

- **[N-002]** layout effect への相乗り（ADR-002）が正しく実装されている。`getBoundingClientRect()` を1回だけ取得し（`usePopover.ts:181`）、その natural rect から両軸を同時算出（`:182-183`）、依存配列は `[open, clampToViewport]`（`:186`）で open 遷移ごとに1回のみ実行 → 再計測ループは起きない。`shiftX`/`shiftY` の reset は `!open` 分岐（`:170-173`）で確実に行われるため、`if (nextShiftX !== 0) setShiftX(...)` の「0 のとき set しない」ガード（`:184-185`）でもステイル shift は残らない（close で必ず 0 に戻るので、次の open は 0 始まり）。この reset → 条件付き set の組み合わせは正しい。

- **[N-003]** 狭幅スキップの共有が正しい。`window.innerWidth < POPOVER_SHEET_BREAKPOINT` の早期 return（`usePopover.ts:178`）が rect 取得前にあるため、shiftX/shiftY 両方が reset 値 0 のまま据え置かれ、`max-sm:fixed max-sm:bottom-0` のボトムシートに translateY が乗らない（AC-4）。`Popover.test.tsx:392-437` の `skips the clamp below the sheet breakpoint` が両端はみ出し rect + `innerWidth:500` で `transform` が falsy になることを固定しており、水平・垂直が同一ゲートを共有することを検証できている。

- **[N-004]** transform 合成（計画 C）が正しい。`translate(${shiftX}px, ${shiftY}px)` の2引数形式は水平のみ/垂直のみ（片方0）も表現でき、両0で `undefined`（`usePopover.ts:188-191`）。`Popover.tsx` は `style={popover.panelStyle}` を3分岐（menu/listbox/dialog）すべてに透過するだけで無変更 → 計画どおり全 clamp consumer に波及。既存テストの破壊（`translateX(` 文字列マッチ）も `Popover.test.tsx:337` で `toContain("translate(")` に更新済みで、計画リスク（必須更新）が確実に処理されている。`grep` で `app/` 内に残る `translateX` は本テストのコメント1行のみ＝本体に旧形式の参照は残っていない。

- **[N-005]** consumer 無影響が確認できた。`clampToViewport` を渡すのは Sort（`PublicTopControls.tsx:563`）/ Date（`:411`, `FilterBar.tsx:623`）/ Visibility（`FilterBar.tsx:778`）/ TagPicker（`FilterBar.tsx:507`）のみ。UserMenu は `<Menu>` 経由で `clampToViewport` を一切渡しておらず（`Menu.tsx` に prop 無し、`UserMenu.tsx:81` は `bottom-full` 上方向）、actions メニュー同様にクランプ opt-out のまま → AC-5 の「UserMenu 無回帰」は構造的に保証されている。consumer 側コードは無変更で垂直クランプを自動取得しており、共有基盤に正しく載せた設計。

- **[N-006]** アクセシビリティへの悪影響なし。本 PR は `transform`（視覚位置のみ）の追加で、`role` / `aria-*` / roving tabindex（`useRovingMenu`）/ focus 復帰 / dismiss 経路にはいっさい触れていない。WAI-ARIA Menu/Listbox/Dialog の DOM 構造・属性は不変で、`onMouseDown` preventDefault ガードも無変更。React 19 / RSC・`"use client"` 規約、CLAUDE.md の「JS ランタイム分岐を新規導入しない」方針（既存 layout effect 内で完結、新規 effect/分岐なし）にも整合。

- **[N-007]** ユニットテストの DOM スタブ設計が既存方針を踏襲しつつ垂直を追加できている。`applies a vertical clamp when the panel overflows the bottom edge`（`Popover.test.tsx:348-390`）が `innerHeight:633`（AC-1 の再現高さ）でスタブし transform に `translate(` が乗ることを検証。happy-dom にレイアウトが無い制約を純粋関数テスト + getBoundingClientRect スタブで回避する既存パターンを正しく拡張。

---

## 補足（スコープ外・将来）

- 縦長パネル（パネル高 > ビューポート高）の末尾項目到達不可は ADR-001 で意図的にスコープ外とされ、`computeShiftY` の上端優先挙動で「先頭が見える」ことのみ保証される。DatePopover 等が将来縦長になる場合は consumer 側 `panelClassName` に `max-height` + 内部スクロールを付与する（TagPicker の `max-h-[min(60vh,400px)]` が前例）。本 PR の判断として妥当。手動検証（計画ステップ5 / `manual-test/`）での実機確認に委ねられている部分であり、Frontend コードレビュー観点では追加指摘なし。
