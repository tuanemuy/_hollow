# ADR — Issue #203: deploy workflow: secret bulk-push の堅牢性を強化する

## ADR-001: jq による `^_` フィルタは中間ファイル方式で行う

### Status
Proposed

### Context
B 要件「`^_` プレフィックスの JSON キーを bulk-push 前に drop」を満たすために、`sops -d` の出力を `jq` でフィルタする必要がある。実装方式として 2 案あった:

1. **stdin pipe 方式**: `sops -d ... | jq ... | wrangler secret bulk -` のように 1 行で繋ぐ
2. **中間ファイル方式**: `sops -d` を `$DECRYPTED_RAW` に書き、`jq` で `$DECRYPTED_FILTERED` を生成し、`wrangler secret bulk "$DECRYPTED_FILTERED"` で読む

### Decision
中間ファイル方式を採用する。

### Consequences
- 良い点:
  - C の checkSecrets.ts も同じ `$DECRYPTED_RAW` を読めるため、decrypt が 1 回で済む（pipe 方式だと check と push で 2 回 decrypt が必要、または tee で分岐が必要）
  - wrangler 4.x の `secret bulk` の stdin (`-`) サポート挙動が version によって不安定 — ファイル引数のほうが信頼できる
  - シェルスクリプトとして読みやすい（各ステップが独立した名前付き中間ファイルを介する）
  - trap で両ファイルをまとめて掃除できる
- トレードオフ:
  - tmpfile が 1 つ増える（`DECRYPTED_RAW` と `DECRYPTED_FILTERED`）。CI runner 上の一時領域への書き込みは僅かだが増える
  - decrypt されたファイルがディスクに残る時間が 1 ステップ分長くなる（trap で確実に削除されるため実害は最小）

---

## ADR-002: checkSecrets は missing ∪ extra 両方を検出する

### Status
Proposed

### Context
`workerSecretSpecs()` の union と decrypted JSON keys を比較する際、何を「不一致」とするかに 2 案あった:

1. **missing のみ検出**: spec にあるが JSON にない key を fail
2. **missing ∪ extra 両方検出**: 上記に加え、JSON にあるが spec にない key も fail

### Decision
両方検出する。`^_` プレフィックスのキーは check 側で事前除外してから比較する。

### Consequences
- 良い点:
  - extra key 検出により「`workerSecretSpecs()` から削除したが `infra/secrets/*.enc.json` に古い key が残っている」状態を発見できる
  - secret cleanup（旧 key の削除）も SSOT 駆動で運用できる
  - B が将来壊れて `_*` 以外の不要キーが混入した場合に拾える
- トレードオフ:
  - `infra/secrets/*.enc.json` を更新するたびに spec も同期しないと CI が落ちる（これは「fail loud」の意図通り — 良いトレードオフ）
  - operator が一時的に古い key を残したまま新 key を追加する運用ができなくなる（移行期は spec と JSON を同 PR で更新する必要がある）

---

## ADR-003: workflow の secret 注入は decrypt → check → filter → push の順で行う

### Status
Proposed

### Context
新しく加える check と filter の順序として、以下の案があった:

1. decrypt → check → filter → push
2. decrypt → filter → check → push
3. decrypt → filter & check 並列 → push

### Decision
案 1（decrypt → check → filter → push）を採用する。check は filter 前の raw ファイルに対して実行するが、checkSecrets.ts 内部で `^_` キーを事前除外して比較する。

### Consequences
- 良い点:
  - decrypt 直後に check が走るので、`infra/secrets/*.enc.json` の問題は最速で発覚する（filter で `_*` が落ちた後ではなく、原本のままで検証）
  - check が pass = 「spec と decrypted JSON が同期している」と明確に言える（filter ロジックの正しさに依存しない）
  - filter は単に bulk-push 入力の整形であり、check の前提にしない
- トレードオフ:
  - check 側で `^_` 除外ロジックを持つため、`_*` プレフィックスの規約が check と filter の 2 箇所に存在することになる（規約が変わったら 2 箇所更新が必要）。プレフィックス値をコメントで明示することで対処

---

## ADR-004: `workerSecretSpecs` のシグネチャを `Pick<Config, "appName" | "stage">` に狭めた上で checkSecrets はダミー値で呼ぶ

### Status
Proposed

### Context
`workerSecretSpecs(cfg)` は元々 `Config`（`appName`, `stage`, `zoneName`, `hostname`, `accountId` の 5 フィールド必須）を受け取っていた。しかし実装上は `workerNames(cfg)` 経由で `appName` と `stage` しか触らない。`checkSecrets.ts` の目的は `.secrets: readonly string[]` の union を取ることだけで、worker 名（`appName`-prefixed）にも興味がない。

選択肢:

1. **シグネチャを実態に合わせて狭める**: `workerSecretSpecs(cfg: Pick<Config, "appName" | "stage">)` にする
2. **シグネチャは維持してダミー 5 フィールドを埋める**: `{ appName: "check", stage, zoneName: "_", hostname: "_", accountId: "_" }`

### Decision
案 1 を採用。`workerSecretSpecs` のシグネチャを `Pick<Config, "appName" | "stage">` に狭める。`checkSecrets.ts` は `{ appName: "check", stage }` のダミーを渡す。

### Consequences
- 良い点:
  - 型で invariant を表現できる（「`workerSecretSpecs` は zone / hostname / accountId に依存しない」が型に出る）
  - `checkSecrets.ts` が pulumi に依存しなくなり、ローカルでも CI でも同じコードで動く
  - check 単体での実行が軽量（pulumi stack output を読まなくて済む）
  - 既存 callsite（`infra/src/index.ts` 周辺）は full `Config` を渡しているため後方互換
- トレードオフ:
  - 将来 `workerSecretSpecs()` が `.secrets` 内で zoneName / accountId 等を参照したくなったとき、再度シグネチャを広げる必要がある（その時点で「`.secrets` 配列に環境依存値を含めるべきか」を検討する契機になるので、むしろ健全）
  - `.secrets` 配列が `appName` 値そのものに依存する未来は残る（worker 名から派生する secret 命名規約が出てきた場合）。invariant コメントを `infra/src/secrets.ts` 側にも残す

---

## ADR-005: pnpm filter 経由の引数 passthrough は `--` セパレータを明示する

### Status
Proposed

### Context
`pnpm infra:check-secrets:<stage>` → `pnpm --filter @hollow/infra check-secrets:<stage>` → `tsx scripts/checkSecrets.ts <stage>` という 2 段の script chain に対し、末尾の `<decrypted-path>` 引数を伝播させたい。

pnpm の trailing positional 引数の挙動は version によって微妙に変わり、特に `--filter` を介する場合に bare passthrough が失敗するケースが報告されている。

選択肢:

1. **`--` セパレータ明示**: `pnpm infra:check-secrets:staging -- "$DECRYPTED_RAW"`
2. **bare passthrough**: `pnpm infra:check-secrets:staging "$DECRYPTED_RAW"`
3. **環境変数で受け渡し**: `CHECK_SECRETS_INPUT="$DECRYPTED_RAW" pnpm infra:check-secrets:staging`
4. **workflow から直接 tsx を叩く**: `pnpm --filter @hollow/infra exec tsx scripts/checkSecrets.ts staging "$DECRYPTED_RAW"`

### Decision
案 1（`--` セパレータ明示）を採用する。workflow / ローカル smoke / docs の全てで `pnpm infra:check-secrets:<stage> -- <path>` のシンタックスに統一する。

### Consequences
- 良い点:
  - pnpm のバージョン依存挙動を回避でき、引数伝播が確実
  - script 定義は positional 引数のシンプルな CLI のままで良い
  - operator がローカルで叩くときも一貫したシンタックスになる
- トレードオフ:
  - `--` セパレータが慣れていないと `<path>` が引数として認識されない誤解が起きうる（README で明示することで対処）
