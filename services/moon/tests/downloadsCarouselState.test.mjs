import test from "node:test";
import assert from "node:assert/strict";

import {
    createDownloadsCarouselPlayback,
    resolveDownloadsCarouselPlayback,
    resolveDownloadsCarouselWindow,
} from "../src/components/noona/downloadsCarouselState.mjs";

test("downloads carousel next advances the lead card and wraps from the end", () => {
    const playback = resolveDownloadsCarouselPlayback(
        {activeIndex: 2, cycleKey: 4},
        {type: "next"},
        3,
    );

    assert.deepEqual(playback, {
        activeIndex: 0,
        cycleKey: 5,
    });
});

test("downloads carousel previous wraps from the first lead card to the last", () => {
    const playback = resolveDownloadsCarouselPlayback(
        {activeIndex: 0, cycleKey: 7},
        {type: "previous"},
        3,
    );

    assert.deepEqual(playback, {
        activeIndex: 2,
        cycleKey: 8,
    });
});

test("downloads carousel jump keeps the selected lead card and increments the cycle key", () => {
    const startingPlayback = createDownloadsCarouselPlayback(1);
    const playback = resolveDownloadsCarouselPlayback(
        {...startingPlayback, cycleKey: 3},
        {type: "jump", index: 1},
        4,
    );

    assert.deepEqual(playback, {
        activeIndex: 1,
        cycleKey: 4,
    });
});

test("downloads carousel window resolves visible card indices from the lead card", () => {
    assert.deepEqual(resolveDownloadsCarouselWindow(3, 5, 2), [3, 4]);
    assert.deepEqual(resolveDownloadsCarouselWindow(4, 5, 3), [4, 0, 1]);
});
