# Plan Review — Issue #652 (Round 1, アーキテクチャ整合性・実現可能性・リスク)

レビュー視点: **プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク**
対象: `.issue/652/plan.md` / `.issue/652/adr.md`
照合した実コード: `usePopover.ts`, `Popover.tsx`, `Popover.test.tsx`, `PublicTopControls.tsx`, `FilterBar.tsx`, `UserMenu.tsx`, `Menu.tsx`, `common/styles.ts`, `public/styles.ts`
照合した ADR: #467 ADR-001, #588 ADR-003

---

#### 問題点（要修正）

- **[P-001]** 既存テスト `applies a translateX clamp …`（`Popover.test.tsx:305`）が `transform` 値変更で確実に壊れるが、計画の修正対象に明記されていない
  - 理由: 既存テストは `expect(panel()?.style.transform).toContain("translateX(")` と**文字列 `translateX(` を直接マッチ**している。計画 (C)/ステップ1 は `panelStyle` を `translate(${shiftX}px, ${shiftY}px)` に変更する。`translate(` には `translateX(` という部分文字列は含まれないため、この既存テストは**必ず失敗する**（AC-2「回帰なし」に反する明確なリグレッション）。ところが計画のステップ6（テスト追加）・テスト方針は「既存の computeShiftX / dismiss / role / multiselectable テストが回帰しないこと」と書きつつ、この `translateX(` 文字列マッチへの修正を**ステップに含めていない**。設計判断 (C) で「Popover.tsx は無変更」とは言及があるが、テストファイルの既存アサーション更新は計画から抜け落ちている。
  - 提案: ステップ6に「既存 `applies a translateX clamp` テストのアサーションを新 transform 形式（`toContain("translate(")` への変更、または `translate(<shiftX>px, 0px)` の完全一致）に更新する」を明示的に追加する。Issue の重点質問「既存テストの期待値が `translateX(` 文字列マッチをしていないか」への回答は **YES（している）**。この1点は実装で確実に踏む地雷なので計画段階で固定すべき。

#### 改善提案（検討推奨）

- **[S-001]** `panelStyle` 合成で「水平のみ非0」のケースの transform 文字列が現状と変わる点を明記する
  - 理由: 計画 (C) は「両方0→undefined / どちらか非0→`translate(x, y)`」とする。これにより、従来 `translateX(8px)` だった水平のみクランプのケースが `translate(8px, 0px)` という別文字列になる。視覚効果は同一（`translate(x, 0)` ≡ `translateX(x)`）で機能上は無害だが、(a) P-001 のテスト破壊の根本原因であり、(b) 将来 `translateX(` を grep する別箇所がないか一応の確認が要る。実コード調査では `translateX(` の参照は `usePopover.ts` 本体とテスト1箇所のみ（他 consumer は `panelStyle` をオブジェクトとして透過するだけ）なので影響は閉じているが、計画のリスク欄に「transform 文字列形式が変わる（値は等価）」を1行残すと実装者が取りこぼさない。

- **[S-002]** `computeShiftY` の引数名・JSDoc を「natural rect から算出」前提に揃える
  - 理由: 計画 (B) の核心ロジック「`shiftX` 適用前の natural rect 一回分から両軸同時算出」は **正しい**。既存 effect は依存 `[open, clampToViewport]` で open 遷移ごとに一度だけ走り、effect 内では `shiftX`/`shiftY` はリセット済みの 0 なので `getBoundingClientRect()` は未シフトの自然位置を返す（既存コードの `usePopover.ts:132-135` コメントが水平について同じ前提を明文化済み）。垂直も同一 rect を共有するだけなので再計測ループは起きない。この前提が正しいことは確認できたが、`computeShiftY` の JSDoc に「natural (unshifted) rect を受け取る」前提を `computeShiftX` の JSDoc（`usePopover.ts:52-59`）と対称に書くと、後続の変更者が rect を「適用後」と誤解するのを防げる。

#### 良い点

- 核心ロジックの実現可能性は高い。「既存の水平クランプ layout effect に相乗りして rect 一回取得→両軸同時算出→`setShiftX`/`setShiftY`」は、既存実装（`usePopover.ts:136-151`）の構造をそのまま踏襲でき、再計測ループは構造的に起きない（依存配列が `[open, clampToViewport]` で state 変更を含まない）。Issue の重点質問「rect 再計測ループは起きないか／natural rect から両軸算出する前提が正しいか」への回答は両方 OK。
- **UserMenu への無影響の主張は正しい**。UserMenu は `<Menu>` 経由で `usePopover` を呼ぶが、`Menu.tsx:98` は `usePopover({ open, onOpenChange, haspopup: "menu" })` と `clampToViewport` を渡していない（default false）。したがって垂直クランプ effect は早期 return し、`bottom-full`（上方向）パネルに translateY は一切乗らない。actions メニュー全般（`<Menu>` 利用）も同様に無影響。opt-in 設計のため波及範囲が clamp consumer（Sort/Visibility/Date/TagPicker）に正しく限定される。
- **狭幅スキップを垂直に共有する判断は #588 ADR-003 と整合**。`max-sm:fixed max-sm:bottom-0` のボトムシート（`popoverSheetPanel` / `SORT_MENU_PANEL` / `DATE_POPOVER_PANEL`）に translateY が乗ると `bottom-0` 固定とずれるため、既存の `window.innerWidth < POPOVER_SHEET_BREAKPOINT` 早期 return（`usePopover.ts:145`）に垂直も乗せるのは正しい。#588 ADR-003 が「既存計測を狭幅でゲートしただけ＝新規ランタイム分岐ではない」と許可した範囲をそのまま継承しており、CLAUDE.md の「JS ランタイム分岐を新規導入しない」方針にも沿う。
- **アンカー所有権の理解が正確**。フリップ案を外す根拠「アンカー（`top-full`）は consumer の `panelClassName` 所有で usePopover からは不可視」は #467 ADR-001（chrome/位置は consumer 所有）と実コード（`SORT_MENU_PANEL` 等が `top-full` を持つ）に一致。スコープ判断（垂直クランプに限定、フリップ/max-height はスコープ外）は Issue 要件（末尾項目の到達性）を最小変更で満たす妥当な線引き。
- **transform 拡張が Popover.tsx 無変更で波及する主張は正しい**。`Popover.tsx` の3分岐すべてが `style={popover.panelStyle}` を透過する（`Popover.tsx:110/126/147`）ため、`panelStyle` 内部の transform 形式変更は Popover 側コード変更不要で全 consumer に届く。

#### エッジケース・副作用の検証（Issue 重点質問への回答）

- **outside-mousedown 判定への影響: 問題なし**。`onDocMouseDown`（`usePopover.ts:158-168`）は `containerRef.contains(target)` で判定する。`containerRef` は `relative inline-flex` のラッパ div（`Popover.tsx:86`）で、パネルはその子。`transform: translateY(...)` はパネルの**描画位置**を動かすが DOM ツリー上の親子関係（`contains` が見るのはこれ）は不変。むしろ translateY で末尾項目が画面内に戻ることで、Issue の症状（画面外座標でのクリックが outside 扱いになる）が解消される。これが本修正の主目的そのもの。
- **shiftY 適用後のトリガー重なり: 視覚的重なりはあり得るが機能影響なし**。計画 ADR-001 Consequences / リスク欄が「下端クランプ時にパネルがトリガーに一部重なりうる（非モーダルメニューでは許容）」と正しく認識済み。重なってもパネルは `containerRef` 内なので outside-mousedown には影響せず、項目クリックは到達可能。これは許容トレードオフとして妥当。
- **`containerRef.contains` への transform 影響: なし**（上記 outside-mousedown と同根拠。CSS transform は hit-testing の座標は動かすが DOM 包含関係は動かさない）。

#### 補足（スコープ確認）

- 計画は presentation 層のプリミティブ1ファイル（+テスト）に閉じており、domain/application/adapter 層への影響なし。Issue が「ロジック・ルーティング・バックエンドは健全＝無変更」と確認済みの範囲と一致。スコープの過不足なし。
- ステップ番号が 1,2,3,6,7 と飛んでいる（4,5 欠番）。意図的な間引きと思われるが、最終 plan では連番に整えるか欠番である旨を一言添えると読み手が混乱しない（軽微）。
