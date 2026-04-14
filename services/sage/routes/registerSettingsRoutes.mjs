// services/sage/routes/registerSettingsRoutes.mjs

import {WardenUpstreamHttpError} from '../app/createSetupClient.mjs'
import {SetupValidationError} from '../lib/errors.mjs'

const sendSetupClientUpstreamError = (res, error) => {
    if (!(error instanceof WardenUpstreamHttpError)) {
        return false
    }

    const payload =
        error.payload && typeof error.payload === 'object' && !Array.isArray(error.payload)
            ? error.payload
            : {error: error.message}

    res.status(Number.isInteger(error.status) ? error.status : 502).json(payload)
    return true
}

const resolveActionResult = async (action, fallbackStatus, payloadFactory) => {
    const result = await action()
    if (result && typeof result === 'object' && 'status' in result && 'payload' in result) {
        return result
    }

    const payload = result ?? payloadFactory()
    const status = payload && typeof payload === 'object' && payload.ok === false ? 200 : fallbackStatus
    return {status, payload}
}

const trimString = (value) => (typeof value === 'string' ? value.trim() : '')

const didVpnConnectionSettingsChange = (current = {}, next = {}) =>
    Boolean(current?.enabled) !== Boolean(next?.enabled)
    || trimString(current?.region).toLowerCase() !== trimString(next?.region).toLowerCase()
    || trimString(current?.piaUsername) !== trimString(next?.piaUsername)
    || trimString(current?.piaPassword) !== trimString(next?.piaPassword)

const shouldApplyDisabledVpnSettings = (status = null) => {
    if (!status || typeof status !== 'object') {
        return true
    }

    const connectionState = trimString(status?.connectionState).toLowerCase()
    return status?.connected === true
        || status?.rotating === true
        || connectionState !== 'disabled'
}

const buildSavedVpnSettingsResponse = (sanitizeDownloadVpnSettingsForResponse, settings, extras = {}) => ({
    ...sanitizeDownloadVpnSettingsForResponse(settings),
    ...extras,
})

const resolveVpnActionErrorPayload = (result, fallbackError) => {
    const payload = result?.payload
    return {
        error:
            trimString(payload?.error)
            || trimString(payload?.message)
            || trimString(fallbackError)
            || 'Unable to apply Raven VPN settings.',
        message: trimString(payload?.message) || null,
        status: Number.isInteger(result?.status) ? result.status : 502,
    }
}

export function registerSettingsRoutes(context = {}) {
    const {
        app,
        applyDebugSetting,
        DEFAULT_DISCORD_CHAPTER_NOTIFICATION_SETTINGS,
        DEFAULT_DISCORD_ONBOARDING_MESSAGE_SETTINGS,
        DEFAULT_DOWNLOAD_LIMITS_SETTINGS,
        DEFAULT_DOWNLOAD_VPN_SETTINGS,
        DEFAULT_DOWNLOAD_WORKER_SETTINGS,
        DEFAULT_NAMING_SETTINGS,
        logger,
        normalizeString,
        parseBooleanInput,
        portalClient,
        queueEcosystemRestart,
        ravenClient,
        readDiscordChapterNotificationSettings,
        readDiscordOnboardingMessageSetting,
        readDownloadLimitsSettings,
        readDownloadWorkerSettings,
        readDownloadVpnSettings,
        readDebugSetting,
        readNamingSettings,
        requireAdminSession,
        requireAdminSessionIfSetupCompleted,
        requireSession,
        resolveDangerousActionConfirmation,
        resolveBaseRedirectUrl,
        sanitizeDownloadVpnSettingsForResponse,
        serviceName,
        settingsCollection,
        setupClient,
        validateOverallSpeedLimitInput,
        validateCpuCoreIdsInput,
        validateThreadRateLimitsInput,
        vaultClient,
        vaultErrorMessage,
        vaultErrorStatus,
        verifyDangerousActionConfirmation,
        verifyFactoryResetSelections,
        writeDiscordOnboardingMessageSetting,
        writeDiscordChapterNotificationSettings,
        writeDownloadLimitsSettings,
        writeDownloadWorkerSettings,
        writeDownloadVpnSettings,
        writeNamingSettings,
    } = context

    const buildDiscordOnboardingMessageResponse = (setting = {}) => ({
        key: setting?.key || DEFAULT_DISCORD_ONBOARDING_MESSAGE_SETTINGS.key,
        template:
            typeof setting?.template === 'string' && setting.template.trim()
                ? setting.template
                : DEFAULT_DISCORD_ONBOARDING_MESSAGE_SETTINGS.template,
        channelId:
            typeof setting?.channelId === 'string' && setting.channelId.trim()
                ? setting.channelId.trim()
                : DEFAULT_DISCORD_ONBOARDING_MESSAGE_SETTINGS.channelId,
        inviteUrl:
            typeof setting?.inviteUrl === 'string' && setting.inviteUrl.trim()
                ? setting.inviteUrl.trim()
                : DEFAULT_DISCORD_ONBOARDING_MESSAGE_SETTINGS.inviteUrl,
        updatedAt: setting?.updatedAt || null,
    })

    const buildDiscordChapterNotificationResponse = (setting = {}) => ({
        key: setting?.key || DEFAULT_DISCORD_CHAPTER_NOTIFICATION_SETTINGS.key,
        enabled: setting?.enabled === true,
        channelId:
            typeof setting?.channelId === 'string' && setting.channelId.trim()
                ? setting.channelId.trim()
                : DEFAULT_DISCORD_CHAPTER_NOTIFICATION_SETTINGS.channelId,
        updatedAt: setting?.updatedAt || null,
        lastAnnouncedAt: setting?.lastAnnouncedAt || null,
        announcementCount:
            Number.isFinite(Number(setting?.announcementCount)) && Number(setting?.announcementCount) >= 0
                ? Math.floor(Number(setting?.announcementCount))
                : 0,
    })

    const buildDiscordInviteResponse = (setting = {}) => ({
        inviteUrl:
            typeof setting?.inviteUrl === 'string' && setting.inviteUrl.trim()
                ? setting.inviteUrl.trim()
                : DEFAULT_DISCORD_ONBOARDING_MESSAGE_SETTINGS.inviteUrl,
    })

    app.use('/api/settings', requireAdminSessionIfSetupCompleted)

    app.get('/api/discord/invite', async (req, res) => {
        const session = await requireSession(req, res)
        if (!session) return

        try {
            const setting = await readDiscordOnboardingMessageSetting()
            res.json(buildDiscordInviteResponse(setting))
        } catch (error) {
            logger.error(`[${serviceName}] Failed to load Discord invite URL: ${error.message}`)
            res.status(502).json({error: 'Unable to load Discord invite URL.'})
        }
    })

    app.get('/api/settings/debug', async (_req, res) => {
        if (!vaultClient?.mongo?.findOne) {
            res.status(503).json({error: 'Vault storage is not configured.'})
            return
        }

        try {
            const setting = await readDebugSetting()
            res.json(setting)
        } catch (error) {
            logger.error(`[${serviceName}] ⚠️ Failed to load debug setting: ${error.message}`)
            res.status(502).json({error: 'Unable to load debug setting.'})
        }
    })

    app.put('/api/settings/debug', async (req, res) => {
        const session = await requireAdminSession(req, res)
        if (!session) return

        const enabled = parseBooleanInput(req.body?.enabled)
        if (enabled == null) {
            res.status(400).json({error: 'enabled must be a boolean value.'})
            return
        }

        try {
            const setting = await applyDebugSetting(enabled)
            res.json(setting)
        } catch (error) {
            logger.error(`[${serviceName}] ⚠️ Failed to update debug setting: ${error.message}`)
            const message = error instanceof Error ? error.message : 'Unable to update debug setting.'
            res.status(502).json({error: message})
        }
    })

    app.get('/api/settings/discord/onboarding-message', async (_req, res) => {
        if (!vaultClient?.mongo?.findOne) {
            res.status(503).json({error: 'Vault storage is not configured.'})
            return
        }

        try {
            const setting = await readDiscordOnboardingMessageSetting()
            res.json(buildDiscordOnboardingMessageResponse(setting))
        } catch (error) {
            logger.error(`[${serviceName}] Failed to load Discord onboarding message: ${error.message}`)
            res.status(502).json({error: 'Unable to load Discord onboarding message.'})
        }
    })

    app.put('/api/settings/discord/onboarding-message', async (req, res) => {
        if (!vaultClient?.mongo?.update) {
            res.status(503).json({error: 'Vault storage is not configured.'})
            return
        }

        if (typeof req.body?.template !== 'string' || !req.body.template.trim()) {
            res.status(400).json({error: 'template must not be empty.'})
            return
        }

        try {
            const setting = await writeDiscordOnboardingMessageSetting(
                req.body.template,
                req.body?.channelId,
                req.body?.inviteUrl,
            )
            res.json(buildDiscordOnboardingMessageResponse(setting))
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to update Discord onboarding message.'
            const status =
                message === 'template must not be empty.' || message === 'inviteUrl must be a valid absolute HTTP or HTTPS URL.'
                    ? 400
                    : 502
            logger.error(`[${serviceName}] Failed to update Discord onboarding message: ${message}`)
            res.status(status).json({error: message})
        }
    })

    app.post('/api/settings/discord/onboarding-message/test', async (req, res) => {
        const channelId = trimString(req.body?.channelId)
        const content = typeof req.body?.content === 'string' ? req.body.content : ''

        if (!channelId) {
            res.status(400).json({error: 'channelId must not be empty.'})
            return
        }

        if (!content.trim()) {
            res.status(400).json({error: 'content must not be empty.'})
            return
        }

        if (!portalClient?.sendDiscordOnboardingTestMessage) {
            res.status(503).json({error: 'Portal Discord messaging is not configured.'})
            return
        }

        try {
            const result = await resolveActionResult(
                () => portalClient.sendDiscordOnboardingTestMessage({channelId, content}),
                200,
                () => ({ok: true, channelId}),
            )
            res.status(result.status).json(result.payload)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to send Discord onboarding test message.'
            logger.error(`[${serviceName}] Failed to send Discord onboarding test message: ${message}`)
            res.status(502).json({error: message})
        }
    })

    app.get('/api/settings/discord/chapter-notifications', async (_req, res) => {
        if (!vaultClient?.mongo?.findOne) {
            res.status(503).json({error: 'Vault storage is not configured.'})
            return
        }

        try {
            const setting = await readDiscordChapterNotificationSettings()
            res.json(buildDiscordChapterNotificationResponse(setting))
        } catch (error) {
            logger.error(`[${serviceName}] Failed to load Discord chapter notification settings: ${error.message}`)
            res.status(502).json({error: 'Unable to load Discord chapter notification settings.'})
        }
    })

    app.put('/api/settings/discord/chapter-notifications', async (req, res) => {
        if (!vaultClient?.mongo?.update) {
            res.status(503).json({error: 'Vault storage is not configured.'})
            return
        }

        try {
            const setting = await writeDiscordChapterNotificationSettings(req.body ?? {})
            res.json(buildDiscordChapterNotificationResponse(setting))
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to update Discord chapter notification settings.'
            const status =
                message === 'enabled must be a boolean value.'
                || message === 'channelId must not be empty when Discord chapter posts are enabled.'
                    ? 400
                    : 502
            logger.error(`[${serviceName}] Failed to update Discord chapter notification settings: ${message}`)
            res.status(status).json({error: message})
        }
    })

    app.get('/api/settings/downloads/limits', async (_req, res) => {
        if (!vaultClient?.mongo?.findOne) {
            res.status(503).json({error: 'Vault storage is not configured.'})
            return
        }

        try {
            const settings = await readDownloadLimitsSettings()
            res.json({
                key: settings?.key || DEFAULT_DOWNLOAD_LIMITS_SETTINGS.key,
                overallSpeedLimitKbps:
                    Number.isFinite(Number(settings?.overallSpeedLimitKbps))
                        ? Math.max(0, Math.floor(Number(settings.overallSpeedLimitKbps)))
                        : DEFAULT_DOWNLOAD_LIMITS_SETTINGS.overallSpeedLimitKbps,
                updatedAt: settings?.updatedAt || null,
            })
        } catch (error) {
            logger.error(`[${serviceName}] Failed to load download limits: ${error.message}`)
            res.status(502).json({error: 'Unable to load download limits.'})
        }
    })

    app.put('/api/settings/downloads/limits', async (req, res) => {
        if (!vaultClient?.mongo?.update) {
            res.status(503).json({error: 'Vault storage is not configured.'})
            return
        }

        const parsedOverallSpeedLimit = validateOverallSpeedLimitInput(req.body?.overallSpeedLimitKbps)
        if (!parsedOverallSpeedLimit.ok) {
            res.status(400).json({error: parsedOverallSpeedLimit.error})
            return
        }

        try {
            const settings = await writeDownloadLimitsSettings(parsedOverallSpeedLimit.overallSpeedLimitKbps)
            res.json({
                key: settings?.key || DEFAULT_DOWNLOAD_LIMITS_SETTINGS.key,
                overallSpeedLimitKbps:
                    Number.isFinite(Number(settings?.overallSpeedLimitKbps))
                        ? Math.max(0, Math.floor(Number(settings.overallSpeedLimitKbps)))
                        : DEFAULT_DOWNLOAD_LIMITS_SETTINGS.overallSpeedLimitKbps,
                updatedAt: settings?.updatedAt || null,
            })
        } catch (error) {
            logger.error(`[${serviceName}] Failed to update download limits: ${error.message}`)
            res.status(502).json({error: 'Unable to update download limits.'})
        }
    })

    app.get('/api/settings/downloads/naming', async (_req, res) => {
        if (!vaultClient?.mongo?.findOne) {
            res.status(503).json({error: 'Vault storage is not configured.'})
            return
        }

        try {
            const settings = await readNamingSettings()
            res.json(settings)
        } catch (error) {
            logger.error(`[${serviceName}] ⚠️ Failed to load naming settings: ${error.message}`)
            res.status(502).json({error: 'Unable to load naming settings.'})
        }
    })

    app.put('/api/settings/downloads/naming', async (req, res) => {
        if (!vaultClient?.mongo?.update) {
            res.status(503).json({error: 'Vault storage is not configured.'})
            return
        }

        try {
            const settings = await writeNamingSettings(req.body ?? {})
            res.json(settings)
        } catch (error) {
            logger.error(`[${serviceName}] ⚠️ Failed to update naming settings: ${error.message}`)
            const message = error instanceof Error ? error.message : 'Unable to update naming settings.'
            const status = message === 'titleTemplate must not be empty.'
            || message === 'chapterTemplate must not be empty.'
            || message === 'pageTemplate must not be empty.' ? 400 : 502
            res.status(status).json({error: message})
        }
    })

    app.get('/api/settings/downloads/workers', async (_req, res) => {
        if (!vaultClient?.mongo?.findOne) {
            res.status(503).json({error: 'Vault storage is not configured.'})
            return
        }

        try {
            const settings = await readDownloadWorkerSettings()
            res.json({
                key: settings?.key || DEFAULT_DOWNLOAD_WORKER_SETTINGS.key,
                threadRateLimitsKbps: Array.isArray(settings?.threadRateLimitsKbps) ? settings.threadRateLimitsKbps : [],
                cpuCoreIds: Array.isArray(settings?.cpuCoreIds) ? settings.cpuCoreIds : [],
                updatedAt: settings?.updatedAt || null,
            })
        } catch (error) {
            logger.error(`[${serviceName}] Failed to load download worker settings: ${error.message}`)
            res.status(502).json({error: 'Unable to load download worker settings.'})
        }
    })

    app.put('/api/settings/downloads/workers', async (req, res) => {
        if (!vaultClient?.mongo?.update) {
            res.status(503).json({error: 'Vault storage is not configured.'})
            return
        }

        const parsedThreadRateLimits = validateThreadRateLimitsInput(req.body?.threadRateLimitsKbps)
        if (!parsedThreadRateLimits.ok) {
            res.status(400).json({error: parsedThreadRateLimits.error})
            return
        }
        const parsedCpuCoreIds = validateCpuCoreIdsInput(req.body?.cpuCoreIds)
        if (!parsedCpuCoreIds.ok) {
            res.status(400).json({error: parsedCpuCoreIds.error})
            return
        }

        try {
            const settings = await writeDownloadWorkerSettings(
                parsedThreadRateLimits.threadRateLimitsKbps,
                parsedCpuCoreIds.cpuCoreIds,
            )
            res.json({
                key: settings?.key || DEFAULT_DOWNLOAD_WORKER_SETTINGS.key,
                threadRateLimitsKbps: Array.isArray(settings?.threadRateLimitsKbps) ? settings.threadRateLimitsKbps : [],
                cpuCoreIds: Array.isArray(settings?.cpuCoreIds) ? settings.cpuCoreIds : [],
                updatedAt: settings?.updatedAt || null,
            })
        } catch (error) {
            logger.error(`[${serviceName}] Failed to update download worker settings: ${error.message}`)
            res.status(502).json({error: 'Unable to update download worker settings.'})
        }
    })

    app.get('/api/settings/downloads/vpn', async (_req, res) => {
        if (!vaultClient?.mongo?.findOne) {
            res.status(503).json({error: 'Vault storage is not configured.'})
            return
        }

        try {
            const settings = await readDownloadVpnSettings()
            const safe = sanitizeDownloadVpnSettingsForResponse(settings)

            let status = null
            try {
                if (ravenClient?.getVpnStatus) {
                    status = await ravenClient.getVpnStatus()
                }
            } catch (error) {
                logger.warn(`[${serviceName}] Failed to fetch Raven VPN status: ${error.message}`)
            }

            res.json({
                ...safe,
                status,
            })
        } catch (error) {
            logger.error(`[${serviceName}] Failed to load VPN settings: ${error.message}`)
            res.status(502).json({error: 'Unable to load VPN settings.'})
        }
    })

    app.put('/api/settings/downloads/vpn', async (req, res) => {
        if (!vaultClient?.mongo?.update) {
            res.status(503).json({error: 'Vault storage is not configured.'})
            return
        }

        try {
            const currentSettings = await readDownloadVpnSettings()
            const settings = await writeDownloadVpnSettings(req.body ?? {})
            const applyNow = parseBooleanInput(req.body?.applyNow) === true
            const triggeredBy =
                typeof req.body?.triggeredBy === 'string' && req.body.triggeredBy.trim()
                    ? req.body.triggeredBy.trim()
                    : 'manual'
            const connectionSettingsChanged = didVpnConnectionSettingsChange(currentSettings, settings)

            let vpnStatus = null
            if (applyNow && settings.enabled === true && !connectionSettingsChanged && typeof ravenClient?.getVpnStatus === 'function') {
                try {
                    vpnStatus = await ravenClient.getVpnStatus()
                } catch (error) {
                    logger.warn(`[${serviceName}] Failed to fetch Raven VPN status before applying saved settings: ${error.message}`)
                }
            }
            if (applyNow && settings.enabled !== true && typeof ravenClient?.getVpnStatus === 'function') {
                try {
                    vpnStatus = await ravenClient.getVpnStatus()
                } catch (error) {
                    logger.warn(`[${serviceName}] Failed to fetch Raven VPN status before disabling saved settings: ${error.message}`)
                }
            }

            const applyTriggered =
                settings.enabled === true
                    ? (
                        applyNow
                        && (connectionSettingsChanged || (vpnStatus && vpnStatus.connected !== true))
                    )
                    : (
                        applyNow
                        && shouldApplyDisabledVpnSettings(vpnStatus)
                    )

            if (!applyTriggered) {
                res.json(buildSavedVpnSettingsResponse(
                    sanitizeDownloadVpnSettingsForResponse,
                    settings,
                    {applyTriggered: false},
                ))
                return
            }

            if (
                settings.enabled === true
                    ? (!ravenClient?.rotateVpnNow && !ravenClient?.rotateVpnNowDetailed)
                    : (!ravenClient?.disableVpnNow && !ravenClient?.disableVpnNowDetailed)
            ) {
                res.status(503).json(buildSavedVpnSettingsResponse(
                    sanitizeDownloadVpnSettingsForResponse,
                    settings,
                    {
                        applyTriggered: true,
                        error: settings.enabled === true
                            ? 'Raven VPN API is unavailable.'
                            : 'Raven VPN disable API is unavailable.',
                    },
                ))
                return
            }

            const result =
                settings.enabled === true
                    ? (
                        typeof ravenClient?.rotateVpnNowDetailed === 'function'
                            ? await ravenClient.rotateVpnNowDetailed(triggeredBy)
                            : await resolveActionResult(
                                () => ravenClient.rotateVpnNow(triggeredBy),
                                202,
                                () => ({ok: false, error: 'Raven VPN rotation did not return a payload.'}),
                            )
                    )
                    : (
                        typeof ravenClient?.disableVpnNowDetailed === 'function'
                            ? await ravenClient.disableVpnNowDetailed(triggeredBy)
                            : await resolveActionResult(
                                () => ravenClient.disableVpnNow(triggeredBy),
                                200,
                                () => ({ok: false, error: 'Raven VPN disable did not return a payload.'}),
                            )
                    )
            const resultStatus = Number.isInteger(result?.status) ? result.status : 502
            const payload = result?.payload ?? null
            const applyFailed = resultStatus >= 400 || (payload && typeof payload === 'object' && payload.ok === false)
            if (applyFailed) {
                const failure = resolveVpnActionErrorPayload(
                    result,
                    settings.enabled === true
                        ? 'Unable to apply Raven VPN settings.'
                        : 'Unable to disable Raven VPN.',
                )
                res.status(failure.status).json(buildSavedVpnSettingsResponse(
                    sanitizeDownloadVpnSettingsForResponse,
                    settings,
                    {
                        applyTriggered: true,
                        error: failure.error,
                        message: failure.message,
                    },
                ))
                return
            }

            res.json(buildSavedVpnSettingsResponse(
                sanitizeDownloadVpnSettingsForResponse,
                settings,
                {applyTriggered: true},
            ))
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to update VPN settings.'
            const status = error instanceof SetupValidationError || message.includes('required') ? 400 : 502
            logger.error(`[${serviceName}] Failed to update VPN settings: ${message}`)
            res.status(status).json({error: message})
        }
    })

    app.get('/api/settings/downloads/vpn/regions', async (_req, res) => {
        try {
            if (!ravenClient?.getVpnRegions && !ravenClient?.getVpnRegionsDetailed) {
                res.json({provider: DEFAULT_DOWNLOAD_VPN_SETTINGS.provider, regions: []})
                return
            }

            let provider = DEFAULT_DOWNLOAD_VPN_SETTINGS.provider
            let regions = []
            let diagnostic = ''

            if (typeof ravenClient?.getVpnRegionsDetailed === 'function') {
                const payload = await ravenClient.getVpnRegionsDetailed()
                provider = normalizeString(payload?.provider).trim() || provider
                regions = Array.isArray(payload?.regions) ? payload.regions : []
                diagnostic = normalizeString(payload?.error).trim()
            } else {
                const payload = await ravenClient.getVpnRegions()
                regions = Array.isArray(payload) ? payload : []
            }

            if (regions.length === 0 && !diagnostic && typeof ravenClient?.getVpnStatus === 'function') {
                try {
                    const status = await ravenClient.getVpnStatus()
                    diagnostic = normalizeString(status?.lastError).trim()
                } catch (error) {
                    logger.warn(`[${serviceName}] Failed to fetch Raven VPN status for region diagnostics: ${error.message}`)
                }
            }

            const payload = {
                provider,
                regions: Array.isArray(regions) ? regions : [],
            }
            if (diagnostic) {
                payload.error = diagnostic
            }
            res.json(payload)
        } catch (error) {
            logger.error(`[${serviceName}] Failed to fetch VPN regions: ${error.message}`)
            res.status(502).json({error: 'Unable to load VPN regions.'})
        }
    })

    app.post('/api/settings/downloads/vpn/rotate', async (req, res) => {
        if (!vaultClient?.mongo?.update) {
            res.status(503).json({error: 'Vault storage is not configured.'})
            return
        }

        try {
            await writeDownloadVpnSettings(req.body ?? {})
            if (!ravenClient?.rotateVpnNow && !ravenClient?.rotateVpnNowDetailed) {
                res.status(503).json({error: 'Raven VPN API is unavailable.'})
                return
            }

            const triggeredBy = typeof req.body?.triggeredBy === 'string' && req.body.triggeredBy.trim()
                ? req.body.triggeredBy.trim()
                : 'manual'
            const result = typeof ravenClient?.rotateVpnNowDetailed === 'function'
                ? await ravenClient.rotateVpnNowDetailed(triggeredBy)
                : await resolveActionResult(
                    () => ravenClient.rotateVpnNow(triggeredBy),
                    202,
                    () => ({ok: false, error: 'Raven VPN rotation did not return a payload.'}),
                )
            const payload = result?.payload ?? null
            const status = Number.isInteger(result?.status)
                ? result.status
                : (payload && typeof payload === 'object' && payload.ok === false ? 200 : 202)
            res.status(status).json(payload ?? {ok: false, error: 'Raven VPN rotation did not return a payload.'})
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Unable to trigger VPN rotation.'
            const status = error instanceof SetupValidationError || message.includes('required') ? 400 : 502
            logger.error(`[${serviceName}] Failed to trigger VPN rotation: ${message}`)
            res.status(status).json({error: message})
        }
    })

    app.post('/api/settings/downloads/vpn/test-login', async (req, res) => {
        try {
            if (!ravenClient?.testVpnLogin) {
                res.status(503).json({error: 'Raven VPN API is unavailable.'})
                return
            }

            const currentSettings = await readDownloadVpnSettings()
            const requestRegion = normalizeString(req.body?.region)
            const requestPiaUsername = normalizeString(req.body?.piaUsername)
            const requestPiaPassword = normalizeString(req.body?.piaPassword)
            const savedRegion = normalizeString(currentSettings?.region)
            const savedPiaUsername = normalizeString(currentSettings?.piaUsername)
            const savedPiaPassword = normalizeString(currentSettings?.piaPassword)
            const resolvedPiaUsername = requestPiaUsername || savedPiaUsername
            const resolvedPiaPassword =
                !requestPiaPassword || requestPiaPassword === '********'
                    ? savedPiaPassword
                    : requestPiaPassword

            if (!resolvedPiaUsername || !resolvedPiaPassword) {
                res.status(400).json({error: 'PIA username and password are required to test VPN login.'})
                return
            }

            const result = typeof ravenClient?.testVpnLoginDetailed === 'function'
                ? await ravenClient.testVpnLoginDetailed({
                    triggeredBy:
                        typeof req.body?.triggeredBy === 'string' && req.body.triggeredBy.trim()
                            ? req.body.triggeredBy.trim()
                            : 'manual',
                    region: requestRegion || savedRegion,
                    piaUsername: resolvedPiaUsername,
                    piaPassword: resolvedPiaPassword,
                })
                : await resolveActionResult(
                    () => ravenClient.testVpnLogin({
                        triggeredBy:
                            typeof req.body?.triggeredBy === 'string' && req.body.triggeredBy.trim()
                                ? req.body.triggeredBy.trim()
                                : 'manual',
                        region: requestRegion || savedRegion,
                        piaUsername: resolvedPiaUsername,
                        piaPassword: resolvedPiaPassword,
                    }),
                    200,
                    () => ({ok: false, message: 'Raven VPN login test did not return a payload.'}),
                )

            const payload = result?.payload ?? null
            const status = Number.isInteger(result?.status)
                ? result.status
                : 200
            res.status(status).json(payload ?? {ok: false, message: 'Raven VPN login test did not return a payload.'})
        } catch (error) {
            logger.error(`[${serviceName}] Failed to test VPN login: ${error.message}`)
            res.status(502).json({error: 'Unable to test VPN login.'})
        }
    })

    app.get('/api/settings/services', async (_req, res) => {
        try {
            const services = await setupClient.listServices({includeInstalled: true})
            res.json({services: Array.isArray(services) ? services : []})
        } catch (error) {
            logger.error(`[${serviceName}] ⚠️ Failed to load service settings catalog: ${error.message}`)
            if (sendSetupClientUpstreamError(res, error)) {
                return
            }

            res.status(502).json({error: 'Unable to load service settings.'})
        }
    })

    app.get('/api/settings/services/updates', async (_req, res) => {
        try {
            const updates = await setupClient.listServiceUpdates()
            res.json({updates: Array.isArray(updates) ? updates : []})
        } catch (error) {
            logger.error(`[${serviceName}] ⚠️ Failed to list service updates: ${error.message}`)
            if (sendSetupClientUpstreamError(res, error)) {
                return
            }

            res.status(502).json({error: 'Unable to load service updates.'})
        }
    })

    app.post('/api/settings/services/updates/check', async (req, res) => {
        const services = Array.isArray(req.body?.services) ? req.body.services : null

        try {
            const updates = await setupClient.checkServiceUpdates(services)
            res.json({updates: Array.isArray(updates) ? updates : []})
        } catch (error) {
            logger.error(`[${serviceName}] ⚠️ Failed to check service updates: ${error.message}`)
            if (sendSetupClientUpstreamError(res, error)) {
                return
            }

            res.status(502).json({error: 'Unable to check service updates.'})
        }
    })

    app.get('/api/settings/services/:name/config', async (req, res) => {
        const name = typeof req.params?.name === 'string' ? req.params.name.trim() : ''
        if (!name) {
            res.status(400).json({error: 'Service name is required.'})
            return
        }

        try {
            const config = await setupClient.getServiceConfig(name)
            res.json(config ?? {})
        } catch (error) {
            if (sendSetupClientUpstreamError(res, error)) {
                return
            }

            const message = error instanceof SetupValidationError ? error.message : 'Unable to load service config.'
            const status = error instanceof SetupValidationError ? 400 : 502
            logger.error(`[${serviceName}] ⚠️ Failed to load service config for ${name}: ${error.message}`)
            res.status(status).json({error: message})
        }
    })

    app.put('/api/settings/services/:name/config', async (req, res) => {
        const name = typeof req.params?.name === 'string' ? req.params.name.trim() : ''
        if (!name) {
            res.status(400).json({error: 'Service name is required.'})
            return
        }

        try {
            const result = await setupClient.updateServiceConfig(name, req.body ?? {})
            res.json(result ?? {})
        } catch (error) {
            if (sendSetupClientUpstreamError(res, error)) {
                return
            }

            const message = error instanceof SetupValidationError ? error.message : 'Unable to update service config.'
            const status = error instanceof SetupValidationError ? 400 : 502
            logger.error(`[${serviceName}] ⚠️ Failed to update service config for ${name}: ${error.message}`)
            res.status(status).json({error: message})
        }
    })

    app.post('/api/settings/services/:name/restart', async (req, res) => {
        const name = typeof req.params?.name === 'string' ? req.params.name.trim() : ''
        if (!name) {
            res.status(400).json({error: 'Service name is required.'})
            return
        }

        try {
            const result = await setupClient.restartService(name)
            res.json(result ?? {})
        } catch (error) {
            if (sendSetupClientUpstreamError(res, error)) {
                return
            }

            const message = error instanceof SetupValidationError ? error.message : 'Unable to restart service.'
            const status = error instanceof SetupValidationError ? 400 : 502
            logger.error(`[${serviceName}] ⚠️ Failed to restart service ${name}: ${error.message}`)
            res.status(status).json({error: message})
        }
    })

    app.post('/api/settings/services/:name/update-image', async (req, res) => {
        const name = typeof req.params?.name === 'string' ? req.params.name.trim() : ''
        if (!name) {
            res.status(400).json({error: 'Service name is required.'})
            return
        }

        try {
            const result = await setupClient.updateServiceImage(name, req.body ?? {})
            res.json(result ?? {})
        } catch (error) {
            if (sendSetupClientUpstreamError(res, error)) {
                return
            }

            const message = error instanceof SetupValidationError ? error.message : 'Unable to update service image.'
            const status = error instanceof SetupValidationError ? 400 : 502
            logger.error(`[${serviceName}] ⚠️ Failed to update service image for ${name}: ${error.message}`)
            res.status(status).json({error: message})
        }
    })

    app.post('/api/settings/ecosystem/start', async (req, res) => {
        try {
            const result = await setupClient.startEcosystem(req.body ?? {})
            res.json(result ?? {})
        } catch (error) {
            logger.error(`[${serviceName}] Failed to start ecosystem: ${error.message}`)
            if (sendSetupClientUpstreamError(res, error)) {
                return
            }

            res.status(502).json({error: 'Unable to start ecosystem.'})
        }
    })

    app.post('/api/settings/ecosystem/stop', async (req, res) => {
        try {
            const result = await setupClient.stopEcosystem(req.body ?? {})
            res.json(result ?? {})
        } catch (error) {
            logger.error(`[${serviceName}] Failed to stop ecosystem: ${error.message}`)
            if (sendSetupClientUpstreamError(res, error)) {
                return
            }

            res.status(502).json({error: 'Unable to stop ecosystem.'})
        }
    })

    app.post('/api/settings/ecosystem/restart', async (req, res) => {
        try {
            const result = await setupClient.restartEcosystem(req.body ?? {})
            res.json(result ?? {})
        } catch (error) {
            logger.error(`[${serviceName}] Failed to restart ecosystem: ${error.message}`)
            if (sendSetupClientUpstreamError(res, error)) {
                return
            }

            res.status(502).json({error: 'Unable to restart ecosystem.'})
        }
    })

    app.post('/api/settings/factory-reset', async (req, res) => {
        const session = await requireAdminSession(req, res)
        if (!session) return

        if (!vaultClient?.mongo?.wipe || !vaultClient?.redis?.wipe) {
            res.status(503).json({error: 'Vault wipe operations are not configured.'})
            return
        }

        const confirmationRequirement = resolveDangerousActionConfirmation(session)
        const confirmation =
            typeof req.body?.confirmation === 'string'
                ? req.body.confirmation
                : typeof req.body?.password === 'string'
                    ? req.body.password
                    : ''
        if (!confirmation.trim()) {
            res.status(400).json({
                error:
                    confirmationRequirement.mode === 'password'
                        ? 'password is required.'
                        : 'confirmation is required.',
            })
            return
        }

        const deleteRavenDownloads = parseBooleanInput(req.body?.deleteRavenDownloads) === true
        const deleteDockers = parseBooleanInput(req.body?.deleteDockers) === true

        try {
            const confirmed = await verifyDangerousActionConfirmation({session, confirmation})
            if (!confirmed) {
                res.status(401).json({
                    error:
                        confirmationRequirement.mode === 'password'
                            ? 'Invalid password.'
                            : 'Confirmation did not match the current Discord account.',
                })
                return
            }

            await vaultClient.mongo.wipe()
            await vaultClient.redis.wipe()

            const runFactoryReset =
                typeof setupClient?.factoryResetEcosystem === 'function'
                    ? () => setupClient.factoryResetEcosystem({
                        deleteRavenDownloads,
                        deleteDockers,
                        setupCompleted: false,
                        forceFull: false,
                    })
                    : null

            if (!runFactoryReset) {
                throw new Error('Warden factory reset endpoint is unavailable.')
            }

            const resetResult = await runFactoryReset()
            const verificationFailures = verifyFactoryResetSelections({
                result: resetResult,
                deleteRavenDownloads,
                deleteDockers,
            })
            if (verificationFailures.length > 0) {
                throw new Error(`Factory reset completed with cleanup errors: ${verificationFailures.join(' ')}`)
            }

            res.status(202).json({
                ok: true,
                restartQueued: true,
                deleteRavenDownloads,
                deleteDockers,
                redirectTo: resolveBaseRedirectUrl(),
                result: resetResult ?? null,
            })
        } catch (error) {
            logger.error(`[${serviceName}] Failed to run factory reset: ${error.message}`)
            const status = vaultErrorStatus(error, 502)
            const message = vaultErrorMessage(error, 'Unable to run factory reset.')
            res.status(status).json({error: message})
        }
    })

    app.get('/api/settings/vault/collections', async (_req, res) => {
        if (!vaultClient?.mongo?.listCollections) {
            res.status(503).json({error: 'Vault collection viewer is not configured.'})
            return
        }

        try {
            const collections = await vaultClient.mongo.listCollections()
            res.json({collections: Array.isArray(collections) ? collections : []})
        } catch (error) {
            logger.error(`[${serviceName}] Failed to load Vault collections: ${error.message}`)
            const status = vaultErrorStatus(error, 502)
            const message = vaultErrorMessage(error, 'Unable to load Vault collections.')
            res.status(status).json({error: message})
        }
    })

    app.get('/api/settings/vault/collections/:name/documents', async (req, res) => {
        if (!vaultClient?.mongo?.findMany) {
            res.status(503).json({error: 'Vault collection viewer is not configured.'})
            return
        }

        const name = typeof req.params?.name === 'string' ? req.params.name.trim() : ''
        if (!name) {
            res.status(400).json({error: 'Collection name is required.'})
            return
        }

        const rawLimit = Number(req.query?.limit)
        const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(200, Math.floor(rawLimit))) : 50

        try {
            const documents = await vaultClient.mongo.findMany(name, {})
            const list = Array.isArray(documents) ? documents.slice(0, limit) : []
            res.json({collection: name, limit, documents: list})
        } catch (error) {
            logger.error(`[${serviceName}] Failed to load Vault documents for ${name}: ${error.message}`)
            const status = vaultErrorStatus(error, 502)
            const message = vaultErrorMessage(error, 'Unable to load Vault collection documents.')
            res.status(status).json({error: message})
        }
    })

    app.post('/api/settings/vault/wipe', async (req, res) => {
        const session = await requireAdminSession(req, res)
        if (!session) return

        if (!vaultClient?.mongo?.wipe || !vaultClient?.redis?.wipe) {
            res.status(503).json({error: 'Vault wipe operations are not configured.'})
            return
        }

        const target = normalizeString(req.body?.target).toLowerCase()
        if (target !== 'mongo' && target !== 'redis') {
            res.status(400).json({error: 'target must be either "mongo" or "redis".'})
            return
        }

        const restartRaw = parseBooleanInput(req.body?.restart)
        const shouldRestart = restartRaw == null ? true : restartRaw

        const confirmationRequirement = resolveDangerousActionConfirmation(session)
        const confirmation =
            typeof req.body?.confirmation === 'string'
                ? req.body.confirmation
                : typeof req.body?.password === 'string'
                    ? req.body.password
                    : ''
        if (!confirmation.trim()) {
            res.status(400).json({
                error:
                    confirmationRequirement.mode === 'password'
                        ? 'password is required.'
                        : 'confirmation is required.',
            })
            return
        }

        try {
            const confirmed = await verifyDangerousActionConfirmation({session, confirmation})
            if (!confirmed) {
                res.status(401).json({
                    error:
                        confirmationRequirement.mode === 'password'
                            ? 'Invalid password.'
                            : 'Confirmation did not match the current Discord account.',
                })
                return
            }

            if (target === 'mongo') {
                await vaultClient.mongo.wipe()
            } else {
                await vaultClient.redis.wipe()
            }

            if (shouldRestart) {
                queueEcosystemRestart({trackedOnly: false, forceFull: true})
            }

            res.status(202).json({
                ok: true,
                target,
                restartQueued: shouldRestart,
                redirectTo: resolveBaseRedirectUrl(),
            })
        } catch (error) {
            logger.error(`[${serviceName}] Failed to wipe ${target}: ${error.message}`)
            const status = vaultErrorStatus(error, 502)
            const message = vaultErrorMessage(error, `Unable to wipe ${target}.`)
            res.status(status).json({error: message})
        }
    })
}

export default registerSettingsRoutes
