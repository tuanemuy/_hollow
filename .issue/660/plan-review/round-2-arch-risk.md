# Round 2 レビュー — アーキテクチャ整合性・実現可能性・リスク（Issue #660）

レビュー視点: プロジェクトのあるべきアーキテクチャとの整合性・実現可能性・リスク
対象: `.issue/660/plan.md` / `.issue/660/adr.md`
前提: 1周目指摘（`round-1-arch-risk.md`）の反映確認 + 残課題探索

---

## 1周目指摘の反映確認

- **arch P-001（danger 項目への accent outline）** → **反映済み**。ADR-003 に独立節「danger 項目も accent outline で統一する理由」を新設し、案A（danger 時 error 系 outline へ切替）/ 案B（全項目 accent 統一）を比較した上で案B を採用。根拠も「outline はフォーカス位置インジケーター専用 / danger セマンティクスは text=error + bg=error-surface が担う / 独立 outline 分岐は color トークン増殖と表現不統一を招く / WCAG 2.4.7 は accent で満たされ情報量後退なし」と明記。plan AC-6・ステップ4・設計判断 ADR-003 からも一貫参照。実コード（`menuItem` の `data-[danger]:text-error data-[danger]:focus-visible:bg-error-surface`、`NoteActions` の削除項目）と照合して妥当な意図的選択として記述されており、「見落とし」感は解消。
- **arch S-001（`useRovingTablist` の onSelect 内包の是非）** → **反映済み**。ステップ1 に「実装時評価（arch S-001）」として記録。フック内包・caller 委譲どちらでも AC を満たせる旨と、実装時に既存 roving プリミティブとの整合で確定する方針が明示。
- **arch S-002（DOM フォーカスの SSR/hydration 非干渉）** → **反映済み**。リスク欄（plan 159行）に「DOM フォーカスは keydown ハンドラ内でのみ実行し render/SSR 経路には載らない（`useRovingMenu` と同流儀）」「両コンポーネントとも `"use client"` クライアントアイランド、SSR は初期 markup（tabIndex 静的値）のみで hydration mismatch も生じない」を明記。
- **arch S-003（連続矢印 → 連続 navigate の回帰固定）** → **反映済み**。AC-3 / ステップ6 / テスト方針に「ArrowRight×2 連続で navigate が各回呼ばれ両端ラップで先頭/末尾に戻る」を DisplayModeSwitch 側で固定する旨を追加。
- **arch S-004（public `SEGMENTED_BTN` は外側・offset 無し）** → **反映済み**。ステップ3 に「home `DISPLAY_SEGMENTED_BTN` と同様に外側・offset 無し」「menu 系の `-outline-offset-2`（内側）と取り違えて `SEGMENTED_BTN` へ付けない」を明記。実コード（home `DISPLAY_SEGMENTED_BTN` は `focus-visible:outline-2 outline-accent` で offset 無し、ViewSwitcher `OPTION_ITEM` は `-outline-offset-2`）と一致。

1周目の要修正1件・改善提案4件はすべて適切に反映されている。

---

#### 問題点（要修正）

問題点ゼロ。

アーキテクチャ整合性（プレゼンテーション層に閉じ、ドメイン/アプリ/アダプターへの波及なし）・実現可能性（既存 `useRovingMenu` / `DisplayModeSwitch.test` の流儀踏襲）・リスク（既存挙動の不変条件を明示保護、SSR/hydration 非干渉を明記）のいずれの観点でも、要修正の残課題は検出されなかった。APG Radio Group 準拠（roving / Arrow 4方向 / Home-End / 矢印で即選択 / aria-checked / 非選択 tabindex=-1）、`useRovingTablist` の責務設計、既存挙動の不変条件、SSR/hydration 非干渉、テスト実現可能性のすべてを実コードと照合し、整合を確認した。

#### 改善提案（検討推奨）

- **[S-001]** `useRovingTablist` の `count` / `selectedIndex` の単一情報源（SSOT）規律を JSDoc に1行残すと、`useRovingMenu` の index-discipline 注記と整合する
  - 理由: `useRovingMenu` は JSDoc で「`querySelectorAll` は focus 実行専用、counting/indexing は caller 所有、宣言順 = DOM 順なので caller index と DOM index が一致する」という index-discipline を明記している（実コードで確認）。`useRovingTablist` も同じく「container 配下の `[role="radio"]` を querySelector でフォーカス実行するが、`count`/`selectedIndex` の真実は caller（DisplayModeSwitch の `DISPLAY_MODES` 配列順、PublicTopControls の表示モード配列順）が所有し、宣言順 = DOM 順が前提」という同型の規律に立つ。ステップ1 は「DOM フォーカス実行のみ・index は caller 所有」と既に述べており設計は正しいが、フックの JSDoc に「宣言順 = DOM 順が `.focus()` の正しさの前提」を1文残すと、将来 segmented の要素順を動的並べ替えする変更が入った際の暗黙の不変条件が明文化される。AC を阻害しないため S。

- **[S-002]** `useRovingTablist` の `onKeyDown` で扱わないキー（Tab / Space / Enter 等）に `preventDefault` を掛けないことを実装時に担保
  - 理由: APG Radio Group では矢印/Home/End のみ roving が介入し、Space/Enter はネイティブ `<button>` の onClick（= 既存 `select`）に委ねる設計（ADR-001 が「ネイティブ `<button>` の Space/Enter は onClick 経由で選択を維持」と明記）。`useRovingMenu.onKeyDown` は該当キー以外で early return し `preventDefault` を呼ばない（`next === null` 時に return）流儀。`useRovingTablist` も同様に「処理対象キー以外は素通し（preventDefault しない）」を守れば、Tab フォーカス離脱や button 既定の Space/Enter 動作と衝突しない。ステップ1 は「移動時 `event.preventDefault()`」と移動時のみに限定して書けており設計は正しいが、テスト方針に「未処理キー（Tab/Space/Enter）で preventDefault が走らない」ことを1ケース足すと、矢印 roving が button 既定挙動を奪っていない回帰を固定できる。AC-3 の roving テストの延長で安価にカバー可能。

#### 良い点

- **1周目の全指摘が根拠付きで反映されている**: 特に P-001 は ADR-003 に独立節を設け案A/案B 比較で意図的選択であることを明示。「フォーカスリングは accent 統一・danger セマンティクスは text/bg が担保・独立 outline 分岐は color トークン増殖を招く」という根拠は、参照実装 ViewSwitcher（`OPTION_ITEM`/`TRIGGER` も accent 統一）と整合し、WCAG 2.4.7 充足の論理も通っている。粗探しの余地がない水準。

- **APG Radio Group 準拠が網羅的かつ実体一致**: ADR-001 は「実体 tabpanel 不在」を根拠に radiogroup を選び、案A（Tabs 完成 = id 結合増・操作モデル不一致）・案C（button-group = 単一選択を表現できない）を退ける比較が精緻。Decision が roving / Arrow 4方向 / Home-End / 矢印で即選択 / aria-checked / 非選択 tabindex=-1 を列挙しており取りこぼしなし。「矢印で即選択」が radiogroup として APG 準拠である点も正しい。

- **`useRovingTablist` の棲み分けが実コードと一致して妥当**: `useRovingMenu` の実装（`open` ガード多用 = `if (!open) return` が随所、`prevOpenRef` の closed→open リセット、`restoreFocusOnCommit` の no-dep commit pass、`isDisabled` 走査、`panelRef.querySelectorAll` 依存、ArrowUp/Down のみで横方向なし）を確認した結果、segmented（常時表示・横並び・固定3要素・disabled 無し・panel ラッパー無し）には過剰かつ前提不一致。ADR-002 の「一般化は既存3利用箇所への波及リスク大」「軽量専用フックが責務明確」は実コードに照らして正当。プリミティブ2並存のトレードオフも正直に記載。

- **既存挙動の不変条件を実コードと一致した形で保護**: DisplayModeSwitch の `select`/`writeDisplayPreference`/navigate、PublicTopControls の `selectDisplayMode`/useOptimistic/URL ナビ、SortPopover/TagAddPopover の `useRovingMenu`（誤接触禁止）を「触らない」と明記。`select` ハンドラに触れず role/tabIndex/onKeyDown の付与に限定する設計で、既存テストのロック契約を壊さない。

- **テスト実現可能性が高い**: DisplayModeSwitch.test の `act` + `dispatchEvent(KeyboardEvent)` 流儀を踏襲し、PublicTopControls.test が `renderToStaticMarkup`（SSR 静的）ベースで動的キーボードテスト不可である制約を正しく認識して、動的 roving 検証を DisplayModeSwitch 側に集約・public 側は静的契約アサーション更新のみ、と書き分けている。`aria-checked` boolean の `"true"`/`"false"` 文字列シリアライズ確認の注記も適切。実コードの `TAG_ADD_OPTION_ITEM`（行653・ファイル内テンプレートリテラル、`public/styles.ts` には不在）の所在も round-1 coverage 指摘どおり正確に修正されている。

- **スタイリング規約への準拠**: focus-visible outline を token（`outline-accent`）で表現、繰り返し utility は module-scope 定数へ集約、segmented は外側 offset 無し / menu 系は内側 `-outline-offset-2` の2系統を AC-4/AC-6 で正しく書き分け。CLAUDE.md の utility-first / data-* variant / token 規約に整合。

---

## 総評

2周目として、1周目の要修正1件（P-001）・改善提案4件（S-001〜004）がすべて根拠付きで適切に反映されたことを確認した。特に P-001 は ADR-003 に独立節を設けて意図的選択であることを明示しており、見落とし感は完全に解消されている。

アーキテクチャ整合性・実現可能性・リスクのいずれの観点でも要修正の残課題はゼロ。プレゼンテーション層に閉じた変更で、APG Radio Group 準拠・既存 roving プリミティブとの棲み分け・既存挙動の不変条件・SSR/hydration 非干渉・テスト実現可能性のすべてを実コードと照合して妥当性を確認した。

残る改善提案2件はいずれも実装時の JSDoc 規律明文化（S-001）と未処理キーの preventDefault 非介入の回帰固定（S-002）で、AC を阻害せず実装フェーズで軽微に取り込める性質のもの。**本計画は実装着手可能な品質に達している。**
