# PR Review #002 — feat(issue-110): wire R2 / LLM / RELAY bindings to [env.consumer]

**PR:** #112
**Date:** 2026-05-21
**Round:** 2回目

---

## Summary

- Blockers: 0
- Warnings: 3 (Infra: 3, Application DI: 0, Tests: 0)
- Notes: 多数 (Round 1 修正の検証)
- Verdict: **BLOCKED** (Infra に Round 1 W-006 修正の副作用 W-001/W-002 と Round 1 W-001 修正の中途半端な完成度 W-003 が残存)

---

### Infrastructure & Wrangler Config

#### Blockers
なし

#### Warnings

- **[W-001]** `ADMIN_SETUP_TOKEN` の追加が SoT 群に伝播していない (Round 1 W-006 修正の副作用)
  - 場所: `infra/src/secrets.ts:61` (追加箇所) vs `.dev.vars.example` 全体 / `infra/secrets/staging.json.example` 全体 / `infra/secrets/production.json.example` 全体 / `docs/runtime_cloudflare.md:36` (App 行) / `:107-112` (Dispatch-side secrets 表)
  - 理由: Round 1 W-006 修正で `workerSecretSpecs(web)` に `ADMIN_SETUP_TOKEN` を追加したが、`.dev.vars.example` 冒頭 (`Keep this key set in sync with infra/src/secrets.ts (workerSecretSpecs)`) と `secrets/{stage}.json.example` 冒頭 (`Keep the keys in sync with workerSecretSpecs() in infra/src/secrets.ts`) で明示宣言されている同期契約が破られている。CI deploy は `wrangler secret bulk` で SOPS-decrypted JSON を流すため、`infra/secrets/{stage}.enc.json` 側にも `ADMIN_SETUP_TOKEN` が追加されていなければ web の AdminSignUp フローが本番で `setup_token_disabled` に縮退する (動くが意図せぬ縮退)。Worker matrix App 行も同様に列挙漏れ
  - 提案: 以下 3 ファイルに `ADMIN_SETUP_TOKEN` を追記
    1. `.dev.vars.example`: 新規セクション (空文字でも記載)
    2. `infra/secrets/{staging,production}.json.example`: placeholder 追加
    3. `docs/runtime_cloudflare.md`: App 行 dispatch-side secrets 列 + Dispatch-side secrets 表に web-only 注記

- **[W-002]** `_dispatch_extras_comment` の「five keys below」表現が `ADMIN_SETUP_TOKEN` 追加後 ambiguous
  - 場所: `infra/secrets/staging.json.example:3` / `infra/secrets/production.json.example:3`
  - 理由: コメントは「The five keys below (SECRET_BOX_MASTER_KEY, ADMIN_LLM_API_KEY, R2_*) are required by the web and consumer workers」と書くが、W-001 提案通り `ADMIN_SETUP_TOKEN` を追加すると「below」の総数が 6 になり、コメントの「five」が暗黙に 5 個の dispatch-extras を指すのか直下 5 行を指すのか曖昧になる
  - 提案: W-001 修正時に「The following keys (the dispatch-extras: ...)」のように列挙対象を明示。`ADMIN_SETUP_TOKEN` は別ブロックに切り出すか、コメントで明示的に「web-only」と注記

- **[W-003]** `ADMIN_LLM_MODEL` の default リテラルが render 側にも残り SSOT 性が中途半端 (Round 1 W-001 修正の不完全さ)
  - 場所: `infra/scripts/renderWrangler.ts:92` (`"claude-3-5-sonnet-latest"`) と `wrangler.toml:33,111` (同値)
  - 理由: Round 1 W-001 修正でテンプレ側のリテラルは消えたが、render 側 default literal と local `wrangler.toml` のリテラルが二重に残った。stage 上書き機構がまだ無いため、当面は default 値変更のみ。default を変えるとき 2 箇所同期が必要なまま (テンプレ側の差し替え自由度は得たが、SSOT 化はまだ完成していない)
  - 提案: 短期: コード上にコメント「local wrangler.toml と同期せよ」を render.ts 側に追記。中期: 別 Issue で `pulumi config` (`hollow:adminLlmModel`) を読み StackOutput 経由で配り、render default を撤廃 → `progress.md` のフォローアップ Issue 候補に追記

#### Notes
- **[N-001]** Round 1 で指摘した 8 件のうち、6 件が実装上で適切に修正され (W-001/W-003/W-006/W-007/W-008)、2 件 (W-002/W-004+W-005) は progress.md のフォローアップ Issue 候補に明記されており、対応方針の透明性は高い
- **[N-002]** `renderWrangler.ts:96-101` の `unknown variable in template` throw により、placeholder 同期漏れは render 時点で fail-fast する
- **[N-003]** `R2_TEMP_FILES_BUCKET` / `R2_OBJECTS_BUCKET` の StackOutput → render → template の経路が完結し、bucket 名 SSOT が一意
- **[N-004]** docs/runtime_cloudflare.md L86 で「Pulumi up → R2 API token 発行 → SOPS encrypt → deploy」の全体フローを正確に記述しており、W-008 の指摘に直接対応
- **[N-005]** `workerSecretSpecs` の `shared` / `dispatchExtras` / `webOnly` 三段分割は人間可読性が高く、ADR-007 の per-worker filter 未実装の現状下でも構造化されている

---

### Application DI

#### Blockers
なし

#### Warnings
なし

#### Notes
- **[N-001]** DI W-001 修正は完璧。`buildRelayTrigger(relay, waitUntil, logger)` の三項分岐は元の inline ロジックと strict に 1:1 (引数順序も `ServiceBindingRelayTrigger` コンストラクタ引数順序と一致)
- **[N-002]** DI W-002 JSDoc 修正は Workers 公式 `ctx.waitUntil` 仕様に整合
- **[N-003]** ADR-009 は背景・三選択肢の trade-off・採択理由・consequences を完備
- **[N-004]** DI W-003 は scope 外として progress.md に follow-up Issue 候補に記録済

---

### Test

#### Blockers
なし

#### Warnings
なし

#### Notes
- **[N-001]** `buildRelayTrigger` の pure 関数切り出し + 3 ケース instanceof / === NoopRelayTrigger で Round 1 W-001 のトートロジー完全解消
- **[N-002]** `it.each` 5 ケースの missing key は `r2PresignReady` の AND 連 5 項目と 1:1 対応
- **[N-003]** `vitest.config.integration.ts` の TODO コメントは scope 明示
- **[N-004]** `ServiceBindingRelayTrigger` import は `buildRelayTrigger` 3 ケースで正当に instanceof assertion に使われ misleading 解消
- **[N-005]** `tempFilesBinding()` ヘルパーは ADR-008 通り型 skew 完全回避
- **[N-006]** 既存 spy workaround の double assertion が DI regression を直接検出

---

## Design Decisions

なし (Round 2 で新たな design judgment は発生していない)
