# ADR — Issue #261: instance_settings: skip version bump when payload is identical to current state

## ADR-001: no-op 最適化はドメイン側で行う（案 A 採用）

### Status
Accepted

### Context

`InstanceSettings.updatePrompt` / `updateDesignTokens` は引数ペイロードが現在値と内容一致でも常に `Version.next` を進めていた。一方 `resetPrompt` / `resetAllPrompts` は「キーがなければ同一参照を返す」no-op パターンを既に持つ。Issue #261 では2案が提示された:

- **案 A**: ドメイン側で内容比較し、deep-equal なら同一参照を返す（`resetPrompt` と対称）
- **案 B**: ユースケース側で先頭ガードして early return

### Decision

案 A を採用する。

理由:

1. **`resetPrompt` / `resetAllPrompts` との対称性** — 集約が「no-op を no-op として表現する」原則に揃う。`UserPromptOverride.clearPrompt` も同じパターン。
2. **illegal states unrepresentable** — CLAUDE.md の原則「型レベルで違法状態を表現不能にする」の精神に沿って、「内容変化なし version 進行」を集約レベルで起こせなくする方が、呼び出し側のガード忘れに依存しない。
3. **比較ロジックの局所性** — `PromptTemplate` / `DesignTokens` の構造を一番よく知っているのは entity モジュール自体。ユースケース側で deep-equal を書くと domain 構造への結合が application に染み出す。

### Consequences

- 良い点: `updatePrompt` / `updateDesignTokens` の呼び出し元（ユースケース・将来追加されるもの）は no-op を意識しなくても version 進行が起こらない。reset 系と挙動が揃う。
- トレードオフ: ファイル内に小さなヘルパー（`promptTemplatesEqual` / `designTokensEqual`）が2つ増える。ただし `PromptTemplate` / `DesignTokens` 専用で、汎用 deep-equal 化は不要。

---

## ADR-002: ユースケース側にも `next === current` ガードを残す

### Status
Accepted

### Context

ADR-001 でドメインが同一参照を返すようになるなら、ユースケース側で `if (next === current) return;` は形式上不要に見える。しかし `resetPromptTemplate` / `resetAllPromptTemplates` には既にこのガードが入っている。

### Decision

`updatePromptTemplate` / `updateDesignTokens` のユースケースにも同形のガードを追加し、reset 系と揃える。

### Consequences

- 良い点:
  - リポジトリ層の `save` 呼び出しを物理的に抑止できる（DB / 外部 store への round-trip が確実にゼロ）。adapter が「version 不変なら no-op」を保証していない可能性に対しても安全。
  - 4つのユースケース（reset 2つ + update 2つ）が完全に同じ形 — 読み手の認知負荷を下げる。
  - 将来、誰かが domain の no-op 化を外しても、ユースケース側のガードが防御線になる。
- トレードオフ: 1行のチェックが冗長と感じられる可能性。ただし防御コードとしては軽量。

---

## ADR-003: 比較ヘルパーは汎用化せずファイル内ローカル関数として置く

### Status
Accepted

### Context

`PromptTemplate` / `DesignTokens` それぞれに deep-equal 関数が必要。これらを VO 側に `equals` メソッドとして生やすか、汎用 `deepEqual` を導入するか、entity ファイル内のローカル関数にするかという選択肢があった。

### Decision

`app/core/domain/adminSettings/entity.ts` 内のモジュールスコープ関数として書く。VO 側に `equals` を生やさず、汎用 deep-equal も導入しない。

### Consequences

- 良い点: 既存の VO API を変えない。汎用 deep-equal を持つことで起きる「どこまで深く比較するか」「Symbol/Date/Map 等の扱い」といった設計議論を回避できる。今回必要なのは平坦な構造の比較のみ。
- トレードオフ: 他箇所で同じ比較が必要になったら抽出を検討する余地が残る。今は YAGNI でローカル関数に留める。
