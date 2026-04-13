export const VPN_WAIT_MESSAGE = "Waiting for Raven VPN connection before download starts.";
export const DOWNLOADS_CAROUSEL_LIMIT = 10;

export const normalizeString = (value) => (typeof value === "string" ? value : "");

export const normalizeNumberList = (value) => {
    if (!Array.isArray(value)) return [];
    return value
        .map((entry) => normalizeString(entry).trim())
        .filter(Boolean);
};

export const formatEpochMs = (value) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "";
    return new Date(value).toLocaleString();
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

const clampPercent = (value) => Math.min(100, Math.max(0, value));

export const buildTaskKey = (entry, fallbackIndex = 0) => {
    const taskId = normalizeString(entry?.taskId).trim();
    if (taskId) {
        return taskId;
    }

    const titleUuid = normalizeString(entry?.titleUuid).trim();
    const title = normalizeString(entry?.title).trim() || "untitled";
    const timestamp = typeof entry?.queuedAt === "number" && Number.isFinite(entry.queuedAt)
        ? entry.queuedAt
        : typeof entry?.startedAt === "number" && Number.isFinite(entry.startedAt)
            ? entry.startedAt
            : typeof entry?.completedAt === "number" && Number.isFinite(entry.completedAt)
                ? entry.completedAt
                : fallbackIndex;

    return `${titleUuid || title}:${timestamp}`;
};

export const compareTaskEntries = (left, right) => {
    const rank = (statusRaw) => {
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

    const leftRank = rank(left?.status);
    const rightRank = rank(right?.status);
    if (leftRank !== rightRank) {
        return leftRank - rightRank;
    }

    const leftUpdated = Math.max(
        typeof left?.lastUpdated === "number" && Number.isFinite(left.lastUpdated) ? left.lastUpdated : 0,
        typeof left?.startedAt === "number" && Number.isFinite(left.startedAt) ? left.startedAt : 0,
        typeof left?.queuedAt === "number" && Number.isFinite(left.queuedAt) ? left.queuedAt : 0,
        typeof left?.completedAt === "number" && Number.isFinite(left.completedAt) ? left.completedAt : 0,
    );
    const rightUpdated = Math.max(
        typeof right?.lastUpdated === "number" && Number.isFinite(right.lastUpdated) ? right.lastUpdated : 0,
        typeof right?.startedAt === "number" && Number.isFinite(right.startedAt) ? right.startedAt : 0,
        typeof right?.queuedAt === "number" && Number.isFinite(right.queuedAt) ? right.queuedAt : 0,
        typeof right?.completedAt === "number" && Number.isFinite(right.completedAt) ? right.completedAt : 0,
    );

    return rightUpdated - leftUpdated;
};

export const formatTaskListPreview = (values, limit = 10) => {
    if (!Array.isArray(values) || values.length === 0) {
        return "";
    }

    const preview = values.slice(0, limit).join(", ");
    const hiddenCount = values.length - limit;
    return hiddenCount > 0 ? `${preview} +${hiddenCount} more` : preview;
};

export const resolveTaskView = (entry, fallbackIndex = 0) => {
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
    const status = normalizeString(entry?.status).trim().toLowerCase() || "unknown";
    const percent = total > 0 ? clampPercent((completed / total) * 100) : 0;

    return {
        key: buildTaskKey(entry, fallbackIndex),
        titleName: normalizeString(entry?.title).trim() || "Untitled",
        statusRaw: normalizeString(entry?.status).trim() || "unknown",
        status,
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
        workerIndex:
            typeof entry?.workerIndex === "number" && Number.isFinite(entry.workerIndex)
                ? entry.workerIndex
                : null,
        cpuCoreId:
            typeof entry?.cpuCoreId === "number" && Number.isFinite(entry.cpuCoreId)
                ? entry.cpuCoreId
                : null,
        executionMode: normalizeString(entry?.executionMode).trim() || "thread",
        pauseRequested: entry?.pauseRequested === true,
        queuedAtLabel: formatEpochMs(entry?.queuedAt),
        updatedAtLabel: formatEpochMs(entry?.lastUpdated ?? entry?.startedAt),
        completedAtLabel: formatEpochMs(entry?.completedAt),
    };
};

export const resolveActiveTaskViews = (downloads = []) =>
    (Array.isArray(downloads) ? downloads : [])
        .filter((entry) => entry && typeof entry === "object" && !isTerminalStatus(entry.status))
        .sort(compareTaskEntries)
        .map((entry, index) => resolveTaskView(entry, index));

export const selectCarouselTaskViews = (taskViews, limit = DOWNLOADS_CAROUSEL_LIMIT) =>
    (Array.isArray(taskViews) ? taskViews : []).slice(0, limit);

export const countResumableHistoryTasks = (historyEntries = []) =>
    (Array.isArray(historyEntries) ? historyEntries : []).reduce((count, entry) => {
        const status = normalizeString(entry?.status).trim().toLowerCase();
        return status === "paused" || status === "interrupted" ? count + 1 : count;
    }, 0);

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
