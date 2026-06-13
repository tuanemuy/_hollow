# PR #676 Review — Round 1

### Test

レビュー実施内容: `gh pr diff 676` を plan.md「テスト方針」と突き合わせ、対象3テストを実行（44/44 pass）。さらに `inlineEditor.test.tsx` の新規回帰テストを main 版 `InlineEditor.tsx` に差し替えて単独実行し、**main で FAIL することを実証**（偽陽性でない実質的な pin であることを確認済み）。

#### Blockers

なし

#### Warnings

- **[W-001]** seed-once 契約の pin がタイトルのみで、本文（`contentHtml`）・タグ・ディレクトリの再シードは検出できない
  - 場所: `app/components/note/editor/__tests__/noteEditorSeedOnce.test.tsx:153-166`
  - 理由: plan.md テスト方針は「`initialTitle` / `initialContentHtml` を変えて rerender → 編集中の値が維持される」と両方を明記している。テストは `initialContentHtml` を変えた props は渡しているが、アサーションは `titleInput().value` のみ。将来 `useEffect` での props 再同期が **本文だけ**（例: `dispatch(setContent)` で `initial*` を流し込むコード）に紛れ込んだ場合、この pin はすり抜ける。フォーカス喪失の実害が最も大きいのは本文側であり、守りたい対象に対して検証対象が片肺
  - 提案: 編集後の `state.contentHtml` が維持されることもアサートする。例: InlineEditor のホスト（`.note-detail-content`）の `innerHTML` が `<p>server</p>` に置き換わっていないことの確認、または HTML モードに切り替えて textarea 値を確認。最低限 `expect(container.innerHTML).not.toContain("server")` 相当でも本文再シードの検出はできる
  - → 対応済み: inline ホスト（`.note-detail-content`）の textContent が "foo" を維持し、`container.innerHTML` に "server" が現れないことをアサート

- **[W-002]** `lastEmittedHtmlRef` の cleanup での `null` リセット（StrictMode 再マウント対策）がテストで pin されていない
  - 場所: `app/components/note/editor/InlineEditor.tsx`（cleanup 末尾の `lastEmittedHtmlRef.current = null`）/ `inlineEditor.test.tsx`
  - 理由: このリセットは「StrictMode の mount→cleanup→remount で self-emit と誤判定して空ホストになる」のを防ぐ修正の不可分な一部（ADR-007 に明記）だが、テストは全て非 StrictMode の `createRoot` で、このリセットを削除してもスイートは green のまま。effect 分離構造で最も壊れやすい箇所（「cleanup 後に ref が古い値を保持 → remount でビルドがスキップされ空ホスト」）が無防備
  - 提案: `<StrictMode>` でラップしてマウントし、ホストに `<p>foo</p>` が構築されていること（空ホストでないこと）を確認するテストを1本追加する。`react` の `StrictMode` で happy-dom 上の double-invoke は再現可能
  - → 対応済み: `StrictMode` ラップのテストを追加し、remount 後もホストに `<p>foo</p>` が構築されることを pin

#### Notes

- **[N-001]** `routerInvalidate.test.ts` の拡張は plan のテスト方針に完全準拠: エディター系2ルートの除外（`routerInvalidate.test.ts:54-63`）、非除外ルート（`/_app/notes`, `/_app/notes/$noteId`）の通過、追加 filter（`alwaysTrue`）との AND 合成下でのすり抜けなし（`:65-72`）、`appShellInvalidate` の不変（edit ルートの `false` アサーション追加）。網羅性に不足なし
- **[N-002]** `inlineEditor.test.tsx` の round-trip 回帰テストは、要素・テキストノードの**参照同一性**（`toBe(p)` / `toBe(textNode)`）と echo emit なしの両方をアサートしており、修正対象の故障モード（cleanup の `replaceChildren` によるガードすり抜け → 全再構築）を直接捕捉する。main 実装で FAIL することを実測済み。既存の「外部 value 変更で rebuild する」テスト（`:201`）が invariant 5（External value sync）側を pin しており、ペアとして過不足ない
- **[N-003]** `EDITOR_ROUTE_IDS` は文字列リテラルの pin であり、ルートファイル移動で routeId が変われば除外が静かに無効化される。plan レビュー（arch S-004）で実ルートツリー由来の検証を見送った判断は記録済みで、ここでは受容済みリスクとして確認のみ
- **[N-004]** スタイル変更（ステップ3-7）・保存後 invalidate 削除（AC-8）・rule 2 経路はユニットテスト対象外という plan の線引きどおりで、`.issue/669/manual-test/`（TC-001〜010、TC-007 は FAIL→修正→再検証 PASS）で代替されている。`rebuild` 失敗パス（parse 失敗・空 body）の挙動は既存の `onInitFailed` 系テスト（`:267`, `:281`）が新構造でも通っており回帰なし

#### 実行結果

- `pnpm vitest run`（routerInvalidate / inlineEditor / noteEditorSeedOnce）: 3 files, 44 tests, all passed
- main 版 InlineEditor + 新回帰テスト: 1 failed（pin の実質性を確認）
