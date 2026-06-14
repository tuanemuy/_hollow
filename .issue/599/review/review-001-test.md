# レビュー 001 — Issue #599 PR #734（観点: Test）

対象 PR: 734（`fix(public): #599 RSC 内 notFound を ErrorPage 直接返却で 404/410 表示に修正`）
実装計画: `.issue/599/plan.md`（受け入れ基準 AC-6 / 実装ステップ5 / テスト方針）
レビュー日: 2026-06-14

検証実行: `pnpm vitest run app/components/public/__tests__/PublicNoteDetail.test.tsx app/components/public/__tests__/UserPublicTop.test.tsx`
→ **2 files / 8 tests すべて PASS**（実機確認済み）。

---

## 総評

テスト方針（ステップ5）・受け入れ基準 AC-6 は、計画の意図どおり高い忠実度で実装されている。
確立済みパターン `app/components/note/detail/__tests__/NoteDetail.test.tsx`（`renderToStaticMarkup(await Component(props))` 直呼び）に正しく揃っており、
計画レビュー round-1 で指摘された 3 つの修正点（P-001 既存ファイルへの追記 / P-002 `serverData` モック分岐 / P-003 `not.toHaveBeenCalled()` を採らない）はすべて反映されている。

- NotFound → `ErrorPage`（gone「このノートは公開されていません」/「Error code: 410 Gone」、notFound「ページが見つかりません」/「Error code: 404 Not Found」）を **throw せず return** する検証が、実際の文言で両コンポーネントに存在する（AC-1/AC-2/AC-3）。
- 非 `NotFoundError`（素の `Error("boom")`）の **re-throw** を `rejects.toThrow("boom")` で固定する検証が両方にある（列挙耐性・既存挙動維持）。
- 実在ユーザー・ノート0件で誤って404にならないこと（AC-4 論拠）の実証テストが `UserPublicTop` にある。
- `serverData` を `vi.mock` する分岐方式が既存 `PublicNoteDetail.test.tsx` と整合し、`getPublicNote`/`getPublicProfile` 相当の呼び出しで `NotFoundError` を投げ分けられている。
- 既存3ケース（backlink/related/空セクション）は無改変で温存され、回帰カバレッジを壊していない。
- `isNotFoundError` が `instanceof NotFoundError` であるため、テストが**実物の `NotFoundError` インスタンス**を投げている点は本質的に正しい（型ガードが本番同様に効く。文字列メッセージのマッチではなく型で分岐するのを正しく再現）。
- `useRouter` モック追加は妥当。`ErrorPage` → `BackLink`（`ErrorNavActions.tsx`、`useRouter().history.back()`）を実 import するため、両 test の `useRouter: () => ({ history: { back: () => {} } })` が無いと NotFound ケースが落ちる。`PublicNoteDetail.test.tsx` の既存 `Link` モックに `useRouter` を追記したのも `ErrorPage` 描画に必要で正当。

「検証点を return 値に置く（RSC ストリーム挙動はユニット再現不可）」という割り切りは AC-6 と ADR-001/ADR-002 のとおりで妥当。RSC 実挙動は `.issue/599/manual-test/`（TC-1〜TC-6 全 PASS）で補完されており、ユニット＋手動の役割分担が成立している。

**Blockers: なし。** 以下は堅牢性・将来の偽陽性/偽陰性リスクに関する Warning / Note。

---

## Test

### Blockers

なし。

### Warnings

- **[W-001]** `serverData` モックの引数分岐が「形」依存で、本番の引数形が変わると **偽陰性（テストが緑のまま実バグを見逃す）** になりうる
  - 場所: `app/components/public/__tests__/PublicNoteDetail.test.tsx:96-118` / `app/components/public/__tests__/UserPublicTop.test.tsx:65-77`
  - 理由: 両モックは `serverData` の**返り値関数の第1引数の shape** だけで分岐している。
    - `PublicNoteDetail`: `typeof arg === "string"` → backlinks、`"ownerId" in arg` → related、それ以外（= `LookupArgs`）→ `getPublicNote`。
    - `UserPublicTop`: `typeof arg === "string"` → `loadProfile`/`loadPublicTags` 共用、それ以外（object）→ `loadNotes`。
    実装側の `serverData(importer, callback)` の **importer（第1引数）も callback 本体も完全に捨てて**おり、「どのユースケースを呼んでいるか」は引数形からの**間接推定**にすぎない。例えば将来 `loadPublicNote` の引数が `LookupArgs` から別 shape（文字列 id など）に変わると、`PublicNoteDetail` のモックは誤って backlinks 分岐へ落ち、`getPublicNote` の NotFound 分岐が**実行されなくなっても**テストは緑になりうる（NotFound テストだけは `noteError` を投げる箇所がどの object 分岐かに依存するため壊れるが、正常系3ケースは静かに別データを返し続ける）。
    `UserPublicTop` 側はさらに脆く、`loadProfile(username)` と `loadPublicTags(username)` が **同じ string 分岐**を共有し、`profileError` を両者で投げ分けている。`loadProfile` 由来か `loadPublicTags` 由来かを区別していないため、「NotFound 源は loadProfile（ユーザー不在）に集約される」という AC-4 の論拠そのものは**テストでは区別検証されていない**（どちらの string ローダーが投げても同じ結果になる）。
  - 提案: これは確立済みパターン（既存 `PublicNoteDetail.test.tsx`）の踏襲であり Blocker ではないが、堅牢性を上げるなら importer の戻り（`getPublicNote` 等の関数名/モジュール）でも分岐するか、各ローダーを個別 `vi.fn()` 化して「どの呼び出しが何回・どの引数で来たか」を assert する余地がある。少なくとも `UserPublicTop` の AC-4 検証（[N-001] 参照）で「`loadNotes`/`loadPublicTags` が実在ユーザー時に解決し、`loadProfile` だけが NotFound 源」という分岐を 1 ケースで明示できると、`Promise.all` まとめ catch の安全論拠が自己完結する。

- **[W-002]** `UserPublicTop` の re-throw テストが、`Promise.all` 内の **どのローダーが投げても**通るため、catch 範囲の退行を完全には固定しない
  - 場所: `app/components/public/__tests__/UserPublicTop.test.tsx:108-112`
  - 理由: re-throw テストは `profileError = new Error("boom")` のみセットする。string 分岐は `loadProfile`/`loadPublicTags` 共用なので、`boom` は両 string ローダーで投げられる。`rejects.toThrow("boom")` は通るが、これは「`loadNotes`（object 分岐）が投げたとき」「`loadPublicTags` が投げたとき」を**個別には保証しない**。計画 round-1 S-001 が懸念した「`loadNotes`/`loadPublicTags` は実在ユーザーでも `BusinessRuleError`（不正な並び順・期間）を投げ得る」ケースの re-throw は、現状 string 分岐経由でしか踏んでおらず、`loadNotes`（object 分岐）由来の非 NotFound エラー re-throw は未カバー。
  - 提案: `loadNotes`（object 分岐）が `BusinessRuleError` 相当の非 NotFound を投げるケースを 1 本追加すると、「`Promise.all` のどの要素から来た非 NotFound でも re-throw する」が完全に固定でき、将来 catch を `isNotFoundError` 以外に広げる退行を確実に止められる。現状でも代表パスは押さえているため Warning 止まり。

### Notes

- **[N-001]** AC-4 実証テスト（`UserPublicTop.test.tsx:114-126`）は良いが、検証が「`loadNotes` が0件を返す」状況を **`loadProfile` 解決**と同時に作れているかが間接的
  - 場所: `app/components/public/__tests__/UserPublicTop.test.tsx:114-126`
  - 内容: `profileError = null` で string 分岐（`loadProfile`/`loadPublicTags`）が `{ user, publicNoteCount: 0, tagNames: [] }` を解決し、object 分岐（`loadNotes`）が `{ notes: [], total: 0 }` を返す。出力に「ページが見つかりません」が**含まれず**「公開されているノートはまだありません。」が**含まれる**ことを確認しており、AC-4（実在ユーザー0件で誤404にならない）を正しく実証している。`publicNoteCount`/`notes`/`total`/`allTags` をテスト先頭でリセットしている点も、後続テストとの状態漏れを防いでいて良い。`describe` 内でモジュールレベルの可変 `let` を共有するため**テスト順序依存**になりうるが、各 it 冒頭で必要な状態を明示再設定しており実害はない（`PublicNoteDetail.test.tsx` も `noteError = null` を各 it で再設定し同パターン）。

- **[N-002]** `vi.mock("@tanstack/react-router")` の `notFound` スタブは**両 test とも既に存在しない**（= 方式(d)で不要になったものが残っていない）
  - 場所: `app/components/public/__tests__/PublicNoteDetail.test.tsx:65-94` / `app/components/public/__tests__/UserPublicTop.test.tsx:40-63`
  - 内容: 計画 round-1 が懸念した「方式変更後に `notFound: () => new Error(...)` スタブが残り、`not.toHaveBeenCalled()` で vacuous な検証を生む」問題は**発生していない**。両モックは `Link` と `useRouter` のみを提供し、`notFound` キーは存在しない（実装側も `notFound` import を削除済み＝`PublicNoteDetail.tsx`/`UserPublicTop.tsx` に `notFound` 参照なし、`isNotFoundError`/`ErrorPage` import に置換済み）。`not.toHaveBeenCalled()` ベースの検証も入っていない。テスト方針の「vacuous な検証を採らない」が正しく守られている。

- **[N-003]** 既存3ケースの温存・非回帰は確認済み
  - 場所: `app/components/public/__tests__/PublicNoteDetail.test.tsx:133-224`
  - 内容: backlink/related の描画、inline meta タグのリンク化と bottom-meta の span 維持、空データ時のセクション非表示の3ケースは無改変。NotFound 追加ケース（232-252）と独立した `describe` に分離され、`noteError = null` の再設定で正常系を汚染しない。AC-5（正常系本文描画）の回帰カバレッジを保持。

- **[N-004]** 文言マッチが実 `ErrorPage` の COPY 定数と一致していることを確認
  - 場所: `app/components/public/ErrorPage.tsx:54-82` ↔ 両 test の assert
  - 内容: gone = `{code:"410", title:"このノートは公開されていません", meta:"Error code: 410 Gone"}`、notFound = `{code:"404", title:"ページが見つかりません", meta:"Error code: 404 Not Found"}`。テストの `toContain` 文言はいずれも実 COPY と verbatim 一致。`ErrorPage` を実物 import（モックしていない）しているため、文言・`kind` 分岐の取り違えがあれば即座に落ちる。`ErrorPage` を浅くスタブしていない点は検証の信頼性を高めており良い設計。

- **[N-005]** RSC ストリーム挙動の非再現という割り切りは妥当・過不足なし
  - 内容: ユニットは `renderServerComponent` の Flight ストリーム経由の実挙動（notFound がクライアント React レンダリングで再 throw され `errorComponent` に落ちる経路）を再現できない。検証点を「コンポーネントが throw せず正しい `ErrorPage` を return / 非 NotFound は re-throw」に置く割り切りは AC-6・ADR-002 のとおりで、`NoteDetail.test.tsx`（Issue #385 先行事例）と同一の現実的な分担。実挙動の最終確認は `.issue/599/manual-test/`（TC-1〜TC-6 全 PASS、500 退行なし・列挙耐性あり・正常系回帰なし）が担保しており、ユニットでの過剰な再現を試みていない判断は適切。
