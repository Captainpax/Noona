/**
 * @fileoverview Covers grouped Discord chapter-release posts, baseline capture, and state persistence.
 * Related files:
 * - discord/chapterReleaseNotifier.mjs
 * Times this file has been edited: 1
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {createChapterReleaseNotifier} from '../discord/chapterReleaseNotifier.mjs';

const getPathValue = (doc, path) => path.split('.').reduce((current, key) => {
    if (!current || typeof current !== 'object') {
        return undefined;
    }

    return current[key];
}, doc);

const setPathValue = (doc, path, value) => {
    const keys = path.split('.');
    let current = doc;
    for (let index = 0; index < keys.length - 1; index += 1) {
        const key = keys[index];
        if (!current[key] || typeof current[key] !== 'object') {
            current[key] = {};
        }
        current = current[key];
    }
    current[keys[keys.length - 1]] = value;
};

const matchesQuery = (doc, query = {}) =>
    Object.entries(query).every(([key, value]) => getPathValue(doc, key) === value);

const applyUpdate = (doc, update = {}) => {
    const next = {...doc};
    if (update?.$set && typeof update.$set === 'object') {
        for (const [key, value] of Object.entries(update.$set)) {
            setPathValue(next, key, value);
        }
    }

    return next;
};

test('chapter release notifier baselines existing chapter history before posting anything', async () => {
    const settingsDocs = [
        {
            key: 'discord.chapter_notifications',
            enabled: true,
            channelId: '123456789012345678',
            baselineCapturedAt: null,
            sentChapterKeys: [],
            announcementCount: 0,
            updatedAt: '2026-04-13T00:00:00.000Z',
        },
    ];
    const sentMessages = [];

    const notifier = createChapterReleaseNotifier({
        discordClient: {
            sendChannelMessage: async (channelId, payload) => {
                sentMessages.push({channelId, payload});
                return {id: `message-${sentMessages.length}`};
            },
        },
        vaultClient: {
            readSetting: async ({key} = {}) => settingsDocs.find(entry => entry.key === key) ?? null,
            updateRecommendation: async ({query, update} = {}) => {
                const index = settingsDocs.findIndex(entry => matchesQuery(entry, query));
                if (index < 0) {
                    settingsDocs.push(applyUpdate({key: query?.key}, update));
                    return {status: 'ok', matched: 0, modified: 0, upserted: 1};
                }

                settingsDocs[index] = applyUpdate(settingsDocs[index], update);
                return {status: 'ok', matched: 1, modified: 1};
            },
        },
        ravenClient: {
            getDownloadStatus: async () => [
                {
                    title: 'Solo Leveling',
                    titleUuid: 'title-uuid-1',
                    sourceUrl: 'https://source.example/solo-leveling',
                    completedChapterNumbers: ['101', '102'],
                    lastUpdated: '2026-04-13T00:10:00.000Z',
                },
            ],
            getDownloadHistory: async () => [
                {
                    title: 'Omniscient Reader',
                    titleUuid: 'title-uuid-2',
                    sourceUrl: 'https://source.example/omniscient',
                    completedChapterNumbers: ['200'],
                    completedAt: '2026-04-13T00:15:00.000Z',
                },
            ],
        },
        kavitaClient: {},
        logger: {},
    });

    notifier.start();
    await notifier.refresh();
    notifier.stop();

    assert.equal(sentMessages.length, 0);
    assert.ok(typeof settingsDocs[0]?.baselineCapturedAt === 'string');
    assert.deepEqual(
        settingsDocs[0]?.sentChapterKeys,
        [
            'uuid:title-uuid-1:101',
            'uuid:title-uuid-1:102',
            'uuid:title-uuid-2:200',
        ],
    );
});

test('chapter release notifier groups new chapters by title and posts Kavita links', async () => {
    const settingsDocs = [
        {
            key: 'discord.chapter_notifications',
            enabled: true,
            channelId: '123456789012345678',
            baselineCapturedAt: '2026-04-13T00:00:00.000Z',
            sentChapterKeys: ['uuid:title-uuid-1:1'],
            announcementCount: 0,
            updatedAt: '2026-04-13T00:00:00.000Z',
        },
    ];
    const sentMessages = [];

    const notifier = createChapterReleaseNotifier({
        discordClient: {
            sendChannelMessage: async (channelId, payload) => {
                sentMessages.push({channelId, payload});
                return {id: `message-${sentMessages.length}`};
            },
        },
        vaultClient: {
            readSetting: async ({key} = {}) => settingsDocs.find(entry => entry.key === key) ?? null,
            updateRecommendation: async ({query, update} = {}) => {
                const index = settingsDocs.findIndex(entry => matchesQuery(entry, query));
                if (index < 0) {
                    settingsDocs.push(applyUpdate({key: query?.key}, update));
                    return {status: 'ok', matched: 0, modified: 0, upserted: 1};
                }

                settingsDocs[index] = applyUpdate(settingsDocs[index], update);
                return {status: 'ok', matched: 1, modified: 1};
            },
        },
        ravenClient: {
            getDownloadStatus: async () => [
                {
                    title: 'Solo Leveling',
                    titleUuid: 'title-uuid-1',
                    sourceUrl: 'https://source.example/solo-leveling',
                    summary: 'Hunters climb the tower.',
                    completedChapterNumbers: ['1', '2'],
                    lastUpdated: '2026-04-13T00:05:00.000Z',
                },
            ],
            getDownloadHistory: async () => [
                {
                    title: 'Solo Leveling',
                    titleUuid: 'title-uuid-1',
                    sourceUrl: 'https://source.example/solo-leveling',
                    completedChapterNumbers: ['3'],
                    completedAt: '2026-04-13T00:10:00.000Z',
                },
                {
                    title: 'Omniscient Reader',
                    titleUuid: 'title-uuid-2',
                    sourceUrl: 'https://source.example/omniscient',
                    completedChapterNumbers: ['200', '201'],
                    completedAt: '2026-04-13T00:20:00.000Z',
                },
            ],
            getLibrary: async () => [
                {
                    uuid: 'title-uuid-1',
                    title: 'Solo Leveling',
                    sourceUrl: 'https://source.example/solo-leveling',
                    summary: 'Hunters climb the tower.',
                },
                {
                    uuid: 'title-uuid-2',
                    title: 'Omniscient Reader',
                    sourceUrl: 'https://source.example/omniscient',
                    summary: 'Readers rewrite fate.',
                },
            ],
        },
        kavitaClient: {
            searchTitles: async (titleName) => {
                if (titleName === 'Solo Leveling') {
                    return {
                        series: [{
                            name: 'Solo Leveling',
                            libraryId: 11,
                            seriesId: 22,
                        }],
                    };
                }

                if (titleName === 'Omniscient Reader') {
                    return {
                        series: [{
                            name: 'Omniscient Reader',
                            libraryId: 33,
                            seriesId: 44,
                        }],
                    };
                }

                return {series: []};
            },
        },
        kavitaBaseUrl: 'https://kavita.example',
        logger: {},
    });

    notifier.start();
    await notifier.refresh();
    notifier.stop();

    assert.equal(sentMessages.length, 2);
    assert.equal(sentMessages[0].channelId, '123456789012345678');
    assert.match(sentMessages[0].payload.content, /\*\*Solo Leveling\*\*/);
    assert.match(sentMessages[0].payload.content, /New chapters downloaded: Chapter 2, Chapter 3/);
    assert.match(sentMessages[0].payload.content, /Summary: Hunters climb the tower\./);
    assert.match(sentMessages[0].payload.content, /Read in Kavita: https:\/\/kavita\.example\/library\/11\/series\/22/);
    assert.match(sentMessages[1].payload.content, /\*\*Omniscient Reader\*\*/);
    assert.match(sentMessages[1].payload.content, /New chapters downloaded: Chapter 200, Chapter 201/);
    assert.match(sentMessages[1].payload.content, /Summary: Readers rewrite fate\./);
    assert.match(sentMessages[1].payload.content, /Read in Kavita: https:\/\/kavita\.example\/library\/33\/series\/44/);
    assert.equal(settingsDocs[0]?.announcementCount, 2);
    assert.ok(typeof settingsDocs[0]?.lastAnnouncedAt === 'string');
    assert.deepEqual(
        settingsDocs[0]?.sentChapterKeys,
        [
            'uuid:title-uuid-1:1',
            'uuid:title-uuid-1:2',
            'uuid:title-uuid-1:3',
            'uuid:title-uuid-2:200',
            'uuid:title-uuid-2:201',
        ],
    );
});
