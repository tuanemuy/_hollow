# PR #676 Review — State / Router invalidate / Editor lifecycle（Round 2 / ゼロベース）

レビュー観点: AC-7〜AC-10、ADR-003〜007 との整合、InlineEditor の effect 分離（マウント / value リシンク）、StrictMode 二重マウント、MutationObserver 相互作用、リスナー・timer リーク、race condition。Round 1（review-001-state.md）指摘 W-001 / W-002 / N-001 の修正検証を含む。

確認対象: `app/components/common/routerInvalidate.ts`（+test）、`app/components/note/editor/InlineEditor.tsx`（現行全文精読）、`NoteEditor.tsx`、`__tests__/inlineEditor.test.tsx` / `noteEditorSeedOnce.test.tsx`、`.issue/669/plan.md` AC-7〜10、`adr.md` ADR-003〜007。関連ユニットテスト 3 ファイル（45件）はローカル実行で全 PASS を確認。

### State/Router

#### Blockers

なし。

#### Warnings

なし。

Round 1 指摘の修正検証（すべて正しく反映されていることを確認）:

- **W-001（rebuild の debounce timer clear）→ 修正済み・正しい**: `InlineEditor.tsx:585-588` で `rebuild` 冒頭（`observer.disconnect()` / `host.replaceChildren()` より前）に `debounceTimerRef` の clearTimeout + null 化が入った。失敗パス（parse 失敗 / 空 body）で stale timer が空ホストを serialize して `onChange("")` を emit する経路は塞がれている。コメントも「なぜ」（失敗パスで "" を上書き emit しうる）を正確に説明している。
- **W-002（JSDoc の「seed 専用」過大主張）→ 修正済み・正しい**: `routerInvalidate.ts` の `EDITOR_ROUTE_IDS` JSDoc に「loader は補助表示データ（`DirectoryPicker` の `tree` 等）も供給し、エディター滞在中は凍結される／エディター内の rename・delete は rule 2 の生 invalidate なので追従する／loader 拡張時はこの凍結に注意」が追記された。ADR-003 Consequences にも同内容を記録済み。
- **N-001（TC-009 実測と ADR 前提の乖離）→ 修正済み・正しい**: ADR-003 に「実測による前提の補正（TC-009, PR #676 Round 1 N-001）」節が追加され、rule 2 生 invalidate 後も未保存編集が維持された実測・seed-once が効いたという解釈・「現時点では後続 Issue 起票不要」の判断が明記された。

ゼロベース再検証で問題なしを確認した主要項目:

- **AC-7（routerInvalidate のエディター除外）**: `EDITOR_ROUTE_IDS` 2件は実在ルートファイル（`app/routes/_app/notes/$noteId/edit.tsx` / `new.tsx`）と一致。除外は `_app` 除外・追加 filter との AND 合成（`routerInvalidate.ts:72-76`）で、always-true filter でもすり抜けないことがテストで pin 済み（`routerInvalidate.test.ts:54-72`）。表示系ルート（`/_app/notes`, `/_app/notes/$noteId`）が `true` のままであることも pin 済み。`appShellInvalidate` は厳密一致のため無変更で正しく、edit ルートが除外されることのテストも追加されている（`:114`）。
- **AC-8（保存後 invalidate 削除）**: `NoteEditor.tsx` の保存パスから `routerInvalidate(router)` と import が完全に除去され、理由コメント（detail ルート `staleTime: 0` → 遷移で必ず fresh load）も正確。edit 画面滞在中の invalidate はマウント中 match（root / _app除外 / edit自身）にしか作用しないため、削除による表示系の鮮度退行はない。
- **AC-9（seed-once）**: lazy `useReducer` initializer + 契約コメント（`NoteEditor.tsx:108-109`）+ `noteEditorSeedOnce.test.tsx` の pin。plan の効果限定（生 invalidate の RSC 再マウント経路は守れない）とテスト JSDoc の主張が一致。
- **AC-10 / ADR-007（effect 分離）**:
  - マウント effect（`[]`）が emit / rollback / highlight / observer / `rebuild` / 全リスナーを所有し、リシンク effect（`[value]`）は `value !== lastEmittedHtmlRef.current` のときのみ `rebuildRef.current?.(value)`。self-emit round-trip で live DOM（フォーカス・キャレット）に一切触れない構造が成立しており、round-trip 後も同一ノードインスタンスが保たれることがテストで pin 済み（`inlineEditor.test.tsx:221-252`）。
  - StrictMode: cleanup で `lastEmittedHtmlRef.current = null` に戻すため、remount のリシンク effect が self-emit と誤判定せず必ず rebuild する。effect は宣言順（mount → resync）で実行されるため resync 時点で `rebuildRef` は設定済み。`StrictMode` テストで pin 済み（`inlineEditor.test.tsx:254-273`）。
  - リーク: cleanup で 7 リスナー解除・observer disconnect + takeRecords・`observerRef` / `rebuildRef` null 化・debounce timer clear・`host.replaceChildren()`。漏れなし。
  - observer 相互作用: `rebuild` は disconnect → takeRecords → replaceChildren で自分の churn を観測させず、全分岐（成功 / parse失敗 / 空ノート / 空body）で `restartObserver()` が呼ばれ observe が死ぬ経路はない。rebuild が同期実行中に配送待ちだった observer callback は takeRecords でキューが空になるため空 records で発火し emit no-op に収束する。rollback は `snapshotRef` を rebuild が更新した最新スナップショットから復元するため、外部 value 変更後の rollback が旧コンテンツを復元する race もない。
  - `hostRef.current === null` でマウント effect が early return した場合は `rebuildRef` が null のままリシンク effect が optional-chain で no-op になるが、host は同一コンポーネントが常時レンダーする要素であり ref は effect 実行前に必ず設定されるため実害なし。

#### Notes

- **[N-001]** `EDITOR_ROUTE_IDS` JSDoc の括弧書き「(RSC tree swap remounts the editor and drops focus)」は、ADR-003 の「実測による前提の補正」（TC-009: 生 invalidate でも再マウントは観測されず編集が維持された）と微妙に食い違う / 場所 `app/components/common/routerInvalidate.ts:29-30` / 理由: ADR 側は補正済みだが、コード側 JSDoc は当初前提のまま。除外の正当性は「loader 再実行に恩恵がない + staleTime: 0 で fresh load」だけで十分成立しており結論は揺らがないため、修正必須ではない / 提案: 任意。次にこのファイルを触る際に括弧書きを「（観測上は props 更新で済む場合もあるが、いずれにせよ恩恵がない）」程度に弱めるか、ADR-003 の補正節への参照を足すと前提が一貫する。→ 対応済み: 断定形を「may destroy」に弱め、TC-009 実測（同一インスタンスへの props 更新で編集維持）と ADR-003 補正節への参照を JSDoc に追記。除外の正当性（恩恵なし + staleTime: 0）も明記した。
- **[N-002]** rebuild の空ノートパス（`InlineEditor.tsx:619-623`）は `lastEmittedHtmlRef.current = nextValue` を serialize せず生値のまま格納する。whitespace-only の value（例: `"  "`）では以後の serialize（`""`）と恒久不一致になるが、emit は mutation 起点でしか走らず空ホストは編集不能なので実害経路はない。旧実装と同一の挙動であり退行ではない。認識のみ。
