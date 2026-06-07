# Hollow — アイコン & Wordmark

## ✅ 決定（確定案）

- **アイコン: Vesica**（二円の重なりが生むレンズ状の空白＝ hollow / 内部リンクの繋がり）
- **Wordmark: Avenir Next / lowercase / weight 400**
- 単色・差し色なし、線画 1.5px（`currentColor`）

確定プレビュー: [`final.html`](./final.html)。マスター: [`hollow-mark.svg`](./hollow-mark.svg)（currentColor）/ [`hollow-mark-ink.svg`](./hollow-mark-ink.svg)（色固定）/ [`hollow-lockup.svg`](./hollow-lockup.svg)。
検討した全案は [`proposals.html`](./proposals.html) に保持。

### 実装済み（このPR）

- `public/favicon.svg` — Vesica マーク（`prefers-color-scheme` で light/dark 自動反転）
- `public/favicon.ico` — 16/32/48 マルチ解像度
- `public/apple-touch-icon.png` — 180・白地・不透明・余白付き
- `public/mask-icon.svg` — Safari ピン留めタブ用（`#1d1d1f`）
- `public/og-image.png` / `og-image.svg` — 白基調・Vesica + `hollow`(Avenir Next) + tagline
- `app/routes/__root.tsx` — `mask-icon` link を追加（他の icon link は既存）

ラスタは `spec/design/icons/hollow-mark-ink.svg` を元に ImageMagick で生成。`public/` を正とする。

### 補足（Wordmark / フォント）

og-image の `hollow` は **Avenir Next をラスタライズ時に焼き込み**（PNG）。Avenir Next は Apple のプロプライエタリフォントのため、配布ベクター（`hollow-lockup.svg`）へのアウトライン埋め込みは行わず、`<text>` 参照（非 Apple 環境はフォールバック）とした。フォント非依存のベクターロックアップが必要になれば、Web フォント採用 or オープンフォント選定が前提。

---

## 検討経緯（全案・保持）

3 アイコン（Ensō / Vesica / Open Frame）に対して、**Helvetica Neue と Avenir Next ×（小文字 / 大文字）= 各 4 パターン**の lockup を一律に展開した。
ビジュアルは [`proposals.html`](./proposals.html) を開いて確認。フォント候補は macOS 標準で表示されるもの（環境で見え方が変わる）。単色・差し色なし。

## 各アイコン共通の 4 パターン

| # | Wordmark |
|---|----------|
| 1 | Helvetica Neue / lowercase |
| 2 | Helvetica Neue / UPPERCASE（字間 +0.18em） |
| 3 | Avenir Next / lowercase |
| 4 | Avenir Next / UPPERCASE（字間 +0.18em） |

- lowercase: weight 400 / 字間 −0.022em
- UPPERCASE: weight 400 / 字間 +0.18em（大文字の可読性確保）

> ウェイトは当初 300（Light）だったが、hairline 寄りで細すぎたため 400（Regular）に変更。さらに太く（500 Medium）したい場合も調整可。

各カードは **上段に light / dark の横並び比較（band）**、その下に上記 4 行の lockup ＋ app icon（dark/light）で構成。

## アイコン（据え置き）

| # | 名前 | 意味 |
|---|------|------|
| 1 | Ensō | 閉じきらない一筆の円＝空・間・余白 |
| 2 | Vesica | 二円の重なりのレンズ状の空白＝繋がり |
| 3 | Open Frame（NEW） | 角丸の枠だけ、中身は空＝書く前のノート |

## 次のステップ

気に入った「アイコン × フォント × 大小文字」1 組を指定してくれれば:

1. 字間・プロポーションを詰めて lockup 確定（横組み・縦積み）
2. `.svg` 化（アイコン / wordmark / lockup）
3. favicon 一式（`favicon.ico` / `apple-touch-icon` / `og:image` / `mask-icon`）
