# Frontend レビュー — PR #775（Round 3 最終確認）

**PR:** 775  
**Round:** 3（収束確認）  
**対象コンポーネント:** `app/components/identity/SecurityForm/index.tsx`、`app/components/common/relativeTime.ts`  
**ADR 参照:** `.issue/615/adr.md`（ADR-001 ～ ADR-005）  
**レビュー日:** 2026-06-25

---

## Blockers

なし

---

## Warnings

### [W-001] ADR-005 の正当性は妥当だが、「計画外追加」の背景が明確化されたことを確認

**場所:** `.issue/615/adr.md` ADR-005 / `app/components/identity/SecurityForm/index.tsx` L182-184

**状況:**

Round 2 レビューで指摘：ログイン日時（session-meta 3 行目）は計画書（plan.md ステップ 8）に記載されておらず、モック（SSOT）にも表示されていない。ADR-005 で事後的に正当化される形になっていた。

Round 3 確認：ADR-005 の Description に以下が明記されている：

> 実装では、さらに 3 行目の「ログイン日時」行を表示している。計画ステップ 8 では session-meta を「2 行構成（IP / 最終アクセス）」と明記しており、ログイン日時の追加が明示的には計画に記載されていなかった。

**判定:**

- **実装は正確** — `createdAt` / `updatedAt` はいずれも実データベース値であり、虚偽表示禁止に違反していない
- **背景が透明化** — 計画外追加であることが ADR に明記され、#572 との整合性（既存表示との退行回避）が根拠として記録された
- **SSOT 乖離は意図的かつ記録済み** — ADR-005 Consequences で「モック（SSOT）は 2 行止まりのため、実装と行数が異なる。ただし差分の理由は明確（geo 見送り・ログイン日時保持）であり、SSOT 乖離は意図的で許容可能」と明記

**結論:** W-001 は Round 2 → Round 3 で透明性が確保されている。指摘対象の不明確さは ADR-005 により解決済み。追加対応不要。

---

## Notes

### [N-001] SessionIcon の aria-label が device kind を正確に表現（Round 2 対応確認）

**場所:** `app/components/identity/SecurityForm/index.tsx` L86-112

```tsx
const deviceKindLabels = {
  mobile: "スマートフォン",
  tablet: "タブレット",
  desktop: "デスクトップ",
  unknown: "不明な端末",
} as const;

function SessionIcon({ kind }: { kind: SessionDTO["device"]["kind"] }) {
  const label = deviceKindLabels[kind];
  return (
    <svg
      ...
      role="img"
      aria-label={label}
    >
      {deviceGlyph(kind)}
    </svg>
  );
}
```

**確認済み:**

- `role="img"` + `aria-label` で WCAG 2.1 AA standard に準拠
- device kind（形状分類）と device.label（OS + Browser）は情報が異なり、スクリーン リーダーで両方が無矛盾に読み上げられる
- `device.label = null` のときの sessionTitle フォールバック（userAgent → 不明な端末）と aria-label の情報が矛盾しない

**判定:** ✓ 対応済み、追加対応不要

---

### [N-002] formatRelativeTime と formatLoginTime の役割分離が明確

**場所:** `app/components/common/relativeTime.ts` / `app/components/identity/SecurityForm/index.tsx` L114-119, L179-184

```tsx
// 最終アクセス（相対表示）
<div className={SESSION_META}>
  最終アクセス: {formatRelativeTime(session.updatedAt)}
</div>

// ログイン日時（絶対表示）
<div className={SESSION_META}>
  ログイン日時: {formatLoginTime(session.createdAt)}
</div>
```

**良い点:**

- 相対時刻（「たった今」「3 分前」）で「最近の活動」を強調
- 絶対日時（「2026/06/25 1:38」）で「セッション開始時刻」を明確化
- 双方の表示意図が分離し、ユーザーの認知負荷を軽減
- `formatRelativeTime` の `now` 注入可で、テストが決定的

**判定:** ✓ 設計精密

---

### [N-003] deviceGlyph の kind 別分岐が精密で虚偽表示禁止を遵守

**場所:** `app/components/identity/SecurityForm/index.tsx` L60-84

```tsx
function deviceGlyph(kind: SessionDTO["device"]["kind"]) {
  if (kind === "mobile") {
    return (
      <>
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
        <line x1="12" y1="18" x2="12.01" y2="18" />
      </>
    );
  }
  if (kind === "tablet") {
    return (
      <>
        <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
        <line x1="12" y1="18" x2="12.01" y2="18" />
      </>
    );
  }
  return (
    <>
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </>
  );
}
```

**検証:**

- `mobile`: `rect(14x20)` — 縦長フォルム（スマートフォン）✓
- `tablet`: `rect(16x20)` — 標準フォルム（タブレット）✓
- `desktop` / `unknown`: `rect(20x14)` + stand lines — 横長モニタ形状（汎用）✓
- `unknown` が **別形状でなく汎用 glyph を再利用** — 虚偽表示禁止を型・実装で徹底 ✓

**判定:** ✓ モック SVG パス流用、精密で正確

---

### [N-004] sessionTitle の null フォールバック構造が三段階で堅牢

**場所:** `app/components/identity/SecurityForm/index.tsx` L127-131

```typescript
function sessionTitle(session: SessionDTO): string {
  if (session.device.label !== null) return session.device.label;
  const ua = session.userAgent?.trim();
  return ua !== undefined && ua !== "" ? ua : "不明な端末";
}
```

**検証:**

1. **第 1 優先:** `device.label !== null` → 「Chrome on macOS」形式（パース済み）
2. **第 2 優先:** `userAgent` が存在・非空 → UA 素出し（情報透明性）
3. **第 3 優先:** 「不明な端末」 → 中立フォールバック

**良い点:**

- 空文字列チェック（`ua !== ""`）で「見かけ上の情報がない」を区別
- すべてのパスで推測ラベルを避ける（虚偽表示禁止）
- `device.label` と raw `userAgent` の役割分離が明確

**判定:** ✓ 堅牢で虚偽表示禁止に適合

---

### [N-005] formatRelativeTime の「たった今」粒度が ACTIVITY_THROTTLE_MS と整合

**場所:** `app/components/common/relativeTime.ts` L15-28

```typescript
const JUST_NOW_MS = 5 * MINUTE_MS;  // 5 分

export function formatRelativeTime(
  instant: string,
  now: Date = new Date(),
): string {
  const then = new Date(instant).getTime();
  const diff = now.getTime() - then;

  if (diff < JUST_NOW_MS) return "たった今";
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)} 分前`;
  // ...
}
```

**整合性検証:**

Round 2 で確認した通り：

- `ACTIVITY_THROTTLE_MS = 5 * 60 * 1000`（5 分）@ `app/core/adapters/d1/repositories/sessionService.ts` L30
- `JUST_NOW_MS = 5 * 60 * 1000`（5 分）@ `app/components/common/relativeTime.ts` L18
- Adapter コメント（L27-28）: 「relativeTime の『たった今』以下に保つ」と相互参照

**判定:** ✓ スロットル幅と「たった今」粒度が同値で、粒度違和感なし。ADR-003 / ADR-004 の設計意図が実装で徹底されている。

---

### [N-006] session-meta の IP 行が null ガード付きで虚偽表示を回避

**場所:** `app/components/identity/SecurityForm/index.tsx` L176-178

```tsx
{ip !== undefined && ip !== "" ? (
  <div className={SESSION_META}>{ip}</div>
) : null}
```

**検証:**

- `ipAddress?.trim()` で undefined 処理
- 空文字列チェック（`!== ""`）で二重ガード
- localhost / プライベート IP の null 返却時は行ごと非表示
- 虚偽ラベル「不明な IP」等を出さない ✓

**判定:** ✓ 条件ガード適切、虚偽表示禁止に適合

---

### [N-007] Tailwind utility-first 原則に準拠、module-scoped string constant使用

**場所:** `app/components/identity/styles.ts` L153

```typescript
export const SESSION_META = "text-xs text-ink-tertiary leading-normal";
```

**検証:**

- CLAUDE.md の「Tailwind utility-first only」に準拠
- 直接 className に utilities を書かず、module-scoped string constant で集約（`app/components/common/styles.ts` / `auth/styles.ts` パターンを踏襲）
- `@apply` や handwritten CSS なし ✓
- `data-*` attributes で state 管理（`data-revoking` @ L163）✓

**判定:** ✓ スタイリング規約に適合

---

### [N-008] 発行直後セッションの初期状態（createdAt == updatedAt）が正しく表示される

**計画書記載内容（plan.md S-002）:**

> 発行直後セッションの初期状態の見え方（S-002）： `recordActivity` で更新経路は必ず入るが、まだ一度も活動 touch されていない発行直後のセッションは `updatedAt == createdAt` となるため、「ログイン日時（createdAt 絶対表示）」と「最終アクセス（updatedAt 相対表示）」が同一時刻を指し、相対側が「たった今 / ログイン直後」のように createdAt と重複して見えることがある。これは虚偽ではなく初期状態の正しい表示であり（活動が進めば最終アクセスだけ更新される）、バグではない。

**確認:**

- **実装が意図どおり** — createdAt / updatedAt が同じ時刻なら、相対側も絶対側も「たった今」「直後」になり、重複表示は正しい初期状態
- **虚偽表示なし** — 両方とも実データベース値

**判定:** ✓ 初期状態が正確、検証者が「重複は仕様か」で迷わないよう plan.md で記録済み

---

## 最終判定

**Approve（全項目クリア）**

### 合計

| カテゴリ | 件数 | 説明 |
|---------|-----|------|
| **Blockers** | 0 | なし |
| **Warnings** | 1 | W-001: ADR-005 の背景（計画外追加）が Round 3 で透明化完了 |
| **Notes** | 8 | 技術精密・虚偽表示禁止遵守・a11y 適合・Tailwind 規約準拠 |

### 主要確認事項（Round 3）

1. **ADR-005 の透明性確保** ✓
   - 計画外追加（ログイン日時）が意図的であることが明記された
   - SSOT（モック）乖離の理由が明確（geo 見送り・ログイン日時保持）
   - 実データベース値のため虚偽表示なし

2. **a11y 適合** ✓
   - SessionIcon の `role="img"` + `aria-label` が WCAG 2.1 AA standard に準拠
   - device kind と device.label が無矛盾に読み上げられる
   - フォールバック経路が整合

3. **虚偽表示禁止（#543 ADR-004 / #572 ADR-002）を徹底** ✓
   - deviceGlyph の `unknown` が汎用 glyph（推測なし）
   - sessionTitle の三段階 fallback がすべて実データ or 中立ラベル
   - session-meta の IP 行が null ガード付き

4. **スロットル幅と相対表示の粒度整合（ADR-003 / ADR-004）** ✓
   - `ACTIVITY_THROTTLE_MS` = `JUST_NOW_MS` = 5 分
   - 「たった今活動したのに『N 分前』」の違和感なし

5. **Tailwind utility-first 原則準拠** ✓
   - module-scoped string constant で集約
   - 条件付き className なし、data-* attributes で state 管理
   - 手書き CSS / @apply なし

6. **テスト品質** ✓
   - `formatRelativeTime.test.ts` で粒度別の境界テスト完備
   - `deviceInfo.test.ts` で parse 結果 / kind / label / null フォールバック検証
   - `relativeTime` の `now` 注入で決定的テスト

---

## テスト検証済み項目

- ✓ SessionIcon の kind 別 SVG glyph（mobile / tablet / desktop / unknown）
- ✓ sessionTitle の 3 段階 fallback（device.label → userAgent → 不明な端末）
- ✓ formatRelativeTime の粒度別バケッティング（たった今 / 分 / 時間 / 日 / 絶対日付）
- ✓ device.label の合成（OS + Browser）と null フォールバック
- ✓ ACTIVITY_THROTTLE_MS と JUST_NOW_MS の整合（5 分 = 5 分）
- ✓ session-meta の IP 行 null ガード
- ✓ aria-label / role の WCAG 適合
- ✓ formatLoginTime の locale 絶対表示（ja-JP）

---

## レビュアー所見

Frontend の観点では、PR #775 は **技術的に正確で精密**。虚偽表示禁止原則（#543 ADR-004 / #572 ADR-002）を TypeScript 型・JSDoc・実装コメント・ADR 記録で多層的に遵守している。

特に以下の点が評価できる：

1. **device-parser が純粋ドメインサービス** — I/O なし、判別不能は null、虚偽ラベル一切なし
2. **相対時刻ヘルパーが presentation 層に正しく配置** — `now` 注入で決定的テスト容易、スロットル幅と粒度が整合
3. **icon の a11y が徹底** — device kind / device.label が無矛盾、フォールバック経路が正確
4. **SSOT（モック）乖離が透明かつ意図的** — ADR-005 で背景が記録され、実装は正確

Round 3 で確認した通り、Round 2 の「計画外追加」指摘は ADR-005 により完全に透明化されている。

---

**最終ステータス:** APPROVED（全 Blocker / Warning クリア）

**レビュアー:** Claude Code  
**最終確認ファイル:**
- `app/components/identity/SecurityForm/index.tsx` — SessionIcon / SessionRow / sessionTitle / formatLoginTime（L60-184）
- `app/components/common/relativeTime.ts` — formatRelativeTime の粒度・文言・`now` 注入（L1-40）
- `.issue/615/adr.md` — ADR-001 ～ ADR-005（正当性・背景の透明化）
- `spec/design/pages/P22-settings-security.html` — SSOT（モック）との乖離確認
- `.issue/615/plan.md` — 計画書との対比（計画外追加の確認）

---
