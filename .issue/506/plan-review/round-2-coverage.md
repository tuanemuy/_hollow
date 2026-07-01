# Issue #506 実装計画レビュー（2周目・要件カバレッジ / スコープ整合性）

**レビュー日:** 2026-07-01
**視点:** Issue の要件カバレッジ・スコープ整合性
**対象:** `.issue/506/plan.md` / `.issue/506/adr.md`

## 1周目指摘の反映確認

| 指摘 | 反映内容 | 判定 |
|---|---|---|
| P-001（prevOpenRef ガード） | step 1／設計 UI item1／設計判断／リスク／AC-9 新設／テスト方針に「開いたまま再レンダーで奪い戻さない」ケース追加 | 適切に反映。実コード `useRovingMenu`（`prevOpenRef`, L108-117）と同一様式を踏襲しており前例根拠も正確 |
| S-001（AC 表に検証ステップ列） | 受け入れ基準表に「検証ステップ」列追加、全 AC に step 6 を紐づけ | 反映済み |
| S-002（AC-2 を「パネル内に activeElement 無い」で固定） | AC-2 本文を「初期フォーカスがパネル内へ移らない」に改め、検証を `panel()?.contains(document.activeElement) === false` に変更 | 反映済み。happy-dom で不安定な `activeElement === trigger` を回避する妥当な判定 |
| S-003（ADR Status を Accepted に） | adr.md L5-6 `Accepted（… Proposed から更新）` | 反映済み |
| S-004（dialog コードゲート） | 設計 item2／step 2／AC-7／テスト方針、`moveInitialFocus: haspopup === "dialog" ? Boolean(initialFocus) : false` | 反映済み。illegal state をコードで排除、CLAUDE.md 原則に整合 |

### 実コードとの事実照合（新規問題の混入チェック）
- `usePopover` は `panelRef`/`setPanelRef` を保有（L152, L157-159）→ 初期フォーカスの足場ありは事実。
- `useRovingMenu` の `prevOpenRef` 前例は実在（L108-117）。plan の「立ち上がりエッジのみ発火」記述と一致。
- `Dialog.tsx` に非フィルタ版 `FOCUSABLE_SELECTOR`（L111）とフィルタ版 `INITIAL_FOCUS_SELECTOR = ...:not([data-dialog-close])`（L124-125）が別々に存在。plan の「フィルタ版／非フィルタ版で必要形が異なり共有すると分岐が要る」は正確。
- `DirectoryTreeSelect` は consumer 側で `setTimeout(() => searchRef.current?.focus(), 0)`（L115）→ 「自前フォーカス済み・無変更」は事実。
- **AC-9 の根拠検証:** FilterBar の `selectPreset → applyDateRange → run(...)`（L243-246, L223-234）は `setOpenPopover(null)` を**呼ばない**。PublicTopControls も同様（L293-296）。よって plan の「プリセット選択では popover は閉じない」という AC-9 の前提は実コードで裏付けられる。
- 両 DatePopover のパネル先頭 focusable は `role="group"`（非 focusable）内の先頭プリセットボタン（FilterBar L862-878 / PublicTopControls L512-527）→ AC-3/AC-4 の「先頭プリセットボタンへフォーカス」は正確。
- テスト 3 ファイルすべて実在。

## 結果

#### 問題点（要修正）
問題点ゼロ。

1周目の必須修正（P-001）・改善提案（S-001〜S-004）はすべて過不足なく反映されており、反映内容は実コードの事実（`prevOpenRef` 前例、`selectPreset` が popover を閉じない、Dialog のセレクタ二種、DirectoryTreeSelect の自前フォーカス）と一致する。新たな重大問題・スコープ逸脱の混入も無い。全 9 AC が検証ステップ（step 6）に紐づき、スコープ「含まれないもの」5 項目はいずれも Issue 目的（2 つの DatePopover の初期フォーカス乖離解消）に照らして正当に除外されている。

#### 改善提案（検討推奨）
- **[S-001]** AC-9 の根拠記述がプリセット選択のみを例示している / 実コードでは date input 編集（`onChangeDate → updateDate → run()`、FilterBar L236-240）も popover を閉じず navigation を起こすため、「開いたまま navigation」は preset 限定ではなくパネル内の全 URL 更新操作に及ぶ。`prevOpenRef` ガードは両方を等しくカバーするので実装への影響は無いが、根拠を「preset 選択に限らずパネル内で navigation を伴う操作全般」と一般化して書くと、将来の読者が preset 専用ガードと誤読するのを防げる。

#### 良い点
- AC 群が新挙動（AC-1/3/4）・後方互換（AC-2/7/8）・非回帰（AC-5/6）・エッジ（AC-9）を層別に網羅し、各行が由来と検証ステップの双方に紐づいている。
- 選択肢1採用にあたり「初期フォーカスを日付入力ではなく先頭プリセットボタンに落とす」判断がモバイルのネイティブ日付ピッカー／ソフトキーボード暴発回避というリスク根拠付きで明文化されており、Issue の選択肢1の意図（「プリセットボタン or 日付入力」）に対する具体化が的確。
- dialog 3 consumer（2 DatePopover ＋ DirectoryTreeSelect）を全数把握したうえで opt-in 方式によりブラスト半径を 2 consumer に限定しており、スコープ最小化と要件充足が両立している。
