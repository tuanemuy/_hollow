# ADR — Issue #370: SECRET_BOX_MASTER_KEY rotation の再暗号化バッチ実装

## ADR-001: 段階移行（両鍵 decrypt フォールバック）と一括 re-encrypt の折衷

### Status
Proposed

### Context
master key ローテーション時、旧鍵で暗号化された行は新鍵では tag mismatch で復号できなくなる。安全な移行には (A) 旧鍵を保持して両鍵で decrypt を試行し続ける段階移行、(B) 全対象行を一括で旧鍵→新鍵に re-encrypt するバッチ、のいずれか（または折衷）が要る。現状 at-rest 暗号化対象は `instance_settings.llm_api_key_ciphertext` の singleton 1 行のみ。

### Decision
両者の折衷を採る。旧鍵保持期間中は両鍵で decrypt を試行（新鍵→失敗時に旧鍵）し、明示的な再暗号化ユースケースで新鍵に書き直す。再暗号化完了後に旧鍵を破棄する。version byte は鍵差し替えでは切り替えない（0x01 維持）。鍵世代の判別は「新鍵で decrypt できるか」のタグ検証で代替し、追加の世代メタデータは持たない。version byte の増分は将来のアルゴリズム変更時に予約する。

**両鍵フォールバックの実装場所:** `SecretBox` ポート／`WebCryptoSecretBox` 自体には実装しない（ポートは単一鍵のまま純粋に保つ）。フォールバックは application 層の名前付きヘルパー `decryptWithFallback(box, boxPrevious, cipher)` に閉じ、再暗号化 usecase と consumer 復号経路（`resolveConsumerLlmConfig`）の両方がこれを使う。`DecryptFailed`（tag mismatch）のときだけ旧鍵にフォールバックし、`InvalidCiphertext`（version byte 不一致等）はフォールバックせず伝播する。

### Consequences
- 良い点: singleton 1 行という実体に対し過剰な汎用バッチを避けつつ、旧鍵を永久保持する危険も避けられる。新鍵 decrypt 先行試行で冪等。フォールバックを一箇所に閉じるので DRY かつポートが汚れない。
- トレードオフ: 旧鍵保持期間中は decrypt が最大 2 回試行。データから「どの鍵で暗号化されたか」は判別できず tag 検証が事実上の判別子になる。

---

## ADR-002: 起動経路は admin UI のユースケース（scheduled cron 不採用）

### Status
Proposed

### Context
再暗号化をどこで動かすか。候補は (1) admin UI から起動する usecase、(2) scheduled/cron worker、(3) CLI/script。

### Decision
admin UI から起動する usecase を採る。rotation は頻度の低い手動運用イベントで「新鍵設定→deploy→再暗号化→旧鍵破棄」の順序を人間が制御する必要がある。対象も singleton 1 行で worker 化の利得が無く、既存 admin usecase（`updateLLMConfig` 等）と同じ presentation→application 経路に乗せるのが hexagonal に最も自然。

### Consequences
- 良い点: 既存パターンを踏襲。旧鍵破棄タイミングを運用者が制御できる。
- トレードオフ: 完全自動ではない（手動実行が必要）。ただし rotation 自体が手動運用イベントなので問題にならない。
- 不採用理由: cron 化は旧鍵保持期間の判断が機械化できない。`createWorkerContainer` は secretBox/UoW/instanceSettingsRepository を持たず、1 行のために重い container を新規に組む必要がある。CLI/script はランタイム外で D1 にアクセスする経路が無い。

---

## ADR-003: 旧鍵は optional secret `SECRET_BOX_MASTER_KEY_PREVIOUS`、spec には載せない

### Status
Proposed

### Context
旧鍵をどう供給するか。`checkSecrets` は spec に対し missing/extra 両方を fail させる設計。旧鍵は通常時 absent・rotation 時のみ present の一時 secret。

### Decision
`SECRET_BOX_MASTER_KEY_PREVIOUS` を optional env として追加する。`selectSecretBox`（新鍵 fail-fast）はそのまま、旧鍵は別経路で構築し未設定なら `null`、placeholder/不正値は eager throw。恒久 spec には載せず、rotation 時に手動 `wrangler secret put` する運用とし README に手順を明記する。

### Consequences
- 良い点: 通常時の deploy / `checkSecrets` を壊さない。変更最小。
- トレードオフ: 旧鍵が CI 管理外の手動 secret になるため、put / delete 手順の文書化が必須。手順漏れで旧鍵が残るリスクを README の必須ステップで担保する。旧鍵 secret は **web と consumer の両 worker** に put する必要がある（ADR-004 参照）。

---

## ADR-004: rotation 中の consumer 復号経路にも両鍵フォールバックを適用する

### Status
Proposed

### Context
`secretBox` は `RequestContainer` のフィールドで、`ConsumerContainer extends RequestContainer`、`createConsumerContainer` は `createRequestContainer(...)` を spread する。consumer の `resolveConsumerLlmConfig` は新鍵 `secretBox` のみで `apiKeySource='db'` の api key を復号し、失敗時は warn-log して Stub に降格する。このため rotation 中（新鍵 deploy 後・再暗号化実行前）に旧鍵行が残っていると、consumer の LLM/OCR/PDF 処理がサイレントに Stub へ劣化し、Issue が解決しようとする「安全なローテーション」が崩れる。

### Decision
`secretBoxPrevious` を `RequestContainer` に追加し（`readRequestServerConfig` の旧鍵 spread を介して request / consumer 両経路へ自動伝播）、`resolveConsumerLlmConfig` の復号を `decryptWithFallback(secretBox, secretBoxPrevious, cipher)` 経由に置き換える。旧鍵が put されていれば rotation 中も consumer が旧鍵行を復号でき、Stub 降格しない。旧鍵 secret は web（再暗号化実行）と consumer（rotation 中の復号）の両 worker に put する。

`resolveConsumerLlmConfig` のシグネチャに `secretBoxPrevious: SecretBox | null` を追加する。責務分担として `decryptWithFallback` は復号失敗時に throw し、Stub 降格の判断は従来どおり呼び出し側の既存 `try/catch`（`isSecretBoxError` を warn-log して `null` 返し）が担う。ヘルパーは降格ポリシーを持たない。

### Consequences
- 良い点: rotation 中も db-source の LLM 機能が停止しない。再暗号化を「deploy 直後に即実行」する運用制約に依存しなくて済む。降格ポリシーを呼び出し側に残すので、ヘルパーは web 経路（throw して UI にエラー表示）と consumer 経路（catch して Stub 降格）の両方で再利用できる。
- トレードオフ: consumer worker にも旧鍵 secret を put する手順が増える（README に明記）。フォールバック適用後は decrypt が最大 2 回試行になるが、ジョブ単位の軽微なコスト。

---

## ADR-005: 実装時の補足判断（Issue #370 実装で確定）

### Status
Accepted（実装済み）

### Context
plan.md / ADR-001〜004 に沿って実装する過程で、非自明な細部を 2 点確定した。

### Decision
1. **`reencryptApiKey` の起動経路は既存の admin「ジョブ監視」画面（`/admin/jobs`）に同居させる。** ADR-002 が「admin UI の usecase」と決めた上で、専用ルートを新設せず、`rebuildSearchIndex`（no-input admin バッチ）と同じ `app/components/admin/Jobs`（server function `reencryptApiKeyFn` + `SecretRotationSection` コンポーネント）に追加した。rotation・index 再構築はどちらも「低頻度・no-input・admin 限定の運用バッチ」で UI パターンが完全に一致するため、ルート分割よりも既存セクション併設のほうが規約（CLAUDE.md Styling / `styles.ts` 定数）に自然に乗る。
2. **`reencryptApiKey` の戻り値 DTO を `dto/adminSettings.ts` に `ReencryptApiKeyResultDTO` として追加し、`{ reencrypted, skipped }` をそのまま projection する。** usecase の出力型と構造が同一だが、presentation 境界には DTO を返すという既存規約（`RebuildSearchIndexResultDTO` と同型）に合わせ、application 出力型を直接 RSC payload に載せない。新エラーコードは追加していない（plan step 6 のとおり `SecretBoxError(KeyUnavailable)` / `ConflictError` で表現）。

### Consequences
- 良い点: 新規ルート・新規エラーコードを増やさず、既存の admin バッチ UI / DTO 規約に完全に乗る。`errorCodeNaming.test.ts` への波及なし。
- トレードオフ: 「ジョブ監視」画面にジョブ以外の運用バッチ（index 再構築・鍵再暗号化）が同居するが、これは #370 以前から `rebuildSearchIndex` で確立済みの構成であり新規の負債ではない。
