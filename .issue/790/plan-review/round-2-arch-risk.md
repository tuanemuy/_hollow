# Issue #790 計画レビュー（2周目）— アーキテクチャ整合性・実現可能性・リスク

対象: `.issue/790/plan.md` / `.issue/790/adr.md`
視点: あるべきアーキテクチャとの整合性・実現可能性・リスク
方式: ゼロベース再確認（1周目指摘の反映確認を含む）

---

#### 問題点（要修正）

- **[P-001] 「サイドバーは常時マウント／購読は常時生存」は settings ルートで成立しない（リスク分析の前提誤り）**
  - 事実: `app/components/layout/AppShellDrawer.tsx` L206 `{inSettings && settingsSidebar ? settingsSidebar : sidebar}`（`inSettings = pathname.startsWith("/settings")`, L83）。`/settings/*` では**メインの `Sidebar` が settingsSidebar に差し替えられ、完全にアンマウントされる**。モバイルのオフキャンバス（DOM 上は残る）とは異なり、settings ルートでは `UploadNavItem` のインスタンス自体が消え、`useIngestionQueueCount` の購読も切れる。
  - 計画 L60 / L155 は「サイドバーは `_app` レイアウトで常時マウント」「購読は常時生存する」と断言しているが、これは settings 配下で不正確。この前提は AC-3（新しい場所でイベント駆動更新が動く）の正当化に効いているため、誤った前提のまま通すべきでない。
  - 機能的退行は無い: フックは mount 時に再フェッチする（L48 `refresh()`）ので、settings から戻ると `UploadNavItem` が再マウントされ件数が再取得される。したがって結論（退行なし）は維持されるが、**根拠を「常時マウント」ではなく「settings ではアンマウントされるが mount 再フェッチで復帰」に訂正**すべき。
  - あわせて未記載の挙動変更がある: 現状の件数は常時表示される Header（settings ページでも描画される）に乗っているが、移設後は settings ページでは件数がどこにも出なくなる。これは ADR-001（完全移設＝upload ナビがある場所にだけ件数）の自然な帰結で許容範囲だが、ADR-001 の Consequences かリスク欄に「settings ページでは件数非表示（許容）」を一行明記して意図を固定することを提案する。

#### 改善提案（検討推奨）

- **[S-001] 陳腐化「header badge」コメントの実在箇所がステップ1の列挙より広い**
  - ステップ1は更新対象として `actions.ts` / `queueBadgeBus.ts` の2ファイルのみを名指しするが、実際の "header badge" 系コメントは以下にも存在する: `UploadForm.tsx:184`（"header queue badge"）、`IngestionJobEditDialog.tsx:31`（"header badge"）、テスト `IngestionJobRow.test.tsx:195` / `UploadDialog.test.tsx:141` / `UploadForm.test.tsx:204`（"header badge"）。
  - ステップ8の grep（`header (queue )?badge` 相当、「(を)含む」表現）は十分に広く、これらを**機械的には捕捉できる**のでカバレッジ自体は欠落していない。ただしステップ1の2ファイル列挙が「網羅リスト」と読まれると取り残しの恐れがあるため、`UploadForm.tsx` / `IngestionJobEditDialog.tsx`（およびテストコメント）を例示に追加しておくと安全。
  - 注意点: テスト記述の「notifies the queue badge bus ...」は**改名しないバス（`queueBadgeBus`）**を指しており依然正確。更新が必要なのは "header badge"（位置を指す）表現のみで、"queue badge bus"（バス名を指す）は据え置いて良い旨を明記すると過剰修正を避けられる。

- **[S-002] `UploadNavItem.test.tsx` の Link モックは activeProps を適用する必要がある（「UploadButton.test と同様」では不足）**
  - ステップ6/テスト方針は「`@tanstack/react-router` の `Link`/`useLocation` を UploadButton.test と同様にモック」とするが、両者の active 実現方式が異なる。`UploadButton` は `useLocation`→`data-active`/`aria-current` を**自前で直接付与**する一方、`UploadNavItem` は宣言的な **`activeProps` に委譲**する（`Sidebar` 他と同型）。
  - 既存 `UploadButton.test.tsx` の Link モック（L35-42）は rest props を `<a {...rest}>` にスプレッドするだけで `activeProps` を解釈しない。これを流用すると `activeProps` がジャンク属性として落ちるだけで、計画が掲げる「`activeProps`（`data-active`/`aria-current`）との共存」検証が空振りになる。
  - `UploadNavItem.test.tsx` の Link モックは active ケースを模すために `activeProps` をアンカーへスプレッドする実装にする必要がある旨を、ステップ6に一言補足することを推奨。

#### 良い点

- **依存方向**: `UploadNavItem`(layout) → `useIngestionQueueCount`/`uploadQueueLabel`(ingation) は既存の `Header → UploadButton`(ingestion) と同型で、内向き規約に整合。逆流（ingestion→layout）も持ち込まない。
- **クライアント境界**: `Sidebar` をサーバーのまま保ち `UploadNavItem` だけをクライアント化する判断は、ディレクトリツリー/保存ビューのサーバーレンダリングを退行させない正しい RSC パターン。ADR-003 の論拠が妥当。
- **`.ts` 拡張子判断（1周目 S-002 反映）**: 実コード確認の結果、`IngestionQueueBadge`/`BADGE_CHIP` 削除後に残るのは `useIngestionQueueCount`(→`number`)・`uploadQueueLabel`(→`string`) のみで JSX を含まず、`.ts` が正確。`"use client"` ディレクティブは `.ts` でも有効で維持可能（フックが `useState`/`useEffect`/`useServerFn` を使うため必須）。判断は妥当。
- **テスト層分離（1周目 S-003 反映）**: フック挙動＝ingestion 配下、表示/統合＝layout 配下の分割は責務に整合。既存 `IngestionQueueBadge.test.tsx` は実バス＋ハーネスで hook を検証しており、`useIngestionQueueCount.test.tsx` への移行は実現可能（チップ描画検証のみ除去）。
- **ACTIVE_NAV_PROPS 部分集約（1周目 S-004 反映）**: `SettingsSidebarNav.tsx` L29-30・`DirectoryTree.tsx` L53-54 に独自コピーが実在することを確認。「Sidebar/UploadNavItem 共有分のみ集約、他はスコープ外」という限定は実態に即しており妥当。
- **aria-label / aria-current 共存**: `aria-label` が子孫テキストを上書きするため可視 `NAV_COUNT` が二重読み上げされない、`aria-current` は状態で役割が別という整理は正しい。0件時 `アップロード`／件数時 `アップロード（未処理 N 件）` の単一アナウンスも妥当。
- **モック同期**: desktop/mobile 両 P13 の実在を確認。両者とも upload ナビ項目は件数なし（desktop L1084-1087 / mobile L1032-1035）、ヘッダーCTAは既に `aria-label="アップロード"`（件数なし、desktop L1033 / mobile L983）。ステップ7の「両 P13 に count 追記・ヘッダーは変更不要」は実態に整合。`P10-home` を既存乖離としてスコープ外にする判断も妥当。
</content>
</invoke>
