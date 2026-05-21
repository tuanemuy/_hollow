export const AdminSettingsErrorCode = {
  InvalidUserId: "admin_settings_invalid_user_id",
  InvalidLLMProvider: "admin_settings_invalid_llm_provider",
  InvalidLLMModel: "admin_settings_invalid_llm_model",
  InvalidLLMModelTooLong: "admin_settings_invalid_llm_model_too_long",
  InvalidLLMApiKeySource: "admin_settings_invalid_llm_api_key_source",
  InvalidLLMApiKeyCiphertext: "admin_settings_invalid_llm_api_key_ciphertext",
  InvalidPromptPurpose: "admin_settings_invalid_prompt_purpose",
  PromptTemplateTooLarge: "admin_settings_prompt_template_too_large",
  PromptTemplateVariableMismatch:
    "admin_settings_prompt_template_variable_mismatch",
  PromptTemplateInvalidVariableName:
    "admin_settings_prompt_template_invalid_variable_name",
  InvalidDesignTokenKey: "admin_settings_invalid_design_token_key",
  InvalidDesignTokenValue: "admin_settings_invalid_design_token_value",
  DesignTokensTooMany: "admin_settings_design_tokens_too_many",
  InvalidRegistrationClosedReason:
    "admin_settings_invalid_registration_closed_reason",
  InvalidInstanceLimit: "admin_settings_invalid_instance_limit",
  EnvOverrideMissingKey: "admin_settings_env_override_missing_key",
} as const;

export type AdminSettingsErrorCode =
  (typeof AdminSettingsErrorCode)[keyof typeof AdminSettingsErrorCode];
