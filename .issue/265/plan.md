# 実装計画 — Issue #265: domain: extend no-op version-bump skipping from InstanceSettings to other update aggregates (User.*, etc.)

**Issue:** #265
**作成日:** 2026-06-02
**複雑度:** 中〜大規模（調査の結果、実装差分は小さいが設計判断と横断確認を伴う）

---

## 目的

PR #263 (Issue #261) で InstanceSettings に入れた「payload が現在値と内容一致なら version を進めない no-op」パターンを、`User` を含む他集約へ展開すべきか検討し、必要な箇所に適用する。

ただし調査の結果、**`User` の値セッター系（changeUsername/Email/DisplayName/Bio/Avatar）は既に no-op 化済み**で、他集約（Note/SavedView/Directory/Tag/Publication）も値セッターは対応済み。本 Issue で残る実質作業は限定的であり、その境界を明確化することが主目的となる。

## 設計原則（本 Issue で確定した「あるべき姿」）

`Version.next` を呼ぶ集約の操作を **2カテゴリ** に分類し、カテゴリごとに挙動を統一する:

| カテゴリ | 定義 | あるべき挙動 | 該当例 |
|---|---|---|---|
| **値セッター系** | フィールドを値Xにする宣言的操作。同一値の再投入があり得る | 同一値なら **no-op**（同一参照を返し version 据置） | `change{Username,Email,DisplayName,Bio,Avatar}`、Note.rename/replaceTags、SavedView.rename 等 |
| **命令・状態遷移系** | 前提条件つきのアクション。同一値の再投入は呼び出し側の無駄打ち | 前提条件違反は **throw** | `activate`/`suspend`/`reinstate`/`markDeleted`/`promoteToAdmin`/`demoteToMember`、ジョブ系ライフサイクル遷移 |

この分類で見ると、`promoteToAdmin`/`demoteToMember` は `changeBio` の仲間ではなく `activate`/`suspend` の仲間。前提条件違反（既に admin/member）を throw するのは命令系として一貫しており、**no-op 化しない**ことが正しい。

## スコープ

### 含まれるもの
- **[User]** `changeUsername` の判定順序見直し: 値セッターとして純化し、**no-op 判定をクールダウン判定より前に出す**（同一 username 再投入はクールダウン中でも throw せず no-op）。
- **[Directory]** `moveTo` の同一親への移動を no-op 化（`Note.moveTo` と対称。現状は cyclic のみ throw し、現在の親へ移動するケースで version を進めていた）。
- **[Note]** `updateContent` の no-op 化: 全6フィールド（title/contentHtml/frontMatter/tagIds/internalLinkRefs/mediaRefs）が現値と一致するとき version を進めず、`contentUpdated` イベントも発行しない（autosave 連投での無駄なリンク解決・再インデックスを抑止）。
- 値セッターの no-op 分岐に対するドメインユニットテスト補完（User の `changeDisplayName`/`changeBio`/`changeAvatar` 同一値・null↔null、`changeUsername` クールダウン中同一値、`Directory.moveTo` 同一親、`Note.updateContent` 全一致）。
- アプリケーション統合テスト補完（同一 payload 連投で version 据置を担保）。
- 2カテゴリ原則・各判断・`Version.next` を呼ぶ全関数の分類表を `.issue/265/adr.md` に明文化。

### 含まれないもの
- **`promoteToAdmin`/`demoteToMember` の no-op 化**（命令カテゴリのため throw 維持。Issue 本文の示唆を意図的に却下 — ADR-002 参照）。
- ジョブ系（ExportJob/IngestionJob）への適用（純粋な状態遷移のみで同一値再投入の概念がなく対象外）。
- `AlreadyAdmin`/`AlreadyMember` errorCode の削除（throw 維持なので参照が残る）。
- 汎用 deep-equal の新設（各 VO の `equals` / プリミティブ比較 / Note 配列の局所比較で足り、汎用化は不要。ADR-261 / ADR-005 参照）。

## 実装ステップ

### 1. `changeUsername` の判定順序を入れ替え

- **対象ファイル:** `app/core/domain/identity/entity.ts`（`changeUsername`, 現状 170-196 行）
- **変更内容:** `assertMutable(user)` の直後に `if (Username.equals(user.username, newUsername)) return user;` の no-op 判定を移動し、その**後**にクールダウン判定（`lastUsernameChangedAt` チェック）を置く。
  ```
  changeUsername(user, X):
    1. assertMutable(user)                       # deleted なら throw
    2. if Username.equals(現在値, X): return user # ← no-op を先に
    3. if クールダウン中: throw UsernameChangeTooSoon
    4. 値更新 + version++ + lastUsernameChangedAt = now
  ```
- **理由:** クールダウンは「実際に username を変える行為」の頻度制限。同一値再投入は何も変えないのでレート制限の対象外。現状はクールダウン判定が先にあるため、無変更要求に対し `UsernameChangeTooSoon` を返す不整合（潜在バグ）になっている。値セッターカテゴリの純化。

### 2. `Directory.moveTo` の同一親 no-op

- **対象ファイル:** `app/core/domain/directory/entity.ts`（`moveTo`, 53-72 行）
- **変更内容:** cyclic チェック（`newParent.id === dir.id` で throw）の後に `if (newParent.id === dir.parentId) return dir;` を追加。同一親への移動は depth も不変なので同一参照を返す。
- **理由:** `Note.moveTo`（`note/entity.ts:200` で `note.directoryId === newDirectoryId` を no-op）と対称。`recompute Depth` には既に no-op ガードがあり、`moveTo` だけが類似操作の中で非対応で不整合だった。イベント発行はなく低リスク。

### 3. `Note.updateContent` の no-op

- **対象ファイル:** `app/core/domain/note/entity.ts`（`updateContent`, 120-187 行）
- **変更内容:** `next{Title,Html,Front,Tags,Links,Media}` を算出した後、全6フィールドが現値と一致するなら `return { entity: note, eventDrafts: [] }` を返す。比較は既存 VO の `equals`（`NoteTitle`/`ContentHtml`/`FrontMatter`/`InternalLinkRef`）＋ tagIds/mediaIds はブランド文字列の順序付き要素比較。配列比較はファイル内ローカルヘルパー（`sameTagIds`/`sameLinks`/`sameMediaIds`、または汎用 `sameOrdered`）で行い、dedupe 済み配列同士を比較する（`nextTags`/`nextLinks`/`nextMedia` は既に dedupe 済み、現値もコンストラクタ/再投入時に dedupe 済み）。`assertEditPermitted` は no-op 判定の**前**に維持（編集権限／ロックは内容一致以前の前提条件）。
- **理由:** `saveNoteDraft`（autosave）を含む経路で、同一内容の連投が毎回 `Version.next` ＋ `contentUpdated` を発行し、リンク解決（`handleLinkTargetResolution`）・再インデックスを無駄に走らせていた。内容未変化ならイベント抑制が意味論的に正しく、OCC version 進行とイベント増殖の両方を防ぐ。Issue 本文の no-op 展開要件に最も合致する高価値箇所。
- **注意:** 配列比較は順序付き（false negative = 不要な version 進行だが現状挙動と同じで回帰なし、conservative）。`restoreNoteRevision`/`commitIngestionPreview` も `updateContent` 経由だが、これらは内容が変わる前提のため no-op 化の影響は実質ない。

### 4. ドメインユニットテストの補完

- **対象ファイル:** `app/core/domain/identity/__tests__/entity.test.ts`, `app/core/domain/directory/__tests__/entity.test.ts`, `app/core/domain/note/__tests__/entity.test.ts`
- **変更内容（追加のみ。既存テストは原則維持）:**
  - identity: `changeDisplayName` 同一値 no-op、`changeBio` 同一値・`null→null` no-op、`changeAvatar` 同一 mediaId・`null→null` no-op、`changeUsername` クールダウン中同一値 no-op（version・lastUsernameChangedAt 据置）。既存「別 username はクールダウン中 throw」は維持。
  - directory: `moveTo` 同一親 → 同一参照・version 据置の no-op、別親 → version+1（既存）を維持。
  - note: `updateContent` 全6フィールド一致（引数省略 = 現値）→ 同一参照・`eventDrafts` 空・version 据置。1フィールドだけ変えると version+1＋`contentUpdated` 発行（content-changed 分岐）。
- **理由:** 値セッターの no-op / content-changed 両分岐を漏れなく保護する（Issue 本文のテスト要件）。

### 5. アプリケーション統合テストの補完

- **対象ファイル:** `app/core/application/identity/__tests__/identity.integration.test.ts`（および Note save 系の統合テストがあれば該当箇所）
- **変更内容（追加のみ）:**
  - `UpdateProfile`: 同一 `displayName` 再投入で version 据置。
  - `ChangeUsername`: リネーム後に**同一 username** 再投入でクールダウン例外なし・version 据置。
  - version の観測は usecase 戻り値 DTO では不可（`UserDTO` は version 非公開）。UoW 内 `userRepository.findById(...).entity.version` を再取得して確認するか、`updatedAt` 不変を代理指標にする。
- **理由:** ドメイン no-op とユースケース側ガードが連動して DB round-trip / version 進行を抑止することを統合レベルで担保（レビュー指摘 S-001 反映）。

### 6. ADR の記録

- **対象ファイル:** `.issue/265/adr.md`
- **変更内容:** 2カテゴリ原則、promote/demote throw 維持、`changeUsername` 順序、`Directory.moveTo`・`Note.updateContent` の no-op 化、`Version.next` を呼ぶ全関数の分類表、比較ヘルパー方針を記録。

### 7. 品質ゲート

- `pnpm typecheck && pnpm lint:fix && pnpm format`（biome はローカル `./node_modules/.bin/biome` 経由で format 確認 — rtk がコマンドを書き換える既知問題のため）。
- `pnpm test:unit` / `pnpm test:integration` 全 pass。

## 設計判断

詳細は `.issue/265/adr.md` 参照。要点:

- **promote/demote は throw 維持**（命令カテゴリ）。`AlreadyAdmin`/`AlreadyMember` は UI・ユースケースから参照ゼロだが、throw は冪等でない命令の前提条件違反を明示する正しい契約。`activate`/`suspend` 等と一貫。
- **changeUsername は no-op 判定を先に**（値セッターカテゴリの純化）。
- **Directory.moveTo・Note.updateContent を no-op 化**（レビューで洗い出された未対応値セッター）。Note.updateContent は内容未変化時に `contentUpdated` イベントも抑制する。
- **比較ヘルパーは汎用化しない**。User/Directory は既存 VO `equals` / プリミティブ比較。Note は配列比較のローカルヘルパーを `entity.ts` 内に置く（汎用 deep-equal は導入しない、ADR-261 ADR-003 踏襲）。
- **ジョブ系（Export/Ingestion）は対象外**（状態遷移のみ）。

## リスクと注意点

- `changeUsername` の順序入れ替えは挙動変更（クールダウン中の同一値再投入が throw → no-op）。ただしユーザー（ドメインオーナー）と合意済み。既存の「別 username はクールダウン中 throw」テストが回帰しないことを確認する。
- admin の promote/demote は server-function 経由 mutation のため agent-browser での自動検証は不可（cross-origin 403）。本 Issue では promote/demote のコード変更がないため影響なし。
- 値セッターの no-op はリポジトリ save をスキップする設計だが、これは既存挙動であり本 Issue で新たに導入するものではない。

## テスト方針

- **ドメインユニット**（`entity.test.ts`）: 値セッター no-op 分岐（displayName/bio/avatar の同一値・null↔null、changeUsername クールダウン中同一値）。
- **アプリ統合**（`identity.integration.test.ts`）: 同一 payload 連投で version 据置（updateProfile / changeUsername）。version は repository 再取得で観測（UserDTO は version 非公開）。
- 既存テスト全 pass（promote/demote の throw テスト、別 username クールダウン throw テストを含む）を維持。

## レビュー履歴

### 1周目: 2視点並列レビュー（要件カバレッジ / アーキ・リスク）

**修正した点（要件カバレッジ視点）**:
- **[P-001]** `Note.updateContent` が値セッターなのに no-op 未対応（同一内容でも version 進行＋`contentUpdated` 発行）。当初「Note 対応済み」とした結論の見落とし。→ ユーザー合意のうえスコープに追加し no-op 化（イベント抑制含む）。実装ステップ3・ADR-004/005 に反映。
- **[P-002]** `Directory.moveTo` が同一親への移動で no-op 化されておらず `Note.moveTo` と不整合。→ スコープに追加。実装ステップ2・ADR-004 に反映。

**修正した点（アーキ・リスク視点）**:
- **[S-001]** `UserDTO` が `version` を公開しないため、統合テストで usecase 戻り値から version を観測できない。→ 実装ステップ5に「repository 再取得 or updatedAt 代理」を明記。

**確認できた点（両視点）**:
- promote/demote の throw 維持（ADR-002）、changeUsername 順序入れ替えの副作用分析（assertMutable 先頭維持・優先順位）、changeEmail 対象外、ジョブ系対象外の各判断はコード照合で妥当と確認。アーキ視点はブロッカーゼロ。

**スコープ判断**:
- `Note.updateContent` の no-op 化（イベント抑制を伴う挙動変更）はドメインオーナーに確認し「本 Issue に含める」を選択。`Directory.moveTo` は自明な対称化のため確認不要でスコープへ畳み込み。
