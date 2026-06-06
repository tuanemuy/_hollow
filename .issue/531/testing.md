# 動作確認計画 — Issue #531: isSafeUrl が HTML エンティティ表記の URL を生値判定でバイパスされる

**Issue:** #531
**作成日:** 2026-06-06

---

## 確認環境

このIssueの変更は adapter 層の純粋関数（`isSafeUrl`）とそのユニットテストに閉じる。UI 変更は無く、確認の主体はユニットテスト。

### 検証環境の起動

サーバー起動は不要（純粋関数のユニットテストで完結）。ブラウザ目視確認を行う場合のみローカルサーバーを起動する:

```bash
pnpm dev
```

### デプロイ方法

なし（検証環境＝ユニットテストで確認できる）。本番反映は通常の `pnpm deploy:production` フローに従う（本Issue固有の追加手順なし）。

## 確認項目

### 1. サニタイザのユニットテスト（主検証）

- **目的:** エンティティ表記の悪性 URL が `isSafeUrl` で確実に弾かれ、正当 URL が誤って弾かれないことを確認する。
- **手順:**
  1. 対象テストを実行する:
     ```bash
     pnpm vitest run app/core/adapters/sanitizer/__tests__/htmlSanitizer.test.ts
     ```
  2. 追加した攻撃ケース・回帰ケースがすべて PASS することを確認する。
- **期待結果:** 全テスト PASS。特に以下の攻撃ケースが reject されること:
  - `&#47;&#47;evil.com` / `&sol;&sol;evil.com` / `&#106;avascript&#58;alert(1)`（Issue の3ケース）
  - セミコロン無し `&#106avascript&#58alert(1)` / `&#47&#47evil.com`
  - 16進 `&#x2f;&#x2f;evil.com` / 先頭 C0 `&#1;//evil.com` / Tab 挟み込み `j&Tab;avascript:`
  - 大文字 named `javascript&Colon;alert(1)`
  - および正当 URL（`https://`/`mailto:`/相対/クエリ `&`/二重エンコード `&#x26;sol;`/`mailto:…&copy;…`）が通過すること。
- **確認ポイント:** 攻撃ケースは「`evil.com`/`javascript:` が出力に不在」かつ「`removed` に `unsafe URL scheme` が記録される」の両方が assert されていること（偽陽性でないことの保証）。

### 2. 品質ゲート

- **目的:** 型・lint・format が壊れていないことを確認する。
- **手順:**
  ```bash
  pnpm typecheck && pnpm lint:fix && pnpm format
  pnpm test:unit
  ```
- **期待結果:** すべてエラーなく完了。`test:unit` が全 PASS。
- **確認ポイント:** `toPlainText` の既存テストが不変で PASS していること（`decodeEntities` を触っていない証明）。

## エッジケース・異常系

### 1. 二重エンコードの過剰防御回避

- **目的:** `&amp;#47;&amp;#47;evil.com` / `&#x26;sol;&#x26;sol;evil.com` が「相対パス」として**通過**し、過剰に弾かれないことを確認する。
- **手順:** 該当テストケースの結果を確認する。
- **期待結果:** 通過（reject されない）。ブラウザは1パスのみデコードしリテラル相対パスと解釈するため。

### 2. （任意）ブラウザ目視確認

- **目的:** 実際のノート描画でエンティティ表記の悪性リンクが無害化されることを確認する。
- **手順:**
  1. `pnpm dev` でローカルサーバーを起動する。
  2. ノート本文に `<a href="&#106;avascript&#58;alert(1)">x</a>` 等を含むコンテンツを保存・表示する。
  3. 描画後の DOM で当該 `href` が除去されている（クリックしても script が走らない）ことを確認する。
- **期待結果:** 悪性 `href` が除去され、XSS が発火しない。
- **確認ポイント:** ユニットテストで担保済みのため任意。シードや特別な環境は不要。

## 既存機能への影響確認

- 正当な外部リンク（`https://`）・メールリンク（`mailto:`）・内部相対リンク・`[[wikilink]]` プレースホルダ・メディア `<img src="/media/...">` が従来どおり通過・描画されること（既存テストでカバー）。

## 確認チェックリスト

- [ ] `pnpm vitest run app/core/adapters/sanitizer/__tests__/htmlSanitizer.test.ts` が全 PASS
- [ ] 攻撃ケース（Issue の3ケース＋セミコロン無し＋16進＋先頭 C0＋Tab＋大文字 named）が reject
- [ ] 正当 URL・二重エンコード・mailto local named が通過
- [ ] `pnpm typecheck && pnpm lint:fix && pnpm format` がエラーなし
- [ ] `pnpm test:unit` が全 PASS（`toPlainText` 既存テスト不変）
