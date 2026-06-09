# PR Review #001 — feat(settings): P22 アクティブセッション一覧

**PR:** #614
**Date:** 2026-06-09
**Round:** 1回目

---

## Summary

- Blockers: 0
- Warnings: 6
- Notes: 多数（良好）
- Verdict: **BLOCKED**（Warning 完全消化方針のため）

---

## Backend

### Blockers
なし

### Warnings
- **[B-W-001]** `sessionId` がトランスポート由来の `z.string().min(1)` のみで UUID 検証がない非対称。`UserId` は VO 検証されるのに `sessionId` は素通り。所有者スコープ WHERE で実害はないが意図が不明瞭。
  - 場所: `app/components/identity/schema.ts:31-33` + `revokeUserSession.ts`
  - 提案: 「id は検証せず所有者スコープのみで安全担保」の意図を JSDoc に一文残す。
- **[B-W-002]** `SessionDTO.updatedAt` が現状 dead field（`createdAt` と同値・更新経路なし・UI 非使用）。後続実装者が「最終アクセス時刻」と誤認するリスク。
  - 場所: `app/core/application/dto/identity.ts:88`
  - 提案: 型定義に「現状 createdAt と同値・更新経路なし・UI 非使用」の JSDoc を添える。

### Notes
- 期限切れ判定が `resolve` と完全一致、所有者スコープ冪等失効が型・実装・テストの三層で担保、token 非露出の層配置が設計どおり、usecase 引数形・命名・spec 追記すべて整合。

---

## Frontend

### Blockers
なし

### Warnings
- **[F-W-001]** `data-revoking` がデッド属性。set 1 箇所のみで消費する Tailwind variant が存在せず、何のスタイルも駆動していない。ADR-004 は「data-revoking + disabled + ラベル」と書くが variant を欠く。
  - 場所: `app/components/identity/SecurityForm/index.tsx:117`
  - 提案: variant を `SESSION_ROW` に追加して属性を活かす（例 `data-[revoking]:opacity-60`）か、属性を削除する。
- **[F-W-002]** 行失効成功時の live region 通知がない。バルク失効は成功時に polite アナウンスするのに、行失効は「行が静かに消える」だけで非対称。SR 利用者に成功が伝わりにくい。
  - 場所: `app/components/identity/SecurityForm/index.tsx:135-139` 周辺
  - 提案: 行失効成功時にも polite な live region 通知を出すか、非対称を許容する判断を ADR に明記。

### Notes
- 状態管理が `onRevokeAll` と同型、非current行のみ失効ボタン、捏造ラベル排除徹底、styling utility-first 規約準拠、Page.tsx データ取得が ProfileForm と整合、`routerInvalidate` 選択が正しい。

---

## Security

### Blockers
なし

### Warnings
なし

### Notes
- token 非露出が型レベルで担保、行失効が所有者スコープで IDOR 不成立、入力検証が transport 境界で有効、isCurrent が server 完結、期限切れ除外、認可 defense が integration test で直接検証、token のログ出力なし。**Security 観点で完全クリーン。**

---

## Test

### Blockers
なし

### Warnings
- **[T-W-001]** frontend の `revokeSessionFn` 呼び出し検証が「どの server fn か」を区別できていない。単一 fallback mock を全 server fn で共有しており、payload 一致で通っているだけ。誤って別 fn に配線されても同 payload なら検出不能。
  - 場所: `app/components/identity/SecurityForm/__tests__/index.test.tsx:28,142`
  - 提案: `useServerFnRouter([[revokeSessionFn, revokeMock], ...], fallback)` で個別モックを割り当て、`revokeMock` に対して assert する。
- **[T-W-002]** 一覧並び順テストに sub-millisecond の死角。`orderBy(desc(createdAt))` が単独ソートで tiebreak なし、ms 衝突時にソート不定で偽陽性になりうる。
  - 場所: `app/core/application/identity/__tests__/identity.integration.test.ts:1036-1039`
  - 提案: 各 `logIn` の `userAgent` を別値にし、期待する id/UA 配列との完全一致で順序を確定検証する。

### Notes
- `toSessionDTO` unit テストが token 非露出を二重検証 + isCurrent 3分岐網羅、integration が real D1 規約に忠実、不自然なキャストなし、期限切れ除外で空一覧も実質カバー、UA verbatim 表示テストあり。

---

## Design Decisions

このラウンドの修正に伴う設計判断は adr.md ADR-004 に追記する（data-revoking を活かす方針、行失効成功の live region 通知）。
