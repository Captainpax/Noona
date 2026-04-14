export const VPN_WAIT_MESSAGE = "Waiting for Raven VPN connection before download starts.";
export const DOWNLOADS_CAROUSEL_LIMIT = Number.POSITIVE_INFINITY;
export const RECENT_HISTORY_WINDOW_MS = 24 * 60 * 60 * 1000;

export const normalizeString = (value) => (typeof value === "string" ? value : "");

export const normalizeNumberList = (value) => {
    if (!Array.isArray(value)) return [];
    return value
        .map((entry) => normalizeString(entry).trim())
        .filter(Boolean);
};

export const normalizeEpochMs = (value) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
        return 0;
    }

    return Math.trunc(value);
};

export const formatEpochMs = (value) => {
    const normalized = normalizeEpochMs(value);
    if (normalized <= 0) return "";
    return new Date(normalized).toLocaleString();
};

export const parseErrorMessage = (json, fallback) => {
    if (json && typeof json === "object" && typeof json.error === "string") {
        const message = normalizeString(json.error).trim();
        if (message) return message;
    }
    return fallback;
};

export const isVpnWaitingMessage = (value) =>
    normalizeString(value).trim().toLowerCase() === VPN_WAIT_MESSAGE.toLowerCase();

export const isTerminalStatus = (statusRaw) => {
    const status = normalizeString(statusRaw).trim().toLowerCase();
    return status === "completed"
        || status === "failed"
        || status === "error"
        || status === "paused"
        || status === "cancelled"
        || status === "canceled";
};

export const getTaskStatusRank = (statusRaw) => {
    const status = normalizeString(statusRaw).trim().toLowerCase();
    if (status === "downloading") return 0;
    if (status === "recovering") return 1;
    if (status === "queued") return 2;
    if (status === "interrupted") return 3;
    if (status === "paused") return 4;
    if (status === "completed") return 5;
    if (status === "failed" || status === "error") return 6;
    return 7;
};

export const getTaskStatusBadgeBackground = (statusRaw) => {
    const status = normalizeString(statusRaw).trim().toLowerCase();
    if (status === "completed") return "success-alpha-weak";
    if (status === "failed" || status === "interrupted") return "danger-alpha-weak";
    if (status === "paused") return "warning-alpha-weak";
    if (status === "recovering" || status === "downloading") return "brand-alpha-weak";
    return "neutral-alpha-weak";
};

export const getTaskProgressTone = (statusRaw) => {
    const status = normalizeString(statusRaw).trim().toLowerCase();
    if (status === "completed") return "success-strong";
    if (status === "failed" || status === "interrupted") return "danger-strong";
    if (status === "paused") return "warning-strong";
    if (status === "queued") return "neutral-strong";
    return "brand-strong";
};

const clampPercent = (value) => Math.min(100, Math.max(0, value));

export const buildTaskKey = (entry, fallbackIndex = 0) => {
    const taskId = normalizeString(entry?.taskId).trim();
    if (taskId) {
        return taskId;
    }

    const titleUuid = normalizeString(entry?.titleUuid).trim();
    const title = normalizeString(entry?.title).trim() || "untitled";
    const timestamp = normalizeEpochMs(entry?.queuedAt)
        || normalizeEpochMs(entry?.startedAt)
        || normalizeEpochMs(entry?.completedAt)
        || fallbackIndex;

    return `${titleUuid || title}:${timestamp}`;
};

export const resolveTaskTimestamps = (entry) => {
    const queuedAt = normalizeEpochMs(entry?.queuedAt);
    const startedAt = normalizeEpochMs(entry?.startedAt);
    const lastUpdated = normalizeEpochMs(entry?.lastUpdated);
    const completedAt = normalizeEpochMs(entry?.completedAt);
    const updatedAt = Math.max(lastUpdated, startedAt, queuedAt);
    const effectiveTimestamp = completedAt || updatedAt || queuedAt || startedAt;

    return {
        queuedAt,
        startedAt,
        updatedAt,
        completedAt,
        effectiveTimestamp,
    };
};

export const compareTaskEntries = (left, right) => {
    const leftRank = getTaskStatusRank(left?.status);
    const rightRank = getTaskStatusRank(right?.status);
    if (leftRank !== rightRank) {
        return leftRank - rightRank;
    }

    const leftTimestamps = resolveTaskTimestamps(left);
    const rightTimestamps = resolveTaskTimestamps(right);
    return rightTimestamps.effectiveTimestamp - leftTimestamps.effectiveTimestamp;
};

export const formatTaskListPreview = (values, limit = 10) => {
    if (!Array.isArray(values) || values.length === 0) {
        return "";
    }

    const preview = values.slice(0, limit).join(", ");
    const hiddenCount = values.length - limit;
    return hiddenCount > 0 ? `${preview} +${hiddenCount} more` : preview;
};

const humanizeStatus = (value) => {
    const normalized = normalizeString(value).trim();
    if (!normalized) return "";
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

export const resolveTaskSourceLabel = (source) => (source === "recentHistory" ? "Last 24h" : "Active");

export const resolveTaskView = (entry, fallbackIndex = 0, source = "active") => {
    const queued = normalizeNumberList(entry?.queuedChapterNumbers);
    const remaining = normalizeNumberList(entry?.remainingChapterNumbers);
    const newChapters = normalizeNumberList(entry?.newChapterNumbers);
    const missingChapters = normalizeNumberList(entry?.missingChapterNumbers);
    const completedChapterNumbers = normalizeNumberList(entry?.completedChapterNumbers);
    const total =
        typeof entry?.totalChapters === "number" && Number.isFinite(entry.totalChapters)
            ? entry.totalChapters
            : queued.length;
    const completed =
        typeof entry?.completedChapters === "number" && Number.isFinite(entry.completedChapters)
            ? entry.completedChapters
            : completedChapterNumbers.length;
    const statusRaw = normalizeString(entry?.status).trim() || "unknown";
    const status = statusRaw.toLowerCase();
    const percent = total > 0 ? clampPercent((completed / total) * 100) : 0;
    const timestamps = resolveTaskTimestamps(entry);

    return {
        key: buildTaskKey(entry, fallbackIndex),
        titleName: normalizeString(entry?.title).trim() || "Untitled",
        titleUuid: normalizeString(entry?.titleUuid).trim(),
        coverUrl: normalizeString(entry?.coverUrl).trim(),
        source,
        sourceLabel: resolveTaskSourceLabel(source),
        statusRaw,
        status,
        statusRank: getTaskStatusRank(statusRaw),
        taskType: normalizeString(entry?.taskType).trim(),
        current: normalizeString(entry?.currentChapter).trim(),
        latestChapter: normalizeString(entry?.latestChapter).trim(),
        message: normalizeString(entry?.message).trim(),
        errorMessage: normalizeString(entry?.errorMessage).trim(),
        total,
        completed,
        percent,
        progressValue: status === "queued" && percent <= 0 ? 12 : percent,
        queued,
        remaining,
        newChapters,
        missingChapters,
        completedChapterNumbers,
        recovered: entry?.recoveredFromCache === true,
        recoveryState: normalizeString(entry?.recoveryState).trim(),
        pauseRequested: entry?.pauseRequested === true,
        queuedAt: timestamps.queuedAt,
        updatedAt: timestamps.updatedAt,
        completedAt: timestamps.completedAt,
        effectiveTimestamp: timestamps.effectiveTimestamp,
        queuedAtLabel: formatEpochMs(timestamps.queuedAt),
        updatedAtLabel: formatEpochMs(timestamps.updatedAt),
        completedAtLabel: formatEpochMs(timestamps.completedAt),
    };
};

export const resolveActiveTaskViews = (downloads = []) =>
    (Array.isArray(downloads) ? downloads : [])
        .filter((entry) => entry && typeof entry === "object" && !isTerminalStatus(entry.status))
        .sort(compareTaskEntries)
        .map((entry, index) => resolveTaskView(entry, index, "active"));

export const resolveRecentHistoryTaskViews = (
    historyEntries = [],
    {now = Date.now(), windowMs = RECENT_HISTORY_WINDOW_MS} = {},
) => {
    const cutoff = Math.max(0, normalizeEpochMs(now) - Math.max(0, windowMs));
    return (Array.isArray(historyEntries) ? historyEntries : [])
        .filter((entry) => entry && typeof entry === "object" && isTerminalStatus(entry.status))
        .map((entry, index) => resolveTaskView(entry, index, "recentHistory"))
        .filter((task) => task.effectiveTimestamp >= cutoff)
        .sort((left, right) => right.effectiveTimestamp - left.effectiveTimestamp);
};

export const resolveCombinedTaskViews = (
    downloads = [],
    historyEntries = [],
    options = {},
) => {
    const activeTasks = resolveActiveTaskViews(downloads);
    const recentHistoryTasks = resolveRecentHistoryTaskViews(historyEntries, options);
    const seen = new Set();

    return [...activeTasks, ...recentHistoryTasks].filter((task) => {
        if (seen.has(task.key)) {
            return false;
        }

        seen.add(task.key);
        return true;
    });
};

export const selectCarouselTaskViews = (taskViews, limit = DOWNLOADS_CAROUSEL_LIMIT) =>
    (Array.isArray(taskViews) ? taskViews : [])
        .filter((task) => task?.source === "active")
        .slice(0, limit);

export const isTaskNeedingAttention = (task) => {
    const status = normalizeString(task?.statusRaw ?? task?.status).trim().toLowerCase();
    if (status === "failed" || status === "error" || status === "interrupted" || status === "paused") {
        return true;
    }

    return Boolean(normalizeString(task?.errorMessage).trim());
};

export const filterTaskViews = (
    taskViews = [],
    {bucket = "all", status = "all"} = {},
) => (Array.isArray(taskViews) ? taskViews : []).filter((task) => {
    if (bucket !== "all" && task?.source !== bucket) {
        return false;
    }

    if (status === "all") {
        return true;
    }

    if (status === "needsAttention") {
        return isTaskNeedingAttention(task);
    }

    return normalizeString(task?.statusRaw ?? task?.status).trim().toLowerCase() === status;
});

const compareStrings = (left, right) => left.localeCompare(right, undefined, {sensitivity: "base"});

export const sortTaskViews = (
    taskViews = [],
    {sortKey = "newest", direction = "descending"} = {},
) => {
    const directionMultiplier = direction === "ascending" ? 1 : -1;

    return [...(Array.isArray(taskViews) ? taskViews : [])].sort((left, right) => {
        const sourceRank = (task) => (task?.source === "active" ? 0 : 1);
        const bySource = sourceRank(left) - sourceRank(right);
        if (bySource !== 0) {
            return bySource;
        }

        let comparison = 0;
        if (sortKey === "status") {
            comparison = (left?.statusRank ?? 0) - (right?.statusRank ?? 0);
        } else if (sortKey === "progress") {
            comparison = (left?.progressValue ?? 0) - (right?.progressValue ?? 0);
        } else if (sortKey === "title") {
            comparison = compareStrings(
                normalizeString(left?.titleName).trim(),
                normalizeString(right?.titleName).trim(),
            );
        } else {
            comparison = (left?.effectiveTimestamp ?? 0) - (right?.effectiveTimestamp ?? 0);
        }

        if (comparison !== 0) {
            return comparison * directionMultiplier;
        }

        const byTime = (right?.effectiveTimestamp ?? 0) - (left?.effectiveTimestamp ?? 0);
        if (byTime !== 0) {
            return byTime;
        }

        const byTitle = compareStrings(
            normalizeString(left?.titleName).trim(),
            normalizeString(right?.titleName).trim(),
        );
        if (byTitle !== 0) {
            return byTitle;
        }

        return compareStrings(
            normalizeString(left?.key).trim(),
            normalizeString(right?.key).trim(),
        );
    });
};

export const buildVpnBlockerDetails = (task, vpnStatus) => {
    if (!task || !vpnStatus || vpnStatus.enabled !== true || !isVpnWaitingMessage(task.message)) {
        return null;
    }

    const connectionState = normalizeString(vpnStatus.connectionState).trim().toLowerCase();
    const blocked =
        vpnStatus.connected !== true
        || connectionState === "connecting"
        || connectionState === "error"
        || connectionState === "idle"
        || connectionState === "disabled";
    if (!blocked) {
        return null;
    }

    const pieces = [
        `Raven is waiting for the VPN before ${task.titleName} can start.`,
        `State: ${normalizeString(vpnStatus.connectionState).trim() || (vpnStatus.connected ? "connected" : "disconnected")}.`,
    ];
    const region = normalizeString(vpnStatus.region).trim();
    if (region) {
        pieces.push(`Region: ${region}.`);
    }
    const lastError = normalizeString(vpnStatus.lastError).trim();
    if (lastError) {
        pieces.push(`Last error: ${lastError}.`);
    }
    pieces.push("Use Rotate now from Admin -> System -> Downloader only if Raven is not recovering automatically.");

    return {
        message: pieces.join(" "),
        hasError: Boolean(lastError),
    };
};

export const describeTaskStatus = (task, vpnStatus) => {
    const vpnBlocker = buildVpnBlockerDetails(task, vpnStatus);
    if (vpnBlocker) {
        return {
            text: vpnBlocker.message,
            tone: vpnBlocker.hasError ? "danger-strong" : "neutral-weak",
            vpnBlocker,
        };
    }

    if (normalizeString(task?.current).trim()) {
        return {
            text: `Current chapter: ${normalizeString(task.current).trim()}`,
            tone: "neutral-weak",
            vpnBlocker: null,
        };
    }

    if (normalizeString(task?.message).trim()) {
        return {
            text: normalizeString(task.message).trim(),
            tone: "neutral-weak",
            vpnBlocker: null,
        };
    }

    if (normalizeString(task?.errorMessage).trim()) {
        return {
            text: normalizeString(task.errorMessage).trim(),
            tone: "danger-strong",
            vpnBlocker: null,
        };
    }

    if (normalizeString(task?.latestChapter).trim()) {
        return {
            text: `Latest chapter: ${normalizeString(task.latestChapter).trim()}`,
            tone: "neutral-weak",
            vpnBlocker: null,
        };
    }

    return {
        text: "Waiting for Raven to report progress.",
        tone: "neutral-weak",
        vpnBlocker: null,
    };
};

export const describeCarouselTaskLine = (task, vpnStatus) => describeTaskStatus(task, vpnStatus).text
    || humanizeStatus(task?.statusRaw ?? task?.status)
    || "Waiting for Raven to report progress.";

export const describeTaskTime = (task) => {
    if (task?.source === "recentHistory" && normalizeString(task?.completedAtLabel).trim()) {
        return `Completed ${task.completedAtLabel}`;
    }

    if (normalizeString(task?.updatedAtLabel).trim()) {
        return `${task?.source === "active" ? "Updated" : "Last update"} ${task.updatedAtLabel}`;
    }

    if (normalizeString(task?.queuedAtLabel).trim()) {
        return `Queued ${task.queuedAtLabel}`;
    }

    return "No timestamp yet";
};

export const countResumableHistoryTasks = (historyEntries = []) =>
    (Array.isArray(historyEntries) ? historyEntries : []).reduce((count, entry) => {
        const status = normalizeString(entry?.status).trim().toLowerCase();
        return status === "paused" || status === "interrupted" ? count + 1 : count;
    }, 0);
