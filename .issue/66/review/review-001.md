# レビュー 001 — Issue #66 計画

**実施日:** 2026-05-21
**対象:** plan.md (initial) / adr.md (initial)
**ラウンド:** 1
**ステータス:** 修正反映済み → plan.md / adr.md 改訂

## レビュアー1: 要件カバレッジ視点

### 問題点（要修正）

- **[P-001]** `createConsumerContainer` への影響が plan で言及されていない
  - 反映: シグネチャ拡張案を撤回。`RequestServerConfig` に `relayTriggerOverride?: RelayTrigger` を追加する方式に変更。`createConsumerContainer` 経路は無変更。

- **[P-002]** Step 3 の plan 自体に内部矛盾
  - 反映: 矛盾箇所を解消。`RelayTrigger` インスタンス inject 方式に統一。

- **[P-003]** ADR-002 の「内部 consumer container は `inlineDispatch: false` で構築する」実装方法が plan に書かれていない
  - 反映: Step 2 で `consumerEnv = { ...env, RELAY: undefined }` を作って `createConsumerContainer(consumerEnv)` を呼ぶ手順を明記。ADR-002 にも反映。

- **[P-004]** Issue 4 案と plan A1-A4 の対応表が無い
  - 反映: 「設計判断」セクションに対応表を追加。

### 改善提案

- **[S-001]** `pnpm start` の挙動を `.dev.vars.example` / package.json にも明記
  - 見送り: docs/runtime_cloudflare.md で十分。

- **[S-002]** production 経路 zero-impact 回帰テスト追加
  - 反映: `serverCloudflare.test.ts` 追記の項目に追加。

- **[S-003]** dev フルフロー確認手順を testing.md として残す
  - 反映: Phase 1 Step 7 で testing.md を作成する流れに既に含まれる。

- **[S-004]** `InlineRelayTrigger` の置き場所
  - 見送り: スコープ外。`cloudflare/` 配下で問題なし。

## レビュアー2: 実現可能性視点

### 問題点（要修正）

- **[P-001]** Issue 前提（`note.content_updated` → `resolveInternalLinkRefs`）が実装上成立しない
  - 反映: 目的セクションに精査結果を明記。本 Issue のスコープは「outbox 経路ドレイン DX 改善」に絞り、動作確認も ingestion フロー中心に変更。`note_internal_links.resolved_note_id` 解決の問題は別 Issue で対処することを明示。

- **[P-002]** top-level `[[services]] RELAY` が dev でも Fetcher として注入される → secondary kick で Service Binding fetch が走り続ける
  - 反映: Step 2 で `consumerEnv.RELAY = undefined` を作る手順を明記。ADR-002 を改訂。テストでも RELAY 排除を検証。

- **[P-003]** `createRequestContainer` のシグネチャ変更が過剰
  - 反映: シグネチャ変更を撤回。`RequestServerConfig.relayTriggerOverride?: RelayTrigger` だけ追加し、エントリで `InlineRelayTrigger` を構築して inject する設計に変更。`createRequestContainer` / `createConsumerContainer` / `buildRelayTrigger` のシグネチャは全て無変更。

### 改善提案

- **[S-001]** `pnpm build` 後の bundle で `import.meta.env.DEV` が dead-code として削除されたか grep で確認
  - 反映: testing 手順に追加。

- **[S-002]** `pnpm start` で `import.meta.env.DEV` がクラッシュしないか確認
  - 反映: `tsconfig.json` の `types: ["vite/client"]` で `ImportMeta.env.DEV` の型は提供済み（vite ランタイム外でも `undefined` として安全に評価される）。エントリ実装時に動作確認する。

- **[S-003]** `processOutboxEvents` を `maxIterations: 1`, `batchSize: 25` で固定
  - 反映: Step 2 / ADR-002 に明記。

- **[S-004]** dev 用 workerId を固定値に
  - 反映: Step 2 で `workerId: "inline-dev"` 固定を明記。

- **[S-005]** コンテナ寿命のコメント
  - 見送り: `InlineRelayTrigger` の JSDoc に簡潔に記載するに留める（実装時対応）。

### 良い点（共通）

- 既存 seam（`RelayTrigger` ポート）の活用が秀逸
- `import.meta.env.DEV` を 1 ヶ所に閉じ込めた設計
- A1 案の却下理由が正確（miniflare 分離問題）
- ADR-002 の無限カスケード回避（YAGNI）
- 既存テストの非破壊性を意識

## 結論

両レビュアーの問題点 7 件すべてに対処。改善提案 9 件中 6 件反映、3 件は見送り（理由明記）。plan.md / adr.md を改訂し、本ラウンドは完了。
