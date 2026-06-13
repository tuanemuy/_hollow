# Plan Review — Issue #654（視点: アーキテクチャ整合性・実現可能性・リスク）

レビュー日: 2026-06-13 / Round 2 / 対象: `.issue/654/plan.md`, `.issue/654/adr.md`
1周目: `.issue/654/plan-review/round-1-arch-risk.md`

---

## サマリー

1周目の指摘（P-001＋S-001〜S-004）はすべて plan/adr に反映済み。実在コードと突き合わせて各反映の正確性を確認した。新たに要修正の問題は見つからなかった。1周目修正による新規矛盾・見落としもなし。**問題点ゼロ。** 改善提案を2件（任意・スコープ内の細部）残す。

---

## 1周目指摘の解消確認

- **[P-001] FakeTagRepo の typecheck 破損 → 解消。** step 4 が対象に `app/core/domain/tag/__tests__/service.test.ts` の `FakeTagRepo`（27行）を明記し、`async listPublicTagNamesByOwner() { return []; }` の空スタブを足す方針を記載。実コード確認: `service.test.ts:27` は `class FakeTagRepo implements TagRepository` のフル実装で、`searchPublicByNamePrefix()`（47行）含め全メソッドが空 return スタブ（`{ return []; }`）。新メソッドを足さないと `implements` が必ず型エラーになる点・空スタブで足りる点ともに正確。`grep -rn "implements TagRepository"` の結果も `D1TagRepository`（adapters）と `FakeTagRepo` の2つのみで、計画の「フル実装ダブルは2つ」は正しい。`makeTagRepoStub`（部分スタブ）無変更の判断も妥当。
- **[S-001] ユースケース配置の先例不一致 → 解消。** ADR-005 を新設し「`suggestPublicTags`(search/) はクロスオーナー前方一致の検索サーフェス、`listUserPublicTags` は `/u/$username` の owner-scoped 母集合なので publication/ の兄弟群に置く」と住み分けを明文化。
- **[S-002] トリガー見た目の取り違えリスク → 解消。** AC-1・step 6・UI セクション・ADR-001 すべてで「見た目＝公開面 `CHIP`（実線 pill）、挙動のみ auth `TagPickerPopover` を手本」と借用元の分離を明示。実コード確認: auth トリガーは `filterChipGhost`（破線, `note/list/styles.ts:80`）＋ option に `noteCount` 併記、P30 モック 570-573 は `chip` クラス（実線）＋ Plus 11px/stroke 2.2。計画の指定はモックと一致。
- **[S-003] cap=1000 規模 listbox の DOM 件数 → 解消。** リスク欄に「公開タグは通常十数件オーダー、auth が owner 全タグ listbox を同作法で許容済み、仮想スクロールはスコープ外」と現状判断を追記。
- **[S-004] `limit<=0` 早期 return ガード → 解消。** step 3 に「雛形踏襲で残す（防御）」を明記。実コード確認: `tagRepository.ts:252` に `if (limit <= 0) return [];` が実在。雛形の `trim`/空文字 return／`LIKE` は除去する旨も正しい。

---

## 問題点（要修正）

問題点ゼロ。

検証で確認した整合性:
- **依存方向**: step 1 ポート → 3 アダプター → 2 ユースケース → 5 ローダー → 6 UI が内→外で正しい。母集合列挙責務（tag 名）が tag ドメインに収まりユースケース/アダプターへ漏れていない（ADR-001）。
- **公開 gate JOIN の完全一致（漏洩なし）**: 雛形 `searchPublicByNamePrefix`（`tagRepository.ts:245-282`）は `innerJoin(notes, status='active')` ＋ `innerJoin(publicationStates, visibility='public')` で private/trash を排除。**この雛形には `notes.ownerId` 条件が無い**（クロスオーナー検索なので意図的）。計画は step 3・ADR-001・リスク欄で `eq(notes.ownerId, ownerId)` の追加を必須と明記しており、owner 漏れ（他オーナーのタグ混入）も private/trash 漏れも防ぐ条件が揃っている。
- **cap 配置**: ユースケース定数 `PUBLIC_TAG_MASTER_CAP=1000` → ポート `limit` 引数 → アダプター SQL `LIMIT` は既存 `TAG_CANDIDATE_CAP=1000`（`listUserPublicNotes.ts:217`）／`findPublicByOwner({limit:1000})` と同作法（ADR-002）。
- **三者整合（発見タグ/母集合/選択中）**: `mergeTagChips`（`PublicTopControls.tsx:611`）を変更せず母集合を `allTags` 新 prop で ＋chip 選択肢にのみ供給。選択 → 既存 `toggleTag`（239行）→ `optimisticTags` 経由で chips 行へ合流する単一フローに収束（ADR-003）。状態の二重ソースを作らない。
- **transport cap 抑止の実現可能性**: route `publicTopSearchSchema`（`index.tsx:37`）は `tags:...max(8).catch(undefined)`、server-fn `renderInputSchema`（52行）は `.max(8)`。9件目で `.catch(undefined)` により絞り込みがサイレント全消失する経路は実在。＋chip 側で「8件選択中は未選択 option を `aria-disabled`」とする抑止は `optimisticTags.size` で判定でき、既選択 option をトグル解除可能に保つ条件も整合（ADR-004）。UI に閉じた構造的防止で実現可能。
- **ユースケース guard 再利用**: `getPublicProfile`／`listUserPublicNotes` と同じ `unitOfWorkProvider.run` ＋ `findByUsername` ＋ deleted/suspended → `NotFoundError` パターンを踏襲（実コードで一致確認）。`index.ts` は `export *` 形式なので re-export 追加も自然。
- **並列ロード**: `UserPublicTop` は既に `Promise.all([loadProfile, loadNotes])`（102行）。母集合を `cache(serverData(...))` の第3レーンに足す計画は loader dep 非依存（sort/period/page で不変）という性質とも整合。

---

## 改善提案（検討推奨）

- **[S-001]** `listUserPublicTags` の戻り型 `{ tagNames }` を ＋chip 抑止ロジックが `optimisticTags` と同じ正規化前提で扱えるか、ADR か step 6 に一行あると堅い
  - 理由: 母集合（`allTags`）は tag の**表示名**を DB の `tags.name` から distinct で返す（雛形 `searchPublicByNamePrefix` は `selectDistinct({name})` で大小文字違いを表示名で1件に畳む）。一方 chips 行の選択判定 `optimisticTags.has(tag)` は URL の `tags`（ユーザーが選んだ文字列＝母集合由来）との完全一致で動く。母集合経由の選択は同じ表示名文字列を渡すので一致は崩れないが、`tagOptions`（発見タグ, `notes.flatMap(n => n.tagNames)`）と `allTags` が別経路で得た同一タグの**表記揺れ**（理論上）で `aria-selected` がズレないことだけ、step 6 の選択判定が「母集合 option の文字列 = `toggleTag` に渡す文字列 = URL `tags` 値」で閉じている旨を一言添えると実装者の迷いが消える。実害可能性は低く軽微。

- **[S-002]** ＋chip option の選択判定に使う state（`optimisticTags`）が、`mergeTagChips` を介さない直接参照である点を step 6 に明示するとよい
  - 理由: 計画 UI セクションは「`aria-selected` は `optimisticTags.has(tag)`」と正しく書いているが、chips 行は `chips = mergeTagChips(tagOptions, [...optimisticTags])`（233行）の派生配列をレンダーする一方、＋chip 選択肢は `allTags` を直接 map し選択状態だけ `optimisticTags` を引く——という「列挙ソースは別、選択判定 state は共有」の構図を step 6 に一行で固定しておくと、実装者が誤って `chips` を ＋chip にも流用して母集合が chips 行へ漏れる（ADR-003 が防ごうとした filter-row 膨張）リスクを抑えられる。これは ADR-003 の意図を実装手順に落とす補強で、新規論点ではない。

---

## 良い点

- **1周目の必須指摘（P-001）が、単なる文言追加でなく根拠付き（行番号・空スタブで足りる理由・他に漏れが無い grep 確認）で反映されている。** step 4 は「typecheck 修復・必須」と検証作法（gate 検証の D1 integration 一本化、view fakes container が user repo 不在で流用不可）まで含め整理されており、実装時に迷いが出ない粒度。
- **公開 gate の owner-scope 追加を最重要リスクとして正しく扱っている。** 雛形がクロスオーナー（owner 条件なし）である事実を踏まえ、`eq(notes.ownerId, ownerId)` 追加を step 3・ADR-001・リスク欄の複数箇所で必須化し、private-only 非出現・別オーナー非混入の両方を integration test で検証する方針。漏洩 surface を塞ぐ意識が一貫。
- **transport cap（`.max(8)` / `.catch(undefined)`）のサイレント全消失を構造的に防ぐ設計（ADR-004）が、schema を変えず UI に閉じる最小影響で、かつ完了基準（手動検証＋UI 配線ユニット）にまで落ちている。** 母集合追加で初めて現実化する副作用を先読みできている。
- **ユースケース配置（ADR-005）・母集合の chips 行非合流（ADR-003）・cap 配置（ADR-002）いずれも既存作法（`listUserPublicNotes`/`getPublicProfile`/`suggestPublicTags`）と突き合わせた判断で、理想形の過剰追求も既存への安易な相乗りもない。** スコープ「含まれないもの」（自由入力・noteCount・cap 引き上げ・クロスオーナー列挙）も Issue 要件に照らし妥当に除外。

---

## 検証済みの事実（参考）

- `FakeTagRepo`（`service.test.ts:27`）はフル `implements TagRepository`、全メソッド空 return スタブ。`D1TagRepository`（`tagRepository.ts:56`）と合わせフル実装は2つのみ（grep 確認）。
- 雛形 `searchPublicByNamePrefix`（`tagRepository.ts:245-282`）: `selectDistinct({name}).from(tags).innerJoin(noteTags).innerJoin(notes,status='active').innerJoin(publicationStates,visibility='public')` ＋ `orderBy(asc(tags.name))` ＋ `limit`。`if (limit<=0) return []`（252行）／`trim`／空文字 return／`LIKE`（276行）あり。**`notes.ownerId` 条件は無い**（owner 追加が本 Issue の必須差分）。
- route `publicTopSearchSchema`（`index.tsx:37`）`tags:...max(8).catch(undefined)`、`renderInputSchema`（52行）`tags:...max(8)`。
- auth `TagPickerPopover`（`FilterBar.tsx:463-562`）トリガー `filterChipGhost`（破線）、option に `noteCount` 併記、`useRovingMenu(itemRole:"option", restoreFocusOnCommit:true)`。P30 モック 570-573 は `chip`（実線）＋ Plus 11px/stroke 2.2、＋chip はタグ chips と 期間 の間。
- `PublicTopControls`（`PublicTopControls.tsx`）: `toggleTag`(239)→`setTags`→`run`→`nextFilterSearch`、`optimisticTags`(228)、`mergeTagChips`(611) は変更対象外。
- `UserPublicTop`（`UserPublicTop.tsx:102`）`Promise.all([loadProfile, loadNotes])`、`cache(serverData(...))`、`isNotFoundError → notFound()`。`tagOptions`(121) は `notes.flatMap(n=>n.tagNames)` 8件 cap。
- guard: `getPublicProfile`/`listUserPublicNotes` とも `unitOfWorkProvider.run` ＋ `findByUsername` ＋ deleted/suspended → `NotFoundError`。`publication/index.ts` は `export *` re-export。
