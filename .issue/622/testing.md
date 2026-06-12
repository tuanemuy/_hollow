# 動作確認計画 — Issue #622: ユーザー公開ノート詳細（P31）をデザインモックに一致させる

**Issue:** #622
**作成日:** 2026-06-13

---

## 確認環境

このIssueは `app/components/public/PublicNoteDetail.tsx` と `app/components/public/styles.ts` のフロントエンドのみの変更。DB スキーマ変更・migration・新規環境変数はなし。P31 を閲覧するには「タグ付き公開ノートを持つユーザー」のシードデータが必要。

### 検証環境の起動

```bash
pnpm db:apply:local   # local D1 にマイグレーション適用（初回のみ）
pnpm dev              # vite dev + workerd 経由でアプリ起動
```

### シードデータ

```bash
pnpm seed:dev-admin   # 開発用 admin ユーザーを投入
```

> P31 の確認には「タグを複数持つ公開ノート」「タグ無しの公開ノート」が必要。シードに含まれない場合は、ログイン後にノートを作成・タグ付与・公開設定して用意する（manual-test スキルがシード整備を担当）。

### デプロイ方法

```bash
# staging（フロントエンドのみの変更なので app のみで十分）
pnpm deploy:staging

# production
pnpm deploy:production
```

### 自動テスト

```bash
pnpm typecheck
pnpm lint:fix
pnpm format
pnpm test:unit
```

## 確認項目

### 1. bottom-meta が横並び両端寄せ・余白がモック一致

- **対応する受け入れ基準:** AC-1
- **目的:** 末尾メタが「タグ左・日付右」の横並びになり、余白がモック（mt 64px / pt 24px）に一致すること
- **手順:**
  1. タグ付き公開ノートの `/u/{username}/{noteSlug}` を開く
  2. 本文末尾のメタ領域（タグ＋日付）を確認する
  3. DevTools でメタ領域の computed `margin-top` / `padding-top` を確認する
- **期待結果:** タグ群が左、公開日が右の横並び両端寄せ。`margin-top: 64px`、`padding-top: 24px`
- **確認ポイント:** 縦積み（タグの下に日付）になっていないこと

### 2. author-mini の hover 反応

- **対応する受け入れ基準:** AC-2
- **目的:** 著者ミニカードにホバーで背景色が付くこと
- **手順:**
  1. P31 上部の著者ミニカード（アバター＋ユーザー名）にマウスオーバーする
- **期待結果:** 背景が `--color-surface-hover` に変化し、transition でなめらかに変わる
- **確認ポイント:** OS の「視差効果を減らす」設定時は transition が無効（`motion-reduce`）

### 3. メタ行タグのリンク化と遷移先

- **対応する受け入れ基準:** AC-3
- **目的:** タイトル下メタ行のタグがリンクになり、著者公開トップのタグフィルタに遷移すること
- **手順:**
  1. P31 のタイトル下メタ行のタグ（`#タグ名`）をクリックする
- **期待結果:** `/u/{username}?tags=["タグ名"]` に遷移し、P30 で当該タグのフィルタチップがアクティブ・ノート一覧がそのタグで絞り込まれる
- **確認ポイント:** タグの見た目（アクセント色）は従来どおり

### 4. 末尾メタのタグはリンクでない

- **対応する受け入れ基準:** AC-4
- **目的:** モック通り、末尾メタのタグは `<span>` のままであること
- **手順:**
  1. 末尾メタのタグにマウスオーバー・クリックする
- **期待結果:** カーソルは通常のまま、クリックしても遷移しない

### 5. トークン微差の解消

- **対応する受け入れ基準:** AC-5 / AC-6 / AC-7
- **目的:** section-title・backlink-text・related-title・pub-pill の文字スタイルがモックと一致すること
- **手順:**
  1. バックリンク・関連ノートのある公開ノートの P31 を開く
  2. DevTools で computed 値を確認する: section-title の `letter-spacing`、backlink-text / related-title の `font-size`、pub-pill の `font-size`
- **期待結果:** section-title: `0.06em`、backlink-text / related-title: `14px` 固定、pub-pill: `--text-xs`（clamp 11–12px）

## エッジケース・異常系

### 1. タグ無しノートの bottom-meta

- **目的:** タグが 0 件でも日付が右端に寄ること（`ml-auto`）
- **手順:**
  1. タグの無い公開ノートの P31 を開き、末尾メタを確認する
- **期待結果:** 日付が右端に表示される（左寄せにならない）

### 2. モバイル幅での折り返し

- **目的:** 狭い幅で bottom-meta が破綻しないこと
- **手順:**
  1. ブラウザ幅を 390px にして、タグの多い公開ノートの P31 を開く
- **期待結果:** タグ群が `flex-wrap` で折り返し、レイアウトが崩れない（折返し時に日付が右寄せになるのは意図どおり）

## 既存機能への影響確認

- **`/notes/public/$noteId`（ID ベース公開 URL）** — 同じ `PublicNoteDetail` を使うため、上記 1〜5 が同様に成立することをスポット確認する
- **P30（`/u/{username}`）** — タグリンクの遷移先。既存の `tags` フィルタ動作にデグレがないこと
- **既存ユニットテスト** — `pnpm test:unit` が緑（`PublicNoteDetail.test.tsx` 含む）
