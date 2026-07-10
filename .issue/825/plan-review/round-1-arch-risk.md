# Round 1 レビュー — アーキテクチャ整合性・実現可能性・リスク（Issue #825）

対象: `.issue/825/plan.md` / `.issue/825/adr.md`
視点: あるべきアーキテクチャとの整合性・実現可能性・リスク

---

## 総評

計画は Issue の対象 1（ツールバー圧縮）・対象 2（ネイティブダイアログのカスタム UI 化）を過不足なくカバーし、既存プリミティブ（`Menu` / `ConfirmDialog` / `Dialog`）の流用・遅延遷移 state パターン・utility-first / CSS breakpoint 方針への追従はおおむね妥当。ADR の遷移順序（abort → 装飾ゲート）・二重プロンプト回避・ネストフォームの `stopPropagation` といった落とし穴も正しく捕捉している。

ただし **実現可能性に関わる致命的な CSS 制約が 1 点**（オーバーフローメニューのパネルが `editorToolbar` の overflow により見切れる）と、**SSOT モックとの乖離の未清算が 1 点** あり、いずれも計画修正が必要。

---

#### 問題点（要修正）

- **[P-001] オーバーフロー `<Menu>` のパネルが `editorToolbar` の `overflow-x-auto` により見切れる（実現可能性）**
  - 問題: 計画ステップ2/3 は「`editorToolbar` はそのまま利用」「rail 末尾にオーバーフロートリガーを置く」としているが、`editorToolbar`（`styles.ts:54`）はモバイルで `max-sm:overflow-x-auto` を持つ。CSS 仕様上 `overflow-x: auto` を指定すると `overflow-y` の used value も `visible` から `auto` に昇格し、ツールバーは**両軸のクリッピング／スクロールコンテナ**になる。`Menu` / `usePopover` はパネルを Portal ではなく `.relative` ラッパー内の `absolute right-0 mt-1` としてインライン描画する（`Menu.tsx:153`、`usePopover.ts` に createPortal なし）ため、rail 直下に開くドロップダウンパネルは**ツールバーの箱の外＝クリップ対象**になり、モバイルでメニューが実質見えない（縦スクロールしないと出ない）。`NoteActionsMenu` が成立するのは親が overflow コンテナでないため。
  - 理由: AC-1 / AC-3（`⋯` から低頻度書式へ到達）が満たせない。`overflow: auto` は横スクロールが発生しない場合でも箱外要素を切り取るので、主要ボタンが 390px に収まるかどうかに関わらず再現する。
  - 提案: `⋯` トリガー + `<Menu>` を `editorToolbar`（スクロールレール）の**外側**に出す（例: ツールバー行とオーバーフロートリガーを `flex` の兄弟として並べ、レールだけを `overflow-x-auto` の内側に閉じる）か、`Menu` プリミティブにパネル Portal 化を足す。前者が既存プリミティブ非改変で済み推奨。計画の「editorToolbar はそのまま利用」を撤回し、レイアウト分割を明記すること。

- **[P-002] 設計 SSOT モック（`spec/design/pages/mobile/P12-editor.html`）との乖離が未清算（アーキテクチャ整合性）**
  - 問題: #818 は当該モックを「設計 SSOT」と明記した。モックのモバイルツールバーは「見出しドロップダウン統合（`.tb-heading`）＋ `overflow-x: auto` 維持」（mock L700-715, L1256-1273）を採用しているが、計画は ADR-001 で「モバイル限定オーバーフローメニュー」に差し替える。差し替え自体は ADR-001 の論拠（見出し統合は圧縮効果 11→10 と小さくデスクトップにも波及する）で妥当だが、計画には **SSOT モックを実装方針に合わせて更新／注記するステップが無い**。乖離が `.issue/825/adr.md`（一時ファイル）にしか残らず、設計 SSOT が実装と矛盾したまま放置される。
  - 理由: プロジェクトは spec/design を SSOT とし、設計判断による乖離は spec に反映する運用（spec-sync）。#818 が SSOT に格上げしたモックを更新しないと、次の実装者・レビュアーが誤ったモックを基準にしてしまう。
  - 提案: 実装ステップに「`spec/design/pages/mobile/P12-editor.html` のツールバー節を overflow-menu 方針へ更新（または『実装は #825 で overflow-menu を採用』の設計注記を追記）」を加える。あるいは実装後に spec-sync で反映することを計画に明記する。なお `.tb-heading` 見出しドロップダウンを採らない判断自体は支持する。

#### 改善提案（検討推奨）

- **[S-001] デスクトップ「1px も変わらない」の厳密性 — 空の Menu ラッパー div による 2px ギャップ**
  - `<Menu>` は常に `<div className="relative">` を描画する。トリガーボタンに `sm:hidden` を付けてもラッパー div 自体は残り、`editorToolbar` の `gap-[2px]` によりデスクトップで 2px 分の隙間が増える（AC-2 / ADR-001「デスクトップは 1px も変わらない」に対する微小な逸脱）。`<Menu>` 全体を `sm:hidden` のコンテナで包む（＝オーバーフロー機構をモバイル専用に隔離する）ことで、P-001 のレイアウト分割とあわせて解決できる。

- **[S-002] テスト書き換えの影響範囲を計画に明示（回帰リスク）**
  - `noteEditorModeChange.test.tsx` は「confirm conditions」だけでなく、#286（in-flight autosave cancel、`vi.useFakeTimers()` 使用）・#696（装飾ゲート）・#697（FrontMatter 永続）の各 describe が `confirmMock`（`window.confirm`）を前提にしている。計画ステップ9は広く「書き換え」と書くが、**fake timers と `Dialog` の `useEffect`(mounted)/rAF フォーカスの相互作用**（ダイアログ DOM は mounted effect で出るが、ボタン click 経路で act 内なら動く見込み）を含めて全 describe が対象になる点を明記すべき。加えて `noteEditorImageButtonWiring.test.tsx` / `wysiwygEditorImageButton.test.tsx` はツールバー再構成後も緑であることの再確認対象。

- **[S-003] タップ床の実寸誤り（リスク節）**
  - リスク節は「36px 角で 390px に収まるか」とするが、`EDITOR_TOOLBAR_BTN` は `TOUCH_TARGET_SQUARE`（`max-sm:min-w-[44px]`）を持つためモバイルは実効 44px。主要6 + `⋯` = 7 枠 × 44 ≈ 308px + gap/padding で 390px に収まる（むしろ余裕がある）。数値を 44px に訂正し、「主要セットは実質スクロール無しで収まる」前提を明確化するとよい。

- **[S-004] LinkDialog 開閉時の TipTap 選択保持を検証項目に**
  - リンクダイアログ化により、ボタン押下→ダイアログでフォーカストラップ→submit で `editor.chain().focus().extendMarkRange("link").setLink()` を実行する。ProseMirror は選択を state に保持するため `.focus()` で復元される想定だが、(a) 選択テキストへのリンク付与が意図どおり効くこと、(b) 選択が無い（新規リンクだが未選択）状態での挙動が現行 `window.prompt`（実質 no-op 挿入）と同一であること、を manual-test の確認項目に加えることを推奨。

#### 良い点

- ADR-002 の遷移順序（`abortInFlight()` → 装飾ゲート → `setMode`）と、未保存確認 onConfirm 内で `setPendingUnsavedSwitch(null)` と `setPendingWysiwygSwitch({...})` が同一ハンドラでバッチされ二重ダイアログにならない設計が、既存 `pendingWysiwygSwitch` の意味論と厳密に整合している（AC-4 / AC-5）。
- ネイティブダイアログのデスクトップ波及を「レイアウト変更ではなく実装差し替え」と正しく整理し、同期 `confirm` を環境限定で置換できない事情も踏まえてスコープを明快にしている。
- LinkDialog を外側 `<form>` にネストする際の submit `stopPropagation`（`ConfirmDialog.tsx:112` と同型）を先回りで捕捉している。
- #818 で実装済みの項目（`min-h-[52vh]` / `overflow-wrap` / `APP_MAIN` padding / 保存 CTA バー `editorActions`）を正確にスコープ外へ除外しており、Issue 対象1・2 に集中している（過剰な理想追求なし）。
- `MenuItem` が `aria-pressed`/トグル semantics を持たない点を ADR-001 で明示し、children の視覚表示に留めるトレードオフを受容として記録している（a11y の限界を隠していない）。
- TipTap 操作（`setLink`/`unsetLink`/`extendMarkRange`）を親 `WysiwygEditor` に残し、`LinkDialog` は入力・検証・コールバックのみを担う責務分離が明確。
