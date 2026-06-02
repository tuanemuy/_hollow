# ADR — Issue #414: 楽観的UI更新で mutation インタラクションを滑らかにする

## ADR-001: 削除（list membership 変更）の optimistic state を親に置く

### Status
Proposed

### Context
SavedView の削除はリストから項目を消す操作で、リスト state はクライアントコンポーネント `SavedViewsList`（`index.tsx`）が props `views` として保持する（`Page.tsx` は RSC で `useOptimistic` 等のフックを持てないため state の所有者になれない）。frontend doc 行 772-775 は「`useOptimistic` は**子からは**親所有データを変更できず、リストから項目を消すような操作は（このテンプレでは）`router.invalidate()` 経路に委ねている」と述べている。つまり doc はデフォルトで削除を楽観化しない方針だが、本 Issue はまさに削除の即時反映を明示要求している。

### Decision
doc が「子では不可」とする制約を、削除の optimistic state と mutation 実行を**親 `SavedViewsList`（client）へ list-level で引き上げる**ことで正攻法に解決する。`SavedViewsList` で `useOptimistic(views, reducer)` を持ち、`startTransition` 内で楽観 remove → `await mutate` → `await routerInvalidate` を 1 transition に閉じる。フックは早期 return（空リスト判定）より前に呼ぶ。行 `SavedViewRow` は表示と confirm trigger のみ担当し、`onDelete(view.id)` / `isPending` を props で受ける。

### Consequences
- 良い点: doc の制約（子では消せない）を守りつつ Issue 要件（削除の即時反映）を満たす。失敗時は transition 完了で baseline に snap back し自動 rollback。
- トレードオフ: doc がデフォルトで invalidate に委ねていた削除を意図的に楽観化する拡張。`SavedViewRow` の props が増え削除ロジックが親へ移るが、React の data flow としては正当。

---

## ADR-002: 複製・アップロードの楽観"追加"を行わない

### Status
Proposed

### Context
複製（duplicate）/ アップロード（UploadForm）は list に新規項目を追加する操作。楽観追加するには新項目の id・既定名・brokenConditions 等を client で合成する必要があるが、これらは server が採番・決定する。client 合成値で楽観追加すると baseline 収束時に行がちらつく / key 衝突するリスクがある。

### Decision
複製・アップロードの楽観"追加"は実施しない。pending 中の視覚フィードバック（ボタン disabled / `aria-busy`）に留め、確定は従来どおり `routerInvalidate` round-trip に任せる（doc「optimistic 不可なら invalidate 経路」と整合）。

### Consequences
- 良い点: ちらつき・key 衝突という実害を回避。受け入れ基準「主要 CRUD で即時反映」は削除・rename・既定・編集で充足。
- トレードオフ: 複製・アップロードだけは即時"追加"反映されない。Issue は複製を「スコープ（提案）高優先度」に挙げているが、受け入れ基準は "主要 CRUD"（複製を名指ししない）であり矛盾しない。複製操作自体の即時フィードバック（ボタン disabled / aria-busy）は実装し、Issue 起票者の関心（複製の待ち感低減）に部分的に応える。楽観"追加"の本格対応は別 Issue 化を PR 説明で提案し、「高優先度を落とす」判断を可視化する。

---

## ADR-003: rename / 既定 toggle / repair は row-level `useOptimistic`

### Status
Proposed

### Context
名前変更・既定 toggle・修復は行が所有する field（name / isDefault / brokenConditions）の変更で、list membership は変わらない。

### Decision
`SavedViewRow` 内に各 field 用の `useOptimistic` を置き、transition 内で先に楽観反映する。既定 toggle は自行のみ反映し、他行の既定解除は loader 再取得で収束させる。

### Consequences
- 良い点: `TodoItem` の completed toggle と同型で最も安全・確実。
- トレードオフ: 既定 toggle 時、invalidate 完了までの一瞬「2 つ既定」に見えうるが許容範囲。

---

## ADR-004: ViewFormDialog は submit 成功で即 close

### Status
Proposed

### Context
ViewFormDialog は保存後 `submit → routerInvalidate → onClose` で、loader 再取得完了まで dialog が開いたまま「待つ感」が出る。dialog close は list 再取得を待つ必要がない。

### Decision
transition 内で `await submit` 成功直後に `onClose()` を呼ぶ。**`routerInvalidate` は await せず detach する**（`routerInvalidate(router).catch(() => {})`）。submit 自体の reject では close せず `setError`。

**実装時の重要な訂正（ADR-005 と同根の問題）:** 当初は `onClose()` の後に `await routerInvalidate` を置いていたが、React 19 の async transition は**アクション内の state 更新を action が settle するまでバッチ（遅延）コミット**する。`await routerInvalidate` をアクション内に残すと、`onClose()`（親の dialog close state）のコミットが loader 再取得完了まで遅延し、結局 round-trip 待ちで閉じる＝本 ADR の目的を達成できない。`routerInvalidate` を await せず detach することで、アクションは submit 完了直後に settle し、バッチされた `onClose()` が即コミットされて dialog が閉じる。

### Consequences
- 良い点: 保存操作の体感が即時化。submit 成功＝サーバ確定なので close を待たせる理由がない。dialog は submit 完了直後に閉じ、loader 再取得は背後で進む。
- トレードオフ: invalidate 失敗時のエラーは表示されないが、次ナビゲーションで自然回復するため許容。`isPending` は invalidate 完了前に false になるが、dialog は既に閉じているため UI 影響なし。

---

## ADR-005: rename の `setIsEditing(false)` は transition の外で同期的に呼ぶ

### Status
Accepted（実装時判断）

### Context
計画ステップ3は「`setIsEditing(false)` も transition 内で即時」と記述していたが、実装・テストで以下が判明した。`startTransition` 内で呼ぶ通常の `useState` 更新（`useOptimistic` ではない）は **transition 更新**として扱われ、transition が pending（rename promise が未解決）の間はコミットされない。結果、インライン編集フォームが開いたままになり、`optimisticName` が描画されず「即時反映」にならない（実際に component テストで再現）。

### Decision
`setIsEditing(false)`（インライン編集フォームを閉じる通常 state）は `startTransition` の**外**で同期的に呼ぶ。`applyOptimisticName`（`useOptimistic` の setter）だけを transition 内に残す。これによりフォームは即座に閉じ、optimistic 値で表示名が即時に切り替わる。mutation 確定/失敗で baseline に snap back する挙動は変わらない。

### Consequences
- 良い点: rename の「フォームを閉じて新名を即表示」が正しく即時化する。`TodoItem` 例の `useOptimistic` は値だけを transition 内で更新しており、本判断はその精神に合致。
- トレードオフ: 計画の「transition 内で即時」という文言から逸脱したが、React の transition セマンティクス（通常 state は pending 中コミットされない）に基づく不可避の修正。`useOptimistic` の即時性は維持されている。

---

## ADR-006: 削除確認ダイアログは confirm で即 close し、エラーは行の `rowError` 枠へ

### Status
Accepted（実装時判断・計画ステップ4の具体化）

### Context
従来の削除は失敗時にダイアログを開いたまま（Issue #98）ダイアログ内 `role="alert"` にエラーを出していた。本 Issue で削除を楽観化すると、confirm の瞬間に対象行が optimistic に除去され、その行内に描画される `ConfirmDialog` も unmount される。ダイアログにエラーを保持し続ける前提が崩れる。

### Decision
confirm 押下で `setConfirmDeleteOpen(false)` してから親の `onDelete(viewId)` を呼ぶ（即 close）。削除エラーは親 `SavedViewsList` が `deleteErrorId` / `deleteError` で所有し、baseline 復帰後に対象行へ伝播して既存 `rowError`（`role="alert"`）枠に表示する。`ConfirmDialog` の `error` / `isPending` props は削除では渡さない。

### Consequences
- 良い点: 楽観除去と整合し、失敗時は行が再表示された同じ枠でエラーが出る一貫性を保つ。
- トレードオフ: Issue #98 の「削除はダイアログ内エラー」パターンから外れるが、楽観削除では行自体が消えるため成立しない。rename / 既定 / repair の `rowError` パターンと統一されむしろ一貫する。
