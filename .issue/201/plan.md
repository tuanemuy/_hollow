# 実装計画 — Issue #201: フォームのエラー UX 改善 (入力保持・エラー内容の明瞭化)

**Issue:** #201
**作成日:** 2026-05-30
**複雑度:** 中〜大規模

---

## 目的

`AdminSignUpForm` / `SignUpForm` に対して、(1) React 19 の `<form action>` リセットで失われる入力値を保持し、(2) エラー内容（validation / conflict / business）をユーザーに明瞭に伝える。UI 表現は #198 で確定したデザイン（`spec/design/pages/P01-signup.html`, `P01b-admin-setup.html` のエラー状態バリアント）に従う。横展開は別 Issue。

## スコープ

### 含まれるもの

- `app/components/auth/AdminSignUpForm/index.tsx` / `SignUpForm/index.tsx` の入力保持実装
- `app/core/presentation/errorDisplay.ts` の `formatFieldErrors` 整形改善
- ユースケース層（`adminSignUp` / `signUp`）での `username_taken` / `email_taken` の field 紐付き validation 変換
- `app/components/auth/schema.ts` の Zod 日本語メッセージ付与（validation 文言の日本語化 = #198 申し送り）
- 値オブジェクト構築失敗の business code を `errorDisplay.ts` に明示マッピング追加（fallback 文言回避）
- #198 モック準拠の JSX 整形（aria-describedby 補強含む）

### 含まれないもの

- 他フォーム（PasswordReset 系、Profile、Security、Admin 設定、Tag、Publication 等）の横展開 — 別 Issue
- エラー UI のビジュアル設計 — #198 で完了済み
- セキュリティ上意図的に曖昧化している箇所（`unknown` / `system` のメッセージ、ログイン失敗の判別）

## 重複検出の2系統（本 Issue の本質的論点）

ユースケースは insert の前に `IdentityService.assertUsernameAvailable` / `assertEmailAvailable` を呼び、`BusinessRuleError("username_taken"/"email_taken")`（`kind:"business"`）を**先に** throw する。

- **通常パス（business / 先出し assert）**: code `username_taken` / `email_taken` は `renderBusinessMessage` の明示マッピングに無く、現状 fallback「操作を完了できませんでした。時間をおいて再度お試しください」が出る → **衝突であることすら伝わらない**。
- **race パス（DB UNIQUE 制約由来）**: assert をすり抜けた場合のみ `ConflictError("UNIQUE_VIOLATION")`（`kind:"conflict"`）→「すでに登録されています」。

Issue が想定する「UNIQUE_VIOLATION → すでに登録されています」は後者のみ。通常は前者。**通常パスを field 付き validation に収束させるのが本質的改善。**

## 実装ステップ

### 1. 入力保持（FormState 拡張＋defaultValue 復元）

- **対象ファイル:** `app/components/auth/AdminSignUpForm/index.tsx`, `app/components/auth/SignUpForm/index.tsx`
- **変更内容:**
  - `FormState` に `values` を追加: `{ error: SerializedError | null; success: boolean; values: { username: string; email: string; displayName: string; acceptTerms: boolean } }`（AdminSignUpForm も同形、`setupToken` は含めない）。`initialState.values` は空文字 / false。
  - action 内で `formData` から各値を取り出し、成功時・失敗時とも `values` を返す（型を満たすため）。`password` / `setupToken` は `values` に入れない。
  - 各 input に `defaultValue={state.values.username}` 等を付与。`acceptTerms` は `defaultChecked={state.values.acceptTerms}`。password / setupToken input には `defaultValue` を付けない。
- **理由:** React 19 `<form action>` の uncontrolled リセット対策。`LoginForm` と同一パターン。機微フィールド除外は漏えい / 誤送信リスク回避（ADR-001）。

### 2. validation サマリ整形（field キー露出の除去）

- **対象ファイル:** `app/core/presentation/errorDisplay.ts` の `formatFieldErrors`
- **変更内容:** `parts.push(field ? \`${field}: ${first}\` : first)` を `parts.push(first)` に変更し、メッセージのみを `" / "` 結合。field 紐付けはフォーム側 `fieldErrorOf` の field 直下表示で担保済み。
- **理由:** 英語キー（`username:` 等）の露出除去。
- **影響:** `errorDisplay.test.ts` の該当アサーション更新。呼び出し箇所を grep し、field 直下表示を持たないフォームへの回帰を確認。

### 3. `SerializedValidationError` 型の移設（循環依存回避・ステップ4の前提）

- **対象ファイル:** `app/core/application/errors/index.ts`, `app/core/presentation/errorResponse.ts`, `app/core/presentation/validator.ts`
- **変更内容:** 現状 presentation の `errorResponse.ts` に定義されている `SerializedValidationError` を `application/errors/index.ts` へ移設。`errorResponse.ts`（union 構成）と `validator.ts`（`InputValidationError`）はそこから import するよう差し替える。既存の各層自前定義パターン（`SerializedConflictError` 等）に揃える。
- **理由:** 次ステップでアプリ層 `ValidationError` がこの型を返すため、presentation に定義したままだと presentation⇄application の循環 import になる。詳細は ADR-004。

### 4. conflict（username_taken / email_taken）の field 紐付け — ユースケース層で変換

- **対象ファイル:** `app/core/application/identity/adminSignUp.ts`, `signUp.ts`, `app/core/application/errors/index.ts`（新 `ValidationError` 型）
- **変更内容:**
  - アプリ層に field 付き validation を生む `ValidationError`（`ApplicationError` 派生、`toSerialized(): SerializedValidationError`、`fieldErrors` 保持）を新設。serialized 形は presentation の private `InputValidationError` と一致させ、UI 側 `fieldErrorOf` がそのまま機能するようにする。
  - `adminSignUp` / `signUp` で `assertUsernameAvailable` / `assertEmailAvailable` を try/catch し、`BusinessRuleError` の code が `username_taken` / `email_taken` のとき `ValidationError({ username: ["すでに登録されています"] })` / `({ email: ["すでに登録されています"] })` に変換して throw（文言は #198 モック準拠、ADR-002）。
  - race 由来の `ConflictError("UNIQUE_VIOLATION")` はどの列か判別不能なため field 無し（既存 conflict 表示のまま）。ADR-002 で扱う。
  - `changeUsername` / `requestEmailChange` / `verifyEmailChange` の `username_taken` / `email_taken` は**変換せず business のまま据え置く**（スコープ外、ADR-002 注記）。
- **理由:** 通常パスの fallback 文言を解消し、衝突フィールドを field 直下に赤表示。Issue 本文が「conflict→validation 変換はアプリ層で行う」と明示許可。

### 5. validation 文言の日本語化（Zod message 付与）＋ business code マッピング

- **対象ファイル:** `app/components/auth/schema.ts`, `app/core/presentation/errorDisplay.ts`
- **変更内容:**
  - `signUpSchema` / `adminSignUpSchema` の各ルールに日本語 `message` を付与（`.email({ message: ... })`、`.min(..., { message: ... })` 等）。`passwordResetConfirmSchema` の前例に倣う。
  - 値オブジェクト構築失敗（`username_invalid` / `username_reserved` / `password_insufficient_variety` 等）は transport を通過し得る business 不変条件。transport では完全に潰さず（2点検証原則）、UI に出る可能性のある identity business code を `renderBusinessMessage` に明示マッピング追加して fallback を回避。
- **理由:** Zod デフォルト英語の解消（#198 申し送り）。責任分界は ADR-003 で明確化し二重検査を防ぐ。

### 6. UI 反映（#198 モック準拠＋aria 補強）

- **対象ファイル:** `AdminSignUpForm/index.tsx`, `SignUpForm/index.tsx`, 必要に応じ `app/components/auth/styles.ts`
- **変更内容:**
  - ステップ4で error が `kind:"validation"` 化されるため、既存の field 直下表示ロジックがそのまま username / email 衝突を赤表示。JSX 追加は最小。
  - field hint span に `id`、input に `aria-describedby` を付与（読み上げ精度向上、#198 申し送り）。
  - 既存 `data-error` / `aria-invalid` パターン、`FIELD_HINT` / `FIELD_HINT_ERROR` / `FORM_ERROR` を踏襲。新規 CSS は作らない。
- **理由:** #198 確定モックへの忠実な反映。多くは既存ロジックの再利用。

### 7. 動作確認

- `manual-test` スキルで実機検証（testing.md 参照）。

> 注: 本 Issue のスコープは `AdminSignUpForm` / `SignUpForm` の2フォームに限定。`LoginForm`（P03）は「先行実装の参照」のみで対象外。#198 が P03 に投げた申し送り（unauthorized 合成文言調整等）は別 Issue / 対象外とする。

## 設計判断

詳細は `adr.md` を参照。

- **論点A（validation 日本語化の場所）:** Zod スキーマに日本語 message 付与。`passwordResetConfirmSchema` の前例と整合し、「transport boundary=Zod」の1点に載せるだけで2点検証原則に忠実。
- **論点B（conflict の field 直下開示 vs 汎用 summary）:** あり版（field 直下開示）を採用 → **ADR-002**。サインアップはメール確認フロー必須で列挙の実害度が中程度、UX 改善便益が上回ると判断。緩和策を ADR に明記。
- **論点C（変換場所）:** ユースケース層で `username_taken` / `email_taken` business → 新 `ValidationError`（field 付き）に変換。Issue が明示許可。presentation に domain 知識を漏らさない。
- **論点D（formatFieldErrors 整形）:** メッセージのみ `" / "` 結合。ラベルは各フォームの `<label>` が持つため errorDisplay に辞書を二重化しない。
- **論点E（入力保持フィールド）:** `username` / `email` / `displayName` / `acceptTerms` を保持、`password` / `setupToken` は除外 → **ADR-001**。

## リスクと注意点

- **`formatFieldErrors` 変更の波及:** `errorDisplay.ts` は全レイヤーが利用。field 直下表示を持たないフォームで「キー無しメッセージ羅列」になり得る。実装前に呼び出し箇所を grep して回帰確認。
- **新 `ValidationError`（アプリ層）導入:** `kind:"validation"` を生む経路が presentation 専有でなくなる。`errorCodeNaming.test.ts`・serialized 契約・`redactForClient`（validation 素通り）と矛盾しないか確認。型の置き場所に注意。
- **2系統の収束漏れ:** race 時の `ConflictError("UNIQUE_VIOLATION")` は別経路で残る。ADR-002 で扱いを明示。
- **列挙攻撃:** あり版採用はセキュリティトレードオフ。ADR-002 必須。
- **2点検証の二重化:** ステップ4で transport message 強化と値オブジェクト検証が重なる領域。「Zod=形式 / 長さ / 必須、値オブジェクト=文字種 / 予約語 / 複雑度」と分界を ADR-003 に明記。
- **Styling 逸脱禁止:** 新規 CSS・`@apply` 禁止。既存トークン / styles.ts のみ。

## テスト方針

- **Unit:**
  - `errorDisplay.test.ts`: `formatFieldErrors` がキーを出さずメッセージのみ結合。追加した identity business code が日本語を返す。`username_taken` / `email_taken` を validation 化した結果が `fieldErrorOf` で拾える。
  - schema: `signUpSchema` / `adminSignUpSchema` の不正入力で日本語 message（`safeParse` の issues 検証）。
  - identity business code の明示マッピング追加分は、既存 Ingestion / Directory テストの「`EXPLICIT_*` 配列 + group(c) fallback 検証」パターンに倣い、明示マッピング集合 vs fallback 集合を網羅検証する（内部 code 露出を将来も防ぐ）。
- **Integration:** `identity.integration.test.ts`:
  - `signUp` の重複検出テスト（既存、`isBusinessRuleError` + `username_taken`/`email_taken` アサート）は **`kind:"validation"` + 該当 field の fieldErrors アサートへ書き換える（置換）**。
  - `adminSignUp` には現状 taken の重複検出テストが無い（setup token 系のみ）ため、**同等の重複検出テストを新規追加**（同じく validation/fieldErrors を検証）。
  - `changeUsername` / `requestEmailChange` / `verifyEmailChange` / `deleteAccount` の taken テストは business のまま据え置く（変換対象外）。成功フロー非回帰。
- **手動（manual-test）:** 入力保持（password / setupToken は消える）、username / email 衝突の field 直下赤表示、Setup Token 不一致の専用 callout、acceptTerms 未チェック復元、成功フロー非回帰、aria-describedby 読み上げ。

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスク の2視点並列）

**修正した点（要修正 P）:**
- [arch P-001] `SerializedValidationError` の型移設を独立ステップ（新ステップ3）に起こし、ADR-004 に循環依存回避の決定を明記。`errorResponse.ts` / `validator.ts` の import 差し替えを計画に追加。
- [arch P-002] integration テストが「拡張」ではなく「置換」である点をテスト方針に明記。`signUp` / `adminSignUp` の taken テストは validation/fieldErrors へ書き換え、他3ユースケースは business 据え置きと線引きを記載。

**取り込んだ改善提案 S:**
- [req S-001] `LoginForm`（P03）と P03 申し送りが本 Issue 対象外であることをステップ7末尾に明記。
- [req S-002] conflict の確定文言を #198 モック (c) の「すでに登録されています」に統一（ADR-002）。
- [arch S-001] `username_taken` / `email_taken` を共有する他3ユースケースを business 据え置き・横展開 Issue 対象と ADR-002 に注記。
- [arch S-002] email 形式の Zod / 値オブジェクト二重化を意図的多層防御として ADR-003 に明記。
- [arch S-003] identity business code マッピング追加分のテストを既存 `EXPLICIT_*` + group(c) パターンに揃える旨をテスト方針に追加。

**見送った提案:** なし（全件取り込み）。

要件カバレッジ視点は初回から「問題点ゼロ」。アーキ視点の P-001 / P-002 は計画・ADR への追記で解消済み。

### 2周目（アーキ視点で収束確認）

- アーキ視点が P-001 / P-002 の解消を実コードと照合して確認、「問題点ゼロ」。
- 軽微な文言ズレ（adminSignUp のテストは「置換」でなく「新規追加」）を1点指摘 → テスト方針を修正済み。
- **両視点とも問題点ゼロで終了。**

