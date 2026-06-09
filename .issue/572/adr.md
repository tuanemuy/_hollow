# ADR — Issue #572: P22 アクティブセッション一覧

## ADR-001: 行単位ログアウトを token 流用ではなく id 所有者スコープ失効にする

### Status
Proposed

### Context
Issue 本文は「行単位ログアウトは既存 `revokeSession`（`sessionToken` を受け取る）を流用」と示唆している。しかし token 流用には 2 つの原則違反がある:
1. 各行の失効に token が必要 → token を client に出すことになり、Issue 明示の「session token を一覧 projection に含めない」要件に反する。
2. 既存 `revoke(token)` は所有者検証が無く、漏れた他人の token があれば任意ユーザーのセッションを失効できてしまう。

### Decision
`SessionService` port に `revokeByIdForUser(userId, sessionId)` を新設し、`sessions.id`（opaque UUID）+ 所有者スコープ（WHERE に userId を含める）で失効する。client は token ではなく projection の `id` のみを POST し、server function で `requireCurrentUser()` の actor とスコープ一致させる。既存 token ベース `revoke` / `revokeSession` は他フロー用に温存し変更しない。

### Consequences
- 良い点: token を client に出さない要件を満たす。他人の id を投機 POST されても所有者スコープ WHERE で失効不可。退行リスクの低い純粋追加。
- トレードオフ: port / adapter / usecase にメソッドが増える。`revoke` 系が token ベースと id ベースで併存する（用途で使い分け）。

---

## ADR-002: DTO に token・捏造値を含めず、実データのみ projection する

### Status
Proposed

### Context
モック `P22-settings-security.html` は地名・パース済み OS/ブラウザ名・デバイス画像・相対時刻（「2時間前」）を表示するが、DB の `sessions` テーブルには `userAgent` / `ipAddress` / タイムスタンプの生値しか無い。#543 ADR-004「虚偽表示禁止」が確立している。

### Decision
`SessionDTO = { id, isCurrent, userAgent, ipAddress, createdAt, updatedAt, expiresAt }` とし、token は含めない。userAgent の本格パース・地名解決・相対時刻整形は行わず、`session-title` は実値ベース（判別不能なら userAgent 素出し）、時刻は locale 絶対表示・正確な語ラベルで出す。device-parser や相対時刻ヘルパー導入はスコープ外（別 Issue）。

**「最終アクセス」ラベルは使わない:** `D1SessionService.issue` は `createdAt`=`updatedAt` で INSERT し、`resolve` は `updatedAt` を更新しない（活動ごとの更新経路が現状コードに無い）。よって `updatedAt` ≒ `createdAt`。モックの「最終アクセス」をそのまま表示すると虚偽になるため、UI には `createdAt` を「ログイン日時」として表示する。`SessionDTO` は将来の更新経路追加に備え `updatedAt` も保持するが、現時点で UI ラベルには使わない。

**層配置:** token 入りの `SessionRecord` は port 層（domain 寄り読み取り型）、token 抜きの `SessionDTO` は application 層に置く。projection（token 破棄）を application で行うことで「DTO に token を出さない」を型で担保する（CLAUDE.md「DTO projection は application 層」）。

### Consequences
- 良い点: 表示値が backend 実データに厳密一致し、捏造表示を排除。スコープを膨らませない。token 非露出を層境界で型保証。
- トレードオフ: モックの見た目より情報が素朴になる（OS アイコン・地名・「最終アクセス」なし）。必要なら別 Issue で device-parser / 活動時刻更新を検討。

---

## ADR-003: isCurrent を server 側で解決し client に token を渡さない

### Status
Proposed

### Context
「このセッション」バッジは現在リクエストの session token と各行の突き合わせで判定する。token を client に出すと ADR-002 / Issue 要件に反する。

### Decision
`SecurityForm/Page.tsx`（server component）で `getCurrentSessionToken()` を取得し、`listUserSessions({ input: { userId, currentSessionToken } })` に渡す。usecase 内 `toSessionDTO(record, currentSessionToken)` が `record.token === currentSessionToken` を server で比較して `isCurrent: boolean` を立て、token は射影で破棄する。client には bool のみ渡る。cookie 欠落（token null）時は全行 `isCurrent=false`。

### Consequences
- 良い点: token も生比較材料も client に渡らない。判定ロジックが application 層に集約。
- トレードオフ: usecase 入力に `currentSessionToken` を含める必要がある（presentation→application で明示的に引き回す）。

---

## ADR-004: 実装時の細部判断（title フォールバック・meta 構成・ログイン日時整形）

### Status
Accepted（実装で確定）

### Context
ADR-002 で「title は実値ベース・捏造禁止・`createdAt`=「ログイン日時」」と定めたが、実装で具体の表示文言・並びを確定する必要があった。

### Decision
- **session-title**: `userAgent` を素出し。null / 空白のみの場合は捏造デバイス名ではなく中立ラベル `不明な端末` にフォールバック（OS/ブラウザ名は推測しない）。`[overflow-wrap:anywhere]` で長い UA の折り返しを許容。
- **session-meta**: 1 行目は実在値のみ（現状 `ipAddress` のみ。null/空は出さない）を `·` 区切りで連結。地名・OS・ブラウザは出さない。2 行目は `ログイン日時: {createdAt}`（`toLocaleString("ja-JP", { dateStyle: "medium", timeStyle: "short" })`）。「最終アクセス」ラベルは使わない（ADR-002）。
- **アイコン**: device-parser が無いため全行同一の汎用ディスプレイ glyph（モックの端末別 glyph 切替は行わない）。
- **行失効の状態表示**: 各 `SessionRow` がローカルに `useTransition` + `error` state を持ち、失効中は `data-revoking` + ボタン disabled + ラベル「処理中...」、失敗時は行内に `FIELD_ERROR` で表示。成功時は `routerInvalidate` で再取得。

### Consequences
- 良い点: 表示は backend 実データに厳密一致。捏造ゼロ。device-parser 導入時はこの projection/表示層だけ差し替えればよい。
- トレードオフ: 現状 meta はほぼ IP のみで素朴。情報拡充は別 Issue（device-parser / geo / 活動時刻更新）。

---

## ADR-005: 行失効の状態フィードバック（data-revoking variant・成功の live region）

### Status
Accepted（レビュー Round 1 で確定）

### Context
レビューで 2 点指摘された: (1) `data-revoking` 属性を出すだけで消費する Tailwind variant が無く、視覚効果を駆動していなかった（ADR-004 は「data-revoking で失効中を示す」と記載）。(2) 一括失効は成功時に polite live region で件数をアナウンスするのに、行失効は「行が静かに消える」だけでスクリーンリーダーに成功が伝わらず非対称だった。

### Decision
- **data-revoking を活かす:** `SESSION_ROW` に `transition-opacity data-[revoking]:opacity-60` を追加し、失効中は行を淡色化する。属性が実際にスタイルを駆動するようにして「宙ぶらりんの状態属性」を解消。
- **成功の live region:** `SecurityForm` に `rowRevoked` state と `aria-live="polite"` の sr-only リージョンを持たせ、`SessionRow` から `onRevoked` コールバックで通知する。行は `routerInvalidate` で unmount するため、通知は親に置く（成功メッセージ「セッションをログアウトしました」をアナウンス）。

### Consequences
- 良い点: 失効中の視覚フィードバックと成功のアナウンスが、一括失効と非対称なく揃う。a11y 向上。
- トレードオフ: `SessionRow` に親への通知 prop（`onRevoked`）が増える。sr-only リージョンは視覚的には出ないが、視覚ユーザーには行消失そのものが成功サインになる。
