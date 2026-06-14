# レビュー review-002 — Frontend / RSC・エラーハンドリング（PR #734 / Issue #599）

対象 PR: #734
実装計画: `.issue/599/plan.md`（設計判断: `.issue/599/adr.md`）
観点: Frontend / RSC・エラーハンドリング
種別: ラウンド2フルレビュー（ゼロベース）

## 総評

方式(d)（RSC コンポーネント内で `isNotFoundError` を捕捉し、ルート意図の `ErrorPage` を JSX として直接 return する）が、ADR-001 / ADR-004 および確立済みパターン（`app/components/note/detail/NoteDetail.tsx` の `NoteDetailContent`）と同型で実装されている。`PublicNoteDetail`（byId / bySlug 両入口）と `UserPublicTop` の2コンポーネント修正で3ルート分の波及をカバーし、`kind`（gone / notFound）もルート側 `notFoundComponent` 配線と一致する。非 NotFoundError の re-throw が保たれ、二重レイアウトも発生せず、未使用 import（`notFound`）の除去・WHY コメント・回帰テストいずれも計画どおり。受け入れ基準 AC-1〜AC-6 はすべて Frontend 実装で満たされている。

Blocker・Warning ともになし。

### Frontend / RSC・エラーハンドリング

#### Blockers

なし。

#### Warnings

なし。

#### Notes

- **[N-001]** notFound→ErrorPage 直接 return 方式の正当性が確認できる。`renderServerComponent` 経由の RSC では `throw notFound()` が `notFoundComponent` に届かず素のエラーとして `errorComponent`（system/500）に落ちる、というフレームワーク制約（ADR-001 / ADR-004 で文書化）に対し、`isNotFoundError`（`instanceof NotFoundError`、`app/core/application/errors/index.ts:57`）が確実に効く位置（= RSC コンポーネント本体の同一プロセス内 catch）でハンドルしている。`serverData` / `cache` は RSC レンダリング中にサーバ側で in-process 実行されるためシリアライズ往復が無く、`NotFoundError` インスタンスがそのまま catch まで届く（`kind: "unknown"` 落ちが原理的に起きない）。`PublicNoteDetail.tsx:80` の `<ErrorPage kind="gone" />` がルート `notFoundComponent`（`notes/public/$noteId.tsx:100` / `u/$username/$noteSlug.tsx:108`）と、`UserPublicTop.tsx:125` の `<ErrorPage kind="notFound" />` が `u/$username/index.tsx:169` と一致しており、ルート意図のフルページが正しく出る。手動検証（`.issue/599/manual-test/report.md` TC-1〜TC-6 全 PASS）も実機挙動を裏付け。

- **[N-002]** try/catch の範囲が適切で、想定外エラーを握り潰さない。`PublicNoteDetail`（`PublicNoteDetail.tsx:76-82`）は `loadPublicNote(args)` のみを囲み、後続の `loadPublicBacklinks` / `loadRelatedPublicNotes`（`:85-88`、本体取得成功後にしか走らない）は catch 外。ADR-002 の意図どおりで、NotFound 源を本体取得に限定しつつ、backlink/related 段の想定外エラーは catch されず正しく system エラーに落ちる。両コンポーネントとも `if (isNotFoundError(error)) return …; throw error;` で非 NotFoundError を re-throw しており、`NoteDetailContent`（`NoteDetail.tsx:89-99`）と完全に同型。

- **[N-003]** `UserPublicTop` の `Promise.all` 全体まとめ catch に誤404リスクがないことを確認。3ローダー（`getPublicProfile` / `listUserPublicNotes` / `listUserPublicTags`）はいずれもユーザー不在（null / deleted / suspended）のときだけ `NotFoundError` を投げ、実在ユーザーでは空リストを返す（AC-4 の論拠）。よって `isNotFoundError` が真になるのは profile 不在のみで、実在ユーザー・ノート0件が誤って 404 に倒れることはない。`getPublicProfile` の返却に `publicNoteCount` が含まれる（`getPublicProfile.ts:12,42-44`）こととも整合。新規テスト「does not render the notFound page for a real user with zero notes」（`UserPublicTop.test.tsx:148-165`）でこの不変条件を固定しており、AC-4 の実証として妥当。

- **[N-004]** 非 NotFound re-throw の保持が、`Promise.all` 内の各ローダー（object-arg の `loadNotes` 含む）でテストとして固定されている。`UserPublicTop.test.tsx:129-146` が `loadProfile` 由来（string-arg）と `loadNotes` 由来（object-arg）の双方で `rejects.toThrow` を検証しており、将来 catch 範囲を広げて `BusinessRuleError`（不正な sort/period 等）まで握り潰してしまう退行を防いでいる。列挙耐性・既存 system エラー経路の維持が担保されている。

- **[N-005]** 二重レイアウトが発生しない。`ErrorPage` は `PublicLayout`（`ErrorPage.tsx:88` の `<PublicLayout hideHeaderSearch>`）を内包し、正常系（`PublicNoteDetail.tsx:91` / `UserPublicTop.tsx:151` の `<PublicLayout>`）を「丸ごと差し替える」early return 構造のため、部分差し込みによる `PublicLayout` 入れ子は起きない。

- **[N-006]** `cache()` ラッパーから `notFound()` 変換を除去した副作用がない。`loadPublicNote` / `loadProfile` / `loadNotes` / `loadPublicTags`（`PublicNoteDetail.tsx:36-42` / `UserPublicTop.tsx:37-82`）は「同一引数 → 同一結果（成功 or 同一エラー）」の純粋ローダーに戻っただけで、`cache()` のメモ化キー・振る舞いは不変。catch を呼び出し側（コンポーネント本体）へ移しただけのため、cache 共有・再呼び出しに差は出ず、`isNotFoundError` 判定はメモ化されたエラー値に対しても安定して効く。

- **[N-007]** 未使用 import の除去漏れなし。`PublicNoteDetail.tsx:1` / `UserPublicTop.tsx:1` ともに `import { Link } from "@tanstack/react-router";` のみで `notFound` は残存せず、`ErrorPage` の import（`PublicNoteDetail.tsx:6` / `UserPublicTop.tsx:12`）が追加されている。`isNotFoundError` の import（`PublicNoteDetail.tsx:3` / `UserPublicTop.tsx:5`）も使用箇所と整合。

- **[N-008]** WHY コメントが過不足ない。両コンポーネントとも catch 内に1行「RSC 内 notFound() は notFoundComponent に届かないため、ルート意図の ErrorPage を直接返す。ADR-004 / Issue #599」を付すのみ（`PublicNoteDetail.tsx:79` / `UserPublicTop.tsx:124`）。CLAUDE.md の「WHY が非自明なときだけ」方針に沿い、ADR 参照で根拠が辿れる。`NoteDetail.tsx` の冗長な JSDoc と比べても簡潔で適切。

- **[N-009]** 回帰テストが計画（ステップ5・AC-6）と round-1 plan レビュー指摘（P-001〜P-003 / S-001 / S-002）を正しく反映。`PublicNoteDetail.test.tsx` は既存ファイルへの追記で、`renderToStaticMarkup(await Component(props))` 直呼び・`serverData` モック分岐（`noteError` フラグ）に統一。既存3ケースを温存しつつ各ケース冒頭で `noteError = null` をリセット（`:137,180,213`）してケース間状態漏れを防ぐ。検証点は「NotFound → ErrorPage gone を throw せず return」「非 NotFound は `rejects.toThrow` で re-throw」の2点（`:234-254`）で vacuous な `not.toHaveBeenCalled()` を採らない。`UserPublicTop.test.tsx`（新規）も同方式で検証点3をカバー。`serverData` モックは loader を「import するモジュールの named export」で識別しており（`PublicNoteDetail.test.tsx:96-120` / `UserPublicTop.test.tsx:72-94`）、引数形に依存せずブランチが衝突しない堅牢な構成。

- **[N-010]** （軽微・修正不要）`UserPublicTop.test.tsx` の `serverData` モックは `listUserPublicTags` ブランチが `{ user, publicNoteCount, tagNames: allTags }` を返し、実ローダー（`listUserPublicTags` は `{ tagNames }` のみ）と戻り値形が厳密一致しない。本体側 destructure（`UserPublicTop.tsx:128-129`）が必要キーだけ取り出すため動作・検証意図に影響はない。テスト内コメント（`:5-18` / `:148-151`）でもブランチ識別方針が明示されており、混同リスクは無い。

- **[N-011]** （参考・修正不要）スコープの割り切り（HTTP は 200 のまま・画面のみ 404/410 系）は ADR-004・plan.md「含まれないもの」と整合し、本 Issue の UX 退行解消という目的に対して妥当。`errorComponent`（`*$noteId.tsx:101` 等）は loader 段・グローバル経路の保険として残置され、`notFoundComponent` 配線も計画どおり温存。Frontend 観点で追加対応は不要。SEO 厳密性が要件化された場合は別 Issue（plan.md「未解決事項」P-NONE）という整理も正しい。

## 結論

Frontend / RSC・エラーハンドリング観点で Blocker・Warning なし。実装・テストとも計画・ADR・確立済みパターンに整合し、AC-1〜AC-6 を満たす。マージ可。
