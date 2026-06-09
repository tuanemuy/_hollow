# ADR — Issue #594: 領域7（P06）メール変更確認のアドレス差分カード

## ADR-001: 旧アドレスの取得元はロード済みエンティティとする

### Status
Proposed

### Context
差分カードに表示する「旧アドレス」を `verifyEmailChange` の応答 DTO に載せる必要がある。取得元には2案がある:
1. challenge payload に `oldEmail` を保存しておき、verify 時に読み出す
2. verify 時に `userRepository.findById` でロードしたエンティティの `email`（`changeEmail` 適用前）を使う

`requestEmailChange` の challenge payload は現状 `{ newEmail }` のみで、`oldEmail` を保存していない。

### Decision
案2（ロード済みエンティティの `found.entity.email`）を採用する。

### Consequences
- 良い点: usecase 変更が `verifyEmailChange.ts` 1ファイルに閉じる。port スキーマや `requestEmailChange` 側への波及がない。verify 時点の実際の現アドレスを反映するため、payload のスナップショットより正確（「今まさに無効化される旧アドレス」として意味が正しい）。
- トレードオフ: request〜verify 間に別経路でアドレスが変わっていた場合、payload スナップショットとは異なる値になりうるが、それは正しい挙動（最新の現アドレスを旧として扱う）。

---

## ADR-002: 差分カードは `role="group"` のみとし `aria-live` を付けない

### Status
Proposed

### Context
success 状態には既に warning alert（`role="status"` = ライブリージョン）がある。差分カードに `role="status"`/`aria-live` を足すと、画面遷移時に旧/新アドレスが二重に読み上げられたり、ライブリージョンが競合しうる。

### Decision
モック準拠で差分カードは `role="group" aria-label="変更内容"` の静的グルーピングとし、`aria-live` は付与しない。warning alert の `role="status"` は据え置く。

### Consequences
- 良い点: モックに忠実。ライブリージョンの競合がない。差分カードのラベル（旧アドレス/新アドレス）テキストが旧/新の**区別**を担保するため、`line-through` の視覚表現は補助的な強調に留まる。旧アドレスが**無効化された**という意味自体は、直後の warning alert（`role="status"`「旧アドレスは使用できなくなりました」）がテキストで担保する。
- トレードオフ: success 遷移時に差分カード自体は自動読み上げされないが、グループとしてフォーカス・ナビゲーション可能であり妥当。

