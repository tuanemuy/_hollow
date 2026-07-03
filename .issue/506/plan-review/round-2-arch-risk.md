# Plan Review — Issue #506（2周目・アーキテクチャ整合性／実現可能性／リスク）

対象: `.issue/506/plan.md` / `.issue/506/adr.md`（1周目反映後）
視点: アーキテクチャ整合性・実現可能性・リスク
前提: 1周目は問題点ゼロ。反映されたのは coverage P-001（`prevOpenRef` 立ち上がりエッジガード）と改善提案4件（arch S-001 dialog コードゲート／arch S-003 `FOCUSABLE_SELECTOR` 命名／arch S-002 panel-not-null アサート／coverage S-002・S-004 AC-2 検証法）。本周はそれらが #467 二層設計と整合し、新たな副作用・実装不能・エッジ漏れを生んでいないかを確認した。

## 検証したコード事実

- `usePopover.ts`: 既存 effect は clamp が `useLayoutEffect`（deps `[open, clampToViewport]`）、dismiss が `useEffect`（deps `[open, onOpenChange]`）。`panelRef` / `setPanelRef` は第1層が保持済み。`prevOpenRef` という名前は未使用（衝突なし）。
- `Popover.tsx`: dialog ブランチ（L140-151）は `ref={assignPanelRef}` を確かに配線しており、`assignPanelRef` は `popover.setPanelRef(node)` を呼ぶ。→ dialog でも `panelRef.current` は populate される（初期フォーカスの足場が成立）。dialog ブランチは `onMouseDown` preventDefault 無し（意図的）。
- `useRovingMenu.ts`: `prevOpenRef`（`useRef(false)`）で reset effect の「閉→開の立ち上がりエッジのみ」を実現（L108-117）。コメントに「Suspense 中断/再開で dep 変化なしに effect が再発火する」旨を明記。→ 計画が倣う前例は実在し、シナリオ記述も正確。
- `Dialog.tsx`: `FOCUSABLE_SELECTOR`（非フィルタ版, L111-112）と `INITIAL_FOCUS_SELECTOR`（`:not([data-dialog-close])` 付きフィルタ版, L124-126）が別物であることを確認。計画の「非フィルタ版を踏襲、フィルタ版とは別」という記述は正しい。
- `FilterBar.tsx` DatePopover: パネル body は `DateRangeFields`（先頭 focusable = 最初のプリセット `<button type="button">`, L866-880）→ クリア/閉じるボタンの順。よって初期フォーカスは先頭プリセットボタンに落ちる（AC-3 妥当）。date input はプリセットの後（ネイティブピッカー暴発の懸念なし。計画のリスク記述と一致）。

## 三つの重点確認

1. **`prevOpenRef` ガードと effect 順序／clamp effect の競合** — 競合なし。
   - React の実行順は layout effect（clamp）→ paint →  passive effect（初期フォーカス）。clamp が `setShiftX/Y` で同期再レンダーしても、初期フォーカス effect の deps `[open, moveInitialFocus]` は不変なので再実行されず、open 遷移につき**1回だけ**発火する。transform 適用後に focus が走る順序で、フリッカーや二重発火はない。
   - close 時: clamp が shift を 0 リセット、初期フォーカス effect は `rising=false` で focus せず `prevOpenRef.current=false` に戻すだけ。→ 次回 open の立ち上がり検出が正しくリセットされる。
   - trigger→panel への `.focus()` は container `onBlur`（`onFocusOut`）で `relatedTarget` が panel 内 → `contains` true で早期 return、閉じない。arch S-002 の panel-not-null アサートがこの不変条件を直接ガードしており妥当。

2. **dialog コードゲートと menu/listbox roving の排他** — 正しく排他。
   - `moveInitialFocus: haspopup === "dialog" ? Boolean(initialFocus) : false` により menu/listbox では `initialFocus` の値に関わらず必ず false。`usePopover` の初期フォーカス effック は menu/listbox で発火しない。roving は第2層 `useRovingMenu` が別配線（`panelRef`＋`onMenuKeyDown`）で持つため二重フォーカスが構造的に表現不能。CLAUDE.md「illegal states を型/コードで表現不能に」に沿った昇格として妥当。
   - `usePopover` の `prevOpenRef` と `useRovingMenu` の `prevOpenRef` は別インスタンスで相互干渉しない。menu/listbox でも `usePopover` 側 effect は `prevOpenRef` 更新のみの no-op で害なし。

3. **`FOCUSABLE_SELECTOR` ローカル定義の妥当性** — 妥当。
   - Dialog は close 除外の**フィルタ版**が必要、本用途は close 除外不要の**非フィルタ版**。共有すると呼び出し側分岐が要る、という計画の根拠はコードで裏取れた（Dialog は `FOCUSABLE_SELECTOR.split(", ").map(...)` で派生）。純粋な文字列定数の二重定義＋相互参照コメントは YAGNI 上許容。1周目 arch S-003 の決着どおりで蒸し返さない。

## 問題点（要修正）

**問題点ゼロ。**

反映された `prevOpenRef` ガード・dialog コードゲート・`FOCUSABLE_SELECTOR` 命名・アサート強化はいずれも #467 二層設計と整合し、useLayoutEffect/useEffect の順序や clamp effect と競合せず、新たな副作用・実装不能・エッジ漏れを生まない。実現可能性（happy-dom で `.focus()` 動作・panelRef 足場・先頭 focusable がプリセットボタン）もコードで裏取れた。

## 改善提案（検討推奨）

- **[S-001] AC-9 のユニットテストが `prevOpenRef` ガードを判別しない懸念。** テスト方針は「open 維持のまま props 変更で再コミット → 移動先を奪い戻さない」を回帰ガードとする。しかし初期フォーカス effect の deps は `[open, moveInitialFocus]` で、**プレーンな `rerender()` では deps 不変ゆえ effect 自体が再実行されない**。したがってこのテストは `prevOpenRef` ガードの有無に関わらずパスし、ガードを判別しない（＝偽の安心）。ガードが実際に効くのは `useRovingMenu` コメントが言う「Suspense 中断/再開で dep 変化なしに effect 再発火」シナリオで、これは happy-dom の `rerender()` では再現困難。提案: (a) このケースを「ガードの証明」ではなく「開いたまま再レンダーで焦点が動かないスモークテスト」と位置づけを正直に記述する、または (b) `useRovingMenu` の reset ガードが同様にユニットで直接判別できず前例＋推論＋共有パターンで担保している事実に倣い、AC-9 の担保根拠を「前例準拠＋設計上の対称性」に明示的に寄せる。いずれにせよガード自体は本番の RSC ナビゲーション（当コードベースで effect 再発火が起きる旨を roving コメントが実証）に対し正しく必要であり、実装は据え置きでよい。テストの表現/期待値の精度だけの話。

- **[S-002] `prevOpenRef` の初期値を明記推奨。** 計画は `useRef<boolean>` とだけ書き初期値に触れていない。`useRovingMenu` に倣えば `useRef(false)` で、これによりマウント時点で `open=true`（将来 open 状態でマウントされる dialog を作った場合）でも立ち上がりエッジとして初期フォーカスが発火し Dialog の挙動と揃う。`useRef(open)` と書くとマウント時 open のケースで初期フォーカスが漏れる。現状の全 DatePopover は controlled で閉状態開始のため実害は今は無いが、実装時の取り違え防止に「初期値 false（`useRovingMenu` 準拠）」を step 1 に一言足すと堅い。

## 良い点

- 初期フォーカスを focus 復帰の対称カウンターパートとして第1層 `usePopover` に集約する判断が #467 ADR-001 の二層設計と厳密に整合。panelRef 足場が既存で追加配線ゼロ。
- dialog コードゲート（`haspopup === "dialog"` ? ... : false）で menu/listbox への誤配線を「二重フォーカス」という illegal state として構造的に排除。JSDoc 運用ではなくコードの不変条件へ昇格させた点が CLAUDE.md 原則と一致。
- `prevOpenRef` ガードの必要性（開いたまま filter navigation で effect 再評価→奪い戻し回帰）を `useRovingMenu` の実在前例に正確に紐づけ。ブラスト半径最小化（opt-in、DirectoryTreeSelect 無変更）も一貫。
- `FOCUSABLE_SELECTOR` フィルタ版/非フィルタ版の必要形差異を実コードで正しく捉え、共有見送りの根拠が具体的。
- AC 表への検証ステップ列、AC-2 の検証法を happy-dom で不安定な `activeElement===trigger` から `panel().contains(activeElement)===false` へ改めた点、panel-not-null アサート併記など、テスト設計の堅牢化が着実。

---

## 返答（サマリー）

- 問題点: 0 / 改善提案: 2
- [S-001] AC-9 の回帰テストは deps 不変で effect が再実行されないためプレーン `rerender()` では `prevOpenRef` ガードを判別しない（前例準拠＋スモーク位置づけへ表現調整を推奨。ガード実装自体は正しく据え置き可）
- [S-002] `prevOpenRef` の初期値 `false`（`useRovingMenu` 準拠）を step 1 に明記推奨（将来のマウント時 open で初期フォーカス漏れを防ぐ）
- 重点3点（prevOpenRef ガードと effect 順序/clamp 競合・dialog ゲートと roving 排他・FOCUSABLE_SELECTOR ローカル定義）はいずれも整合／競合なし／妥当。新たな重大問題なし。
