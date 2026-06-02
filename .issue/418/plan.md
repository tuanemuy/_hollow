# 実装計画 — Issue #418: テキストリンク装飾を common primitive へ統一する（#336 フォローアップ）

**Issue:** #418
**作成日:** 2026-06-03
**複雑度:** 中〜大規模（意匠判断を伴う）

---

## 目的

umbrella #336 の子 Issue「g: リンク装飾の重複」を解消する。`text-accent hover:underline hover:[text-underline-offset:3px]` というテキストリンク装飾が auth の 3 定数（`AUTH_FOOTER_LINK` / `FIELD_LINK` / `CALLOUT_ACTION`）に分散しているのを、common に `textLink` primitive として SSOT 化する。`navItem` で確立した「common base + consumer 側 add-on 合成」パターンを踏襲する。

## スコープ

### 含まれるもの

- common に `textLink` primitive を追加（accent 色 + hover 下線 + offset の装飾のみ）。
- auth の 3 定数（`AUTH_FOOTER_LINK` / `FIELD_LINK` / `CALLOUT_ACTION`）を `textLink` 合成へ置換（視覚回帰ゼロ）。
- `PUBLIC_TEXT_LINK` の死蔵 bare 再エクスポート（`PublicLayout.tsx`）の削除。
- 意匠判断（PUBLIC_TEXT_LINK の据え置き / ノート本文リンクの SSOT 対象外）の ADR 記録。

### 含まれないもの

- `PUBLIC_TEXT_LINK` 定数本体の common 移設・装飾変更（accent 下線系でも pill 系でもない別意匠。`_SIGNUP` が参照中のため `public/styles.ts` に据え置き）。
- ノート本文リンク（`.note-detail-content a`）の utility 化（dangerouslySetInnerHTML 由来で utility class 不可。ADR-002 の文書化済み例外を増やさない）。
- opacity 値の正規化（`disabled:opacity-60` vs pill 系 `55`）。#336 plan で別扱い。
- auth `BTN_*` 統一・focus-visible・public pill 統一（#417 で対応済み）など他の #336 子テーマ。

## 実装ステップ

### 1. common に `textLink` primitive を追加

- **対象ファイル:** `app/components/common/styles.ts`
- **変更内容:** `navItem` の近傍に JSDoc 付きで追加。

  ```ts
  export const textLink =
    "text-accent hover:underline hover:[text-underline-offset:3px]";
  ```

  JSDoc に「合成形（footer/field/callout）」「`PUBLIC_TEXT_LINK` は別系統の pill 風で意図的に別 primitive」「`.note-detail-content a` は同意匠だが dangerouslySetInnerHTML 由来で utility 化不可（ADR-002 cross-reference）」を明記する。
- **理由:** 3 定数に重複する装飾を 1 箇所に集約。`pillBtn`/`navItem` の camelCase const + JSDoc 規約に合わせ、論点の結論をコード近傍に残す。

### 2. auth/styles.ts の 3 定数を `textLink` 合成へ置換

- **対象ファイル:** `app/components/auth/styles.ts`
- **変更内容:**
  - import に `textLink` を追加。
  - `AUTH_FOOTER_LINK = textLink;`
  - `FIELD_LINK = \`text-sm ${textLink}\`;`
  - `CALLOUT_ACTION = \`inline-flex items-center gap-1 ${textLink} font-medium text-sm self-start disabled:opacity-60\`;`
- **理由:** 装飾を `textLink` に委譲しつつ各定数固有の add-on（size / layout / font-medium / disabled）は保持。class トークン集合を現行と一致させ視覚回帰ゼロ。consumer の定数名は不変なので JSX 変更は不要。

### 3. 死蔵 bare 再エクスポートの削除

- **対象ファイル:** `app/components/public/PublicLayout.tsx`
- **変更内容:** import から `PUBLIC_TEXT_LINK` を外す（`PUBLIC_TEXT_LINK_SIGNUP` は使用継続）。`export { PUBLIC_TEXT_LINK };` 行を削除。
- **理由:** grep で JSX 直接消費・外部消費者ともに 0 件の死蔵。#336 plan d の「死蔵の可能性あり、要確認」への結論。定数本体は `_SIGNUP` が参照するため `public/styles.ts` には残す。

### 4. 検証

- `pnpm typecheck && pnpm lint:fix && pnpm format` → `pnpm test`。
- `grep -rn "export { PUBLIC_TEXT_LINK }" app/` が 0 件。
- 生成 CSS の同一性確認（リスク欄参照）。

## 設計判断

詳細は `adr.md` を参照。

- **論点1（primitive 粒度）:** `textLink` は装飾のみ（size 非内包）。`AUTH_FOOTER_LINK` がサイズ非指定で `FIELD_LINK` が明示 `text-sm` を持つため、装飾のみが正しい SSOT 境界。
- **論点2（再構成）:** base `textLink` + 固有 add-on 合成（`navItem` パターン踏襲）。
- **論点3（PUBLIC_TEXT_LINK）:** common に含めず `public/styles.ts` 据え置き、死蔵再エクスポートのみ削除（ADR-001）。
- **論点4（ノート本文リンク）:** SSOT 化対象外、JSDoc 注記に留める（ADR-002）。

## リスクと注意点

- **生成 CSS の同一性（最重要）:** `CALLOUT_ACTION` の class 文字列内で `hover:*` トークン位置が変わる。Tailwind の最終 CSS 出力はユーティリティ定義順で決まり class 文字列順に依存しないため生成物は不変のはずだが、念のため変更前後で `pnpm build` の出力 CSS を diff し差分ゼロを確認する。`FIELD_LINK` / `AUTH_FOOTER_LINK` はトークン集合・順序とも一致のためリスクなし。
- **`disabled:opacity-60` 保持:** pill 系の `55` とは別値だが本 Issue では正規化しない。
- **死蔵削除:** 定数本体は残す。削除は PublicLayout の import 1 項目 + re-export 1 行のみ。`pnpm typecheck` で参照漏れを検出。
- **スコープ厳守:** 本 PR は g（テキストリンク装飾）のみ。

## テスト方針

- 自動: `pnpm typecheck` → `pnpm lint:fix && pnpm format` → `pnpm test`。
- CSS 等価性: `pnpm build` 前後の生成 CSS 比較で差分ゼロ。
- 参照漏れ: `grep -rn "export { PUBLIC_TEXT_LINK }" app/` = 0 件。
- 手動（ブラウザ）: ログイン画面の「サインアップ」フッターリンク（AUTH_FOOTER_LINK）/「パスワードを忘れた」リンク（FIELD_LINK）/「確認メールを再送」ボタン（CALLOUT_ACTION）が従来どおりの accent 色・hover 下線・3px offset・disabled 半透明で表示されること。

## レビュー履歴

### 1周目: 両視点とも問題点ゼロで終了

**修正した点:**
- なし（両レビュアーとも「問題点ゼロ」）

**取り込んだ改善提案:**
- [S-001（両視点共通）] 「トークン集合不変 ⇒ 生成 CSS 不変」の根拠を adr.md に ADR-003 として明文化。視覚回帰ゼロの主張が #273/#416 系のカスケード論点と混同されないようにした。

**見送った提案とその理由:**
- [S-002（アーキ視点）] `.note-detail-content a:hover`（CSS）側に `textLink` への逆参照コメントを足す案。意匠同期の片方向切れ防止になるが、CLAUDE.md「`.note-detail-content` 以外の例外を増やさない」方針に照らし、CSS 例外領域への追記は最小限に留める。実装時に JSDoc cross-reference（textLink 側）でドキュメント導線を確保できれば十分と判断。実装フェーズで CSS 側 1 行コメントの是非を最終判断する。
