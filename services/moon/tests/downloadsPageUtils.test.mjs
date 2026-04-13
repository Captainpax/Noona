import test from "node:test";
import assert from "node:assert/strict";

import {
    countResumableHistoryTasks,
    describeTaskStatus,
    DOWNLOADS_CAROUSEL_LIMIT,
    resolveActiveTaskViews,
    resolveTaskView,
    selectCarouselTaskViews,
    VPN_WAIT_MESSAGE,
} from "../src/components/noona/downloadsPageUtils.mjs";

test("resolveActiveTaskViews sorts active downloads and selectCarouselTaskViews caps the carousel at ten items", () => {
    const downloads = Array.from({length: 12}, (_, index) => ({
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
    const carouselTasks = selectCarouselTaskViews(activeTasks);

    assert.equal(activeTasks.length, 12);
    assert.equal(activeTasks[0].key, "task-12");
    assert.equal(activeTasks[11].key, "task-1");
    assert.equal(carouselTasks.length, DOWNLOADS_CAROUSEL_LIMIT);
    assert.equal(carouselTasks[0].key, "task-12");
    assert.equal(carouselTasks[9].key, "task-3");
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
