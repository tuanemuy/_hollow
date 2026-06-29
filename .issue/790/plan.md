# 実装計画 — Issue #790: refactor(ingestion): move the in-progress upload badge from the header CTA to the sidebar upload item

**Issue:** #790
**作成日:** 2026-06-28
**複雑度:** 中〜大規模

---

## 目的

ヘッダーの「アップロード」プライマリCTAに乗っている未処理アップロード件数バッジを、サイドバー管理セクションの `/upload` ナビ項目へ移設する。ヘッダーCTAは件数表示を持たない純粋な「アップロード開始」ボタンに戻し、件数の表示・アナウンスを一箇所（サイドバー）に集約する純UI層リファクタリング。

## 受け入れ基準

| # | 基準（検証可能な形で） | 由来 | 対応ステップ |
|---|---|---|---|
| AC-1 | サイドバー管理「アップロード」項目に未処理件数が表示される（0で非表示、99超で `99+`、`NAV_COUNT` 右寄せ表示） | Issue本文 | 1, 3, 4 |
| AC-2 | ヘッダー upload ボタンが件数表示を持たない純粋なCTAになる（バッジ削除、静的 `aria-label="アップロード"`、`data-primary`/`pillBtnPrimary`/先頭配置は維持） | Issue本文 / 設計の問い1・3 | 5 |
| AC-3 | イベント駆動更新（`notifyIngestionQueueChanged`、visibility 復帰、mount）が新しい場所でも動く | Issue本文 / #538 ADR-002 | 1, 3 |
| AC-4 | 件数がアクセシブルなテキスト表現を保持する（ちょうど一度だけアナウンス・欠落なし・重複なし） | Issue本文 / 設計の問い2 | 1, 3 |
| AC-5 | 実装とモックが一致する（ヘッダーCTAは件数なし、サイドバー upload 項目に `.nav-item .count` 規約で件数を表示）。検証対象モックは desktop / mobile 両方の P13 | Issue本文 | 3, 4, 5, 7 |
| AC-6 | `pnpm typecheck && pnpm lint:fix && pnpm format` が通る | Issue本文 | 8 |

## スコープ

### 含まれないもの
- データソース（`getIngestionQueueCountFn` / `countActiveIngestionJobs`）・pub-subバス（`queueBadgeBus`）・notify 呼び出し側の変更。表示位置の移設のみで、件数の取得・通知契約は不変。
- `app/components/layout/Sidebar.tsx` の管理セクションそのものの構成変更（並び順・他項目）。upload 項目の中身だけを差し替える。
- `spec/design/pages/P10-home.html` の管理セクション全体の再同期。当該モックは upload/保存ビュー/エクスポートジョブ項目が未反映で本Issue以前から実装と乖離しており、全面同期は別タスク（spec-sync）。本Issueでは upload 項目を持つモック（P13）だけ件数を同期する。
- 件数バッジを「アラート色」等で note 件数（情報系 count）と視覚的に差別化すること。モック準拠で `NAV_COUNT` をそのまま使う。

## 調査結果

- 関連ファイル:
  - `app/components/layout/Header.tsx` — `UploadButton` をプライマリCTAとしてレンダリング（L56-61）。L54-55 に「アクセシブル名（件数込み）は UploadButton が所有」というコメントあり（移設後は陳腐化）。
  - `app/components/ingestion/UploadButton.tsx` — `useIngestionQueueCount()` で件数取得、`aria-label={uploadButtonLabel(queueCount)}`、子に `<IngestionQueueBadge count>`、`relative`（チップ絶対配置の基準）。`useLocation` でハッシュ `#upload` のアクティブ状態を算出。
  - `app/components/ingestion/IngestionQueueBadge.tsx` — 3つの export: `useIngestionQueueCount`（mount/visibility復帰/notify で再フェッチ、常時ポーリングなし、seq ガード、失敗時は前回値保持）、`IngestionQueueBadge`（`BADGE_CHIP` 絶対配置チップ、0で非表示・99超で `99+`・`aria-hidden`）、`uploadButtonLabel`（`アップロード（未処理 N 件）`）。
  - `app/components/layout/Sidebar.tsx` — サーバーコンポーネント（async、`loadDirectoryTree`/`loadOwnedNotes`/`loadSavedViewsByKind` を await）。管理セクションに `/upload` の `<Link>`（L122-130、`NAV_ITEM` + `activeProps={ACTIVE_NAV_PROPS}`）あり。`ACTIVE_NAV_PROPS` は当ファイル内ローカル定義（L26-29）。ライブラリの note 件数は `NAV_COUNT` で表示（L171）。
  - `app/components/layout/styles.ts` — `NAV_ITEM` / `NAV_COUNT` の定義。`NAV_COUNT = "ml-auto text-xs text-ink-tertiary"`。
  - `app/components/ingestion/queueBadgeBus.ts` — module-scoped pub-sub。`subscribeIngestionQueueChanged` / `notifyIngestionQueueChanged` / `resetIngestionQueueBusForTest`。
  - `app/components/ingestion/actions.ts` L164-176 — `getIngestionQueueCountFn`（GET, 入力なし）。
  - テスト: `app/components/ingestion/__tests__/IngestionQueueBadge.test.tsx`（フック+チップ+ラベルをハーネスで網羅）、`.../UploadButton.test.tsx`（フック→aria-label→チップの実配線）。
  - モック: `spec/design/pages/P13-upload.html` — ヘッダーCTAは `aria-label="アップロード"`（件数なし、L1033）、管理セクションに `アップロード` ナビ項目あり（active、件数なし、L1084-1087）。`.nav-item .count { margin-left:auto; font-size:xs; color:ink-tertiary }`（= `NAV_COUNT`）。mobile/P13 のヘッダーCTAも純粋。`P10-home.html` の管理セクションは upload 項目自体が未反映（既存乖離）。

- あるべきアーキテクチャ:
  - 純フロントエンドのリファクタリング。CLAUDE.md「Frontend」: データ取得はサーバーコンポーネント既定、ライブ更新が要るものはクライアントコンポーネント。
  - 状態スタイルは `data-*` 属性 + Tailwind `data-[name]:` バリアント。繰り返しユーティリティはモジュールスコープ定数（`layout/styles.ts`）に集約。
  - #538 ADR-002: バッジはイベント駆動クライアントコンポーネント（常時ポーリングなし、mutation 成功時 + visibility 復帰で再フェッチ）。
  - #628 ADR-003: upload をヘッダーのプライマリCTAとしてランク付け。ユーザーメニューはサイドバー下部。
  - 既存の依存方向: `layout`（Header）→ `ingestion`（UploadButton）。逆（ingestion → layout）は持ち込まない。

- 既存実装の状態:
  - 件数表示が「ヘッダーCTA上の絶対配置チップ」に固定されており、モック（ヘッダーは件数なし）と乖離している。本Issueでこれを解消する。
  - `IngestionQueueBadge.tsx` はフック（データ）・チップ（ヘッダー専用ビュー）・ラベルが同居。移設先はサイドバーの `NAV_COUNT` インライン表示が自然で、絶対配置チップ（`BADGE_CHIP`）は移設先では不要になる。
  - `useIngestionQueueCount` フックのイベント駆動契約はそのまま再利用できる（取得・通知ロジックは表示位置に非依存）。

- 依存関係:
  - `Header.tsx` → `UploadButton`（件数依存を除去）。
  - `Sidebar.tsx`（サーバー）→ 新クライアント `UploadNavItem`（ライブ件数をホスト）。
  - notify 呼び出し側（各 ingestion mutation）は不変。サブスクライバの実体が UploadButton から UploadNavItem に移るだけ。サイドバーのマウント挙動には差がある: モバイルのオフキャンバスドロワーは DOM 上に残る（購読生存）が、`/settings/*` ルートでは `AppShellDrawer.tsx`（L206 `inSettings && settingsSidebar ? settingsSidebar : sidebar`、`inSettings = pathname.startsWith("/settings")` L83）がメイン Sidebar を settings 用サイドバーに**差し替え**るため、`UploadNavItem` は完全にアンマウントされ DOM から消える（購読も切れる）。機能的退行は無い: フックは mount 時に再フェッチする（`refresh()`）ため、settings から戻ると `UploadNavItem` が再マウントされ件数が再取得される。

## 設計

### ドメインモデルへの影響
なし。ドメイン・アプリケーション・アダプター層は一切変更しない。`countActiveIngestionJobs` ユースケースと `getIngestionQueueCountFn` server-fn はそのまま利用する。

### ユースケース / アプリケーションロジック
なし。

### アダプター / 永続化 / 外部連携
なし。

### UI / プレゼンテーション
コンポーネントの責務・クライアント境界・アクセシビリティ契約の再配置:

- **件数データの責務（ingestion）**: `useIngestionQueueCount` フックと「未処理 N 件」ラベルは ingestion に残す。ヘッダー専用だった絶対配置チップ（`IngestionQueueBadge` / `BADGE_CHIP`）は削除。ラベル関数は用途が「ボタン」から「ナビ項目」に変わるため `uploadButtonLabel` → `uploadQueueLabel` に改名。フックの export 元ファイルは唯一の生き残り export がフックになるため `IngestionQueueBadge.tsx` → `useIngestionQueueCount.ts` に改名（JSX を返す export がなくなるため拡張子は `.ts`。削除後の残存コードに JSX が無いことが前提で、もし JSX が残るなら `.tsx` を維持）。
- **件数表示の責務（layout）**: サイドバーの `/upload` ナビ項目を新クライアントコンポーネント `UploadNavItem`（layout 配下）として切り出す。これがフックを購読しライブ件数を表示する。`Sidebar` はサーバーコンポーネントのまま（他のナビ項目・ディレクトリツリー・保存ビューのサーバーレンダリングは退行させない）。依存方向は既存の `layout → ingestion` を踏襲（Header → UploadButton と同型）。
- **表示形式**: モックの `.nav-item .count`（= `NAV_COUNT`、`ml-auto` 右寄せ・ink-tertiary）に合わせ、ライブラリの note 件数と同じインライン count として表示する（ヘッダーの絶対配置チップ流用はしない）。0で非表示、99超で `99+`。
- **アクセシビリティ契約**: 件数のアナウンスはちょうど一度。ナビ `<Link>` に `aria-label={uploadQueueLabel(count)}`（`アップロード（未処理 N 件）` / 0件時は `アップロード`）を付与する。`aria-label` は子孫テキストを上書きするため、可視の `NAV_COUNT` スパンは別途読み上げられず二重アナウンスにならない（`aria-hidden` 指定は不要だが防御的に付けてもよい）。`activeProps`（`aria-current="page"` / `data-active`）は `aria-label` と共存し、アクティブ状態のアナウンスは保持される。ヘッダーCTAは件数を持たないので静的 `aria-label="アップロード"`（アイコンのみ折りたたみ時のアクセシブル名のため必須、モック準拠）。

## 実装ステップ

UI層のみのため、依存（フック → 表示コンポーネント → 配置 → 旧呼び出し側のクリーンアップ → テスト → モック）の順に並べる。

### 1. 件数フック/ラベルの整理（ingestion）

- **対象ファイル:** `app/components/ingestion/IngestionQueueBadge.tsx` → `app/components/ingestion/useIngestionQueueCount.ts` に改名
- **変更内容:**
  - `useIngestionQueueCount` を維持（イベント駆動・seq ガード・失敗時前回値保持のロジックは不変）。JSDoc の「header badge」記述を「サイドバー upload ナビ項目」に更新。
  - `uploadButtonLabel` → `uploadQueueLabel` に改名（戻り値文言 `アップロード（未処理 N 件）` / `アップロード` は不変）。JSDoc を「ナビ項目のアクセシブル名」に更新。
  - 絶対配置チップ `IngestionQueueBadge` と `BADGE_CHIP` 定数を削除（移設先では `NAV_COUNT` インライン表示を使うため不要）。
  - 拡張子は `.ts`（JSX を返す唯一の export だった `IngestionQueueBadge` を削除した結果、残る `useIngestionQueueCount`＝`number` を返すフックと `uploadQueueLabel`＝`string` を返す関数はいずれも JSX を含まなくなるため）。削除後の残存コードに JSX が無いことを前提とする。もし何らかの理由で JSX が残るなら `.tsx` を維持する。
  - あわせて、ヘッダーへのバッジ配置を指す陳腐化コメントを**該当する全箇所**で更新する。`grep -rn` で確認した実在箇所は2ファイルに留まらず、少なくとも以下に存在する（ステップ8の grep で網羅的に再確認すること。下記は網羅リストではなく例示）: `app/components/ingestion/actions.ts`（`getIngestionQueueCountFn` 付近の `Feeds the header queue badge.`）、`app/components/ingestion/queueBadgeBus.ts`（`for the header queue badge`）、`app/components/ingestion/UploadForm.tsx`（`the header queue badge`）、`app/components/ingestion/IngestionJobEditDialog.tsx`（`header badge`）、テスト `__tests__/UploadDialog.test.tsx` / `__tests__/UploadForm.test.tsx` / `__tests__/IngestionJobRow.test.tsx`（`header badge`）。これらの「ヘッダー」「header」へのバッジ位置への言及を、サイドバー upload ナビ項目の件数を指す表現に更新する（バス・server-fn・mutation の責務自体は不変なので文言のみ）。
  - **改名・変更対象外**: 「queue badge bus」（バスの名前 `queueBadgeBus`）という表現自体はバッジの**表示位置とは無関係**なので据え置く。更新が必要なのは "header (queue) badge"（位置を指す）表現のみで、"queue badge bus"（バス名を指す）は正確なまま残す（過剰修正を避ける）。
- **理由:** データ取得の責務は ingestion に残しつつ、ヘッダー専用ビュー（絶対配置チップ）を除去。命名を実態（ナビ項目のラベル）に合わせる。

### 2. ナビ active プロパティの共有化（layout）

- **対象ファイル:** `app/components/layout/styles.ts`, `app/components/layout/Sidebar.tsx`
- **変更内容:** `Sidebar.tsx` ローカルの `ACTIVE_NAV_PROPS`（`{ "data-active": "", "aria-current": "page" }`）を `styles.ts` に移して export。`Sidebar.tsx` は import に切り替える。
- **理由:** `UploadNavItem` と `Sidebar` の両方が同一の active プロパティを使うため、定義を一箇所に集約する。これは `Sidebar` と `UploadNavItem` が共有する分のみの集約であり、`identity/SettingsSidebarNav.tsx`・`directory/DirectoryTree.tsx` 等にある類似プロパティの統合は別レイヤー/別関心事のため本Issueのスコープ外（部分的集約）。

### 3. サイドバー upload ナビ項目のクライアントコンポーネント新設（layout）

- **対象ファイル:** `app/components/layout/UploadNavItem.tsx`（新規, `"use client"`）
- **変更内容:** `useIngestionQueueCount` を購読する `<Link to="/upload" className={NAV_ITEM} activeProps={ACTIVE_NAV_PROPS} aria-label={uploadQueueLabel(count)}>` を実装。`<span>アップロード</span>` と、`count > 0` のとき `<span className={NAV_COUNT}>{count > 99 ? "99+" : count}</span>` を内包。`uploadQueueLabel` / `useIngestionQueueCount` は ingestion から import。
- **理由:** ライブ件数の表示にはクライアント境界が必要。`Sidebar` をサーバーのまま保つため、この項目だけをクライアント化する。

### 4. サイドバーへの組み込み（layout）

- **対象ファイル:** `app/components/layout/Sidebar.tsx`
- **変更内容:** 管理セクションの `/upload` の `<li>` 内 `<Link>` を `<UploadNavItem />` に差し替え（`<li>` 構造は維持）。
- **理由:** 件数付きの新ナビ項目を所定位置に配置。

### 5. ヘッダーCTAを純粋ボタンに戻す（ingestion / layout）

- **対象ファイル:** `app/components/ingestion/UploadButton.tsx`, `app/components/layout/Header.tsx`
- **変更内容:**
  - `UploadButton.tsx`: `useIngestionQueueCount` / `IngestionQueueBadge` / `uploadQueueLabel` の import と利用を削除。`aria-label` を静的 `"アップロード"` に。チップが無くなるので `relative` を className から除去。`useLocation` によるアクティブ状態（`data-active`/`aria-current`）は維持（ハッシュ `#upload` モーダル連動）。
  - `Header.tsx`: 「アクセシブル名（件数込み）は UploadButton が所有」の陳腐化コメントを削除/更新。`data-primary`・`pillBtnPrimary`・先頭配置は不変（#628 ADR-003 のランク付けを維持）。
- **理由:** ヘッダーCTAを件数表示のない純粋な「アップロード開始」ボタンにする（AC-2, モック準拠）。

### 6. テストの移設・更新

- **対象ファイル:** `app/components/ingestion/__tests__/IngestionQueueBadge.test.tsx` → `app/components/ingestion/__tests__/useIngestionQueueCount.test.tsx`（フック単体テスト）、`app/components/layout/__tests__/UploadNavItem.test.tsx`（新規, 表示・統合テスト）、`app/components/ingestion/__tests__/UploadButton.test.tsx`
- **変更内容（層責務で分割する）:**
  - **フック単体テスト（ingestion 配下に残す）** `useIngestionQueueCount.test.tsx`: フック自体の挙動（notify 再フェッチ、visibility 復帰再フェッチ、hidden 中は再フェッチしない、unmount 後停止、失敗時前回値保持、stale レスポンス破棄＝seq ガード）を薄いハーネスで検証する。これは ingestion のデータ取得契約なので、フックと同居させて層越えを避ける。旧 `IngestionQueueBadge.test.tsx` のフック挙動カバレッジはここへ移す（チップ削除に伴いチップ描画の検証は除去）。
  - **表示・統合テスト（layout 配下に新設）** `UploadNavItem.test.tsx`: 実コンポーネント `UploadNavItem` を描画し（`@tanstack/react-router` の `Link` をモック）、フックをモックまたは実購読しつつ「件数の可視表示（>0 表示 / 0 で非表示 / 99 超で `99+`）」「`aria-label` が `アップロード（未処理 N 件）` / 0件時 `アップロード`」「`activeProps`（`data-active`/`aria-current`）との共存」という表示・統合の責務を検証する。可視 count 参照は `[data-queue-badge]` から `NAV_COUNT` スパン（`.nav-item` 内の count）に置換。フック挙動の網羅テストはここに全面移設しない。
    - **Link モックの注意（UploadButton.test の単純流用は不可）**: `UploadNavItem` は active 状態を宣言的な `activeProps` に委譲する（`Sidebar` 他と同型）のに対し、`UploadButton` は `useLocation` ベースで `data-active`/`aria-current` を**命令的に自前付与**する。両者でモック要件が異なる。既存 `UploadButton.test.tsx` の Link モックは rest props を `<a {...rest}>` にスプレッドするだけで `activeProps` を解釈しないため、これを流用すると `activeProps` がジャンク属性として落ち、計画が掲げる「`activeProps` 共存」検証が空振りする。`UploadNavItem.test.tsx` の `Link` モックは active ケースを模すために `activeProps` を（アクティブ時に）アンカー要素へスプレッドする実装にする必要がある。
  - `UploadButton.test.tsx`: 件数/チップ/動的ラベルの検証を削除し、静的 `aria-label="アップロード"`・チップ不在・ハッシュによる active 状態（`data-active`/`aria-current`）を検証する内容に更新。
- **理由:** イベント駆動契約のカバレッジを新しい配置で保ちつつ、フック（ingestion 関心事）の挙動テストは ingestion に、表示・統合（layout 関心事）は layout に配置して層責務を分離する。フックを壊した際に ingestion 側のテストが落ちる直感的な状態を保つ。

### 7. デザインモックの同期

- **対象ファイル:** `spec/design/pages/P13-upload.html` と `spec/design/pages/mobile/P13-upload.html`（両ファイルとも実在を確認済み）
- **変更内容:** desktop / mobile **両方**の P13 の管理セクションの `アップロード` ナビ項目に `<span class="count">N</span>` を追記する（`.nav-item .count` = `NAV_COUNT` 規約）。Sidebar は desktop / mobile いずれのビューポートでも同じ `UploadNavItem` を描画する共有コンポーネントのため、両モックに反映しないと実装・モック間／モック相互で不整合になる。ヘッダーCTAは両モックとも既に件数なし（`aria-label="アップロード"`）なので変更不要であることを確認する。
- **理由:** AC-5「実装とモックが一致」。upload 項目を持つモックに件数表示を反映する。`P10-home.html` の管理セクションは既存乖離のため対象外（スコープ参照）。

### 8. 品質ゲート

- **対象:** リポジトリ全体
- **変更内容:** `pnpm typecheck && pnpm lint:fix && pnpm format` を実行し、`IngestionQueueBadge` への残存 import/参照（JSDoc 含む）がないことを grep で確認。あわせて `IngestionQueueBadge` という文字列を含まない陳腐化コメントも対象化する: `header (queue )?badge` 相当および「ヘッダー」「header」へのバッジ位置への言及を grep（`actions.ts` / `queueBadgeBus.ts` だけでなく `UploadForm.tsx` / `IngestionJobEditDialog.tsx` および関連テストを含む**該当する全箇所**）で洗い出し、サイドバー upload 項目を指す表現に更新済みであることを確認する。なお "queue badge bus"（バス名 `queueBadgeBus` を指す表現）は位置とは無関係なので更新対象外＝据え置きで正しい（grep ヒットしても改名しない）。
- **理由:** AC-6。`IngestionQueueBadge` 限定の grep では捕捉できない「header (queue) badge」系コメントの取り残しを防ぐ。

## 設計判断

詳細は `adr.md` を参照。

- ADR-001: ヘッダーバッジは完全移設（重複表示しない）。件数表示は一箇所（サイドバー）に集約。
- ADR-002: 可視件数はモックの `NAV_COUNT` インライン規約で表示し、アクセシブル名は `<Link>` の `aria-label`（`uploadQueueLabel`）で担保。`aria-label` の子孫テキスト上書きにより件数アナウンスはちょうど一度。
- ADR-003: クライアント境界は専用クライアント `UploadNavItem`（layout）に限定。`Sidebar` はサーバーのまま。依存方向は既存の `layout → ingestion`。

## リスクと注意点

- `aria-label` を持つ `<Link>` に `activeProps`（`aria-current="page"`）が共存する。`aria-label` は名前を、`aria-current` は状態を担うため二重アナウンスにはならないが、SR で「アップロード（未処理 N 件）, current page」と一度だけ読み上げられることをテストで固定する。
- ファイル改名（`IngestionQueueBadge.tsx` → `useIngestionQueueCount.ts`）とラベル改名（`uploadButtonLabel` → `uploadQueueLabel`）により、import・テスト・JSDoc の参照を漏れなく更新する必要がある（grep で確認）。あわせて `actions.ts` / `queueBadgeBus.ts` に残る「header (queue) badge」系の陳腐化コメントも更新対象（ステップ8の grep に含める）。
- サイドバーのマウント挙動はルートで異なる。モバイルのオフキャンバスドロワーは DOM 上にマウントされ続けるため、`UploadNavItem` の購読は生存し、ドロワーを閉じていても件数は更新される（意図通り）。一方 `/settings/*` ルートでは `AppShellDrawer.tsx`（L206）がメイン Sidebar を settings 用サイドバーに差し替えるため、`UploadNavItem` は**完全にアンマウントされ購読が切れる**（モバイルのオフキャンバスとは異なる）。ただしフックは mount 時に再フェッチするため、settings から戻ると再マウント→再フェッチで件数が復帰し、機能的退行は無い（AC-3 の根拠は「常時マウント」ではなく「mount 時再フェッチによる復帰」）。`UploadNavItem` のインスタンスはサイドバーに一つだけで、購読の重複は起きない。
- settings ページ滞在中は件数がどこにも表示されない（サイドバーごと settings 用に差し替わるため）。これは ADR-001（完全移設＝upload ナビがある場所にだけ件数を表示）の自然な帰結で、Issue の意図（件数表示を一箇所＝サイドバー upload 項目に集約）と整合し許容できる（ADR-001 Consequences に明記）。
- モック乖離: `P10-home.html` 管理セクションは upload 項目自体が未反映（本Issue以前からの乖離）。本Issueでは upload 項目を持つ P13 のみ同期し、全面再同期はスコープ外とする。
- `NAV_COUNT` は note 件数（情報系）と同じ見た目になり、「要対応」の未処理件数との視覚的差別化はしない（モック準拠・スコープ外）。

## テスト方針

- `useIngestionQueueCount.test.tsx`（ingestion 配下, フック単体, happy-dom）: フック挙動を薄いハーネスで網羅 — `notifyIngestionQueueChanged` で再フェッチ・更新、visibility 復帰で再フェッチ、hidden 中は再フェッチしない、unmount 後は反応しない、失敗時は前回値保持（初回失敗は 0 維持）、stale レスポンス破棄（seq ガード）。ingestion のデータ取得契約はフックと同居させ層越えを避ける。
- `UploadNavItem.test.tsx`（layout 配下, 表示・統合, happy-dom）: フックをモックまたは実購読しつつ、件数の可視表示（>0 表示 / 0 で非表示 / 99 超で `99+`）、`aria-label` が `アップロード（未処理 N 件）`（0件時 `アップロード`）、`activeProps`（`data-active`/`aria-current="page"`）との共存を検証。`UploadNavItem` は active を `activeProps` に委譲するため、`Link` モックは `activeProps` をアンカーへスプレッドする実装にする（`useLocation` ベースの `UploadButton.test` モックを単純流用すると共存検証が空振りする）。フック挙動の網羅はここでは行わない。
- `UploadButton.test.tsx`（更新）: 静的 `aria-label="アップロード"`、チップ（`[data-queue-badge]` / count スパン）が存在しない、ハッシュ `#upload` 時に `data-active`/`aria-current="page"`。
- 既存の `getIngestionQueueCountFn` / `queueBadgeBus` のユニットテストは変更不要（契約不変）。
- `pnpm test:unit` 全通過、`pnpm typecheck && pnpm lint:fix && pnpm format` 通過。
- 手動確認（任意）: ローカルサーバーで upload mutation 後にサイドバー件数が更新されること、ヘッダーCTAに件数が出ないこと、SR でナビ項目が件数込みで一度だけアナウンスされること。

## レビュー履歴

### 1周目

**修正した点**:
- [P-001 coverage] モバイル P13 モック同期: ステップ7の「（必要なら mobile）」という曖昧表現をやめ、`spec/design/pages/P13-upload.html` と `spec/design/pages/mobile/P13-upload.html`（両ファイルの実在を確認）の両方の管理セクション upload 項目に件数を追記することを明記。Sidebar が共有コンポーネントである根拠も記載。AC-5 の検証対象モックに desktop / mobile 両方の P13 を含めた。

**取り込んだ改善提案**:
- [S-001 coverage] AC-5 の「対応ステップ」にサイドバー実装側のステップ3・4 を追加（`3, 4, 5, 7`）。
- [S-001 arch] ステップ8の grep 対象を拡張。`IngestionQueueBadge` に加え `actions.ts` / `queueBadgeBus.ts` 等に残る「header (queue) badge」系の陳腐化コメントを洗い出し、サイドバー upload 項目を指す表現へ更新する旨をステップ1・8・リスクに明記。
- [S-002 arch] 改名先ファイルの拡張子を `.tsx` → `.ts` に修正（JSX を返す `IngestionQueueBadge` 削除後は JSX を含まないため）。ステップ1・調査結果（設計）・リスクの該当箇所を修正し、JSX が残る場合は `.tsx` 維持の但し書きを追加。ADR-002 にも派生として記載。
- [S-003 arch] テストの層責務分離。フック単体テストを `app/components/ingestion/__tests__/useIngestionQueueCount.test.tsx` に残し、`UploadNavItem.test.tsx`（layout）は件数の可視表示・`aria-label`・`activeProps` 共存という表示/統合の責務に絞る方針をステップ6・テスト方針・ADR-003 に反映。
- [S-004 arch] ステップ2の `ACTIVE_NAV_PROPS` 集約は `Sidebar` と `UploadNavItem` 共有分のみの部分的集約であり、`SettingsSidebarNav` / `DirectoryTree` 等の類似プロパティ統合は本Issueのスコープ外である旨を明記。

**見送った提案とその理由**:
- [S-002 coverage] ファイル/関数改名はスコープ拡張候補だが、ADR-001/002 で「完全移設＝絶対配置チップ削除」により死にコード・誤称ファイル名が残るデメリットの方が大きいと正当化済みで、ステップ8の grep 検証も計画済み。現計画通り改名を維持し、反映不要と判断。

### 2周目

**修正した点**:
- [P-001 arch]（最重要）「サイドバーは常時マウント／購読は常時生存」という前提を訂正。`AppShellDrawer.tsx`（L206 `inSettings && settingsSidebar ? settingsSidebar : sidebar`、`inSettings = pathname.startsWith("/settings")` L83）を実コード確認し、`/settings/*` ルートではメイン Sidebar が settings 用サイドバーに差し替えられ `UploadNavItem` が**完全にアンマウントされ DOM から消える**（購読が切れる。モバイルのオフキャンバスとは異なる）ことを依存関係・リスク欄に反映。機能的退行は `UploadNavItem` の mount 時再フェッチ（既存フック挙動）で回避される（settings から戻ると再マウント→再フェッチ）旨と、AC-3 の根拠を「常時マウント」から「mount 時再フェッチによる復帰」に訂正した旨を明記。あわせて「settings ページ滞在中は件数が表示されない（サイドバーごと差し替わるため）」という挙動変更を ADR-001 Consequences に追記し、Issue の意図（件数を一箇所に集約）と整合する許容可能な挙動である旨を添えた。

**取り込んだ改善提案**:
- [S-001 arch] 陳腐化「header badge」コメントの実在箇所を `grep -rn` で洗い出し、`actions.ts` / `queueBadgeBus.ts` の2ファイル列挙が網羅と誤読されないよう「該当する全箇所」と明記。例示に `UploadForm.tsx` / `IngestionJobEditDialog.tsx` および関連テスト（`UploadDialog.test.tsx` / `UploadForm.test.tsx` / `IngestionJobRow.test.tsx`）を追加（ステップ1・8）。「queue badge bus」（バス名 `queueBadgeBus`）自体は位置と無関係で改名・変更対象外である旨も明記し過剰修正を防いだ。
- [S-002 arch] `UploadNavItem.test.tsx` の `Link` モックは宣言的 `activeProps` を（アクティブ時に）アンカー要素へスプレッドする実装が必要である旨をステップ6・テスト方針に明記。`UploadButton.test`（`useLocation` ベースの命令的判定）の単純流用では active 共存検証が空振りする点と、両者でモック要件が異なる点を補足。
- [S-001 coverage] サイドバー内 a11y パターンの非対称（既存ライブラリ note count は `aria-label` なしで可視テキスト読み上げ／upload 項目は `aria-label` で件数込みに上書き）が**意図的**である旨を ADR-002 Consequences に一文追記し、将来の揺り戻し（ライブラリ count に合わせて aria-label を外す）を防いだ。

### 3周目

**修正した点**:
- [P-001 arch] ADR-003 Consequences に旧前提「サイドバーは常時マウントのため購読が安定」が無修飾で残存し ADR-001 と内部矛盾していた点を訂正。購読のライフサイクルが `UploadNavItem` のマウント期間に一致すること（モバイルのオフキャンバスは DOM 上に残る／`/settings/*` ではアンマウント、mount 時再フェッチで復帰）を ADR-003 にも反映し、ADR-001 と整合させた。

**取り込んだ改善提案**:
- [S-001 arch] 拡張子は現物確認上 JSX 残存なしで `.ts` 確定。最終計画として `.ts` 確定と扱う（実装時に万一 JSX を持つ要因が生じた場合のみ再検討）。

**収束**:
- 3周完了。要件カバレッジ視点は問題点ゼロ（着手可能と最終判断）、アーキ・リスク視点は P-001（ドキュメント整合性のみ・本修正で解消）以外ゼロ。両視点とも実装方針・受け入れ基準に欠陥なしで収束。残る改善提案（モック count 例示値の desktop/mobile 統一）は実装をブロックしない運用細部で、ステップ7実施時に揃える。
