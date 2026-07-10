# 検証中の発見の分析

## 発見: `/notes` で RootDocument 全体が二重描画される（既存挙動・Issue 819 スコープ外）

### 観測

正常描画される dev ページ（認証済み）でクライアント DOM を計測:

| route | 進捗バー | `<meta charset>` | `<meta viewport>` | アプリコンテナ |
|-------|---------|------------------|-------------------|---------------|
| `/notes` | 2 | 2 | 2 | 1 |
| `/notes/$id`（詳細） | 1 | 1 | 1 | 1 |
| `/notes/$id/edit` | 1 | 1 | 1 | 1 |

進捗バーの個数は `<meta charset>` / `<meta viewport>` の個数と**完全に一致**し、`{children}`（Outlet 配下＝アプリコンテナ）は常に 1 個。

### 分類

**環境/フレームワーク既存挙動（実装バグではない・スコープ外）。**

- `RootDocument`（`html>head+body`）の head メタ（`charset`/`viewport`）と body 直下要素が、特定ルート（`/notes`）で 2 個描画される。詳細・編集ルートでは 1 個。
- charset/viewport メタは Issue 819 で**一切変更していない**（`__root.tsx` の head 構成は不変）。よってこの二重描画は **Issue 819 以前から存在する** RootDocument レンダリング挙動である。
- 新設した `RouteProgressBar` は `RootDocument` の body 直下に置いた（error/notFound 画面もカバーする ADR-002 の意図的配置）ため、既存メタと**同じ機構で同じタイミングに**重複するだけ。バー固有の不具合ではない。

### 影響評価: なし

- 進捗バーは decorative（`aria-hidden="true"`・`role`/`aria-live` なし）→ スクリーンリーダーは 2 個とも無視。二重読み上げは発生しない。
- `pointer-events-none` + `fixed inset-x-0 top-0` で完全に同一位置・同一サイズに重なる → 視覚的に 1 枚と区別不可。idle 時は両方 `opacity-0`、loading 時は両方 `bg-accent`＋同位相パルス。
- レイアウトへの影響なし（fixed）。クリック干渉なし（pointer-events-none）。
- 既存の重複 charset/viewport メタと同様、ブラウザは意味的に冗長分を無視する。

### 対応方針

- **Issue 819 のコード変更は不要。** バーの重複は装飾上・機能上の影響がなく、RootDocument の意図的配置（error/notFound カバー）を崩してまで dedupe する価値はない。既存の重複メタと同じ扱い。
- **本 Issue で新たなバグを持ち込んではいない**ことを計測で確認済み（バー数＝既存メタ数）。
- 既存の RootDocument 二重描画（`/notes` の重複 charset/viewport）は Issue 819 とは独立した既存の軽微な correctness smell。Phase 4 で既存 Issue の有無を確認し、独立していれば低優先度で起票を検討する（本 Issue にはぶら下げない）。

### 補足: 自動検証できなかった項目

- AC-1（クリック後 200ms 以内の進捗バー出現）・AC-3（モバイル/hover 無効）・AC-6（reduced-motion 静的化）は、遷移中の**一過的**な表示状態。agent-browser は `wait --load networkidle` 後に snapshot するため、loading 完了後の状態しか観測できず、進捗バーの一瞬の可視化を捕捉できない。
- これらはユニットテスト（`RouteProgressBar.test.tsx` のクラス契約・`isLoading=true` 可視化、reduced-motion クラス契約）で担保し、視覚的タイミングは `.issue/819/testing.md` の手動手順（Network throttling ＋目視）に委譲する。
