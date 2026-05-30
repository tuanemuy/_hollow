# ADR — Issue #201: フォームのエラー UX 改善

## ADR-001: 入力保持フィールドの取捨選択

### Status
Proposed

### Context
React 19 の `<form action={fn}>` は action 完了後に uncontrolled な入力をリセットする。エラーで戻ったときに入力が全消失する。どのフィールドを `FormState` に保持して `defaultValue` / `defaultChecked` で復元するかを決める必要がある。機微フィールド（password / setupToken）を state に載せると、シリアライズ経路での漏えい・誤送信リスクがある。

### Decision
`username` / `email` / `displayName` / `acceptTerms` を `FormState.values` に保持して復元する。`password` / `setupToken` は**復元しない**（state に載せない）。`LoginForm` が email のみ復元し password を復元しない先行パターンと整合する。

### Consequences
- 良い点: 長い入力（Setup Token を除く）の再入力を回避。`acceptTerms` のチェック状態も復元され再操作不要。
- トレードオフ: password / setupToken はエラー後に再入力が必要。ただしセキュリティ上の必然であり許容。

---

## ADR-002: conflict（username / email 重複）の field 直下開示 — 列挙攻撃 vs UX

### Status
Proposed

### Context
サインアップで username / email が既存と衝突した際、現状は (通常パス) business fallback「操作を完了できませんでした…」または (race パス) 汎用 conflict「すでに登録されています」が出るのみで、どちらのフィールドが衝突したか分からない。#198 のデザインモックは「なし版（汎用 summary・現実装既定）」と「あり版（field 直下開示）」の両 UI を用意し、採否を本 Issue に委ねている。

field 直下開示は未認証の第三者にアカウント（username / email）の存在を教える**ユーザー列挙攻撃**のリスクを持つ。

### Decision
**あり版（field 直下開示）を採用する。** ユースケース層で `BusinessRuleError("username_taken"/"email_taken")` を field 付き `ValidationError` に変換し、衝突フィールド直下に赤エラーを表示する。

判断根拠:
- `signUp` / `adminSignUp` はいずれも**メール確認フロー必須**（`verificationChallenge.issue` → 確認メール送信、成功画面も「確認メールを送信しました」）。アカウント有効化には受信箱アクセスが必要で、存在が分かっても直ちに乗っ取りに繋がらず列挙の実害度は中程度。
- 「どちらが重複か分からず再入力を繰り返す」UX 劣化は確実。既存メールでの登録時に「このメールは登録済み」を示す一般的なサービスと同水準。

確定文言（#198 モック (c) の field hint「すでに登録されています」に合わせ、username / email とも統一）:
- username 衝突: field `username` 直下に **「すでに登録されています」**
- email 衝突: field `email` 直下に **「すでに登録されています」**

緩和策:
- メッセージは存在を断定しすぎない汎用表現「すでに登録されています」に留める（モック準拠かつ列挙時の情報量を最小化）。
- レート制限は既存ミドルウェアに委ねる。
- **race パス（`ConflictError("UNIQUE_VIOLATION")`）は対象列が判別不能なため field 紐付けせず**、既存の汎用 conflict 表示「すでに登録されています」を維持する。通常パス（assert 先出し）のみ field 化する。

### スコープ注記
`username_taken` / `email_taken` は `changeUsername` / `requestEmailChange` / `verifyEmailChange` でも throw されるが、本 Issue のスコープは signup 2 フォーム（`signUp` / `adminSignUp`）に限定。他ユースケースは business のまま据え置き、Profile / Security フォームの横展開は別 Issue で扱う。

### Consequences
- 良い点: 衝突フィールドが即座に分かり、再入力が最小化される。#198 の「あり版」モックに準拠。
- トレードオフ: username / email の存在が外部から推測可能になる（列挙リスク）。メール確認フローと緩和策で実害を抑える。signup だけ field 化される非対称が残るが、横展開 Issue で解消予定。

---

## ADR-003: transport boundary 検証と値オブジェクト検証の責任分界（2点検証の二重化防止）

### Status
Proposed

### Context
CLAUDE.md は入力検証を2点のみ（transport boundary=Zod、値オブジェクト構築）に限定している。validation 文言の日本語化（#198 申し送り）のため Zod スキーマに日本語 message を付与すると、文字種 / 予約語 / パスワード複雑度など値オブジェクト側が担う不変条件と検証範囲が重なりかねず、同一不変条件を両所で重複検査する二重化リスクがある。

### Decision
責任分界を以下に固定する:
- **Zod（transport boundary）**: 形式（email 形式）・長さ（min / max）・必須（min(1)）・型。ここに日本語 message を付与する。
- **値オブジェクト構築**: 文字種（username の英数字・ハイフン）・予約語（username_reserved）・パスワード複雑度（password_insufficient_variety）など business 不変条件。Zod では検査しない。

email 形式のみ Zod `.email()` と `EmailAddress.create` が両方 RFC 妥当性に触れうる（軽微な二重化）。これは **Zod が一次・値オブジェクトが最終防衛**という意図的な多層防御として許容する（同一不変条件の重複検査だが、片方は transport・片方は domain invariant という別責務）。`displayName` は Zod 側で `max + transform(null)` 済みで値オブジェクト未経由。

値オブジェクト構築失敗（business）は transport を通過し UI に到達し得る。これらを field 紐付き validation に変換すると2点検証が崩れるため**変換せず**、UI に出る可能性のある identity business code を `errorDisplay.ts` の `renderBusinessMessage` に明示マッピングして fallback 文言（「操作を完了できませんでした…」）を回避するに留める（field 紐付かない summary 表示を許容）。

### Consequences
- 良い点: 検証点が増えず CLAUDE.md の2点検証原則を維持。日本語化は Zod message の1箇所で完結。business code は summary で意味の通る文言になる。
- トレードオフ: 値オブジェクト由来の business エラーは field 直下ではなく summary 表示に留まる（username / email 重複のような conflict→validation 変換とは扱いが異なる）。この非対称性は許容する。

---

## ADR-004: `username_taken` / `email_taken` 変換のためのアプリ層 `ValidationError` 導入

### Status
Proposed

### Context
現状 `kind:"validation"` の `SerializedValidationError`（`fieldErrors` 付き）を生むのは presentation 層の private `InputValidationError`（`validator.ts`）のみ。ADR-002 で username / email 重複をユースケース層で field 付き validation に変換する方針を採るため、アプリ層から field 付き validation を throw する手段が必要になる。

### Decision
`app/core/application/errors/index.ts` に `ValidationError`（`ApplicationError` 派生、`fieldErrors` 保持、`toSerialized(): SerializedValidationError`）を新設する。serialized 形は presentation の `InputValidationError` と一致させ、UI 側 `fieldErrorOf` がそのまま機能するようにする。ユースケースはこの型を使い `username_taken` / `email_taken` business を field 付き validation に変換する。

**型の置き場所（循環依存回避・最重要）**: 現状 `SerializedValidationError` は presentation の `errorResponse.ts` に定義されており、`errorResponse.ts` 自身は `@/core/application/errors` から他の Serialized 型を import している（依存方向 presentation→application）。新 `ValidationError`（application 層）が `SerializedValidationError` を返すために presentation を import すると **presentation⇄application の循環 import** になる。

→ 既存パターン（`SerializedBusinessError` は `domain/error.ts`、`SerializedConflict/NotFound/...` は `application/errors/index.ts` に各層が自前定義し presentation が上流 import）に倣い、**`SerializedValidationError` を `application/errors/index.ts` へ移設**する。`errorResponse.ts`（union 構成）と `validator.ts`（`InputValidationError`）はそこから import する形に差し替える。これは独立タスクとして plan のステップに起こす。

### Consequences
- 良い点: presentation に domain 知識（どの code がどのフィールドか）を漏らさない。UI 既存ロジックを再利用できる。依存方向が presentation→application の一方向に保たれる。
- トレードオフ: `kind:"validation"` を生む経路が presentation 専有でなくなる。`SerializedValidationError` の移設で `errorResponse.ts` / `validator.ts` の import が変わる。`redactForClient`（validation 素通り）・`errorCodeNaming.test.ts`（domain の `errorCode.ts` のみ glob 対象なので application クラスは非干渉）・serialized 契約との整合は実装時に確認する。
