# review-002-test-domain — PR #691 / Issue #654（Test ＋ Domain ポート契約 観点・2周目）

レビュー対象: 公開ページ(P30)「タグを追加(＋)」UI（公開面タグ母集合列挙）。
2周目フルレビュー。1周目改善（cap 抑止ユニットの境界値補強・ポート JSDoc 追記・
`useRovingMenu.isDisabled` 導入）が入った状態で、修正の妥当性と新規問題の有無を確認した。

確認した実体:
- `PublicTopControls.test.tsx`（cap 抑止境界値ユニット）
- `tagRepository.ts`（port JSDoc）/ `D1 tagRepository.ts`（実装）/ 整合
- `useRovingMenu.ts`（`isDisabled`）と `PublicTopControls.tsx` の連携
- `tagRepository.integration.test.ts`（公開 gate 網羅）
- `listUserPublicTags.ts`（ユースケース）/ publication `entity.ts`（JSDoc 根拠）

`pnpm vitest run PublicTopControls.test.tsx` → 14 passed。

---

## Test + Domain

### サマリ

- Blockers: 0
- Warnings: 0
- Notes: 3

1周目の指摘はすべて妥当に解消されている。

- **cap 抑止ユニットの境界値補強（1周目 test [N-001]）**: 9件ケース（`(9,false)=true`／`(9,true)=false`）
  と `(7,true)=false` が追加され、`>=`（>でなく）境界・「8で抑止開始＋以降も継続」・「選択済みは
  cap 超でもトグル解除可」が回帰として固定された。意味のある回帰固定で、純関数テストゆえ実装過剰結合なし。
- **ポート JSDoc 追記（1周目 usecase-domain [W-001]）**: 「owner-scope は `notes.owner_id` を gate に
  する（タグの所有者ではなく『このオーナーの公開ノートに付いたタグ名』）」が追記され、さらに
  `published_at IS NOT NULL` 不在の根拠も明記。いずれも D1 実装・publication ドメイン不変条件と一致
  （後述 N-001）。
- **公開 gate の integration 網羅**: 1周目で十分と評価済みの内容が修正で揺らいでいない。新規問題なし。

新たな Blocker / Warning は検出されなかった。Note は将来観点の留意であり本 PR の網羅漏れ扱いはしない。

### Blockers

なし

### Warnings

なし

### Notes

#### [N-001] ポート JSDoc 追記は実装・ドメイン不変条件と矛盾なし（検証して正確と確認）

`app/core/domain/tag/ports/tagRepository.ts:100-112`。

1周目 [W-001] 対応で2点が追記された。両方とも実体と照合して正確:

1. **owner-scope は `notes.owner_id` を gate にする**（100-103行）。
   D1 実装（`tagRepository.ts:298-307`）は `eq(notes.ownerId, ownerId)` を `notes` の innerJoin 条件に
   置いており、`note_tags` 側には owner 制約が無いという JSDoc の説明（「`note_tags` does not
   constrain owner, so the predicate must live on the notes join」）と完全一致。integration test の
   "cross-owner public note 非出現"（`tagRepository.integration.test.ts:840-861`）がこの述語の本質を
   実 DB で固定しており、JSDoc・実装・テストの三者が整合している。

2. **`published_at IS NOT NULL` 不在の根拠**（105-112行）。「`public ⇒ published_at != null` が構造的に
   常に成立（公開化のたびに `published_at` を stamp）」という主張を publication ドメインで検証した:
   `app/core/domain/publication/entity.ts:70-79` で `next === "public"` 時に `publishedAt = now` を
   毎回 re-stamp、`assertPrivatePublishedAtInvariant`（50-60行）で `private ⇒ publishedAt === null` を
   保証。よって visibility-only gate で `published_at` 条件が冗長という JSDoc の論証は正しい。
   `searchPublicByNamePrefix` / `getPublicNote` と gate を揃える方針も明示されており、将来 gate を
   変える際の取り違え防止として有効。

矛盾なし。コード変更不要の JSDoc 追記として妥当。

#### [N-002] `useRovingMenu.isDisabled` の traversal 挙動はこの PR では純関数レベルのみ自動担保（フック自体の回帰検出は別途）

`app/components/public/PublicTopControls.tsx:703-705`（`isDisabled` 渡し）/
`app/components/common/useRovingMenu.ts:84-130, 175-192`（traversal 実装）。

`isDisabled` は `useRovingMenu` の既存パラメータで、本 PR では**フックを変更せず利用するだけ**
（差分ファイルに `useRovingMenu.ts` は含まれない）。`PublicTopControls.tsx` は
`isDisabled: (index) => isTagAddSuppressed(selected.size, selected.has(tags[index]))` を渡し、cap 到達時に
disabled option を Arrow/Home/End の roving traversal から外す（「focused but does nothing」回避）。

このうち**ユニットで担保されているのは `isTagAddSuppressed` の純関数部のみ**で、

- `isDisabled` が `useRovingMenu` に正しく結線され、disabled option を実際に skip する traversal 挙動
- mid-interaction で active option が disabled 化したときの最近接 enabled への redirect
  （`useRovingMenu.ts:125-130`）
- 開いたときに disabled を避けて着地する `enabledFrom`（同 84-119行）

は自動テストで触れていない。理由は妥当で逸脱ではない:
ADR-006 通り Popover panel は SSR（`open=false`）で描画されず、`PublicTopControls.test.tsx` は常時可視部
のみ検証する方針。かつ `useRovingMenu` には**専用ユニットテストが存在しない**
（`app/components/common/__tests__/` に `useRovingMenu` テストなし）ため、この PR で新たに traversal を
カバーする土台が無い。手動 TC-005 が disabled 属性＋URL不変で cap 抑止の**結果**を実機確認しており、
キーボード traversal の skip 自体も「focused but does nothing が起きない」という形で目視範囲。

提案（任意・本 PR スコープ外）: `useRovingMenu` は visibility filter・ViewSwitcher・sort・本 ＋chip と
複数 consumer を持つ第2層プリミティブ（#467 ADR-001）でありながら専用ユニットが無い。`isDisabled` の
skip / redirect / `enabledFrom` 着地は jsdom + `@testing-library` で純粋に検証できる分岐なので、フック
単体テストを1本足すと本 PR を含む全 consumer の roving 回帰が層をまたいで固定される。本 PR では
plan/ADR-006 準拠で見送り妥当（フック未変更・純関数部はカバー済み・手動で結果確認済み）。

#### [N-003] 公開 gate の integration 網羅は2周目修正で揺らいでいない（1周目評価を維持）

`app/core/adapters/d1/__tests__/tagRepository.integration.test.ts:741-906`。

1周目 test [N-004] で「過不足なし」と評価した網羅が、2周目修正（JSDoc 追記・cap ユニット補強・
`isDisabled` 導入）で一切損なわれていないことを確認:

- public active note 限定の distinct 返却＋`orderBy name asc`（"Cloud"<"apple" の binary collation 固定）
- private / unlisted / trashed / orphan の各非出現（1テストに集約）＋ public タグ1件の対照
- owner 分離（別オーナーの public タグ非混入）
- cross-owner public note 非出現（owner-scope 述語 `notes.owner_id = ownerId` の本質。JSDoc 追記 N-001
  と対応）
- limit/cap が distinct 後の行に効く・limit<=0 で `[]`・公開ノート0オーナーで `[]`

assertion は返却配列の値を `toEqual` で固定し、内部 SQL 文字列や private プロパティに依存しない
（過剰結合なし）。各 describe がローカル `linkTagToNote` を持ちスコープ汚染なし。
`searchPublicByNamePrefix` の既存 integration（621-739行）と gate 構造が一致し雛形踏襲も適切。
修正による回帰・退行は検出されなかった。

### cap 抑止ユニット境界値の評価（依頼項目への直接回答）

`app/components/public/__tests__/PublicTopControls.test.tsx:166-195`。

- **9件抑止**（`(9,false)=true`, 173-177行）/ **9件選択済み非抑止**（`(9,true)=false`, 183-185行）/
  **7件選択済み非抑止**（`(7,true)=false`, 192-194行）が追加され、1周目 [N-001] の指摘（9件ケース欠落・
  `isSelected=true` が cap ちょうど1点のみ）を直接解消。
- 既存 4 ケース（`(8,false)`,`(8,true)`,`(7,false)`,`(0,false)`）との**重複・過剰結合なし**: 各ケースは
  `selectedCount >= TAGS_MAX` 分岐の異なる境界（cap 未満／ちょうど／超過 × 選択／非選択）を1点ずつ
  突いており、冗長な反復ではない。
- 純関数 `isTagAddSuppressed` を直接呼ぶため Popover 開閉や router をモックせず、このファイルの既存作法
  （`nextFilterSearch`/`toggleTagSet` を純関数として直接テスト）と一貫。意味のある回帰固定。

なお `isTagAddSuppressed` は同一ロジックが (a) option の `aria-disabled`／click ガード
（`PublicTopControls.tsx:736,743,750`）と (b) `useRovingMenu` の `isDisabled`（703-705行）の**両方**を
駆動する単一ソースであり、純関数ユニットで境界を固定したことで両経路の cap 抑止が同時に守られる
設計になっている。切り出し（ADR-006）と境界値補強の組み合わせは妥当。
