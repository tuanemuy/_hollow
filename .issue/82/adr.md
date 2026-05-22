# ADR — Issue #82: normalize ErrorCode naming convention

## ADR-001: `*ErrorCode` の値は `lower_snake_case` に統一する

### Status
Proposed

### Context
PR #81 review-001 Domain W-004 で `NoteErrorCode` 内の命名混在が指摘された。調査の結果、11 ドメインの `errorCode.ts` のうち 5 ドメイン（directory, export, identity, media, note）で UPPER_SNAKE / lower_snake / prefix 有無の混在を確認。`*ErrorCode` の値（文字列リテラル）の総数は **UPPER 158 件 / lower 36 件**。

一方、spec/testcases/, spec/usecases/, spec/domains/ の `BusinessRuleError('...')` 文字列リテラルは **全件 lower_snake**（UPPER は 0 件）。

統一方針の選択肢:
1. spec 文言一致の `lower_snake_case` に統一（コード側 158 件を書き換え、spec は不変）
2. `UPPER_SNAKE_WITH_PREFIX` に統一（spec 全件＋frontend hard-coded 比較＋テスト多数を書き換え）

### Decision
案 1（`lower_snake_case` への統一）を採用する。

理由:
1. **spec が SSOT として既に lower_snake で揃っており、コードを spec に追従させる方が変更が片方向に閉じる**。逆方向（spec を UPPER に揃える）は spec 文書多数 + frontend `error.code === "token_*"` 比較 + テストの広範囲書き換えを要する。
2. `.issue/42/adr.md` ADR-004 で `SlugConflict: "slug_conflict"` を「spec 文言リテラル一致を優先」して採用した方針と整合的。本 ADR はその拡張。
3. property key（左辺 `NoteErrorCode.InvalidId` 等）は不変のため、呼び出し側（domain / application / test）の 700+ 箇所のソースを 1 行も変更せずに済む。
4. presentation 層は `code` 値を構造的にしか扱わず、UPPER_SNAKE 依存は driver-level conflict code（`OPTIMISTIC_LOCK_FAILURE` 等の `SystemErrorCode`）に閉じているため、business code を lower 化しても driver code と命名スタイルで区別できるメリットがある。

### Consequences
- 良い点:
  - spec とコードの SSOT 整合性が回復する
  - 新規 ErrorCode 追加時の判断負荷が解消する
  - 規約違反を `errorCodeNaming.test.ts`（ADR-005）で機械的に検知できる
- トレードオフ:
  - 11 ドメインの errorCode.ts で 158 件の文字列リテラル書き換えが必要
  - UPPER_SNAKE 文字列を直接 assert しているテストは追従修正が必要（grep で全件検出）
  - 本番運用前に外部ログ・監視ダッシュボードでの依存があれば同時同期が必要（現時点では未確認）
  - **R6（レビュー P-003 反映）**: `ingestion_jobs.error_code` / `export_jobs.error_code` 列に `*ErrorCode` の value がそのまま永続化されている（`schema.ts:464,558`, `runIngestionJob.ts:154`）。本リポジトリは未本番稼働の前提だが、ローカル開発の seed や CI fixture に旧値が混入している可能性があるため、test fixture と seed を Step 5 で確認する

### Scope clarification on "spec 文言との整合"（レビュー P-002 反映）

Issue 本文の「spec 文言との整合（`spec/testcases/*/index.md`）も考慮する」の意味は、以下に限定する:

- **対象**: 現状 `*ErrorCode` 定数として存在する value を、対応する spec 文言があれば spec 文言に揃える
- **対象外**: spec に存在するが `*ErrorCode` 定数として未登録の文言（`note_trashed`, `unsupported_format`, `size_exceeded`, `content_too_large`, `invalid_status_for_*`, `visibility_private` 等）の定数化は別 Issue で扱う

これは ADR-006 で「リテラル直書きの定数化は別 Issue」とした方針と整合的。Issue 動機の「spec 文言と実装値の対称性」のうち、定数経由部分の対称性を本 Issue で回復し、未定数化部分は別 Issue でフォローする 2 段階アプローチ。

---

## ADR-002: prefix の有無は spec 文言を踏襲し、強制統一しない

### Status
Proposed

### Context
ADR-001 で lower_snake 化を決定した後も、prefix の扱いに 2 つの選択肢がある:
1. 全 ErrorCode に `{domain}_` プレフィックスを強制（例: `slug_conflict` → `note_slug_conflict`、`edit_locked_by_other` → `note_edit_locked_by_other`）
2. spec が prefix なしで定めているものはそのまま維持

spec 側を grep した結果、prefix の有無は spec ごとに揺らぐ:
- prefix あり: `note_already_trashed`, `directory_too_deep`, `export_quota_exceeded`, `tag_name_conflict`, `saved_view_name_conflict` など
- prefix なし: `slug_conflict`, `edit_locked_by_other`, `cannot_rename_root`, `cannot_delete_root`, `cannot_move_root`, `already_deleted`, `last_admin_protected`, `confirmation_mismatch`, `media_not_owned`（ただし media_ プレフィックス相当）など

### Decision
案 2（spec 文言を踏襲し、強制統一しない）を採用する。

prefix の規則:
- spec に該当文言が存在する場合、**spec 文言をそのまま採用**（prefix の有無は spec のまま）
- spec に該当文言が無い ErrorCode のみ、`{domain}_{snake_case_of_property_key}` をデフォルトとする

### Consequences
- 良い点:
  - spec を SSOT として一貫尊重できる
  - 既存の lower_snake 値（`slug_conflict`, `edit_locked_by_other` 等）を温存でき、変更範囲を最小化
  - `.issue/42/adr.md` ADR-004 の判断（spec 文言一致優先）を否定しなくて済む
- トレードオフ:
  - prefix 強制統一が実現しないため「ドメイン名でフィルタする」運用は限定的
  - 将来 prefix を強制したい場合は spec 文言の刷新を伴う別 Issue が必要

---

## ADR-003: `SystemErrorCode` は本 Issue のスコープ外

### Status
Proposed

### Context
`app/core/application/errors/index.ts` の `SystemErrorCode`（`OPTIMISTIC_LOCK_FAILURE`, `UNIQUE_VIOLATION`, `FOREIGN_KEY_VIOLATION` 等）は UPPER_SNAKE で記述されている。これらは driver-level conflict code として `errorDisplay.ts` の `renderConflictMessage` で UPPER 値を見て分岐する。

### Decision
`SystemErrorCode` は本 Issue のスコープ外とし、UPPER_SNAKE のまま温存する。

### Consequences
- 良い点:
  - business code（lower_snake）と driver-level conflict code（UPPER_SNAKE）が命名スタイルで分離され、運用上の意味が明確になる
  - `errorDisplay.ts` の比較ロジックを触らずに済む
- トレードオフ:
  - 命名スタイルが完全に統一されるわけではない（business と driver で別系統）
  - 将来 `SystemErrorCode` も lower 化したい場合は別 Issue が必要

---

## ADR-004: `PublicationErrorCode.MediaNotOwned` は `"media_not_owned"` に統一する（異ドメイン値重複の容認）

### Status
Proposed

### Context
`PublicationErrorCode.MediaNotOwned` は現状 `"PUBLICATION_MEDIA_NOT_OWNED"` だが、spec/domains/publication.md の `BusinessRuleError('media_not_owned')` は `"media_not_owned"` を要求している。`MediaErrorCode.NotOwned` および `NoteErrorCode.MediaNotOwned` も同じ意味で `"media_not_owned"` を使う設計。

選択肢:
1. spec 文言に一致させ、`PublicationErrorCode.MediaNotOwned = "media_not_owned"` に変更（3 ドメインで同値を共有）
2. ドメイン重複を避け、`PublicationErrorCode.MediaNotOwned = "publication_media_not_owned"` に書き換え（spec も同時更新）

### Decision
案 1 を採用。`PublicationErrorCode.MediaNotOwned` を `"media_not_owned"` に統一し、3 ドメイン間で同じ文字列リテラルを共有することを容認する。

### Consequences
- 良い点:
  - spec 文言と完全一致し、SSOT 整合性が保たれる
  - 「media が not owned」という意味は呼び出し元ドメインに依存しない不変の意味であり、共通コードを共有する設計は意味論的に自然
  - TypeScript の property key 経由参照（`PublicationErrorCode.MediaNotOwned`）で型レベルでは区別可能なため、取り違えリスクは無い
- トレードオフ:
  - 「`code` 値だけ見て送信元ドメインを判別する」運用はできない（本リポではそのような利用箇所は確認できなかった）
  - 同じ文字列リテラルが複数ドメインに定義されている状態が `errorCodeNaming.test.ts`（ADR-005）で重複検出ロジックを書く際の例外として明示が必要

---

## ADR-005: 再発防止は単体テスト（`errorCodeNaming.test.ts`）で行う

### Status
Proposed

### Context
ADR-001 / ADR-002 で命名規約を定めた後、将来の追加で再び混在が起きるのを防ぐ仕組みが必要。

選択肢:
1. Biome のカスタムルールで命名違反を検出
2. 単体テストで全 ErrorCode を走査し、正規表現で検証

### Decision
案 2（単体テスト）を採用する。

`app/core/domain/__tests__/errorCodeNaming.test.ts` を新規追加し、以下を検証:
- 全 ErrorCode の **value** が `/^[a-z][a-z0-9_]*$/` にマッチ
- 全 ErrorCode の **key** が `/^[A-Z][A-Za-z0-9]*$/` にマッチ（PascalCase）

`SystemErrorCode`（UPPER_SNAKE）は対象外として除外する。

### Consequences
- 良い点:
  - 命名違反が `pnpm test` で即座に検出される
  - Biome カスタムルールより学習コスト・保守コストが低い
  - レビュー時の判断根拠も明確
- トレードオフ:
  - test ファイルの import が増えるため、新ドメインを追加した場合は本 test にも追記が必要（テストの追記漏れがあると検知漏れになる可能性）

---

## ADR-006: 定数化されていない `BusinessRuleError("...")` リテラル直書きは本 Issue スコープ外（既知の不整合を含む）

### Status
Proposed

### Context
`*ErrorCode` 定数経由ではない `BusinessRuleError("...")` リテラル直書きが複数存在する。レビュー S-005 で発見された分も含めて列挙:

- **identity**: `app/core/application/identity/challenge.ts` の `"token_not_found" / "token_expired" / "token_consumed" / "token_purpose_mismatch"` / `app/core/application/identity/updateProfile.ts` の `"media_not_owned"` リテラル直書き 3 箇所
- **publication**: `app/core/application/publication/changePublicationVisibility.ts:63` / `issueShareLink.ts:66` / `listShareLinks.ts:38` の `"note_trashed"` リテラル直書き
- **共通**: `app/core/domain/common/version.ts:17` の `"INVALID_VERSION"` / `app/core/domain/common/event.ts:13` の `"INVALID_EVENT_ID"`

加えて、**`*ErrorCode` 定数経由だが spec 文言の重義性を持つ**ケース（レビュー P-002 で発見）:

- `NoteErrorCode.AlreadyTrashed = "note_already_trashed"`: DeleteNote spec の `'note_already_trashed'` と一致する一方、SaveNote / RenameNote spec の `'note_trashed'` とは食い違う。後者は上記 publication のリテラル直書きで現状埋められている

### Decision
本 Issue では以下のスタンスを取る:

1. **`*ErrorCode` 定数経由でないリテラル直書き** は touch しない
2. **`NoteErrorCode.AlreadyTrashed` の重義性** は既存値（`"note_already_trashed"`）を維持。`note_trashed` を別 property として追加 + 該当 usecase の定数化は別 Issue
3. **`INVALID_VERSION` / `INVALID_EVENT_ID`**: ADR-001 の lower_snake 規約に違反しているが、本 Issue では `*ErrorCode` 系統のみを統一対象とする

### Consequences
- 良い点:
  - Issue のスコープが明確に保たれる
  - 1 PR の変更量が制御可能な範囲に収まる
  - 既存不整合を ADR で明示することで「気づいた上でスコープ外」とできる（PR レビューと将来の spec-sync で同じ議論の再発を防ぐ）
- トレードオフ:
  - 一時的に「定数経由は lower、リテラル直書きは混在」の状態が残る
  - **フォローアップ必須**: 本 Issue Close 時に「BusinessRuleError リテラル直書きを定数化する」フォローアップ Issue を Phase 4 で起票する

---

## ADR-007: `PublicationErrorCode.ShareLinkRevoked` の値変更による副次的バグ修正を許容する

### Status
Proposed

### Context
レビュー P-004 で発見された既存バグ:

- `app/components/public/ShareLinkGate/index.tsx:73-76` で `state.error.code === "share_link_revoked"` を比較
- 一方 `PublicationErrorCode.ShareLinkRevoked` の現状値は `"PUBLICATION_SHARE_LINK_REVOKED"` で **現状一致していない**
- `resolveShareLink.ts:62` 経由でこのコードが投げられる場合、`ShareLinkGate` で revoked 表示が出ない（または別経路で動いている）状態

本 Issue で `PublicationErrorCode.ShareLinkRevoked` を `"share_link_revoked"` に lower 化すると、副次的にこのバグが修正される（フロントエンドの比較が一致するようになる）。

### Decision
本 Issue で副次的に修正されることを許容し、ADR / testing.md / PR 説明で「機能改善の副次効果」として明示する。

### Consequences
- 良い点:
  - 既存バグが修正される（spec 文言一致が回復することで意図された挙動になる）
  - frontend 比較が現状の spec 文言ベース実装に揃う
- トレードオフ:
  - 本 Issue は「純粋なリファクタリング」ではなく「挙動変化を含むリファクタリング」になる
  - manual-test で revoked share link 表示を実機確認する追加コストが発生
  - 同様の隠れた frontend/code 不整合が他にもあれば本 Issue で副次的に動き出す可能性 → testing.md の項目 6 で代表的なケースを確認
