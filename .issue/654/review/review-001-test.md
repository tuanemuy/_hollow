# review-001-test — PR #691 / Issue #654（Test 観点）

レビュー対象: 公開ページ(P30)「タグを追加(＋)」UI。
観点: テスト網羅性・テスト設計・モック戦略。plan.md テスト方針との整合。

---

## Test

### サマリ

- Blockers: 0
- Warnings: 0
- Notes: 4

実装は plan.md / ADR のテスト方針に忠実。gate 検証を D1 integration に一本化、cap 抑止を
純関数 `isTagAddSuppressed` に切り出してユニット化、`FakeTagRepo` に空スタブ追加、
`makeTagRepoStub`（部分スタブ）は無変更 — いずれも計画どおりで妥当。指摘はいずれも改善余地
レベルで、ブロッカー・的外れな過剰指摘なし。

### Blockers

なし

### Warnings

なし

### Notes

#### [N-001] cap 抑止ユニットの境界値: 9件ケース・選択済み非抑止の「7以下」側がやや薄い

`app/components/public/__tests__/PublicTopControls.test.tsx:1743-1756`（diff 行）。

`isTagAddSuppressed(selectedCount, isSelected)` の検証は `(8,false)=true` / `(8,true)=false` /
`(7,false)=false` / `(0,false)=false` の4ケース。plan.md テスト方針が要求した「7/8/9件、選択済み
option 含む」のうち **9件ケースが明示されていない**。関数は `selectedCount >= TAGS_MAX` なので
9 は 8 と同一分岐に入り論理的には等価だが、`>=`（>でなく）であることを固定する回帰価値が一番
高いのは「cap を**超えた**」9件入力であり、ここを明示すると「8で抑止が始まり以降も抑止し続ける」
意図がテストとして残る。また選択済み側の `(7,true)`（cap 未満かつ選択済み）が無く、`isSelected=true`
の検証が cap ちょうど(8)の1点のみ。提案: `expect(isTagAddSuppressed(9,false)).toBe(true)` と
`expect(isTagAddSuppressed(9,true)).toBe(false)` を足す（境界の片側＝cap 超過を固定）。
現状でも実害は小さく Note 止まり。

#### [N-002] ユースケース `listUserPublicTags` の deleted/suspended guard が自動テスト未担保（既存作法と同断）

`app/core/application/publication/listUserPublicTags.ts:30-39` の deleted/suspended → `NotFoundError`
ガードに対応するテストが無い（`listUserPublicTags.integration.test.ts` は未作成）。これは plan.md
step 4・テスト方針で「integration は任意、書くなら deleted/suspended guard を1〜2ケース」と明示的に
optional 化された判断に沿っており、**逸脱ではない**。ただし事実として:

- 兄弟ユースケース `listUserPublicNotes` の integration test にも username→user status guard の
  ケースは無い（`__tests__/listUserPublicNotes.integration.test.ts` は note listing 挙動のみ）。
  つまり「既存も担保していない」という前例との整合は正しいが、**このガードはどの層でも自動検証
  されていない**（手動 TC-007 は0件オーナーのみで、deleted/suspended は手動にも無い）。
- guard 自体は3行の単純分岐で `listUserPublicNotes`/`getPublicProfile` と同型コピーであり、
  リグレッションリスクは低い。

提案（任意）: 将来 publication usecase 群の guard を1本の integration test に束ねる際、
`listUserPublicTags` の deleted/suspended も同時にカバーすると、この読み取り経路で
「非公開オーナーの公開タグが username 経由で漏れない」ことが層をまたいで固定される。本 PR では
plan 準拠で見送り妥当。

#### [N-003] banned ユーザー除外ケースは「不要」で正しい（網羅漏れではない）

レビュー依頼で問われた「banned ユーザー除外のケースもあるべきか」について。User の status は
`pending|active|suspended|deleted` で `banned` は別の boolean カラム（`schema.users.banned`、
`seedUser` で `banned: 0`）。`listUserPublicTags` のガードは status の deleted/suspended のみで、
banned は対象外 — これは兄弟 `listUserPublicNotes`/`getPublicProfile` と同じ既存方針であり、本 Issue
で banned の公開抑止を新設する要件は無い。したがって **banned 専用の除外テストを足すべきという指摘は
本 PR スコープでは of-scope**。仮に banned を公開面で隠す要件が将来立つなら、それは tag 列挙に閉じた
話ではなく公開読み取り経路全体（notes/profile/tags）共通の gate 課題であり、別 Issue で横断的に扱うべき。
本 PR の網羅漏れとして扱わない。

#### [N-004] integration の gate 網羅は十分。cross-owner public note 非出現まで突いている点を評価

`app/core/adapters/d1/__tests__/tagRepository.integration.test.ts:1767-1932`（diff 行）。
plan.md テスト方針が挙げた gate ケースを過不足なく実 DB で網羅:

- public-only 返却＋distinct＋orderBy name asc（"Cloud"<"apple" の binary collation まで固定）
- private / unlisted / trashed / orphan の各非出現（1テストに集約）
- owner 分離（別オーナーの public タグ非混入）
- **cross-owner public note 非出現**（`note_tags` の FK は owner を見ないため、他オーナーの公開
  ノートに owner のタグを物理リンクしても `notes.owner_id = ownerId` 述語で除外される、という
  owner-scope JOIN の本質を狙った良ケース。1932 行）
- limit/cap が distinct 後の行に効く・limit<=0 で `[]`・公開ノート0オーナーで `[]`

`searchPublicByNamePrefix` の既存 integration（681-710 行）と gate 構造が一致しており、回帰の
雛形踏襲も適切。各 describe ブロックがローカル `linkTagToNote` を持ちスコープ汚染なし。
assertion は返却配列の値そのものを `toEqual` で固定しており、実装過剰結合（内部 SQL 文字列や
private プロパティへの依存）は無く、意味のある契約（公開gate・owner-scope・順序・cap）を検証している。

### マークアップユニットの評価

`PublicTopControls.test.tsx` の SSR マークアップ検証は ADR-006 の方針どおり「常時可視部のみ」:

- ＋chip トリガーラベル「タグを追加」の存在（1694 行）
- 母集合 `allTags` が chips 行に漏れない（`#extra` を含まない）回帰（1728-1739 行）— ADR-003 の
  「母集合は chips 行にマージしない」不変条件を**否定形 assertion で固定**しており、filter-row 膨張の
  リグレッションを捕捉できる良いテスト。

Popover panel（option 群）は `open=false` の SSR では描画されないため `aria-disabled` のマークアップ
検証を諦め、抑止判定を純関数に逃がした判断は ADR-006 で明文化済み・妥当。閉じた Popover を無理に
開くモックを足さないことでテストの脆さを避けており、このファイルの既存作法（`nextFilterSearch`/
`toggleTagSet` を純関数として直接テスト）と一貫。

### モック戦略の評価

- `FakeTagRepo`（`service.test.ts:50-52` diff）への `async listPublicTagNamesByOwner() { return []; }`
  空スタブ追加は typecheck 修復として妥当。`TagService` は本メソッドを使わないため空返却で十分で、
  挙動検証を負わせていない（負わせるべきは integration 側）点も正しい。
- `makeTagRepoStub`（`view/__tests__/fakes/container.ts:55-63`）は `as unknown as TagRepository` の
  部分スタブで、ポート追加では型エラーにならないため無変更。plan step 4 の「触らない」判断は正確
  （`grep` で `implements TagRepository` が D1 と FakeTagRepo の2つのみであることを確認済み）。
- リポジトリ in-memory fake を新設せず gate 検証を実 DB に寄せた方針は docs/test.md「リポジトリ系の
  fake は意図的に置かない／application のロジックテストは integration に寄せる」と完全整合。

### plan 整合の総括

plan.md テスト方針の3本柱（integration 一本化 / フェイクユニット新設しない / 純関数 cap 抑止の
ユニット）はすべて実装に反映されている。ADR-006・ADR-007 は plan.md 本文の ADR-001〜005 より後に
追記された実装時判断（cap 抑止の純関数切り出し・panel 左アンカー）で、テスト方針と矛盾しない補強。
