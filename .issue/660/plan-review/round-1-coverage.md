# Round 1 レビュー — Issue #660 計画（観点: 要件カバレッジ・スコープ整合性）

レビュー対象: `.issue/660/plan.md` / `.issue/660/adr.md`
観点: Issue 本文・コメントで合意された要件のカバレッジ、各受け入れ基準の検証可能性、基準と実装ステップの紐づけ、スコープ整合性。

---

## 結論サマリー

Issue 本文（W-002: 矢印キーナビ + roving tabindex 追加 or radiogroup 化）と、コメント要件（共通 `menuItem` の focus-visible 統一 / ADR-011）の **両方が受け入れ基準（AC-1〜6）に過不足なく落ちている**。スコープ判断（TagListToolbar / EditorModeSwitch 見送り、menuItem 統一を含める）も妥当かつ論拠が明示されている。要修正の重大な抜けは無いが、実装ファイルの所在に関する事実誤り 1 件（要修正）と、文言の精度に関する軽微な指摘がある。

---

#### 問題点（要修正）

- **[P-001]** 計画ステップ4・AC-6・調査結果が `TAG_ADD_OPTION_ITEM` を `app/components/public/styles.ts` 内の定数として扱っているが、実際には `app/components/public/PublicTopControls.tsx`（653行目）内のローカル定数（テンプレートリテラル、`${TOUCH_TARGET}` を内挿）である。`public/styles.ts` には存在しない（grep 確認済み）。
  - 理由: 実装者が `public/styles.ts` を編集対象として開くと `TAG_ADD_OPTION_ITEM` が見つからず迷う。さらに `SORT_MENU_ITEM` は `public/styles.ts`（120行）に実在する一方、`TAG_ADD_OPTION_ITEM` は別ファイルにあるため、「同一ファイル内の2定数」という前提が崩れている。`TAG_ADD_OPTION_ITEM` はテンプレートリテラルなので、`focus-visible:outline …` の追記位置（`focus-visible:bg-surface` の直後）も通常の文字列定数と扱いが微妙に異なる。
  - 提案: ステップ4の対象ファイルを「`app/components/common/styles.ts`（`menuItem`）、`app/components/public/styles.ts`（`SORT_MENU_ITEM`）、`app/components/public/PublicTopControls.tsx`（ローカル定数 `TAG_ADD_OPTION_ITEM`, 653行）」と分けて明記する。AC-6・調査結果の `(public)` 表記も同様に修正。

#### 改善提案（検討推奨）

- **[S-001]** AC-8 とステップ6で、矢印キー回帰テストの追加対象が `DisplayModeSwitch.test.tsx` のみであることをより明示するとよい。
  - 理由: `PublicTopControls.test.tsx` は冒頭で `renderToStaticMarkup`（SSR 静的マークアップ）を使っており、`createRoot` によるクライアントレンダーや `dispatchEvent` での KeyboardEvent 発火ができない。したがって PublicTopControls 側で矢印キー roving の動的回帰テストを書くには新たなクライアントレンダー harness の導入が必要になる。計画は実際には PublicTopControls 側を「`aria-selected`→`aria-checked` の静的アサート更新」に留め、矢印キー回帰は DisplayModeSwitch（`createRoot`/`act` harness を既に持つ）に集約しており、これは妥当な判断。ただし AC-8 の文面「矢印キーナビの回帰テストが追加される」は両ファイルにかかると誤読されうる。「DisplayModeSwitch に矢印キー回帰を追加、PublicTopControls は契約アサート更新のみ（SSR harness の制約）」と一文補足すると、実装者が PublicTopControls 側で過剰な harness 改修に着手するのを防げる。

- **[S-002]** AC-3 / ADR-001 の「移動と同時に表示モードが切り替わる（矢印で即選択）」挙動について、home（DisplayModeSwitch）では矢印移動ごとに `router.navigate({ replace: true })` が走る点が AC として明示されていない（リスク欄には記載あり）。
  - 理由: 「即選択」は APG Radio Group 準拠として正しいが、home では navigate を伴うため副作用がある。リスク欄で「既存 click 経由 select と同じ挙動なので新たな問題は生じない」と整理されているのは妥当。ただし AC-3 が「移動と同時に表示モードが切り替わる」とだけ書くと、テストで navigate 呼び出しまで検証すべきか曖昧。ステップ6では実際に「ArrowRight/Home/End で aria-checked と navigate が移ることを検証」と navigate 検証を含めており整合しているので、AC-3 にも「（home では navigate も伴う）」を一言添えると基準とテストの対応がより明確になる。

- **[S-003]** AC-5 の「既存挙動は不変」を裏取りするテスト（navigate guard / localStorage 永続 / useOptimistic）が、ステップ6のテスト方針に列挙されている一方、AC-5 自体には対応ステップとして「2,3」しか紐づいていない（テスト=6 が AC-5 に紐づいていない）。
  - 理由: AC-5 は「既存挙動の不変」を主張する基準なので、回帰テスト（ステップ6）でロックされて初めて検証可能になる。対応ステップ列に 6 を加えると、基準と検証手段の紐づけが完結する（DisplayModeSwitch.test の既存 navigate/localStorage テスト群がそのままセレクタ更新だけで残る点も AC-5 の不変性の証跡になる）。

#### 良い点

- Issue の二大要件が明確に分離・追跡されている。W-002 本筋（radiogroup 化 + 矢印キー roving）が AC-1〜5 に、コメント要件（menuItem focus-visible 統一 / ADR-011）が AC-6 に、それぞれ「由来」列で出典を明記して落ちている。コメントで「合わせて検討してほしい」とされた menuItem 統一を見送らずスコープに含めた判断（ADR-003）は、コメントの明示要求・ADR-011 の方針確定済み・同一 WCAG テーマ（2.4.7）という3点で正当化されており妥当。
- スコープ外判断が具体的根拠付きで明快。TagListToolbar（並び替え軸 segmented, P18）は「表示モード」ではなく `#626 ADR-001 の適用範囲外（非表示モード用途の .segmented は対象外）」という既存 ADR 境界に沿って見送っており、Issue title「**表示モード** segmented」のスコープと厳密に整合。EditorModeSwitch（P12）は「実体パネルが存在する」ため radiogroup 化が意味的に正しいとは限らないという、ADR-001 の判断軸（実体 tabpanel の有無）と一貫した理由で見送っている。どちらも「スコープ外作業の紛れ込み」ではなく、むしろ過剰拡大を正しく抑止している。
- ADR-001 の選択肢比較（案A full-tabs / 案B radiogroup / 案C button-group）が、W-002 レビュアー推奨と一致し、実体 tabpanel 不在という UI 実体に基づいて案B を選んでいる。判断の根拠が UI 実体に接地している。
- ADR-002 で `useRovingMenu` を流用せず専用フックを新設する判断が、既存 menu/listbox 利用箇所（Menu/SortPopover/TagAddPopover）への波及リスク回避という観点で妥当。実際に `useRovingMenu` は `open` 必須・縦方向・`panelRef.querySelectorAll` 前提で、segmented の常時表示・横並びとは前提が異なることをコード確認した。リスク欄でも「PublicTopControls 内の SortPopover/TagAddPopover の useRovingMenu に誤って手を入れない」と明示しており、スコープ汚染の予防が効いている。
- AC-1〜4 が DOM 属性（`role`/`aria-checked`/`tabIndex`/`focus-visible:outline`）の具体値で書かれており検証可能。AC-7（spec モック）・AC-8（テスト）も対象行（P10:1133, P30:581, テスト各ファイル）まで特定されていて実行可能。`ViewSwitcher.OPTION_ITEM`（参照実装）の outline 文字列と AC-6 で追加する文字列が一致していることもコード照合で確認できた（過渡的差異の解消という ADR-011 の意図と整合）。

---

## 検証メモ（コード照合の裏取り）

- `DisplayModeSwitch.tsx`: 現状 `role="tablist"`/`role="tab"`/`aria-selected`/`data-active`、`DISPLAY_SEGMENTED_BTN` は既に `focus-visible:outline-2 outline-accent` を持つ（AC-4 home 側は既達、計画の調査事実と一致）。
- `PublicTopControls.tsx`（368行）: `SEGMENTED`/`SEGMENTED_BTN`、`SEGMENTED_BTN`（public/styles.ts:112）に focus-visible outline 無し → ステップ3の追加要件は正しい。
- `common/styles.ts:425` `menuItem`: `focus-visible:bg-surface` のみ → AC-6 の前提と一致。
- `public/styles.ts:120` `SORT_MENU_ITEM`: `focus-visible:bg-surface` のみ → 一致。
- `PublicTopControls.tsx:653` `TAG_ADD_OPTION_ITEM`: ローカル定数で `focus-visible:bg-surface` のみ → P-001 の所在誤りを除けば対象として正しい。
- spec モック P10:1133 / P30:581 に `class="segmented" role="tablist"` + `role="tab" aria-selected` のマークアップと注記（P10:564, P30:393）を確認 → AC-7/ステップ5の対象行は正確。
