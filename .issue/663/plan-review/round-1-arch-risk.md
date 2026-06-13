# Plan Review — Issue #663 / Round 1（アーキテクチャ・実現可能性・リスク視点）

レビュー対象: `.issue/663/plan.md` / `.issue/663/adr.md`
レビュー日: 2026-06-13

## 総評

方針（ADR-001: multi-worker ではなく InlineRelayTrigger の var ゲート拡張）は妥当。#66 ADR-002/003 の延長として一貫しており、`R2_DEV_OBJECT_PROXY`（#657）で確立した「ローカル `wrangler.toml [vars]` 限定の dev フラグ」パターンの踏襲もアーキテクチャ規約に沿っている。レイヤー配置（ゲート純関数はアダプター層、`import.meta.env` 評価はエントリ 1 ヶ所、ドメイン/ユースケース無変更）も正しい。

ただし、DCE 保証（AC-2）の設計に 1 点、計画記載のままでは成立しない構造的な問題がある。

#### 問題点（要修正）

- **[P-001]** `productionBuild` を純関数の**引数**として渡す設計では、Vite ビルドの DCE（AC-2）が成立しない
  - 理由: 現行コードの DCE は `import.meta.env.DEV === true` というゲート式そのものが定数 `false` に畳まれることで、三項演算子の分岐ごと（`InlineRelayTrigger` の import 含め）除去される仕組み。計画ステップ 3 の形
    ```ts
    const inlineRelay = resolveInlineRelayGate({
      viteDev: meta.env?.DEV === true,        // → false に定数化
      productionBuild: meta.env?.MODE === "production", // → true に定数化
      flag: env.DEV_INLINE_RELAY,             // ← 実行時値
    });
    ```
    では、引数が定数化されても **`resolveInlineRelayGate` は実行時の関数呼び出し**であり、Rollup は関数呼び出しを越えて定数畳み込みしない（インライン展開しない）。よって `inlineRelay` は静的に `false` と判定されず、`InlineRelayTrigger` の import・`new` 分岐がバンドルに残る。AC-2 の grep 検証は失敗する。計画の「注意」（ステップ 3 / リスク欄）は「define 置換が `(import.meta as ...).env?.MODE` 形に効くか」だけを懸念しており、この**関数呼び出しの不透明性**という別の（より確実に起きる）問題を見落としている。設計セクションの「節全体が定数 false に畳まれて DCE が維持される」という記述は誤り。
  - 提案: DCE を担保する定数条件を**エントリポイントのトップレベル式に短絡（`&&`）として残す**構造に変える。例:
    ```ts
    const meta = import.meta as { env?: { DEV?: boolean; MODE?: string } };
    const inlineRelay =
      meta.env?.MODE !== "production" &&   // vite build で false に定数化 → 右辺ごと DCE
      resolveInlineRelayGate({
        viteDev: meta.env?.DEV === true,
        flag: env.DEV_INLINE_RELAY,
      });
    ```
    `pnpm dev` では `MODE === "development"` なので左辺は true、`pnpm start` では `import.meta.env` が `undefined` で左辺は true、vite build では `"production" !== "production"` → `false && …` が畳まれて右辺（関数呼び出し・`InlineRelayTrigger` 参照）ごと除去される。純関数は `viteDev ∨ flag === "true"` の判定に縮め、「productionBuild 時に無効」という保証は**ビルド時に経路自体が存在しない**ことで担保する（単体テストの「productionBuild=true なら false」ケースは、エントリ式の構造＋ステップ 7 の grep 検証に責務を移す）。計画ステップ 1–3・設計セクション・リスク欄をこの構造に合わせて書き直すこと。

#### 改善提案（検討推奨）

- **[S-001]** ステップ 2 の単体テスト観点を P-001 の構造変更に追従させる
  - 理由: P-001 の提案を取ると「productionBuild なら false」は純関数のテストでは表現できなくなる（その保証はビルド検証 = AC-2 grep に移る）。テスト方針の「本番で誤って有効化されない回帰防止が最重要」という意図自体は正しいので、その担保手段が grep 検証（ステップ 7-2）であることを計画・docs の両方に明記し、テストは `flag` の値判定（`"true"` 厳密一致、`"TRUE"`/`"false"`/undefined は false）と `viteDev` 優先に絞ると責務が明確になる。
- **[S-002]** `pnpm dev`（Vite serve）でも `wrangler.toml [vars]` の `DEV_INLINE_RELAY = "true"` が読み込まれ、flag 側の節も真になる点を docs かコメントに一言補足する
  - 理由: `@cloudflare/vite-plugin` はローカル `wrangler.toml` の vars を dev サーバーにも供給するため、`viteDev` と flag の両方が真になる。挙動上は無害（OR 条件）だが、「この var は `pnpm start` 専用」と読める書き方だと将来の読者が混乱する。ゲートの真理値表を docs に書く際に「`pnpm dev` では両条件が真になるが viteDev だけで十分」と一言添えるとよい。
- **[S-003]** リスク欄の「ポーリング serverFn が UoW commit を伴わず二次イベントが進まない可能性」は、検証前に一度コード上で確認しておくとよい
  - 理由: ジョブ型エクスポートは「ジョブ作成 UoW commit → kick → inline drain が `runExportJob` を同期実行 → ジョブステータス更新」の流れであれば 1 kick で完結する可能性が高い。`runExportJob` の完了が**さらに outbox 経由の二次イベント**（例: 完了通知やステータス反映）を要するかどうかで AC-1 の成否が変わるため、ステップ 7 の前に `dispatchDomainEvent` → export ハンドラーの完了パスを机上確認しておくと、検証で詰まったときの切り分けが速い。計画はリスクとして認識済みなので、確認タスクをステップ 7 の前提に一行追加するだけでよい。

#### 良い点

- ADR-001 の選択肢比較が具体的（wrangler multi-worker の `--env` 制約、bindings 重複の同期コスト、`--test-scheduled` 等の運用課題まで踏み込んでいる）で、「実 Queue 経路の検証は staging の責務」という既存の責務分担を崩さない判断が docs/runtime_cloudflare.md と整合している。
- レイヤー配置が正しい: ゲート判定をアダプター層の純関数に切り出し（`resolveDevObjectStorageGate` の前例踏襲）、`import.meta.env` の評価をエントリ 1 ヶ所に限定する方針は #66 ADR-003 の原則と CLAUDE.md の「cross-cutting はポート/エントリに寄せる」原則の両方に適合。ドメイン・ユースケース・`RelayTrigger` ポート契約に一切手を入れない判断も適切。
- スコープ制御が的確: indexer / pruner / dlq / #657 presigned フローを明示的に除外し、`pnpm dev` とのパリティ（indexer は両環境とも対象外）まで根拠を添えている。
- 受け入れ基準が検証可能な形（grep コマンド・TC-5 step 6 再実行・`pnpm dev` 回帰確認）で定義され、各ステップと紐付いている。AC-2/AC-4 のような「壊さないこと」の基準を明示している点が良い。
- `.dev.vars` のシークレット前提、1 kick = 1 バッチの既知制約、staging/production toml への var 混入時の将来リスクなど、エッジケースの洗い出しが丁寧。
- 実装ステップが依存方向の順（アダプター純関数 → テスト → エントリ配線 → DI 型/toml → 生成型 → docs → 検証）に並んでいる。

## 集計

- 問題点: 1（P-001）
- 改善提案: 3（S-001〜S-003）
