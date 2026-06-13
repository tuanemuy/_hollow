# PR #676 Review — State / Router invalidate / Editor lifecycle（Round 3 / ゼロベース）

レビュー観点: plan.md AC-7〜AC-10、adr.md ADR-003〜007 との整合。InlineEditor の effect 分離（mount-once / value リシンク / disabled）、StrictMode 二重マウント、MutationObserver 相互作用、リスナー・timer リーク、race condition をゼロベースで再点検。Round 1/2 指摘（W-001 / W-002 / N-001 / Round 2 N-001）は反映済みであることを現行コードで再確認した。

確認対象: `app/components/common/routerInvalidate.ts`（+test）、`app/components/note/editor/InlineEditor.tsx`（全文精読）、`NoteEditor.tsx`、`__tests__/inlineEditor.test.tsx` / `noteEditorSeedOnce.test.tsx` / `routerInvalidate.test.ts`（3 ファイル 46 件をローカル実行・全 PASS）、ルートファイル（`edit.tsx` / `new.tsx` / `$noteId/index.tsx` の `staleTime: 0` 実在確認）。

### State/Router

#### Blockers

なし。

#### Warnings

なし。

ゼロベースで問題なしを確認した主要項目:

- **AC-7**: `EDITOR_ROUTE_IDS`（`/_app/notes/$noteId/edit` / `/_app/notes/new`）は実在ルートと一致し、両 loader とも `staleTime: 0` を確認。除外は `_app` 除外・追加 filter と AND 合成され、always-true filter でもすり抜けないことをテストで pin 済み。`appShellInvalidate` は厳密一致のまま無変更で正しい。
- **AC-8**: `NoteEditor.tsx` 保存パスから `routerInvalidate(router)` と import が除去済み。遷移先 detail ルートは `staleTime: 0`（`$noteId/index.tsx:37` で実在確認）なので navigate が必ず fresh load し、鮮度退行はない。
- **AC-9**: `useReducer` lazy initializer による seed-once + `noteEditorSeedOnce.test.tsx` の pin。テスト JSDoc も「生 invalidate の RSC 再マウント経路には効かない」と plan の効果限定と一致した主張になっている。`props.tree` は live 参照のままで、ピッカー選択肢の更新経路（rule 2 生 invalidate）は維持。
- **AC-10 / ADR-007（effect 分離）**:
  - mount-once effect（`[]`）が observer・全 7 リスナー・`rebuild` を所有し、リシンク effect（`[value]`）は `value !== lastEmittedHtmlRef.current` のときのみ `rebuildRef.current?.(value)`。self-emit round-trip が live DOM に触れない構造を再確認（同一ノードインスタンス維持のテスト pin あり）。
  - effect 宣言順（callback refs → mount-once → resync → disabled）により、初回 resync 時点で `rebuildRef` と `disabledRef` は設定済み。初回 build 後に disabled effect が `lastEmittedHtmlRef` を再 serialize するが同値で無害。
  - StrictMode: cleanup の `lastEmittedHtmlRef.current = null` リセットにより remount 時の resync が self-emit と誤判定せず必ず rebuild。テストで pin 済み。
  - リーク: cleanup で 7 リスナー解除・`observer.disconnect()` + `takeRecords()`・`observerRef` / `rebuildRef` null 化・debounce timer clear・`host.replaceChildren()`。漏れなし。observer 変数は mount-once クロージャ捕捉なので cleanup が `observerRef` の null 化後でも正しい対象を disconnect する。
  - observer 相互作用 / race: `rebuild` は冒頭で pending debounce timer を kill（Round 1 W-001 対応の維持を確認）し、disconnect → takeRecords → replaceChildren で自分の churn を観測させない。成功・parse 失敗・空ノート・空 body の全分岐で `restartObserver()` が呼ばれ observe が死ぬ経路はない。`rollback` は `snapshotRef`（rebuild が更新する最新スナップショット）から復元するため、外部 value 変更後の rollback が旧コンテンツを復元する race はない。`highlightPre` は async だが `isHighlightingRef` + `takeRecords()` で自走 churn を遮蔽し、focus 保持条件（`target.contains(activeElement)`）でキャレット復元が focus を奪わない。
- **invalidate 呼び出し網羅**: `routerInvalidate` 利用箇所（UploadDialog 含む約 10 ファイル）はラッパー経由なので全てエディター除外が効く。生 `router.invalidate()` の残存呼び出しは auth 系（rule 1）・directory 改変系（rule 2: IngestionPreviewForm / IngestionJobRow / directory ダイアログ）・displayName（rule 3: ProfileForm）に限られ、3 ルール例外と整合。rule 2 経由の編集内容喪失経路は ADR-003 / plan に「既知の残課題」として記録済みで、主張と実装が一致している。

#### Notes

- **[N-001]** `disabled` toggle effect（`InlineEditor.tsx:830-856`）が `lastEmittedHtmlRef.current = serializeHostContent(host)` で上書きするため、直前 50ms 以内のキーストロークの pending debounce emit が「self-emit 済み」と誤判定されて skip され、その編集分が親 state に届かない理論経路がある（DOM と `state.contentHtml` の divergence）。ただし disabled flip（submit の `isPending` / edit lock）と 50ms デバウンス窓の競合という極小ウィンドウで、かつ main から存在する既存挙動（本 PR の effect 分離による退行ではない）。認識のみ、対応不要。
- **[N-002]** rebuild の空ノートパスは `lastEmittedHtmlRef.current = nextValue` を serialize せず生値のまま格納する（whitespace-only value で以後の serialize と恒久不一致）が、空ホストは編集不能で emit 経路がなく実害なし。Round 2 N-002 と同一認識・旧実装と同挙動。
