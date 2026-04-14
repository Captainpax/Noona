import assert from 'node:assert/strict';
import test from 'node:test';

import {loadServiceRuntimeConfig, mergeServiceRuntimeEnv,} from '../../../utilities/etc/wardenRuntimeBootstrap.mjs';

const withRestoredEnv = async (keys, action) => {
    const snapshot = new Map(keys.map((key) => [key, process.env[key]]));

    try {
        await action();
    } finally {
        for (const [key, value] of snapshot.entries()) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    }
};

test('mergeServiceRuntimeEnv prefers runtime overrides over base descriptor env values', () => {
    assert.deepEqual(
        mergeServiceRuntimeEnv({
            env: {
                KAVITA_BASE_URL: 'http://descriptor',
                KAVITA_API_KEY: 'descriptor-key',
            },
            runtimeConfig: {
                env: {
                    KAVITA_API_KEY: 'runtime-key',
                    PORTAL_ACTIVITY_POLL_MS: '5000',
                },
            },
        }),
        {
            KAVITA_BASE_URL: 'http://descriptor',
            KAVITA_API_KEY: 'runtime-key',
            PORTAL_ACTIVITY_POLL_MS: '5000',
        },
    );
});

test('loadServiceRuntimeConfig applies matching service config from Warden', async () => {
    await withRestoredEnv(['KAVITA_BASE_URL', 'KAVITA_API_KEY', 'PORTAL_ACTIVITY_POLL_MS'], async () => {
        const requests = [];
        const result = await loadServiceRuntimeConfig({
            serviceName: 'noona-portal',
            baseUrl: 'http://noona-warden:4001',
            token: 'portal-token',
            fetchImpl: async (url, options = {}) => {
                requests.push({url, options});
                return {
                    ok: true,
                    status: 200,
                    text: async () => JSON.stringify({
                        env: {
                            KAVITA_BASE_URL: 'http://descriptor',
                            KAVITA_API_KEY: 'descriptor-key',
                        },
                        runtimeConfig: {
                            hostPort: 3003,
                            env: {
                                KAVITA_API_KEY: 'runtime-key',
                                PORTAL_ACTIVITY_POLL_MS: '5000',
                            },
                        },
                    }),
                };
            },
        });

        assert.equal(result.applied, true);
        assert.equal(result.hostPort, 3003);
        assert.equal(process.env.KAVITA_BASE_URL, 'http://descriptor');
        assert.equal(process.env.KAVITA_API_KEY, 'runtime-key');
        assert.equal(process.env.PORTAL_ACTIVITY_POLL_MS, '5000');
        assert.equal(requests.length, 1);
        assert.equal(
            requests[0].url,
            'http://noona-warden:4001/api/services/noona-portal/config?includeSecrets=true',
        );
        assert.equal(requests[0].options.headers.Authorization, 'Bearer portal-token');
    });
});

test('loadServiceRuntimeConfig warns and falls back cleanly when Warden is unavailable', async () => {
    const warnings = [];
    const result = await loadServiceRuntimeConfig({
        serviceName: 'noona-raven',
        baseUrl: 'http://noona-warden:4001',
        token: 'raven-token',
        fetchImpl: async () => {
            throw new Error('connect ECONNREFUSED');
        },
        logger: {
            warn: (message) => warnings.push(String(message)),
        },
    });

    assert.equal(result.applied, false);
    assert.equal(result.reason, 'unavailable');
    assert.ok(
        warnings.some((message) => message.includes('Unable to reach Warden for runtime config restore: connect ECONNREFUSED')),
    );
});
