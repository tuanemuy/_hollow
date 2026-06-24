# ADR — Issue #597: ヘッダーの backdrop-filter をリテラルから SSOT トークンに統一

## ADR-008: AuthHeader の webkit 側 backdrop-filter は無改変のままトークン化しない

### Status
Accepted

### Context
Issue #597 は「リテラル `saturate(180%) blur(20px)` を `var(--header-blur)`（同値）に置換、見た目の回帰なし」を要件とする。対象4箇所のうち `auth/AuthHeader/index.tsx` だけ構造が他3つと異なる:

- 他3ファイル（`APP_HEADER` / `LANDING_HEADER` / `PUBLIC_HEADER`）: `[backdrop-filter:saturate(180%)_blur(20px)]` + `[-webkit-backdrop-filter:saturate(180%)_blur(20px)]` の2リテラルを持つ。
- AuthHeader: `supports-[backdrop-filter]:backdrop-blur-xl`（webkit/standard 両方に `blur(24px)` 相当を出す Tailwind ユーティリティ）+ `supports-[backdrop-filter]:[backdrop-filter:saturate(180%)_blur(20px)]`（standard のみ上書き）。`-webkit-` のリテラルは持たない。

結果として AuthHeader は現状すでに Safari（webkit）が `blur(24px)`、Chrome（standard）が `saturate(180%) blur(20px)` という挙動差を持つ（既存の状態）。

選択肢:
- (A) standard リテラルだけ `var(--header-blur)` に置換し、`backdrop-blur-xl` は残す。
- (B) AuthHeader を他3つと同じ「standard + `-webkit-` を両方 `var(--header-blur)`」の canonical パターンに揃え、`backdrop-blur-xl` を除去する。

### Decision
**(A) を採用する。** AuthHeader の standard `[backdrop-filter:...]` のみを `var(--header-blur)` に置換し、`backdrop-blur-xl`（webkit 側のフォールバック）は無改変で残す。

(B) は webkit 側を `blur(24px)` → `saturate(180%) blur(20px)` に変える＝Safari で blur 半径が縮み saturate が加わる視覚変化になり、本Issue の「見た目の回帰が無い（同値置換）」基準に反する。本Issue は SSOT 統一のための同値置換に範囲を限定しており、AuthHeader の webkit/standard 差という別軸の既存挙動の是正はスコープ外とする。

### Consequences
- 良い点: 4箇所すべての standard backdrop-filter が SSOT トークン経由になり、将来 `--header-blur` 変更時に standard レンダリングが追従する。見た目の回帰はゼロ。
- トレードオフ: AuthHeader の webkit 側だけトークンを経由しない状態が残る（受け入れ基準「-webkit- 版含む」は明示的 `-webkit-` リテラルを持つ他3ファイルで満たし、AuthHeader の webkit は `backdrop-blur-xl` が担う既存構造を尊重）。AuthHeader の webkit/standard 挙動差は既存のまま据え置き。是正が必要なら別Issueで扱う。

---
