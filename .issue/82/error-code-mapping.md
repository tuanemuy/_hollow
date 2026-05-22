# Error Code Mapping Table — Issue #82

実装フェーズで `app/core/domain/*/errorCode.ts` の各 property に適用する **正解値（value）** を確定する表。ADR-002 の値決定フローチャートに従う:

1. spec に一致文言があれば spec 文言をそのまま採用
2. 同義の spec 文言が複数あれば既存値（spec 一致側）を維持し、もう片方は本 Issue では touch しない（ADR-006）
3. 異ドメインで同義の spec 文言を共有する場合は同値容認（ADR-004）
4. spec に該当文言が無ければ `{domain}_{snake_case_of_property_key}` をデフォルト

property key（左辺）は不変。

凡例:
- **spec 根拠**: `spec/` 内で観測された `BusinessRuleError('...')` 文言。`spec 無し` は spec に該当文言が無く、デフォルトを適用したもの。

---

## adminSettings

| property | 現状値 | 新値 | spec 根拠 |
|---|---|---|---|
| InvalidUserId | `ADMIN_SETTINGS_INVALID_USER_ID` | `admin_settings_invalid_user_id` | spec 無し（デフォルト） |
| InvalidLLMProvider | `ADMIN_SETTINGS_INVALID_LLM_PROVIDER` | `admin_settings_invalid_llm_provider` | spec 無し |
| InvalidLLMModel | `ADMIN_SETTINGS_INVALID_LLM_MODEL` | `admin_settings_invalid_llm_model` | spec 無し |
| InvalidLLMModelTooLong | `ADMIN_SETTINGS_INVALID_LLM_MODEL_TOO_LONG` | `admin_settings_invalid_llm_model_too_long` | spec 無し |
| InvalidLLMApiKeySource | `ADMIN_SETTINGS_INVALID_LLM_API_KEY_SOURCE` | `admin_settings_invalid_llm_api_key_source` | spec 無し |
| InvalidLLMApiKeyCiphertext | `ADMIN_SETTINGS_INVALID_LLM_API_KEY_CIPHERTEXT` | `admin_settings_invalid_llm_api_key_ciphertext` | spec 無し |
| InvalidPromptPurpose | `ADMIN_SETTINGS_INVALID_PROMPT_PURPOSE` | `admin_settings_invalid_prompt_purpose` | spec 無し |
| PromptTemplateTooLarge | `ADMIN_SETTINGS_PROMPT_TEMPLATE_TOO_LARGE` | `admin_settings_prompt_template_too_large` | spec 無し |
| PromptTemplateVariableMismatch | `ADMIN_SETTINGS_PROMPT_TEMPLATE_VARIABLE_MISMATCH` | `admin_settings_prompt_template_variable_mismatch` | spec 無し |
| PromptTemplateInvalidVariableName | `ADMIN_SETTINGS_PROMPT_TEMPLATE_INVALID_VARIABLE_NAME` | `admin_settings_prompt_template_invalid_variable_name` | spec 無し |
| InvalidDesignTokenKey | `ADMIN_SETTINGS_INVALID_DESIGN_TOKEN_KEY` | `admin_settings_invalid_design_token_key` | spec 無し |
| InvalidDesignTokenValue | `ADMIN_SETTINGS_INVALID_DESIGN_TOKEN_VALUE` | `admin_settings_invalid_design_token_value` | spec 無し |
| DesignTokensTooMany | `ADMIN_SETTINGS_DESIGN_TOKENS_TOO_MANY` | `admin_settings_design_tokens_too_many` | spec 無し |
| InvalidRegistrationClosedReason | `ADMIN_SETTINGS_INVALID_REGISTRATION_CLOSED_REASON` | `admin_settings_invalid_registration_closed_reason` | spec 無し |
| InvalidInstanceLimit | `ADMIN_SETTINGS_INVALID_INSTANCE_LIMIT` | `admin_settings_invalid_instance_limit` | spec 無し |
| EnvOverrideMissingKey | `ADMIN_SETTINGS_ENV_OVERRIDE_MISSING_KEY` | `admin_settings_env_override_missing_key` | spec 無し |

---

## directory

| property | 現状値 | 新値 | spec 根拠 |
|---|---|---|---|
| InvalidId | `DIRECTORY_INVALID_ID` | `directory_invalid_id` | spec 無し |
| NameEmpty | `DIRECTORY_NAME_EMPTY` | `directory_name_empty` | spec 無し |
| NameTooLong | `DIRECTORY_NAME_TOO_LONG` | `directory_name_too_long` | spec 無し |
| NameForbiddenCharacter | `DIRECTORY_NAME_FORBIDDEN_CHARACTER` | `directory_name_forbidden_character` | spec 無し |
| NameConflict | `directory_name_conflict` | `directory_name_conflict` | spec `directory_name_conflict` |
| TooDeep | `directory_too_deep` | `directory_too_deep` | spec `directory_too_deep` |
| CyclicMove | `directory_cyclic_move` | `directory_cyclic_move` | spec `directory_cyclic_move` |
| CannotRenameRoot | `cannot_rename_root` | `cannot_rename_root` | spec `cannot_rename_root`（prefix 無し維持） |
| CannotDeleteRoot | `cannot_delete_root` | `cannot_delete_root` | spec `cannot_delete_root` |
| CannotMoveRoot | `cannot_move_root` | `cannot_move_root` | spec 無し（既存 lower 維持） |
| RootMustHaveNoParent | `directory_root_must_have_no_parent` | `directory_root_must_have_no_parent` | spec 無し |
| NonRootMustHaveParent | `directory_non_root_must_have_parent` | `directory_non_root_must_have_parent` | spec 無し |
| DepthMismatch | `directory_depth_mismatch` | `directory_depth_mismatch` | spec 無し |
| InvalidSlug | `DIRECTORY_INVALID_SLUG` | `directory_invalid_slug` | spec 無し |

---

## export

| property | 現状値 | 新値 | spec 根拠 |
|---|---|---|---|
| InvalidId | `EXPORT_INVALID_ID` | `export_invalid_id` | spec 無し |
| InvalidFormat | `EXPORT_INVALID_FORMAT` | `export_invalid_format` | spec 無し |
| InvalidScope | `EXPORT_INVALID_SCOPE` | `export_invalid_scope` | spec 無し |
| InvalidStatus | `EXPORT_INVALID_STATUS` | `export_invalid_status` | spec 無し |
| InvalidPaperSize | `EXPORT_INVALID_PAPER_SIZE` | `export_invalid_paper_size` | spec 無し |
| InvalidProgress | `EXPORT_INVALID_PROGRESS` | `export_invalid_progress` | spec 無し |
| InvalidArtifactSize | `EXPORT_INVALID_ARTIFACT_SIZE` | `export_invalid_artifact_size` | spec 無し |
| InvalidTtl | `EXPORT_INVALID_TTL` | `export_invalid_ttl` | spec 無し |
| InvalidErrorCode | `EXPORT_INVALID_ERROR_CODE` | `export_invalid_error_code` | spec 無し |
| InvalidErrorReason | `EXPORT_INVALID_ERROR_REASON` | `export_invalid_error_reason` | spec 無し |
| InvalidArtifactKey | `EXPORT_INVALID_ARTIFACT_KEY` | `export_invalid_artifact_key` | spec 無し |
| InvalidKeyword | `EXPORT_INVALID_KEYWORD` | `export_invalid_keyword` | spec 無し |
| InvalidDateRange | `EXPORT_INVALID_DATE_RANGE` | `export_invalid_date_range` | spec 無し |
| ScopeTargetMismatch | `EXPORT_SCOPE_TARGET_MISMATCH` | `export_scope_target_mismatch` | spec 無し |
| IllegalTransition | `EXPORT_ILLEGAL_TRANSITION` | `export_illegal_transition` | spec 無し |
| InvalidStateForRetry | `EXPORT_INVALID_STATE_FOR_RETRY` | `export_invalid_state_for_retry` | spec 無し |
| CompletedMissingArtifact | `EXPORT_COMPLETED_MISSING_ARTIFACT` | `export_completed_missing_artifact` | spec 無し |
| QuotaExceeded | `export_quota_exceeded` | `export_quota_exceeded` | spec `export_quota_exceeded` |
| Unauthorized | `export_unauthorized` | `export_unauthorized` | spec `export_unauthorized` |
| PdfNotImplemented | `pdf_export_not_implemented_in_mvp` | `pdf_export_not_implemented_in_mvp` | spec 無し（既存 lower 維持） |

備考: spec には `export_already_finished` / `export_expired` / `export_not_ready` / `export_size_exceeded` も存在するが、現状 `*ErrorCode` 定数として未登録のため本 Issue では対象外（ADR-001 P-002 / ADR-006）。

---

## identity

| property | 現状値 | 新値 | spec 根拠 |
|---|---|---|---|
| InvalidUserId | `USER_INVALID_ID` | `user_invalid_id` | spec 無し |
| InvalidUsername | `USERNAME_INVALID` | `username_invalid` | spec 無し |
| UsernameTooShort | `USERNAME_TOO_SHORT` | `username_too_short` | spec 無し |
| UsernameTooLong | `USERNAME_TOO_LONG` | `username_too_long` | spec 無し |
| UsernameReserved | `USERNAME_RESERVED` | `username_reserved` | spec 無し |
| InvalidEmail | `EMAIL_INVALID` | `email_invalid` | spec 無し |
| EmailTooLong | `EMAIL_TOO_LONG` | `email_too_long` | spec 無し |
| PasswordTooShort | `PASSWORD_TOO_SHORT` | `password_too_short` | spec 無し |
| PasswordTooLong | `PASSWORD_TOO_LONG` | `password_too_long` | spec 無し |
| PasswordInsufficientVariety | `PASSWORD_INSUFFICIENT_VARIETY` | `password_insufficient_variety` | spec 無し |
| InvalidPasswordHash | `PASSWORD_HASH_INVALID` | `password_hash_invalid` | spec 無し |
| InvalidUserStatus | `USER_INVALID_STATUS` | `user_invalid_status` | spec 無し |
| InvalidRole | `USER_INVALID_ROLE` | `user_invalid_role` | spec 無し |
| InvalidChallengePurpose | `CHALLENGE_INVALID_PURPOSE` | `challenge_invalid_purpose` | spec 無し |
| InvalidCredentialKind | `CREDENTIAL_INVALID_KIND` | `credential_invalid_kind` | spec 無し |
| InvalidMediaAssetId | `MEDIA_ASSET_ID_INVALID` | `media_asset_id_invalid` | spec 無し |
| DisplayNameEmpty | `DISPLAY_NAME_EMPTY` | `display_name_empty` | spec 無し |
| DisplayNameTooLong | `DISPLAY_NAME_TOO_LONG` | `display_name_too_long` | spec 無し |
| BioTooLong | `BIO_TOO_LONG` | `bio_too_long` | spec 無し |
| UserNotPending | `user_not_pending` | `user_not_pending` | spec `user_not_pending` |
| UserNotActive | `user_not_active` | `user_not_active` | spec `user_not_active` |
| UserNotSuspended | `user_not_suspended` | `user_not_suspended` | spec `user_not_suspended` |
| AlreadyDeleted | `already_deleted` | `already_deleted` | spec `already_deleted` |
| AlreadyAdmin | `already_admin` | `already_admin` | spec 無し（既存 lower 維持） |
| AlreadyMember | `already_member` | `already_member` | spec 無し（既存 lower 維持） |
| UsernameChangeTooSoon | `username_change_too_soon` | `username_change_too_soon` | spec `username_change_too_soon` |
| UsernameTaken | `username_taken` | `username_taken` | spec `username_taken` |
| EmailTaken | `email_taken` | `email_taken` | spec `email_taken` |
| LastAdminProtected | `last_admin_protected` | `last_admin_protected` | spec `last_admin_protected` |
| NoCredentialRemaining | `no_credential_remaining` | `no_credential_remaining` | spec `no_credential_remaining` |
| CannotRemoveLastCredential | `cannot_remove_last_credential` | `cannot_remove_last_credential` | spec `cannot_remove_last_credential` |
| PasswordAlreadySet | `password_already_set` | `password_already_set` | spec `password_already_set` |
| ProviderAlreadyLinked | `provider_already_linked` | `provider_already_linked` | spec `provider_already_linked` |

---

## ingestion

| property | 現状値 | 新値 | spec 根拠 |
|---|---|---|---|
| InvalidId | `INGESTION_INVALID_ID` | `ingestion_invalid_id` | spec 無し |
| InvalidStatus | `INGESTION_INVALID_STATUS` | `ingestion_invalid_status` | spec 無し |
| InvalidSourceFileKind | `INGESTION_INVALID_SOURCE_FILE_KIND` | `ingestion_invalid_source_file_kind` | spec 無し |
| InvalidMimeType | `INGESTION_INVALID_MIME_TYPE` | `ingestion_invalid_mime_type` | spec 無し |
| InvalidByteSize | `INGESTION_INVALID_BYTE_SIZE` | `ingestion_invalid_byte_size` | spec 無し |
| InvalidRegenerationCount | `INGESTION_INVALID_REGENERATION_COUNT` | `ingestion_invalid_regeneration_count` | spec 無し |
| InvalidFileName | `INGESTION_INVALID_FILE_NAME` | `ingestion_invalid_file_name` | spec 無し |
| InvalidTempStorageKey | `INGESTION_INVALID_TEMP_STORAGE_KEY` | `ingestion_invalid_temp_storage_key` | spec 無し |
| InvalidErrorCode | `INGESTION_INVALID_ERROR_CODE` | `ingestion_invalid_error_code` | spec 無し |
| InvalidErrorReason | `INGESTION_INVALID_ERROR_REASON` | `ingestion_invalid_error_reason` | spec 無し |
| InvalidIngestionLimits | `INGESTION_INVALID_LIMITS` | `ingestion_invalid_limits` | spec 無し |
| InvalidSuggestedDirectoryName | `INGESTION_INVALID_SUGGESTED_DIRECTORY_NAME` | `ingestion_invalid_suggested_directory_name` | spec 無し |
| InvalidStateForStart | `INGESTION_INVALID_STATE_FOR_START` | `ingestion_invalid_state_for_start` | spec 無し |
| InvalidStateForAttachPreview | `INGESTION_INVALID_STATE_FOR_ATTACH_PREVIEW` | `ingestion_invalid_state_for_attach_preview` | spec 無し |
| InvalidStateForRegenerate | `INGESTION_INVALID_STATE_FOR_REGENERATE` | `invalid_status_for_regeneration` | spec `invalid_status_for_regeneration`（spec 文言一致優先） |
| InvalidStateForCommit | `INGESTION_INVALID_STATE_FOR_COMMIT` | `invalid_status_for_commit` | spec `invalid_status_for_commit` |
| InvalidStateForDiscard | `INGESTION_INVALID_STATE_FOR_DISCARD` | `invalid_status_for_discard` | spec `invalid_status_for_discard` |
| InvalidStateForRetry | `INGESTION_INVALID_STATE_FOR_RETRY` | `ingestion_invalid_state_for_retry` | spec 無し（retry は spec 文言なし） |
| NoTempStorageForRetry | `INGESTION_NO_TEMP_STORAGE_FOR_RETRY` | `ingestion_no_temp_storage_for_retry` | spec 無し |
| RegenerationLimitExceeded | `INGESTION_REGENERATION_LIMIT_EXCEEDED` | `regeneration_limit_exceeded` | spec `regeneration_limit_exceeded` |
| ByteSizeExceedsLimit | `INGESTION_BYTE_SIZE_EXCEEDS_LIMIT` | `ingestion_byte_size_exceeds_limit` | spec 無し（spec `size_exceeded` は本 Issue 対象外） |
| UnsupportedFormat | `INGESTION_UNSUPPORTED_FORMAT` | `unsupported_format` | spec `unsupported_format` |
| MissingSavedNoteId | `INGESTION_MISSING_SAVED_NOTE_ID` | `ingestion_missing_saved_note_id` | spec 無し |

備考: `InvalidStateForCommit/Discard/Regenerate` は spec が "status" / prefix 無しで定めているため spec 一致を採用（property key の "State" は意味的に妥当だが、value は spec 優先）。

---

## media

| property | 現状値 | 新値 | spec 根拠 |
|---|---|---|---|
| InvalidId | `MEDIA_INVALID_ID` | `media_invalid_id` | spec 無し |
| InvalidKind | `MEDIA_INVALID_KIND` | `media_invalid_kind` | spec 無し |
| InvalidBackend | `MEDIA_INVALID_BACKEND` | `media_invalid_backend` | spec 無し |
| InvalidStatus | `MEDIA_INVALID_STATUS` | `media_invalid_status` | spec 無し |
| InvalidVisibility | `MEDIA_INVALID_VISIBILITY` | `media_invalid_visibility` | spec 無し |
| InvalidMimeType | `MEDIA_INVALID_MIME_TYPE` | `media_invalid_mime_type` | spec 無し |
| InvalidByteSize | `MEDIA_INVALID_BYTE_SIZE` | `media_invalid_byte_size` | spec 無し |
| InvalidDimension | `MEDIA_INVALID_DIMENSION` | `media_invalid_dimension` | spec 無し |
| InvalidDuration | `MEDIA_INVALID_DURATION` | `media_invalid_duration` | spec 無し |
| InvalidStorageKey | `MEDIA_INVALID_STORAGE_KEY` | `media_invalid_storage_key` | spec 無し |
| InvalidOriginalFileName | `MEDIA_INVALID_ORIGINAL_FILE_NAME` | `media_invalid_original_file_name` | spec 無し |
| InvalidRefCount | `MEDIA_INVALID_REF_COUNT` | `media_invalid_ref_count` | spec 無し |
| InvariantRefCountNegative | `MEDIA_REF_COUNT_NEGATIVE` | `media_ref_count_negative` | spec 無し |
| InvariantStatusRefCountMismatch | `MEDIA_STATUS_REF_COUNT_MISMATCH` | `media_status_ref_count_mismatch` | spec 無し |
| IllegalTransition | `MEDIA_ILLEGAL_TRANSITION` | `media_illegal_transition` | spec 無し |
| NotOwned | `media_not_owned` | `media_not_owned` | spec `media_not_owned` |
| NotViewable | `media_not_viewable` | `media_not_viewable` | spec `media_not_viewable` |
| ByteSizeExceeded | `MEDIA_BYTE_SIZE_EXCEEDED` | `media_byte_size_exceeded` | spec 無し |
| ByteSizeMismatch | `MEDIA_BYTE_SIZE_MISMATCH` | `media_byte_size_mismatch` | spec 無し |

---

## note

| property | 現状値 | 新値 | spec 根拠 |
|---|---|---|---|
| InvalidId | `NOTE_INVALID_ID` | `note_invalid_id` | spec 無し |
| SlugEmpty | `NOTE_SLUG_EMPTY` | `note_slug_empty` | spec 無し |
| SlugTooLong | `NOTE_SLUG_TOO_LONG` | `note_slug_too_long` | spec 無し |
| InvalidSlug | `NOTE_INVALID_SLUG` | `note_invalid_slug` | spec 無し |
| TitleEmpty | `NOTE_TITLE_EMPTY` | `note_title_empty` | spec 無し |
| TitleTooLong | `NOTE_TITLE_TOO_LONG` | `note_title_too_long` | spec 無し |
| ContentTooLarge | `NOTE_CONTENT_TOO_LARGE` | `content_too_large` | spec `content_too_large`（prefix 無し維持） |
| InvalidStatus | `NOTE_INVALID_STATUS` | `note_invalid_status` | spec 無し |
| FrontMatterKeyInvalid | `NOTE_FRONT_MATTER_KEY_INVALID` | `note_front_matter_key_invalid` | spec 無し |
| FrontMatterTooDeep | `NOTE_FRONT_MATTER_TOO_DEEP` | `note_front_matter_too_deep` | spec 無し |
| FrontMatterTooLarge | `NOTE_FRONT_MATTER_TOO_LARGE` | `note_front_matter_too_large` | spec 無し |
| FrontMatterInvalidValue | `NOTE_FRONT_MATTER_INVALID_VALUE` | `note_front_matter_invalid_value` | spec 無し |
| InternalLinkInvalidKind | `NOTE_INTERNAL_LINK_INVALID_KIND` | `note_internal_link_invalid_kind` | spec 無し |
| InternalLinkInvalidTarget | `NOTE_INTERNAL_LINK_INVALID_TARGET` | `note_internal_link_invalid_target` | spec 無し |
| EditLockInvalidExpiry | `NOTE_EDIT_LOCK_INVALID_EXPIRY` | `note_edit_lock_invalid_expiry` | spec 無し |
| EditLockTtlTooLong | `NOTE_EDIT_LOCK_TTL_TOO_LONG` | `note_edit_lock_ttl_too_long` | spec 無し |
| EditLockedByOther | `edit_locked_by_other` | `edit_locked_by_other` | spec `edit_locked_by_other` |
| CannotMoveTrashed | `note_cannot_move_trashed` | `note_cannot_move_trashed` | spec 無し |
| AlreadyTrashed | `note_already_trashed` | `note_already_trashed` | spec `note_already_trashed`（spec `note_trashed` との重義性は ADR-006 で別 Issue 化） |
| NotTrashed | `note_not_trashed` | `note_not_trashed` | spec `note_not_trashed` |
| SlugConflict | `slug_conflict` | `slug_conflict` | spec `slug_conflict` |
| ReleaseNotOwner | `note_release_not_owner` | `note_release_not_owner` | spec 無し |
| ExtendNotOwner | `note_extend_not_owner` | `note_extend_not_owner` | spec 無し |
| MediaNotOwned | `media_not_owned` | `media_not_owned` | spec `media_not_owned`（異ドメイン共有 / ADR-004） |

---

## publication

| property | 現状値 | 新値 | spec 根拠 |
|---|---|---|---|
| InvalidShareLinkId | `PUBLICATION_INVALID_SHARE_LINK_ID` | `publication_invalid_share_link_id` | spec 無し |
| InvalidVisibility | `PUBLICATION_INVALID_VISIBILITY` | `publication_invalid_visibility` | spec 無し |
| InvalidShareLinkStatus | `PUBLICATION_INVALID_SHARE_LINK_STATUS` | `publication_invalid_share_link_status` | spec 無し |
| InvalidTokenHash | `PUBLICATION_INVALID_TOKEN_HASH` | `publication_invalid_token_hash` | spec 無し |
| ShareLinkPasswordTooShort | `PUBLICATION_SHARE_LINK_PASSWORD_TOO_SHORT` | `share_link_password_too_short` | spec 無し（spec `share_link_*` 系の prefix 無しに合わせる / ADR-007） |
| ShareLinkPasswordTooLong | `PUBLICATION_SHARE_LINK_PASSWORD_TOO_LONG` | `share_link_password_too_long` | spec 無し（prefix 無しに合わせる） |
| InvalidFailedAttempts | `PUBLICATION_INVALID_FAILED_ATTEMPTS` | `publication_invalid_failed_attempts` | spec 無し |
| InvariantPrivatePublishedAt | `PUBLICATION_INVARIANT_PRIVATE_PUBLISHED_AT` | `publication_invariant_private_published_at` | spec 無し |
| ShareLinkRevoked | `PUBLICATION_SHARE_LINK_REVOKED` | `share_link_revoked` | spec `share_link_revoked`（ADR-007 副次バグ修正） |
| ShareLinkQuotaExceeded | `PUBLICATION_SHARE_LINK_QUOTA_EXCEEDED` | `share_link_quota_exceeded` | spec `share_link_quota_exceeded` |
| MediaNotOwned | `PUBLICATION_MEDIA_NOT_OWNED` | `media_not_owned` | spec `media_not_owned`（ADR-004 異ドメイン共有） |

備考: `ShareLinkPasswordTooShort/Long` は spec に該当文言が無いが、同系統の `share_link_*` を prefix 無しで揃える spec 文言群（`share_link_revoked`, `share_link_quota_exceeded` 等）と整合させるため `share_link_password_*` を採用（plan Step 5 / ADR-004, ADR-007）。

---

## search

| property | 現状値 | 新値 | spec 根拠 |
|---|---|---|---|
| InvalidNoteId | `SEARCH_INVALID_NOTE_ID` | `search_invalid_note_id` | spec 無し |
| InvalidIndexJobId | `SEARCH_INVALID_INDEX_JOB_ID` | `search_invalid_index_job_id` | spec 無し |
| InvalidVisibility | `SEARCH_INVALID_VISIBILITY` | `search_invalid_visibility` | spec 無し |
| InvalidOp | `SEARCH_INVALID_OP` | `search_invalid_op` | spec 無し |
| TitleTooLong | `SEARCH_TITLE_TOO_LONG` | `search_title_too_long` | spec 無し |
| BodyTooLong | `SEARCH_BODY_TOO_LONG` | `search_body_too_long` | spec 無し |
| DirectoryPathInvalid | `SEARCH_DIRECTORY_PATH_INVALID` | `search_directory_path_invalid` | spec 無し |
| KeywordEmpty | `SEARCH_KEYWORD_EMPTY` | `search_keyword_empty` | spec 無し |
| KeywordTooLong | `SEARCH_KEYWORD_TOO_LONG` | `search_keyword_too_long` | spec 無し |
| LimitOutOfRange | `SEARCH_LIMIT_OUT_OF_RANGE` | `search_limit_out_of_range` | spec 無し |
| InvalidDateRange | `SEARCH_INVALID_DATE_RANGE` | `search_invalid_date_range` | spec 無し |
| InvalidCursor | `SEARCH_INVALID_CURSOR` | `search_invalid_cursor` | spec 無し |
| SnippetTooLong | `SEARCH_SNIPPET_TOO_LONG` | `search_snippet_too_long` | spec 無し |
| InvalidScore | `SEARCH_INVALID_SCORE` | `search_invalid_score` | spec 無し |
| InvalidAttempts | `SEARCH_INVALID_ATTEMPTS` | `search_invalid_attempts` | spec 無し |
| LastErrorTooLong | `SEARCH_LAST_ERROR_TOO_LONG` | `search_last_error_too_long` | spec 無し |

---

## tag

| property | 現状値 | 新値 | spec 根拠 |
|---|---|---|---|
| InvalidId | `TAG_INVALID_ID` | `tag_invalid_id` | spec 無し |
| NameEmpty | `TAG_NAME_EMPTY` | `tag_name_empty` | spec 無し |
| NameTooLong | `TAG_NAME_TOO_LONG` | `tag_name_too_long` | spec 無し |
| NameInvalidChars | `TAG_NAME_INVALID_CHARS` | `tag_name_invalid_chars` | spec 無し |
| NoteCountNegative | `TAG_NOTE_COUNT_NEGATIVE` | `tag_note_count_negative` | spec 無し |
| NameNotUnique | `TAG_NAME_NOT_UNIQUE` | `tag_name_conflict` | spec `tag_name_conflict`（spec 文言一致） |
| MergeOwnerMismatch | `TAG_MERGE_OWNER_MISMATCH` | `tag_owner_mismatch` | spec `tag_owner_mismatch` |
| MergeSameTag | `TAG_MERGE_SAME_TAG` | `tag_merge_same` | spec `tag_merge_same` |

備考: `NameNotUnique` は property key 不変で value のみ `tag_name_conflict` に変更。

---

## view

| property | 現状値 | 新値 | spec 根拠 |
|---|---|---|---|
| InvalidId | `VIEW_INVALID_ID` | `view_invalid_id` | spec 無し |
| NameEmpty | `VIEW_NAME_EMPTY` | `view_name_empty` | spec 無し |
| NameTooLong | `VIEW_NAME_TOO_LONG` | `view_name_too_long` | spec 無し |
| NameConflict | `VIEW_NAME_CONFLICT` | `saved_view_name_conflict` | spec `saved_view_name_conflict` |
| InvalidKind | `VIEW_INVALID_KIND` | `view_invalid_kind` | spec 無し |
| InvalidDisplayMode | `VIEW_INVALID_DISPLAY_MODE` | `view_invalid_display_mode` | spec 無し |
| InvalidCalendarDateKey | `VIEW_INVALID_CALENDAR_DATE_KEY` | `view_invalid_calendar_date_key` | spec 無し |
| InvalidSortBy | `VIEW_INVALID_SORT_BY` | `view_invalid_sort_by` | spec 無し |
| InvalidSortDirection | `VIEW_INVALID_SORT_DIRECTION` | `view_invalid_sort_direction` | spec 無し |
| InvalidBrokenMarkerKind | `VIEW_INVALID_BROKEN_MARKER_KIND` | `view_invalid_broken_marker_kind` | spec 無し |
| KeywordTooLong | `VIEW_KEYWORD_TOO_LONG` | `view_keyword_too_long` | spec 無し |
| KeywordEmpty | `VIEW_KEYWORD_EMPTY` | `view_keyword_empty` | spec 無し |
| InvalidDateRange | `VIEW_INVALID_DATE_RANGE` | `view_invalid_date_range` | spec 無し |

---

## 規約違反検出（参考）

新値がすべて以下の正規表現を満たすことを `errorCodeNaming.test.ts` で検証:

- value: `/^[a-z][a-z0-9_]*$/`
- key: `/^[A-Z][A-Za-z0-9]*$/`
