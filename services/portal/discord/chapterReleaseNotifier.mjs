/**
 * @fileoverview Polls Raven and Kavita to post grouped Discord chapter-release updates into a configured channel.
 * Related files:
 * - app/portalRuntime.mjs
 * - clients/ravenClient.mjs
 * - clients/kavitaClient.mjs
 * - tests/chapterReleaseNotifier.test.mjs
 * Times this file has been edited: 1
 */

const DEFAULT_SETTINGS_COLLECTION = 'noona_settings';
const SETTINGS_KEY = 'discord.chapter_notifications';
const DEFAULT_POLL_MS = 15 * 60 * 1000;
const MAX_STORED_CHAPTER_KEYS = 2000;
const MAX_SUMMARY_LENGTH = 320;
const MAX_CHAPTER_PREVIEW = 12;

const normalizeString = value => (typeof value === 'string' ? value.trim() : '');
const normalizeBoolean = value => {
    if (typeof value === 'boolean') {
        return value;
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
        if (value === 1) {
            return true;
        }
        if (value === 0) {
            return false;
        }
    }

    const normalized = normalizeString(value).toLowerCase();
    if (!normalized) {
        return false;
    }

    return normalized === 'true'
        || normalized === '1'
        || normalized === 'yes'
        || normalized === 'y'
        || normalized === 'on';
};
const normalizeChannelId = value => {
    const normalized = normalizeString(value);
    return /^\d{5,32}$/.test(normalized) ? normalized : '';
};
const normalizeTitleKey = value => normalizeString(value).toLowerCase().replace(/\s+/g, ' ').trim();
const normalizeUrlForCompare = value => {
    const normalized = normalizeString(value);
    if (!normalized) {
        return null;
    }

    try {
        const parsed = new URL(normalized);
        parsed.hash = '';
        return parsed.toString();
    } catch {
        return null;
    }
};
const normalizeCount = value => {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
};
const normalizeTimestamp = value => {
    const normalized = normalizeString(value);
    if (!normalized) {
        return null;
    }

    const parsed = Date.parse(normalized);
    return Number.isFinite(parsed) ? normalized : null;
};
const normalizeChapterNumbers = value =>
    Array.isArray(value)
        ? value.map(entry => normalizeString(entry)).filter(Boolean)
        : [];
const sortUniqueStrings = values => {
    const seen = new Set();
    const output = [];
    for (const value of values) {
        const normalized = normalizeString(value);
        if (!normalized || seen.has(normalized)) {
            continue;
        }

        seen.add(normalized);
        output.push(normalized);
    }

    return output;
};
const trimStoredChapterKeys = keys => {
    const normalized = sortUniqueStrings(keys);
    if (normalized.length <= MAX_STORED_CHAPTER_KEYS) {
        return normalized;
    }

    return normalized.slice(normalized.length - MAX_STORED_CHAPTER_KEYS);
};
const parseChapterNumber = value => {
    const normalized = normalizeString(value).toLowerCase().replace(/^chapter\s+/i, '');
    if (!normalized) {
        return Number.POSITIVE_INFINITY;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
};
const compareChapterValues = (left = '', right = '') => {
    const leftNumber = parseChapterNumber(left);
    const rightNumber = parseChapterNumber(right);
    if (leftNumber !== rightNumber) {
        return leftNumber - rightNumber;
    }

    return normalizeString(left).localeCompare(normalizeString(right));
};
const buildChapterNotificationKey = (task = {}, chapterNumber = '') => {
    const chapter = normalizeString(chapterNumber);
    if (!chapter) {
        return null;
    }

    const titleUuid = normalizeString(task?.titleUuid);
    if (titleUuid) {
        return `uuid:${titleUuid}:${chapter}`;
    }

    const sourceUrl = normalizeUrlForCompare(task?.sourceUrl);
    if (sourceUrl) {
        return `source:${sourceUrl}:${chapter}`;
    }

    const titleKey = normalizeTitleKey(task?.title);
    if (titleKey) {
        return `title:${titleKey}:${chapter}`;
    }

    return null;
};
const resolveTaskTimestamp = (task = {}) =>
    normalizeTimestamp(task?.completedAt)
    || normalizeTimestamp(task?.lastUpdated)
    || normalizeTimestamp(task?.startedAt)
    || normalizeTimestamp(task?.queuedAt)
    || null;
const resolveTaskTimestampValue = (task = {}) => {
    const timestamp = resolveTaskTimestamp(task);
    if (!timestamp) {
        return 0;
    }

    const parsed = Date.parse(timestamp);
    return Number.isFinite(parsed) ? parsed : 0;
};
const compareChapterEvents = (left = {}, right = {}) => {
    const leftTimestamp = Number(left.taskTimestamp) || 0;
    const rightTimestamp = Number(right.taskTimestamp) || 0;
    if (leftTimestamp !== rightTimestamp) {
        return leftTimestamp - rightTimestamp;
    }

    return compareChapterValues(left.chapterNumber, right.chapterNumber);
};
const collectPendingChapterEvents = ({
                                         activeDownloads = [],
                                         downloadHistory = [],
                                         sentChapterKeys = new Set(),
                                     } = {}) => {
    const tasks = [
        ...(Array.isArray(activeDownloads) ? activeDownloads : []),
        ...(Array.isArray(downloadHistory) ? downloadHistory : []),
    ];
    const byChapterKey = new Map();

    for (const task of tasks) {
        const chapterNumbers = normalizeChapterNumbers(task?.completedChapterNumbers);
        if (!chapterNumbers.length) {
            continue;
        }

        const taskTimestamp = resolveTaskTimestampValue(task);
        for (const chapterNumber of chapterNumbers) {
            const chapterKey = buildChapterNotificationKey(task, chapterNumber);
            if (!chapterKey || sentChapterKeys.has(chapterKey) || byChapterKey.has(chapterKey)) {
                continue;
            }

            byChapterKey.set(chapterKey, {
                chapterKey,
                chapterNumber,
                task,
                taskTimestamp,
            });
        }
    }

    return Array.from(byChapterKey.values()).sort(compareChapterEvents);
};
const getLibraryTitleName = entry => normalizeString(entry?.title ?? entry?.titleName);
const buildLibraryIndex = (library = []) => {
    const byUuid = new Map();
    const bySourceUrl = new Map();
    const byTitle = new Map();

    for (const entry of Array.isArray(library) ? library : []) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }

        const uuid = normalizeString(entry?.uuid);
        if (uuid && !byUuid.has(uuid)) {
            byUuid.set(uuid, entry);
        }

        const sourceUrl = normalizeUrlForCompare(entry?.sourceUrl);
        if (sourceUrl && !bySourceUrl.has(sourceUrl)) {
            bySourceUrl.set(sourceUrl, entry);
        }

        const titleKey = normalizeTitleKey(getLibraryTitleName(entry));
        if (titleKey && !byTitle.has(titleKey)) {
            byTitle.set(titleKey, entry);
        }
    }

    return {byUuid, bySourceUrl, byTitle};
};
const resolveLibraryEntryForTask = (index, task = {}) => {
    if (!index) {
        return null;
    }

    const titleUuid = normalizeString(task?.titleUuid);
    if (titleUuid && index.byUuid.has(titleUuid)) {
        return index.byUuid.get(titleUuid);
    }

    const sourceUrl = normalizeUrlForCompare(task?.sourceUrl);
    if (sourceUrl && index.bySourceUrl.has(sourceUrl)) {
        return index.bySourceUrl.get(sourceUrl);
    }

    const titleKey = normalizeTitleKey(task?.title);
    if (titleKey && index.byTitle.has(titleKey)) {
        return index.byTitle.get(titleKey);
    }

    return null;
};
const buildTitleGroupKey = ({task = {}, libraryEntry = null} = {}) => {
    const titleUuid = normalizeString(libraryEntry?.uuid) || normalizeString(task?.titleUuid);
    if (titleUuid) {
        return `uuid:${titleUuid}`;
    }

    const sourceUrl = normalizeUrlForCompare(libraryEntry?.sourceUrl || task?.sourceUrl);
    if (sourceUrl) {
        return `source:${sourceUrl}`;
    }

    const titleKey = normalizeTitleKey(getLibraryTitleName(libraryEntry) || task?.title);
    if (titleKey) {
        return `title:${titleKey}`;
    }

    return 'title:unknown';
};
const normalizeSummary = value => {
    const normalized = normalizeString(value).replace(/\s+/g, ' ').trim();
    if (!normalized) {
        return null;
    }

    if (normalized.length <= MAX_SUMMARY_LENGTH) {
        return normalized;
    }

    return `${normalized.slice(0, MAX_SUMMARY_LENGTH - 1).trimEnd()}…`;
};
const pickPreferredKavitaSeries = (series = [], titleName = '') => {
    const titleKey = normalizeTitleKey(titleName);
    if (!titleKey) {
        return series[0] ?? null;
    }

    for (const entry of series) {
        const nameKey = normalizeTitleKey(entry?.name);
        if (nameKey && nameKey === titleKey) {
            return entry;
        }
    }

    for (const entry of series) {
        const localizedKey = normalizeTitleKey(entry?.localizedName);
        const originalKey = normalizeTitleKey(entry?.originalName);
        if (localizedKey === titleKey || originalKey === titleKey) {
            return entry;
        }
    }

    return series[0] ?? null;
};
const normalizeSeriesInteger = value => {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
const buildKavitaSeriesUrl = ({baseUrl, series, fallbackUrl} = {}) => {
    const libraryId = normalizeSeriesInteger(series?.libraryId);
    const seriesId = normalizeSeriesInteger(series?.seriesId);
    const normalizedBase = normalizeString(baseUrl);
    if (normalizedBase && libraryId != null && seriesId != null) {
        try {
            return new URL(`/library/${libraryId}/series/${seriesId}`, normalizedBase).toString();
        } catch {
            // Fall back to the provided URL below.
        }
    }

    const normalizedFallback = normalizeString(fallbackUrl);
    return normalizedFallback || null;
};
const resolveKavitaTitleUrl = async ({
                                         kavitaClient,
                                         titleName,
                                         kavitaBaseUrl,
                                         logger = {},
                                     } = {}) => {
    const normalizedTitle = normalizeString(titleName);
    if (!normalizedTitle || typeof kavitaClient?.searchTitles !== 'function') {
        return null;
    }

    try {
        const payload = await kavitaClient.searchTitles(normalizedTitle);
        const series = Array.isArray(payload?.series) ? payload.series : [];
        if (!series.length) {
            return null;
        }

        const selectedSeries = pickPreferredKavitaSeries(series, normalizedTitle);
        if (!selectedSeries) {
            return null;
        }

        return buildKavitaSeriesUrl({
            baseUrl: kavitaBaseUrl || (typeof kavitaClient?.getBaseUrl === 'function' ? kavitaClient.getBaseUrl() : null),
            series: selectedSeries,
            fallbackUrl: selectedSeries?.url,
        });
    } catch (error) {
        logger.warn?.(`[Portal/Discord] Failed to resolve Kavita link for "${normalizedTitle}": ${error.message}`);
        return null;
    }
};
const groupChapterEventsByTitle = ({events = [], library = []} = {}) => {
    const libraryIndex = buildLibraryIndex(library);
    const groups = new Map();

    for (const event of Array.isArray(events) ? events : []) {
        const task = event?.task && typeof event.task === 'object' ? event.task : {};
        const libraryEntry = resolveLibraryEntryForTask(libraryIndex, task);
        const groupKey = buildTitleGroupKey({task, libraryEntry});
        const title = getLibraryTitleName(libraryEntry) || normalizeString(task?.title) || 'Downloaded title';
        const sourceUrl = normalizeUrlForCompare(libraryEntry?.sourceUrl || task?.sourceUrl) || null;
        const titleUuid = normalizeString(libraryEntry?.uuid) || normalizeString(task?.titleUuid) || null;
        const summary = normalizeSummary(libraryEntry?.summary || task?.summary);
        const taskTimestamp = Number(event?.taskTimestamp) || 0;

        if (!groups.has(groupKey)) {
            groups.set(groupKey, {
                groupKey,
                title,
                titleUuid,
                sourceUrl,
                summary,
                chapterKeys: [],
                chapterNumbers: [],
                latestTimestamp: taskTimestamp,
            });
        }

        const group = groups.get(groupKey);
        group.latestTimestamp = Math.max(group.latestTimestamp, taskTimestamp);
        if (!group.summary && summary) {
            group.summary = summary;
        }
        if (!group.titleUuid && titleUuid) {
            group.titleUuid = titleUuid;
        }
        if (!group.sourceUrl && sourceUrl) {
            group.sourceUrl = sourceUrl;
        }
        group.chapterKeys.push(event.chapterKey);
        group.chapterNumbers.push(event.chapterNumber);
    }

    return Array.from(groups.values())
        .map(group => ({
            ...group,
            chapterKeys: sortUniqueStrings(group.chapterKeys),
            chapterNumbers: sortUniqueStrings(group.chapterNumbers).sort(compareChapterValues),
        }))
        .sort((left, right) => {
            if (left.latestTimestamp !== right.latestTimestamp) {
                return left.latestTimestamp - right.latestTimestamp;
            }

            return normalizeString(left.title).localeCompare(normalizeString(right.title));
        });
};
const formatChapterLabel = (chapterNumber = '') => {
    const normalized = normalizeString(chapterNumber);
    if (!normalized) {
        return 'new chapter';
    }

    return /^chapter\b/i.test(normalized) ? normalized : `Chapter ${normalized}`;
};
const formatChapterList = (chapterNumbers = []) => {
    const resolved = normalizeChapterNumbers(chapterNumbers);
    if (resolved.length === 0) {
        return 'new chapters';
    }

    const labels = resolved.slice(0, MAX_CHAPTER_PREVIEW).map(formatChapterLabel);
    const remaining = resolved.length - labels.length;
    const suffix = remaining > 0 ? ` +${remaining} more` : '';
    return `${labels.join(', ')}${suffix}`;
};
const buildChapterReleaseMessage = ({group, kavitaUrl} = {}) => {
    const title = normalizeString(group?.title) || 'Downloaded title';
    const chapterNumbers = normalizeChapterNumbers(group?.chapterNumbers);
    const lines = [
        `**${title}**`,
        chapterNumbers.length === 1
            ? `New chapter downloaded: ${formatChapterLabel(chapterNumbers[0])}`
            : `New chapters downloaded: ${formatChapterList(chapterNumbers)}`,
    ];

    const summary = normalizeSummary(group?.summary);
    if (summary) {
        lines.push(`Summary: ${summary}`);
    }

    if (normalizeString(kavitaUrl)) {
        lines.push(`Read in Kavita: ${kavitaUrl}`);
    }

    return lines.join('\n');
};
const sendChannelMessage = async ({discordClient, channelId, content}) => {
    if (typeof discordClient?.sendChannelMessage === 'function') {
        return await discordClient.sendChannelMessage(channelId, {content});
    }

    const normalizedChannelId = normalizeChannelId(channelId);
    if (!normalizedChannelId) {
        throw new Error('Discord channel id is required to send a chapter release message.');
    }

    if (typeof discordClient?.client?.channels?.fetch !== 'function') {
        throw new Error('Discord channel client is not available.');
    }

    const channel = await discordClient.client.channels.fetch(normalizedChannelId);
    if (!channel || typeof channel.send !== 'function') {
        throw new Error('Discord channel could not receive messages.');
    }

    return await channel.send({content});
};
const normalizeSettings = (setting = {}) => ({
    key: SETTINGS_KEY,
    enabled: normalizeBoolean(setting?.enabled),
    channelId: normalizeChannelId(setting?.channelId),
    updatedAt: normalizeTimestamp(setting?.updatedAt),
    baselineCapturedAt: normalizeTimestamp(setting?.baselineCapturedAt),
    lastAnnouncedAt: normalizeTimestamp(setting?.lastAnnouncedAt),
    announcementCount: normalizeCount(setting?.announcementCount),
    sentChapterKeys: trimStoredChapterKeys(Array.isArray(setting?.sentChapterKeys) ? setting.sentChapterKeys : []),
});

/**
 * Creates chapter-release notifier.
 *
 * @param {object} options - Named function inputs.
 * @returns {*} The function result.
 */
export const createChapterReleaseNotifier = ({
                                                 discordClient,
                                                 vaultClient,
                                                 ravenClient,
                                                 kavitaClient,
                                                 settingsCollection = DEFAULT_SETTINGS_COLLECTION,
                                                 settingsKey = SETTINGS_KEY,
                                                 pollMs = DEFAULT_POLL_MS,
                                                 kavitaBaseUrl = null,
                                                 logger = {},
                                             } = {}) => {
    let intervalId = null;
    let running = false;
    let refreshPromise = null;

    const loadSettings = async () => {
        if (typeof vaultClient?.readSetting !== 'function') {
            return normalizeSettings({key: settingsKey});
        }

        try {
            const setting = await vaultClient.readSetting({
                collection: settingsCollection,
                key: settingsKey,
            });
            return normalizeSettings(setting);
        } catch (error) {
            logger.warn?.(`[Portal/Discord] Failed to load chapter-release settings: ${error.message}`);
            return normalizeSettings({key: settingsKey});
        }
    };

    const persistSettingsState = async (currentSettings, patch = {}) => {
        if (typeof vaultClient?.updateRecommendation !== 'function') {
            return false;
        }

        try {
            await vaultClient.updateRecommendation({
                collection: settingsCollection,
                query: {key: settingsKey},
                update: {
                    $set: {
                        key: settingsKey,
                        enabled: currentSettings.enabled,
                        channelId: currentSettings.channelId,
                        ...patch,
                    },
                },
                upsert: true,
            });
            return true;
        } catch (error) {
            logger.warn?.(`[Portal/Discord] Failed to persist chapter-release settings state: ${error.message}`);
            return false;
        }
    };

    const refresh = async () => {
        if (!running) {
            return;
        }

        if (refreshPromise) {
            await refreshPromise;
            return;
        }

        refreshPromise = (async () => {
            const settings = await loadSettings();
            if (!settings.enabled || !settings.channelId) {
                return;
            }

            const [activeDownloads, downloadHistory] = await Promise.all([
                typeof ravenClient?.getDownloadStatus === 'function'
                    ? ravenClient.getDownloadStatus().catch((error) => {
                        logger.warn?.(`[Portal/Discord] Failed to load Raven active downloads for chapter-release posts: ${error.message}`);
                        return [];
                    })
                    : [],
                typeof ravenClient?.getDownloadHistory === 'function'
                    ? ravenClient.getDownloadHistory().catch((error) => {
                        logger.warn?.(`[Portal/Discord] Failed to load Raven download history for chapter-release posts: ${error.message}`);
                        return [];
                    })
                    : [],
            ]);

            if (!settings.baselineCapturedAt) {
                const baselineEvents = collectPendingChapterEvents({
                    activeDownloads,
                    downloadHistory,
                    sentChapterKeys: new Set(),
                });
                await persistSettingsState(settings, {
                    baselineCapturedAt: new Date().toISOString(),
                    sentChapterKeys: trimStoredChapterKeys([
                        ...settings.sentChapterKeys,
                        ...baselineEvents.map(event => event.chapterKey),
                    ]),
                });
                return;
            }

            const sentChapterKeys = new Set(settings.sentChapterKeys);
            const pendingEvents = collectPendingChapterEvents({
                activeDownloads,
                downloadHistory,
                sentChapterKeys,
            });
            if (!pendingEvents.length) {
                return;
            }

            const library =
                typeof ravenClient?.getLibrary === 'function'
                    ? await ravenClient.getLibrary().catch((error) => {
                        logger.warn?.(`[Portal/Discord] Failed to load Raven library for chapter-release posts: ${error.message}`);
                        return [];
                    })
                    : [];
            const groupedEvents = groupChapterEventsByTitle({
                events: pendingEvents,
                library,
            });
            if (!groupedEvents.length) {
                return;
            }

            let messagesSent = 0;
            let lastAnnouncedAt = settings.lastAnnouncedAt;
            for (const group of groupedEvents) {
                const kavitaUrl = await resolveKavitaTitleUrl({
                    kavitaClient,
                    titleName: group.title,
                    kavitaBaseUrl,
                    logger,
                });
                const content = buildChapterReleaseMessage({
                    group,
                    kavitaUrl,
                });

                try {
                    await sendChannelMessage({
                        discordClient,
                        channelId: settings.channelId,
                        content,
                    });
                    for (const chapterKey of group.chapterKeys) {
                        sentChapterKeys.add(chapterKey);
                    }
                    messagesSent += 1;
                    lastAnnouncedAt = new Date().toISOString();
                } catch (error) {
                    logger.warn?.(`[Portal/Discord] Failed to send chapter-release message for "${group.title}": ${error.message}`);
                }
            }

            if (messagesSent === 0) {
                return;
            }

            await persistSettingsState(settings, {
                baselineCapturedAt: settings.baselineCapturedAt,
                lastAnnouncedAt,
                announcementCount: settings.announcementCount + messagesSent,
                sentChapterKeys: trimStoredChapterKeys(Array.from(sentChapterKeys)),
            });
        })();

        try {
            await refreshPromise;
        } finally {
            refreshPromise = null;
        }
    };

    return {
        start() {
            if (running) {
                return;
            }

            running = true;
            void refresh();
            intervalId = setInterval(() => {
                void refresh();
            }, Math.max(5000, Number(pollMs) || DEFAULT_POLL_MS));
            intervalId?.unref?.();
        },
        stop() {
            running = false;
            if (intervalId) {
                clearInterval(intervalId);
                intervalId = null;
            }
        },
        refresh,
    };
};

export default createChapterReleaseNotifier;
