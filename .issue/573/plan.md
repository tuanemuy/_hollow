# 実装計画 — Issue #573: feat(settings): P24 アカウント削除強化（多段確認 + 削除影響の実データ集計）

**Issue:** #573
**作成日:** 2026-06-14
**複雑度:** 中〜大規模

---

## 目的

P24 アカウント削除画面の破壊操作の確認強度を引き上げる。(1) 同意チェック + 確認語「DELETE」入力 + パスワード再検証の多段確認フロー、(2) 削除前に「何がどれだけ失われるか」を **実カスケード挙動に厳密一致** させた実データ集計リストで提示する。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | `deleteAccount` usecase が **username を先に判定**（不一致は `BusinessRuleError('confirmation_mismatch')`）、その後にパスワード再検証を行い、パスワード不一致時は `AuthenticationError('invalid_credentials')` を投げる（検証順序は AC・設計・テストで統一） | Issue「多段確認」+ `requestEmailChange` の再認証パターン | 2 |
| AC-2 | `DeleteAccountInput` に `currentPassword` が追加され、transport（`deleteAccountSchema`）→ action → usecase まで配線される | Issue「`DeleteAccountInput` にパスワードを追加」 | 2,7,8 |
| AC-3 | 確認語「DELETE」入力が frontend/transport で検証され、`DELETE` でないと送信できない（backend は確認語を受け取らない／関与しない） | Issue「確認語『DELETE』入力は transport/frontend 側で検証」 | 7,8 |
| AC-4 | 削除影響を集計する read-only usecase が新規作成され、件数・容量・410 Gone 化される公開ノート数・失効する限定公開リンク数を **実データ** で返す。saved view / custom prompt は集計対象外（件数を出さず包括表現にとどめる、AC-5 / S-001） | Issue「削除影響の実データ集計リスト」 | 1 |
| AC-5 | 集計値・影響リストが実カスケード挙動に厳密一致する（虚偽表示禁止）。実際には purge されないもの（ノート本体・メディア実体は soft-delete 後に worker 後処理されない）を「即時に消える」と表現しない | Issue「原則: 虚偽表示禁止」/ #543 | 1,9 |
| AC-6 | UI が多段確認（影響リスト → ①同意 → ②DELETE → ③ユーザー名 + パスワード）の confirm-steps / step-num / checkbox-row 構成でモック `P24-settings-account-delete.html` に準拠する | Issue「frontend」+ モック SSOT | 9 |
| AC-7 | 全ステップを満たすまで「アカウントを完全に削除する」ボタンが disabled。実行後は即時ログアウトされ `/` へ遷移する（#728 の `clearAppShellCache` 経路を踏襲）。**ログアウトの observable な基準: 削除実行後に保護ルートを再訪すると未認証としてリダイレクトされる（= `revokeAllForUser` が効いている）** | モック danger-action + 既存 index.tsx | 9 |
| AC-8 | 集計 usecase が `AccountDeleteForm/Page.tsx`（server）の async server component 内で `getContainer()` 経由で呼ばれ、`<Suspense>` + `<SectionErrorBoundary>` で囲んで stream され、`AccountDeleteForm` へ props で渡る（route loader は auth + RSC 描画のみ。P22 `SecurityForm/Page.tsx` 準拠） | Issue「影響集計は Page.tsx（server）で集計 usecase を呼んで渡す」 | 6,8 |

## スコープ

### 含まれないもの

- **ノート本体・メディア実体の物理削除（purge）追加** — 現状 `deleteAccount` は User を soft-delete し、credentials purge / 公開ノート private 化（リンク失効）/ export job キャンセル / セッション失効のみ。ノート・メディアは purge されない（`user.deleted` の reaction handler は publication と export のみ。`調査結果` 参照）。本 Issue はカスケード挙動を変えない。集計表示はこの実挙動に合わせる（後述の表現方針）。
- **owner-scoped share-link count の永続化最適化以外の用途** — 追加する集計手段は P24 集計専用。他画面のクォータ表示等には流用しない。
- **multi-step を別ダイアログ/別ページに分離する設計** — モックは単一セクション内のインライン多段。`ConfirmDialog`（汎用・username のみ）はこの用途に合わないため P24 専用 UI をフォーム内にインライン展開する（ConfirmDialog 自体は変更しない）。
- **saved view / custom prompt の件数集計** — `user.deleted` カスケードで触らないため集計値（件数）は出さず、包括表現（「アカウントに紐づくデータ」等）にとどめる（S-001 / ADR-003）。
- **P21/P22/P23（兄弟 Issue #571/#572/#574）の領域** — 実装済み or 別 Issue。

## 調査結果

- 関連ファイル:
  - `app/core/application/identity/deleteAccount.ts` — 既存の削除カスケード本体。`confirmation`=username 一致のみ。public ノートの private 化（`publicationStateRepository.findPublicByOwner` でページング）・export job キャンセル・`User.markDeleted`（`user.deleted` イベント draft 発行）・UoW 外で `sessionService.revokeAllForUser`。
  - `app/core/application/identity/requestEmailChange.ts` — sensitive operation の再認証参照パターン。UoW 内で `credentialStore.verifyPasswordForUser(actor, currentPassword)` → false なら `AuthenticationError('invalid_credentials')`。**deleteAccount に同型で組み込む。**
  - `app/core/application/note/listNotesByOwner.ts` — **集計 usecase の構造的雛形**。read-only だが `container.unitOfWorkProvider.run(async (ctx) => ...)` の中で `ctx.noteRepository` / `ctx.publicationStateRepository` 等のリポジトリを読み、`collectEvents` を呼ばずに値だけ返す。`RequestContainer`（`app/core/application/di/types.ts`）はリポジトリを直接公開せず UoW 経由でしか取得できないため、リポジトリを読む集計は read-only でも UoW を回す必要がある（この雛形に従う）。
  - `app/core/application/identity/listUserSessions.ts`（#572）— read-only owner-scoped projection の別系統。`container.sessionService` を**直接**呼び UoW を使わない（`SessionService` は UoW 非参加ポート）。本 Issue の集計はリポジトリを読むため**この雛形は使わない**（`listNotesByOwner` を雛形とする）。
  - `app/core/domain/identity/ports/credentialStore.ts:79` — `verifyPasswordForUser(userId, raw): Promise<boolean>`。失敗（誤パスワード/未知ユーザー/soft-deleted）で `false`・throw しない契約。
  - `app/core/domain/note/ports/noteRepository.ts:328` — `countByOwner(ownerId, opts?)`。opts 省略で active+trashed 全件。本 Issue では「active ノート数」を表示するため `{ status: 'active' }` を渡す（後述）。
  - `app/core/domain/media/ports/mediaAssetRepository.ts:27` — `findByOwner(ownerId, { limit, cursor })`。容量は entity の `byteSize`（number）保持。**count/合計 byteSize の専用集計メソッドは無い** → 列挙合算 or 新ポートメソッド（ADR-002）。
  - `app/core/domain/publication/ports/publicationStateRepository.ts:97` — `countPublicByOwner(ownerId)`。**active ノートに INNER JOIN** し published_at NOT NULL で数える（trashed-but-still-public は除外）。`findPublicByOwner().length` は limit で頭打ちになるためこちらを使う。表示値としては妥当だが、実カスケード（`handleUserDeletedEvent` が `findByOwner` で trashed 含む全ノートを private 化）とは active-only JOIN 由来の微小なズレがありうる（リスク欄参照。「正確な SSOT」という断言はしない）。
  - `app/core/domain/publication/ports/shareLinkRepository.ts:40` — `countByNoteId(noteId, includeRevoked)` のみ。**owner-scoped count は未実装**（ADR-001）。
  - `app/core/application/publication/handleUserDeletedEvent.ts` / `app/core/application/export/handleUserDeletedEvent.ts` — `user.deleted` の非同期 reaction。publication は **全ノート**（`findByOwner`、public/unlisted/private 問わず）を private 化し `changeVisibilityAndCascade` で **全 active リンクを revoke**。export は active/completed job を cancel/expire。
  - `app/core/application/workers/dispatchDomainEvent.ts:299` — `user.deleted` fan-out は publication → export の2つだけ。**note/media の reaction handler は存在しない。**
  - `app/components/identity/AccountDeleteForm/{index.tsx,action.ts,Page.tsx}` — 現状フロント。`index.tsx` は `ConfirmDialog`（username 一致を client で先行判定）+ `clearAppShellCache` → `/` navigate。`Page.tsx` は同期描画（async データ無し）。
  - `app/components/common/ConfirmDialog.tsx` — 汎用確認ダイアログ。確認語入力に特化していない（subject/description 表示と単一 confirm のみ）。
  - `app/components/identity/schema.ts:35` — `deleteAccountSchema = { confirmation }`。
  - `app/components/identity/styles.ts` — `SECTION`/`SECTION_TITLE`/`SECTION_DESC`/`FIELD_*` 等トークン由来ユーティリティ。**alert / confirm-steps / step-num / checkbox-row 相当は未定義**（追加が必要）。
  - `app/routes/_app/settings/account-delete.tsx` — loader は `requireCurrentUser` + `renderServerComponent(<AccountDeletePage user={toUserDTO(user)} />)` のみ（async データ無し）。**集計 usecase はここでは呼ばない。** loader は auth + RSC 描画のみに保つ。
  - `app/components/identity/SecurityForm/Page.tsx`（P22）— **集計呼び出しの確立パターン**。`SecurityPage` shell が `<SectionErrorBoundary>` + `<Suspense fallback={<FormSkeleton/>}>` で async server component（`SecuritySection`）を囲み、`SecuritySection` 内で `await import("@/core/application/di/containerStore")` の `getContainer()` 経由で usecase を呼んで client component に props で渡す。**本 Issue の集計 usecase 呼び出しはこの構造に従う**（loader 同期描画に集計レイテンシを被せず、エラーを SectionErrorBoundary で隔離）。
  - `spec/design/pages/P24-settings-account-delete.html` — モック SSOT。alert-error（影響リスト）+ confirm-steps（3 ステップ）+ danger-action（disabled ボタン + danger-note）。

- あるべきアーキテクチャ:
  - Hexagonal + DDD、依存は内向き。**集計はドメイン横断のため application 層の read-only usecase に置く**（ドメインサービスには cross-aggregate join を持ち込まない方針＝`publicationStateRepository` の JSDoc が明言）。
  - 集計結果は **application 層の DTO** として projection（`app/core/application/dto/` 配下）。presentation には DTO のみ渡す。
  - パスワード検証は **value-object 構築（境界）と usecase 内** で行う sensitive-operation 再認証。`requestEmailChange` と同型。
  - transport 境界（`deleteAccountSchema` / `validateInput`）で shape を検証。確認語「DELETE」は **business invariant ではなく UI/transport の確認手段**なので backend には渡さず frontend/transport で完結（Issue 明記）。
  - 容量・件数は backend 実値に厳密一致（#543「虚偽表示禁止」）。bytes→人間可読への整形は presentation 側（DTO は生の number を持つ）。

- 既存実装の状態:
  - **乖離1（confirm 強度不足）**: `deleteAccount` は username 一致のみでパスワード未検証。あるべき sensitive-operation 再認証に未到達 → 本 Issue で `verifyPasswordForUser` を組み込み是正。
  - **乖離2（影響可視化なし）**: 削除影響を実データで提示する経路が無い → 本 Issue で集計 usecase + DTO + UI を新設。
  - **乖離3（モック未追従）**: 現フロントは `ConfirmDialog` の簡素フロー（#543 で section-desc のみ追従済み）。多段確認 UI は未実装 → 本 Issue で追従。
  - **整合している点**: 削除実行後の `clearAppShellCache` → navigate（#728 ADR-001）、loader の RSC 描画、DTO projection 規約、usecase = container 受け取りの plain function 構造 は踏襲する。

- 依存関係:
  - share-link owner-scoped 集計手段の追加は publication 領域のポート + D1 アダプターに影響（ADR-001 で方式決定）。media 容量集計手段は media 領域のポート or 既存 `findByOwner` 列挙（ADR-002）。
  - usecase は中央レジストリ不要（`loadServerDeps` + 動的 import で呼ぶ plain function）。DI 追加配線は不要。container/UoW は必要なリポジトリを既に全て公開済み。

## 設計

### ドメインモデルへの影響

- **新しい値オブジェクト・エンティティは不要。** 集計は既存エンティティの read のみ。
- **ポート追加（publication）**: `ShareLinkRepository` に owner-scoped active-link count を 1 メソッド追加する（ADR-001 で決定）。
  - 案: `countActiveByOwner(ownerId: UserId): Promise<number>`。read-only projection（OCC トークン無し）として、既存の `countByNoteId` と同じ「クォータ/集計用 read-only count」群に並べる。`shareLinks` を `notes` に `notes.ownerId = ?` **のみ**で JOIN し（`notes.status` で絞らない＝trashed ノートの active リンクも含む。実カスケード `handleUserDeletedEvent` → `revokeAllLinksInternal` が全ノートの active リンクを revoke することと一致）、`revokedAt IS NULL` を数える。active ノートに絞ると過小カウント＝虚偽表示になるので注意（ADR-001）。
- **ポート追加（media、ADR-002 の決定次第）**: 容量合計を正確かつ O(1) で得るため `MediaAssetRepository` に `aggregateByOwner(ownerId): Promise<{ count: number; totalBytes: number }>`（仮称）を追加する案を採用（ADR-002）。列挙合算（既存 `findByOwner` ページング）も可能だが大量メディアで O(n) read になるため集計 SQL を選ぶ。**集計母集団は `status = 'attached'` のみ**（`MediaStatus = 'pending' | 'attached' | 'orphan' | 'deleting'`。`pending`=未コミット、`orphan`/`deleting`=purge worker 待ちの過渡状態。ユーザーがアクセスできる実体は `attached` のみ）。DTO JSDoc と SQL の WHERE 句を一致させる（ADR-002）。
- それ以外のドメインルール・不変条件の変更は **なし**（カスケード挙動を変えない）。

### ユースケース / アプリケーションロジック

1. **`deleteAccount` の拡張**（既存ファイル）:
   - `DeleteAccountInput` に `currentPassword: string` を追加。
   - UoW 内、username 一致チェックの**後**に `credentialStore.verifyPasswordForUser(actor, input.currentPassword)` を呼び、`false` なら `AuthenticationError('invalid_credentials')` を throw（`requestEmailChange` と同型）。検証順序は username → password で AC-1・テスト方針と一本化。
   - **検証順序の判断**: username 一致（`confirmation_mismatch`）とパスワード一致（`invalid_credentials`）はエラー種別が異なる。username を先に判定すると「username 合致まではパスワード検証されない」。frontend が両方必須にするので順序は UX のみの問題。username → password 順とする（既存 confirmation_mismatch を温存し、追加検証を後置 = 差分最小）。
   - 確認語「DELETE」は **受け取らない**（Issue 明記。transport/frontend 完結）。

2. **集計 usecase 新規**（`app/core/application/identity/summarizeAccountDeletion.ts` 仮称）:
   - **`listNotesByOwner` と同型**の read-only usecase。`container.unitOfWorkProvider.run(async (ctx) => ...)` の中で `ctx.noteRepository` / `ctx.mediaAssetRepository` / `ctx.publicationStateRepository` / `ctx.shareLinkRepository` を読む（`RequestContainer` はリポジトリを直接公開しないため、read-only でもリポジトリ取得経路が UoW 必須）。書き込み・`collectEvents` はしない。`listUserSessions`（`sessionService` 直接呼び出し・UoW 不使用）とは別系統。
   - 集計内容（**実カスケードに一致するもののみ**）:
     - `noteCount` = `noteRepository.countByOwner(actor, { status: 'active' })` — 所有 active ノート数。
     - `mediaCount` / `mediaTotalBytes` = `mediaAssetRepository.aggregateByOwner(actor)`（ADR-002）。
     - `publicNoteCount`（410 Gone 化対象）= `publicationStateRepository.countPublicByOwner(actor)`。
     - `activeShareLinkCount`（失効するリンク）= `shareLinkRepository.countActiveByOwner(actor)`（ADR-001）。
   - DTO `AccountDeletionImpactDTO` を返す（生の number 群）。**虚偽表示禁止のため、purge されないノート本体/メディア実体の数値の「意味づけ」は presentation/DTO コメントで明示**（後述）。

### アダプター / 永続化 / 外部連携

- `app/core/adapters/d1/repositories/shareLinkRepository.ts` — `countActiveByOwner` の SQL 実装（`shareLinks` JOIN `notes` ON `notes.ownerId = ?`、`notes.status` で絞らない、`revokedAt IS NULL` count）。
- `app/core/adapters/d1/repositories/mediaAssetRepository.ts` — `aggregateByOwner` の SQL 実装（`SELECT COUNT(*), COALESCE(SUM(byteSize),0) WHERE ownerId = ? AND status = 'attached'` … 既存スキーマのカラム名で。ADR-002 採用時）。
- スキーマ変更・マイグレーションは **不要**（既存カラムの集計のみ）。
- **in-memory フェイク repo は本リポジトリに存在しない**（application 層テストは実 D1 integration、フェイクは LLM / tempFileStorage / idGenerator / logger のみ）。フェイク実装の追加は不要。アダプターの新メソッドは実 D1 integration で検証する（テスト方針参照）。

### UI / プレゼンテーション

- **DTO**: `app/core/application/dto/identity.ts`（または新規 `accountDeletion.ts`）に `AccountDeletionImpactDTO`:
  ```ts
  export type AccountDeletionImpactDTO = Readonly<{
    noteCount: number;        // 所有 active ノート数（soft-delete 後 purge worker 待ち）
    mediaCount: number;       // status='attached' のメディア数（pending/orphan/deleting は除外）
    mediaTotalBytes: number;  // attached メディアの生バイト合計。整形は presentation
    publicNoteCount: number;  // 410 Gone 化対象（active 公開ノート数。即時 private 化 → リンク失効。active-only JOIN のため実カスケードと微小なズレありうる）
    activeShareLinkCount: number; // 失効する限定公開リンク数
  }>;
  ```
  JSDoc に各値の「実カスケードでの意味」を記載（虚偽表示禁止の根拠を型に残す）。
- **route loader / Page**: `account-delete.tsx` loader は現状どおり auth + `renderServerComponent(<AccountDeletePage user={...} />)` のみに保つ（集計はここで呼ばない）。集計は **`AccountDeleteForm/Page.tsx` 内の async server component**（P22 `SecurityForm/Page.tsx` 準拠）で取得する: shell が `<SectionErrorBoundary section="アカウント削除">` + `<Suspense fallback={<FormSkeleton/>}>` で async section を囲み、section 内で `getContainer()` 経由で `summarizeAccountDeletion` を呼び、`user` + `impact` を `AccountDeleteForm` に props で渡す。集計レイテンシ（大量データユーザー）を stream し、エラーを section に隔離する。
- **`AccountDeleteForm/index.tsx`（全面改修）**:
  - 影響リスト（alert-error）: 集計値を表示。表現は実挙動に一致（後述「表現方針」）。
  - confirm-steps 3 ステップ: ①同意 checkbox、②`DELETE` 確認語 input、③username input + password input。
  - 「アカウントを完全に削除する」ボタン: `agree && deleteWord === 'DELETE' && username === user.username && password.length > 0` を満たすまで disabled。
  - submit 時: client 先行検証 → `deleteAccountFn({ data: { confirmation: username, currentPassword } })` → 成功で `clearAppShellCache` → `/` navigate（既存踏襲）。サーバーエラー（パスワード不一致 = AuthenticationError）はフォーム内に表示し画面遷移しない。
  - `ConfirmDialog` 依存を撤去（このフォームからのみ。共通コンポーネントは変更しない）。
- **styles**: `app/components/identity/styles.ts` に alert/confirm-steps/step-num/step-label/step-help/checkbox-row/danger-action 相当の token-由来ユーティリティ文字列を追加（モック CSS をトークンへ写像）。`common/styles.ts` の既存 ALERT_* を再利用できる箇所は再利用。
- **schema**: `deleteAccountSchema` に `confirmation`（既存）+ `currentPassword`（`min(1).max(PASSWORD_MAX)`）+ `confirmWord`（`z.literal('DELETE')` 等で transport でも確認語を担保）を追加。`confirmWord` は backend usecase へは渡さない（action で破棄）。
- **`confirmWord` のバリデーション失敗時の UI 扱い（S-005）**: client 側で送信前に `deleteWord === 'DELETE'` を gating するため、`z.literal('DELETE')` 失敗（fieldErrors に `confirmWord` が付く）には通常到達しない。transport では shape 担保のみと割り切り、**サーバーから返る `confirmWord` の fieldErrors は UI 側で無視**する（client gating が先に弾く二重防御）。表示するフィールドエラーは `confirmation` / `currentPassword` のみ。

### 表現方針（虚偽表示禁止の具体化）

実カスケード（soft-delete + 公開停止 + リンク失効 + export 取消 + セッション失効。**ノート本体・メディア実体は purge worker による後処理が現状存在しない**）に照らし、モック文言を以下のように調整する。実装フェーズで最終文言確定（ADR-003）:

- 「公開中のノート N 件 — 公開 URL は 410 Gone を返すようになります」→ **実挙動と一致**（`countPublicByOwner` + `handleUserDeletedEvent` の private 化）。そのまま採用。
- 「発行済みの限定公開リンク M 本はすべて失効します」→ **実挙動と一致**（全ノートの active リンクを revoke）。`countActiveByOwner` で採用。
- 「N 件のノート」「メディア X GB」→ ノート本体・メディア実体は即時 purge されない（アクセス不能化＝公開停止 + ログイン不能、データ自体は DB に残存）。**「失われる」を「アクセスできなくなる／復元できません」に寄せる**等、即時物理削除を断定しない表現にする（ADR-003）。件数・容量自体は実データなので表示してよい。
- 「保存ビュー・カスタムプロンプト・進行中のエクスポートジョブ」→ 集計値を出さず（saved view / prompt は user.deleted カスケードで触らない＝表現に注意）、**確実に処理される「進行中のエクスポートジョブはキャンセルされます」のみ明記**し、saved view / custom prompt は「アカウントに紐づくデータ」として包括表現にとどめる（断定しない）。
- 「削除後のデータ復元はできません」→ soft-delete 後の復元 UI/経路は無いため一致。採用。

## 実装ステップ

依存方向（内側→外側）の順。

### 1. 集計 usecase + DTO の新設

- **対象ファイル:** `app/core/application/identity/summarizeAccountDeletion.ts`（新規）、`app/core/application/dto/identity.ts`（or 新規 `accountDeletion.ts`）、`app/core/application/dto/index.ts`（export 追記）
- **変更内容:** `AccountDeletionImpactDTO` 定義 + `summarizeAccountDeletion` usecase（**`listNotesByOwner` 同型**: `unitOfWorkProvider.run` 内でリポジトリを read、`collectEvents` しない）。`countByOwner({status:'active'})` / `countPublicByOwner` / 追加した media・sharelink 集計メソッドを呼び DTO 生成。
- **理由:** AC-4/AC-5/AC-8。ドメイン横断集計は application 層に置く。

### 2. `deleteAccount` にパスワード再検証を組み込む

- **対象ファイル:** `app/core/application/identity/deleteAccount.ts`
- **変更内容:** `DeleteAccountInput` に `currentPassword` 追加。UoW 内で username 一致後に `verifyPasswordForUser` 検証、false で `AuthenticationError('invalid_credentials')`。
- **理由:** AC-1/AC-2。sensitive-operation 再認証（`requestEmailChange` 準拠）。

### 3. ShareLink owner-scoped active count をポートに追加

- **対象ファイル:** `app/core/domain/publication/ports/shareLinkRepository.ts`
- **変更内容:** `countActiveByOwner(ownerId): Promise<number>` を read-only projection として追加 + JSDoc。
- **理由:** AC-4。owner 横断のリンク失効数を実カスケードに一致して数える（ADR-001）。

### 4. Media owner-scoped 集計をポートに追加

- **対象ファイル:** `app/core/domain/media/ports/mediaAssetRepository.ts`
- **変更内容:** `aggregateByOwner(ownerId): Promise<{ count: number; totalBytes: number }>` 追加 + JSDoc。
- **理由:** AC-4。容量合計を正確に O(1) で取得（ADR-002）。

### 5. アダプター実装（D1）

- **対象ファイル:** `app/core/adapters/d1/repositories/shareLinkRepository.ts`、`app/core/adapters/d1/repositories/mediaAssetRepository.ts`
- **変更内容:** ステップ3/4 のメソッドの SQL 実装。share-link は `notes.ownerId = ?` のみで JOIN（`notes.status` 不問）+ `revokedAt IS NULL` count。media は `WHERE ownerId = ? AND status = 'attached'` の `COUNT(*)` / `COALESCE(SUM(byteSize),0)`。driver エラーは既存契約どおり translate。**in-memory フェイクは存在しないため追加なし**（検証は実 D1 integration、ステップ10）。
- **理由:** ポートの具象。

### 6. Page.tsx の async server component で集計を取得

- **対象ファイル:** `app/components/identity/AccountDeleteForm/Page.tsx`（ステップ8 と統合可）
- **変更内容:** `account-delete.tsx` loader は auth + RSC 描画のみのまま変更しない。`AccountDeletePage` shell に `<SectionErrorBoundary>` + `<Suspense fallback={<FormSkeleton/>}>` を追加し、async server component（`AccountDeleteSection` 仮称）内で `getContainer()` 経由で `summarizeAccountDeletion` を呼び、`impact` を `AccountDeleteForm` に渡す（P22 `SecurityForm/Page.tsx` 準拠）。
- **理由:** AC-8。server で集計し presentation に DTO を渡す。集計を stream しエラーを section に隔離する。

### 7. transport schema + action 配線

- **対象ファイル:** `app/components/identity/schema.ts`、`app/components/identity/AccountDeleteForm/action.ts`
- **変更内容:** `deleteAccountSchema` に `currentPassword` + `confirmWord`（`literal('DELETE')` 相当）追加。action は `confirmation` + `currentPassword` のみ usecase へ渡し、`confirmWord` は破棄。
- **理由:** AC-2/AC-3。確認語は transport で担保し backend に流さない。

### 8. Page.tsx の async server component / impact 受け渡し（ステップ6 と統合）

- **対象ファイル:** `app/components/identity/AccountDeleteForm/Page.tsx`
- **変更内容:** ステップ6 の `AccountDeleteSection`（async server component）で得た `impact: AccountDeletionImpactDTO` を `AccountDeleteForm` に中継。shell は `user` を受け取り section に渡す。
- **理由:** AC-8。（ステップ6 と同一ファイルのため実装時にまとめてよい。）

### 9. 多段確認 UI の構築 + styles 追加

- **対象ファイル:** `app/components/identity/AccountDeleteForm/index.tsx`、`app/components/identity/styles.ts`
- **変更内容:** 影響リスト（実データ・表現方針準拠）+ confirm-steps（同意/DELETE/username+password）+ disabled ゲート + 既存の削除実行・clearAppShellCache・navigate を踏襲。`ConfirmDialog` 撤去。styles に alert/step/checkbox-row 等のトークン由来ユーティリティ追加。
- **理由:** AC-3/AC-5/AC-6/AC-7。モック SSOT 準拠。

### 10. テスト追加・更新

- **対象ファイル:** `app/core/application/identity/__tests__/deleteAccount.*`（新規 or 既存）、`summarizeAccountDeletion` のテスト、アダプター集計メソッドのテスト
- **変更内容:** テスト方針参照。

## 設計判断

- **ADR-001**: 失効リンク数の owner 横断集計は `ShareLinkRepository.countActiveByOwner` を **新規ポートメソッド + 集計 SQL** で実装（公開ノート列挙 → `countByNoteId` 合算より正確で安価。実カスケードが全ノートの全 active リンクを revoke することと一致）。
- **ADR-002**: メディア件数・容量合計は `MediaAssetRepository.aggregateByOwner` の **集計 SQL** で取得（`findByOwner` 全件列挙合算は大量メディアで O(n) read）。
- **ADR-003**: 集計表示の文言を実カスケードに合わせて調整（ノート本体・メディア実体は即時 purge されない＝「失われる」断定を避ける／公開停止・リンク失効・export 取消は断定可。saved view / custom prompt は包括表現／`countPublicByOwner` の active-only ズレを文言で吸収）。詳細は adr.md。
- **ADR-004**: SSO のみ（パスワード未設定）ユーザーの削除不能リスクは現コードベースでは発生しない（password 未設定ユーザーの生成経路が無い）と結論。`hasPassword` フォールバックは本 Issue では実装しない。詳細は adr.md。

詳細は `.issue/573/adr.md` を参照。

## リスクと注意点

- **虚偽表示の最大リスク**: ノート本体・メディア実体は `deleteAccount` でも `user.deleted` 非同期 handler でも purge されない（note/media に user.deleted reaction が無い）。「N 件のノートが消える」「X GB のメディアが消える」と即時物理削除を断定するとモックの文言が実挙動と乖離する。表現方針（ADR-003）で吸収するが、実装フェーズで文言レビュー必須。
- **件数・容量の整合性**: `countByOwner({status:'active'})` は active のみ。「所有ノート総数」をどう定義するか（active のみ vs active+trashed）で表示が変わる。ユーザーが「失う」と感じる範囲（active を採用）と整合させる。trashed を含めるなら別途明記。
- **パスワード未設定（SSO のみ）ユーザー — 結論済み（リスクなし）**: `verifyPasswordForUser` は password 行が無い場合 `false` を返す契約だが、**現コードベースには password 未設定ユーザーを生成する経路が存在しない**。ユーザー作成は `signUp`（`registerPassword` を必ず呼ぶ）と `adminSignUp` のみ。SSO 系（`linkProvider`/`resolveProvider`）はポート/アダプターに定義はあるが呼び出す usecase・ルートが無く（OAuth フロー未実装）、`removePassword`/`unlinkProvider` を呼ぶ usecase も無い。よって「全ユーザーは必ず password を持つ」が現状の不変条件で、パスワード再検証による削除ブロックは発生しない。**`hasPassword` フォールバックは本 Issue では実装不要（YAGNI / スコープ外）**。将来 SSO ログインを追加したら再考（`hasPassword(userId)` ポートは既存なのでフォールバックは容易）。詳細は ADR-004。
- **`countPublicByOwner` の active-only JOIN による微小ズレ**: `countPublicByOwner` は `notes.status='active'` で INNER JOIN するため、実カスケード（`handleUserDeletedEvent` が trashed 含む全ノートを private 化）と厳密には一致しない。「trashed だが published 状態」のノートがある場合（通常 trash 時に private 化されるが outbox-relay lag の窓では乖離しうる）、表示値が実際の 410 化件数より過小になりうる。表示値としては active 公開ノート数で妥当なため集計手段は変えないが、ADR-003 の文言で断定を緩める（「公開中のノート ≈ N 件」等）。
- **集計と削除の間の race**: 集計値表示後に削除実行までの間にデータ増減しうる（厳密一致は表示時点のスナップショット）。破壊操作の確認用途では許容範囲。
- **大量データユーザーの集計レイテンシ**: 集計を全て count/SUM SQL に寄せることで列挙を避ける（O(n) read 回避）。
- **`confirmWord` を usecase に流さない**ことの徹底: action で確実に破棄し、`DeleteAccountInput` に confirmWord を増やさない（backend は確認語に関与しないという Issue 明記の境界を守る）。

## テスト方針

**本リポジトリの application 層テストは実 D1 integration が基本でフェイク/in-memory repo は存在しない**（フェイクは LLM / tempFileStorage / idGenerator / logger のみ）。`app/core/application/identity/__tests__/identity.integration.test.ts` が `setupTestContainer`（`D1UnitOfWorkProvider` + 実 D1 リポジトリ、`app/core/application/__tests__/helpers.ts`）で組む integration suite。新規検証はこの流儀（実 D1 に seed）に合わせる。

- **usecase（deleteAccount, integration）**: `identity.integration.test.ts` に実 D1 で seed。パスワード一致で削除成功（既存カスケード継続）/ パスワード不一致で `AuthenticationError('invalid_credentials')` かつ副作用なし / username 不一致で従来どおり `confirmation_mismatch`。**検証順序を AC-1 と統一**（username を先に判定: username 不一致時は `confirmation_mismatch` が返り、パスワード検証に到達しないことを assert）。
- **usecase（summarizeAccountDeletion, integration）**: 実 D1 に note / media / public 状態 / share-link を seed し、`noteCount` / `mediaCount` / `mediaTotalBytes`（attached のみ）/ `publicNoteCount` / `activeShareLinkCount` が実データを正しく集約して DTO になることを検証。`identity.integration.test.ts` または近傍の integration suite に追加。
- **アダプター（integration, 実 D1）**: `app/core/adapters/d1/__tests__/shareLinkRepository.integration.test.ts`（新規）で `countActiveByOwner` が revoked を除外し、**trashed ノートの active リンクも含み**、owner 境界を守ることを検証。`mediaAssetRepository.integration.test.ts` に `aggregateByOwner` の count・SUM(byteSize) が **status='attached' のみ**を集計し、0 件で 0 を返す（COALESCE）ことを追加。
- **action 境界（S-005）**: `confirmWord` を含む入力でも usecase へ渡るのは `confirmation` + `currentPassword` のみで `confirmWord` は破棄される（backend が確認語に関与しない境界）ことを action 層テストで担保。
- **errorCodeNaming**: 新規 error code を追加しない方針（既存 `invalid_credentials` 再利用）なので命名テストへの影響なし。
- **frontend（manual / browser）**: 全ステップ未充足で disabled / 確認語が `DELETE` 以外で送信不可 / パスワード不一致でフォーム内エラー・画面非遷移 / 成功で `/` 遷移・**保護ルート再訪で未認証にリダイレクト（AC-7 のログアウト observable）**。`spec/manual-tests` 該当があれば追従。
- `pnpm typecheck && pnpm lint:fix && pnpm format` を通す。

## レビュー履歴

### 1周目

**修正した点**:
- **[arch P-001]** 集計 usecase の構造的雛形を `listUserSessions` から **`listNotesByOwner`（read-only + `unitOfWorkProvider.run` 内で repo を読み collectEvents しない）** に修正。`RequestContainer` はリポジトリを直接公開せず UoW 経由でしか取得できない事実を調査結果・設計・実装ステップ1/2 に反映。`listUserSessions`（`sessionService` 直接呼び・UoW 不使用）は別系統である旨を明記。
- **[arch P-002]** テスト方針から「フェイク repo で仕込み検証」「in-memory 実装への追従」を撤回。本リポジトリの application 層テストは実 D1 integration が基本でフェイク repo が存在しない（フェイクは LLM/tempFileStorage/idGenerator/logger のみ）事実を確認し、`identity.integration.test.ts` / `setupTestContainer` の流儀（実 D1 seed）に統一。アダプター集計メソッドは `app/core/adapters/d1/__tests__/` の実 D1 integration で検証する方針に変更（ステップ5・10 も整合）。
- **[arch P-003]** 集計 usecase の呼び出し位置を route loader から **`AccountDeleteForm/Page.tsx` の async server component（`getContainer()` + `<Suspense>` + `<SectionErrorBoundary>`、P22 `SecurityForm/Page.tsx` 準拠）** に修正。route loader は auth + RSC 描画のみに保つ。AC-8・実装ステップ6/8・設計（UI/プレゼンテーション）を整合。

**取り込んだ改善提案**:
- **[coverage S-001]** saved view / custom prompt を集計対象外（件数を出さず包括表現）とスコープ・AC-4・ADR-003 に明記。
- **[coverage S-002]** AC-7 の「即時ログアウト」を observable な基準（保護ルート再訪で未認証にリダイレクト）に具体化し、テスト方針にも反映。
- **[coverage S-003]** AC-1 の検証順序（username → password）を AC・設計・テスト方針で統一。
- **[coverage S-004 / arch S-001]** SSO のみ（パスワード未設定）ユーザーの削除不能リスクを「現コードベースでは発生しない（生成経路が無い）」と計画段階で結論。`hasPassword` フォールバック不要をリスク欄で確定し、ADR-004 として記録。
- **[coverage S-005]** DELETE 確認語を backend に渡さない境界を action 層テストで担保する旨をテスト方針に追記。
- **[arch S-002]** `countPublicByOwner` は active-only JOIN で実カスケード（全ノート private 化）と微小ズレがある点を反映。「正確な SSOT」断言を緩め、リスク欄に追記、ADR-003 で文言の断定を緩める方針に。
- **[arch S-003]** `activeShareLinkCount` の JOIN は `notes.status` で絞らない（trashed ノートのリンクも失効対象）SQL 仕様を設計・実装ステップ5・ADR-001 に明示。
- **[arch S-004]** `mediaTotalBytes` の集計母集団を `status='attached'` のみ（pending/orphan/deleting は purge ライフサイクル過渡状態で除外）と実コードの `MediaStatus` 定義に基づき設計・ADR-002 に明示。
- **[arch S-005]** `confirmWord` の `z.literal('DELETE')` 失敗時 fieldErrors は client gating が先に弾くため UI 側で無視する方針を設計に追記。

**見送った提案とその理由**:
- なし（両視点の全提案を取り込み）。

### 2周目

**修正した点**:
- **[coverage S-001]** 設計（ユースケース）L89 に残っていた検証順序の揺れ「（または前）」を削除し、「username → password の後置」で AC-1・テスト方針と一本化。
- **[arch S-001]** ADR-001 / ADR-002 の Consequences に残存していた「フェイク/in-memory 実装にも追従が必要」の旧記述を、実 D1 integration テストで検証する方針（本リポジトリにフェイク repo は無い）に同期。

**確認した点（追加調査）**:
- **[arch S-003]** 集計 usecase が依存する 4 リポジトリ（`noteRepository` / `publicationStateRepository` / `shareLinkRepository` / `mediaAssetRepository`）+ `credentialStore` が UoW context（`app/core/application/execution/unitOfWork.ts`）に全て公開済みであることを確認。ステップ1の前提崩れなし。

**取り込んだ改善提案**:
- 上記 coverage S-001 / arch S-001。

**結果**: 2周目は両視点とも問題点ゼロ（改善提案のみ）。軽微なクリーンアップを反映し、レビューループを終了。
