# PR #736 レビュー — Frontend 観点 Round 3（最終確認・Issue #701）

対象: Round 2 残 Warning W-001（AudioRecorder 純関数の未テスト・未 export）の解消確認のみに範囲を絞った最終確認。既仕分け済み・既解消（W-002 aria-live / W-003 nearLimit role / N-001〜N-006）は蒸し返さない。

総評: Round 2 の唯一の残 Warning（W-001 後半）は適切に解消された。純関数 3 種（`pickSupportedMime` / `formatDuration` / `recorderStatusText`）と `MIME_CANDIDATES` が named export され、`AudioRecorder.test.ts` に 16 件の単体テストが追加された（実行確認: 16 passed）。export 追加・`isTypeSupported` 注入リファクタはいずれもコンポーネント挙動を不変に保っており、本番経路は従来動作のまま。a11y 契約「recording=秒非依存」も実際に回帰検出される形でテスト化された。新規 Blocker / Warning は無し。**APPROVED**。

---

## Round 2 W-001 残の解消確認

### [W-001 解消] PASS — 純関数を named export し単体テスト 16 件追加

- **export 追加でコンポーネント挙動は不変。** `pickSupportedMime`（93 行）/ `formatDuration`（104 行）/ `recorderStatusText`（392 行）/ `MIME_CANDIDATES`（52 行）と型 `IsTypeSupported`（70 行）/ `RecorderState`（110 行）が named export 化された。`AudioRecorder` 本体はこれらを従来と同一の呼び出しで使用しており（`formatDuration(seconds)` @449、`recorderStatusText(state)` @346、`pickSupportedMime()` @206）、export 化はシンボルの可視性のみを変える。レンダー結果・状態機械・リソース解放経路に変化なし。typecheck / biome ともクリーン。

- **`isTypeSupported` 注入が本番経路で従来動作を保つ。** `pickSupportedMime(isSupported: IsTypeSupported = defaultIsTypeSupported)`（93-95 行）はデフォルト引数で `defaultIsTypeSupported`（77-85 行）を採る。本番唯一の呼び出し（`beginRecording` 内 206 行）は引数なし `pickSupportedMime()` のため必ず `defaultIsTypeSupported` 経路に入る。`defaultIsTypeSupported` は `MediaRecorder` 未定義・`isTypeSupported` 非関数を従来どおりガードして `false` を返し（→ caller が engine-default + `.webm` フォールバック）、それ以外は `MediaRecorder.isTypeSupported(mimeType)` をそのまま委譲する。注入口はテスト専用で、本番のプラットフォーム判定ロジックは Round 2 時点と同一。最小リファクタの主張どおり。

- **a11y 契約「recording=秒非依存」を実際に回帰検出する。** `recorderStatusText` テスト（37-48 行）は `recording` 状態を `seconds: 0 / 1 / 599`・`bytes: 0 / 1024 / 20MiB` と変化させても全件 `"録音中"` に等しいことを各要素で assert し、さらに `new Set(texts).size === 1` で「テキストが秒で分岐しない」ことを集合濃度で固定する。将来 `recording` ケースに秒数を戻す回帰が入れば、要素ごとの `toBe("録音中")` と Set サイズ assertion の両方が落ちる。W-002 で入れた「polite 領域が毎秒再アナウンスしない」契約（コメント 399-401 行 / テストコメント 34-36 行に WHY 明記）を実際に守る回帰ガードとして機能する。

- **純関数の回帰価値が網羅されている。** `pickSupportedMime`（92-143 行）は全候補 true で `audio/webm;codecs=opus` 優先、opus suffix 非対応で plain webm フォールバック、Safari（webm 非対応）で `audio/mp4`/`m4a`、ogg 系の順序、全非対応で `null`（engine-default）をカバー。さらに「宣言順を厳密に辿る」テスト（134-142 行）が `MIME_CANDIDATES` を末尾から順に有効化して各位置が選ばれることを総当たりで固定し、候補配列のリシャッフル回帰を検出する。`formatDuration` はゼロパディング・分秒境界（59/60/61）・2 桁分（30:00 / 11:09）を固定。バックエンドとフロント録音ロジックのテスト非対称が解消された。

---

## Frontend

### Blockers

- **なし。**

### Warnings

- **なし。** Round 2 の唯一の残 Warning（W-001 後半）が上記のとおり解消され、新規 Warning も検出されなかった。

### Notes

- **[N-001] テスト拡張子 `.ts`（非 `.tsx`）は適切。** `AudioRecorder.test.ts` は JSX を含まず純関数のみを検証するため `.tsx` 不要。`ingestion/__tests__/` 内の他コンポーネントテスト（`.tsx`）と意図的に区別されており妥当。Blob を `{ size: 1 } as Blob` でスタブする（69 行）のも純関数テストとして DOM 非依存を保つ最小手段で正しい。

- **[N-002] `IsTypeSupported` の本番非利用は意図どおり。** 注入引数はテスト専用で本番コードパスからは到達しない。これは「テスト容易性のための最小注入口」という Round 2 修正方針と一致しており、過剰な抽象化ではない（デフォルト引数 1 つの追加に留まる）。蒸し返す指摘ではなく確認のみ。
