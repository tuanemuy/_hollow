# 実装計画 — Issue #524: プロトコル相対 URL (//host) が isSafeUrl を通過する

**Issue:** #524
**作成日:** 2026-06-06
**種別:** セキュリティ修正（バックエンド / adapter 層のみ）

## 背景・意図

`HtmlSanitizer`（`app/core/adapters/sanitizer/htmlSanitizer.ts`）の `isSafeUrl` は、
値が `/` で始まると無条件に「相対パス」として許可する。このため
`//evil.com/x` のようなプロトコル相対 URL が `<a href>` / `<img src>` を通過する。

ブラウザはプロトコル相対 URL を現在のスキームで外部ホストへ解決するため、
ノート本文の `<a href="//evil.com">` が外部遷移（open-redirect 風）になりうる。

- **XSS ではない**（script 実行はしない）。`<a>` の外部ナビゲーション / `<img>` の外部読み込みに留まる。
- PR #523 以前から存在する pre-existing 事項（#493 の回帰ではない）。

意図: プロトコル相対 URL を「安全な相対パス」とみなさないようにし、明示スキーム検査
（`http:` / `https:` / `mailto:` のみ許可）に回して落とす。正当な相対パス
（`/media/abc`, `#anchor`, `?q=1`, `./x`, `foo/bar`）は引き続き通す。

## 実装ステップ

### Step 1: `isSafeUrl` の修正（`app/core/adapters/sanitizer/htmlSanitizer.ts`）

`value` の trim 後、相対パス判定（`startsWith("/")`）の **前** にプロトコル相対判定を入れる。

単純な `startsWith("//")` だけでなく、ブラウザが authority 区切りとして
`/` と等価に正規化しうる **バックスラッシュ変種**（`/\`, `\/`, `\\`）も同時に弾く。
先頭2文字がいずれもスラッシュ系（`/` または `\`）なら外部ホスト解決の余地があるため不許可とする。

```ts
const isSafeUrl = (raw: string): boolean => {
  const value = raw.trim();
  if (value.length === 0) return false;
  // Protocol-relative URLs (`//host`, plus backslash variants browsers
  // normalise to `//`) resolve to an external host, so they are not safe
  // relative paths. Fall through to the scheme allowlist, which rejects them.
  if (/^[/\\]{2}/.test(value)) return false;
  if (value.startsWith("/") || value.startsWith("#") || value.startsWith("?")) {
    return true;
  }
  // ...以降は現状維持
};
```

`http://`, `https://` など正当な絶対 URL は先頭が `h`（スラッシュではない）なので
この分岐には掛からず、従来どおりスキーム検査で許可される。

設計判断（バックスラッシュ変種まで弾く根拠、`return false` ではなく分岐を抜けて
スキーム検査に落とす理由）は `adr.md` に記録する。

### Step 2: ユニットテスト追加（`app/core/adapters/sanitizer/__tests__/htmlSanitizer.test.ts`）

既存の `describe("URL scheme policy")` ブロックに以下のケースを追加:

- `<a href="//evil.com/x">` が除去され、`removed` に `unsafe URL scheme: href` が記録される
- `<img src="//evil.com/x">` が除去される
- バックスラッシュ変種（`/\evil.com`, `\/evil.com`）も除去される
- 正当な相対パス（`/rel`, `#anchor`, `?q=1` 等）が引き続き残る（リグレッション確認 — 既存ケースで担保済みなら最小限）

## 影響確認

- ノート本文・legal docs（/about）・avatar/bio で `//host` 形式の正当な利用は無い想定。
  サニタイザ通過後の出力は同一スキーム下の相対/絶対 URL と明示スキーム URL のみで足りる。

## スコープ外

- 他のサニタイズロジック（タグ/属性 allowlist、エスケープ）には触れない。
- フロントエンド・UI 変更なし。

## 検証

- `pnpm test:unit`（vitest）で新規テストが緑になること
- `pnpm typecheck && pnpm lint:fix && pnpm format`
