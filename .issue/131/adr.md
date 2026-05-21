# ADR — Issue #131: 定数化されていない BusinessRuleError リテラル直書きを *ErrorCode 定数化

## ADR-001: `CommonErrorCode` を新設し、value は prefix 無しの lower_snake を採用する

### Status
Proposed

### Context

`app/core/domain/common/{version,event}.ts` の `BusinessRuleError("INVALID_VERSION" / "INVALID_EVENT_ID")` リテラル直書きを定数化する際、配置先の選択肢が複数ある:

1. **既存ドメイン（例: `IdentityErrorCode` や `NoteErrorCode`）に間借り** — `Version` / `EventId` は全ドメインで使われる primitive のため帰属先がない
2. **`SystemErrorCode` に間借り** — UPPER_SNAKE 帯（driver-level conflict code）であり、business code と混在させると Issue #82 ADR-003 の方針（UPPER は driver 用に温存）に反する
3. **新規 `CommonErrorCode` を `app/core/domain/common/errorCode.ts` として新設** — 配置上自然

value の命名についても、spec/ 配下に `INVALID_VERSION` / `INVALID_EVENT_ID` 該当文言が無いため、Issue #82 ADR-002 のデフォルトルール（spec 文言なしなら `{domain}_{snake_case_of_property_key}`）に従うか、prefix を省略するかの選択肢がある。

### Decision

- 案 3（`CommonErrorCode` 新設）を採用する
- value は prefix 無しで `"invalid_version"` / `"invalid_event_id"` とする

### Consequences

- **良い点:**
  - 配置上の不自然さが解消（特定 business ドメインへの間借りなし）
  - Issue #82 ADR-001 の lower_snake 規約に準拠し、`errorCodeNaming.test.ts` の機械検証対象に組み込まれる
  - `common_invalid_version` のような冗長 prefix を避けられる（`common` ドメイン名はディレクトリ命名上の便宜であり、business 観点での意味性が弱い）
- **トレードオフ:**
  - `EXPECTED_ERROR_CODE_NAMES` Set への `CommonErrorCode` 追加が必要（ADR-005 of Issue #82 の運用に従う）
  - `invalid_version` / `invalid_event_id` は他ドメインで偶発衝突する可能性があるが、現状 grep で発見されず

---

## ADR-002: `NoteErrorCode.Trashed = "note_trashed"` を新設し、`AlreadyTrashed` と並立させる

### Status
Proposed

### Context

`publication` 配下 3 ファイル（`changePublicationVisibility.ts:63` / `issueShareLink.ts:66` / `listShareLinks.ts:38`）が `BusinessRuleError("note_trashed", ...)` を直書きしている。これは note の status !== "active" を検出した際のエラーであり、spec/usecases/{publication,note}.md でも `note_trashed` 文言として確定している。

一方、既存 `NoteErrorCode.AlreadyTrashed = "note_already_trashed"` は DeleteNote spec の文言（`note_already_trashed`）に対応している。Issue #82 ADR-006 はこの二つの文言の重義性を認識した上で、`AlreadyTrashed` の value 変更は別 Issue として保留している。

選択肢:
1. `NoteErrorCode.Trashed = "note_trashed"` を新設し、`AlreadyTrashed` と並立させる
2. `AlreadyTrashed` を統合する（value を `note_trashed` に変更し、`note_already_trashed` の参照箇所も更新）
3. `PublicationErrorCode` 配下に `NoteTrashed = "note_trashed"` を追加（呼び出し元ドメイン側に置く）

### Decision

案 1（`NoteErrorCode.Trashed = "note_trashed"` 新設・並立）を採用する。

理由:
- spec 上 `note_trashed` と `note_already_trashed` は別文言として並立しており、value を統合すると spec 文言整合性が失われる（Issue #82 ADR-001 の SSOT 方針に反する）
- `note_trashed` は Note ドメインの状態制約であり、識別子の所有者は Note ドメインが自然（ADR-002 of Issue #82）
- `AlreadyTrashed` の重義性整理は Issue #82 ADR-006 で別 Issue 扱いと宣言済み

### Consequences

- **良い点:**
  - spec 文言と value が verbatim 一致
  - Issue スコープを増やさず Issue #82 ADR-006 の二段階アプローチに従える
  - 呼び出し元ドメイン（publication）が note ドメインの定数を import するのは依存方向として自然（publication は note に依存している）
- **トレードオフ:**
  - `NoteErrorCode` に意味的に近い 2 property（`Trashed` / `AlreadyTrashed`）が並立する状態がしばらく残る
  - `AlreadyTrashed` の重義性整理（別 Issue）まではドメインモデル理解で「`Trashed` と `AlreadyTrashed` の使い分け」が必要

---

## ADR-003: identity の `media_not_owned` は `IdentityErrorCode` に追加する（4 ドメイン目の同値共有）

### Status
Proposed

### Context

`updateProfile.ts` 内の `BusinessRuleError("media_not_owned", ...)` 3 箇所を定数化する際、既存配置の選択肢:

- `PublicationErrorCode.MediaNotOwned = "media_not_owned"`（既存）
- `MediaErrorCode.NotOwned = "media_not_owned"`（既存）
- `NoteErrorCode.MediaNotOwned = "media_not_owned"`（既存）
- `IdentityErrorCode` に新規追加

Issue #82 ADR-004 は「`media_not_owned` の 3 ドメイン同値共有を容認」と既に決定済み。本 Issue では identity ドメインからも同じ value を発行するため、4 ドメイン目の追加となる。

選択肢:
1. `IdentityErrorCode.MediaNotOwned = "media_not_owned"` を追加（4 ドメイン共有）
2. 既存の `MediaErrorCode.NotOwned` を import して再利用（identity → media への新規依存）
3. 既存の `PublicationErrorCode.MediaNotOwned` を import して再利用（identity → publication への依存）

### Decision

案 1（`IdentityErrorCode` に追加）を採用する。

理由:
- Issue #82 ADR-004 で「複数ドメインに同値が定義されている状態」は既に容認されており、追加 1 ドメインも同じ思想で扱える
- ドメイン間依存を増やさない（identity → media / publication への新規依存を導入しない方が、Hexagonal の依存方向制約に対して安全）
- 呼び出しサイト（updateProfile.ts）と同一ドメインの `*ErrorCode` を使うのが最も読みやすい

### Consequences

- **良い点:**
  - identity usecase が他ドメインの error code 定数に依存しない
  - Issue #82 ADR-004 の方針延長線上で説明可能
- **トレードオフ:**
  - 同じ value を持つ property が 4 ドメインに分散（`Media` / `Note` / `Publication` / `Identity`）。重複自体は code 値の意味論が呼び出し元ドメインに依存しないため許容範囲
  - `errorCodeNaming.test.ts` で「重複検出ロジック」を追加する場合は本ケースを明示的に例外扱いする必要がある（現状の test はそこまで検証していないため影響なし）

---

## ADR-004: identity の token_* は `IdentityErrorCode` に追加し、prefix 無しを採用する

### Status
Proposed

### Context

`challenge.ts` の `challengeErrorToBusinessRule` は `VerificationChallenge.consume` の `ChallengeError` を `BusinessRuleError<...>` に翻訳する関数。spec/usecases/identity.md と spec/testcases/identity/index.md では token 系エラーは prefix 無しの `token_not_found` / `token_expired` / `token_consumed` / `token_purpose_mismatch` として記述されている。

選択肢:
1. `IdentityErrorCode` に `TokenNotFound` / `TokenExpired` / `TokenConsumed` / `TokenPurposeMismatch` を追加し、value は spec verbatim（prefix 無し）
2. 専用の `ChallengeErrorCode` を新設
3. `identity_token_*` のように prefix 強制を適用

### Decision

案 1 を採用する。value は spec verbatim の prefix 無し（`token_not_found` 等）。

理由:
- Issue #82 ADR-001 / ADR-002 で「spec 文言 verbatim」と「prefix の強制統一はしない」が決定済み
- 既存 `IdentityErrorCode` には `challenge_invalid_purpose` のように一部 challenge 関連 code が既に同居しており、token 系も同居させるのが整合的
- `ChallengeErrorCode` を新設すると `EXPECTED_ERROR_CODE_NAMES` への追加 + 新 module 作成のコストが発生し、得られる凝集性が小さい（token は VerificationChallenge の操作結果に限定）

### Consequences

- **良い点:**
  - spec verbatim 一致
  - identity 内の challenge 関連 code が単一モジュールに集約される
  - 既存 frontend 比較（`error.code === "token_not_found"` 等）が value 不変で動作継続
- **トレードオフ:**
  - `IdentityErrorCode` のサイズが 4 property 増える（35 → 40 property）。可読性の観点では受容範囲
