import {SetupValidationError} from '../lib/errors.mjs'

export const MANAGED_KAVITA_BASE_URL = 'http://noona-kavita:5000'
export const MANAGED_KAVITA_TARGET_SERVICES = Object.freeze(['noona-portal', 'noona-raven', 'noona-komf'])
export const MANAGED_KAVITA_STAGE_READY = 'ready'
export const MANAGED_KAVITA_STAGE_API_KEY_REQUIRED = 'api-key-required'
export const MANAGED_KAVITA_API_KEY_REQUIRED_MESSAGE =
    'Kavita is ready, but Noona still needs an admin-capable API key before it can finish wiring the remaining services.'

const MANAGED_KAVITA_CREATE_ADMIN_MESSAGE =
    'Kavita is installed. Open Kavita, create the first admin account, then create an admin-capable API key and paste it into Moon.'
const MANAGED_KAVITA_SERVICE_ACCOUNT_KEY = 'setup.managedKavitaServiceAccount'
const MANAGED_KAVITA_VAULT_WARMUP_ERROR_CODES = new Set(['ENOENT', 'EACCES', 'EPERM'])

const normalizeString = (value) => {
    if (typeof value !== 'string') {
        return ''
    }

    return value.trim()
}

const normalizeUnmaskedSecret = (value) => {
    const normalized = normalizeString(value)
    return normalized && normalized !== '********' ? normalized : ''
}

export const normalizeManagedServiceList = (values) => {
    const out = []
    const seen = new Set()

    for (const value of Array.isArray(values) ? values : []) {
        const normalized = normalizeString(value)
        if (!normalized || !MANAGED_KAVITA_TARGET_SERVICES.includes(normalized) || seen.has(normalized)) {
            continue
        }

        seen.add(normalized)
        out.push(normalized)
    }

    return out
}

const normalizeEnvMap = (value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {}
    }

    const out = {}
    for (const [key, entry] of Object.entries(value)) {
        const normalizedKey = normalizeString(key)
        if (!normalizedKey) {
            continue
        }

        out[normalizedKey] = entry == null ? '' : String(entry)
    }

    return out
}

const resolveManagedKavitaEnvKey = (serviceName) => {
    switch (serviceName) {
        case 'noona-portal':
        case 'noona-raven':
            return 'KAVITA_API_KEY'
        case 'noona-komf':
            return 'KOMF_KAVITA_API_KEY'
        default:
            return null
    }
}

const resolveManagedKavitaBaseUrlKey = (serviceName) => {
    switch (serviceName) {
        case 'noona-portal':
        case 'noona-raven':
            return 'KAVITA_BASE_URL'
        case 'noona-komf':
            return 'KOMF_KAVITA_BASE_URI'
        default:
            return null
    }
}

const buildManagedKavitaEnvPatch = (serviceName, env, apiKey, baseUrl) => {
    switch (serviceName) {
        case 'noona-portal':
            return {
                KAVITA_BASE_URL: baseUrl,
                KAVITA_API_KEY: apiKey,
            }
        case 'noona-raven':
            return {
                KAVITA_BASE_URL: baseUrl,
                KAVITA_API_KEY: apiKey,
                KAVITA_LIBRARY_ROOT: normalizeString(env.KAVITA_LIBRARY_ROOT) || '/manga',
            }
        case 'noona-komf':
            return {
                KOMF_KAVITA_BASE_URI: baseUrl,
                KOMF_KAVITA_API_KEY: apiKey,
            }
        default:
            return {}
    }
}

const normalizeErrorMessage = (error) => {
    if (error == null) {
        return ''
    }

    return error instanceof Error ? error.message : String(error)
}

const readErrorCode = (error) =>
    error && typeof error === 'object' && typeof error.code === 'string'
        ? error.code
        : ''

const isManagedKavitaVaultWarmupError = (error) => {
    const code = readErrorCode(error)
    if (MANAGED_KAVITA_VAULT_WARMUP_ERROR_CODES.has(code)) {
        return true
    }

    const message = normalizeErrorMessage(error)
    if (/VAULT_CA_CERT_PATH is required/i.test(message)) {
        return true
    }

    if (/The configured Vault CA file could not be read/i.test(message)) {
        return true
    }

    if (/Unable to read Vault CA certificate .*?(ENOENT|EACCES|EPERM|no such file or directory|permission denied)/i.test(message)) {
        return true
    }

    return /All Vault endpoints failed:/i.test(message)
        && /VAULT_CA_CERT_PATH|Vault CA certificate|ca-cert\.pem|ENOENT|EACCES|EPERM|no such file or directory|permission denied/i.test(message)
}

const loadManagedKavitaStoredSettings = async ({
                                                   logger = {},
                                                   serviceName = 'noona-sage',
                                                   settingsCollection,
                                                   vaultClient,
                                               } = {}) => {
    if (!vaultClient?.mongo?.findOne || !settingsCollection) {
        return null
    }

    try {
        return await vaultClient.mongo.findOne(settingsCollection, {
            key: MANAGED_KAVITA_SERVICE_ACCOUNT_KEY,
        })
    } catch (error) {
        const message = normalizeErrorMessage(error)
        if (isManagedKavitaVaultWarmupError(error)) {
            logger.debug?.(
                `[${serviceName}] Vault TLS not ready yet; managed Kavita settings are using the warm-up fallback: ${message}`,
            )
            return null
        }

        throw error
    }
}

const persistManagedKavitaStoredSettings = async ({
                                                      apiKey,
                                                      logger = {},
                                                      serviceName = 'noona-sage',
                                                      settingsCollection,
                                                      vaultClient,
                                                  } = {}) => {
    if (!vaultClient?.mongo?.update || !settingsCollection) {
        return false
    }

    const now = new Date().toISOString()
    try {
        await vaultClient.mongo.update(
            settingsCollection,
            {key: MANAGED_KAVITA_SERVICE_ACCOUNT_KEY},
            {
                $set: {
                    key: MANAGED_KAVITA_SERVICE_ACCOUNT_KEY,
                    value: {
                        apiKey,
                        updatedAt: now,
                    },
                    updatedAt: now,
                },
                $setOnInsert: {
                    createdAt: now,
                },
            },
            {upsert: true},
        )
        return true
    } catch (error) {
        const message = normalizeErrorMessage(error)
        if (isManagedKavitaVaultWarmupError(error)) {
            logger.debug?.(
                `[${serviceName}] Vault TLS not ready yet; managed Kavita settings will be mirrored after warm-up: ${message}`,
            )
            return false
        }

        logger.warn?.(
            `[${serviceName}] Unable to persist managed Kavita API key: ${message}`,
        )
        return false
    }
}

const readManagedKavitaSettings = (doc) => {
    const value = doc?.value && typeof doc.value === 'object' ? doc.value : doc
    return {
        apiKey: normalizeUnmaskedSecret(value?.apiKey),
    }
}

const buildManagedKavitaResponse = ({
                                        stage = MANAGED_KAVITA_STAGE_API_KEY_REQUIRED,
                                        adminExists = null,
                                        error = '',
                                        services = [],
                                        apiKey = null,
                                        baseUrl = MANAGED_KAVITA_BASE_URL,
                                        hostServiceUrl = '',
                                        mode = '',
                                        updatedServices = [],
                                    } = {}) => {
    const normalizedStage =
        normalizeString(stage) === MANAGED_KAVITA_STAGE_READY
            ? MANAGED_KAVITA_STAGE_READY
            : MANAGED_KAVITA_STAGE_API_KEY_REQUIRED

    return {
        apiKey: normalizeUnmaskedSecret(apiKey) || null,
        baseUrl: normalizeString(baseUrl) || MANAGED_KAVITA_BASE_URL,
        hostServiceUrl: normalizeString(hostServiceUrl) || null,
        mode: normalizeString(mode) || null,
        services: normalizeManagedServiceList(services),
        updatedServices: Array.isArray(updatedServices) ? updatedServices : [],
        adminExists: typeof adminExists === 'boolean' ? adminExists : null,
        stage: normalizedStage,
        manualFallbackRequired: normalizedStage !== MANAGED_KAVITA_STAGE_READY,
        error:
            normalizeString(error)
            || (normalizedStage === MANAGED_KAVITA_STAGE_READY
                ? null
                : MANAGED_KAVITA_API_KEY_REQUIRED_MESSAGE),
    }
}

const readManagedKavitaAdminExists = async (managedKavitaSetupClient) => {
    if (typeof managedKavitaSetupClient?.adminExists !== 'function') {
        return null
    }

    return managedKavitaSetupClient.adminExists()
}

const findValidManagedKavitaApiKey = async ({
                                                candidateApiKeys = [],
                                                managedKavitaSetupClient,
                                            } = {}) => {
    if (typeof managedKavitaSetupClient?.validateApiKey !== 'function') {
        return null
    }

    const seen = new Set()
    for (const candidate of Array.isArray(candidateApiKeys) ? candidateApiKeys : []) {
        const apiKey = normalizeUnmaskedSecret(candidate?.apiKey ?? candidate?.key)
        if (!apiKey || seen.has(apiKey)) {
            continue
        }

        seen.add(apiKey)
        const authenticatedUser = await managedKavitaSetupClient.validateApiKey({
            apiKey,
            ...(normalizeString(candidate?.pluginName) ? {pluginName: normalizeString(candidate.pluginName)} : {}),
        })

        if (!authenticatedUser) {
            continue
        }

        return {
            apiKey,
            source: normalizeString(candidate?.source) || 'existing',
            user: authenticatedUser,
        }
    }

    return null
}

const resolveManagedKavitaSyncContext = async ({
                                                   body = {},
                                                   logger = {},
                                                   managedKavitaSetupClient,
                                                   serviceName = 'noona-sage',
                                                   settingsCollection,
                                                   setupClient,
                                                   vaultClient,
                                                   defaultServices = MANAGED_KAVITA_TARGET_SERVICES,
                                                   requireServices = true,
                                               } = {}) => {
    const targetServices = normalizeManagedServiceList(
        body?.services?.length > 0 ? body.services : defaultServices,
    )
    if (requireServices && targetServices.length === 0) {
        throw new SetupValidationError('Select at least one managed service to receive the Kavita API key.')
    }

    const requestedApiKey = normalizeUnmaskedSecret(body?.apiKey)
    const [managedKavitaConfig, targetConfigs] = await Promise.all([
        setupClient.getServiceConfig('noona-kavita', {includeSecrets: true}),
        Promise.all(
            targetServices.map(async (name) => [name, await setupClient.getServiceConfig(name, {includeSecrets: true})]),
        ),
    ])
    const configs = new Map(targetConfigs)
    const storedSettings = await loadManagedKavitaStoredSettings({
        vaultClient,
        settingsCollection,
        logger,
        serviceName,
    })
    const {apiKey: storedApiKey} = readManagedKavitaSettings(storedSettings)
    const candidateApiKeys = []

    for (const targetServiceName of targetServices) {
        const env = normalizeEnvMap(configs.get(targetServiceName)?.env)
        const keyName = resolveManagedKavitaEnvKey(targetServiceName)
        const existingKey = keyName ? normalizeUnmaskedSecret(env[keyName]) : ''
        if (!existingKey) {
            continue
        }

        candidateApiKeys.push({
            key: existingKey,
            source: 'existing',
            pluginName: targetServiceName,
        })
    }

    if (storedApiKey) {
        candidateApiKeys.push({
            key: storedApiKey,
            source: 'stored',
            pluginName: 'noona-sage',
        })
    }

    return {
        targetServices,
        requestedApiKey,
        managedKavitaConfig,
        configs,
        candidateApiKeys,
        hostServiceUrl: normalizeString(managedKavitaConfig?.hostServiceUrl),
        adminExists: await readManagedKavitaAdminExists(managedKavitaSetupClient),
    }
}

const buildManagedKavitaPendingMessage = (adminExists) =>
    adminExists === false ? MANAGED_KAVITA_CREATE_ADMIN_MESSAGE : MANAGED_KAVITA_API_KEY_REQUIRED_MESSAGE

export const getManagedKavitaServiceKeyStatus = async ({
                                                           body = {},
                                                           logger = {},
                                                           managedKavitaSetupClient,
                                                           serviceName = 'noona-sage',
                                                           settingsCollection,
                                                           setupClient,
                                                           vaultClient,
                                                       } = {}) => {
    const context = await resolveManagedKavitaSyncContext({
        body,
        logger,
        managedKavitaSetupClient,
        serviceName,
        settingsCollection,
        setupClient,
        vaultClient,
        requireServices: false,
    })

    const reusableKey = await findValidManagedKavitaApiKey({
        candidateApiKeys: context.candidateApiKeys,
        managedKavitaSetupClient,
    })
    if (reusableKey) {
        return buildManagedKavitaResponse({
            stage: MANAGED_KAVITA_STAGE_READY,
            adminExists: true,
            services: context.targetServices,
            apiKey: reusableKey.apiKey,
            baseUrl: MANAGED_KAVITA_BASE_URL,
            hostServiceUrl: context.hostServiceUrl,
            mode: reusableKey.source,
        })
    }

    return buildManagedKavitaResponse({
        stage: MANAGED_KAVITA_STAGE_API_KEY_REQUIRED,
        adminExists: context.adminExists,
        services: context.targetServices,
        baseUrl: MANAGED_KAVITA_BASE_URL,
        hostServiceUrl: context.hostServiceUrl,
        mode: 'manual',
        error: buildManagedKavitaPendingMessage(context.adminExists),
    })
}

export const syncManagedKavitaServiceKey = async ({
                                                      body = {},
                                                      logger = {},
                                                      managedKavitaSetupClient,
                                                      serviceName = 'noona-sage',
                                                      settingsCollection,
                                                      setupClient,
                                                      vaultClient,
                                                  } = {}) => {
    const context = await resolveManagedKavitaSyncContext({
        body,
        logger,
        managedKavitaSetupClient,
        serviceName,
        settingsCollection,
        setupClient,
        vaultClient,
    })

    if (!context.requestedApiKey) {
        throw new SetupValidationError('Paste an admin-capable Kavita API key before saving.')
    }

    if (typeof managedKavitaSetupClient?.validateApiKey !== 'function') {
        throw new Error('Managed Kavita API key validation is not configured.')
    }

    const authenticatedUser = await managedKavitaSetupClient.validateApiKey({
        apiKey: context.requestedApiKey,
    })
    if (!authenticatedUser) {
        throw new SetupValidationError(
            'Kavita rejected that API key. Paste an admin-capable Kavita API key and try again.',
        )
    }

    const updatedServices = []
    for (const targetServiceName of context.targetServices) {
        const currentConfig = context.configs.get(targetServiceName)
        const env = normalizeEnvMap(currentConfig?.env)
        const patch = buildManagedKavitaEnvPatch(targetServiceName, env, context.requestedApiKey, MANAGED_KAVITA_BASE_URL)
        const response = await setupClient.updateServiceConfig(targetServiceName, {
            env: patch,
            restart: true,
        })

        updatedServices.push({
            name: targetServiceName,
            baseUrl: normalizeString(patch[resolveManagedKavitaBaseUrlKey(targetServiceName) ?? '']) || MANAGED_KAVITA_BASE_URL,
            apiKeyField: resolveManagedKavitaEnvKey(targetServiceName),
            restarted: Boolean(response?.restarted),
        })
    }

    await setupClient.updateServiceConfig('noona-kavita', {
        env: {
            NOONA_BOOTSTRAP_ADMIN_ON_START: 'false',
            NOONA_SOCIAL_LOGIN_ONLY: 'true',
        },
        restart: true,
    })

    await persistManagedKavitaStoredSettings({
        apiKey: context.requestedApiKey,
        vaultClient,
        settingsCollection,
        logger,
        serviceName,
    })

    return buildManagedKavitaResponse({
        stage: MANAGED_KAVITA_STAGE_READY,
        adminExists: true,
        apiKey: context.requestedApiKey,
        baseUrl: MANAGED_KAVITA_BASE_URL,
        hostServiceUrl: context.hostServiceUrl,
        mode: 'manual',
        services: context.targetServices,
        updatedServices,
    })
}

export default syncManagedKavitaServiceKey
