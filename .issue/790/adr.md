# ADR — Issue #790: ヘッダーCTAバッジのサイドバー upload 項目への移設

## ADR-001: ヘッダーバッジは完全移設（重複表示しない）

### Status
Proposed

### Context
未処理アップロード件数の表示場所として、(a) ヘッダーCTAに残しつつサイドバーにも追加（両表示）、(b) ヘッダーから完全に外しサイドバーのみ（移設）の二択がある。Issue の意図は「件数表示を一箇所に集約」。

### Decision
完全移設を選ぶ。ヘッダーCTAはバッジ・動的ラベルを一切持たない純粋な「アップロード開始」ボタンに戻し、件数はサイドバー upload ナビ項目だけに表示する。

### Consequences
- 良い点: 件数の真実が一箇所になり、二重メンテ・二重アナウンスのリスクが消える。モック（ヘッダーCTAは件数なし）とも一致する。
- トレードオフ: ヘッダーを見ているだけのユーザーは件数に気づけない。ただし upload はサイドバー管理セクションに常設されており、件数の役割（未処理の滞留把握）はサイドバーが担うのが自然。
- 挙動変更: `/settings/*` ルートでは `AppShellDrawer.tsx`（L206）がメイン Sidebar を settings 用サイドバーに差し替えるため、settings ページ滞在中は件数がどこにも表示されない（移設前はヘッダーCTAに乗っていたため settings でも表示されていた）。これは「件数表示を一箇所＝サイドバー upload 項目に集約」という本決定の自然な帰結であり、Issue の意図と整合する許容可能な挙動。settings から戻れば `UploadNavItem` の mount 時再フェッチで件数は復帰する。

---

## ADR-002: 可視件数は `NAV_COUNT` インライン、アクセシブル名は `aria-label`

### Status
Proposed

### Context
ヘッダーでは件数を絶対配置チップ（`BADGE_CHIP`、`aria-hidden`）で描き、アクセシブル名は `aria-label`（`uploadButtonLabel`）に件数を載せていた（`aria-label` が子孫テキストを上書きするため）。移設先のサイドバーでは、(a) ヘッダーの絶対配置チップをそのまま流用、(b) サイドバー既存の `NAV_COUNT`（ライブラリ note 件数と同じ右寄せインライン count、モック `.nav-item .count` 規約）を使う、の二択。あわせて「件数をちょうど一度だけアナウンス」を満たす必要がある。

### Decision
可視表現は `NAV_COUNT` インライン count を採用（0で非表示・99超で `99+`）。絶対配置チップ `IngestionQueueBadge` / `BADGE_CHIP` は削除する。アクセシブル名はナビ `<Link>` の `aria-label={uploadQueueLabel(count)}`（`アップロード（未処理 N 件）` / 0件時 `アップロード`）で担保する。`aria-label` が `<span>アップロード</span>` と `NAV_COUNT` スパンの両テキストを上書きするため、件数のアナウンスは `aria-label` 内の一度だけになり、可視 count が二重に読み上げられることはない。

### Consequences
- 良い点: モックの `.nav-item .count` 規約・ライブラリ note 件数と一貫した見た目。`未処理 N 件` という説明的なテキスト表現を保持しつつ、アナウンスはちょうど一度。ヘッダー専用のチップ実装が消えて死にコードが残らない。
- 派生: 絶対配置チップ（JSX を返す唯一の export だった `IngestionQueueBadge`）を削除した結果、改名後ファイルは `useIngestionQueueCount`（`number` を返す）と `uploadQueueLabel`（`string` を返す）のみとなり JSX を含まなくなる。よって改名先の拡張子は `.tsx` ではなく `.ts` が正確（削除後に JSX が残らないことが前提。万一残るなら `.tsx` を維持）。
- トレードオフ: `aria-label` がナビ項目の可視テキスト全体を上書きするため、可視ラベルとアクセシブル名の文言が別管理になる（`uploadQueueLabel` が単一の真実点なので乖離リスクは低い）。`activeProps` の `aria-current="page"`（状態）とは役割が異なるため共存可能。
- 意図的な a11y 非対称: 同一サイドバー内でも、既存ライブラリ note 件数項目（「すべてのノート」+ `NAV_COUNT`）は `aria-label` を持たず可視 count テキストをそのまま読み上げる一方、upload 項目は `aria-label` で「未処理 N 件」という説明的表現に上書きする。この件数アナウンス方式の分岐は**意図的**である（upload は「未処理の滞留」という要対応のニュアンスを説明文として保ちたい）。ライブラリ count に合わせて upload 側の `aria-label` を外す揺り戻しはしない。

---

## ADR-003: クライアント境界は専用 `UploadNavItem`、Sidebar はサーバーのまま

### Status
Proposed

### Context
ライブ件数の表示にはクライアントコンポーネント（フック・visibility/notify 購読）が必要。一方 `Sidebar` はサーバーコンポーネントで、ディレクトリツリー・保存ビュー・他ナビ項目をサーバーで取得・描画している。`Sidebar` 全体をクライアント化するとこれらのサーバーレンダリングが退行する。配置場所も layout/ingestion のどちらに置くか論点がある。

### Decision
upload ナビ項目だけを切り出した専用クライアントコンポーネント `UploadNavItem` を `app/components/layout/` に新設し、`Sidebar` はサーバーコンポーネントのまま `<UploadNavItem />` を埋め込む。件数フック `useIngestionQueueCount` と `uploadQueueLabel` は ingestion に残し、`UploadNavItem` から import する（依存方向 `layout → ingestion`、既存の `Header → UploadButton` と同型）。

### Consequences
- 良い点: サーバーレンダリングされる他ナビ項目・ツリー・保存ビューを退行させずにライブ件数だけクライアント駆動にできる。レイヤー責務が明確（ingestion = 件数データ/ラベル、layout = ナビ表示）。購読のライフサイクルは `UploadNavItem` のマウント期間に一致する（モバイルのオフキャンバス時は DOM 上に残り更新が効くが、`/settings/*` ではメイン Sidebar ごと差し替わりアンマウントされる）。アンマウント中の更新は失われるが、settings から戻った際の mount 時再フェッチで最新値に復帰するため機能的退行はない（詳細は ADR-001 を参照）。
- テスト配置も同じ責務分割に従う: フック自体の挙動（再フェッチ/seq ガード/失敗時前回値保持/stale 破棄）は ingestion 配下の `useIngestionQueueCount.test.tsx` に、件数の可視表示・`aria-label`・`activeProps` 共存といった表示/統合は layout 配下の `UploadNavItem.test.tsx` に置く。フック挙動を layout のテストに全面移設すると層越えになるため避ける。
- トレードオフ: 小さなクライアント境界コンポーネントが一つ増える。ただし `Sidebar` 全体をクライアント化するより影響範囲は小さく、既存パターンに沿う。

---
