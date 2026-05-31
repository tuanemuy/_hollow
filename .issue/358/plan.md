# 実装計画 — Issue #358: アップロード時のカスタムプロンプト入力欄: デフォルト（既定プロンプト）が何か分かるようにする

**Issue:** #358
**作成日:** 2026-05-31
**複雑度:** 中〜大規模

---

## 目的

アップロード（取り込み）モーダルの per-upload カスタムプロンプト入力欄に、未入力時に実際に適用される既定プロンプト（解決済みの値）と「既定を使用中 / この回だけ上書き」状態を可視化し、ユーザーが「空欄にしたら何が使われるか」を UI 上で把握できるようにする。

## スコープ

### 含まれるもの

- アップロードモーダル（`UploadDialog` の `SelectView`）の `structure` / `metadata` カスタムプロンプト欄に、解決済み既定プロンプトを placeholder + 折りたたみ全文表示で提示
- 「既定を使用中 / この回だけ上書き」状態の明示（入力欄の空 / 非空に応じて切替）
- 既定プロンプトが空文字（プロバイダ組み込み指示にフォールバック）のケースのフォールバック文言
- 既定値を取得して UI に渡す経路（application 層に read-only usecase 新設 → server function 経由 lazy fetch）
- P23（`PromptsForm`）/ P42 の「上書き中」バッジ・「既定値: …」ヒント体裁に揃える

### 含まれないもの

- per-upload 上書きの送信ロジック（`appendOverride`）や `promptResolver` の解決順自体の変更
- ingestion UI に上書き欄が無い `title` / `directory` purpose の表示（`SelectView` には `structurePrompt` / `metadataPrompt` の 2 欄しか存在せず、`readPromptOverride` も structure/metadata のみ扱うため、この 2 purpose に限定する）
- ユーザー設定画面（P23）や管理画面（P42）側の変更

## 実装ステップ

### 1. ingestion 用「解決済み既定プロンプト」read-only usecase を新設

- **対象ファイル:** `app/core/application/ingestion/getEffectiveIngestionPrompts.ts`（新規）
- **変更内容:** 既存 read usecase（`getUserPromptOverride` / `getInstancePromptDefaults`）と同じく入力を `actorUserId: string` で受ける。`structure` と `metadata` の 2 purpose について `promptResolver.resolveFor` を呼び、各 purpose の解決済みテキストと「ユーザー上書き有無（`isUserOverride`）」を返す DTO を組み立てる。出力例: `{ structure: { text, isUserOverride }, metadata: { text, isUserOverride } }`。
- **repository アクセスは UoW 経由・read-only:** `userPromptOverrideRepository` は `container` 直下に無く、`getUserPromptOverride` と同様 `container.unitOfWorkProvider.run(async ({ userPromptOverrideRepository }) => ...)` 経由でのみ取得できる。読み取りのみで、イベント収集（collectEvents）や書き込みはしない。
- **`isUserOverride` の述語（重要）:** resolver は user override を「entry が存在し **かつ** `entry.text.length > 0`」のときだけ採用する（`promptResolver.ts:89`）。`getUserPromptOverride` は template があれば無条件で `isOverridden: true` を立てるため、そのまま流用すると「override 行はあるが該当 purpose の text が空」のケースで resolver はインスタンス既定を返すのにバッジは「上書き中」になり、表示と実挙動が矛盾する。よって usecase 内で user override repository を読み、`entry !== undefined && entry.text.length > 0` を `isUserOverride` の真とする（resolver と同じ述語に揃える）。
- **UserId 型の取り違え注意:** `promptResolver.resolveFor` は `@/core/domain/identity/valueObject` の `UserId` を取り、user override repository（`findByOwner`）は `@/core/domain/adminSettings/valueObject` の `UserId` を取る。同名2 VO なので、`input.actorUserId: string` から各々 `UserId.create(...)` で構築する（取り違えると型エラー）。
- **理由:** presentation がアダプター（`promptResolver`）を直接呼べない制約下で、解決順（ADR の優先順位）を application 層に閉じ込めつつ「実際に使われる値」を 1 値で供給する。

### 2. 解決済み既定値を返す server function を追加

- **対象ファイル:** `app/components/ingestion/actions.ts`
- **変更内容:** `getEffectiveIngestionPromptsFn`（method: "GET", `errorResponseMiddleware`）を追加。`requireCurrentUser` → `loadServerDeps(() => import(".../getEffectiveIngestionPrompts"))` → usecase 実行 → 返却。actor はサーバー側で `requireCurrentUser` から解決するため transport 入力は無い。
- **入力なし GET は `inputValidator` を省略（確定）:** `app/components/note/actions.ts` の `getDirectoryTreeFn` が `inputValidator` を持たない GET server-fn の実働前例で、`UploadDialog` 自身が `useServerFn(getDirectoryTreeFn)` → 引数なし `await getTree()` で呼んでいる。新 fn も同型（GET・入力なし・`requireCurrentUser` で actor 解決）なので `inputValidator` を素直に省く（空スキーマ付与より1行少なく既存パターンに正確に一致）。
- **理由:** `getIngestionJobFn` 等と同じ server-fn パターン。ダイアログはグローバル mount で loader 経由の供給経路が無いため、server-fn lazy fetch が規約上正しい。

### 3. ダイアログ open 時に既定値を lazy fetch

- **対象ファイル:** `app/components/ingestion/UploadDialog.tsx`
- **変更内容:** `useServerFn(getEffectiveIngestionPromptsFn)` を追加。カスタムプロンプト欄（`SelectView` 内の `details` 折りたたみ）を**初めて開いたタイミング**（`details` の `onToggle` で open かつ未取得のとき）で fetch し、`resolvedDefaults` state（`{ structure, metadata } | null`）に格納。textarea は details 内にあり既定値表示も details を開かないと不要なため、ツリー遅延ロードと同じ「使う直前に取る」方針に揃う。失敗時はサイレントに既定表示を省くフォールバック。取得値を `SelectView`（または details 内）に渡す。
- **理由:** カスタムプロンプトを開かない大多数のケースで無駄リクエストを出さない（既存のツリー遅延ロードの哲学と一致）。失敗してもアップロード自体は阻害しない。

### 4. SelectView に既定値表示・状態バッジを追加

- **対象ファイル:** `app/components/ingestion/UploadDialog.tsx`（`SelectView`）
- **変更内容:** 各 textarea（構造化 / メタデータ）に対し、
  - `placeholder={resolvedDefaults?.structure.text}` を常時設定（PromptsForm と同じ手法、長文は冒頭のみ）。
  - 入力欄の状態ラベル: 入力が空なら「既定を使用中」、非空なら「この回だけ上書き」。PromptsForm の文言体裁に揃え、state は `data-*` 属性 + Tailwind variant で表現。
  - 既定全文を `details>summary`（「既定値を表示」）で折りたたみ表示。`isUserOverride` で「ユーザー設定で上書き中 / インスタンス既定」も示す。
  - **既定が空文字のときの文言が中心 UX:** `BUILTIN_PROMPT_DEFAULTS` は全 purpose `text: ""` であり、管理者がインスタンス既定を未設定 + ユーザー上書きも無い標準状態では `resolveFor` は空文字を返す。これは例外ではなく**最も頻度の高い表示ケース**になりうるため、フォールバック文言を主たる表示として確実に出す（これが無いと「開いても空でやはり分からない」となり Issue 未達）。文言は独自に作らず既存 SSOT に揃える — `app/core/domain/adminSettings/defaults.ts` の JSDoc が正規 UI コピーを **「LLM プロバイダの既定指示を使用」**（Issue #218 ADR-002）と明文化しているので、これを踏襲する。
  - 体裁は実装前に `app/components/identity/PromptsForm/index.tsx`（P23）と `spec/design/pages/P42-admin-prompts.html`（P42）の「上書き中バッジ・既定値ヒント」表現を参照して揃える。
- **理由:** Issue の「プレースホルダ常時 / 既定値トグル / 上書き状態の明示」を満たし、P23・P42 の体裁に合わせる。

### 5. テスト更新

- **対象ファイル:** `app/components/ingestion/__tests__/UploadDialog.test.tsx`、新 usecase の単体テスト
- **変更内容:** 新 server-fn `getEffectiveIngestionPromptsFn` を `vi.mock` に追加し、既定値表示・状態バッジ切替・空文字フォールバック・fetch 失敗時の継続性をテスト。usecase 単体は user override 有/無で解決値と `isUserOverride` が正しいか検証。
- **理由:** ダイアログテストは server-fn を全モックしているため、新 fn を足さないと import 解決で落ちる。

## 設計判断

詳細は `adr.md` を参照。

- 既定値供給経路: server function 経由の lazy fetch（グローバル mount のため loader 経由不可）
- 解決ロジックの置き場所: application 層に新 usecase（presentation からアダプター直呼び禁止）
- `isUserOverride` 導出: user override repository を参照して層を区別（P23 体裁との一致を優先）
- purpose スコープ: `structure` / `metadata` のみ

## リスクと注意点

- 既定プロンプトが空文字（組み込み指示フォールバック）のケースで placeholder/全文表示が空 → フォールバック文言の分岐が必要
- 既定プロンプトは長文（最大 16 KiB）になりうる → placeholder は冒頭のみ + 全文は `details` 折りたたみの二段構え
- 取得失敗時にアップロードを阻害しない（ツリーロードと同じサイレントフォールバック）
- テストが server-fn を全モックしているため、新 fn のモック追加を忘れると既存スイート全体が落ちる
- スコープ管理: 送信ロジック・resolver の解決順は変更しない。表示の追加に限定

## テスト方針

- 単体（vitest, `UploadDialog.test.tsx`）: (1) 既定値が placeholder/details に表示、(2) 入力空/非空で状態バッジ切替、(3) 既定空文字でフォールバック文言、(4) fetch 失敗時もアップロード継続
- usecase 単体: `getEffectiveIngestionPrompts` が user override 有/無で正しい解決値と `isUserOverride` を返す
- 手動: `pnpm dev` で `#upload` を開き、既定値・バッジ表示、上書き入力での切替、送信時の既存挙動非回帰を確認
- 最後に `pnpm typecheck && pnpm lint:fix && pnpm format`

## レビュー履歴

### 1周目（要件カバレッジ / アーキ・リスク 並列）

**修正した点**:
- [アーキ P-001] `isUserOverride` の述語を resolver と一致させる（`entry !== undefined && entry.text.length > 0`）旨をステップ1・ADR-002 に明記。`getUserPromptOverride` の無条件 `isOverridden:true` 流用による表示と実挙動の矛盾を回避。
- [アーキ P-002] 入力なし GET server-fn は既存前例が無いため、空スキーマ（`z.object({}).optional()`）を与える方針をステップ2 に明記。

**取り込んだ改善提案**:
- [アーキ S-002] 既定値 fetch のトリガを「ダイアログ open」から「カスタムプロンプト details を初めて開いたとき（onToggle）」に変更。textarea が details 内にあり遅延ロード哲学に合致、無駄リクエストも削減。
- [アーキ S-003] resolver は identity UserId、override repo は adminSettings UserId と注記（取り違え防止）。
- [要件 S-002] 既定空文字が「例外」ではなく「最頻ケース」である点を強調し、フォールバック文言を中心 UX としてステップ4 に明記。
- [要件 S-003] 体裁参照に P42 HTML を追加。
- [要件 S-004] `title`/`directory` をスコープ外とする根拠（上書き欄が2つしかない）をスコープ節に明記。

**見送った提案とその理由**:
- [要件 S-001] `getUserPromptOverride` のロジック再利用 — 述語が resolver と異なる（text 空判定なし）ため、ロジックそのものの流用ではなく「user override repository を読んで resolver と同じ述語で判定」する方針を採用（P-001 対応に統合）。purpose は `IngestionPromptPurpose` と adminSettings `PromptPurpose` の双方に `structure`/`metadata` が存在し追加マッピング不要。

### 2周目（要件カバレッジ / アーキ・リスク 並列）

両視点とも**問題点ゼロで終了**。1周目反映（P-001 述語一致 / P-002 / S-002 onToggle / UserId VO）はコードと突き合わせて妥当と確認された。改善提案を取り込んで終了。

**取り込んだ改善提案**:
- [アーキ S-001] 入力なし GET server-fn は `getDirectoryTreeFn`（`note/actions.ts`、`UploadDialog` が引数なし `getTree()` で呼ぶ実働前例）に倣い `inputValidator` を省略で確定。1周目の「空スキーマ or 省略」保留を解消。
- [要件 S-001] 空文字フォールバック文言を独自文言ではなく既存 SSOT「LLM プロバイダの既定指示を使用」（`defaults.ts` JSDoc, #218 ADR-002）に揃える。
- [要件 S-002/S-003・アーキ S-002] usecase は `actorUserId: string` 入力、`userPromptOverrideRepository` は UoW 経由 read-only 参照（書き込み・イベント収集なし）と明記。
