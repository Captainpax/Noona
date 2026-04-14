const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '');

const normalizeUrl = (value) => {
    const trimmed = normalizeString(value);
    if (!trimmed) {
        return null;
    }

    try {
        return new URL(trimmed);
    } catch {
        return null;
    }
};

const normalizeEnvMap = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }

    return Object.fromEntries(
        Object.entries(value)
            .map(([key, entry]) => [normalizeString(key), entry == null ? '' : String(entry)])
            .filter(([key]) => Boolean(key)),
    );
};

const parseResponsePayload = async (response) => {
    const text = await response.text().catch(() => '');
    if (!text.trim()) {
        return null;
    }

    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
};

const createLogger = (logger = {}) => ({
    warn: typeof logger?.warn === 'function' ? logger.warn.bind(logger) : (message) => process.stderr.write(`${message}\n`),
});

export const mergeServiceRuntimeEnv = (config = {}) => ({
    ...normalizeEnvMap(config?.env),
    ...normalizeEnvMap(config?.runtimeConfig?.env),
});

export async function loadServiceRuntimeConfig({
                                                   serviceName = process.env.SERVICE_NAME,
                                                   baseUrl = process.env.WARDEN_BASE_URL,
                                                   token = process.env.WARDEN_API_TOKEN,
                                                   fetchImpl = globalThis.fetch,
                                                   logger = {},
                                               } = {}) {
    const resolvedServiceName = normalizeString(serviceName);
    const resolvedToken = normalizeString(token);
    const resolvedBaseUrl = normalizeUrl(baseUrl);
    const log = createLogger(logger);

    if (!resolvedServiceName || !resolvedBaseUrl || !resolvedToken || typeof fetchImpl !== 'function') {
        return {
            applied: false,
            env: {},
            hostPort: null,
            serviceName: resolvedServiceName || null,
            reason: 'disabled',
        };
    }

    const requestUrl = new URL(
        `/api/services/${encodeURIComponent(resolvedServiceName)}/config?includeSecrets=true`,
        resolvedBaseUrl,
    );

    try {
        const response = await fetchImpl(requestUrl.toString(), {
            method: 'GET',
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${resolvedToken}`,
            },
        });
        const payload = await parseResponsePayload(response);

        if (!response.ok) {
            const detail =
                payload && typeof payload === 'object' && typeof payload.error === 'string'
                    ? payload.error
                    : `HTTP ${response.status}`;
            log.warn(`[${resolvedServiceName}] Failed to restore runtime config from Warden: ${detail}`);
            return {
                applied: false,
                env: {},
                hostPort: null,
                serviceName: resolvedServiceName,
                reason: 'http-error',
                status: response.status,
            };
        }

        const nextEnv = mergeServiceRuntimeEnv(payload);
        for (const [key, value] of Object.entries(nextEnv)) {
            process.env[key] = value;
        }

        return {
            applied: Object.keys(nextEnv).length > 0,
            env: nextEnv,
            hostPort:
                payload && typeof payload === 'object' && payload?.runtimeConfig && typeof payload.runtimeConfig === 'object'
                    ? payload.runtimeConfig.hostPort ?? null
                    : null,
            serviceName: resolvedServiceName,
            reason: 'loaded',
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.warn(`[${resolvedServiceName}] Unable to reach Warden for runtime config restore: ${message}`);
        return {
            applied: false,
            env: {},
            hostPort: null,
            serviceName: resolvedServiceName,
            reason: 'unavailable',
            error: message,
        };
    }
}

export default loadServiceRuntimeConfig;
