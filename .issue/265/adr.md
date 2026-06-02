# ADR — Issue #265: extend no-op version-bump skipping to other update aggregates

先行 PR #263 / Issue #261（`.issue/261/adr.md`）の案 A（ドメイン側で内容比較し no-op なら同一参照を返す）を前提に、横展開の範囲と境界を確定する。

## ADR-001: `Version.next` を呼ぶ操作を「値セッター系」と「命令・状態遷移系」の2カテゴリに分類する

### Status
Accepted

### Context

Issue #265 は「InstanceSettings の no-op 化を `User.*` 等へ展開」を求める。しかし `User` 集約の操作は性質が一様でない:

- `change{Username,Email,DisplayName,Bio,Avatar}` — フィールドを値Xにする宣言的操作。同一値の再投入があり得る。
- `activate`/`suspend`/`reinstate`/`markDeleted`/`promoteToAdmin`/`demoteToMember` — 前提条件つきのアクション。

Issue 本文は `promoteToAdmin`/`demoteToMember` を「`role === 'admin'` なら no-op」と示唆していたが、これらを値セッターと同列に no-op 化すると、`activate`/`suspend` 等の他の命令系（前提条件違反で throw）との一貫性が崩れる。

### Decision

操作を2カテゴリに分類し、カテゴリ単位で挙動を統一する:

- **値セッター系** → 同一値なら no-op（同一参照を返し version 据置）
- **命令・状態遷移系** → 前提条件違反は throw

`promoteToAdmin`/`demoteToMember` は「昇格/降格しろ」という前提条件つき命令であり、命令カテゴリに属する。よって `activate`（pending でなければ throw）/`suspend`（active でなければ throw）と同様、既に admin/member なら throw する現状が正しい。

### Consequences

- 良い点: 集約の操作挙動が「値セッター=冪等 no-op / 命令=前提条件 throw」という単純な規則で説明できる。promote/demote が activate/suspend と同じ思想で揃う。
- トレードオフ: Issue 本文の文字どおりの示唆（promote/demote を no-op 化）を採らない。代わりに本 ADR で根拠を明示する。

---

## ADR-002: `promoteToAdmin` / `demoteToMember` は no-op 化せず throw を維持する

### Status
Accepted

### Context

ADR-001 の分類に従えば promote/demote は命令系で throw 維持が筋。一方で「他の値セッターと揃えて no-op 化」も選択肢として提示された。調査の結果、`IdentityErrorCode.AlreadyAdmin` / `AlreadyMember` は `entity.ts` の throw 箇所と `errorCode.ts` の定義以外、UI・ユースケースから一切参照されていない（no-op 化しても UX への影響はない）。

### Decision

throw を維持する。no-op 化しない。

理由:

1. **命令カテゴリとしての一貫性**（ADR-001）。冪等でない命令の前提条件違反（既に admin なのに昇格）を `throw` で「無駄打ち」と突き返すのは、`activate`/`suspend` と揃った正しい契約。
2. **no-op 化の動機が弱い**。no-op 化の主目的は「UI 二重押下/リトライで OCC version が無駄に進む」回避だが、admin 昇格/降格は設定保存のような高頻度リトライ操作ではない。
3. **挙動変更を避ける**。throw → no-op は観測可能な挙動変更であり、それに見合う便益が薄い。

ドメインオーナーと合意のうえ確定（本 Issue の議論）。

### Consequences

- 良い点: 既存の domain throw テスト（`entity.test.ts` の "rejects promoting an already-admin"/"rejects demoting an already-member"）を変更不要。`AlreadyAdmin`/`AlreadyMember` errorCode も参照が残り削除不要。
- トレードオフ: 値セッターと命令系で挙動が分かれるため、「全部 no-op で統一」という単純な期待には応えない。ADR-001 の分類で説明する。

---

## ADR-003: `changeUsername` は no-op 判定をクールダウン判定より前に出す

### Status
Accepted

### Context

`changeUsername` は値セッターだが、クールダウン判定（`lastUsernameChangedAt` による30日制限）が同一値判定より**前**にあった。そのため「クールダウン中に同一 username を再投入」すると no-op にならず `UsernameChangeTooSoon` を throw していた。

### Decision

`assertMutable` の直後に no-op 判定（`Username.equals`）を置き、その後にクールダウン判定を行う順序へ変更する。同一 username の再投入はクールダウン中でも throw せず同一参照を返す。

理由: クールダウンは「**実際に username を変える行為**」の頻度を制限する不変条件。同一値再投入は何も変えないのでレート制限の対象ではない。現状は無変更要求に対し「変更が早すぎる」を返す不整合（潜在バグ）だった。値セッターカテゴリ（ADR-001）の「内容変化ゼロなら何も起きない」を貫く。

### Consequences

- 良い点: クールダウンが「本当に変えた回数」だけを数える本来の役割に戻る。他の値セッターと挙動が一致。
- トレードオフ: 観測可能な挙動変更（クールダウン中の同一値再投入が throw → no-op）。ドメインオーナーと合意済み。別 username のクールダウン中 throw は維持。

---

## ADR-004: 横展開の洗い出し結果 — `Version.next` を呼ぶ全関数の分類

### Status
Accepted

### Context

Issue 本文は「`Version.next` を呼ぶ集約のうち no-op パターンがまだ入っていないもの」の網羅的な洗い出しを求める。計画レビューで、当初「他集約は対応済み」とした結論が `Note.updateContent` と `Directory.moveTo` の2つの未対応値セッターを見落としていたことが判明した。

### Decision

`Version.next` を呼ぶ全関数を ADR-001 の2カテゴリで分類し、未対応の値セッター（`Note.updateContent`・`Directory.moveTo`）を本 Issue のスコープに含めて no-op 化する。分類表:

| 集約 | 関数 | カテゴリ | 状態 |
|---|---|---|---|
| User | change{Username,Email,DisplayName,Bio,Avatar} | 値セッター | no-op 済（changeUsername は順序を ADR-003 で修正） |
| User | activate/suspend/reinstate/markDeleted | 命令・遷移 | throw（対象外） |
| User | promoteToAdmin/demoteToMember | 命令・遷移 | throw 維持（ADR-002） |
| Note | rename/moveTo/replaceTags/releaseEditLock | 値セッター | no-op 済 |
| **Note** | **updateContent** | **値セッター** | **本 Issue で no-op 化（イベント抑制含む）** |
| Note | trash/restore/acquireEditLock/extendEditLock | 命令・遷移 | throw / 対象外 |
| SavedView | rename/updateQuery/setSort/setDisplayMode/markDefault/unmarkDefault/markBroken/repairBrokenConditions | 値セッター | no-op 済 |
| Directory | rename/recomputeDepth | 値セッター | no-op 済 |
| **Directory** | **moveTo** | **値セッター** | **本 Issue で同一親 no-op 化** |
| Tag | rename | 値セッター | no-op 済 |
| PublicationState | changeVisibility | 値セッター | no-op 済 |
| ShareLink | resetFailedAttempts | 値セッター | no-op 済 |
| ShareLink | revoke/setPassword/recordAccess/recordFailedAttempt | 命令・遷移 | 対象外 |
| ExportJob | startProcessing/recordProgress/complete/fail/cancel/retry/expire | 命令・遷移（ジョブ） | 対象外 |
| IngestionJob | startProcessing/attachPreview/regenerate/commit/markFailed/retry/discard | 命令・遷移（ジョブ） | 対象外 |

### Consequences

- 良い点: 洗い出しが関数単位で網羅的になり、Issue 本文の要件（未対応の洗い出し）に証跡付きで応える。値セッターは全集約で no-op に揃う。
- トレードオフ: スコープが User 単独から Note/Directory へ広がる。ただし Issue 本文が明示的に求める横展開そのものであり妥当。

---

## ADR-005: `Note.updateContent` は内容未変化時に `contentUpdated` イベントを抑制する

### Status
Accepted

### Context

`Note.updateContent` は値セッターだが、他の値セッターと異なりドメインイベント（`contentUpdated`）を伴う。no-op 化すると version 据置だけでなくイベント抑制も発生し、`saveNoteDraft`（autosave）など同一内容連投の経路でリンク解決（`handleLinkTargetResolution`）・再インデックスがスキップされる。

### Decision

全6フィールド（title/contentHtml/frontMatter/tagIds/internalLinkRefs/mediaRefs）が現値と一致するとき、`{ entity: note, eventDrafts: [] }`（イベント空）を返す。

理由: 内容が一切変化していないなら、`contentUpdated` の購読者（リンク解決・インデックス更新）が行う仕事は冪等に「現状維持」であり、発行しないのが意味論的に正しい。ドメインイベントの at-least-once 配送はコストを伴うため、無変化時の抑制は OCC version 進行の抑止と同じ動機で正当化される。

### Consequences

- 良い点: autosave の同一内容連投で無駄な再インデックス・リンク再解決が走らなくなる。version も据え置かれ OCC 衝突確率が下がる。
- トレードオフ: 「updateContent を呼べば必ず contentUpdated が出る」という従来の素朴な前提が崩れる。ただし呼び出し側（saveNote/saveNoteDraft）は戻り値の `eventDrafts` を介してイベントを enqueue する設計のため、空配列でも破綻しない。`restoreNoteRevision`/`commitIngestionPreview` は内容変化前提のため実質影響なし。

---

## ADR-006: 比較ヘルパーは汎用化しない（Note の配列比較もローカルに留める）

### Status
Accepted

### Context

Issue 本文は「複数 aggregate に no-op 化を入れるなら共通ヘルパー化 or VO に `equals` を生やす設計判断が再浮上する」と指摘していた。本 Issue では `Note.updateContent` の no-op 判定で配列（tagIds/internalLinkRefs/mediaRefs）の比較が新たに必要になる。

### Decision

汎用 deep-equal は導入せず、各箇所で最小の比較を行う:

- User（changeUsername 順序）/ Directory（moveTo）: 既存 VO `equals` / `id` のプリミティブ比較のみで、新規ヘルパーは不要。
- Note（updateContent）: スカラは既存 VO `equals`（`NoteTitle`/`ContentHtml`/`FrontMatter`/`InternalLinkRef`）を使い、配列は `note/entity.ts` 内のローカルヘルパー（dedupe 済み配列の順序付き要素比較）で行う。VO 側に新 API は生やさない。

理由: 配列比較はそれぞれ要素の比較規則が異なる（tagIds/mediaIds はブランド文字列の `===`、links は `kind:target` キー）ため、汎用 deep-equal を持ち込むより局所ヘルパーの方が意図が明確。ADR-261 ADR-003（YAGNI）を踏襲。

### Consequences

- 良い点: 既存 VO API を変えず、汎用 deep-equal が持ち込む設計議論（深さ・Date/Map 等の扱い）を回避。比較規則が各集約に局所化される。
- トレードオフ: 配列比較ヘルパーが `note/entity.ts` に増える（3つ、または1つの汎用 `sameOrdered`）。Note 専用で他へ流出しない。

---

## ADR-007: User 集約の `version` は永続化されない — no-op の便益は「書き込み回避」

### Status
Accepted

### Context

実装中に判明: better-auth 由来の `users` テーブルには `version` カラムが無い。`userRepository.reconstruct` は常に `version: 0` を割り当て、OCC は `updatedAt.getTime()` をトークンに使う（`app/core/adapters/d1/repositories/userRepository.ts:43-49`）。つまり User ドメインの `version` カウンタはイベントペイロード／診断用の in-memory 値で、DB には残らない。

### Decision

User 値セッターの no-op 化（既存 + 本 Issue の changeUsername 順序）の便益を「version 進行抑止」ではなく「**ユースケース側ガード（`renamed === found.entity` / `user !== found.entity`）が `save` をスキップし、DB 書き込みと `updated_at`／OCC トークンの無駄な更新を防ぐ**」と整理する。ドメインの no-op（同一参照返却）がこのガードの前提を提供する。

### Consequences

- 良い点: InstanceSettings/Note/Directory（version 永続化あり）と User（version 永続化なし）で、no-op の「最終的な便益」は異なるが、ドメイン契約（同一値なら同一参照）は統一される。
- 影響: 統合テストでは User の version を DB 観測できないため、`updated_at` 不変を「書き込みが起きていない」指標として用いる（`identity.integration.test.ts` の no-op テスト）。
