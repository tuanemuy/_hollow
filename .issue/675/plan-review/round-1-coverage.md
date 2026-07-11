# Round 1 レビュー — 視点: Issue 要件カバレッジ・スコープ整合性

**対象:** `.issue/675/plan.md` / `.issue/675/adr.md`
**Issue:** #675 refactor(runtime): dev 限定エントリ分離で InlineRelayTrigger の本番混入を構造的に防ぐ
**レビュー日:** 2026-07-10

## トレーサビリティ確認（完了条件・オーナー方針 → AC）

コードと突き合わせて、Issue 本文の完了条件・オーナーコメントの合意事項がすべて AC に落ちているかを確認した。

| 由来 | 内容 | 対応 AC | 判定 |
|---|---|---|---|
| 完了条件1 | `pnpm build` にモジュールグラフとして `InlineRelayTrigger` が構造的に含まれない | AC-1 | OK |
| 完了条件2 | dev（`pnpm dev` / `pnpm start`+`build:local`）で inline relay が機能 | AC-3, AC-4 | OK |
| 完了条件3 | DCE 依存の制約コメント・手動 grep 手順が撤去 | AC-6 | OK |
| オーナー方針1 | factory `createFetchHandler(hooks?)`（fetch ラップ不可）、ALS は共有側 top-level、prod default は hook なし | 設計節 + ADR-001/002、AC-1 | OK |
| オーナー方針2 | R2 dev proxy を「検討」ではなく**同時に分離**、pre-route hook で刺す | AC-2, AC-4、preRoute hook | OK |
| オーナー方針3 | mode 分岐は `mode === "production" ? prod : dev`、誤指定は「dev 不動作」側に倒れる | AC-5、ADR-003 | OK |
| オーナー方針4 | 継ぎ目は既存 `relayTriggerOverride` 流用（新設不要） | スコープ「含まれないもの」+ step 3 | OK |

完了条件・方針の全項目が AC にマップされており、**漏れは無い**。継ぎ目・mode 分岐・アダプター importer の主張はコードで裏取り済み（`inlineRelayTrigger.ts` / `devObjectStorageHandler.ts` を import するのは prod エントリ `app/server.cloudflare.ts` とテスト2本のみ。構造分離の前提は成立する）。

---

## 問題点（要修正）

- **[P-001]** `import.meta.env.DEV` の値の記述が誤っており、AC-7 と矛盾しうる（plan L44, L180）
  - 内容: plan L180 は「`import.meta.env.DEV` は `pnpm dev`・`vite build --mode development`（build:local）で `true`」と記す。また L44 は build:local を「`vite build --mode development`」とだけ書く。しかし実際の `build:local` スクリプトは **`NODE_ENV=production vite build --mode development`**（package.json L11）。Vite は `isProduction = (NODE_ENV || VITE_USER_NODE_ENV || mode) === 'production'` で解決するため、`NODE_ENV=production` が付く build:local では `import.meta.env.PROD = true` / **`import.meta.env.DEV = false`** になる（`mode`/`import.meta.env.MODE` は `"development"` のまま）。
  - 理由: `build:local` で `DEV=false` になることこそが、`pnpm start` 経路で inline relay を **`DEV_INLINE_RELAY` フラグのみ**で駆動する（`viteDev` は効かない）現行仕様の要。plan の誤記どおり「build:local で DEV=true」だと `resolveInlineRelayGate` の OR が `viteDev=true` で常に真になり、`DEV_INLINE_RELAY=false` にしても inline relay が止まらない — これは **AC-7「`DEV_INLINE_RELAY` の ON/OFF が従来どおり効く」と正面から矛盾**する。なお設計 L116 のコード自体は `viteDev: import.meta.env?.DEV === true` を素通しするだけなので実装は正しく動くが、リスク記述と AC の根拠が食い違ったままだと、AC-7 の手動検証（`pnpm build:local && pnpm start` で `DEV_INLINE_RELAY=true/false` の切替が効くことの確認）が正しく設計されない恐れがある。
  - 提案: L44 / L180 を「build:local = `NODE_ENV=production vite build --mode development` → `MODE=development`（→ dev エントリ選択）だが `import.meta.env.DEV=false`。したがって `pnpm start` 経路の inline relay は `viteDev=false`・`DEV_INLINE_RELAY` フラグ単独で駆動（`pnpm dev` は `DEV=true` で `viteDev` 側が駆動）」と訂正する。あわせて AC-7 の検証手順に「build:local 出力で `DEV_INLINE_RELAY` を false にすると inline relay が止まる」ことの確認を明示すると、この不変条件が保全されたことを裏取りできる。

---

## 改善提案（検討推奨）

- **[S-001]** prod（production ビルド）経路の機能スモーク検証を AC に持たせる
  - 理由: 本 Issue は prod エントリの `fetch` フロー（sitemap 分岐・container/ALS セットアップ・通常ルーティング）を factory 化に伴い書き換える。しかし AC-1 は「grep が空」= 混入していないことしか検証せず、`createFetchHandler()`（hook なし）で **prod が従来どおりルーティング・sitemap 応答するか**を保証する AC が無い。step 8 の手動確認も対象が `pnpm dev` / `pnpm build:local && pnpm start` に限られ、production-mode 出力の機能確認が抜けている。分岐の「出所」を hook へ移す過程で sitemap 判定順や `storage.run` 内の早期 return を取りこぼすと、grep はクリーンなのに prod が壊れる、という取りこぼしが起こりうる。「`pnpm build` 出力（もしくは相当）で通常ルート＋`/sitemap.xml` が従来どおり応答する」旨の AC/確認項目を1つ足すと、リファクタの主対象物（prod バンドルは"載らない"だけでなく"動く"）の検証が閉じる。

- **[S-002]** ワンタイム構造検証 grep のキーワードを minify 耐性のある文字列リテラル寄りにする
  - 理由: step 7 の grep は `InlineRelayTrigger | inline-dev | buildDevObjectStorageResponse | DEV_OBJECT_STORAGE_PATH_PREFIX`。このうち `buildDevObjectStorageResponse` / `DEV_OBJECT_STORAGE_PATH_PREFIX` は**識別子**で、production 出力では minify によりリネーム・インライン化され得るため、仮に混入していても grep がすり抜ける可能性がある（構造分離が効いていれば全滅するので実害は低いが、"効いていることの裏取り"としては弱い）。relay 側の `inline-dev`（workerId 文字列リテラル）のように、proxy 側も安定文字列（例: パスプレフィックス値 `"/dev/r2/"` や `"x-content-type-options"` 近傍の固有文言）を対象に含めると、構造分離の有無をより確実に判別できる。あくまで一回限りの裏取りなので必須ではない。

---

## 良い点

- 完了条件・オーナー方針の全項目に AC 番号と対応ステップが紐づいており、**トレーサビリティが明瞭**。「由来」列で各 AC の出所（完了条件 / 方針番号）が追える。
- factory vs fetch ラップの判断（ADR-001）がオーナー方針1（override は config 生成の内側なので外側ラップでは届かない）と正確に一致し、根拠まで書けている。
- R2 dev proxy を Issue 本文の「分離するか検討」から**オーナー方針2の「同時分離すべき」に正しく格上げ**（AC-2）。しかも「dev proxy は DCE ゲートすら無く現状常に本番バンドルに載る＝分離の恩恵が最大」という現物の状態まで把握できている。
- mode 分岐の倒れ方（方針3）を AC-5 / ADR-003 に「production を真側に置き、誤指定は prod 混入ではなく dev 不動作へ倒れる」と正確反映。silent fallback の罠も既存コメントとして認識済み。
- 継ぎ目を新設せず既存 `relayTriggerOverride` を流用する方針（方針4）をスコープ「含まれないもの」に明記し、余計な改変を排除している。
- スコープ規律が良い: worker エントリ除外・`wrangler.toml main` 据え置き・ロジック不変（移動するのは「どこから import されるか」だけ）を明示し、スコープ外作業の混入が見当たらない。
- Issue 本文が列挙していない **adapter JSDoc（`inlineRelayTrigger.ts` / `devObjectStorageHandler.ts`）内の DCE/grep 記述の更新まで AC-6 で拾っている** — 完了条件「DCE 依存を前提とした制約コメント撤去」の精神に沿った網羅で、旧保証モデルの記述残存を防いでいる。
