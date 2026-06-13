# 実装計画 — Issue #663: chore(dev): ローカル検証環境（pnpm start）でジョブ型エクスポートが完走しない（relay/consumer Worker が動かない）

**Issue:** #663
**作成日:** 2026-06-13
**複雑度:** 中〜大規模

---

## 目的

`pnpm build && pnpm start`（= `wrangler dev` 単体）のローカル検証環境で、outbox に積まれたジョブ型エクスポートのイベントが消費されず「待機中」のまま止まる問題を解消し、ジョブ型エクスポートを E2E で完走確認できるようにする。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | `pnpm build && pnpm start` 環境で、複数ノートの一括エクスポート（ジョブ型）を実行するとジョブが「待機中」から進行して完了し、アーティファクトのダウンロード URL（`/dev/r2/...`）が 200 を返す | Issue 本文 / `.issue/657/manual-test/results/TC-5.md` step 6 | 1–4, 7 |
| AC-2 | staging / production のデプロイ成果物（`dist/server/index.js`）に `InlineRelayTrigger` / `inline-dev` / `import.meta.env` の残骸が含まれない（既存の DCE 保証を維持） | docs/runtime_cloudflare.md「Local dev outbox dispatch」の検証コマンド | 3, 7 |
| AC-3 | staging / production の実行時挙動は不変。検証手段: `infra/templates/wrangler.{staging,production}.toml.tmpl` に差分がないこと ＋ AC-2 の DCE grep 通過（ビルド成果物に経路自体が存在しない）の 2 点で機械的に確認する | CLAUDE.md「Reference runtime」/ #66 ADR との整合 | 3, 4, 7 |
| AC-4 | `pnpm dev`（Vite）の既存 InlineRelayTrigger 挙動が退行しない | #66 の既存機能 | 3, 7 |
| AC-5 | docs/runtime_cloudflare.md の「`pnpm start` ではインライン経路が無効」という記述が新しい仕組みに合わせて更新されている | Issue「やること（案）」（構成整備＝ドキュメント含む） | 6 |

> **実装後の注記（PR #673 レビュー Round 1 反映）:** 本計画中の `pnpm build && pnpm start` 表記（AC-1・ステップ 7-4・テスト方針等）は、実装中に判明した redirected config の事実（`pnpm build` が `.wrangler/deploy/config.json` を書き、`pnpm start` は常に `dist/server/` の Vite ビルド成果物を実行する — 素の production ビルドではインライン経路が DCE 済みで var は無効）により、**`pnpm build:local && pnpm start`** に読み替えること。同様に「調査結果」の「`pnpm start`（wrangler dev が TS ソースを直接バンドル）では `import.meta.env` が `undefined`」という前提は誤りだった。経緯と正しい手順は `.issue/663/adr.md`・`docs/runtime_cloudflare.md`「Local dev outbox dispatch」・`.issue/663/testing.md` を参照。本文は履歴成果物として原文のまま残す。

## スコープ

### 含まれないもの

- wrangler dev の multi-worker 起動構成（relay/consumer/indexer をローカルで実 Queue 経由で動かす構成）— ADR-001 で不採用。Queue 実経路の検証は staging で行う方針を維持
- indexer（`index_jobs` の cron ドレイン）のローカル自動実行 — `pnpm dev` の InlineRelayTrigger でも対象外であり、本 Issue の対象（ジョブ型エクスポート）は outbox → consumer 経路のみで完結する。パリティ維持
- pruner / dlq のローカル実行 — 検証に不要
- #657 の presigned フロー側の変更 — 解決済み。本 Issue はその上で動くダウンロード確認に使うだけ

## 調査結果

- 関連ファイル:
  - `app/server.cloudflare.ts` — fetch エントリ。`import.meta.env?.DEV === true` のときのみ `InlineRelayTrigger` を `relayTriggerOverride` として注入（#66 / ADR-003）。`pnpm start`（wrangler dev が TS ソースを直接バンドル）では `import.meta.env` が `undefined` のためインライン経路が無効になる — これが本 Issue の直接原因
  - `app/core/adapters/cloudflare/inlineRelayTrigger.ts` — dev 専用 `RelayTrigger`。同一 isolate 内で `processOutboxEvents` + `dispatchDomainEvent` を直接実行（`maxIterations: 1`, `batchSize: 25`, `workerId: "inline-dev"`）。consumer container は `RELAY` を除去して構築（#66 ADR-002）
  - `app/core/application/di/serverCloudflare.ts` — `ServerEnv` 型、`RequestServerConfig.relayTriggerOverride`、`buildRelayTrigger`（Service Binding 有→`ServiceBindingRelayTrigger`、無→`NoopRelayTrigger`）
  - `wrangler.toml` — LOCAL DEV ONLY 設定。前例として `R2_DEV_OBJECT_PROXY = "true"`（#657）という「ローカル `[vars]` にのみ置く dev 専用フラグ」のパターンが既にある。main worker は `DB` / `TEMP_FILES` / `OBJECT_STORAGE` / `RELAY` を持つ
  - `infra/templates/wrangler.{staging,production}.toml.tmpl` — デプロイ用。main は `dist/server/index.js`（Vite ビルド成果物）なので、Vite の `import.meta.env` インライン化 → DCE が効く。dev 専用フラグは存在しない
  - `app/core/adapters/cloudflare/devObjectStorageHandler.ts` — `resolveDevObjectStorageGate` という「dev 専用機能のゲート判定を純関数に切り出してテストする」前例
  - `docs/runtime_cloudflare.md` 47–56 行 — 「Local dev outbox dispatch」。56 行目に「`pnpm start` ではインライン経路は無効。フルループ確認には relay/consumer を手動起動」と明記（今回更新対象）
  - `.issue/657/manual-test/results/TC-5.md` — 再現記録（step 6 が SKIP）
- あるべきアーキテクチャ: CLAUDE.md より、outbox / relay / consumer は at-least-once + 冪等 consumer が契約。dev 向けの代替経路はアダプター層（`app/core/adapters/cloudflare/`）に置き、エントリポイントで注入する（#66 ADR-003 の「dev 判定はエントリ 1 ヶ所」原則）。本番経路（Service Binding → Queue）は不変に保つ
- 既存実装の状態: アーキテクチャ上の乖離はない。`pnpm dev` 向けの解決（InlineRelayTrigger）が `pnpm start` 経路をカバーしていないだけで、機構そのものは再利用できる。ゲート条件の拡張が本質
- 依存関係: `InlineRelayTrigger` が依存する `createWorkerContainer` / `createConsumerContainer` は main worker の bindings（D1 / R2 / `.dev.vars` のシークレット）で動作する。`pnpm start` でも同じ `wrangler.toml` + `.dev.vars` が読まれるため追加 binding は不要

## 設計

### ドメインモデルへの影響

なし。outbox / イベントの契約は不変。

### ユースケース / アプリケーションロジック

なし。`processOutboxEvents` / `dispatchDomainEvent` / `RelayTrigger` ポートはそのまま使う。`ServerEnv` 型（DI 定義）に optional な `DEV_INLINE_RELAY?: string` を 1 フィールド追加するのみ。

### アダプター / 永続化 / 外部連携

`InlineRelayTrigger` 本体は変更しない。ゲート判定は **2 段構造**で実現する:

1. **DCE ゲート（エントリポイントのトップレベル短絡式）** — `import.meta.env?.MODE !== "production"` を `&&` の左辺としてゲート式の**外側**に直接置く。Rollup は関数呼び出しを越えて定数畳み込みしない（インライン展開しない）ため、この定数条件を純関数の引数として渡す設計では DCE が成立しない。短絡 `&&` の左辺に置けば、Vite ビルドでは `"production" !== "production"` → `false && …` が畳まれて右辺（純関数呼び出し・`InlineRelayTrigger` 参照）ごと除去される。`pnpm dev` では `MODE === "development"` で左辺 true、`pnpm start` では `import.meta.env` が `undefined` で左辺 true。
2. **実行時ゲート（アダプター層の純関数 `resolveInlineRelayGate`）** — DCE ゲートを通過した後の判定だけを担う: `有効 ⇔ viteDev === true ∨ flag === "true"`。`resolveDevObjectStorageGate` と同じパターンで単体テストを付ける。

「production ビルドで無効」という保証は純関数のロジックではなく**ビルド時に経路自体が存在しないこと**（DCE）で担保し、その検証はビルド後 grep（ステップ 7-2 / AC-2）が責務を持つ。`import.meta.env` の評価はエントリポイント 1 ヶ所に限定（#66 ADR-003）し、純関数は `viteDev` と env 文字列だけを受け取る。

### UI / プレゼンテーション

なし（エントリポイント `app/server.cloudflare.ts` のゲート式変更のみ。これは presentation というよりエントリ配線）。

## 実装ステップ

### 1. ゲート判定の純関数を追加

- **対象ファイル:** `app/core/adapters/cloudflare/inlineRelayTrigger.ts`（同居。ファイル分離してもよい）
- **変更内容:** `resolveInlineRelayGate(input: { viteDev: boolean; flag: string | undefined }): boolean` を追加。判定は `viteDev === true || flag === "true"`。JSDoc に「`flag` はローカル `wrangler.toml [vars]` の `DEV_INLINE_RELAY` 専用。staging / production の toml には決して追加しない」「production ビルドでの無効化はこの関数の責務ではなく、エントリポイントの DCE ゲート（`MODE !== "production"` 短絡）＋ビルド後 grep 検証が担保する」旨を明記
- **理由:** ゲート条件が 2 経路（vite dev / wrangler dev + var）に増えるため、実行時判定の真偽表を単体テストで固定する。production 無効化を引数に含めない（純関数を縮小する）のは、定数条件を関数呼び出しの内側に入れると Rollup の DCE が効かなくなるため（レビュー P-001）

### 2. ゲート判定の単体テスト

- **対象ファイル:** `app/core/adapters/cloudflare/__tests__/inlineRelayTrigger.test.ts`
- **変更内容:** `resolveInlineRelayGate` の真偽表テストを追加。観点は「`flag === "true"` の厳密一致（undefined / `"false"` / `"TRUE"` は false）」「`viteDev === true` なら flag に依らず true」に絞る
- **理由:** 「本番で誤って有効化されない」保証はビルド時 DCE（経路自体の不存在）に移ったため、その回帰防止はステップ 7-2 のビルド後 grep 検証が担う。単体テストは実行時ゲートの値判定に責務を限定する（レビュー arch-risk S-001）

### 3. エントリポイントのゲート式を差し替え

- **対象ファイル:** `app/server.cloudflare.ts`
- **変更内容:** 現在の

  ```ts
  const isDev = (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
  ```

  を

  ```ts
  const meta = import.meta as { env?: { DEV?: boolean; MODE?: string } };
  const inlineRelay =
    meta.env?.MODE !== "production" && // vite build で false に定数化 → 右辺ごと DCE
    resolveInlineRelayGate({
      viteDev: meta.env?.DEV === true,
      flag: env.DEV_INLINE_RELAY,
    });
  ```

  に変更し、`inlineRelay` のとき `relayTriggerOverride: new InlineRelayTrigger(...)` を注入（注入部は現状のまま）。既存コメント（DCE 説明）を新しいゲートに合わせて更新。**定数条件（`MODE !== "production"`）は必ず短絡 `&&` の左辺＝関数呼び出しの外側に置くこと** — 関数の引数に渡すと Rollup が呼び出しを越えて畳み込めず DCE が壊れる
- **理由:** `pnpm start` で `import.meta.env` が `undefined` でも左辺が true となり、ローカル `[vars]` の `DEV_INLINE_RELAY` でインライン経路が立ち上がる。Vite ビルドでは左辺が `false` に定数化され、`false && …` ごと右辺（純関数呼び出し・`InlineRelayTrigger` の import）が DCE される（AC-2）。**注意:** Vite の define 置換が `(import.meta as ...).env?.MODE` 形に効くかはビルドで必ず実証する（ステップ 7 の grep 検証）。効かない場合は `import.meta.env.MODE` を直接参照する形（既存 DEV 参照と同形）に書き換える

### 4. `ServerEnv` にフラグを追加し、ローカル `wrangler.toml` に var を追加

- **対象ファイル:** `app/core/application/di/serverCloudflare.ts`、`wrangler.toml`
- **変更内容:**
  - `ServerEnv` に `DEV_INLINE_RELAY?: string;` を追加（`R2_DEV_OBJECT_PROXY` の隣に、同様のコメント付きで）
  - `wrangler.toml` の `[vars]` に `DEV_INLINE_RELAY = "true"` を追加。コメントで「LOCAL DEV ONLY — `pnpm start`（wrangler dev）で relay/consumer Worker の代わりに InlineRelayTrigger を有効化する。staging / production の toml テンプレートには追加しないこと（Vite ビルドでは経路自体が DCE されるため設定しても無意味だが、意図を明確にするため禁止）」を明記
- **理由:** dev 専用フラグをローカル設定にのみ置く既存パターン（`R2_DEV_OBJECT_PROXY`）の踏襲。staging/production テンプレート（`infra/templates/*.tmpl`）には触れない（AC-3）

### 5. `wrangler types` の再生成確認

- **対象ファイル:** `worker-configuration.d.ts`（自動生成）
- **変更内容:** `pnpm cf:types` を実行し、`DEV_INLINE_RELAY` が生成型に反映されることを確認してコミットに含める（生成内容に差分が出る場合）。**注意:** 現在の `worker-configuration.d.ts` には #657 で `wrangler.toml [vars]` に追加済みの `R2_DEV_OBJECT_PROXY` / `R2_S3_ENDPOINT` が未反映（stale）の可能性があり、再生成すると `DEV_INLINE_RELAY` 以外の差分が同時に出得る。これは想定内なのでまとめてコミットする
- **理由:** `postinstall` / `predev` で再生成される生成物との不整合を残さない（stale 差分の注意はレビュー coverage S-002）

### 6. ドキュメント更新

- **対象ファイル:** `docs/runtime_cloudflare.md`
- **変更内容:** 「Local dev outbox dispatch」セクションを更新:
  - 56 行目の「`pnpm start` ではインライン経路は無効 — relay/consumer を手動起動」を、「ローカル `wrangler.toml [vars]` の `DEV_INLINE_RELAY = "true"` により `pnpm start` でもインライン経路が有効。実 Queue 経路（Service Binding → Queue → consumer）の検証は staging で行う」に書き換え
  - ゲート条件（vite dev / production ビルドでの DCE / var ゲート）と、staging・production には var を設定しない運用ルールを追記。「本番で無効」の担保はビルド時 DCE（＋grep 検証）である旨を明記
  - `pnpm dev`（Vite serve）でも `@cloudflare/vite-plugin` がローカル `wrangler.toml` の vars を供給するため `DEV_INLINE_RELAY` 側の条件も真になるが、OR 条件なので挙動上は無害（viteDev だけで十分）という一言を補足し、「この var は `pnpm start` 専用」という誤読を防ぐ（レビュー arch-risk S-002）
  - 既存の DCE 検証 grep コマンドはそのまま有効である旨を維持
  - `runExportJob` は job の complete/fail を UoW で直接 save するため一括エクスポートは 1 kick で完了する見込みだが、`collectEvents` で積まれた二次 outbox イベントは Noop relay 下では次の kick まで滞留する点を一言補足（レビュー round-2 arch-risk S-001）
- **理由:** AC-5。検証手順書（manual-test）がこのドキュメントを「既知のローカル制約」の根拠にしているため、更新しないと今後の検証で再び SKIP 判断される

### 7. 検証

- **対象:** ビルド成果物・ローカル環境
- **前提（机上確認）:** E2E 実行の前に、エクスポートジョブの完了パスを机上確認する — `dispatchDomainEvent` → export ハンドラーを追い、ジョブ完了（ステータス更新）が 1 回の kick・同期実行で完結するか、それとも**二次 outbox イベント**（完了通知・ステータス反映等）を要するかを把握しておく。二次イベントを要する場合、ポーリング serverFn は UoW commit を伴わず kick が起きないため AC-1 の成否に直結する（レビュー arch-risk S-003）。検証で詰まったときの切り分けを速くするため
- **変更内容:**
  1. `pnpm typecheck && pnpm lint:fix && pnpm format` / `pnpm test:unit`
  2. `pnpm build` 後、docs 記載の DCE 検証: `grep -rn "InlineRelayTrigger\|inline-dev\|import.meta.env" dist/` が何もヒットしないこと（AC-2。「production ビルドで無効」保証の唯一の検証点）。ヒットした場合はステップ 3 の注意書きどおりゲート式の参照形を修正
  3. `git status` / `git diff` で `infra/templates/wrangler.{staging,production}.toml.tmpl` に差分がないことを確認（AC-3。2 の grep 通過と合わせて機械的に検証）
  4. `pnpm build && pnpm start`（:8787）で、選択モード → 複数ノート選択 → 一括エクスポート（HTML）を実行し、ジョブが完了してダウンロード URL（`/dev/r2/...`）が 200 になることを確認（AC-1、TC-5 step 6 の再実行）
  5. `pnpm dev` で従来どおり outbox イベントが即時 dispatch されること（例: 内部リンクの resolved 反映 or 一括エクスポート完走）を確認（AC-4）
- **理由:** 受け入れ基準の直接検証。特に 2 は本変更で最も壊れやすい保証

## 設計判断

- **ADR-001（`.issue/663/adr.md`）:** wrangler dev の multi-worker 構成ではなく、既存 `InlineRelayTrigger` のゲート拡張（ローカル専用 var `DEV_INLINE_RELAY` + production ビルドでの DCE 維持）を採用。#66 で確立した dev 代替経路の一貫した延長であり、設定の重複・ポート/プロセス管理の複雑さを持ち込まない。実 Queue 経路の検証は staging の責務のまま。DCE ゲート構造（定数条件を純関数の外側の短絡 `&&` に置く）の補足は ADR-001 の追記を参照

## リスクと注意点

- **DCE の維持が最重要リスク。** ゲート式に runtime 条件（env var）を足すと、書き方次第で Vite ビルドから `InlineRelayTrigger` が消えなくなる。特に Rollup は関数呼び出しを越えて定数畳み込みしないため、定数条件を純関数の引数に入れる形は確実に DCE が壊れる — 定数条件は必ずエントリのトップレベル短絡 `&&` の左辺に置く（ステップ 3）。加えて `(import.meta as ...).env?.MODE` への define 置換が効くかは実ビルドの grep 検証で必ず確認し、効かなければ参照形を調整する（ステップ 7-2）
- 誤って staging/production の `[vars]` に `DEV_INLINE_RELAY` を置いても Vite ビルドでは経路が存在しないため無害だが、将来 main のビルド方式が変わると有害になり得る。toml コメントと docs に禁止を明記して防ぐ
- `pnpm start` でのインライン dispatch は本番（Queue 経由・非同期・リトライあり）と挙動が異なる（既知の `pnpm dev` と同じ差異）。docs の既存注意書き（「同期前提のコードは本番で驚く」）がそのまま適用される
- `pnpm start` では `.dev.vars` のシークレット（`SECRET_BOX_MASTER_KEY` 等）が consumer container 構築に必要。`pnpm dev` と同一ファイルが読まれるため通常は問題ないが、検証手順で `.dev.vars` 前提を踏襲すること
- エクスポートジョブが大きい場合、1 kick = 1 バッチ（`maxIterations: 1`）の制約で二次イベントが次の UoW commit まで持ち越される（#66 ADR-002 の既知挙動）。エクスポート完了イベント等が UI に出るまで操作起点の kick が要る場面があり得るが、検証シナリオ（ジョブ作成 → ポーリング）ではポーリングの serverFn 呼び出しが UoW commit を伴わないため進まない可能性に注意。**実装前にステップ 7 の前提（机上確認）で、エクスポート完了が二次 outbox イベントを要するかをコード上で確認しておく** — 実検証で問題になれば TC の操作（ページ再訪等）で kick を発生させるのではなく、挙動を記録して判断する

## テスト方針

- 単体テスト: `resolveInlineRelayGate` の真偽表（viteDev 優先 / flag の `"true"` 厳密一致・値違い）— ステップ 2。「production ビルドで無効」は単体テストの責務ではない
- 既存単体テスト: `inlineRelayTrigger.test.ts` の既存ケースが回帰しないこと
- ビルド検証: `pnpm build` + DCE grep（AC-2）。「production ビルドで無効化される」保証の検証はここに一元化される
- テンプレート差分なし確認: `infra/templates/*.tmpl` に差分がないこと（AC-3）
- 手動 E2E: `pnpm build && pnpm start` でジョブ型一括エクスポート完走 + アーティファクトダウンロード（AC-1、TC-5 step 6 相当）。`pnpm dev` での既存挙動確認（AC-4）

## レビュー履歴

### 1周目
**修正した点**:
- arch-risk P-001: 純関数 `resolveInlineRelayGate` に `productionBuild` を引数として渡す設計では Rollup が関数呼び出しを越えて定数畳み込みせず DCE（AC-2）が成立しない問題を修正。`import.meta.env?.MODE !== "production"` の定数条件をエントリ（`app/server.cloudflare.ts`）のトップレベル短絡 `&&` の左辺＝純関数呼び出しの外側に置く 2 段ゲート構造に再設計し、純関数は `viteDev ∨ flag === "true"` の実行時判定のみに縮小（設計セクション・ステップ 1〜3・リスク欄を書き直し）。「production ビルドで無効」の保証はビルド時 DCE ＋ grep 検証（ステップ 7-2）に移管。設計判断の変化は ADR-001 に追記

**取り込んだ改善提案**:
- arch-risk S-001: 単体テスト観点を構造変更に追従（ステップ 2 / テスト方針）。「productionBuild なら false」のケースを純関数テストから外し、ビルド後 grep 検証に責務を移管。テストは flag の厳密一致と viteDev 優先に限定
- arch-risk S-002: `pnpm dev` でも `@cloudflare/vite-plugin` が `wrangler.toml [vars]` を供給し flag 側条件も真になる（OR なので無害）旨を docs 更新ステップ（6）に補足
- arch-risk S-003: エクスポート完了が二次 outbox イベントを要するかを実装前に机上確認する前提タスクをステップ 7 に追加し、リスク欄からも参照
- coverage S-001: AC-3 の検証手段を「テンプレート差分なし ＋ AC-2 の DCE grep 通過」として観測可能な形に明文化（受け入れ基準表・ステップ 7-3・テスト方針）
- coverage S-002: `pnpm cf:types` 再生成で #657 由来の stale 差分（`R2_DEV_OBJECT_PROXY` / `R2_S3_ENDPOINT`）が混入し得る注意書きをステップ 5 に追加

**見送った提案とその理由**:
- なし（全指摘を取り込み）

### 2周目
両視点とも問題点ゼロで終了。改善提案 arch-risk S-001（二次 outbox イベントの滞留に関する docs 補足）をステップ 6 に取り込み。
