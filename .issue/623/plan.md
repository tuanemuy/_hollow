# 実装計画 — Issue #623: 共有リンクゲート（P33）・エラーページ（P34）の軽微なモック差分

**複雑度:** 小規模

## 目的

公開系の単票ページ（P33 共有リンクゲート / P34 エラーページ）の実装に残る軽微なモック差分を解消し、モックに一致させる。レスポンシブ差分と幅バグ（#621）は対象外。

## スコープ

3 つの差分のみ。いずれもフロントエンドの presentational な追加で、ドメイン/アプリ/アダプター層には一切触れない。

1. **P33** expired/gone 時の補足テキスト（`.gate-foot` 相当）を追加
2. **P33** インラインエラーにアイコンを追加
3. **P34** 404 の「ホームへ戻る」「検索ページを開く」にアイコンを追加（404 のみ）

## 受け入れ基準

| ID | 基準 | 対応ステップ |
|----|------|------|
| AC-1 | P33 expired/gone（`share_link_revoked` / `notFound`）で「トップへ戻る」CTA の下に上ボーダー付き・12px・ink-tertiary・中央寄せの補足テキスト「共有元に連絡すると、新しいリンクを発行してもらえる場合があります。」が表示される | S1, S2 |
| AC-2 | P33 のインラインエラー（パスワード不一致など）でメッセージ先頭にアイコンが表示される | S3 |
| AC-3 | P34 404 の「ホームへ戻る」に home アイコン、「検索ページを開く」に search アイコンが付く | S4 |
| AC-4 | P34 403/410/500 の「ホームへ戻る」にはアイコンが付かない（差分は 404 の 2 CTA のみ） | S4 |
| AC-5 | 既存のユニットテスト（ShareLinkGate / ErrorPage）が通り、新規挙動をロックするアサーションが追加される | S5 |

## 設計

すべて presentational な変更。新規スタイル定数の追加と、既存コンポーネントへのアイコン要素の追加のみ。`Icon` ラッパー（`app/components/common/Icon.tsx`、`size` は 16/20/24 に型制約・`strokeWidth` 1.5 固定）を使い、デザインシステム契約に従う。lucide の `AlertCircle` / `Home` / `Search` を使用。

### スタイル定数（`app/components/public/styles.ts`）

- `GATE_FOOT` を新設。mock `.gate-foot`（margin-top:24px / padding-top:20px / border-top:1px hairline / font-size:12px / ink-tertiary / center）を Tailwind に写像:
  `"mt-6 pt-5 border-t border-hairline text-xs text-ink-tertiary text-center"`
  （`--text-xs` は最大 12px でモック値に一致）

## 実装ステップ

- **S1**: `app/components/public/styles.ts` に `GATE_FOOT` 定数を追加（P33 セクション）。
- **S2**: `ShareLinkGate/index.tsx` の `isExpiredOrGone` 分岐で「トップへ戻る」`<Link>` の直後に `<p className={GATE_FOOT}>共有元に連絡すると、新しいリンクを発行してもらえる場合があります。</p>` を追加。
- **S3**: `ShareLinkGate/index.tsx` のインラインエラー `<p>` を `GATE_ERROR` 定数に統一し（現状は同一文字列のリテラル）、メッセージ先頭に `<Icon icon={AlertCircle} size={16} />` を追加。`AlertCircle` を import。
- **S4**: `ErrorPage.tsx` の `HomeLink` に `icon?: boolean` プロップを追加し、true のとき `<Icon icon={Home} size={16} />` を先頭に描画。404 分岐の `HomeLink` に `icon` を渡す。`SearchLink`（404 専用）に `<Icon icon={Search} size={16} />` を先頭に追加。403/410/500 の `HomeLink` は変更しない。
- **S5**: ユニットテスト更新。
  - `ShareLinkGate.test.tsx`: expired/gone テストに `gate-foot` 補足テキストのアサーション追加。password mismatch テストにインラインエラーの `<svg>` 存在アサーション追加。
  - `ErrorPage.test.tsx`: 404 の home/search リンクに `<svg>` が含まれること、410/403/500 の home リンクには `<svg>` が含まれないことをアサート。

## 影響範囲

- `app/components/public/styles.ts`（定数追加）
- `app/components/public/ShareLinkGate/index.tsx`
- `app/components/public/ErrorPage.tsx`
- `app/components/public/ShareLinkGate/__tests__/ShareLinkGate.test.tsx`
- `app/components/public/__tests__/ErrorPage.test.tsx`

バックエンド・ルーティング・ドメインへの影響なし。

## リスク

- `Icon` の `size` は 16/20/24 制約のため、モックの 13px ちょうどには合わせられない。Issue が明示的に「`<Icon size={16}>` 方式」を指定しているため 16 を採用（デザインシステム契約を優先）。
- `HomeLink` は 4 バリアントで共有されているため、アイコンを無条件追加すると 403/410/500 にも波及して AC-4 に違反する。プロップで 404 のみに限定する。

## 未解決事項

なし。
