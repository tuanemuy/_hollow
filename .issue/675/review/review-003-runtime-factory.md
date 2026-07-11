# レビュー R3 — PR #833 / Issue #675（Runtime & Factory 観点・収束確認）

- **対象:** `refactor(runtime): #675 dev 限定エントリ分離で InlineRelayTrigger の本番混入を構造的に防止`
- **観点:** Runtime & Factory（fetch フロー等価性・hook 型設計・dev エントリ逐語移設・prod dev-import ゼロ・ALS 配置・entry 選択レバー）
- **対応 AC:** AC-3 / AC-4 / AC-7 / AC-9
- **前提:** Round 2 で Blocker 0 / Warning 1（W-001: 旧保証モデル（DCE ゲート＋post-build grep）を指す stale なテストコメント）。コミット `ba90adc6` で該当コメントを構造保証ベースへ更新済み。本 R3 は W-001 の解消と回帰有無の最終確認。

## 結論

**Blocker は無し。Round 2 の W-001 は解消済み。収束と判断する。**

`ba90adc6`（テストコメント更新）以外に Runtime/Factory 関連のコード変更はなく、fetch フロー等価性・hook 型設計・dev→prod 一方向依存・ALS 単一初期化・entry 選択レバー（`@cloudflare/vite-plugin` の `config` delta-only 上書き）は Round 1/2 のポジティブ判定がそのまま有効。

---

## Runtime & Factory

### Blockers

- **なし**

### Warnings

- **なし**（Round 2 の W-001 は解消済み。下記 N-001 参照）

### Notes

- **[N-001]** Round 2 W-001（stale テストコメント）解消を確認。`inlineRelayTrigger.test.ts:132-137` の `resolveInlineRelayGate` describe 冒頭コメントは、撤去済みの DCE ゲート／post-build grep への参照を排し、「`"Disabled in production builds"` はここでは意図的に非カバー。その保証は構造的 — prod エントリ（`app/server.cloudflare.ts`）がこのモジュールを import しないため、フラグ値に関係なく production では到達不能（Issue #675）。本関数は dev 側の ON/OFF（Vite dev または local 限定の `DEV_INLINE_RELAY`）のみを決める」と、AC-6 の保証モデル（import グラフ構造保証）に正しく整合。`inlineRelayTrigger.ts` の JSDoc（`structurally, not by dead-code elimination`）とも矛盾しない。W-001 の提案どおりの修正で、挙動・型・AC 充足に影響なし。

- **[N-002]** AC-9（fetch フロー等価性）— `createFetchHandler`（`server.cloudflare.ts:65-109`）は ① `readRequestServerConfig` → `relayTrigger` hook で override 注入 → `createRequestContainer` の「config 生成の内側」注入、② `storage.run` 内で `url` 一度算出 → `await preRoute` 早期終端 → sitemap（GET/HEAD かつ `/sitemap.xml`）→ `defaultEntry.fetch` フォールスルー、の分岐順序・早期 return・sitemap 判定順まで旧実装と完全等価。prod default export（`createFetchHandler()`・hook 無し）は両 hook が undefined で dev-only モジュールを一切 import せず、通常ルート＋sitemap のみ応答する。ADR-004 の実測（prod build で dev-only コード全滅・`GET /` 200・`/sitemap.xml` 200 XML・`/dev/r2/x` はアプリ 404）が裏取り済み。

- **[N-003]** AC-3 / AC-4 / AC-7（dev エントリ逐語移設）— `server.cloudflare.dev.ts` の `relayTrigger` hook は `resolveInlineRelayGate({ viteDev: import.meta.env?.DEV === true, flag: env.DEV_INLINE_RELAY })` で両条件を保存（`viteDev` 単独への簡略化なし＝#663 回帰なし）。`preRoute` hook も dev proxy 分岐（`not_found`→404 / `handle`→`buildDevObjectStorageResponse` / `pass`→undefined）を過不足なく再現。AC-7 の OFF トグルは純関数 `resolveInlineRelayGate` の両方向ユニットテスト（`{viteDev:false, flag:"true"}→true` / `{viteDev:false, flag:"false"}→false`）＋逐語移設の直読性＋prod 構造到達不能の三重根拠で担保（Round 2 N-001 で妥当性確認済み、本 R3 でも変化なし）。

- **[N-004]** entry 選択レバー — `vite.config.cloudflare.ts:34-35` の `config: () => mode === "production" ? undefined : { main: DEV_SERVER_ENTRY }` は delta-only 上書きで、ADR-004 で顕在化したバインディング配列二重連結の罠を回避済み。production は常に `wrangler.toml [main]`（prod エントリ）へフォールスルーし、dev パス誤設定は「dev 機能停止」側に倒れる（prod へ dev 混入は構造上不能）。`server.entry` の mode 分岐は Worker ルートを決めないが意図明示の保険として据え置き（ADR-004 Consequences 準拠）。健全。

- **[N-005]** `FetchHandlerHooks` 型（dev-only 概念）が prod ファイルに同居する点は ADR-002 選択肢 (a) の受容済みコンセプト漏れ。実害なし。hooks JSDoc（`server.cloudflare.ts:38-63`）は構造保証ベースで正確。
