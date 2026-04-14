import test from "node:test";
import assert from "node:assert/strict";

import {
    countResumableHistoryTasks,
    describeCarouselTaskLine,
    describeTaskStatus,
    filterTaskViews,
    RECENT_HISTORY_WINDOW_MS,
    resolveActiveTaskViews,
    resolveCombinedTaskViews,
    resolveTaskView,
    selectCarouselTaskViews,
    sortTaskViews,
    VPN_WAIT_MESSAGE,
} from "../src/components/noona/downloadsPageUtils.mjs";

test("resolveActiveTaskViews sorts active downloads by status rank and freshness", () => {
    const downloads = Array.from({length: 4}, (_, index) => ({
        taskId: `task-${index + 1}`,
        title: `Task ${index + 1}`,
        status: index === 0 ? "queued" : "downloading",
        totalChapters: 10,
        completedChapters: index,
        lastUpdated: 1000 + index,
    }));

    downloads.push({
        taskId: "completed-task",
        title: "Completed task",
        status: "completed",
        totalChapters: 4,
        completedChapters: 4,
        lastUpdated: 9999,
    });

    const activeTasks = resolveActiveTaskViews(downloads);

    assert.equal(activeTasks.length, 4);
    assert.equal(activeTasks[0].key, "task-4");
    assert.equal(activeTasks[3].key, "task-1");
    assert.equal(activeTasks[0].source, "active");
});

test("resolveCombinedTaskViews keeps active tasks first and filters history to the last 24 hours", () => {
    const now = 200 * RECENT_HISTORY_WINDOW_MS;
    const active = [
        {
            taskId: "active-1",
            title: "Active one",
            status: "downloading",
            lastUpdated: now - 1_000,
        },
        {
            taskId: "active-2",
            title: "Active two",
            status: "queued",
            lastUpdated: now - 2_000,
        },
    ];
    const history = [
        {
            taskId: "recent-complete",
            title: "Recent complete",
            status: "completed",
            completedAt: now - 60_000,
        },
        {
            taskId: "recent-paused",
            title: "Recent paused",
            status: "paused",
            lastUpdated: now - (2 * 60_000),
        },
        {
            taskId: "old-failure",
            title: "Old failure",
            status: "failed",
            completedAt: now - RECENT_HISTORY_WINDOW_MS - 1,
        },
    ];

    const combined = resolveCombinedTaskViews(active, history, {now});

    assert.deepEqual(
        combined.map((task) => [task.key, task.source]),
        [
            ["active-1", "active"],
            ["active-2", "active"],
            ["recent-complete", "recentHistory"],
            ["recent-paused", "recentHistory"],
        ],
    );
});

test("selectCarouselTaskViews only returns active tasks from the combined rows", () => {
    const tasks = [
        resolveTaskView({taskId: "active-1", title: "Active", status: "downloading"}, 0, "active"),
        resolveTaskView({taskId: "recent-1", title: "Recent", status: "completed"}, 1, "recentHistory"),
    ];

    const railTasks = selectCarouselTaskViews(tasks);

    assert.equal(railTasks.length, 1);
    assert.equal(railTasks[0].key, "active-1");
});

test("filterTaskViews and sortTaskViews keep active rows first while sorting within each bucket", () => {
    const tasks = [
        resolveTaskView({taskId: "a", title: "Bravo", status: "downloading", lastUpdated: 10}, 0, "active"),
        resolveTaskView({taskId: "b", title: "Alpha", status: "queued", lastUpdated: 20}, 1, "active"),
        resolveTaskView({taskId: "c", title: "Zulu", status: "failed", completedAt: 30}, 2, "recentHistory"),
        resolveTaskView({taskId: "d", title: "Echo", status: "paused", completedAt: 40}, 3, "recentHistory"),
    ];

    const titleSorted = sortTaskViews(tasks, {sortKey: "title", direction: "ascending"});
    assert.deepEqual(titleSorted.map((task) => task.key), ["b", "a", "d", "c"]);

    const needsAttention = filterTaskViews(tasks, {status: "needsAttention"});
    assert.deepEqual(needsAttention.map((task) => task.key), ["c", "d"]);
});

test("resolveTaskView keeps a visible fallback progress width for queued tasks", () => {
    const task = resolveTaskView({
        taskId: "queued-task",
        title: "Queued task",
        status: "queued",
        totalChapters: 0,
        completedChapters: 0,
    });

    assert.equal(task.percent, 0);
    assert.equal(task.progressValue, 12);
    assert.equal(task.coverUrl, "");
});

test("describeCarouselTaskLine prefers current chapter, then latest chapter, then short status fallback", () => {
    assert.equal(
        describeCarouselTaskLine({
            current: "Chapter 42",
            latestChapter: "Chapter 45",
            statusRaw: "downloading",
        }),
        "Current chapter: Chapter 42",
    );

    assert.equal(
        describeCarouselTaskLine({
            current: "",
            latestChapter: "Chapter 45",
            statusRaw: "downloading",
        }),
        "Latest chapter: Chapter 45",
    );
});

test("describeCarouselTaskLine keeps VPN waits understandable", () => {
    assert.equal(
        describeCarouselTaskLine({
            current: "",
            latestChapter: "",
            message: VPN_WAIT_MESSAGE,
            statusRaw: "queued",
        }),
        VPN_WAIT_MESSAGE,
    );
});

test("describeTaskStatus enriches VPN-blocked tasks with Raven connection details", () => {
    const task = resolveTaskView({
        taskId: "vpn-task",
        title: "VPN blocked title",
        status: "queued",
        message: VPN_WAIT_MESSAGE,
        totalChapters: 8,
        completedChapters: 0,
    });

    const details = describeTaskStatus(task, {
        enabled: true,
        connected: false,
        connectionState: "error",
        region: "US West",
        lastError: "Authentication failed",
    });

    assert.equal(details.tone, "danger-strong");
    assert.match(details.text, /VPN blocked title/);
    assert.match(details.text, /State: error\./);
    assert.match(details.text, /Region: US West\./);
    assert.match(details.text, /Last error: Authentication failed\./);
});

test("countResumableHistoryTasks only counts paused and interrupted history entries", () => {
    assert.equal(
        countResumableHistoryTasks([
            {status: "paused"},
            {status: "interrupted"},
            {status: "completed"},
            {status: "queued"},
        ]),
        2,
    );
});
