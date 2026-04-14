/**
 * @typedef {{ activeIndex?: number, cycleKey?: number }} DownloadsCarouselPlayback
 * @typedef {{ type: "next" | "previous" | "restart" } | { type: "jump", index: number }} DownloadsCarouselAction
 */

const normalizeItemCount = (itemCount) => {
    const parsed = Number(itemCount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return 0;
    }

    return Math.trunc(parsed);
};

/**
 * @param {number} index
 * @param {number} itemCount
 * @returns {number}
 */
export const resolveWrappedCarouselIndex = (index, itemCount) => {
    const count = normalizeItemCount(itemCount);
    if (count === 0) {
        return 0;
    }

    const parsedIndex = Number.isFinite(index) ? Math.trunc(index) : 0;
    return ((parsedIndex % count) + count) % count;
};

export const resolveDownloadsCarouselWindow = (activeIndex, itemCount, windowSize) => {
    const count = normalizeItemCount(itemCount);
    const size = Math.min(normalizeItemCount(windowSize), count);
    if (count === 0 || size === 0) {
        return [];
    }

    const start = resolveWrappedCarouselIndex(activeIndex, count);
    const indices = [];
    for (let offset = 0; offset < size; offset += 1) {
        indices.push(resolveWrappedCarouselIndex(start + offset, count));
    }

    return indices;
};

/**
 * @param {number} [activeIndex]
 * @returns {{ activeIndex: number, cycleKey: number }}
 */
export const createDownloadsCarouselPlayback = (activeIndex = 0) => ({
    activeIndex: Number.isFinite(activeIndex) ? Math.trunc(activeIndex) : 0,
    cycleKey: 0,
});

/**
 * @param {DownloadsCarouselPlayback} state
 * @param {DownloadsCarouselAction} action
 * @param {number} itemCount
 * @returns {{ activeIndex: number, cycleKey: number }}
 */
export const resolveDownloadsCarouselPlayback = (state, action, itemCount) => {
    const count = normalizeItemCount(itemCount);
    const activeIndex = resolveWrappedCarouselIndex(state?.activeIndex ?? 0, count);
    const cycleKey = Number.isFinite(state?.cycleKey) ? Math.trunc(state.cycleKey) : 0;

    if (count === 0) {
        return {activeIndex: 0, cycleKey};
    }

    if (action?.type === "next") {
        return {
            activeIndex: resolveWrappedCarouselIndex(activeIndex + 1, count),
            cycleKey: cycleKey + 1,
        };
    }

    if (action?.type === "previous") {
        return {
            activeIndex: resolveWrappedCarouselIndex(activeIndex - 1, count),
            cycleKey: cycleKey + 1,
        };
    }

    if (action?.type === "jump") {
        return {
            activeIndex: resolveWrappedCarouselIndex(action.index, count),
            cycleKey: cycleKey + 1,
        };
    }

    if (action?.type === "restart") {
        return {
            activeIndex,
            cycleKey: cycleKey + 1,
        };
    }

    return {activeIndex, cycleKey};
};
