# Review 004 — Test 観点（Round 4 フルレビュー）

PR: #677 / Issue: #538

対象: テスト網羅性・テスト設計・モック戦略

結論: **Blocker なし。Warning なし。** plan.md のテスト方針・受け入れ基準（AC-1〜AC-6）に対し、追加・変更テストはほぼ完全に対応している。Round 1〜3 の指摘（notify 発火点漏れ、queueBadgeBus のテスト境界、stale-response ガード等）も解消済み。以下は記録目的の Notes のみ。

## Test → Blockers

なし。

## Test → Warnings

なし。

## Test → Notes

- **N-001 / plan との層の差分（usecase テストが unit ではなく integration）**
  - 場所: `app/core/application/ingestion/__tests__/countActiveIngestionJobs.integration.test.ts`
  - plan.md「テスト方針」は usecase を「ユニット（usecase）＋ in-memory フェイクへの countByOwner 追加」と記載。実装は in-memory フェイクを追加せず、実 SQLite コンテナを使う integration テストにした。
  - 評価: **これは正しい判断**。`docs/test.md` はリポジトリ系 fake を意図的に置かない方針（in-memory fake で OCC/transaction を模倣しても integration の代替にならない）を明記しており、`countActiveIngestionJobs` 自体が `UserId.create` → `countByOwner` の薄いパススルーでロジックを持たない。fake を新設するより実 DB で振る舞いを見る方が方針に合致。plan の文言と乖離するが、乖離方向はプロジェクト規約に沿っている。提案: plan の整合のみ（任意）。

- **N-002 / 「DB に行かない」短絡のテスト名と検証の不一致**
  - 場所: `app/core/adapters/d1/__tests__/ingestionJobRepository.integration.test.ts` の `it("resolves 0 for an empty statuses array without querying")`
  - 当該ケースは pending ジョブを 1 件 seed したうえで `statuses: []` → `count === 0` を検証する。結果（0 を返す）は正しく押さえているが、テスト名の「without querying（DB に問い合わせない短絡）」という *実装上の最適化* は assert されていない（クエリしても 0 になるため、短絡の有無は判別不能）。
  - 提案: 結果としては十分。短絡経路を本当にピン留めしたいなら、`db`/drizzle 呼び出しをスパイして未呼び出しを assert する一手間を足せるが、過剰。名前を `resolves 0 for an empty statuses array` に寄せるだけでも誤読を避けられる（任意）。

## AC カバレッジ対応表（確認結果）

- AC-1（送信→queued、waiting/editing/ポーリング/PreviewForm 不在）: `UploadDialog.test.tsx` 単一/複数/uploading→queued + 旧ビュー不在を網羅。モック定義で polling/edit 系 server fn を意図的に排除し「不在」を構造的に担保。✓
- AC-2（queued で常時操作可・待機 UI 不在・続けてアップロード/閉じる）: 「no disabled controls」「閉じる→onClose」「続けてアップロード→select リセット→再投入」を網羅。✓
- AC-3（previewing 行の編集→commit）: `IngestionJobRow.test.tsx`（編集ボタン表示条件・dialog 開）+ `IngestionJobEditDialog.test.tsx`（編集→commit→navigate）。✓
- AC-4（破棄・再生成・進捗追跡）: EditDialog の discard/regenerate（close + invalidate + notify、待機 UI 不在）+ Row の discard/regenerate notify。✓
- AC-5（バッジ・全発火点）: notify 発火点を UploadDialog / UploadForm / IngestionJobRow（commit/discard/regenerate/ownerRetry）すべてで成功時呼び出し・失敗時非呼び出しの両面で検証。`IngestionQueueBadge` は count>0/0、notify 再取得、visibility 復帰再取得、unmount 後非取得、fetch 失敗で非表示、prior-success 後の失敗で前回値保持、stale-response 破棄、99+ キャップまで網羅。`UploadButton` で aria-label 配線も実配線でピン留め。非常に厚い。✓
- AC-6（spec/ADR 更新）: ドキュメント変更であり自動テスト対象外（手動テスト report で回帰確認）。✓

## モック戦略の確認

- server fn は `useServerFnRouter` でルーティングし、各コンポーネントが依存する server fn のみを mock 定義する設計が一貫。UploadDialog が polling/edit 系 fn を mock に持たないこと自体が「使っていない」ことの構造的証明になっており、設計が良い。
- `queueBadgeBus` は Badge テストでのみ実物を使い `resetIngestionQueueBusForTest()` で購読者残留を防止、他テストでは notify を spy 化。テスト間汚染対策（plan arch-risk S-003）が実装されている。✓
- エラー系は `AppServerError` の実型でモックし、生コードではなくマッピング後の日本語表示まで検証（business/notFound/system 各 kind を網羅）。✓
