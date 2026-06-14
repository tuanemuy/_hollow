# レビュー 002 — Issue #599 PR #734（観点: Test）ラウンド2 フルレビュー

対象 PR: 734（`fix(public): #599 RSC 内 notFound を ErrorPage 直接返却で 404/410 表示に修正`）
実装計画: `.issue/599/plan.md`（受け入れ基準 AC-6 / 実装ステップ5 / テスト方針）
レビュー日: 2026-06-14
ベース: ラウンド2・ゼロベース全面レビュー

検証実行:
- `pnpm vitest run app/components/public/__tests__/PublicNoteDetail.test.tsx app/components/public/__tests__/UserPublicTop.test.tsx`
  → **2 files / 9 tests すべて PASS**（実機確認済み）。
- `pnpm typecheck` → クリーン（エラーなし）。
- 6 ユースケースモジュール（`getPublicNote` / `listPublicBacklinks` / `listRelatedPublicNotes` / `getPublicProfile` / `listUserPublicNotes` / `listUserPublicTags`）が**すべて同名の named export を1つ持つ**ことを `grep` で確認。

---

## 総評

ラウンド1の Warning（W-001 引数形依存の脆さ / W-002 `loadNotes` 由来 re-throw 未カバー）および Note（N-001 AC-4 のローダー区別が間接的）が、**`serverData` モックの分岐ロジックを「引数の形」から「`loadModule` の named export」へ切り替える**ことで根本的に解消されている。改善後のモックは確実に機能し、かつ脆くない。

改善のポイント（両 test 共通）:

- モックは `serverData(loadModule, run)` の `loadModule`（= 実装側の `() => import("@/core/application/publication/<usecase>")`）を **`await loadModule()` で実際に import し、`"getPublicNote" in module` のように named export の有無でローダーを識別**する。`vi.mock` はこれらユースケースモジュールを差し替えていないため**実物のモジュールが import され**、export 名は実装と機械的に一致する。これにより:
  - 引数の shape（`LookupArgs` / `noteId` 文字列 / `{ ownerId, … }` / `username` 文字列 / `{ username, page, … }`）が将来変わっても**ローダーの取り違えが起きない**（ラウンド1 W-001 の偽陰性リスクが消滅）。
  - `loadProfile`（`getPublicProfile`）と `loadPublicTags`（`listUserPublicTags`）が**別分岐に分離**され、`profileError` / `notesError` / `tagsError` の3キーで**ローダー別にエラー注入できる**（ラウンド1 W-001 後段・N-001 の「string 分岐共用」問題が解消）。
  - `import()` は副作用安全（ユースケース定義の純粋モジュール。モックは関数を一切呼ばない）で、`await loadModule()` のオーバーヘッドも無視できる。

AC-6・テスト方針の充足:

- **AC-1 / AC-2（gone）:** `PublicNoteDetail` の `getPublicNote` 分岐が `NotFoundError` を reject → `await PublicNoteDetail(...)` が **throw せず** `ErrorPage kind="gone"` を return し、出力 HTML に「このノートは公開されていません」「Error code: 410 Gone」が含まれることを検証（`PublicNoteDetail.test.tsx:235-245`）。byId / bySlug は同一 `PublicNoteDetail` 経由のため AC-1/AC-2 を同時にカバー。
- **AC-3（notFound）:** `UserPublicTop` の `getPublicProfile` 分岐が `NotFoundError` を reject → `ErrorPage kind="notFound"` を return、「ページが見つかりません」「Error code: 404 Not Found」を検証（`UserPublicTop.test.tsx:115-127`）。NotFound 源が `loadProfile`（ユーザー不在）であることが**分岐の独立化により明示的に**固定されている。
- **非 NotFound re-throw（列挙耐性・既存挙動維持）:** 両コンポーネントとも `new Error("boom")` を `rejects.toThrow("boom")` で固定。さらに `UserPublicTop` は **`loadProfile` 由来（`UserPublicTop.test.tsx:129-135`）と `loadNotes` 由来（object 分岐、`137-146`）の2本**を持ち、`Promise.all` まとめ catch が「どの要素由来の非 NotFound でも re-throw する」ことを固定（ラウンド1 W-002 の未カバー指摘を解消）。
- **AC-4（実在ユーザー0件で誤404にならない）:** profile 解決・notes 空・tags 解決の**3者を独立分岐で**構成し、「ページが見つかりません」が**含まれず**「公開されているノートはまだありません。」が含まれることを検証（`UserPublicTop.test.tsx:148-165`）。ローダー共用が解消されたため AC-4 の論拠が自己完結。
- **既存3ケース非回帰（AC-5）:** backlink / related / 空セクション（`PublicNoteDetail.test.tsx:135-226`）は無改変で温存され、NotFound 追加ケースは独立 `describe` に分離。各 it 冒頭で `noteError = null` を再設定し正常系を汚染しない。
- **文言 verbatim 一致:** `ErrorPage.tsx:54-82` の COPY 定数（gone=「このノートは公開されていません」/「Error code: 410 Gone」、notFound=「ページが見つかりません」/「Error code: 404 Not Found」）と test の `toContain` が完全一致。`ErrorPage` を実物 import（モックせず）しているため `kind` 取り違えがあれば即落ちる。
- **検証点を return 値に置く割り切り:** RSC ストリーム経由の実挙動はユニット再現不可という制約に対し、`NoteDetail.test.tsx`（Issue #385 先行事例）と同一の `renderToStaticMarkup(await Component(props))` 直呼び方式で「throw せず ErrorPage を return / 非 NotFound は re-throw」を固定。実挙動は `.issue/599/manual-test/`（TC-1〜TC-6 全 PASS）が補完。ユニット＋手動の役割分担が成立し、過剰な再現を試みていない。
- **JSDoc による意図記録:** 両 test 冒頭の JSDoc で「loader を named export で識別する（W-001）」設計意図が明記され、将来の改修者が引数形依存に戻す退行を防ぐ。

新たな脆さ・過剰モック・抜けは**実質的に無い**。以下は軽微な Note のみ。

**Blockers: なし。**

---

## Test

### Blockers

なし。

### Warnings

なし。

### Notes

- **[N-001]** `UserPublicTop` モックの `listUserPublicTags` 分岐が、実 DTO の superset を返している
  - 場所: `app/components/public/__tests__/UserPublicTop.test.tsx:91-92`
  - 内容: 実 `listUserPublicTags` の戻りは `{ tagNames }` のみ（`listUserPublicTags.ts:47`）だが、モックの tags 分岐は `return { user, publicNoteCount, tagNames: allTags }` と `getPublicProfile` と同じ superset を返している。コンポーネント側は `loadPublicTags` の戻りから `{ tagNames: allTags }` だけを destructure する（`UserPublicTop.tsx:128`）ため**実害はなく**テストは正しく通るが、モックが実 DTO 形と乖離している。同様に getPublicProfile 分岐（`83`）も `tagNames: allTags` を余計に含む。可読性・正確性のため、各分岐を実 DTO の形（profile=`{ user, publicNoteCount }`、tags=`{ tagNames }`）に絞ると、どのローダーが何を供給するかが一目で分かる。偽陰性/偽陽性のリスクは無いので Note 止まり。

- **[N-002]** モジュールレベル可変 `let` の共有によるテスト順序依存は残るが、各 it で必要状態を明示再設定しており実害なし
  - 場所: `app/components/public/__tests__/PublicNoteDetail.test.tsx`（`noteError` / `tagNames` / `backlinks` / `relatedNotes`）, `app/components/public/__tests__/UserPublicTop.test.tsx`（`profileError` / `notesError` / `tagsError` / `notes` / `total` / `allTags`）
  - 内容: 両 test とも `describe` 内でモジュールスコープの `let` を共有するため、原理上はテスト順序に依存しうる。ただし各 it 冒頭で関与する状態を明示再設定しており（NotFound/re-throw 系は3つの `*Error` を毎回セット、AC-4 ケースは `notes`/`total`/`allTags` もリセット）、実害は無い。`vi.mock` の都合で `await import` を使うため `beforeEach` でのリセット集約はしづらく、現状の「各 it で明示」は確立済みパターン（既存 `PublicNoteDetail.test.tsx` / `NoteDetail.test.tsx`）と整合。改善するなら各 `*Error` を `beforeEach` で `null` に戻すと、エラー系の取り残しに対する保険になる（任意）。

- **[N-003]** `loadModule` の `await` import を介する識別は堅牢だが、export 名の改名には弱い（許容範囲）
  - 場所: `app/components/public/__tests__/PublicNoteDetail.test.tsx:96-120` / `app/components/public/__tests__/UserPublicTop.test.tsx:72-94`
  - 内容: 改善後の分岐は named export 名（`getPublicNote` / `listPublicBacklinks` / `listRelatedPublicNotes` / `getPublicProfile` / `listUserPublicNotes` / `listUserPublicTags`）に依存する。これらの関数名を将来リネームすると、実装側の named import も同時に変わるため通常は連動するが、モック内の文字列リテラルは**型チェックの対象外**で、リネーム時に文字列の追従漏れがあると分岐が無言で全フォールスルー（= 末尾の else 分岐＝tags/getPublicNote に倒れる）しうる。引数形依存（ラウンド1）よりは遥かに堅牢で、6 モジュールの export 名は実機 grep で一致確認済み。実用上の懸念は小さく、これ以上の厳密化（実関数参照での分岐等）は過剰。Note として記録のみ。

- **[N-004]** `notFound` スタブ不在・`not.toHaveBeenCalled()` 不採用が両 test で正しく守られている
  - 場所: `PublicNoteDetail.test.tsx:65-94` / `UserPublicTop.test.tsx:47-70`
  - 内容: `@tanstack/react-router` モックは `Link` と `useRouter` のみを提供し `notFound` キーを持たない。実装側も `notFound` import を削除済み（`PublicNoteDetail.tsx` / `UserPublicTop.tsx` に参照なし、`isNotFoundError` / `ErrorPage` import に置換）。方式(d)で vacuous になる `not.toHaveBeenCalled()` 検証は入っておらず、テスト方針どおり。`useRouter` モックは `ErrorPage → BackLink`（`useRouter().history.back()`）の実 import に必要で正当。

- **[N-005]** `isNotFoundError` が `instanceof NotFoundError`（`errors/index.ts:57`）であるため、test が実物の `NotFoundError` インスタンスを投げているのは本質的に正しい
  - 内容: 型ガードが本番同様に効き、文字列メッセージマッチではなく型で分岐するのを正確に再現。`ErrorPage` を実物 import しているのと併せ、`kind` 取り違え・型ガード破綻があれば即座に検出できる設計。
