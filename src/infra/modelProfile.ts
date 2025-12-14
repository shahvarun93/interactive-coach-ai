export type ModelProfile = {
  contextWindowTokens: number;
  supportsTemperature: boolean; // for chat.completions usage
};

const DEFAULT_PROFILE: ModelProfile = {
  contextWindowTokens: 32000, // safe default
  supportsTemperature: true,
};

const PROFILES: Record<string, ModelProfile> = {
  "gpt-5": { contextWindowTokens: 128000, supportsTemperature: false },
};

export function getModelProfile(model: string): ModelProfile {
  const base = PROFILES[model] ?? DEFAULT_PROFILE;

  const cwEnv = Number(process.env.OPENAI_CONTEXT_WINDOW_TOKENS);
  const supportsTempEnv = process.env.OPENAI_SUPPORTS_TEMPERATURE;

  return {
    contextWindowTokens:
      Number.isFinite(cwEnv) && cwEnv > 0 ? cwEnv : base.contextWindowTokens,
    supportsTemperature:
      supportsTempEnv === "true"
        ? true
        : supportsTempEnv === "false"
        ? false
        : base.supportsTemperature,
  };
}
