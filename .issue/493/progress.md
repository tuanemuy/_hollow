# 残存課題・既知の制限 — Issue #493

**Issue:** #493
**記録日:** 2026-06-06

実装は plan.md の全ステップを完了。port シグネチャ・戻り値・`removed` 監査・`toPlainText`・`SAFE_URL_SCHEMES`・`on*` 除去・`[[wikilink]]` verbatim・media 抽出契約をすべて維持。以下は意図的な挙動差・既知の制限の記録。

## 1. disallowed タグはサブツリーごと DROP（現行より安全側）

- **内容:** 旧サニタイザは非許可タグを unwrap し中身テキストを escaped text として残した。新実装は ultrahtml の `renderSync` がテキストを再エスケープしない & `<script>`/`<style>` の中身を raw text child として持つため、unwrap すると mXSS の穴になりうる。よって非許可要素はサブツリーごと完全に DROP する。
- **理由:** fail-closed が安全。詳細は adr.md ADR-007。
- **影響範囲:** パイプライン入力（markdown-it `html:false` / TipTap）は非許可タグを生成しないため、正規の content では挙動差は出ない。悪意ある／壊れた入力でのみ「中身テキストが残らない」差が生じるが、これは現行より安全な方向。

## 2. ultrahtml は HTML コメント直前のテキストをパース時に落とす癖がある

- **内容:** `<p>a<!-- c -->b</p>` を ultrahtml `parse` すると、コメント直前のテキスト "a" がツリーから欠落する（ライブラリのパース挙動）。
- **影響範囲:** サニタイザ入力に生 HTML コメントが含まれる場合のみ。パイプライン入力（markdown-it `html:false` はコメントをエスケープし、TipTap もコメントを出さない）にはコメントが含まれないため、実害なし。

## 3. （スコープ外・既存事象）about.md L21 の HTML コメントが可視テキストとして描画される

- **内容:** `app/content/legal/about.md` L21 の `<!-- twitterHandle ... -->` は、markdown 変換（`html:false`）でエスケープされ `&lt;!-- ... --&gt;` として /about ページに可視表示される。
- **これは本 Issue による回帰ではない:** 旧コンバータも `<` をエスケープして同じく可視化していた（pre-existing）。
- **扱い:** 本 Issue のスコープ（adapter 置き換え）外のコンテンツ整備課題。Phase 4 で起票要否を検討。運用ノートとして HTML コメントに書くより、about.md から該当行を削除するか別の表現にするのが望ましい。
