# PR #677 レビュー — Issue #538（Round 1）

### Frontend

#### Blockers

なし

#### Warnings

- **[W-001]** `routerInvalidate` の失敗がアップロード失敗として誤報告される / 場所: `app/components/ingestion/UploadDialog.tsx:188`（単一ファイル経路） / 理由: 単一ファイル経路では `await routerInvalidate(router)` が upload と同じ `try` に入っている。アップロード自体は成功（ジョブはキューに enqueue 済み）なのに、invalidate 中に leaf loader が throw して reject すると `catch` に落ち、`select` ビュー＋エラーバナーで「失敗した」と誤って提示され、`notifyIngestionQueueChanged()` も発火しない（バッジが古いまま）。逆に複数ファイル経路（`UploadDialog.tsx:229` 付近）では invalidate が `try` の外にあり、reject すると `void (async () => ...)()` 内の未処理 rejection になって `queued` ビューに到達しない。 / 提案: 「queued ビュー遷移＋notify」を invalidate より先に行うか、invalidate を独立した `try { } catch { /* loader 失敗は結果ビューを妨げない */ }` に隔離して両経路の挙動を揃える。

- **[W-002]** ビュー遷移時のフォーカス管理が全て消えた / 場所: `app/components/ingestion/UploadDialog.tsx`（`grep focus` が 0 件） / 理由: 旧実装は `editing` 突入時に `titleInputRef.current?.focus()` でフォーカスを着地させていた（W-F-003 / Issue #256 の経緯あり）。新実装では `select`（ファイル選択 label）→ `uploading`（フォーカス可能要素なし）→ `queued` の遷移で、フォーカスを持っていた要素がアンマウントされて document.body に落ちる。`queued` → 「続けてアップロード」→ `select` でも押したボタンごと消えて同様。`aria-live` の status region が SR 向けの告知は担保するが、キーボードユーザーはダイアログ内の現在位置を失う（Tab でパネル先頭からやり直し）。 / 提案: `view.kind === "queued"` 突入時に primary アクション（「キュー画面を開く」Link）または結果見出しの段落（`tabIndex={-1}`）へ、`select` 復帰時はドロップゾーンへフォーカスを移す effect を 1 つ復活させる（旧 `editing` effect と同パターン）。

- **[W-003]** ヘッダーのアップロード CTA から `data-primary` が消えたまま（accent fill が効かない） / 場所: `app/components/layout/Header.tsx:56`（本 PR で `data-primary=""` を削除）、`app/components/ingestion/UploadButton.tsx:30-43` / 理由: `pillBtnPrimary`（`app/components/common/styles.ts:48`）は全ユーティリティが `data-[primary]:` 変種で、`data-primary` 属性がレンダリングされて初めて accent 塗りになる。旧コードは `UploadButton` に `data-primary=""` を渡していたが Props が forward しておらず元々 inert（ハイフン付き JSX 属性は型チェックをすり抜ける、pre-existing バグ）。本 PR は UploadButton の Props を整理し Header からこの属性を削除したが、Link 側に `data-primary=""` を付けるところまでやっていないため、「Upload is the primary action … accent fill（#628 ADR-003）」のコメントと実レンダリングの乖離が固定化された。本 PR は両ファイルを触っており、1 行で直せる。 / 提案: `UploadButton` の `<Link>` に `data-primary=""` を追加する（規約どおり statically-on は空文字。バッジ chip の `bg-ink text-bg` が accent 地で十分なコントラストを持つかも合わせて確認）。

- **[W-004]** バッジ件数取得のレスポンス順序逆転で古い件数が残り得る / 場所: `app/components/ingestion/IngestionQueueBadge.tsx:22-38` / 理由: `refresh()` は呼び出しごとの世代管理を持たず、`cancelled` は unmount 時のみ true。短時間に notify が連続する状況（複数ファイル一括アップロード直後に行操作、キュー画面での連続保存・破棄など）では、先行リクエストのレスポンスが後着して新しい件数を古い値で上書きし得る。次の notify / visible 復帰まで誤った件数が表示される。 / 提案: effect スコープに `let seq = 0` を置き、`refresh` で採番 → `setCount` 前に最新 seq か検査する数行のガードを入れる。

#### Notes

- **[N-001]** `UploadDialog` の縮退が徹底している。View 型は `select / uploading / queued` の 3 つのみ、`POLL_*` 定数・`isPollFatalError`・`transientFailuresRef`・`origin` 判別・ツリー lazy load・`IngestionPreviewForm` / `FailedView` 使用がすべて削除され、#253 / #258 / #319 参照の残骸コメントも残っていない（AC-1 充足）。`queued` ビューに disabled / スピナー等の待機 UI はなく、「続けてアップロード」「閉じる」が常時押せる（AC-2 充足）。`onUploadMore` の「validation / error / file input をリセットしつつカスタムプロンプトは保持」も plan ステップ 7 どおりで、テスト（`preserves them across 続けてアップロード`）まである。

- **[N-002]** `IngestionQueueBadge` のアクセシブルネーム設計が的確。`aria-label` は子孫テキストを上書きするため件数をラベル自体に持たせ、視覚 chip は `aria-hidden` で二重読み上げを防ぎ、`uploadButtonLabel` を chip の隣に置いて視覚とSRの同期を保つ。ラベル「アップロード（未処理 N 件）」は可視テキスト「アップロード」を含み WCAG 2.5.3（Label in Name）も満たす。`data-queue-badge=""`（statically-on）の規約準拠、0 件非表示・99+ キャップ・取得失敗時の黙殺（導線を塞がない）も plan / ADR-002 どおり。

- **[N-003]** `IngestionJobEditDialog` の配線は plan ステップ 8 にほぼ忠実: `ariaLabelledBy` の可視 `<h2>`、`initialFocusRef` でタイトル input へ初期フォーカス、ツリー lazy load のサイレント失敗、commit → notify＋navigate、discard / regenerate → notify＋close（invalidate はフォーム側が既に行う事実を JSDoc で明示し二重 invalidate を回避）。plan の「pending 中は backdrop で閉じない」は「backdrop close を常時無効」に振り切り、理由（誤クリックで編集が消えてはならない、Esc / × / キャンセルは残る）を WHY コメントで記録しており妥当な逸脱。クロスタブ conflict のインライン表示テスト（plan リスク項目）も `surfaces a commit conflict inline and keeps the dialog open` でカバー。

- **[N-004]** notify 発火点が plan / ADR-002 の列挙と完全一致: `UploadDialog`（単一・複数、dismiss 後も発火する旨のコメント付き）、`UploadForm`（独立経路、WHY コメントあり）、`IngestionJobRow`（commit / discard / regenerate / retry の成功パスのみ — 失敗時に notify しないテストまである）、`IngestionJobEditDialog`。`queueBadgeBus` は unsubscribe 返却＋`resetIngestionQueueBusForTest` でテスト境界も手当て済み（plan ステップ 5 の必須項目）。

- **[N-005]** `UploadPage` のコピーと `spec/pages/index.md` P13 / 18 行目（ヘッダー CTA バッジ）の更新は AC-6 の要求どおり。hash 駆動・aria-live・errorDisplay 部分の存続も指示どおり。

- **[N-006]** 軽微なコピー: 単一アップロード成功時も「1 件中 1 件をキューに追加しました。」と機械的な文になる。`total === 1` のときは「ファイルをキューに追加しました」等に分岐するとより自然（`viewStatusText` と `QueuedView` の 2 箇所）。

- **[N-007]** 軽微: `UploadButton` の `className={`${className ?? ""} relative`}` は `className` 未指定時に先頭空白が入る。実害はないが `["relative", className].filter(Boolean).join(" ")` 等のほうが行儀がよい。
