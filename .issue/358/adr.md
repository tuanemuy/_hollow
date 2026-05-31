# ADR — Issue #358: アップロード時のカスタムプロンプト入力欄の既定値可視化

## ADR-001: 既定プロンプトの供給経路は server function 経由の lazy fetch

### Status
Proposed

### Context
`UploadDialog` はどの画面からでもハッシュ `#upload` でグローバル mount される（`AppShellFrame` 配下の `UploadDialogMount`）。特定の route loader から既定値を渡すには、アップロードボタンを持つ全 route の loader に既定値を載せる必要があり非現実的。一方、既存の `getJob` / `getTree` はダイアログ open 時に `useServerFn` で server-fn を lazy 呼び出しする確立されたパターンがある。

### Decision
解決済み既定プロンプトはダイアログ open 時に server function 経由で lazy fetch する。loader 経由の供給はしない。

### Consequences
- 良い点: 既存の lazy-fetch パターンと完全一致。開くまでネットワークを発生させない。失敗してもアップロード本体を阻害しない（サイレントフォールバック）。
- トレードオフ: ダイアログを開くたびに 1 リクエスト発生（許容範囲。既定値はユーザー・インスタンス設定で変わりうるためキャッシュしない方が安全）。

---

## ADR-002: 既定値の解決ロジックは application 層の新 usecase に置く

### Status
Proposed

### Context
プロンプト解決の優先順位（ユーザー上書き → インスタンス既定 → プロバイダ組み込み）は `D1PromptResolver`（アダプター層）に封じられている。presentation はアダプターを直接呼べない（Hexagonal の内向き依存）。既存 `getInstancePromptDefaults` + `getUserPromptOverride` を UI 側で合成して解決順を再現する案もあるが、ドメインの優先順位ルールを presentation に漏らすため不適切。

### Decision
`app/core/application/ingestion/getEffectiveIngestionPrompts.ts` を新設し、`promptResolver.resolveFor` を呼んで `structure` / `metadata` の解決済みテキストを返す。「ユーザー上書き中か否か」（`isUserOverride`）は user override repository を参照して導出する。

**`isUserOverride` の述語は resolver と完全一致させる:** resolver は user override を「entry が存在し かつ `entry.text.length > 0`」のときだけ採用する（`promptResolver.ts:89`）。`getUserPromptOverride` は template があれば無条件で `isOverridden: true` を立てるため、そのまま流用すると「override 行はあるが該当 purpose の text が空」で表示（上書き中）と実挙動（インスタンス既定使用）が矛盾する。よって `entry !== undefined && entry.text.length > 0` を真とする。

### Consequences
- 良い点: 解決順を application 層に閉じ込め、presentation は「実際に使われる値」を 1 値で受け取れる。DI コンテナは既に `promptResolver` を保持しているため配線追加は最小。
- トレードオフ: `resolveFor` は解決済みテキストのみ返し「どの層で解決されたか」を返さないため、`isUserOverride` を出すには user override repository を別途参照する必要がある（usecase 内に閉じるので presentation への漏れはない）。resolver の述語（text 非空）と repository の述語（行の有無）を取り違えないよう厳密に揃える。

---

## ADR-003: 既定値表示は `PromptOverrideField` サブコンポーネントに集約し、details onToggle で 1 回だけ fetch

### Status
Accepted（実装時）

### Context
SelectView の構造化 / メタデータ 2 欄は、placeholder（既定値冒頭）・状態バッジ（既定を使用中 / この回だけ上書き）・既定全文 details・出所表示（ユーザー設定 / インスタンス既定）・空文字フォールバック文言という同一構造を持つ。両欄に重複展開すると保守性が落ちる。また lazy fetch のトリガと「取得済み」ガードをどこに置くかも決める必要があった。

### Decision
- 1 欄分の表示ロジックを `PromptOverrideField`（`UploadDialog.tsx` 内のモジュールローカルコンポーネント）に抽出し、`resolved: { text, isUserOverride } | null` を受けて表示を組み立てる。`resolved === null`（未取得 / 取得失敗）のときは placeholder も出所表示も出さず、純粋な入力欄に退化する。
- fetch は `details` の `onToggle`（open かつ未取得時）で 1 回だけ起動。「取得済み」は `promptsFetchedRef`（ref）で管理し、再開閉で再 fetch しない。ダイアログ open リセット時に ref と `resolvedDefaults` state を初期化する。
- 空文字フォールバック文言 `LLM プロバイダの既定指示を使用` は `BUILTIN_PROMPT_FALLBACK_COPY` 定数として `UploadDialog.tsx` に置き、placeholder と details 全文の両方で同一文言を使う（SSOT は `defaults.ts` JSDoc / #218 ADR-002）。

### Consequences
- 良い点: 2 欄の体裁が構造的に一致し、状態は `data-overriding` 属性 + Tailwind variant で表現（CLAUDE.md スタイル規約準拠）。fetch 1 回ガードで無駄リクエストを抑止。
- トレードオフ: placeholder は 16 KiB の長文を避けるため `PLACEHOLDER_MAX_CHARS`(140) で冒頭のみに切り詰める（全文は details で参照可能）。`onToggle` は閉じるときも発火するため、ハンドラ側で open 判定が必須。

---
