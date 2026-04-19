const MANAGED_KAVITA_RECOVERY_SERVICE_SET = new Set(['noona-portal', 'noona-raven', 'noona-komf'])

export const MANAGED_KAVITA_RECOVERY_STAGE_READY = 'ready'
export const MANAGED_KAVITA_RECOVERY_STAGE_API_KEY_REQUIRED = 'api-key-required'
export const MANAGED_KAVITA_API_KEY_REQUIRED_MESSAGE =
    'Kavita is ready, but Noona still needs an admin-capable API key before it can finish wiring the remaining services.'

const normalizeString = (value) => (typeof value === 'string' ? value.trim() : '')

export const normalizeManagedKavitaRecoveryServices = (values) => {
    const out = []
    const seen = new Set()

    for (const value of Array.isArray(values) ? values : []) {
        const normalized = normalizeString(value)
        if (!normalized || !MANAGED_KAVITA_RECOVERY_SERVICE_SET.has(normalized) || seen.has(normalized)) {
            continue
        }

        seen.add(normalized)
        out.push(normalized)
    }

    return out
}

export const normalizeManagedKavitaRecoveryStage = (value) => {
    const normalized = normalizeString(value)
    if (
        normalized === MANAGED_KAVITA_RECOVERY_STAGE_READY
        || normalized === MANAGED_KAVITA_RECOVERY_STAGE_API_KEY_REQUIRED
    ) {
        return normalized
    }

    return ''
}

export const inferManagedKavitaRecoveryStageFromMessage = (value) => {
    const normalized = normalizeString(value).toLowerCase()
    if (!normalized) {
        return ''
    }

    if (
        normalized.includes('admin-capable api key')
        || normalized.includes('manual kavita setup')
        || normalized.includes('finish wiring')
        || normalized.includes('remaining services')
        || normalized.includes('finish setup in kavita')
        || normalized.includes('create the first admin')
        || normalized.includes('open kavita')
    ) {
        return MANAGED_KAVITA_RECOVERY_STAGE_API_KEY_REQUIRED
    }

    return ''
}

export const normalizeManagedKavitaRecoveryPayload = (
    payload,
    {fallbackServices = /** @type {string[]} */ ([])} = {},
) => {
    const stage =
        normalizeManagedKavitaRecoveryStage(payload?.stage)
        || inferManagedKavitaRecoveryStageFromMessage(payload?.error)
    const services = normalizeManagedKavitaRecoveryServices(payload?.services)
    const fallback = normalizeManagedKavitaRecoveryServices(fallbackServices)
    const resolvedServices = services.length > 0 ? services : fallback

    if (!stage && resolvedServices.length === 0 && !normalizeString(payload?.error)) {
        return null
    }

    return {
        stage: stage || MANAGED_KAVITA_RECOVERY_STAGE_API_KEY_REQUIRED,
        error: normalizeString(payload?.error) || MANAGED_KAVITA_API_KEY_REQUIRED_MESSAGE,
        services: resolvedServices,
        adminExists: typeof payload?.adminExists === 'boolean' ? payload.adminExists : null,
        baseUrl: normalizeString(payload?.baseUrl),
        hostServiceUrl: normalizeString(payload?.hostServiceUrl),
        manualFallbackRequired: true,
    }
}

export const resolveManagedKavitaRecoveryStateFromInstall = (
    source,
    {fallbackServices = /** @type {string[]} */ ([])} = {},
) => {
    const services = new Set()
    let message = ''
    let stage = ''
    const items = Array.isArray(source?.items) ? source.items : []

    for (const entry of Array.isArray(source?.results) ? source.results : []) {
        const name = normalizeString(entry?.name)
        const error = normalizeString(entry?.error)
        if (!MANAGED_KAVITA_RECOVERY_SERVICE_SET.has(name) || !error) {
            continue
        }

        services.add(name)
        message ||= error
        stage ||= inferManagedKavitaRecoveryStageFromMessage(error)
    }

    for (const item of items) {
        const name = normalizeString(item?.name)
        const detail = normalizeString(item?.detail)
        if (!MANAGED_KAVITA_RECOVERY_SERVICE_SET.has(name) || !detail) {
            continue
        }

        services.add(name)
        message ||= detail
        stage ||= inferManagedKavitaRecoveryStageFromMessage(detail)
    }

    if (!stage && items.length > 0) {
        const kavitaReady = items.some((item) =>
            normalizeString(item?.name) === 'noona-kavita'
            && normalizeString(item?.status).toLowerCase() === 'installed')
        const waitingTargets = items.filter((item) =>
            MANAGED_KAVITA_RECOVERY_SERVICE_SET.has(normalizeString(item?.name))
            && normalizeString(item?.status).toLowerCase() !== 'installed')

        if (kavitaReady && waitingTargets.length > 0) {
            stage = MANAGED_KAVITA_RECOVERY_STAGE_API_KEY_REQUIRED
            message = MANAGED_KAVITA_API_KEY_REQUIRED_MESSAGE
            for (const item of waitingTargets) {
                services.add(normalizeString(item?.name))
            }
        }
    }

    const resolvedServices = [...services]
    if (!stage && !message && resolvedServices.length === 0) {
        return null
    }

    return {
        stage: stage || MANAGED_KAVITA_RECOVERY_STAGE_API_KEY_REQUIRED,
        error: message || MANAGED_KAVITA_API_KEY_REQUIRED_MESSAGE,
        services:
            resolvedServices.length > 0
                ? resolvedServices
                : normalizeManagedKavitaRecoveryServices(fallbackServices),
        adminExists: null,
        baseUrl: '',
        hostServiceUrl: '',
        manualFallbackRequired: true,
    }
}

export const mergeManagedKavitaRecoveryState = (_current, incoming) => incoming || null

export const shouldPollManagedKavitaRecoveryStatus = ({
                                                          kavitaMode = 'external',
                                                          managedTargetServices = /** @type {string[]} */ ([]),
                                                          items = /** @type {Array<{name?: string, status?: string}>} */ ([]),
                                                      } = {}) => {
    if (kavitaMode !== 'managed') {
        return false
    }

    const targets = normalizeManagedKavitaRecoveryServices(managedTargetServices)
    if (targets.length === 0) {
        return false
    }

    const normalizedItems = Array.isArray(items) ? items : []
    const kavitaInstalled = normalizedItems.some((item) =>
        normalizeString(item?.name) === 'noona-kavita'
        && normalizeString(item?.status).toLowerCase() === 'installed')

    if (!kavitaInstalled) {
        return false
    }

    return normalizedItems.some((item) =>
        targets.includes(normalizeString(item?.name))
        && normalizeString(item?.status).toLowerCase() !== 'installed')
}
