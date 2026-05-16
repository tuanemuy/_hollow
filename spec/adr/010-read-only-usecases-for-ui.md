# ADR 010: UI 向け読み取り系ユースケースを補足する

## ステータス

承認済み（2026-05-16）

## コンテキスト

初期のユースケース設計（[spec/usecases/](../usecases/)）は「状態を変更する命令」を中心に列挙していた。フロントエンド実装に進んで以下の不足が判明した:

- 管理者のプロンプト設定画面（P23 / P42）で「インスタンス既定」と「ユーザー上書き」の両方を画面に並べて表示する必要があるが、それぞれを取得する明示的なユースケースが定義されていなかった
- 公開ビュー（P30 公開プロフィール / P31 公開ノート / P33 共有リンク）でノート本文・著者プロフィール・公開ノート一覧を取得する明示的なユースケースが欠けていた
- セッション失効は LogOut だけが定義されていたが、設定画面で「他のセッションだけ失効させる」「特定の 1 セッションを失効させる」という呼び出し用途を画面側のコードから区別したかった

これらをすべて「画面側で usecases を組み合わせて DTO 化する」方針にすると、DTO 整形がフロントエンド層に滲み出してしまい、CLAUDE.md の「DTO 射影は application 層」の原則に反する。

## 決定

**UI 駆動で必要になった読み取り系ユースケースを application 層に追加する**。ファイルへの呼出側用途に応じた別名公開も許容する。

追加したユースケース:

- `adminSettings.GetInstancePromptDefaults` — インスタンス既定プロンプト一覧。admin 権限ゲートを持たず、ログインユーザーは誰でも自分のプロンプトオーバーライド画面でこれを参照できる
- `adminSettings.GetUserPromptOverride` — ログインユーザー自身のオーバーライド一覧。不在時は空マップを返し、呼出側が「継承中」状態を一様に描画できるようにする
- `publication.GetPublicNote` — `(username, slug)` または `noteId` で公開ノート 1 件を解決。所有者ステータス / ノートステータス / `visibility === 'public'` の 3 段 gate をすべて `NotFoundError('note')` に畳んで enumeration を避ける（unlisted は `ResolveShareLink` の担当）
- `publication.GetPublicProfile` — 公開プロフィールの射影。公開ノート件数を併せて返す
- `publication.ListUserPublicNotes` — 公開プロフィール画面のフィード用、`SearchUserPublicNotes` とは別のシンプルな offset / limit リスト
- `identity.revokeSession` — `LogOut` の同義エイリアス。契約（`SessionService.revoke`、冪等）は同一で、呼出側用途（自セッション終了 vs 他セッション一括失効）を呼出名で区別する

## 結果

- spec/usecases/adminSettings.md / publication.md / identity.md にこれらを追記済み
- フロントエンドは application 層の純粋な DTO を消費するだけで済み、画面側のロジックが薄く保てる
- enumeration 対策（NotFoundError への畳み込み）の判断は GetPublicNote のセクションに明記
