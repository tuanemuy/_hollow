# レビュー R2 — PR #833 / Issue #675（Runtime & Factory 観点）

- **対象:** `refactor(runtime): #675 dev 限定エントリ分離で InlineRelayTrigger の本番混入を構造的に防止`
- **head:** `issue/675/dev-entry-separation` (`afdd14b1`) — Round 1 から**単一コミットのまま・コードは無変更**
- **観点:** Runtime & Factory（fetch フロー等価性・hook 型設計・dev エントリ逐語移設・prod dev-import ゼロ・ALS 配置）
- **対応 AC:** AC-3 / AC-4 / AC-7 / AC-9
- **前提:** Round 1（review-001）で Blocker 0 / Warning 1（W-001: AC-7 の OFF トグル ランタイム未裏取り）。W-001 は `.issue/675/manual-test/report.md` の追記で対応済み。本 R2 はその閉じ方の妥当性と回帰の有無を再確認する。

## 結論

コードは Round 1 から無変更（`afdd14b1` 単一コミット）で、Round 1 の全ポジティブ判定はそのまま有効。
fetch フローは旧実装と分岐順序・早期 return・sitemap 判定順まで完全等価、hook 型は各注入点の要求と厳密一致、
prod default export の dev-import はゼロ、dev→prod 一方向依存で循環・副作用なし、ALS は共有側 top-level で単一初期化。
**Blocker は無し。**

Round 1 の W-001（AC-7 の `DEV_INLINE_RELAY=false` OFF トグルのランタイム裏取り）は、report 追記
（`report.md:81`）により「ユニットテスト＋逐語移設＋prod 構造到達不能」の三重根拠で**妥当に閉じている**と判断し、
本 R2 では **Note へ降格**（下記 N-001）。新規に、旧保証モデル（DCE ゲート＋post-build grep）を指し続ける
**stale なテストコメント**を 1 件検出（AC-6 の撤去趣旨に反する取りこぼし）。Warning 1 として記録するが、
テストコメントであり挙動・AC 充足には影響しない軽微事項。

---

## Runtime & Factory

### Blockers

- **なし**

### Warnings

- **[W-001]** 旧保証モデル（DCE ゲート＋post-build grep 検証）を指し続ける stale なテストコメントが残存。
  - **説明:** `app/core/adapters/cloudflare/__tests__/inlineRelayTrigger.test.ts:133-135` の `resolveInlineRelayGate` describe 冒頭コメントが、`"Disabled in production builds" ... that guarantee lives in the entry point's DCE gate and is verified by the post-build grep (docs/runtime_cloudflare.md)` と記述している。
  - **場所:** `app/core/adapters/cloudflare/__tests__/inlineRelayTrigger.test.ts:133-135`
  - **理由:** 本 PR は (1) prod エントリの DCE ゲート（`MODE !== "production" && ...`）を撤去し、(2) `docs/runtime_cloudflare.md` の post-build grep 検証手順を撤去し、(3) 保証モデルを「エントリ分離による import グラフ構造保証」へ格上げしている（AC-6）。同 PR で `inlineRelayTrigger.ts` の JSDoc は `structurally, not by dead-code elimination`（L27-29）へ正しく更新済みなのに、このテストコメントだけが撤去済みの DCE ゲート／grep 手順を指し続けており、読者を存在しない検証手順へ誘導する。AC-6 のファイル列挙（`inlineRelayTrigger.ts` / `devObjectStorageHandler.ts` の JSDoc・docs）には test ファイルが明記されていないため厳密には scope 外だが、AC-6 の趣旨（旧保証モデルの参照を残さない）から漏れている取りこぼし。
  - **提案:** コメントを構造分離ベースへ更新（例: 「production では prod エントリがこのモジュールを import しないため到達不能。“disabled in production” はエントリ分離で構造保証され、このユニットテストの対象外」）。挙動・型・AC 充足には影響しないため、次コミットの軽微クリーンアップで足りる。コード修正は不要。

### Notes

- **[N-001]** Round 1 W-001（AC-7 の `DEV_INLINE_RELAY=false` OFF トグルのランタイム未裏取り）の閉じ方は妥当。report 追記（`report.md:81`）の三重根拠を実コードで裏取り確認した:
  - ゲート実装は `resolveInlineRelayGate = viteDev === true || flag === "true"`（`inlineRelayTrigger.ts:67-72`）の純関数。
  - ユニットテスト（`inlineRelayTrigger.test.ts:137-144`）が **AC-7 の build:local シナリオそのもの** を両方向で網羅 — ON: `{viteDev:false, flag:"true"} → true`（`DEV=false` でも `DEV_INLINE_RELAY` フラグ単独で駆動）、OFF: `{viteDev:false, flag:"false"} → false`（フラグ OFF で停止）。`{viteDev:false, flag:"TRUE"|""|undefined}` の境界も false で確認済み。
  - 配線は `resolveInlineRelayGate({ viteDev: import.meta.env?.DEV === true, flag: env.DEV_INLINE_RELAY })`（`server.cloudflare.dev.ts:23-26`）で、両条件を保存し `flag` に `env.DEV_INLINE_RELAY` を渡す逐語移設が小さな diff 上で直読可能。`viteDev` 単独への簡略化は行われていない（#663 回帰なし）。
  - prod では `InlineRelayTrigger` が構造的に到達不能（TC-1 で実測 0 件）。
  - → AC-7 の「フラグ OFF で停止」は「純関数の OFF ケースをユニットテスト済み × 配線が逐語移設で直読可能 × 両者の間に隠れたランタイム状態なし」の合成で成立する。文言どおりのサーバー起動観測は未実施だが、残存リスクは実質ゼロで、report が意図的・理由付きの代替として明文化した。Round 1 の「未文書の gap」から「文書化された妥当な判断」へ状態が変わったため Warning → Note へ降格。
- **[N-002]** fetch フロー等価性（AC-9）を再確認。`createFetchHandler`（`server.cloudflare.ts:65-109`）は ① `readRequestServerConfig` → `relayTrigger` hook で override 注入 → `createRequestContainer` の「config 生成の内側」注入位置、② `storage.run` 内で `url` 一度算出 → `await preRoute` 早期終端 → sitemap（GET/HEAD かつ `/sitemap.xml`）→ `defaultEntry.fetch` のフォールスルー順、いずれも旧実装と分岐順序・早期 return まで等価。`await hooks?.preRoute?.()` が同期 404 と非同期 `buildDevObjectStorageResponse` の双方を正しく解決。Round 1 の行単位突き合わせ結果はコード無変更のため有効。
- **[N-003]** dev エントリ（`server.cloudflare.dev.ts`）の hook は旧 in-entry ロジックの逐語移設。`preRoute` の dev proxy 分岐（`not_found`→404 / `handle`→`buildDevObjectStorageResponse` / `pass`→undefined フォールスルー）も `resolveDevObjectStorageGate` の入力（flag / pathname / hasBucket / hasPresignConfig）ごと過不足なく再現。prod（hook 無し）では gate が評価すらされず、旧 prod の「毎回 pass 評価」と結果同値かつ dev-only コード非ロードの改善。
- **[N-004]** prod default export の dev-import ゼロ・dev→prod 一方向依存・ALS 単一初期化・vite `config` customizer の delta-only 上書き（`vite.config.cloudflare.ts:34-35`）は Round 1 判定どおり健全。コード無変更につき再掲のみ。
- **[N-005]** `FetchHandlerHooks` 型（dev-only 概念）が prod ファイルに同居する点は ADR-002 選択肢 (a) のコンセプト漏れとして受容済み。実害なし。W-001 のコメント更新時に、hooks JSDoc（`server.cloudflare.ts:38-63`）の記述が構造保証ベースで正確であることは確認済み。
