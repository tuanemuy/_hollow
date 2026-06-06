# 動作確認計画 — Issue #524: プロトコル相対 URL (//host) が isSafeUrl を通過する

**Issue:** #524
**作成日:** 2026-06-06

## 確認環境

このIssueの変更は adapter 層の純粋関数 `isSafeUrl` の挙動修正であり、
ブラウザ操作を伴う UI 変更は無い。検証はユニットテストで行う。

### 検証コマンド

```bash
# 当該サニタイザのユニットテストのみを実行
pnpm vitest run app/core/adapters/sanitizer/__tests__/htmlSanitizer.test.ts

# プロジェクト全体のユニットテスト
pnpm test:unit

# 型チェック・lint・format
pnpm typecheck && pnpm lint:fix && pnpm format
```

### デプロイ方法

なし（ローカルのユニットテストで確認可能）。本番反映は通常の deploy 経路で足り、本 Issue 固有の手順は不要。

## 確認項目

すべて `htmlSanitizer.test.ts` のユニットテストで検証する（画面操作項目なし）。

### 1. プロトコル相対 URL の除去

- **目的:** `//evil.com/x` が `<a href>` / `<img src>` で相対パス扱いされず除去されること
- **期待:** 出力に `//evil.com` が残らず、`removed` に `unsafe URL scheme: {href|src}` が記録される

### 2. バックスラッシュ変種の除去

- **目的:** `/\evil.com`, `\/evil.com` など、ブラウザが `//` に正規化しうる形も除去されること
- **期待:** 出力に当該ホストが残らない

### 3. 正当な相対パス・絶対 URL のリグレッション

- **目的:** `/rel`, `#anchor`, `?q=1`, `http(s)://`, `mailto:` が従来どおり通ること
- **期待:** 既存の "keeps http/https/mailto and relative URLs" テストが引き続き緑

## ブラウザ検証のスキップ

Web UI に観測可能な変更が無い（adapter 層の純粋関数の挙動修正）ため、ブラウザ検証はスキップ。
本 testing.md に画面操作項目は 1 件も無く、検証はユニットテストで完結する。
