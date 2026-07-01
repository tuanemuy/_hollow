# PR #812 レビュー — Frontend 観点（Issue #506）

対象差分: `gh pr diff 812`
参照: `.issue/506/plan.md`（受け入れ基準 AC-1〜AC-9）/ `.issue/506/adr.md`（ADR-001）/ CLAUDE.md（フロントエンド・スタイリング規約）
読んだ実装: `app/components/common/usePopover.ts` / `Popover.tsx` / `useRovingMenu.ts` / `Dialog.tsx` / `Menu.tsx` / `note/list/FilterBar.tsx` / `public/PublicTopControls.tsx` と各 `__tests__`

## 総評

計画・ADR に忠実で、#467 の二層設計（第1層 `usePopover`＝dismiss/ARIA/focus 復帰、第2層 `useRovingMenu`＝roving）に完全整合している。初期フォーカスを focus 復帰の対称カウンターパートとして第1層へ置く判断は妥当で、`prevOpenRef` の立ち上がりエッジガード・`haspopup === "dialog"` コードゲート・`FOCUSABLE_SELECTOR` ローカル定義のいずれも設計どおり正しく実装されている。**実装を止めるべき欠陥（Blocker）は無し。** テストのカバレッジに 1 点、細部に 2 点のみ。

## Frontend

### Blockers
- なし

### Warnings

- **[W-001]** → Round 2 で対応済み（`Popover.test.tsx` に「re-arms initial focus on close→reopen」ケースを追加。リセット行 `prevOpenRef.current = open` を一時削除して当該テストが落ちることを確認済み）。「閉→開の再立ち上がり」を検証するユニットテストが無く、`prevOpenRef` リセット（`open=false` 時の `prevOpenRef.current = false`）が壊れても検知できない / 場所: `app/components/common/__tests__/Popover.test.tsx:833`（AC-9 smoke ケース周辺）
  - 理由: 現行の AC-9 テストは「open 維持のまま `render()` 再実行」で、effect の deps `[open, moveInitialFocus]` が不変ゆえ **effect 自体が再実行されない**。プランも L149 で正直にこれを認め「smoke」と位置づけている。しかし `prevOpenRef` が提供する本来の保証のうち **ユニットで実際に判別可能な部分**（＝閉じたら prevOpen が false に戻り、再オープンで初期フォーカスが再発火する）が全くテストされていない。もしガードのリセット行 `prevOpenRef.current = open` を削っても、既存テスト（AC-1 は初回オープンのみ、AC-9 は再レンダーのみ）は全て緑のままになる。
  - 提案: 「open → 先頭にフォーカス → パネル内の別要素へ `.focus()` → close（`open=false`）→ 再 open → 再び先頭へフォーカスが戻る」ケースを 1 本追加する。これは happy-dom で `open` 遷移により effect が実際に再実行されるため、立ち上がりエッジ判定の**リセット経路**を確実に固定できる（RSC 再発火シナリオと違い決定的に検証可能）。AC-9 の smoke とは別に、rising-edge ロジックの唯一のユニット検証点として価値が高い。

### Notes

- **[N-001]** hooks の使い方は正しい。`prevOpenRef.current = open` を effect 冒頭で **`moveInitialFocus` 判定より前に無条件更新**している順序が `useRovingMenu`（L113-114）の前例と一致しており、`moveInitialFocus=false` でも open 追跡が破綻しない。`rising = open && !prevOpenRef.current` の立ち上がりエッジ判定、deps `[open, moveInitialFocus]` に漏れ・過不足なし（`moveInitialFocus` を open 中に false→true へ反転しても `rising=false` で誤発火しない挙動も正しい）。書き手は唯一 `prevOpenRef` だけなので同期ズレは起きない。

- **[N-002]** 初期フォーカスを `useEffect`（paint 後）、clamp を `useLayoutEffect`（paint 前）に置いた分離は正しく、競合しない。clamp の `setShiftX/Y` は初期フォーカス effect の deps を変えないため、1 回の open 遷移で初期フォーカス effect は **transform 適用後の最終コミットに 1 回だけ**発火する。フリッカーも二重フォーカスも無い。close 時は `rising=false` で focus せず `prevOpenRef.current=false` にリセットするだけで、次回オープンの検出も正しくリセットされる。ADR-001 の順序考慮どおり。

- **[N-003]** `moveInitialFocus: haspopup === "dialog" ? Boolean(initialFocus) : false` のコードゲート（`Popover.tsx:85`）は #467 二層設計と整合し、menu/listbox で確実に無効化される。AC-7 テスト（`it.each(["menu","listbox"])`）が `panel?.contains(document.activeElement) === false` で構造的無効化を固定しており、CLAUDE.md「illegal states を型/コードで表現不能に」に沿った昇格として妥当。直接 `usePopover` を使うもう一方の consumer `Menu.tsx:98` は menu-mode で `moveInitialFocus` を渡さない（default false）ため無影響。

- **[N-004]** `FOCUSABLE_SELECTOR` のローカル定義は計画どおり。`Dialog.tsx:111-112` の非フィルタ版とセレクタ文字列が**完全一致**していることを確認（「mirror」コメントが正確）。Dialog の `INITIAL_FOCUS_SELECTOR`（`:not([data-dialog-close])` フィルタ版）とは別物で、由来コメントも正しい。文字列が 2 箇所に重複するドリフトリスクは ADR-001 トレードオフとして受容済み。将来の乖離検知に、両定数が一致する旨のテスト（あるいは片方 import）を足す余地はあるが、YAGNI 上見送りは妥当。

- **[N-005]** 既存 Popover consumer（UserMenu・ViewSwitcher・各メニュー・DirectoryTreeSelect）は `initialFocus?: boolean | undefined`（default 未指定 → `Boolean(undefined)=false`）で完全無影響。型・コードともに担保されている。FilterBar / PublicTopControls の 2 DatePopover のみに `initialFocus` を付与しており、ブラスト半径は計画どおり最小。

- **[N-006]** 初期フォーカスの `.focus()` は `preventScroll` を付けていない。第2層 roving の初期フォーカス（`useRovingMenu.ts:138`）も同様に plain `.focus()` なので**前例と一致**しており defect ではない。ただし restore-pass（同 L168）は `preventScroll: true` を使っている。DatePopover はトリガー近傍の小パネルで実害は考えにくいが、モバイルの下寄せシートで先頭プリセットへ焦点が移る際に稀にスクロールが走る可能性は残る。手動テスト（TC-001/005）で先頭が preset ボタンかつ暴発しないことは確認済みなので情報提供に留める。

- **[N-007]** コメントは WHY 中心で CLAUDE.md 準拠。`prevOpenRef` の RSC 再レンダー根拠、happy-dom で `.focus()` が動く理由、clamp との順序、コードゲートの illegal-state 排除など、いずれも「非自明な制約・前例ポインタ」を説明しており過剰・自明なノイズは無い。既存ファイルの詳細コメント様式とも一貫。

- **[N-008]** パフォーマンス上の懸念なし。追加は `useRef` 1 つと `useEffect` 1 つのみで、余分な state・再レンダーは無い。effect は open/moveInitialFocus の変化時だけ実行され、no-op 経路（`rising=false` / 要素なし）も軽量。

## パフォーマンス・スタイリング規約

- 新規スタイル・CSS・`data-*` の追加は無く、focus 配線のみ。スタイリング規約（utility-first / tokens / `data-*`）への影響なし。CLAUDE.md 準拠。

## 返答（サマリー）

- Blockers: 0 / Warnings: 1 / Notes: 8
- **[W-001]** close→reopen の再立ち上がりを検証するユニットテストが欠落。`prevOpenRef` リセット経路（唯一決定的に検証可能な保証）が無テストで、リセット行を削っても既存テストは緑のまま。再オープンで初期フォーカスが再発火するケースの追加を推奨。
- [N-001] hooks（rising-edge 判定・`prevOpenRef` 更新順・deps）は正しく、`useRovingMenu` 前例と一致。
- [N-002] 初期フォーカス useEffect と clamp useLayoutEffect は競合せず、1 open あたり 1 回発火。
- [N-003] `haspopup === "dialog"` コードゲートは menu/listbox で確実に無効化。Menu.tsx も無影響。
- [N-004] `FOCUSABLE_SELECTOR` は Dialog.tsx の非フィルタ版と完全一致。
- [N-005] 既存 consumer は prop 未指定で型・コードともに無影響。
- [N-006] `.focus()` の `preventScroll` 無しは roving 前例と一致（defect ではない、情報提供）。
- [N-007] コメントは WHY 中心で CLAUDE.md 準拠、過剰なし。
- [N-008] パフォーマンス懸念なし（ref 1・effect 1、余分な再レンダーなし）。
