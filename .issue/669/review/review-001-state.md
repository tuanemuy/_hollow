# PR #676 Review — State / Router invalidate / Editor lifecycle（Round 1）

レビュー観点: AC-7〜AC-10（routerInvalidate のエディター除外、NoteEditor 保存後 invalidate 削除、InlineEditor の effect 分離）。StrictMode 二重マウント、外部 value 変更、MutationObserver rollback との相互作用、リスナー解除漏れ、race condition を重点確認。

確認対象: `app/components/common/routerInvalidate.ts`（+test）、`app/components/note/editor/NoteEditor.tsx`、`InlineEditor.tsx`（全文精読）、`__tests__/inlineEditor.test.tsx` / `noteEditorSeedOnce.test.tsx`、`.issue/669/plan.md` / `adr.md`（ADR-003〜007）。

### State/Router

#### Blockers

なし。

検証済みの主要項目（問題なし）:

- **AC-7**: `EDITOR_ROUTE_IDS` の常時除外は `_app` 除外と同型の AND 合成で実装され、`always-true filter でもすり抜けない`テスト・表示系ルート（`/_app/notes`, `/_app/notes/$noteId`）が `true` のままであるテストで pin されている（`routerInvalidate.test.ts:51-103`）。除外しすぎ/不足なし。`appShellInvalidate` は厳密一致のため無変更で正しい。全25呼び出し箇所への波及は「エディタールートが invalidate されなくなる」のみで、両ルートとも `staleTime: 0` のため再進入時 fresh load が成立する。
- **AC-8**: `router.invalidate({ filter })` は**現在マウント中の matches にしか作用しない**ため、edit 画面滞在中の旧 `routerInvalidate(router)` が触れた match は `__root__` / `/_app`(除外) / edit ルート自身のみ。削除は無害どころか唯一の実効果（edit ルート自身の再評価）を消す正しい変更。遷移先 detail は `staleTime: 0` で fresh load（TC-008 で確認済み）。
- **AC-9**: lazy `useReducer` の seed-once 契約が `noteEditorSeedOnce.test.tsx` で pin され、テストの JSDoc が「生 invalidate の RSC 再マウント経路は守れない」と効果範囲を正しく限定している。
- **AC-10 / ADR-007（InlineEditor effect 分離）**: マウント effect（`[]`）とリシンク effect（`[value]`）の分離は正しい。
  - StrictMode 二重マウント: cleanup で `lastEmittedHtmlRef.current = null` に戻すため、再マウント時のリシンク effect が self-emit と誤判定せず必ず rebuild する（`InlineEditor.tsx:807-809`）。effect は宣言順（mount → resync → disabled）に実行されるので `rebuildRef` は resync 実行時点で必ず設定済み。
  - 外部 value 変更: `value !== lastEmittedHtmlRef.current` で従来どおり全再構築（invariant 5 維持）。rebuild は `snapshotRef` を新 body で更新するため、以後の rollback は新コンテンツを復元する（rollback との整合 OK）。
  - リーク/解除漏れ: cleanup で全リスナー解除・observer disconnect・`rebuildRef`/`observerRef` null 化・debounce timer clear・host 空化。漏れなし。
  - rebuild 中の observer disconnect → 失敗パス含む全分岐で `restartObserver()` が呼ばれ、observe が死んだままになる経路はない。

#### Warnings

- **[W-001]** rebuild が pending の debounce emit timer を clear しない / 場所 `app/components/note/editor/InlineEditor.tsx:580-633`（`rebuild`）と `:475-487`（`emit`） / 理由: 旧実装では `[value]` effect の cleanup が外部 value 変更のたびに `debounceTimerRef` を clear していたが、新 `rebuild` は clear しない。成功パスでは rebuild が `lastEmittedHtmlRef` を新 serialize に更新するため timer 発火時に `next === lastEmitted` で no-op になり無害だが、**失敗パス**（`body === null`、または `trimmed.length > 0 && body.childNodes.length === 0` — 例: コメントのみの HTML）では host が空のまま `lastEmittedHtmlRef` が旧値に留まるため、約50ms後に pending timer が `serializeHostContent(host) = ""` を emit し `onChange("")` が親 state の本文を空文字で上書きしうる（autosave が "" を永続化する二次被害もありうる）。発生窓は「キーストローク後50ms以内に parse 不能な外部 value が届く」と極めて狭いが、旧実装には存在しなかった経路 / 提案: `rebuild` 冒頭（`host.replaceChildren()` の前）で `debounceTimerRef` を clearTimeout + null 化する。rebuild は emit 対象の DOM 自体を破棄するので、pending emit を生かす理由は構造的にない。
  → 対応済み: `rebuild` 冒頭で `debounceTimerRef` を clearTimeout + null 化

- **[W-002]** エディタールート除外の JSDoc「loaders only seed the editor's initial values」は厳密には過大 / 場所 `app/components/common/routerInvalidate.ts:1134-1146`（`EDITOR_ROUTE_IDS` JSDoc） / 理由: edit/new ルートの loader は `initial*` だけでなく `DirectoryPicker` に渡す `tree`（ディレクトリ一覧 = 生きた表示データ）も供給する。除外によりエディター滞在中は他経路（UploadDialog の取り込み反映等、`routerInvalidate` 経由の全 mutation）でディレクトリが増減してもピッカーの選択肢が再進入まで更新されない。エディター内の rename/delete ダイアログは生 `router.invalidate()` なので追従する（その意味で実害は限定的）が、「seed 専用」という前提が崩れる将来の loader 拡張で罠になる / 提案: 修正必須ではない。JSDoc に「`tree` 等の補助データも凍結される（再進入で回復）」旨を一言足すか、ADR-003 の Consequences に追記して前提を正確にしておく。
  → 対応済み: JSDoc に `tree` 等の補助データ凍結を追記し、ADR-003 Consequences にも記録

#### Notes

- **[N-001]** TC-009 の実測（生 `router.invalidate()` でも未保存編集が維持された）は、plan/ADR-003 が前提とした「RSC ツリー差し替え = エディター再マウント」と食い違う。seed-once（lazy initializer）が実際に効いた = loader 再実行は同一インスタンスへの props 更新で済んでいる可能性が高い。良い方向の乖離だが、「既知の残課題」として後続 Issue 判断の材料になる記録なので、ADR-003 / plan の残課題節にこの実測結果を反映（または後続 Issue 不要の判断を明記）しておくとよい。
  → 対応済み: ADR-003 に「実測による前提の補正」節を追記（現時点では後続 Issue 起票不要と明記）
- **[N-002]** リシンク effect の `value === lastEmittedHtmlRef.current` ガードは、連続入力中に親の再レンダーが emit 間隔（debounce 50ms）より遅延した場合、古い value で一度 rebuild → 直後に最新 value で再 rebuild する瞬間的なフォーカス喪失 race が理論上残る（controlled-component 標準の遅延 race）。旧実装にも同一の窓があり本 PR の退行ではない。通常レンダーは同期的でほぼ踏めないため対応不要、認識のみ。
- **[N-003]** rollback は `lastEmittedHtmlRef` を復元後 serialize に更新するが `onChange` は呼ばないため、rollback 直後は親 state と DOM が一時的に乖離する（次のテキスト編集の emit で収束）。旧実装と同一の既存挙動で、effect 分離との新たな相互作用はないことを確認済み。
- **[N-004]** `noteEditorSeedOnce.test.tsx` はタイトルのみ pin している。seed-once は単一 reducer の lazy initializer なのでタイトルで契約全体を代表できており十分だが、将来 content/tags が別 state に分離される場合はテストの追従が必要。
