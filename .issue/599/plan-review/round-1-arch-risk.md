# 計画レビュー round-1 — アーキテクチャ整合性・実現可能性・リスク（Issue #599）

対象: `.issue/599/plan.md` / `.issue/599/adr.md`
視点: あるべきアーキテクチャとの整合性・実現可能性・リスク

---

## 総評

根本原因の診断（RSC 内 `throw notFound()` が `renderServerComponent` の handler/middleware の外側で発生し、`notFoundComponent` に届かず素のエラーとして `errorComponent`＝system/500 に落ちる）は**ソース実体と一致しており正確**。`node_modules/@tanstack/react-start-rsc@0.1.24/.../renderServerComponent.js` を確認した結果、`renderToReadableStream(node)` で Flight ストリームを起こし renderable proxy/handle を同期 return する実装で、async render が handler の await 経路の外側で進むという計画・ADR の主張は裏付けられた。`.issue/12/adr.md` ADR-004 も実在し、確立済み回避パターン（RSC 内で捕捉し notFound 用 JSX を直接 return）の一次情報源として計画の引用どおり。方式(d)の選定は妥当で、(a)(b)(c) の却下理由も技術的に正しい。

実装ステップ 1〜4（コンポーネント側で `isNotFoundError` を捕捉し `ErrorPage kind="gone"|"notFound"` を return、`notFound` import 除去、ルート配線維持、typecheck/lint/format）は、`NoteDetail.tsx` の確立済みパターンの自然な拡張であり、レイヤー責務（presentation/RSC 境界の問題、ドメイン・ユースケース不変）も正しく切り分けられている。`head` フォールバック（`loadPublicNoteMeta` / `loadProfileMeta` が `isNotFoundError` を catch して `null` を返し、ルート `head` が `.catch(() => null)` で既定値に落ちる）も独立経路で整合しており、本修正で回帰しないことを確認した。

問題点は**テスト方針（ステップ5）に集中**している。実装本体の設計はほぼそのまま実行可能。

---

#### 問題点（要修正）

- **[P-001]** `PublicNoteDetail.test.tsx` を「新規作成」とする前提が誤り（既存ファイルが存在）
  - 理由: 計画ステップ5・テスト方針は `app/components/public/__tests__/PublicNoteDetail.test.tsx` を「（新規）」として作る前提だが、**同ファイルは既に存在する**（backlink/related セクションの 3 ケースを持つ）。新規作成として書くと既存テストを上書き・消失させるリスクがある。また既存テストは「happy-dom + createRoot + `notFound` を `vi.fn()`」ではなく、`renderToStaticMarkup(await PublicNoteDetail({...}))` で**コンポーネントを直接呼び出して文字列描画を検査**する方式で、計画が想定するテスト形（`ErrorPage.test.tsx` の createRoot 系）と異なる。
  - 提案: ステップ5を「新規作成」ではなく「**既存 `PublicNoteDetail.test.tsx` に NotFound ケースを追記**」に修正する。テスト方式も既存に合わせ、`const element = await PublicNoteDetail({ args: { kind: "byId", noteId } })` を呼び、`renderToStaticMarkup(element)` の結果に「このノートは公開されていません」/「Error code: 410 Gone」が含まれることを assert する形にする（happy-dom + createRoot へ作り替える必要はない）。

- **[P-002]** テスト対象モジュールのモックポイントが計画記述と食い違う（`getPublicNote` モジュールではなく `serverData` をモックしている）
  - 理由: 計画は「`loadPublicNote`（= `getPublicNote` モジュール）が `NotFoundError` を投げるケース」と書くが、`loadPublicNote` は `cache(serverData(() => import(".../getPublicNote"), ...))` のラッパー。既存 `PublicNoteDetail.test.tsx` は `@/core/presentation/serverAction` の **`serverData` 自体をモック**して、返り値関数が直接データを返すよう差し替えている。この構成では `serverData` のコールバック内の `try/catch`（= `getPublicNote` を呼んで `isNotFoundError` で `throw notFound()` する箇所）は**実行されない**。つまり「`getPublicNote` モジュールが NotFoundError を投げる」を素直にモックしても、現行のモック構造では try/catch 分岐自体を通らない。
  - 提案: 方式(d)採用後、`loadPublicNote` の cache ラッパーは「`getPublicNote` の結果をそのまま返す／NotFoundError はそのまま throw」に戻る（計画ステップ1どおり）。テストは既存に合わせて `serverData` モックの**返り値関数が `NotFoundError` を reject する**よう分岐させる（例: `getPublicNote(args)` 相当の呼び出し＝引数が `LookupArgs` のとき `throw new NotFoundError(...)`）。そのうえで `PublicNoteDetail` 本体の try/catch が `ErrorPage kind="gone"` を return することを検証する。計画の「`getPublicNote` モジュールを vi.mock」という記述を、実際のモック対象（`serverData` 経由の reject、または `loadPublicNote` 関数自体の差し替え）に合わせて修正すること。

- **[P-003]** `notFound()` の `not.toHaveBeenCalled()` 検証は方式(d)では**無意味（vacuous）**になる
  - 理由: 計画ステップ5・テスト方針は「`notFound` を `vi.fn()` にして `expect(...).not.toHaveBeenCalled()` で検証」とするが、方式(d)では `PublicNoteDetail` / `UserPublicTop` から `notFound` の import 自体を削除する（ステップ1・2）。呼び出し側にもう `notFound` が存在しない以上、「呼ばれない」assert は常に真で、何も保証しない（むしろ「テストが意味を持つ」誤った安心感を与える）。`NoteDetail.test.tsx`（既存の同型テスト）も `notFound not-called` ではなく「**notFound JSX が描画される**」「**それ以外のエラーは re-throw される**」の 2 点で検証している。
  - 提案: 検証点を `NoteDetail.test.tsx` に揃える: (1) NotFound 時に `ErrorPage`（gone / notFound）の文言が描画される、(2) NotFoundError **以外**のエラー（例: 素の `Error("boom")`）は `await expect(...).rejects.toThrow("boom")` で**そのまま throw される**（誤って握り潰さない回帰防止）。`notFound not.toHaveBeenCalled()` の記述は削除する。

#### 改善提案（検討推奨）

- **[S-001]** `UserPublicTop` の `Promise.all` 全体 try/catch は妥当だが、「NotFoundError 以外は re-throw」を明示テストで固定する
  - 理由: 計画は `Promise.all([loadProfile, loadNotes, loadPublicTags])` 全体を try/catch し `isNotFoundError` のみ `ErrorPage` 化、それ以外は throw とする方針。`loadNotes` / `loadPublicTags` は実在ユーザーでも検索条件次第で `BusinessRuleError`（不正な並び順・期間など）を投げ得るため、「NotFoundError 以外は確実に re-throw され system/500 に落ちる」ことが列挙耐性・既存挙動維持の前提になる。`NoteDetail.test.tsx` 同様に re-throw ケースを 1 本入れておくと、将来 catch 範囲を広げてしまう退行を防げる。

- **[S-002]** `UserPublicTop.test.tsx`（新規）は happy-dom ではなく `renderToStaticMarkup` 直呼びで足りる
  - 理由: `UserPublicTop` も `PublicNoteDetail` と同じ async server component で、検証点は「throw せず正しい `ErrorPage` を return する」こと。既存 `PublicNoteDetail.test.tsx` の `renderToStaticMarkup(await Component(props))` パターンが最小で再現性が高く、createRoot/act の DOM ライフサイクル管理が不要。計画の「`ErrorPage.test.tsx` / `NoteDetail.test.tsx` のパターンに倣う」は、実体としては `NoteDetail.test.tsx`（renderToStaticMarkup 系）に倣うのが正で、`ErrorPage.test.tsx`（createRoot 系）の混在記述は避ける。

- **[S-003]** スコープ外（HTTP 200 のまま画面のみ 404 系）の割り切りは正しいが、AC とリスク欄の整合を 1 箇所明記しておくと親切
  - 理由: 計画は「HTTP ステータス 404 付与は本 Issue の主目的にしない」と明記済みで、Issue 本文（UX 退行に限定）とも整合する。ADR-004 と同じ割り切りであることも妥当。指摘ではなく、レビュー観点としては**この割り切りが Issue 要件を満たす**ことを確認した（問題なし）。

#### 良い点

- 根本原因の診断が `renderServerComponent.js` 実体・`.issue/12/adr.md` ADR-004・`NoteDetail.tsx` JSDoc の三点で裏付けられており、推測でなく確証ベース。
- 方式(d)の選定根拠が明快で、(a)(b)(c)（handler/loader でのストリーム二度読み・存在しない正攻法導線）の却下理由が技術的に正確。フレームワーク制約に逆らわない判断。
- レイヤー責務の切り分けが正しい（ドメイン・ユースケース不変、`errorResponseMiddleware`/`errorResponse.ts`/`sanitizeRouteError` 不変＝RSC 内 throw はこの経路を通らないという調査結論と一致）。列挙耐性（`getPublicNote`/`getPublicProfile` の一律 NotFound 潰し）を維持する明言も適切。
- `PublicNoteDetail`（byId / bySlug 両入口を 1 修正でカバー）と `UserPublicTop` の依存関係を正しく把握し、`PublicNoteDetail`→gone / `UserPublicTop`→notFound の `kind` をルート `notFoundComponent` 配線に一致させている。
- `ErrorPage` が `PublicLayout` を内包するため二重レイアウトにならない、という点を正しく押さえ、「正常系の return を丸ごと差し替える」方針を明記。
- `head`（meta/JSON-LD）が notFound 時も壊れない（`loadPublicNoteMeta`/`loadProfileMeta` が `null` を返し `.catch(() => null)` でフォールバック）ことを独立経路として正しく整理。本修正と干渉しないことを確認済み。
- ルート側 `notFoundComponent` 配線を残す判断（loader 段・`__root.tsx` グローバル経路の保険）が合理的。
- 「ユニットでは RSC ストリーム挙動を完全再現できない／検証点を return 値に置く／最終確認は手動」という限界の明示が誠実で、テスト方針の現実性を担保している。
