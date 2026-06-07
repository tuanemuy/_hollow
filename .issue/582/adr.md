# ADR — Issue #582: ブランドアイコン(Vesica)を各ページの可視ロゴへ反映する

## ADR-001: in-app ロゴはインライン SVG ロックアップ（アウトライン wordmark）で実装する

### Status
Accepted

### Context
確定ブランドは Vesica マーク + Avenir Next（lowercase / weight 400）。アプリ内の可視ロゴへ反映するにあたり、wordmark の描画方法に複数の選択肢がある:

- **案A:** `hollow-lockup.svg`（マーク=stroke + wordmark=アウトライン path、ともに `currentColor`）をインライン SVG として React 化。
- **案B:** Vesica マーク（インライン SVG）+ wordmark はプレーンテキスト「hollow」を CSS で描画。
- **案C:** `<img src="...svg">` でロックアップを参照。

制約:
- プロジェクトは Avenir Next を Web フォントとして同梱していない（OG 画像でも CoreText でアウトライン化して回避した経緯がある）。
- テーマ（light/dark）で色追従させたい（既存テキストロゴは `text-ink` = `currentColor` 相当）。

### Decision
**案A を採用**。`spec/design/icons/hollow-lockup.svg` を `BrandLockup` コンポーネントとしてインライン SVG 化し、mark の stroke / wordmark の fill をともに `currentColor` にする。マーク単体は `BrandMark` として切り出し、`BrandLockup` から再利用する。

- 案B は不採用: Avenir Next を同梱しないため、ブラウザ環境ごとに wordmark の字形が変わり、OG と同じ「非再現的フォールバック」問題を in-app に持ち込む。
- 案C は不採用: `<img>` は `currentColor` を継承できず light/dark テーマ追従ができない（mask 化すれば可能だが複雑）。

### Consequences
- 良い点: フォント非依存で確定ブランドの字形を全環境で再現。`currentColor` でテーマ追従。lucide `Icon` と同じ aria / サイズコントラクトに揃う。
- トレードオフ: wordmark のアウトライン path が長くコンポーネントファイルが大きくなる。将来 wordmark を変える際は `spec/design/icons/` の素材から再生成して差し替える必要がある（再生成手順は `spec/design/icons/index.md` に記載済み）。

---
