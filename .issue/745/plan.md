# 実装計画 — Issue #745: DirectoryBreadcrumb と NoteBreadcrumb の共通化

**Issue:** #745
**作成日:** 2026-06-20
**複雑度:** 小規模

---

## 目的

#743 で同型化した `DirectoryBreadcrumb`（一覧 P10）と `NoteBreadcrumb`（詳細 P11）のパンくず描画ロジック（Separator / CRUMB_LINK / セグメント map / 末尾 aria-current span / nav className）を共通コンポーネントへ抽出し、重複を解消する。見た目・挙動は不変な純粋リファクタ。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | `app/components/note/` 配下に共通パンくずコンポーネントが存在し、Separator / CRUMB_LINK / SEP / 累積 id key / nav className を単一定義で持つ（両ファイルからの重複が消える） | Issue「現状の重複」「対応方針」 | 1, 2 |
| AC-2 | 共通コンポーネントが「リンクにするセグメント配列」「非リンク末尾テキスト」「aria-label」をパラメータ化し、両者の差分（aria-label / 末尾の扱い）を表現できる | Issue「差分」「対応方針」 | 1 |
| AC-3 | `DirectoryBreadcrumb` は共通コンポーネントの薄いラッパーになり、最後のセグメントを非リンク末尾・それ以外をリンクとして渡す | Issue「対応方針」 | 2 |
| AC-4 | `NoteBreadcrumb` は共通コンポーネントの薄いラッパーになり、全セグメントをリンク・`noteTitle` を非リンク末尾として渡す | Issue「対応方針」 | 2 |
| AC-5 | 既存単体テスト `DirectoryBreadcrumb.test.tsx` / `NoteBreadcrumb.test.tsx` が変更なしで全て PASS する（検証観点を維持） | Issue「既存の単体テストの検証観点は維持」 | 3 |
| AC-6 | レンダリング結果（DOM 構造・class・aria 属性・リンク search）が変更前と同一（純粋リファクタ） | Issue「見た目・挙動は不変」 | 1, 2, 3 |

## スコープ

### 含まれないもの
- 見た目・余白・配置の変更（#743 で確定済み。nav の `mb-6` や gap・色トークンは現状維持）
- 共通コンポーネントの汎用化のやり過ぎ（root crumb・leading icon 等、現状の両者にない機能の先取りはしない）

## 調査結果

- 関連ファイル:
  - `app/components/note/list/DirectoryBreadcrumb.tsx` — 一覧 P10。最後のセグメントを非リンク末尾、それ以外をリンク。`aria-label="現在のディレクトリ"`。
  - `app/components/note/detail/NoteBreadcrumb.tsx` — 詳細 P11。全セグメントをリンク、`noteTitle` を非リンク末尾として追加。`aria-label="パンくず"`。
  - `app/components/note/directoryTree.ts` — `BreadcrumbSegment = Readonly<{ id: string; name: string }>` の SSOT。
  - `app/components/note/HomePage.tsx:178-186` — `DirectoryBreadcrumb` 呼び出し元。`directorySegments.length > 0` のときだけ描画（**空配列は渡らない**）。
  - `app/components/note/detail/NoteDetail.tsx:127` — `NoteBreadcrumb` 呼び出し元。`segments` は空もありうる（root-level note）。
  - `app/components/auth/links.ts` の `HOME_SEARCH` — リンクの search に展開。
- あるべきアーキテクチャ: プレゼンテーション層の純粋表示コンポーネント。ユーティリティファースト Tailwind、繰り返すユーティリティ文字列はモジュールスコープ定数に hoist（CLAUDE.md「Styling」）。state なし。
- 既存実装の状態: #743 で両者が同型化済み。共通化の前提（同一構造）は整っている。乖離なし。
- 依存関係: 呼び出し元は `HomePage.tsx` と `NoteDetail.tsx` の 2 箇所のみ。props シグネチャ（`DirectoryBreadcrumbProps` / `NoteBreadcrumbProps`）を維持すれば呼び出し元は無変更。

## 設計

### ドメインモデルへの影響
なし（プレゼンテーション層のみのリファクタ）。

### ユースケース / アプリケーションロジック
なし。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション

共通コンポーネント `Breadcrumb`（`app/components/note/Breadcrumb.tsx`）を新設。両者の差分を「リンク列 + 非リンク末尾 + aria-label」で吸収する。

```tsx
export type BreadcrumbProps = Readonly<{
  ariaLabel: string;
  links: readonly BreadcrumbSegment[]; // リンクとして描画するセグメント
  current: string;                     // 非リンク末尾テキスト（aria-current="page"）
}>;
```

描画ルール（現状の `NoteBreadcrumb` の構造をそのまま一般化したもの）:
- `links.map`: 各リンクの前に `index > 0` で Separator、`{ ...HOME_SEARCH, directoryId }` の `<Link>`、key は累積 id path。
- `links.length > 0` のとき current の前に Separator。
- `current` を `aria-current="page"` の非リンク `<span className="text-ink-secondary">` で描画。

このルールが両者の全ケースを満たすことの検証:
- DirectoryBreadcrumb 2 セグメント `[Documents, Research]` → `links=[Documents]`, `current="Research"`: 内部 Separator 0 + 末尾 Separator 1 = 1。リンク 1（Documents）、末尾 Research。✅（既存テスト一致）
- DirectoryBreadcrumb 1 セグメント `[Documents]` → `links=[]`, `current="Documents"`: Separator 0、リンク 0。✅
- NoteBreadcrumb 2 セグメント + title → `links=[Research, 論文メモ]`, `current="My Note"`: 内部 1 + 末尾 1 = 2。✅
- NoteBreadcrumb root（空セグメント） → `links=[]`, `current="Root Note"`: Separator 0、リンク 0。✅

## 実装ステップ

### 1. 共通コンポーネント `Breadcrumb` を新設

- **対象ファイル:** `app/components/note/Breadcrumb.tsx`（新規）
- **変更内容:** `SEP` / `CRUMB_LINK` 定数、`Separator()` 関数、nav（className・`aria-label` を props 化）、`links.map`（累積 id key・`<Link>`）+ 末尾 `current` の `aria-current` span を実装。`BreadcrumbProps` を export。
- **理由:** 重複していた描画ロジックを単一の正にする（AC-1, AC-2）。

### 2. `DirectoryBreadcrumb` / `NoteBreadcrumb` を薄いラッパー化

- **対象ファイル:** `app/components/note/list/DirectoryBreadcrumb.tsx`, `app/components/note/detail/NoteBreadcrumb.tsx`
- **変更内容:**
  - `DirectoryBreadcrumb`: props（`segments`）はそのまま。`links = segments.slice(0, -1)`, `current = segments[segments.length - 1]?.name ?? ""` を導出し `<Breadcrumb ariaLabel="現在のディレクトリ" links={links} current={current} />` を返す。既存 JSDoc は要点を残しつつ「共通 Breadcrumb のラッパー」である旨に更新。
  - `NoteBreadcrumb`: props（`segments`, `noteTitle`）はそのまま。`<Breadcrumb ariaLabel="パンくず" links={segments} current={noteTitle} />` を返す。JSDoc 同様に更新。
  - 各ファイルから `SEP` / `CRUMB_LINK` / `Separator` / map ロジックを削除。
- **理由:** 呼び出し元（`HomePage` / `NoteDetail`）を無変更にしつつ重複を消す（AC-3, AC-4, AC-6）。

### 3. 検証

- **対象ファイル:** 既存テスト 2 本（変更しない）
- **変更内容:** `pnpm test:unit` で両テストが PASS することを確認。`pnpm typecheck && pnpm lint:fix && pnpm format`。
- **理由:** 振る舞い不変の保証（AC-5, AC-6）。

## 設計判断

`Breadcrumb` の配置は `app/components/note/`（両者の共通親、`directoryTree.ts` と同階層）。差分の吸収は「末尾ノードを別 props にする」案ではなく「リンク列 + 末尾テキスト文字列」案を採る — DirectoryBreadcrumb は最後のセグメントを末尾テキストに、NoteBreadcrumb は noteTitle を末尾テキストにと、両者を同一インターフェースで素直に表現でき、末尾が常に非リンク `aria-current` span という共通の振る舞いとも一致するため。ADR を起こすほどのトレードオフではない。

## リスクと注意点

- `DirectoryBreadcrumb` の元実装は累積 id key を「全セグメント」で計算していたが、ラッパーでは `links`（末尾を除いた配列）で計算する。key は描画リスト内でユニークであればよく、prefix が同じなので各 key の値は変わらない（描画される要素数も同じ）。React の duplicate key 警告テストは引き続き PASS する。
- 空セグメントは `DirectoryBreadcrumb` には呼び出し元のガードで渡らない（`current=""` の異常系は実害なし）。`NoteBreadcrumb` の空セグメントは `links=[]` で正しく root-level 表示になる。

## テスト方針

- 既存単体テスト 2 本を**無変更で** PASS させる（最重要 — 振る舞い契約の維持）。
- `pnpm test:unit` 全体を流して回帰がないこと。
- `pnpm typecheck` / `pnpm lint` クリーン。
