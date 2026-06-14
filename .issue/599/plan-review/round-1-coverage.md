# レビュー round-1 — Issue #599 計画レビュー（観点: 要件カバレッジ・スコープ整合性）

対象: `.issue/599/plan.md` / `.issue/599/adr.md`
レビュー日: 2026-06-14

## 検証サマリー

計画の主要前提をソースで実機検証した結果、**要件カバレッジ・スコープ整合性は概ね健全**。Issue 本文の要件（byId ルートの 500→410）とオーナーコメントの合意事項（`/u/$username` の 500→404、両ルートまとめ対応）はすべて受け入れ基準に落ちており、漏れは無い。スコープ外作業の混入も無い。

ただし**実装ステップ5（テスト）の記述に事実誤認が1件**あり、これは要修正（成果物の前提が現状と食い違う）。残りは改善提案・確認事項。

### 検証済みの前提（いずれも計画どおりで正しい）

- `/notes/public/$noteId.tsx`:100 → `notFoundComponent: () => <ErrorPage kind="gone" />`（計画 AC-1 前提どおり）
- `/u/$username/$noteSlug.tsx`:108 → `notFoundComponent: () => <ErrorPage kind="gone" />`（AC-2 前提どおり）
- `/u/$username/index.tsx`:169 → `notFoundComponent: () => <ErrorPage kind="notFound" />`（AC-3 前提どおり）
- `ErrorPage.tsx` COPY: `gone` = 410 /「このノートは公開されていません」、`notFound` = 404 /「ページが見つかりません」、`system` = 500 /「予期しないエラーが発生しました」。受け入れ基準・テスト方針の引用文言はすべて実コードと一致。
- `PublicNoteDetail.tsx`:42 / `UserPublicTop.tsx`:46,74,94 で `throw notFound()` が実在（修正対象として正しく特定）。
- 3ルートとも loader が `renderServerComponent(<... />)` を返す RSC 二段構成（根本原因の前提どおり）。

## 問題点（要修正）

- **[P-001]** ステップ5が `PublicNoteDetail.test.tsx` を「新規」かつ「happy-dom + `createRoot`」パターンとしているが、**同ファイルは既に存在し、別パターン（node 環境 + `renderToStaticMarkup`）で書かれている**。
  - 理由: `app/components/public/__tests__/PublicNoteDetail.test.tsx` は実在し（バックリンク/関連セクションの既存テスト）、`renderToStaticMarkup(element)` で検証する node 実行のテストである。計画が言う「`ErrorPage.test.tsx` / `NoteDetail.test.tsx` のパターン（happy-dom + `createRoot` + `@tanstack/react-router` を `vi.mock`）に倣う」「新規」という記述は、`UserPublicTop.test.tsx`（こちらは確かに未存在）には当てはまるが、`PublicNoteDetail.test.tsx` には当てはまらない。新規作成すると既存テストを上書き／重複させ、回帰カバレッジ（AC-5 の正常系本文描画）を壊しかねない。
  - 加えて、既存テストの `@tanstack/react-router` モックは `notFound: () => new Error("notFound")` を返す形で、計画が前提とする「`notFound` を `vi.fn()` にして `expect(...).not.toHaveBeenCalled()` で検証」とは異なる。**そもそも採用方式(d)では `PublicNoteDetail` から `notFound` import を削除する**（ステップ1）ため、削除後はモックの `notFound` 自体が参照されなくなり、`not.toHaveBeenCalled()` アサーション（ステップ5の検証点）は意味を持たなくなる。
  - 提案:
    - ステップ5を「`PublicNoteDetail.test.tsx` は新規ではなく**既存ファイルへの追記**。既存の `renderToStaticMarkup` パターンに合わせ、`getPublicNote`（= `loadPublicNote` が叩く `serverData` モック）が `NotFoundError` を投げるケースを1ケース追加し、出力 HTML に `kind="gone"` 相当の文言（「このノートは公開されていません」「Error code: 410 Gone」）が含まれることを assert する」と書き換える。
    - `not.toHaveBeenCalled()` ベースの検証は、import 削除後は成立しないので、検証点を「**NotFoundError を投げても throw せず（= `PublicNoteDetail()` の await が reject せず）`ErrorPage kind="gone"` を return する**」に統一する（`await expect(PublicNoteDetail(...)).resolves...` 系、または return 値を `renderToStaticMarkup` して文言確認）。`UserPublicTop.test.tsx` 側（新規）も同方針に揃えると一貫する。
    - パターン参照の記述（happy-dom + createRoot）は `ErrorPage.test.tsx` 由来だが、`PublicNoteDetail` の既存テストは `renderToStaticMarkup` 方式である事実を明記し、どちらに倣うかをファイル別に書き分ける。

## 改善提案（検討推奨）

- **[S-001]** AC-4（列挙耐性・「実在ユーザーでノート0件のとき誤って404にならない」）の論拠を計画に1行明記すると、`UserPublicTop` の「3ローダーまとめて try/catch」方針の安全性が自己完結する。
  - 理由: ソース検証の結果、**実在ユーザーでノート0件のケースは 404 に倒れない**ことを確認した。`listUserPublicNotes` はユーザー実在時 `{ notes: [], total: 0 }` を返し（NotFound を投げない）、`listUserPublicTags` も `{ tagNames: [] }` を返す。3ユースケースとも冒頭で `userRepository.findByUsername` → null/deleted/suspended のときだけ `NotFoundError` を投げる構造なので、`Promise.all` をまとめて try/catch しても **NotFound 源はユーザー不在のみ**で、0件ユーザーが誤って notFound 画面になることはない。計画はこの方針を採っているが「なぜ安全か」の根拠が書かれていないため、レビュー観点（オーナーが懸念しうる点）として1行補足すると堅い。`getPublicProfile.ts` / `listUserPublicNotes.ts`:107-118 / `listUserPublicTags.ts` のユーザー存在チェックが3者で一致している点を根拠に挙げられる。

- **[S-002]** AC-6 の「検証可能性」をステップ5の修正（P-001）と整合させる。
  - 理由: AC-6 は「RSC 内 notFound が正しいエラーページに届くことを検証する回帰テストが存在する（または手動検証手順が文書化されている）」とあるが、採用方式(d)では実際には「RSC 内 notFound はもう投げず、`ErrorPage` を return する」ので、検証する命題は「notFound が届く」ではなく「**NotFoundError 捕捉時に正しい `ErrorPage` を return する（throw しない）**」である。AC-6 の文言を実装の実態（方式d）に合わせて微修正すると、基準と検証点（ステップ5）の紐づけがより正確になる。手動検証（ステップ6）は AC-6 の代替として有効なので「または」の選択肢は維持でよい。

## 良い点

- **Issue 要件・コメント合意の全カバー**: Issue 本文（byId の 500→410）とオーナーコメント（`/u/$username` の 500→404・両ルートまとめ対応）が AC-1〜AC-3 に過不足なく落ちている。コメントで合意された「両ルートをまとめて対応」も `PublicNoteDetail` 共有による byId/bySlug 同時修正（AC-1+AC-2）として正しく反映。
- **スコープの線引きが明確で妥当**: 「HTTP 404 ステータス付与は本 Issue の主目的にしない（200 + 404系画面）」を Issue 本文の「表示が 404 でなく 500 になる UX 退行」という限定に厳密に沿わせ、ADR-004 の既存割り切りと整合させている。ユースケース/ドメイン無変更・`errorResponseMiddleware` 無変更も、根本原因（RSC 内 throw はその経路を通らない）の調査結果に基づき正しくスコープ外化されている。スコープ外作業の混入は無い。
- **列挙耐性（AC-4）への配慮**: `getPublicNote` / `getPublicProfile` の「一律 NotFound 化」を維持する方針が、存在/非公開の区別を画面で漏らさない要件と一致。ソース上もこの不変条件は保たれる。
- **根本原因分析が一次情報（ADR-004 / `@tanstack/react-start-rsc` 実装）に裏付けられている**: 「RSC レンダリングが handler の外側」という制約の説明が正確で、橋渡し方式(a)(b)(c)を退けて(d)を選ぶ判断も妥当。`NoteDetail.tsx` の既存 JSDoc・パターンが採用方式(d)の先行事例として実在することも確認済み。
- **二重 `PublicLayout` 回避の注意点が明記されている**: `ErrorPage` が `PublicLayout` を内包し、正常系も `PublicLayout` で包む構造（実コードで確認）を踏まえ、「丸ごと差し替え」で二重化しない設計判断が正しい。
