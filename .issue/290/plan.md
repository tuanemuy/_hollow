# 実装計画 — Issue #290: ディレクトリ作成時の business error 文言が「エラーが発生しました」のみ

**Issue:** #290
**作成日:** 2026-05-30
**複雑度:** 小規模

---

## 目的

`CreateDirectoryDialog`（および同じエラー表示経路を通る rename / move / delete 系ディレクトリダイアログ）でディレクトリ操作の business エラーが発生したとき、ダイアログ内に具体的な日本語メッセージを表示する。現状は generic な fallback（「操作を完了できませんでした。時間をおいて再度お試しください」＝ business fallback、報告時点では「エラーが発生しました」相当）しか出ず、ユーザーが原因を特定できない。

## 原因分析（確定）

エラーの serialization 経路は正常に機能している:

1. ドメイン層が `BusinessRuleError(DirectoryErrorCode.NameConflict, ...)` 等を throw（`app/core/domain/directory/`）
2. `errorResponseMiddleware` → `serializeError` で `kind: "business"`, `code: "directory_name_conflict"` として正しく serialize
3. `appServerErrorAdapter` 経由で client に伝播、`extractSerializedError` が business kind を保持
4. `renderErrorMessage` → `renderBusinessMessage(code)` に到達

**根本原因:** `app/core/presentation/errorDisplay.ts` の `renderBusinessMessage` に **directory 系 code のマッピングが存在しない**ため、`BUSINESS_FALLBACK_MESSAGE`（generic）に落ちる。ingestion 系には `renderIngestionBusinessMessage` という専用マッピング関数があるが、directory 系には同等のものがない。

### 各再現ケースの実際の挙動

- **兄弟名重複** (`directory_name_conflict`): validation 通過 → domain で business throw → マッピング無し → generic fallback。**← 本Issueの主対象**
- **深さ上限** (`directory_too_deep`): 同上 → generic fallback。**← 本Issueの主対象**
- **禁止文字** (`a/b` 等): transport schema (`directoryNameSchema.regex`) が先に弾き、`validation` kind の field error として「使用できない文字が含まれています」を表示する（`formatFieldErrors` 経由）。ただし `name: ` という英語フィールド名プレフィックスが付く。business 経路（rename 等、value-object 構築由来）に流れた場合は generic fallback になりうる。

## スコープ

### 含まれるもの

- `errorDisplay.ts` に directory 系 business code → 日本語メッセージのマッピングを追加（ingestion パターンに倣い `renderDirectoryBusinessMessage` 関数を新設し `renderBusinessMessage` から呼ぶ）
- ユーザー操作で到達しうる directory code を網羅（create / rename / move / delete 全ダイアログが同じ経路を共有するため一括で改善される）
- `errorDisplay.test.ts` に directory code のマッピングテストを追加

### 含まれないもの

- validation field error のフィールド名プレフィックス（`name: `）の日本語化・除去 — これは別経路（`formatFieldErrors`）の課題で、directory に限らない横断的改善。本Issueの意図（business エラーの具体化）の範囲外。気になる規模なら別Issue化を検討。
- ダイアログ側（`CreateDirectoryDialog.tsx` 等）の変更 — エラー受け取り・表示経路は正しく機能しており変更不要。
- serialization 経路（`errorResponseMiddleware` / `serializeError` 等）の変更 — 正常動作を確認済み。

## 実装ステップ

### 1. directory 系 business code のマッピング関数を追加

- **対象ファイル:** `app/core/presentation/errorDisplay.ts`
- **変更内容:** `renderIngestionBusinessMessage` の直後に `renderDirectoryBusinessMessage(code: string): string | null` を新設。`DirectoryErrorCode`（`app/core/domain/directory/errorCode.ts`）のうちユーザー操作で到達しうる code を日本語メッセージにマッピングする:
  - `directory_name_conflict` → 「同名のディレクトリが既に存在します」
  - `directory_too_deep` → 「ディレクトリの階層が深すぎます（最大10階層まで）」
  - `directory_name_forbidden_character` → 「使用できない文字が含まれています」
  - `directory_name_empty` → 「ディレクトリ名を入力してください」
  - `directory_name_too_long` → 「ディレクトリ名が長すぎます（80文字以内で入力してください）」
  - `directory_cyclic_move` → 「移動先が不正です。自分自身またはその子孫には移動できません」
  - `cannot_rename_root` → 「ルートディレクトリの名前は変更できません」
  - `cannot_delete_root` → 「ルートディレクトリは削除できません」
  - `cannot_move_root` → 「ルートディレクトリは移動できません」
  - 上記以外（`directory_invalid_id` 等の内部不変条件違反）は `null` を返し fallback に委ねる（内部 code が UI に漏れないことが最終防衛線、ADR-008 の方針を踏襲）
- **理由:** business kind の directory code に対する具体メッセージが存在しないため。専用関数に分けるのは ingestion 系と同じ構造を踏襲し、ドメインごとに責務を分離するため。

### 2. `renderBusinessMessage` から呼び出す

- **対象ファイル:** `app/core/presentation/errorDisplay.ts`
- **変更内容:** `renderBusinessMessage` 内で `renderIngestionBusinessMessage` を呼ぶ箇所と同様に、`renderDirectoryBusinessMessage(code)` を呼び、non-null なら返す。fallback への落とし込み順序は ingestion の後に追加。
- **理由:** business kind の振り分けロジックの単一窓口が `renderBusinessMessage` のため。

### 3. テスト追加

- **対象ファイル:** `app/core/presentation/__tests__/errorDisplay.test.ts`
- **変更内容:** directory code（マッピング対象）が business kind で具体メッセージを返し、generic fallback でも raw code でもないことを検証する `it.each` を追加。マッピング外の内部 code は fallback を返し raw code を leak しないことも確認。
- **理由:** マッピングの回帰を防ぎ、内部 code 非 leak の不変条件を保証するため。

## 設計判断

- マッピングは ingestion 系（`renderIngestionBusinessMessage`）と同じく**ドメイン別の専用関数**に分離する。`renderBusinessMessage` に全 code をベタ書きすると肥大化し、ドメイン境界が曖昧になるため。
- 到達不能な内部不変条件 code は明示的にマッピングせず fallback に委ねる。UI 文言を不必要に増やさず、内部 code の非 leak を最終防衛線で担保する（既存の ingestion group (c) と同じ思想）。

## リスクと注意点

- **`*ErrorCode` naming 規約**（CLAUDE.md）: `DirectoryErrorCode` の値（`directory_name_conflict` 等）は既存で確定しており、本変更では errorDisplay 側で**文字列リテラルを参照するのみ**。code 定義自体は変更しないため `errorCodeNaming.test.ts` への影響はない。マッピングの case 文字列は `DirectoryErrorCode` の値とタイポなく一致させること。
- 禁止文字ケースは多くの場合 validation kind で先に処理されるため、business マッピングの `directory_name_forbidden_character` は rename 経由など value-object 構築由来の場合の保険となる。
- ダイアログ側は変更しないため、既存の create/rename/move/delete の正常系には影響しない。

## テスト方針

- `pnpm test:unit`（`errorDisplay.test.ts`）でマッピングの単体検証。
- `pnpm typecheck && pnpm lint:fix && pnpm format`。
- ブラウザ検証（manual-test）で「兄弟名重複」「深さ上限」「禁止文字」の各ケースが具体メッセージを表示することを確認。
