# Round 2 レビュー — アーキテクチャ整合性・実現可能性・リスク（Issue #825）

対象: `.issue/825/plan.md` / `.issue/825/adr.md`
視点: あるべきアーキテクチャとの整合性・実現可能性・リスク
主眼: round-1 指摘（P-001/P-002/S-001〜004）の反映が技術的に妥当か・新たなリスクがないか

---

## 総評

round-1 指摘はすべて誠実に反映されている。実コードで裏取りした結果:

- **P-001 反映（Menu 非 Portal → レール外配置）**: `Menu.tsx:140-171` はパネルを `<div className="relative">` 内の `absolute`（`menuPanel` + `panelClassName`）でインライン描画し、`usePopover.ts` にも `createPortal` は無い。`editorToolbar`（`styles.ts:54`）は `max-sm:overflow-x-auto` を持つ。→ 「レール内 Menu はクリップされる／レール外配置が必須」という前提は**正しい**。
- **P-002 反映（SSOT モック乖離清算）**: step 10 として `spec/design/pages/mobile/P12-editor.html` 更新／注記が追加され妥当。
- **S-001 反映（空 Menu ラッパー 2px）**: `Menu` が常に `<div className="relative">` を描画する事実を確認。`sm:hidden` コンテナで包む対応は正しくラッパーごと DOM から除ける。
- **S-002/S-003/S-004 反映**: テスト影響範囲（#286/#696/#697 の全 describe）、実効 44px（`TOUCH_TARGET_SQUARE = max-sm:min-w-[44px] max-sm:min-h-[44px]`、`common/styles.ts:28`）、TipTap 選択保持の manual-test 追加、いずれも実装事実と一致。

ただし **round-1 の最重要修正（レール外配置）自体が、`editorToolbar` の `sticky` 挙動を壊す新リスクを内包**している。ここだけ計画の記述が実現可能性を担保できていないため、round-2 で 1 件の要修正を出す。それ以外はアーキ整合・実現可能性ともに問題なし。

---

#### 問題点（要修正）

- **[P-001] 「レール外配置」の外側ラッパー導入がツールバーの `sticky` 追従を壊す（新規リスク・実現可能性）**
  - 問題: `editorToolbar`（`styles.ts:54`）は `sticky top-[calc(var(--header-height)+var(--space-2))] z-20` を持ち、JSDoc も「a sticky pill that follows the scroll just below the app header」と明記する。この追従が成立するのは、現状 `editorToolbar` の**親が `WysiwygEditor` ルートの `flex flex-col`（`WysiwygEditor.tsx:515`、`EditorContent` を含み背が高い）**だから。plan step 2 / ADR-001 は「非クリップの外側ラッパー（`flex items-center gap-[2px]`）を新設し、その中にレール（`editorToolbar`）と `<Menu>` を兄弟で並べる」とするが、この外側ラッパーは**1 行分の高さしか持たない**。CSS の sticky は containing block（＝親）の padding box に閉じ込められるため、`editorToolbar` の親が背の低い新ラッパーになった瞬間、**追従範囲がその 1 行に限定され、スクロールで即座に流れて消える**（＝現行の「ヘッダー直下に貼り付いて追従」挙動が回帰する）。
  - 理由: round-1 P-001 の解消策（レール外配置）を計画の文言どおりに素直に実装すると、既存の documented なスティッキー挙動を壊す。計画は「`editorToolbar` そのまま利用を撤回」とだけ書き、sticky の移設に触れていないため、実装者が気付かず回帰させる可能性が高い。加えて、代替案として併記される「現 `editorToolbar` を維持し Menu ラッパーだけを兄弟に出す」案（option B）も、`flex flex-col` 直下の兄弟は**ツールバー行の下に別行で落ち、`⋯` が行末に付かず追従もしない**ため UX を満たさない。
  - 提案: 外側ラッパー方式（option A）に一本化したうえで、以下を step 2 / ADR-001 に明記する:
    1. **`sticky top-… z-20`（および `mb-4`）を外側ラッパーへ移設**し、外側ラッパーを sticky 要素にする（ラッパーは overflow コンテナでないため Menu パネルはクリップされない）。レール（`editorToolbar`）は非 sticky の内側スクロールコンテナに降格。→ 追従を維持しつつクリップも回避できる（この形なら両立する）。`editorToolbar` は本ファイル専用（用途は `WysiwygEditor.tsx:550` の 1 箇所のみ、grep 確認済み）なので styles.ts 側の分割で完結する。
    2. レールの `max-sm:self-stretch`（＝親の cross 軸が水平＝現 flex-col だから全幅になる）は、flex-**row** ラッパー内では cross 軸が垂直になり全幅化しない。モバイルで `⋯` を行末に置きつつレールを可変幅で埋めるには、レールを `flex-1 min-w-0` にする（`self-stretch` からの置換）ことを明記。
    3. `role="toolbar" aria-label="書式"` は現状レール（`editorToolbar`）に載っている。`⋯` トリガーをレール外に出すと**オーバーフロー操作がツールバーのグルーピングから外れる**。`role="toolbar"` を外側ラッパーへ移し、`⋯` を含めて 1 つのツールバーとして提示すること。

#### 改善提案（検討推奨）

- **[S-001] `proceedModeSwitch` 抽出時に装飾ゲートの `surface === "edit"` スコープを保持すること（回帰防止）**
  - `NoteEditor.tsx:311` の装飾ロスゲートは `if (surface === "edit" && nextMode === "wysiwyg")` に限定されている（新規ノート面は #696 以前挙動＝ AC-6 を維持するため、`setMode` 直行）。plan step 5 は「装飾ゲート + `setMode` の末尾を `proceedModeSwitch(nextMode)` に抽出」とするが、この `surface === "edit"` 条件を抽出後も**そのまま内包**しないと、新規ノート面で装飾ダイアログが誤って出て AC-6 を壊す。計画は「末尾処理を抽出」としか書いていないので、抽出範囲にこの条件分岐を含める旨を一言明記すると安全。挙動意味論の維持という plan のリスク方針とも整合する。

#### 良い点

- round-1 の最重要 2 点（Menu 非 Portal 由来のクリップ／SSOT モック乖離）を実コード参照付きで正確に取り込み、`editorActions` ADR-003 の「single DOM, no double render」＝ CSS breakpoint 分岐方針にも忠実（実行時 JS breakpoint 判定を持ち込まない）。
- `onModeChange`（`NoteEditor.tsx:255-325`）の現行構造（blur → dirty 再評価 → abortInFlight → 装飾ゲート → `setMode`）を正確に把握し、`pendingUnsavedSwitch` + `proceedModeSwitch` による遅延遷移が既存 `pendingWysiwygSwitch`（`confirmWysiwygSwitch`、L327-）と同型で、順序・二重プロンプト回避（AC-5）を保つ設計になっている。
- `LinkDialog` を Portal Dialog に置く場合でも submit が React 合成イベントで親フォームへ伝播する点（DOM ツリーではなく React ツリーを辿る）を踏まえ `stopPropagation` を先回りで指定しており、`ConfirmDialog` と同型で正しい。
- 参照する共通プリミティブ（`dialog`/`dialogBackdrop`/`dialogGrabber`/`dialogActions`/`menuPanel`/`menuItem`/`popoverSheetPanel`/`fieldControl`/`formError`）は `common/styles.ts` に実在を確認。新規 CSS/`@apply` を持ち込まず utility-first 規約に完全準拠。
- `MenuItem` が `aria-pressed`/トグル semantics を持たない（`Menu.tsx:205-217` は `role="menuitem"` の素の `<button>`）ことを ADR-001 で明示し、「適用中」表示を children の視覚表示＋開いた時点判別に留めるトレードオフを隠さず記録。`runAndClose`（`Menu.tsx:122`）でメニューが閉じる挙動も既存 primitive の仕様どおり。

---

## 返答

- 問題点: 1 / 改善提案: 1
- **[P-001]** レール外配置の外側ラッパー導入が `editorToolbar` の `sticky` 追従を壊す（sticky・幅・role=toolbar の移設を明記して解消）
- **[S-001]** `proceedModeSwitch` 抽出時に装飾ゲートの `surface === "edit"` スコープを保持（AC-6 回帰防止）
