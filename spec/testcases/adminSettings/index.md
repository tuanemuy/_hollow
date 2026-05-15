# AdminSettings テストケース

## GetInstanceSettings

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| admin actor | Get | DTO（apiKey マスク） |
| member actor | Get | `AuthorizationError` |
| 設定未保存 | Get | デフォルト値で返却 |

## UpdateLLMConfig

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| admin、API キー新規 | Update | encrypt 後保存、source='db' |
| env が設定済み | Update | source='env' 強制 |
| 不正 model 文字列 | Update | `ValidationError` |
| member | Update | `AuthorizationError` |

## TestLLMConnection

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 接続成功 | Test | ok=true、latencyMs |
| 接続失敗 | Test | ok=false、error メッセージ |

## UpdatePromptTemplate（admin）

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 変数定義一致 | Update | 反映 |
| プレースホルダ変数欠落 | Update | `ValidationError('prompt_variable_missing')` |
| 16 KiB 超 | Update | `ValidationError('prompt_too_large')` |

## UpdateUserPromptOverride

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 通常 | Update | 反映 |
| clearPrompt（null） | Update | キー削除 |
| 不正テンプレート | Update | `ValidationError` |

## UpdateDesignTokens / ResetDesignTokens

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 正規キー / 値 | Update | 反映 |
| 不正キー（`--FOO` 大文字） | Update | `ValidationError` |
| Reset | Reset | デフォルト |

## ToggleRegistrationPolicy / UpdateInstanceLimits

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| open=false + reason | Toggle | registration 停止、SignUp が拒否される |
| open=true | Toggle | SignUp が許可される |
| limits 不正値（負数） | Update | `ValidationError` |

## GetUsageMetrics

| 前提条件 | 操作 | 期待結果 |
|---|---|---|
| 通常 | Get | metric が揃って返却 |
| 一部メトリクス取得失敗 | Get | 失敗したキーは null、その他は値 |
