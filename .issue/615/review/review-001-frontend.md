# Frontend レビュー — PR #775

**PR:** 775  
**Plan:** `.issue/615/plan.md`  
**SSOT モック:** `spec/design/pages/P22-settings-security.html`  
**レビュー日:** 2026-06-25

---

## Blockers

なし

---

## Warnings

### [W-001] session-meta 行構成がモック（SSOT）と乖離

**場所:** `app/components/identity/SecurityForm/index.tsx` L167-175

**詳細:**
- モック L787-788 の構造:
  ```html
  <div class="session-meta">macOS 15.4 · Safari 18 · 京都 / 日本 · 192.0.2.41</div>
  <div class="session-meta">最終アクセス: たった今</div>
  ```
  → **`·` で区切られた「OS · ブラウザ · 地名 · IP」の 1 行** + **「最終アクセス」の 2 行目**

- 実装 L167-175:
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
  → **IP のみの 1 行目** + **「最終アクセス」の 2 行目** + **「ログイン日時」の 3 行目**

**問題点:**
- 計画の AC-4 / ステップ 8「`session-meta` を 2 行構成に」は **`·` 連結複合行は作らない** と明記し、`device` はタイトルへ集約することを決定済み。実装は設計どおり IP と相対時刻のシンプルな 2 行
- しかし **「ログイン日時」は計画書に明記されず**、計画 S-003 では「`formatLoginTime` の絶対表示は維持（努力目標）」と述べているが、session-meta に組み込むかどうかは詰まっていない
- モック は ログイン日時を表示していない（3 行目なし）。モック は SSOT だが、計画 AC-5 では「相対化は努力目標」とし、「絶対表示のままでも AC-5 違反としない」としている
- **この 3 行目が計画に記録されていない実装変更になっている可能性**がある（後付け判断または計画外追加）

**理由:**
- 実装が計画と一言一句一致すべき強制ではないが、UI ラウトの行数や見た目が増えた場合は計画に反映するか、レビューで明示する必要がある
- モック は 2 行止まり（ログイン日時なし）

**提案:**
1. **計画書に「ログイン日時を session-meta 3 行目に追加」を補記するか、** 
2. **モック（SSOT）との一貫性のため ログイン日時を削除するか** 
   を判断して一意化する（レビュアー・実装者の確認推奨）

---

### [W-002] formatRelativeTime の JUST_NOW_MS と ACTIVITY_THROTTLE_MS の粒度整合の検証漏れ

**場所:** `app/components/common/relativeTime.ts` L18

**詳細:**
- `JUST_NOW_MS = 5 * 60 * 1000` (5 分) に設定されている
- 計画 S-004 では「スロットル幅 ≤ 『たった今』で吸収できる粒度」を主張し、リスク欄・ADR-003/004 で整合を要求
- しかし **`ACTIVITY_THROTTLE_MS` が実装のどこかで定義されているか確認できていない**
  - `app/core/adapters/d1/repositories/sessionService.ts` 内で定義されているはず（計画 ステップ 5）だが、PR で削除または定義漏れの可能性
- **スロットル幅を見ずに `JUST_NOW_MS = 5` 分で固定すると、実装側のスロットル幅（例：10 分）より短くなり、「たった今なのに『1 分前』」という違和感が出る**

**理由:**
- 計画に明記された不変条件。スロットルと相対表示の粒度ミスマッチは UX 説得力を損ねる
- domain 層のスロットル定数が presentation 層と同期される仕組みがない

**提案:**
1. `app/core/adapters/d1/repositories/sessionService.ts` で `ACTIVITY_THROTTLE_MS` が定義されているか確認
2. その値に合わせて `JUST_NOW_MS` を再評価（「たった今」≥ スロットル幅）
3. 同期を型・ドキュメント・ADR-003 で明記

**→ 確認済み（解決）** — `relativeTime.ts` の `JUST_NOW_MS = 5 * 60 * 1000`（5 分）と adapter L30 の `ACTIVITY_THROTTLE_MS = 5 * 60 * 1000` が一致。adapter コメント（L27-28）で「relativeTime の『たった今』以下に保つ」と相互参照。両定数は同値で整合済み。

---

### [W-003] SVG aria-hidden は良いが、icon-only な device glyph の意味が視覚のみに頼っていないか

**場所:** `app/components/identity/SecurityForm/index.tsx` L98 + L60-84（deviceGlyph）

**詳細:**
- `SessionIcon` の SVG に `aria-hidden="true"` が正しく設定されている（L98 ✓）
- しかし **device kind は icon glyph のみで伝えられており**、スクリーン リーダー利用者には見えない
- タイトル（`sessionTitle`）に `device.label`（"Chrome on macOS" 等）を表示しているため、視覚ユーザーは OS/ブラウザ + icon glyph で二重確認可能だが、スクリーン リーダーはタイトルのテキストだけに頼ることになる
- **desktop / mobile / tablet の区別がアイコンのジェスチャーに隠れていないか** という観点では問題ないと思われるが、icon-only 情報の視覚依存リスク

**理由:**
- CLAUDE.md のアクセシビリティ規約を遵守するためのチェック
- 通常は device.label に「iOS」「macOS」等の OS トークンが入るため、タイトルで十分な情報が見えるはず

**提案:**
- 問題なし（タイトルの `device.label` で device 種別は読み上げられる）。ただし、異常系（`device.label === null` で `userAgent` 素出しor「不明な端末」）では icon glyph だけが kind を表すため、**「タブレットから アクセス」という情報がアイコンのみ**になる可能性。
- session-meta に「device kind」テキストを追加するか（「iPad のような tablet デバイス」等）、またはアイコン直後に `<span aria-label="...">` を追加するかの検討推奨（軽微）

**→ 確認済み（解決）** — SVG に `role="img"` + `aria-label={deviceKindLabels[kind]}` を追加。device 種別（スマートフォン / タブレット / デスクトップ / 不明な端末）がスクリーン リーダーで読み上げられるようになった。

---

## Notes

### [N-001] SessionIcon の glyph 切り替え実装が精密

**場所:** `app/components/identity/SecurityForm/index.tsx` L60-84

デバイス種別（desktop / mobile / tablet / unknown）で SVG path を切り替える実装は精密で、モック の glyph パスを正しく流用している。`unknown` が汎用 monitor glyph にフォールバックしており、虚偽表示禁止原則に従っている。

---

### [N-002] sessionTitle の優先順序と null フォールバック構造が正しい

**場所:** `app/components/identity/SecurityForm/index.tsx` L118-122

```tsx
function sessionTitle(session: SessionDTO): string {
  if (session.device.label !== null) return session.device.label;
  const ua = session.userAgent?.trim();
  return ua !== undefined && ua !== "" ? ua : "不明な端末";
}
```

優先順位が設計どおり：
1. `device.label`（パース済み "Chrome on macOS"）
2. raw `userAgent` 素出し
3. 「不明な端末」 fallback

**空文字列チェック（`ua !== ""`）も正しく、捏造を避けている。**

---

### [N-003] formatRelativeTime の「たった今」～「絶対日付」の境界判定が適切

**場所:** `app/components/common/relativeTime.ts` L21-40

- 「たった今」(5 分未満)
- 「N 分前」 (5 分 ～ 1 時間未満)
- 「N 時間前」 (1 時間 ～ 24 時間未満)
- 「N 日前」 (24 時間 ～ 7 日未満)
- 「YYYY年M月D日」 (7 日以上)

このバケット分けは計画 AC-5 で規定された粒度を満たしている。`now` 注入で決定的テスト可能（`now` パラメータのデフォルト値あり）。

---

### [N-004] updatedAt の更新経路が設計通り実装されているか（アダプター側）

**場所:** 検証対象ファイル不在（PR で確認が必要）

- sessionService adapter に `recordActivity` が実装されている（plan ステップ 5）
- getCurrentUser で呼ばれている（plan ステップ 6）

の２つは diff で見える必要。このレビューでは presentation層（SecurityForm / relativeTime）に絞っているため、adapter・port・getCurrentUser の実装は別途レビュー対象になる。

---

### [N-005] SessionDTO.device（DeviceInfo）の domain 型を DTO に直接貫通させる設計が適切

**場所:** `app/core/application/dto/identity.ts` L75 + `app/core/domain/identity/services/deviceInfo.ts` L18-23

`DeviceInfo` は domain 層で定義、`SessionDTO.device` に再定義せず直接参照する設計。DeviceInfo はプリミティブのみ (string | null) で wire-safe であり、presentation → application → domain の内向き依存を侵さない（ADR-001 の正当な選択）。

---

### [N-006] XSS 検証: userAgent の素出しが安全か

**場所:** `app/components/identity/SecurityForm/index.tsx` L121 (sessionTitle でresort ua を返す場合)

`sessionTitle` が `session.userAgent?.trim()` を返す場合、JSX の `{sessionTitle(session)}` で素出しされる。JSX は自動エスケープするため XSS リスクはない。ただし：
- userAgent は制御外の user-supplied input ではなく、server-side の SessionDTO で既に db→adapter→application→DTO の経路を通っているため、injection リスク は低い
- アクセシビリティ観点では「判別不能 UA の素出しが視覚に混乱をもたらさないか」の方が重要（N-003 で言及済み）

---

## サマリー

**Blockers:** 0  
**Warnings:** 3  
**Notes:** 6

### 主要指摘

1. **[W-001] session-meta 行構成**：ログイン日時（3 行目）の追加がモックと計画に記録されていない可能性。計画書補記または モック 同期の確認推奨
2. **[W-002] JUST_NOW_MS と ACTIVITY_THROTTLE_MS の粒度整合**：スロットル定数を確認し、「たった今」≥ スロットル幅を満たすか検証推奨
3. **[W-003] device kind がアイコンのみの異常系**：`device.label === null` 時に、テキスト説明なしで icon glyph だけが kind を表す。アクセシビリティ検討推奨（軽微）

### 良い点

- SessionIcon / sessionTitle / formatRelativeTime の実装はいずれも設計・計画に従い、虚偽表示禁止原則を守っている
- device glyph 切り替え・null フォールバック・相対時刻バケット分けが精密
- DeviceInfo の domain 型を DTO に貫通させる設計が内向き依存を保つ

---

## 次のステップ（付記）

- adapter / port / getCurrentUser 側のレビュー（別途）
- W-001 / W-002 の計画同期確認
- W-003 の a11y 検討（軽微、optional）
- `pnpm typecheck && pnpm lint:fix && pnpm format` が通ることを確認
