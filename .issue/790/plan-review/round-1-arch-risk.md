# Plan Review — Issue #790（視点: アーキテクチャ整合性・実現可能性・リスク / Round 1）

対象: `.issue/790/plan.md`, `.issue/790/adr.md`
レビュー観点: あるべきアーキテクチャとの整合性・実現可能性・見落とされたリスク

---

## 総評

純UI層リファクタリングとして計画は健全で、CLAUDE.md の Frontend/Styling 規約・既存パターンに正しく沿っている。レイヤー責務の分割（件数データ=ingestion / ナビ表示=layout、依存方向 `layout → ingestion`）は既存の `Header → UploadButton` と同型で妥当。アクセシビリティの根拠（`aria-label`＝名前 / `aria-current`＝状態の直交、`aria-label` の子孫テキスト上書きで一度だけアナウンス）も技術的に正しい。**要修正（P）レベルの問題はゼロ。** 以下は改善提案のみ。

---

## 問題点（要修正）

問題点ゼロ。

---

## 改善提案（検討推奨）

- **[S-001]** ステップ8の grep が漏れる「header queue badge」系の陳腐化コメントを明示的に対象化すべき
  - 理由: ステップ8は「`IngestionQueueBadge` への残存参照（JSDoc 含む）」を grep するとしているが、`IngestionQueueBadge` という文字列を含まない陳腐化コメントが少なくとも2箇所残る。
    - `app/components/ingestion/actions.ts:163` — `// ... Feeds the header queue badge.`（件数は header ではなくサイドバーへ移設されるため不正確になる）
    - `app/components/ingestion/queueBadgeBus.ts:2,4,5` — `for the header queue badge` / `a server-rendered badge` / `the badge is a client component`（バスは不変だが「header」は実態とずれる）
    `IngestionQueueBadge` 限定の grep ではこれらが捕捉されない。
  - 提案: ステップ8の確認語を「`header (queue )?badge`」相当まで広げ、`actions.ts` と `queueBadgeBus.ts` の文言を「サイドバー upload ナビ項目の件数」へ更新する一文をステップ1または5に加える。バスの責務（pub-sub）自体は不変なので文言修正のみで足りる。

- **[S-002]** 改名後ファイルは JSX を含まないため拡張子は `.ts` が正確（`.tsx` でも動作はする）
  - 理由: `IngestionQueueBadge`（唯一の JSX を返す export）を削除すると、残る `useIngestionQueueCount`（`number` を返す）と `uploadQueueLabel`（`string` を返す）はいずれも JSX を持たない。`useIngestionQueueCount.tsx` という命名は中身と不整合。
  - 提案: 改名先を `app/components/ingestion/useIngestionQueueCount.ts`（`.ts`）にする。動作上は `.tsx` でも問題ないため必須ではないが、命名規約上の正確性として推奨。

- **[S-003]** フック（ingestion 関心事）の挙動テストを layout 配下に全面移設することの是非
  - 理由: ステップ6は `useIngestionQueueCount` の全挙動（seq ガード/visibility/失敗時前回値保持/stale 破棄）を `app/components/layout/__tests__/UploadNavItem.test.tsx` 経由でのみ検証する形に移す。ingestion のデータ取得契約が layout のテストにしか存在しなくなり、将来フックを壊した際に「layout のテストが落ちる」非直感的な状態になる（軽微な層越えのにおい）。
  - 提案: データ取得契約（再フェッチ/seq/失敗保持）はフックと同居して `ingestion/__tests__/useIngestionQueueCount.test.tsx` に薄いハーネスで残し、`UploadNavItem.test.tsx` は表示（count スパン/0非表示/99+）と `aria-label`/`activeProps` 共存の確認に絞る分割を検討。現行案（全面移設）でもカバレッジは満たすため必須ではない。

- **[S-004]** `ACTIVE_NAV_PROPS` の集約は部分的にとどまる点を認識しておく
  - 理由: 同一定義が `Sidebar.tsx` のほか `identity/SettingsSidebarNav.tsx`・`directory/DirectoryTree.tsx` にも重複している。ステップ2は layout の1箇所のみ `styles.ts` へ集約する。残り2箇所は別レイヤー/別関心事のためスコープ外で妥当だが、「集約した」と読めると誤解を生む。
  - 提案: plan の文言を「`Sidebar` と `UploadNavItem` が共有する分のみ集約（他レイヤーの同名定義は対象外）」と明確化。また `styles.ts` は従来クラス文字列のみだったので、props オブジェクト定数を置く是非を一言添えると親切（共有 a11y/state props として許容範囲）。

---

## 良い点

- **依存方向が既存パターンと一致**: `UploadNavItem`(layout) → `useIngestionQueueCount`/`uploadQueueLabel`(ingestion) は `Header → UploadButton` と同型。`ingestion → layout` の逆流を持ち込まない設計で、`UploadNavItem` 自身が layout 配下にあるため layout/styles 参照も層内で閉じる。
- **クライアント境界の隔離が正しい**: `Sidebar`(server) が `<UploadNavItem />`(client) を子として埋め込む標準的な server→client 合成。ディレクトリツリー・保存ビュー等の他のサーバーレンダリングを退行させず、ライブ件数だけをクライアント駆動にできる。設計の問い「Client boundary」への回答として的確。
- **a11y の技術的根拠が正確**: `aria-label`（accessible name）と `activeProps` の `aria-current="page"`（state）は WAI-ARIA 上直交し共存する。`aria-label` が子孫テキスト（`アップロード` + `NAV_COUNT` スパン）を上書きするため可視 count は二重読み上げされない。`uploadQueueLabel` が単一の真実点で可視/読み上げの乖離リスクも低い。
- **ハイドレーション安全**: フック初期値 `useState(0)` によりサーバーは count スパン無し、クライアント初期描画も 0 で一致 → ミスマッチ/ちらつきなし。モック（count 非表示の初期状態）とも整合。
- **イベント駆動契約の不変性が保たれている**: `queueBadgeBus`・`getIngestionQueueCountFn`・notify 呼び出し側（UploadDialog/IngestionJobRow/IngestionJobEditDialog/UploadForm/AudioRecorder）に手を入れず、購読者の実体が `UploadButton`→`UploadNavItem` に移るだけ。#538 ADR-002 を踏襲。
- **死にコード除去**: ヘッダー専用の絶対配置チップ（`IngestionQueueBadge`/`BADGE_CHIP`）と `relative` を removal 対象に明示。移設先で `NAV_COUNT` インライン規約に統一する判断はモック `.nav-item .count` と一致し妥当。
- **スコープ境界が明確**: P10-home の管理セクション乖離（既存）を本Issueから切り出し、件数を持つ P13 のみ同期。データ/契約不変の宣言も明確で、リスク節でモバイル off-canvas 時も DOM マウント継続→購読安定という非自明な点まで押さえている。
- **#628 ADR-003 のランク維持**: `data-primary`/`pillBtnPrimary`/先頭配置の不変を AC-2 で固定し、件数除去が CTA の役割を弱めないことを担保。
