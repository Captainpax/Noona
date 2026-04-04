const normalizeString = (value) => (typeof value === "string" ? value.trim() : "");

/**
 * Applies a selected Discord guild to the current Portal env draft.
 * If REQUIRED_GUILD_ID is blank or still matches the previous DISCORD_GUILD_ID,
 * keep it aligned with the newly selected guild. Custom overrides are preserved.
 *
 * @param {Record<string, string>} envDraft
 * @param {string} nextGuildId
 * @returns {Record<string, string>}
 */
export const applySelectedDiscordGuild = (envDraft = {}, nextGuildId = "") => {
    const resolvedGuildId = normalizeString(nextGuildId);
    if (!resolvedGuildId) {
        return {...envDraft};
    }

    const currentGuildId = normalizeString(envDraft.DISCORD_GUILD_ID);
    const currentRequiredGuildId = normalizeString(envDraft.REQUIRED_GUILD_ID);
    const nextEnvDraft = {
        ...envDraft,
        DISCORD_GUILD_ID: resolvedGuildId,
    };

    if (!currentRequiredGuildId || (currentGuildId && currentRequiredGuildId === currentGuildId)) {
        nextEnvDraft.REQUIRED_GUILD_ID = resolvedGuildId;
    }

    return nextEnvDraft;
};

/**
 * Applies client and guild values suggested by Discord validation without
 * overwriting intentional admin edits unless explicitly requested.
 *
 * @param {Record<string, string>} envDraft
 * @param {{clientId?: string | null, guildId?: string | null}} suggested
 * @param {{overwrite?: boolean}} options
 * @returns {Record<string, string>}
 */
export const applySuggestedDiscordValues = (
    envDraft = {},
    suggested = {},
    {overwrite = false} = {},
) => {
    const currentClientId = normalizeString(envDraft.DISCORD_CLIENT_ID);
    const currentGuildId = normalizeString(envDraft.DISCORD_GUILD_ID);
    const suggestedClientId = normalizeString(suggested?.clientId);
    const suggestedGuildId = normalizeString(suggested?.guildId);

    let nextEnvDraft = {...envDraft};

    if (suggestedClientId && (overwrite || !currentClientId)) {
        nextEnvDraft.DISCORD_CLIENT_ID = suggestedClientId;
    }

    if (suggestedGuildId && (overwrite || !currentGuildId)) {
        nextEnvDraft = applySelectedDiscordGuild(nextEnvDraft, suggestedGuildId);
    }

    return nextEnvDraft;
};

/**
 * Returns the current Discord guild/access-gate mismatch when present.
 *
 * @param {Record<string, string>} envDraft
 * @returns {{guildId: string, requiredGuildId: string} | null}
 */
export const getDiscordGuildGateMismatch = (envDraft = {}) => {
    const guildId = normalizeString(envDraft.DISCORD_GUILD_ID);
    const requiredGuildId = normalizeString(envDraft.REQUIRED_GUILD_ID);

    if (!guildId || !requiredGuildId || guildId === requiredGuildId) {
        return null;
    }

    return {
        guildId,
        requiredGuildId,
    };
};
