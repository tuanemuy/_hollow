# Frontend レビュー — PR #775（Round 2）

**PR:** 775  
**Round:** 2（再レビュー）  
**対象コンポーネント:** `app/components/identity/SecurityForm/index.tsx`、`app/components/common/relativeTime.ts`  
**ADR 記録:** `.issue/615/adr.md`（ADR-005 新規）  
**レビュー日:** 2026-06-25

---

## Blockers

なし

---

## Warnings

### [W-001] ADR-005 の正当性判断に留保あり — モック（SSOT）乖離の許容基準が主観的

**場所:** `.issue/615/adr.md` ADR-005 / `app/components/identity/SecurityForm/index.tsx` L182-184

**詳細:**
- **実装状況:**
  ```tsx
  {ip !== undefined && ip !== "" ? (
    <div className={SESSION_META}>{ip}</div>
  ) : null}
  <div className={SESSION_META}>
    最終アクセス: {formatRelativeTime(session.updatedAt)}
  </div>
  <div className={SESSION_META}>
    ログイン日時: {formatLoginTime(session.createdAt)}
  </div>
  ```
  → **session-meta は 3 行構成**（IP / 最終アクセス / ログイン日時）

- **モック（SSOT）:** `spec/design/pages/P22-settings-security.html` L787-788, 797-798, 808-809, 819-820
  ```html
  <div class="session-meta">macOS 15.4 · Safari 18 · 京都 / 日本 · 192.0.2.41</div>
  <div class="session-meta">最終アクセス: たった今</div>
  ```
  → **session-meta は 2 行構成**（device·地名·IP の複合行 / 最終アクセス）。**ログイン日時なし**

- **計画書（.issue/615/plan.md）:** ステップ 8 L152-154
  > `session-meta` を 2 行構成にする — 1 行目: IP（null なら省略）、2 行目: 「最終アクセス: {formatRelativeTime(updatedAt)}」

  → 計画もログイン日時の追加を明記していない

- **ADR-005 の正当化理由:**
  1. 実データの正確性（createdAt / updatedAt はいずれも実データベース値）
  2. #572 との整合（既存セッション管理画面で「ログイン日時」「最終アクセス」は既に表示）
  3. 認証証跡の透明性（「いつからこのセッション活動か」の双方向情報）

**問題点:**

ADR-005 の判断自体は**実装上の正当性を持つ**（実データベース値・既存画面との一貫性）。しかし：

1. **SSOT（モック）との乖離が意図的であることは明記されたが、許容基準が主観的**
   - 「SSOT 乖離は意図的で許容可能」（ADR-005 Consequences）という判断は、実装者・レビュアーの合意に基づくが、SSOT は「truth の source」であり、乖離を正当化する際は「なぜ SSOT 自体を更新しないのか」という問いが残る

2. **geo 見送りと「ログイン日時追加」は異なる判断タイプ**
   - geo 見送り（ADR-002）：実装不可能（外部依存）→ 正当な見送り
   - ログイン日時追加（ADR-005）：実装可能・有用だが計画に記載なし → 計画外機能の追加に該当
   - 「追加することで実装品質が上がる」という判断は理解できるが、「計画外追加」であることを明示する必要がある

3. **UI スコープの線引きが曖昧**
   - 計画の AC-5「相対化は努力目標」という文言と、ADR-005「ログイン日時は維持（s-003）」が「努力目標」vs 「維持すべき」で優先度が異なる
   - #572 で既に表示されているから「退行させない」という論理は、#572 の表示仕様を踏襲する根拠になるが、本 Issue のモック（SSOT）に含まれないこととの間に tension がある

**理由:**

CLAUDE.md / 設計原則では：
- SSOT（`spec/design/pages/P22-settings-security.html`）がすべてのデザイン判断の起点
- 実装がモックと乖離する場合、乖離の理由を ADR に記録し、なぜモック自体を更新しないのかを説明する必要がある
- Round 1 で W-001 が指摘され、ADR-005 で事後的に正当化されたもので、事前計画に記載されていない

**提案:**

1. **判断の明確化:** ADR-005 を以下のように改訂提案（現在の正当化は妥当だが、記述を精密に）
   - **Background に「計画外追加」を明記** — 「計画 ステップ 8 では 2 行構成（IP / 最終アクセス）と明記し、ログイン日時追加は記載されていなかった」
   - **Decision を「意図的な計画外追加」と明示** — 「ただし #572 の既存表示を踏襲して実装を進めた」「SSOT との乖離は意図的で、理由は…」と記録
   - **Consequences の「SSOT 乖離」を「許容」から「やむなし」に改める** — 「現状が正しい」ではなく「代替案がない中での判断」として慎重に記す

2. **SSOT 同期の検討:** SSOT（`spec/design/pages/P22-settings-security.html`）を更新するか、逆に実装からログイン日時を削除するかの二択を明確にすることを推奨（今後の一貫性のため）

3. **ドキュメント化:** 計画書の ステップ 8 に「実装時の追加判断（ログイン日時）」を補記するか、spec（`spec/usecases/identity.md`）に「session-meta は実装上 3 行（IP / 最終アクセス / ログイン日時）」と明記すること（SSOT との差分を spec に記録）

**現状の実装の正確性は確認済み** — createdAt / updatedAt 両方の表示は虚偽でなく、#572 との整合も取れている。ただし、**計画外追加という背景が明確になったため**、次の Issue 計画では「UI スコープ（何を出すか）」を計画段階で厳密に定め、SSOT ↔ 計画 ↔ 実装の三者を常に同期させることを推奨。

---

### [W-002] SessionIcon の aria-label が device kind を正しく表現しているか確認

**場所:** `app/components/identity/SecurityForm/index.tsx` L86-112（deviceKindLabels / SessionIcon）

**詳細:**
- **実装:**
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

- **状況:**
  - Round 1 W-003 で指摘：icon-only で device 種別が視覚のみに頼っていないか
  - Round 1 の対応で `role="img"` + `aria-label={deviceKindLabels[kind]}` を追加
  - Session title には `device.label`（「Chrome on macOS」等）が表示されており、icon 単体の情報不足は補完されている

**確認事項（審査実施）:**

1. **aria-label の文言が適切か** ✓
   - `device.label` は OS + Browser 合成（「Chrome on macOS」）
   - `aria-label` は device kind（「デスクトップ」「スマートフォン」）
   - **二つの情報が異なる（重複しない）点は良い** — スクリーン リーダーユーザーが「デスクトップ」+「Chrome on macOS」で device の形状と環境の両方を把握できる

2. **device.label = null のときのフォールバック** ✓
   - sessionTitle（L127-131）が `device.label → userAgent → 不明な端末` の優先順
   - `device.label = null` でも `userAgent` 素出しで情報が出る
   - **最悪ケース（label null / userAgent 空）で「不明な端末」fallback** — icon の aria-label は「不明な端末」で、二重の情報が矛盾しない

3. **accessibility 慣習との整合** — 既存コードベースの aria-* 使法を確認
   - `role="img"` + `aria-label` の組み合わせは WCAG 2.1 AA standard に従う（image role には alt テキスト相当として aria-label が必須）
   - SVG に直接 `role="img"` + `aria-label` を付けるのは正しい（`aria-hidden` でなく）

**判定:**  **実装は正確で追加対応不要**。Round 1 の W-003 は十分に対応済み。

---

## Notes

### [N-001] formatRelativeTime と formatLoginTime の役割分離が明確

**場所:** `app/components/common/relativeTime.ts` / `app/components/identity/SecurityForm/index.tsx` L114-119, L180-184

**詳細:**
- `formatRelativeTime(instant: string, now?: Date): string`
  - 出力例：「たった今」「3 分前」「2 時間前」「5 日前」「2026年5月8日」
  - 最終アクセス（updatedAt）に使用 → 相対表示で「直近の活動」を強調

- `formatLoginTime(instant: string): string`
  - 出力例：「2026/06/25 1:38」（locale string `ja-JP`, `dateStyle: "medium"`, `timeStyle: "short"`）
  - ログイン日時（createdAt）に使用 → 絶対表示で「セッション開始時刻」を明確化

**良い点:**
- 二つの時刻が表示意図の違い（「最近か」vs 「いつ開始したか」）を反映している
- `formatRelativeTime` の `now` 注入でテスト決定的。`formatLoginTime` は locale 依存だが、UI 出力の一貫性が得られている
- 相対時刻ヘルパーが presentation 層（`app/components/common/`）に置かれており、責務分離が正しい

---

### [N-002] deviceGlyph の kind 別分岐が精密で虚偽表示禁止を遵守

**場所:** `app/components/identity/SecurityForm/index.tsx` L60-84

**詳細:**
- `mobile`: `rect(14x20)` + home button point → スマートフォンの縦長フォルム
- `tablet`: `rect(16x20)` + home button point → タブレットの横長フォルム（モバイルより広い）
- `desktop`: `rect(20x14)` + stand lines → デスクトップモニタの横長フォルム
- `unknown`: desktop と同じ汎用 monitor glyph → **判別不能時に推測アイコンを作らない**（虚偽表示禁止原則）

**良い点:**
- SVG パス（rect 寸法・line 位置）の精度でモックの glyph を正確に流用
- `unknown` が別形状でなく汎用 glyph を再利用する意図が ADR-001 コメント（L55-59）に明記されている
- **虚偽表示禁止の実装が型・コード両面で徹底されている**

---

### [N-003] sessionTitle の null フォールバック構造が三段階で堅牢

**場所:** `app/components/identity/SecurityForm/index.tsx` L127-131

```typescript
function sessionTitle(session: SessionDTO): string {
  if (session.device.label !== null) return session.device.label;
  const ua = session.userAgent?.trim();
  return ua !== undefined && ua !== "" ? ua : "不明な端末";
}
```

**検証:**
1. `device.label !== null` — OS + Browser 合成済み（「Chrome on macOS」）→ **第 1 優先**
2. `userAgent` が存在・非空 → **第 2 優先**（UA 素出しで情報透明性を保つ）
3. fallback 「不明な端末」 → **第 3 優先**

**良い点:**
- 空文字列チェック（`ua !== ""`）が入っており、「見かけ上の情報がない状態」を区別している
- すべてのパスで虚偽（推測ラベル）を避けている
- `device.label` と raw `userAgent` の役割分離が明確（パース済み ↔ 生データ）

---

### [N-004] formatRelativeTime の「たった今」粒度が ACTIVITY_THROTTLE_MS と整合済み（W-002 対応確認）

**場所:** `app/components/common/relativeTime.ts` L15-28

**詳細:**

計画 S-004 の「スロットル幅 ≤『たった今』粒度」が実装で整合しているか検証：

```typescript
const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const JUST_NOW_MS = 5 * MINUTE_MS;  // ← 5 分

export function formatRelativeTime(
  instant: string,
  now: Date = new Date(),
): string {
  const then = new Date(instant).getTime();
  const diff = now.getTime() - then;

  if (diff < JUST_NOW_MS) return "たった今";  // ← 5 分未満
  if (diff < HOUR_MS) return `${Math.floor(diff / MINUTE_MS)} 分前`;
  // ...
}
```

**検証済み内容（Round 1 W-002 から）:**

`.issue/615/manual-test/results/TC-03.md` および `app/core/adapters/d1/repositories/sessionService.ts` で：
- `ACTIVITY_THROTTLE_MS = 5 * 60 * 1000` （5 分）
- `JUST_NOW_MS = 5 * 60 * 1000` （5 分）
- adapter コメント（L27-28）で「relativeTime の『たった今』以下に保つ」と相互参照

**判定:** ✓ **整合済み**。スロットル幅と「たった今」粒度が同値で、「たった今活動したのに『5 分前』」という違和感は出ない。

---

### [N-005] session-meta の IP 行が null ガード付きで虚偽表示を回避

**場所:** `app/components/identity/SecurityForm/index.tsx` L176-178

```tsx
{ip !== undefined && ip !== "" ? (
  <div className={SESSION_META}>{ip}</div>
) : null}
```

**良い点:**
- `ipAddress?.trim()` で undefined 処理、さらに空文字列チェック（`!== ""`）で二重ガード
- localhost / プライベート IP の null 返却時は行ごと非表示（虚偽ラベル「不明な IP」等を出さない）
- モック（SSOT）と一致（L787-788 で device·IP 複合行だが、本実装は IP 素出し）

---

### [N-006] ADR-005 の Consequences で SSOT 乖離を記録している点は良い（透明性）

**場所:** `.issue/615/adr.md` ADR-005 Consequences

> トレードオフ: モック（SSOT）は 2 行止まりのため、実装と行数が異なる。ただし差分の理由は明確（geo 見送り・ログイン日時保持）であり、SSOT 乖離は意図的で許容可能。

**評価:**

- **透明性が高い** — 乖離を隠さず、理由を明記している
- ただし「なぜモック自体を更新しないのか」という問いに対する答えが「ADR で記録するだけ」になっており、SSOT の権威が相対的に低下している可能性

**推奨:** 今後の Issue では、計画段階で SSOT を確定した後、計画外の追加が発生した場合 **SSOT も同期更新する** 仕組みを検討（工数増だが、SSOT の一貫性を高める）。

---

## サマリー

| カテゴリ | 件数 | 説明 |
|---------|-----|------|
| **Blockers** | 0 | なし（実装は技術的に正確） |
| **Warnings** | 2 | W-001: SSOT 乖離・計画外追加の背景明確化, W-002: SessionIcon aria-label（審査実施、対応済み） |
| **Notes** | 6 | 技術的には正確・精密（formatRelativeTime 粒度整合 / deviceGlyph 虚偽表示禁止遵守 / sessionTitle fallback 堅牢） |

---

## 主要指摘

### ❶ W-001: ADR-005（session-meta 3 行化）の正当性は妥当だが、「計画外追加」の背景を明確に

**現状:** ログイン日時（3 行目）は計画に記載なく、モック（SSOT）にも表示されていない。ADR-005 で事後的に正当化。

**評価:** 
- 実装は**正確**（実データベース値 createdAt / updatedAt）
- #572 の既存表示を踏襲した判断は**理解可能**
- ただし「計画外追加」であることが透明になった

**推奨：** 
- 今後の計画では「UI スコープ（何を出すか）」を計画段階で SSOT と完全同期
- 計画外追加が発生した場合は SSOT も更新するか、明示的にスコープ外に記録

### ❷ W-002: SessionIcon の aria-label は正確（Round 1 対応確認済み）

device kind 別の日本語ラベル（「デスクトップ」「スマートフォン」「タブレット」）が `aria-label` に入り、スクリーン リーダーで読み上げられる。title の `device.label`（「Chrome on macOS」）と役割が分離され、両方の情報が無矛盾。追加対応不要。

### ❸ 技術的には精密で虚偽表示禁止を遵守

- `formatRelativeTime` の「たった今」粒度が `ACTIVITY_THROTTLE_MS` と同値で整合
- `deviceGlyph` の `unknown` が汎用 glyph で推測ラベルを避ける
- `sessionTitle` の三段階 fallback（label → userAgent → 不明な端末）が堅牢
- `session-meta` の IP 行が `null` ガード付きで虚偽表示なし

---

## テスト検証状況

### 実施済み（Round 1 レビューで確認）

- ✓ deviceGlyph 種別別の SVG path 確認（TC-02）
- ✓ 最終アクセス相対時刻の表示（TC-03）
- ✓ 相対時刻ヘルパーの文言（TC-04）
- ✓ geo なし・IP 素出し（TC-05）
- ✓ 判別不能 UA フォールバック（TC-06）
- ✓ スロットル幅と「たった今」粒度整合（W-002 解決）

### 今後（PR マージ後の工程）

- 計画書 ステップ 8 の補記（ログイン日時追加の明記）
- spec（`spec/usecases/identity.md`）の session-meta 行数を「3 行（IP / 最終アクセス / ログイン日時）」に更新

---

## 最終判定

**Approve with notes**

Frontend の観点では技術的に正確・精密であり、虚偽表示禁止原則を遵守している。W-001 は「計画外追加の透明性」に関する記録上の指摘であり、実装自体の正確性に問題はない。次回 Issue 計画からの改善を推奨。

---

**レビュアー:** Claude Code  
**確認済みファイル:**
- `app/components/identity/SecurityForm/index.tsx` — SessionIcon / SessionRow / sessionTitle / formatLoginTime（L60-184）
- `app/components/common/relativeTime.ts` — formatRelativeTime の粒度・文言（L15-40）
- `.issue/615/adr.md` — ADR-005（正当性審査）
- `spec/design/pages/P22-settings-security.html` — モック（SSOT）との乖離確認
- `.issue/615/plan.md` — 計画書ステップ 8（計画と実装のズレ確認）
- `.issue/615/manual-test/results/` — テスト結果（TC-02 ～ TC-06 確認）
