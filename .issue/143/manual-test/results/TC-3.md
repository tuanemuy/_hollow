# TC-3: apiKey set + baseline (provider/model/apiKey lock)

**結果**: PASS
**実行時間**: 約60秒

## 前提条件
- `ADMIN_LLM_PROVIDER=anthropic` (set)
- `ADMIN_LLM_MODEL=claude-3-5-sonnet-latest` (set)
- `ADMIN_LLM_BASE_URL=""` (空文字 → unset 判定)
- `ADMIN_LLM_API_KEY=sk-ant-fake-test-key-for-manual-verification` (set)

## 実行ログ
| # | 操作 | 期待結果 | 実際の結果 | 判定 |
|---|------|---------|-----------|------|
| 1 | `/login` にアクセス | ログインフォーム表示 | 表示された (textbox `メールアドレス`/`パスワード`, button `ログイン`) | PASS |
| 2 | admin@example.com / Password123! でログイン | 認証成功 | リダイレクトされ admin 領域へ遷移 | PASS |
| 3 | `/admin/llm` にアクセス | LLM 設定ページが表示 | heading "LLM 設定" 表示、3 セクション (プロバイダ/API キー/モデル) 描画 | PASS |
| 4 | provider select の状態確認 | disabled + 環境変数固定の説明 | `combobox "プロバイダ" [disabled] : Anthropic Claude` + 「環境変数 `ADMIN_LLM_PROVIDER` で固定されているため変更できません。」 | PASS |
| 5 | model input の状態確認 | disabled + 環境変数固定の説明 | `textbox "既定モデル" [disabled] : claude-3-5-sonnet-latest` + 「環境変数 `ADMIN_LLM_MODEL` で固定されているため変更できません。」 | PASS |
| 6 | apiKey input の状態確認 | disabled + 環境変数固定の説明 (TC-1 との差分) | `textbox "新しい API キー" [disabled]` + status "環境変数から読み込み中" + 「環境変数 ADMIN_LLM_API_KEY で固定されているため変更できません。」 | PASS |
| 7 | baseURL field の有無 | provider=anthropic では非描画 | body HTML 全文に `baseURL` / `ADMIN_LLM_BASE_URL` の出現なし (grep count=0) | PASS |
| 8 | 全体 banner の有無 | 4 つ全部 set でないため非表示 | body HTML 全文に「すべての LLM 設定が環境変数で固定中」相当の文言なし (grep count=0) | PASS |
| 9 | 保存ボタンの表示 | UI 上の挙動を観察 | button "変更を保存" は描画されているが、編集可能 field が無いため実質ノーオプ。disabled 表記は無いが操作不能 input のみ。 | OBSERVE |
| 10 | Secret hygiene | env API key 実値が DOM に含まれない | body HTML 70,566 bytes 中 `sk-ant-fake-test-key-for-manual-verification` の出現回数 = 0 | PASS |

## スクリーンショット
- `screenshots/tc-3/step-04-admin-llm-apikey-lock.png` — `/admin/llm` 全体表示。provider/model/apiKey の 3 セクションが lock 状態で表示されている。

## Secret hygiene チェック
- env API key 実値 (`sk-ant-fake-test-key-for-manual-verification`) が DOM に含まれていない: **PASS**
- 検証方法: `agent-browser get html 'body'` で 70,566 byte の body HTML を取得し `grep -c` で 0 件確認。
- API キー入力欄は `disabled` の `textbox` で value 属性は空 (env 値は presentation 層に渡されていない)。
- 代わりに status role で「環境変数から読み込み中」のメタ情報のみ表示。

## 観察事項

### TC-1 との差分（apiKey の lock 状態）
- **TC-1**: `ADMIN_LLM_API_KEY` 未設定 → apiKey input は編集可能、status は「DB 保存値を使用」相当 (期待値)
- **TC-3**: `ADMIN_LLM_API_KEY` set → apiKey input が `[disabled]` 化、status は「環境変数から読み込み中」、固定理由の説明文が追記される
- → apiKey 単独セット時の lock UI が想定通り発動している

### 全体 banner が非表示であること
- `ADMIN_LLM_BASE_URL` が空文字 (unset 判定) のため、4 つ全部 set ではない
- 設計仕様どおり「全部固定中」の status banner は描画されない
- 個別セクションの lock 表示 (3 箇所) のみで一貫した UX

### baseURL field が非描画であること
- provider=anthropic では baseURL を概念的に持たないため、env 設定の有無に関わらず field 自体が非描画
- これは TC-1, TC-2, TC-3 で共通の振る舞いと期待され、本ケースでも確認できた

### 保存ボタンについて
- 編集可能 field が一つも無いにも関わらず「変更を保存」ボタンは描画されており disabled になっていない
- ただし変更可能な input が無いため押下しても実質 no-op になる想定
- UX 上は「無効化」または「ボタン非表示」が望ましいかもしれないが、現状は許容範囲（lock 状態は個別 field で明示済み）

## 結論
TC-3 は全項目 PASS。apiKey 単独 lock の挙動、provider=anthropic での baseURL 非描画、全体 banner 非表示（4 つ全部 set でないため）、secret hygiene のすべてが期待通り。
