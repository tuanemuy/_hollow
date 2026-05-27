# ADR — Issue #245: deploy workflow hardening (indexer + Validate secrets 切り出し)

## ADR-001: decrypted SOPS ファイルを step 間で共有しない（各 step で再 decrypt する）

### Status
Accepted

### Context

B の修正で `Validate secrets` を `Inject secrets` から切り出すと、両 step で `sops -d` した同じ平文 JSON が必要になる。GitHub Actions runner は同一 job 内であれば `mktemp` で作ったファイルが step 間で残るため、技術的には共有可能。選択肢:

- **(a) `Validate secrets` で decrypt → 後段の `Inject secrets` でそのまま再利用**
  - 利点: decrypt 1 回で済む（数百ms の節約）。
  - 欠点: step 間で平文 secret を持ち越すため、cleanup の責務が複雑化（trap が job 末尾にしか付けられない / 中間 step の失敗時に確実に消える保証が要追加検証）。`$GITHUB_ENV` 等の永続化機構経由でパスを共有する必要があり、間接的に secret 隣接情報がログ閲覧者に晒される懸念。
- **(b) `Validate secrets` と `Inject secrets` でそれぞれ decrypt + step スコープの trap で消す**
  - 利点: 各 step が自己完結。trap の cleanup は step 終了時に必ず実行され、平文ファイルが job をまたいで残るリスクがゼロ。既存 `Inject secrets` の `set -euo pipefail` + `trap rm -f` パターンをそのまま踏襲できる。
  - 欠点: `sops -d` を 2 回実行（数百ms のオーバーヘッド）。

### Decision

**(b) 各 step で再 decrypt** を採用する。

理由:

- secret の最小権限・最短保持の原則に照らすと、平文ファイルを job スコープに広げない (b) が明確に優位。
- `sops -d` のオーバーヘッドはローカル CPU 演算のみで数百 ms 規模であり、deploy 全体の 20 分 timeout に対して無視できる。
- 既存 `Inject secrets` の trap パターン（`DECRYPTED_RAW=""` → `trap 'rm -f "${DECRYPTED_RAW:-}"' EXIT` → `mktemp`）を `Validate secrets` でもそのまま流用でき、保守コストが最小。

### Consequences

- 良い点: 各 step が自己完結し、cleanup 漏れリスクなし。`Validate secrets` だけを取り出してデバッグする際も追加の前提なしに実行できる。
- トレードオフ: `sops -d` を 2 回走らせるコストを許容する（無視できる範囲）。

---

## ADR-002: indexer の deploy 挿入位置 — `dlq` と `consumer` の間（依存なし worker クラスタの末尾）

### Status
Accepted

### Context

`Deploy Workers` の command list は Issue #188 で「Service binding 依存方向: binding されない側 → binding する側」の順に確立されている。

現状:

```
relay      # 何もbindしない、top-levelとconsumerからbindされる側 → 最初に必要
pruner     # 依存なし worker
dlq        # 依存なし worker
consumer   # RELAY を bind する → relay の後
(top)      # RELAY を bind する → relay の後
```

indexer は wrangler.toml / `wrangler.<stage>.toml.tmpl` 全体を確認した結果、`[[services]]` を一切持たず、また他のいずれの worker からも indexer は service binding されていない（完全に独立）。

選択肢:
- **(a) `dlq` と `consumer` の間に挿入** — 依存なし worker クラスタの末尾。
- **(b) `pruner` の前に挿入** — クラスタの先頭。
- **(c) consumer / top の後に追加** — 順序的にはどこでも動くため、最後に追加するだけ。

### Decision

**(a) `dlq` と `consumer` の間に挿入** を採用する。

理由:

- 依存なし worker クラスタ（`pruner`, `dlq`, `indexer`）をまとめてグルーピングすることで、「relay → 依存なし worker 群 → relay を bind する worker 群」という意図が読み手にとって最も明瞭になる。
- (c) は順序的に動くが、「依存方向で並べた worker リスト」というセマンティクスを壊し、将来の読み手に「なぜ indexer だけ最後？」という疑問を残す。
- (b) と (a) の差は意味的に小さいが、`pruner → dlq` のアルファベット順を尊重して indexer も同じ位置（D < I）に置く方が一貫性が高い。

### Consequences

- 良い点: 依存方向に従った既存の意図がそのまま維持され、コードレビュアーが「なぜこの位置か」をコメント無しで読み取れる。
- トレードオフ: 特になし（順序の意味的な制約は満たしている）。
