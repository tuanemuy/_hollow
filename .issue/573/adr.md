# ADR — Issue #573: P24 アカウント削除強化（多段確認 + 削除影響の実データ集計）

## ADR-001: 失効する限定公開リンク数の owner 横断集計方式

### Status
Proposed

### Context
削除影響リストに「発行済みの限定公開リンク M 本はすべて失効します」を実データで出す必要がある。`ShareLinkRepository` には `countByNoteId(noteId, includeRevoked)` しか無く、owner スコープの集計手段が存在しない（Issue 本文でも指摘）。選択肢:

1. 公開ノートを `findPublicByOwner` で列挙し各ノートに `countByNoteId` を呼んで合算。
2. 全ノートを `findByOwner` で列挙し各ノートに `countByNoteId` を呼んで合算。
3. `ShareLinkRepository` に owner-scoped active count メソッドを追加し集計 SQL で 1 クエリにする。

実カスケード（`publication.handleUserDeletedEvent`）は **public だけでなく全ノート**を private 化し、`changeVisibilityAndCascade` で **全 active リンクを revoke** する。つまり失効対象は「public ノートのリンク」ではなく「全ノートの active リンク」。よって案1は過小カウントで虚偽表示になる。案2は正しいが N+1 read で大量ノートに弱い。

### Decision
案3を採用。`ShareLinkRepository.countActiveByOwner(ownerId): Promise<number>` を read-only projection（OCC トークン無し、既存 `countByNoteId` と同じ「count 群」）として追加し、D1 アダプターで `shareLinks` を owner のノートに JOIN し `revokedAt IS NULL` を数える。実カスケードの失効対象集合（全ノートの active リンク）と一致する。

**JOIN の status 仕様（重要）**: JOIN 条件は `notes.ownerId = ?` **のみ**で、`notes.status` で絞らない。trashed ノートに紐づく active リンクも失効対象に含めるためである（実カスケード `handleUserDeletedEvent` → `revokeAllLinksInternal`（`app/core/domain/publication/service.ts`）は owner の **全ノート**の active リンクを revoke する）。active ノートに絞ると過小カウント＝虚偽表示になる。`revokedAt IS NULL` 条件は実挙動（revoked リンクはスキップ）と一致する。

### Consequences
- 良い点: 表示値が実カスケードに厳密一致（虚偽表示禁止を満たす）。1 クエリで O(1)、大量ノートでも安価。read-only projection なので OCC 契約を汚さない。
- トレードオフ: publication 領域のポート + アダプターに 1 メソッド増える。検証は実 D1 integration テストで行う（本リポジトリにフェイク/in-memory repo は無い）。

---

## ADR-002: メディア件数・容量合計の集計方式

### Status
Proposed

### Context
「アップロード済みメディア X GB」を実データで出す。`MediaAssetRepository` は `findByOwner(ownerId, { limit, cursor })`（cursor ページング）しか持たず、容量は entity の `byteSize` に保持。件数・合計バイトの集計メソッドは無い。選択肢:

1. `findByOwner` でページングしながら全件列挙し `byteSize` を合算（+ 件数カウント）。
2. `MediaAssetRepository` に集計メソッドを追加し `COUNT(*)` / `SUM(byteSize)` を 1 クエリで取得。

### Decision
案2を採用。`MediaAssetRepository.aggregateByOwner(ownerId): Promise<{ count: number; totalBytes: number }>` を追加し、D1 アダプターで `SELECT COUNT(*), COALESCE(SUM(byteSize), 0) WHERE ownerId = ? AND status = 'attached'`。

**集計母集団（status）**: `MediaStatus = 'pending' | 'attached' | 'orphan' | 'deleting'`（`app/core/domain/media/valueObject.ts:75`）。ライフサイクルは `pending`（アップロード済・未コミット）→ `attached`（ノートに紐づく）→ `orphan`（参照されなくなった purge 候補）→ `deleting`（purge worker 処理中）。ユーザーがアクセスできる実体メディアは **`attached` のみ**で、`pending`/`orphan`/`deleting` は過渡状態（purge ライフサイクル待ち）なので集計から除外する。`media domain service`（`service.ts`）の purge は `orphan`/`deleting` を対象に動く。DTO の `mediaCount`/`mediaTotalBytes` の JSDoc に「attached のみ」を明記し SQL の WHERE 句と一致させる（虚偽表示禁止 #543）。

### Consequences
- 良い点: 大量メディア所有者でも O(1) read。列挙の cursor ループ不要で usecase が単純。
- トレードオフ: media 領域のポート + アダプターに 1 メソッド増える。`MediaAssetRepository` は OCC 非対応の特殊 repo だが、追加は read-only 集計なので既存方針（adapter 内で並行性管理）と矛盾しない。検証は実 D1 integration テストで行う。

---

## ADR-003: 集計表示文言を実カスケード挙動に一致させる（虚偽表示禁止の具体化）

### Status
Proposed

### Context
モック `P24-settings-account-delete.html` は「N 件のノートが失われます」「メディア X GB（が失われます）」と即時物理削除を示唆する。しかし実カスケード（`deleteAccount` + `user.deleted` の reaction handler 群）は:

- User を **soft-delete**（status=deleted、行は残存）
- credentials purge / 全公開・全ノート private 化（リンク失効）/ export job キャンセル / 全セッション失効

を行うのみで、**ノート本体・メディア実体を物理削除（purge）する経路が存在しない**（`dispatchDomainEvent` の `user.deleted` fan-out は publication と export の 2 つだけ。note/media に reaction handler は無い）。#543 で確立した「実際には消えないものを『消える』と表示しない」原則に反するため、モック文言をそのまま実装すると虚偽表示になる。

### Decision
集計値（件数・容量）は実データなので表示する。ただし文言を実挙動に合わせて調整する:

- 公開ノートの 410 Gone 化・限定公開リンク失効・進行中 export ジョブのキャンセルは **実挙動と一致するので断定してよい**。ただし公開ノート数は `countPublicByOwner`（active-only INNER JOIN）由来で、実カスケード（trashed 含む全ノート private 化）と微小なズレがありうるため、「公開中のノート **約** N 件」「公開中のノート N 件（公開停止 → 410 Gone 化）」のように**断定の強さを少し緩める**（「正確な SSOT」とは表現しない）。集計手段自体は active 公開ノート数で妥当なので変更しない。
- ノート本体・メディア実体は「即時に失われる/消える」と断定せず、「アクセスできなくなる」「復元できません」等、物理削除を断定しない表現にする。件数・容量自体は実データとして提示してよい（メディアは attached のみ集計、ADR-002）。
- saved view / custom prompt は user.deleted カスケードで触らないため、**件数の集計値を出さず**、個別の「削除されます」断定を避け、包括的に「アカウントに紐づくデータ」として扱う（S-001）。
- DTO の各フィールドの JSDoc に「実カスケードでの意味」を記載し、型レベルで根拠を残す。

最終文言は実装フェーズで確定し、frontend レビューで実挙動との一致を再確認する。

### Consequences
- 良い点: 表示が backend の実挙動に厳密一致し、#543/#221 のフィードバック原則・虚偽表示禁止を満たす。ユーザーに誤った「即時完全削除」期待を与えない。
- トレードオフ: モックの文言を一部変える（モックは SSOT だが、コメントで「実装追従は別 Issue」「虚偽表示禁止優先」と明記されており、実データ一致を優先する）。寸法・色・構造（alert/confirm-steps/step-num/checkbox-row）はモックに準拠する。

---

## ADR-004: SSO のみ（パスワード未設定）ユーザーの削除経路を本 Issue では考慮しない

### Status
Accepted

### Context
AC-1 でパスワード再検証（`verifyPasswordForUser` → false で `AuthenticationError('invalid_credentials')`）を追加する。`verifyPasswordForUser` は契約上、password 行が無いユーザーには `false` を返す（`app/core/domain/identity/ports/credentialStore.ts`）。これが「SSO のみ（パスワード未設定）ユーザーがアカウント削除できなくなる＝機能後退」になるかが論点だった。

### Decision
**現コードベースでは password 未設定ユーザーを生成する経路が存在しない**ことを実コードで確認し、本リスクは発生しないと結論する。よって `hasPassword` フォールバックは本 Issue では**実装しない**（YAGNI / スコープ外）。

確認した事実:
- ユーザー作成は `signUp`（`registerPassword` を必ず呼ぶ）と `adminSignUp` のみ。
- SSO 系ポート/アダプター（`linkProvider`/`resolveProvider`）は定義はあるが、呼び出す usecase・ルートが一つも無い（OAuth サインインフロー未実装）。
- 既存ユーザーから password を剥がす `removePassword`/`unlinkProvider` を呼ぶ usecase も無い。

したがって「全ユーザーは必ず password を持つ」が現状の不変条件で、パスワード再検証による削除ブロックは現実に起きない。

### Consequences
- 良い点: スコープを最小に保ち、不要なフォールバック分岐を入れない。
- トレードオフ / 申し送り: 将来 SSO ログイン（OAuth フロー）を追加する場合は、パスワード未設定ユーザーの削除経路を再検討する必要がある。`hasPassword(userId)` ポートメソッドは既に存在するため、その時点でフォールバック（password 未設定なら別の確認手段にする等）の追加は容易。

---

## ADR-005: `confirmWord` を usecase に渡さない境界（S-005）の担保手段

### Status
Accepted

### Context
計画（テスト方針 S-005）は「`confirmWord` を含む入力でも usecase へ渡るのは `confirmation` + `currentPassword` のみで `confirmWord` は破棄される」ことを action 層テストで担保するとしていた。実装中に、本リポジトリには `createServerFn` ベースの action を単体テストする既存ハーネスが存在しないことを確認した（`identity/*/​__tests__/` はすべて client component の render テストで、action.ts を直接呼ぶテストは無い）。

### Decision
専用の action-test ハーネスを新設せず、以下の二段で境界を担保する:

1. **型レベル（最強の保証）**: `DeleteAccountInput` に `confirmWord` フィールドを追加しない。`action.ts` が `confirmWord` を usecase へ渡そうとすれば型エラーになるため、「backend が確認語に関与しない」境界はコンパイル時に強制される。`action.ts` 本体も `confirmation` + `currentPassword` のみを明示的に転送する（コメントで明記）。
2. **frontend テスト**: `AccountDeleteForm` の render テストで、client が server fn へ送るペイロードが `{ confirmation, currentPassword, confirmWord }` であること（transport で confirmWord を担保する分の送信）を assert。action.ts による confirmWord 破棄はその直後の段で、型で保証される。

### Consequences
- 良い点: 不要なテストインフラを増やさず、より強い「コンパイル時不変条件」で境界を担保する。
- トレードオフ: action.ts の「破棄」そのものを実行時 assert する単体テストは無い（型保証で代替）。将来 action-test ハーネスが導入されたら追加してよい。

---
