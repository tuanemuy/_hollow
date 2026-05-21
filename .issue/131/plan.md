# 実装計画 — Issue #131: refactor: 定数化されていない BusinessRuleError リテラル直書きを *ErrorCode 定数化

**Issue:** #131
**作成日:** 2026-05-22
**複雑度:** 中〜大規模

---

## 目的

Issue #82（PR #129）で統一した `*ErrorCode` 命名規約（`lower_snake_case`）の対象外になっている、`BusinessRuleError("...")` リテラル直書き箇所を `*ErrorCode` 定数として整備し、呼び出し元を定数経由に置き換える。これにより `errorCodeNaming.test.ts` の網羅対象に含めて再発防止する。

## スコープ

### 含まれるもの

- 既知のリテラル直書き 4 箇所を `*ErrorCode` 定数に置換:
  - identity: `challenge.ts` の `token_not_found` / `token_expired` / `token_consumed` / `token_purpose_mismatch`
  - identity: `updateProfile.ts` の `media_not_owned`（3 箇所）
  - publication: `changePublicationVisibility.ts` / `issueShareLink.ts` / `listShareLinks.ts` の `note_trashed`
  - common: `version.ts` の `INVALID_VERSION` / `event.ts` の `INVALID_EVENT_ID`
- 定数の配置先判断（既存 `*ErrorCode` への追加 / 新規 `CommonErrorCode` の新設）
- `errorCodeNaming.test.ts` の `EXPECTED_ERROR_CODE_NAMES` への `CommonErrorCode` 追加

### 含まれないもの

- `*ErrorCode` 定数化を伴わないリテラル直書きの単純な lower_snake 化（Issue #82 のスコープ越え）
- `NoteErrorCode.AlreadyTrashed`（`"note_already_trashed"`）の重義性解消 — ADR-006 のとおり別 Issue で扱う
- 既存テスト内で `error.code === "token_*"` のように文字列リテラル直書きしている assertion を定数経由に置き換える sweep — 本 Issue は production code 側の定数化に集中
- frontend `error.code === "..."` 比較の定数化 — value 不変のため挙動不変

## 実装ステップ

### 1. `IdentityErrorCode` に token_* と MediaNotOwned property を追加

- **対象ファイル:** `app/core/domain/identity/errorCode.ts`
- **変更内容:** 末尾に以下を追加:
  ```ts
  TokenNotFound: "token_not_found",
  TokenExpired: "token_expired",
  TokenConsumed: "token_consumed",
  TokenPurposeMismatch: "token_purpose_mismatch",
  MediaNotOwned: "media_not_owned",
  ```
- **理由:** spec 文言は prefix なしで確定（`spec/usecases/identity.md`, `spec/testcases/identity/index.md`）。ADR-001 / ADR-002 に従い spec verbatim を採用。`media_not_owned` は ADR-004 に従い 4 ドメイン間で同値共有を容認（`Media`/`Note`/`Publication`/`Identity`）。identity usecase（VerifyEmail / ResetPassword / VerifyEmailChange / UpdateProfile）が呼び出すため `IdentityErrorCode` に置く。

### 2. `challenge.ts` を定数参照に置き換え

- **対象ファイル:** `app/core/application/identity/challenge.ts`
- **変更内容:**
  - `import { IdentityErrorCode } from "@/core/domain/identity/errorCode";` を追加
  - 戻り値型を `BusinessRuleError<typeof IdentityErrorCode.TokenNotFound | typeof IdentityErrorCode.TokenExpired | typeof IdentityErrorCode.TokenConsumed | typeof IdentityErrorCode.TokenPurposeMismatch>` に
  - 各 `new BusinessRuleError("token_*", ...)` を `new BusinessRuleError(IdentityErrorCode.Token*, ...)` に
- **理由:** 共通翻訳関数を定数経由に揃えることで、参照する 3 つの usecase（VerifyEmail / ResetPassword / VerifyEmailChange）が自動的に定数経由になる。

### 3. `updateProfile.ts` を定数参照に置き換え

- **対象ファイル:** `app/core/application/identity/updateProfile.ts`
- **変更内容:** `import { IdentityErrorCode } from "@/core/domain/identity/errorCode";` を追加し、3 箇所の `new BusinessRuleError("media_not_owned", ...)` を `new BusinessRuleError(IdentityErrorCode.MediaNotOwned, ...)` に置換。各メッセージ文字列は維持。
- **理由:** identity usecase 内で発生する media 所有検証なので呼び出しサイトと同一ドメインで識別子を所有する（ADR-004 で複数ドメイン同値共有を許容済み）。

### 4. `NoteErrorCode` に `Trashed` property を追加

- **対象ファイル:** `app/core/domain/note/errorCode.ts`
- **変更内容:** 末尾に `Trashed: "note_trashed",` を追加。`AlreadyTrashed: "note_already_trashed"` はそのまま維持。
- **理由:** spec 上で `note_trashed`（SaveNote / Rename / Publication 系）と `note_already_trashed`（DeleteNote）は別文言として並立。ADR-006 で「`note_trashed` を別 property として追加可能」と示唆。重義性の最終整理は別 Issue。

### 5. `publication` 配下 3 ファイルを定数参照に置き換え

- **対象ファイル:** `app/core/application/publication/{changePublicationVisibility,issueShareLink,listShareLinks}.ts`
- **変更内容:** 各ファイルに `import { NoteErrorCode } from "@/core/domain/note/errorCode";` を追加し、`new BusinessRuleError("note_trashed", ...)` を `new BusinessRuleError(NoteErrorCode.Trashed, ...)` に置換。メッセージ文字列は維持。
- **理由:** `note_trashed` はノートのドメイン制約（status !== "active"）。`NoteErrorCode` が識別子を所有するのが自然（ADR-002 「spec 文言のドメイン感」に整合）。

### 6. `CommonErrorCode` を新設

- **対象ファイル（新規）:** `app/core/domain/common/errorCode.ts`
- **変更内容:**
  ```ts
  export const CommonErrorCode = {
    InvalidVersion: "invalid_version",
    InvalidEventId: "invalid_event_id",
  } as const;
  export type CommonErrorCode =
    (typeof CommonErrorCode)[keyof typeof CommonErrorCode];
  ```
- **理由:** `Version` / `EventId` は domain common に置かれる共通プリミティブで、特定ドメインに帰属させると不自然。spec 文言が無いため ADR-002 のデフォルト（spec 文言なしの場合は適切な lower_snake）に従う。`common_` prefix は一般性に乏しいため value 側は prefix 無しを採用。詳細根拠は ADR-001（本 Issue）。

### 7. `version.ts` / `event.ts` を定数参照に置き換え

- **対象ファイル:** `app/core/domain/common/version.ts`, `app/core/domain/common/event.ts`
- **変更内容:**
  - 各ファイルで `import { CommonErrorCode } from "./errorCode";` を追加
  - `"INVALID_VERSION"` → `CommonErrorCode.InvalidVersion`
  - `"INVALID_EVENT_ID"` → `CommonErrorCode.InvalidEventId`
- **理由:** value も UPPER → lower_snake に変わり ADR-001（Issue #82）違反が解消。同一 common パッケージ内インポートで循環依存リスクなし。

### 8. `errorCodeNaming.test.ts` の `EXPECTED_ERROR_CODE_NAMES` に追加

- **対象ファイル:** `app/core/domain/__tests__/errorCodeNaming.test.ts`
- **変更内容:** Set に `"CommonErrorCode"` を追加（アルファベット順では `AdminSettingsErrorCode` の直後）。
- **理由:** ADR-005（Issue #82）の「ピン留め Set」運用に従い、新ドメイン追加を明示的に登録。

### 9. 既存テスト・spec との整合確認 & 残存リテラル最終チェック

- **対象:** `pnpm typecheck && pnpm lint:fix && pnpm format`、`pnpm test`
- **変更内容:**
  - Step 1-8 完了後に既存テスト（特に `Version.create(-1)` / `EventId.create("")` を発火させる箇所）が `INVALID_VERSION` / `INVALID_EVENT_ID` を assert していないか grep で確認。assert していれば `invalid_version` / `invalid_event_id` に追従。
  - integration テストの `error.code === "token_not_found"` / `"media_not_owned"` / `"note_trashed"` 等の assertion は value 不変のため挙動継続を確認のみ（定数経由化 sweep は本 Issue 外）。
  - production code 側に Issue 本文「既知の直書き箇所」8 値（`token_not_found` / `token_expired` / `token_consumed` / `token_purpose_mismatch` / `media_not_owned` / `note_trashed` / `INVALID_VERSION` / `INVALID_EVENT_ID`）の `new BusinessRuleError("...")` 直書きが残っていないかを最終 grep で確認。`app/core/{domain,application,adapters}/` 配下で 0 件を確証する。
- **理由:** UPPER → lower 値変更は ADR-001 の規約準拠のための副次効果だが、既存テストの assertion が壊れないことを確認。再発防止の確証を得るため、本 Issue クローズ前に「もう production にリテラル直書きが残っていない」状態を grep で示せる形にする（#82 のフォローアップ性質上、追加の再帰フォローアップを生まない締め切りが重要）。

## 設計判断

| リテラル | 配置先 | property key | value | 根拠 |
|---|---|---|---|---|
| `token_not_found` | `IdentityErrorCode` | `TokenNotFound` | `"token_not_found"` | spec verbatim, ADR-001/002 |
| `token_expired` | `IdentityErrorCode` | `TokenExpired` | `"token_expired"` | 同上 |
| `token_consumed` | `IdentityErrorCode` | `TokenConsumed` | `"token_consumed"` | 同上 |
| `token_purpose_mismatch` | `IdentityErrorCode` | `TokenPurposeMismatch` | `"token_purpose_mismatch"` | 同上 |
| `media_not_owned`（updateProfile） | `IdentityErrorCode` | `MediaNotOwned` | `"media_not_owned"` | ADR-004 で複数ドメイン共有容認 |
| `note_trashed`（publication 3 箇所） | `NoteErrorCode` | `Trashed` | `"note_trashed"` | spec で `note_` prefix 付き / Note 状態制約 |
| `INVALID_VERSION` | `CommonErrorCode`（新設） | `InvalidVersion` | `"invalid_version"` | spec 文言なし / prefix 無し採用 |
| `INVALID_EVENT_ID` | `CommonErrorCode`（新設） | `InvalidEventId` | `"invalid_event_id"` | 同上 |

詳細な根拠は `.issue/131/adr.md` を参照。

## リスクと注意点

- **既存 integration テスト**: `identity.integration.test.ts` 等で `error.code === "token_not_found"` 等の文字列リテラル直書き比較が複数箇所存在する可能性。value 不変のため失敗しない。本 Issue では production code 側のみ touch し、テストの文字列比較は維持（Issue 趣旨「定数化が伴う変更」スコープ内に絞る）。
- **frontend 比較**: `app/components/auth/{VerifyEmail,EmailChangeConfirm}/index.tsx` 等で `error.code === "token_*"` 比較がある可能性。value 不変のため動作不変。
- **循環依存リスク**: `common/errorCode.ts` は依存ゼロのモジュールとして新設し、`common/version.ts` / `common/event.ts` から同パッケージ内インポートのみで安全。
- **`errorCodeNaming.test.ts` の glob**: 新規ファイル `common/errorCode.ts` を自動発見するが、Set への追記を忘れると「discovers every expected」テストが失敗する → Step 8 必須。
- **`INVALID_VERSION` / `INVALID_EVENT_ID` の value 変更**: UPPER → lower_snake への変更は ADR-001 規約準拠が目的。これらが外部ログ / 監視ダッシュボード等で参照されている場合は別途追従が必要だが、本リポジトリは未本番稼働で driver / log 観測者がいないため副次影響なし。
- **想定漏れ**: 他に同じ value を文字列直書きしている箇所がないか念のため最終 grep（`token_not_found|token_expired|token_consumed|token_purpose_mismatch|note_trashed|INVALID_VERSION|INVALID_EVENT_ID`）。

## テスト方針

1. **`pnpm test app/core/domain/__tests__/errorCodeNaming.test.ts`** — 新 `CommonErrorCode` が glob/Set 双方で発見され、value が `VALUE_REGEX` 合格、key が `KEY_REGEX` 合格を確認
2. **`pnpm test:unit`** — 既存 domain / value object テストの回帰確認
3. **`pnpm test:integration`** — identity / publication / note の integration テストで `error.code` 比較が引き続き通ることを確認
4. **`pnpm typecheck && pnpm lint:fix && pnpm format`** — TypeScript / Biome 整合
5. **spec 文言整合性最終 grep** — 各 ErrorCode value が spec/{usecases,testcases}/ の `BusinessRuleError('...')` 文言と verbatim 一致しているか確認

挙動不変（value は spec 文言に揃え、新ドメイン追加のみ）のため manual-test での実機確認は不要。`.issue/131/testing.md` にその根拠を記載する。

## レビュー履歴

### 1周目: 両視点とも問題点ゼロで終了

**取り込んだ改善提案:**
- 視点1 [S-001] / 視点2 [S-001]: Step 9 の「整合確認」を「既存テスト・spec との整合確認 & 残存リテラル最終チェック」に拡張し、integration テストの value 不変確認と、Issue 本文「既知の直書き箇所」8 値の最終 grep 確認を明示化

**見送った提案とその理由:**
- 視点1 [S-002] / 視点2 [S-003]: 4 ドメイン分散（`media_not_owned`）と 2 ドメイン分散（`note_trashed`）の運用方針を testing.md に再掲 → 設計判断の根拠は ADR-003 / ADR-002 で記録済みであり、testing.md の役割と異なるため見送り
- 視点2 [S-002]: Phase 4 でフォローアップ Issue 起票責務を plan.md に明記 → Phase 4 の運用そのものであり計画ドキュメントに重ね書く必要なし。Phase 4 実施時に `NoteErrorCode.AlreadyTrashed` の重義性解消フォローアップを判断する
