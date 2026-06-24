# Round 1 レビュー — アーキテクチャ整合性・実現可能性・リスク（Issue #660）

レビュー視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク
対象: `.issue/660/plan.md` / `.issue/660/adr.md`

---

#### 問題点（要修正）

- **[P-001]** `menuItem` への一律 `focus-visible:outline-accent` 追加が danger（削除等）メニュー項目に accent outline を当てる
  - 理由: `app/components/common/styles.ts` の `menuItem` は danger 変種を持つ（`data-[danger]:text-error` / `data-[danger]:focus-visible:bg-error-surface`）。実際に danger 項目が存在する（`NoteActions` の「削除」= `NoteActions.test.tsx` が「削除 flagged danger」と明記、`Menu.tsx` の `data-danger` 経路）。ステップ4は `focus-visible:outline-accent` を**無条件**に足す方針なので、削除項目のキーボードフォーカス時に「error-surface 背景 + accent（青系）outline」という色の混在が出る。参照実装の ADR-011 `OPTION_ITEM` は danger を持たないため、この差分は ViewSwitcher からの単純横展開では発生せず、`menuItem` 固有の見落としになっている。
  - 提案: (a) danger 時は accent ではなく error 系 outline に切り替える変種を併記する（例: 既存 2-stack 変種の流儀に倣い `data-[danger]:focus-visible:outline-error` 等。`outline-error` トークンの有無は要確認、無ければ `outline-accent` のままでも WCAG 2.4.7 上は許容しうるので「許容する」と明記）か、(b) 計画/ADR-003 に「danger 項目でも accent outline を使う（color は bg と text が error を担い、outline はフォーカス可視性専用）」というトレードオフを明示的に書いて意図的選択であることを残す。現状は判断が記述されておらず「見落とし」に見える。

#### 改善提案（検討推奨）

- **[S-001]** `useRovingTablist` の責務を「フォーカス移動」と「onSelect 呼び出し」に分け、後者を caller 側に寄せる設計余地を検討
  - 理由: APG Radio Group は「矢印移動 = 即選択」が推奨だが、roving フックが `onSelect(index)` まで内部で呼ぶ設計だと、フック自身が navigate 副作用のタイミングに踏み込む。`useRovingMenu` は一貫して「フォーカス移動のみ・選択は caller の onClick」を守っており（フック内に select 概念が無い）、責務境界が綺麗。`useRovingTablist` も「移動先 index を返す/onKeyDown でフォーカスを移す」までに留め、`onSelect` 呼び出しは container の `onKeyDown` ラッパか各 radio の制御で caller が行う形にすると、既存 roving プリミティブと責務粒度が揃い、テストも「フォーカス移動」と「選択副作用」を分離して書ける。ADR-002 のインターフェース案（`{ orientation, count, value(index), onSelect(index) }`）は現状でも妥当だが、`onSelect` をフックに持たせる是非を実装時に一度評価する価値がある（どちらでも AC は満たせるため P ではなく S）。

- **[S-002]** roving の DOM フォーカス実行は `containerRef` 配下 `querySelector('[role="radio"]')` 依存。SSR/hydration との非干渉を計画に1行明記
  - 理由: 計画は「`querySelector` で `role=radio` を取得し `.focus()`」とする。`useRovingMenu` の先例（`useEffect` 内・`open` ガード下でのみ querySelectorAll → focus）に倣えば、フォーカス実行は**イベントハンドラ起点**（ArrowKey 押下時）であって render/SSR 経路では走らないため、RSC/hydration とは衝突しない。これは安全だが、計画の「フォーカス管理が SSR/hydration・RSC と衝突しないか」という観点に対する明示的回答が本文に無い。「DOM フォーカスは keydown ハンドラ内でのみ実行し、render/SSR 経路には載せない（`useRovingMenu` と同流儀）」を1行リスク欄に足すと、レビュー観点に正面から答えられる。両コンポーネントとも `"use client"` のクライアントアイランドで、SSR は初期 markup（`tabIndex` の静的値）のみ出すため hydration mismatch も生じない、という確認も添えると尚良い。

- **[S-003]** 連続矢印 → 連続 navigate（home `replace:true` / public `useOptimistic+transition`）の挙動を回帰テストで1ケース固定
  - 理由: 計画リスク欄は「既存 click 経由 select と同じ挙動なので新たな問題は生じない」と述べるが、click は1回ずつ、矢印は押しっぱなしで高頻度に navigate を発火しうる差がある。home 側は `#219` で loaderDeps 除外済み・`replace:true` なので履歴は汚れずレンダーも1パスで閉じる（DisplayModeSwitch JSDoc で確認済み）→実害は低い。public 側は `selectDisplayMode` が早期 return（`mode === display`）を持ち、かつ `replace:true` なので連打しても同モードは no-op。理屈上は安全だが、「ArrowRight×2 連続で navigate が各回正しく呼ばれ、両端ラップで先頭/末尾に戻る」を1テスト追加しておくと、将来 select に debounce/transition を足した際の回帰を捕まえられる。AC-3 の回帰テストに含める想定でカバー可能。

- **[S-004]** `SEGMENTED_BTN`（public）への outline 追加が SEGMENTED コンテナの `overflow`/角丸とぶつからないか確認
  - 理由: public の `SEGMENTED = "bg-surface rounded-[9px] p-[2px] inline-flex"`、`SEGMENTED_BTN` は `rounded-[7px]`。home 側 `DISPLAY_SEGMENTED_BTN` は既に `focus-visible:outline-2 outline-accent`（offset 指定なし=外側 outline）を持ち、`p-[2px]` の隙間に外側 outline が乗る前提で破綻していない。public も同構造なので踏襲で問題ないと見込めるが、ViewSwitcher `OPTION_ITEM` は `-outline-offset-2`（内側）を使っており、計画ステップ3の `SEGMENTED_BTN` 追加文字列は `-outline-offset-2` を含めていない（home と揃えて外側）。一方ステップ4の menuItem 系は `-outline-offset-2`（内側）。**segmented は外側 offset 無し / menu 系は内側 offset** という2系統が混在する点を、計画は AC-4/AC-6 で別々に正しく書き分けているので整合は取れているが、実装時に SEGMENTED_BTN へ誤って `-outline-offset-2` を付けない／home の `DISPLAY_SEGMENTED_BTN` と完全に同じ outline 表現にする、を1行注記すると取り違えを防げる。

#### 良い点

- **セマンティクス選択（radiogroup/radio）が UI 実体に正しく一致**: ADR-001 は「実体 tabpanel 不在」を根拠に radiogroup を選び、APG Tabs 完成（案A）が id 結合を増やす点・button-group（案C）が単一選択を表現できない点まで比較しており、W-002 の推奨とも一致。WAI-ARIA APG の Radio Group パターン（roving tabindex / Arrow 4方向 / Home-End / 矢印で即選択 / 非選択 tabindex=-1 / aria-checked）を ADR-001 Decision が網羅的に列挙しており、要件の取りこぼしが無い。「矢印で即選択」は radiogroup として APG 準拠（Tabs の自動アクティベーションと同様に Radio Group も矢印移動＝選択変更が正）であり、判断は妥当。

- **既存 roving プリミティブとの棲み分けが適切**: ADR-002 が `useRovingMenu` 流用（案A）を「open 必須・縦方向・panel 前提・closed→open リセットや focus-restore の不変条件が segmented には無関係で、一般化は既存3利用箇所への波及リスクが高い」と却下した理由は、実コード（`useRovingMenu.ts` の `open` ガード多用・`restoreFocusOnCommit`・`prevOpenRef` リセット・`isDisabled` 走査）と照合して妥当。segmented は常時表示・固定3要素・disabled 無しという単純な前提で、専用軽量フックの方が責務が明確。プリミティブ2並存のトレードオフも正直に記載。

- **スコープ境界の判断が精緻**: TagListToolbar（並び替え軸 = #626 ADR-001 適用外・別系統）と EditorModeSwitch（実体 tabpanel が存在し radiogroup が正しいとは限らない）を、それぞれ別個の根拠で本 Issue から外し、「同テーマだが別系統」を理由付きで見送っている。Issue title「**表示モード** segmented」の文言に忠実で、スコープの過剰拡大も過小も避けている。

- **既存挙動の不変条件を明示的に保護**: DisplayModeSwitch の `select`/`writeDisplayPreference`/`#219` navigate、PublicTopControls の `selectDisplayMode`/`useOptimistic`/`#650` 永続、SortPopover/TagAddPopover の `useRovingMenu`（誤接触禁止）を「触らない」と明記。実コード（DisplayModeSwitch の write-before-guard 順序、PublicTopControls の `selectDisplayMode` 早期 return + `replace:true`）と一致し、既存テストのロック契約（write-before-guard 等）を壊さない設計になっている。

- **menuItem 統一のスコープ取り込み根拠が明確**: ADR-003 がコメント（#659 R2 / ADR-011）の明示要求・同一 WCAG テーマ（2.4.7）・ViewSwitcher 先行方針の横展開のみ（設計判断は確定済み）を根拠に本 Issue に含めると判断。`SORT_MENU_ITEM`/`TAG_ADD_OPTION_ITEM` も `focus-visible:bg-surface` のみで同じ後退があることを実コードで確認でき、対象の網羅も正しい。`bg-surface` を残す判断（outline がコントラスト担保・bg はホバー連続性）も妥当。

- **テスト方針が実現可能**: happy-dom + `act` + `dispatchEvent(new KeyboardEvent("keydown",{key,bubbles:true}))` で React 合成 onKeyDown を発火する方式は、既存 `DisplayModeSwitch.test.tsx` が確立している `act` 流儀（`createRoot`/`act(render)`/直接 DOM 操作）と整合し、実行可能。`aria-checked` の `"true"`/`"false"` 文字列シリアライズをテストで確認する注記も適切（boolean 属性は React が文字列化する点を正しく認識）。PublicTopControls 既存テストが `renderToStaticMarkup`（SSR）ベースである点は、roving/キーボードの DOM 検証には DisplayModeSwitch 側の DOM テストが主担当となるため問題なし（public 側は markup の role/aria-checked 契約と selectDisplayMode 不変のみで足り、計画もそう書き分けている）。

---

## 総評

アーキテクチャ整合性・実現可能性ともに高い計画。プレゼンテーション層に閉じた変更で、ドメイン/アプリ/アダプターへの波及は無く、既存挙動の不変条件も明示的に保護されている。WAI-ARIA APG Radio Group の要件網羅・既存 roving プリミティブとの棲み分け・スコープ境界のいずれも実コードと照合して妥当。

要修正は1件（P-001: danger メニュー項目への accent outline の扱いが未記述）。これは ViewSwitcher からの横展開では現れない `menuItem` 固有の差分で、意図的選択なら ADR-003 に一言、回避するなら danger 変種の追加が要る。残りは確認・明記レベルの改善提案で、いずれも AC を阻害しない。
