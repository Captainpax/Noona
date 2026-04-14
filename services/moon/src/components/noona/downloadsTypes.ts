export type DownloadViewSource = "active" | "recentHistory";

export type DownloadBucketFilter = "all" | DownloadViewSource;

export type DownloadStatusFilter = "all" | "downloading" | "queued" | "recovering" | "needsAttention";

export type DownloadSortKey = "newest" | "status" | "progress" | "title";

export type SortDirection = "ascending" | "descending";

export type RavenVpnRuntimeStatus = {
    enabled?: boolean;
    connected?: boolean;
    region?: string | null;
    lastError?: string | null;
    connectionState?: string | null;
};

export type ResolvedTaskView = {
    key: string;
    titleName: string;
    titleUuid: string;
    coverUrl: string;
    source: DownloadViewSource;
    sourceLabel: string;
    statusRaw: string;
    status: string;
    statusRank: number;
    taskType: string;
    current: string;
    latestChapter: string;
    message: string;
    errorMessage: string;
    total: number;
    completed: number;
    percent: number;
    progressValue: number;
    queued: string[];
    remaining: string[];
    newChapters: string[];
    missingChapters: string[];
    completedChapterNumbers: string[];
    recovered: boolean;
    recoveryState: string;
    pauseRequested: boolean;
    queuedAt: number;
    updatedAt: number;
    completedAt: number;
    effectiveTimestamp: number;
    queuedAtLabel: string;
    updatedAtLabel: string;
    completedAtLabel: string;
};
