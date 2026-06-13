# Plan Review — Issue #654（視点: アーキテクチャ整合性・実現可能性・リスク）

レビュー日: 2026-06-13 / Round 1 / 対象: `.issue/654/plan.md`, `.issue/654/adr.md`

---

## サマリー

計画は全体として**あるべきアーキテクチャ（ヘキサゴナル＋DDD・依存方向 内→外）に正しく沿っている**。実装ステップはポート → アダプター → ユースケース → ローダー → UI の内側起点・依存順で並んでおり、母集合列挙を tag ドメインポートに置く判断（ADR-001）も既存 `searchPublicByNamePrefix` 前例と一貫している。公開 gate JOIN・cap の置き場所・三者整合（ADR-003）も妥当。

ただし**実現可能性に関わる見落とし（必ず typecheck が落ちる）が1件**ある。それ以外は設計の細部に関する改善提案。

---

## 問題点（要修正）

- **[P-001]** ポート追加で `app/core/domain/tag/__tests__/service.test.ts` の `FakeTagRepo` が typecheck で必ず壊れる（計画の step 4 が未カバー）
  - 理由: `FakeTagRepo` は `class FakeTagRepo implements TagRepository`（27行〜）の**全実装**で、現状 `searchPublicByNamePrefix`（47行）まで含めて全メソッドをスタブしている。`TagRepository` ポートに `listPublicTagNamesByOwner` を追加すると、この `implements` が新メソッド不足で型エラーになる。一方で計画 step 4 が挙げているのは `app/core/application/view/__tests__/fakes/container.ts` の `makeTagRepoStub` のみで、こちらは `as unknown as TagRepository` の部分スタブ（プラン本文も「ポート追加だけでは壊れない」と正しく認識）。**壊れるのは挙げられていない `service.test.ts` の方**であり、`CLAUDE.md` の「変更後 `pnpm typecheck` が通ること」を満たせない。
  - 提案: step 4 の対象ファイルに `app/core/domain/tag/__tests__/service.test.ts` を追加し、`FakeTagRepo` に `async listPublicTagNamesByOwner() { return []; }`（TagService は本メソッドを使わないので空スタブで十分）を足す旨を明記する。`grep -rn "implements TagRepository" app/` でフル実装は `D1TagRepository` とこの `FakeTagRepo` の2つだけと確認済み（他に漏れはない）。

---

## 改善提案（検討推奨）

- **[S-001]** ユースケースの配置ディレクトリに先例不一致がある（`publication/` vs `search/`）— 採否どちらでもよいが ADR で一言触れると良い
  - 理由: 既存の「公開面タグ列挙」ユースケース `suggestPublicTags` は `app/core/application/search/` に置かれている（`tagRepository.searchPublicByNamePrefix` を呼ぶ唯一の usecase）。計画は `listUserPublicTags` を `application/publication/` に新設する。`publication/` には `listUserPublicNotes`/`getPublicProfile` という **`/u/$username` サーフェスの兄弟ユースケース**が既にあり、母集合ロードを `Promise.all` 第3レーンとして並べる以上 `publication/` 配置は十分妥当。ただし「公開タグ列挙は search/ にある」という前例と割れる点は読者に説明が要る。
  - 提案: 配置を `publication/` のままとするなら、ADR-001 か新 ADR に「`suggestPublicTags`(search/) はクロスオーナー前方一致の検索サーフェス用、本ユースケースは `/u/$username` profile サーフェスの owner-scoped 母集合なので publication/ の兄弟群に置く」と一行残す。これでスコープ（クロスオーナー検索 vs 単一オーナー公開ページ）の住み分けが明文化され、将来の混乱を防げる。

- **[S-002]** ＋chip のトリガー見た目は `filterChipGhost`（破線 ghost）ではなく**通常の `CHIP` クラス**でよい — 計画は正しいが、auth 側を「手本」と書くと取り違えやすい
  - 理由: 計画は「auth `TagPickerPopover`（FilterBar.tsx 463-562）を手本に」と繰り返すが、auth 側のトリガーは `filterChipGhost`（破線・unset 用 ghost chip, `app/components/note/list/styles.ts:80`）。一方 P30 モック（`spec/design/pages/P30-user-public-top.html` 569-572行）の「＋ タグを追加」は**既存タグ chip と同じ `chip` クラス**（破線でない実線 pill）＋ Plus アイコン 11px/stroke 2.2 ＋「タグを追加」ラベル。計画本文の step 6・UIセクションは「CHIP クラス＋Plus 11px・stroke 2.2」と**正しく** `CHIP` を指定できているが、「auth を手本に」の枕が強いので実装者が `filterChipGhost` を流用する取り違えリスクがある。
  - 提案: step 6 に「**トリガーの見た目だけは auth の `filterChipGhost` ではなく公開面 `CHIP`（モック準拠）を使う。手本にするのは listbox＋roving の挙動のみ**」と一文足し、構造（listbox/roving）と見た目（chip クラス）の借用元が別であることを明示する。AC-1 のモック完全一致に直結する。

- **[S-003]** ＋chip option の選択状態は `optimisticTags`（楽観 state）を参照する設計が UI セクションに書かれているが、props 受け渡しの確認を1点
  - 理由: 計画 UI セクションは「選択肢の `aria-selected`/`data-active` は `optimisticTags.has(tag)` で表現（chips と同じ楽観 state を共有）」とあり、これは正しい（`PublicTopControls` 内の `optimistic.tagNames` を `TagAddPopover` に渡せばよい）。ただし auth `TagPickerPopover` は `selected: ReadonlySet<string>` を props で受けて roving の `initialIndex`（最初の選択済みへ着地）に使う。母集合が cap 上限（最大1000件）の listbox になると、`useRovingMenu({ itemCount: allTags.length })` が1000件規模になる点（DOM 件数・キーボードナビ）への配慮があると堅い。
  - 提案: リスク欄に「母集合が大きい場合 ＋chip listbox の DOM 件数が増える（cap=1000）。auth 側は owner のタグ全件 listbox を既に許容しているので作法は同じだが、公開オーナーの公開タグ数は通常十数件オーダーで実運用上問題ない」と現状判断を一行残す（ADR-002 のトレードオフと整合）。スコープ拡大（仮想スクロール等）は不要。

- **[S-004]** `tagOptions`（発見タグ・8件 cap, `UserPublicTop.tsx:121`）と母集合の関係を、空配列・cap=0 防御の観点で一言補強
  - 理由: D1 アダプター実装は `searchPublicByNamePrefix` を雛形にするが、その実装は `if (limit <= 0) return []` のガードを持つ（`tagRepository.ts:252`）。計画 step 3 は「prefix の LIKE 除去・owner 条件追加・distinct/orderBy/limit 維持」とあるが、`limit <= 0` 早期 return ガードの移植可否に言及がない。`PUBLIC_TAG_MASTER_CAP=1000` 固定で渡す以上 0 にはならないが、雛形の防御を残すか落とすかを明示すると実装ブレが減る。
  - 提案: step 3 に「`limit <= 0` の早期 return ガードは雛形踏襲で残す（防御）」を一行足す。軽微。

---

## 良い点

- **依存方向・実装順が正しい。** step 1（ポート）→ 3（アダプター）→ 2（ユースケース）→ 5（ローダー）→ 6（UI）は内→外の依存順で、ドメインに置くべき責務（tag 名列挙）がユースケース/アダプターへ漏れていない。公開 gate JOIN を read-only SQL としてアダプターに閉じる方針も `searchPublicByNamePrefix` の確立済みパターンと完全に一致。
- **ADR-001 の配置判断が妥当。** publication 集約の「id-shaped projection only」契約（`publicationStateRepository` JSDoc）を引き、tag 名列挙を publication 集約に引きずり込まない理由が明確。`searchPublicByNamePrefix` 前例との整合も取れている。owner-scope を必ず付けてクロスオーナー漏洩を防ぐ点もリスク欄に明記済み。
- **公開可視性 gate の漏洩リスクを正しく最重要視している。** 「JOIN を `searchPublicByNamePrefix` の公開 gate（`publication_states.visibility='public'` ＋ `notes.status='active'`）と完全一致させる」「private-only タグ非出現をテストで検証」を P-level リスクとして明記。実 DB 統合テストで private/trashed/別オーナー除外を確認する方針も適切。
- **ADR-003 の三者整合（発見タグ／母集合／選択中タグ）が破綻しない。** 母集合を chips 行の `mergeTagChips` に合流させず ＋chip 選択肢専用 prop（`allTags`）に閉じることで filter-row の膨張を防ぎ、選択 → `toggleTag` → chips 行合流という既存の単一楽観フローに収束させる設計は状態の二重ソースを作らず正しい。`mergeTagChips` を変更しない判断も影響範囲を最小化している。
- **cap の置き場所（ADR-002）が既存作法と一貫。** ユースケース定数 `PUBLIC_TAG_MASTER_CAP=1000` → ポート `limit` 引数 → アダプター SQL `LIMIT` は `TAG_CANDIDATE_CAP`/`findPublicByOwner({limit:1000})` と同じ。タグ数 < ノート数の性質上 1000 は実運用で切られず妥当。
- **母集合を loader dep に含めない判断が正しい。** sort/period/page で母集合は不変なので `cache(serverData(...))` の3本目として `Promise.all` 並列ロードし、URL 変化で再フェッチしない設計はレイテンシ・正確性ともに適切（`tagOptions` と性質が異なる点も明記）。
- **スコープ境界が明確。** 自由入力（前方一致サジェスト）・noteCount 表示・期間/ソート挙動変更を「含まれないもの」として Issue 要件に照らし正しく除外。理想形の追求しすぎも、既存に合わせるだけの妥協もなくバランスが取れている。

---

## 検証済みの事実（参考）

- `FakeTagRepo`（`service.test.ts`）はフル `implements TagRepository`。`makeTagRepoStub`（fakes/container.ts）は `as unknown as` 部分スタブ。→ P-001 の根拠。
- `TagRepository` フル実装は `D1TagRepository` と `FakeTagRepo` の2つのみ（`grep implements TagRepository`）。インメモリ tag アダプターは存在しない。
- `searchPublicByNamePrefix` 実装（`tagRepository.ts:245-282`）は `selectDistinct({name}).from(tags).innerJoin(noteTags).innerJoin(notes,active).innerJoin(publicationStates,public)` ＋ `orderBy(asc(tags.name))` ＋ `limit`。計画の雛形流用は正確。`limit<=0` 早期 return ガードあり（S-004 の根拠）。
- 既存の公開タグ列挙ユースケース `suggestPublicTags` は `application/search/` に在る（S-001 の根拠）。
- P30 モック（`P30-user-public-top.html` 569-572）の「＋ タグを追加」は `chip` クラス（ghost でない）＋ Plus 11px/stroke 2.2（S-002 の根拠）。
- auth 側トリガーは `filterChipGhost`（破線 ghost, `styles.ts:80`）— 公開面 `CHIP` とは別（S-002 の根拠）。
