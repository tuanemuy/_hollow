# レビュー review-001 — Frontend / RSC・エラーハンドリング（PR #734 / Issue #599）

対象 PR: #734
実装計画: `.issue/599/plan.md`（設計判断: `.issue/599/adr.md`）
観点: Frontend / RSC・エラーハンドリング

## 総評

方式(d)（RSC コンポーネント内で `isNotFoundError` を捕捉し、ルート意図の `ErrorPage` を JSX として直接 return する）が、ADR-001 / ADR-004・確立済みパターン（`app/components/note/detail/NoteDetail.tsx`）と完全に整合した形で実装されている。3ルート（`/notes/public/$noteId`・`/u/$username/$noteSlug`・`/u/$username`）すべてに対し、`PublicNoteDetail`（byId/bySlug 両入口）と `UserPublicTop` の2コンポーネントを修正することで波及をカバーしており、`kind`（gone / notFound）もルート側 `notFoundComponent` 配線と一致する。未使用 import の除去・WHY コメント・回帰テストいずれも計画どおり。`pnpm test:unit` で対象2ファイル 8ケース全 PASS を確認した。受け入れ基準 AC-1〜AC-5 はいずれも Frontend 実装で満たされている（AC-6 のテストも追加済み）。

Blocker・Warning ともになし。以下は良い点と軽微な参考情報のみ。

### Frontend / RSC・エラーハンドリング

#### Blockers

なし。

#### Warnings

なし。

#### Notes

- **[N-001]** 方式(d) と確立済みパターンの整合が正確。`PublicNoteDetail` / `UserPublicTop` ともに取得処理を `let loaded; try { … } catch (error) { if (isNotFoundError(error)) return <ErrorPage … />; throw error; }` で囲む形で、`NoteDetail.tsx`（`NoteDetailContent`、`app/components/note/detail/NoteDetail.tsx:64-99`）の「load を try/catch・NotFound は JSX return・それ以外は re-throw」と同型。非 NotFoundError の re-throw が保たれており、本来の system エラー経路（`errorComponent` → `ErrorPage kind="system"`）は壊れていない。
  - 検証: `app/components/public/PublicNoteDetail.tsx:76-82`、`app/components/public/UserPublicTop.tsx:110-127`。

- **[N-002]** `throw notFound()` → `ErrorPage` 直接 return 方式が ADR-004 と整合し、3ルートすべてで機能する。
  - byId（`app/routes/notes/public/$noteId.tsx:100`）・bySlug（`app/routes/u/$username/$noteSlug.tsx:108`）はともに `notFoundComponent: () => <ErrorPage kind="gone" />`、`PublicNoteDetail` の return は `<ErrorPage kind="gone" />`（`PublicNoteDetail.tsx:80`）で一致。
  - `/u/$username`（`app/routes/u/$username/index.tsx:169`）は `notFoundComponent: () => <ErrorPage kind="notFound" />`、`UserPublicTop` の return は `<ErrorPage kind="notFound" />`（`UserPublicTop.tsx:125`）で一致。
  - ルート側 `notFoundComponent` 配線は計画どおり変更なし（loader 段・グローバル経路の保険として温存）。手動検証レポート（`.issue/599/manual-test/report.md`、TC-1〜TC-6 全 PASS）でも実機挙動を裏付け済み。

- **[N-003]** `PublicNoteDetail` の try/catch 範囲が適切。`loadPublicNote(args)` のみを囲み、後続の `loadPublicBacklinks` / `loadRelatedPublicNotes`（`PublicNoteDetail.tsx:85-88`、本体取得成功後にしか走らない）は try/catch の外。これは ADR-002 の意図どおりで、(1) 取りこぼし無し（NotFound 源は本体取得のみ。noteId 実在後の backlink/related が NotFound を出すのは想定外であり、その場合は意図どおり system エラーに落ちる）、(2) backlink/related 段の想定外エラーを誤って `gone` に握り潰さない、を両立している。

- **[N-004]** `UserPublicTop` の `Promise.all` 全体 try/catch が、実在ユーザー・ノート0件のケースを誤って notFound に倒さないことを確認。`getPublicProfile` / `listUserPublicNotes` / `listUserPublicTags` の3ユースケースはいずれもユーザー不在（null / deleted / suspended）のときだけ `NotFoundError` を投げ、実在ユーザーでは空リストを返す（plan.md「あるべきアーキテクチャ」AC-4 の論拠）。よって `isNotFoundError` が真になるのは profile 不在のみで、`Promise.all` 全体をまとめて try/catch しても 0件ユーザーが誤って 404 にならない。新規テスト「does not render the notFound page for a real user with zero notes」（`app/components/public/__tests__/UserPublicTop.test.tsx:1076-1088`）でこの不変条件を固定しており、AC-4 の実証として適切。

- **[N-005]** `ErrorPage` が `PublicLayout` を内包する（`app/components/public/ErrorPage.tsx:88` の `<PublicLayout hideHeaderSearch>`）ため、正常系（`PublicNoteDetail.tsx:91` / `UserPublicTop.tsx:151` の `<PublicLayout>`）を丸ごと `ErrorPage` へ差し替える本実装では二重レイアウトにならない。正常系の `return <PublicLayout>…` の「代わりに」early return している構造で、部分差し込みになっていない点が正しい。

- **[N-006]** `cache()` ラッパーから `notFound()` 変換を除去したことに副作用はない。`loadPublicNote` / `loadProfile` / `loadNotes` / `loadPublicTags` は同一引数なら同一結果（成功 or 同一エラー）を返す純粋ローダーに戻っただけで、`cache()` のメモ化キー（引数）も振る舞いも不変。catch を呼び出し側（コンポーネント本体）へ移しただけなので、同一引数での再呼び出しや cache 共有に差は出ない。`isNotFoundError` 判定はメモ化されたエラー値に対しても安定して効く。

- **[N-007]** 未使用 import（`notFound`）の除去漏れなし。`PublicNoteDetail.tsx:1` / `UserPublicTop.tsx:1` ともに `import { Link } from "@tanstack/react-router";` に変更済みで `notFound` は残っていない。代わりに `ErrorPage` を import 追加済み（`PublicNoteDetail.tsx:6` / `UserPublicTop.tsx:12`）。

- **[N-008]** WHY コメントが適切（過剰でない）。両コンポーネントとも catch 内に1行のみ「RSC 内 notFound() は notFoundComponent に届かないため、ルート意図の ErrorPage を直接返す。ADR-004 / Issue #599」を付しており（`PublicNoteDetail.tsx:79` / `UserPublicTop.tsx:124`）、CLAUDE.md の「WHY が非自明なときだけ」方針に沿う。ADR 参照付きで根拠を辿れる。

- **[N-009]** 回帰テストが計画（ステップ5・AC-6）と plan のレビュー指摘（P-001〜P-003 / S-001 / S-002）を正しく反映。
  - `PublicNoteDetail.test.tsx` は**既存ファイルへの追記**で、`renderToStaticMarkup(await Component(props))` 直呼び方式・`serverData` モック分岐（`noteError` フラグ）に統一。既存3ケース（正常系本文・backlink・related）を温存しつつ各ケース冒頭で `noteError = null` をリセットしており、ケース間の状態漏れを防いでいる。
  - 検証点は「NotFound → `ErrorPage kind="gone"`（「このノートは公開されていません」/「Error code: 410 Gone」）を throw せず return」「非 NotFoundError は `rejects.toThrow("boom")` で re-throw」の2点で、`NoteDetail.test.tsx` 方式に整合。vacuous な `not.toHaveBeenCalled()` 検証は採っていない。
  - 旧 `notFound: () => new Error("notFound")` モックを削除し、`ErrorPage` 描画に必要な `useRouter`（`ErrorNavActions.tsx` の `BackLink` が依存）モックへ差し替えている。`PublicLayout` 等の重い依存もスタブ化済みで、RSC 直呼びテストとして妥当。
  - `UserPublicTop.test.tsx`（新規）も同方式で、検証点3（NotFound→notFound / 非 NotFound re-throw / 0件ユーザーで誤404にならない）をカバー。

#### 軽微な参考（修正不要）

- **[N-010]** `UserPublicTop.test.tsx` の `serverData` モックは引数が string か否かでのみ分岐するため、`loadProfile` と `loadPublicTags`（ともに username 文字列）が同じ戻り値オブジェクト（`{ user, publicNoteCount, tagNames: allTags }`）を返す。本体側の destructure が各々必要なキーだけ取り出すため動作上は正しく、テストの意図（NotFound 分岐・0件分岐の検証）も成立している。実ローダーの戻り値形（`loadProfile` は `tagNames` を含まない等）とは厳密一致しないが、検証対象がエラーハンドリング分岐であり問題はない。将来 username を引く別ローダーが増えて戻り値要件が分かれた場合に備え、`loadPublicTags` 分岐を明示したくなったら呼び出し回数や引数内容で分けられる、という余地のメモに留める（今回の修正不要）。

- **[N-011]** スコープの割り切り（HTTP は 200 のまま・画面のみ 404/410 系）は ADR-004・plan.md「含まれないもの」と整合しており、本 Issue の UX 退行解消という目的に対して妥当。SEO 厳密性が要件化された場合は別 Issue（plan.md「未解決事項」P-NONE）という整理も正しい。Frontend 観点で追加の対応は不要。
