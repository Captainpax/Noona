// services/warden/docker/addonDockers.mjs

import {resolveHostServiceBase, resolveSharedHostEnvEntries,} from './hostServiceUrl.mjs';
import {resolveNoonaImage} from './imageRegistry.mjs';
import {DEFAULT_MANAGED_KOMF_APPLICATION_YML} from './komfConfigTemplate.mjs';
import {resolveManagedMongoRootPassword, resolveManagedMongoRootUsername,} from './mongoCredentials.mjs';
import {buildWardenApiTokenRegistry} from './wardenApiTokens.mjs';

const HOST_SERVICE_URL = resolveHostServiceBase();
const SHARED_HOST_ENV = resolveSharedHostEnvEntries();
const DOCKER_WARDEN_URL =
    process.env.WARDEN_DOCKER_URL
    || process.env.INTERNAL_WARDEN_BASE_URL
    || 'http://noona-warden:4001';
const DEFAULT_TIMEZONE = process.env.TZ || 'UTC';
const DEFAULT_MOON_WEBGUI_PORT = (() => {
    const candidate = Number.parseInt(process.env.WEBGUI_PORT || '3000', 10);
    if (Number.isFinite(candidate) && candidate >= 1 && candidate <= 65535) {
        return String(candidate);
    }

    return '3000';
})();
const DEFAULT_NOONA_MOON_BASE_URL = process.env.NOONA_MOON_BASE_URL || `${HOST_SERVICE_URL}:${DEFAULT_MOON_WEBGUI_PORT}`;
const DEFAULT_NOONA_PORTAL_BASE_URL = process.env.NOONA_PORTAL_BASE_URL || 'http://noona-portal:3003';
const DEFAULT_NOONA_SOCIAL_LOGIN_ONLY = process.env.NOONA_SOCIAL_LOGIN_ONLY || 'false';
const DEFAULT_MONGO_ROOT_USERNAME = resolveManagedMongoRootUsername(process.env);
const DEFAULT_MONGO_ROOT_PASSWORD = resolveManagedMongoRootPassword({env: process.env});
const WARDEN_API_CLIENT_NAMES = Object.freeze(['noona-kavita', 'noona-komf']);
const wardenApiTokensByService = buildWardenApiTokenRegistry(WARDEN_API_CLIENT_NAMES);

const createEnvField = (key, defaultValue, {
    label = key,
    description = null,
    warning = null,
    required = true,
    readOnly = false,
    sensitive = false,
    serverManaged = false,
    advanced = false,
} = {}) => ({
    key,
    label,
    defaultValue,
    description,
    warning,
    required,
    readOnly,
    sensitive,
    serverManaged,
    advanced,
});

const rawList = [
    {
        name: 'noona-redis',
        description: 'Redis Stack used for caching, wizard state, and ephemeral service coordination.',
        image: 'redis/redis-stack:7.2.0-v19',
        port: null,
        internalPort: 6379,
        ports: {},
        exposed: {
            '6379/tcp': {},
            '8001/tcp': {},
        },
        env: [...SHARED_HOST_ENV, 'SERVICE_NAME=noona-redis'],
        envConfig: [
            createEnvField('SERVICE_NAME', 'noona-redis', {
                label: 'Service Name',
                readOnly: true,
                description: 'Identifier used when naming the Redis container.',
            }),
        ],
        volumes: ['/noona-redis-data:/data'],
        health: null,
        healthCheck: {
            type: 'docker',
            test: ['CMD-SHELL', 'redis-cli -h 127.0.0.1 -p 6379 ping | grep PONG > /dev/null'],
            intervalMs: 5000,
            timeoutMs: 3000,
            startPeriodMs: 5000,
            retries: 20,
            tries: 30,
            delayMs: 1000,
        },
        hostServiceUrl: null,
        advertiseHostServiceUrl: false,
    },
    {
        name: 'noona-mongo',
        description: 'MongoDB backing store used by Vault for persistent data.',
        image: 'mongo:8',
        port: null,
        internalPort: 27017,
        ports: {},
        exposed: {
            '27017/tcp': {},
        },
        env: [
            ...SHARED_HOST_ENV,
            `MONGO_INITDB_ROOT_USERNAME=${DEFAULT_MONGO_ROOT_USERNAME}`,
            `MONGO_INITDB_ROOT_PASSWORD=${DEFAULT_MONGO_ROOT_PASSWORD}`,
            'SERVICE_NAME=noona-mongo',
        ],
        envConfig: [
            createEnvField('MONGO_INITDB_ROOT_USERNAME', DEFAULT_MONGO_ROOT_USERNAME, {
                label: 'Mongo Root Username',
                warning: 'Managed Mongo credentials are generated and owned by Warden.',
                readOnly: true,
                serverManaged: true,
            }),
            createEnvField('MONGO_INITDB_ROOT_PASSWORD', DEFAULT_MONGO_ROOT_PASSWORD, {
                label: 'Mongo Root Password',
                warning: 'Managed Mongo credentials are generated and owned by Warden.',
                readOnly: true,
                sensitive: true,
                serverManaged: true,
            }),
            createEnvField('SERVICE_NAME', 'noona-mongo', {
                label: 'Service Name',
                readOnly: true,
                description: 'Identifier used when naming the Mongo container.',
            }),
        ],
        volumes: ['/noona-mongo-data:/data/db'],
        health: null,
        healthCheck: {
            type: 'docker',
            test: [
                'CMD-SHELL',
                'mongosh --quiet --username "$MONGO_INITDB_ROOT_USERNAME" --password "$MONGO_INITDB_ROOT_PASSWORD" --authenticationDatabase admin --eval "quit(db.adminCommand({ ping: 1 }).ok ? 0 : 2)"',
            ],
            intervalMs: 5000,
            timeoutMs: 5000,
            startPeriodMs: 10000,
            retries: 20,
            tries: 30,
            delayMs: 1000,
        },
        hostServiceUrl: null,
        advertiseHostServiceUrl: false,
    },
    {
        name: 'noona-kavita',
        description: 'Managed Kavita library server wired to the Noona downloads folder.',
        image: resolveNoonaImage('noona-kavita'),
        port: 5000,
        internalPort: 5000,
        env: [
            ...SHARED_HOST_ENV,
            'SERVICE_NAME=noona-kavita',
            `WARDEN_BASE_URL=${DOCKER_WARDEN_URL}`,
            `TZ=${DEFAULT_TIMEZONE}`,
            'KAVITA_CONFIG_HOST_MOUNT_PATH=',
            'KAVITA_LIBRARY_HOST_MOUNT_PATH=',
            `NOONA_MOON_BASE_URL=${DEFAULT_NOONA_MOON_BASE_URL}`,
            `NOONA_PORTAL_BASE_URL=${DEFAULT_NOONA_PORTAL_BASE_URL}`,
            'NOONA_BOOTSTRAP_ADMIN_ON_START=false',
            `NOONA_SOCIAL_LOGIN_ONLY=${DEFAULT_NOONA_SOCIAL_LOGIN_ONLY}`,
        ],
        envConfig: [
            createEnvField('SERVICE_NAME', 'noona-kavita', {
                label: 'Service Name',
                readOnly: true,
                description: 'Identifier used when naming the Kavita container.',
            }),
            createEnvField('WARDEN_BASE_URL', DOCKER_WARDEN_URL, {
                label: 'Warden Base URL',
                description: 'Trusted internal URL Kavita uses to restore its own runtime config during startup.',
                warning: 'Change this only if Warden is reachable from Kavita at a different internal address.',
                required: false,
            }),
            createEnvField('TZ', DEFAULT_TIMEZONE, {
                label: 'Timezone',
                description: 'Timezone used by the managed Kavita container.',
                required: false,
            }),
            createEnvField('KAVITA_CONFIG_HOST_MOUNT_PATH', '', {
                label: 'Kavita Config Folder',
                description: 'Optional host folder mounted into Kavita at /kavita/config.',
                warning: 'Leave empty to use the default Noona storage root under kavita/config.',
                required: false,
            }),
            createEnvField('KAVITA_LIBRARY_HOST_MOUNT_PATH', '', {
                label: 'Kavita Library Folder',
                description: 'Optional host folder mounted into Kavita at /manga for the shared library.',
                warning: 'Leave empty to share the default Noona Raven downloads folder.',
                required: false,
            }),
            createEnvField('NOONA_MOON_BASE_URL', DEFAULT_NOONA_MOON_BASE_URL, {
                label: 'Noona Moon Base URL',
                description: 'Public Moon login URL Kavita should use for the "Log in with Noona" button.',
                warning: 'Override this with your reverse-proxy URL when users cannot reach the default host-service Moon address.',
                required: false,
                advanced: true,
            }),
            createEnvField('NOONA_PORTAL_BASE_URL', DEFAULT_NOONA_PORTAL_BASE_URL, {
                label: 'Noona Portal Base URL',
                description: 'Internal Portal URL Kavita uses to redeem one-time Noona login tokens.',
                warning: 'Change this only if Portal is reachable from Kavita at a different internal address.',
                required: false,
                advanced: true,
            }),
            createEnvField('NOONA_SOCIAL_LOGIN_ONLY', DEFAULT_NOONA_SOCIAL_LOGIN_ONLY, {
                label: 'Noona Social Login Only',
                description: 'When true, managed Kavita hides the username/password form and rejects local password logins in favor of the Noona login handoff.',
                warning: 'Leave this enabled unless you intentionally need to restore direct Kavita password logins.',
                required: false,
                advanced: true,
            }),
        ],
        volumes: [],
        hostServiceUrl: `${HOST_SERVICE_URL}:5000`,
        health: 'http://noona-kavita:5000/api/Health',
        healthTries: 60,
        healthDelayMs: 1000,
        restartPolicy: {Name: 'unless-stopped'},
    },
    {
        name: 'noona-komf',
        description: 'Managed Komf metadata helper wired to Kavita by default.',
        image: resolveNoonaImage('noona-komf'),
        port: 8085,
        internalPort: 8085,
        env: [
            ...SHARED_HOST_ENV,
            'SERVICE_NAME=noona-komf',
            `WARDEN_BASE_URL=${DOCKER_WARDEN_URL}`,
            'KOMF_KAVITA_BASE_URI=http://noona-kavita:5000',
            'KOMF_KAVITA_API_KEY=',
            'KOMF_LOG_LEVEL=INFO',
            'KOMF_CONFIG_HOST_MOUNT_PATH=',
        ],
        envConfig: [
            createEnvField('SERVICE_NAME', 'noona-komf', {
                label: 'Service Name',
                readOnly: true,
                description: 'Identifier used when naming the Komf container.',
            }),
            createEnvField('WARDEN_BASE_URL', DOCKER_WARDEN_URL, {
                label: 'Warden Base URL',
                description: 'Trusted internal URL Komf uses to restore its own runtime config during startup.',
                warning: 'Change this only if Warden is reachable from Komf at a different internal address.',
                required: false,
            }),
            createEnvField('KOMF_KAVITA_BASE_URI', 'http://noona-kavita:5000', {
                label: 'Kavita Base URI',
                description: 'Kavita base URL used by Komf.',
            }),
            createEnvField('KOMF_KAVITA_API_KEY', '', {
                label: 'Kavita API Key',
                description: 'API key Komf uses to talk to Kavita.',
            }),
            createEnvField('KOMF_LOG_LEVEL', 'INFO', {
                label: 'Komf Log Level',
                description: 'Logging level used by the Komf container.',
                required: false,
            }),
            createEnvField('KOMF_CONFIG_HOST_MOUNT_PATH', '', {
                label: 'Komf Config Folder',
                description: 'Optional host folder mounted into Komf at /config.',
                warning: 'Leave empty to use the default Noona storage root under komf/config.',
                required: false,
            }),
            createEnvField('KOMF_APPLICATION_YML', DEFAULT_MANAGED_KOMF_APPLICATION_YML, {
                label: 'Komf application.yml',
                description: 'Moon writes this YAML into /config/application.yml before managed Komf starts.',
                warning: 'Set valid metadataProviders and kavita.metadataUpdate blocks here, or Kavita metadata matching can fail.',
                required: false,
            }),
        ],
        volumes: [],
        hostServiceUrl: `${HOST_SERVICE_URL}:8085`,
        health: null,
        user: '1000:1000',
        restartPolicy: {Name: 'unless-stopped'},
    },
];

for (const service of rawList) {
    const wardenApiToken = wardenApiTokensByService[service.name];
    if (!wardenApiToken) {
        continue;
    }

    service.env.push(`WARDEN_API_TOKEN=${wardenApiToken}`);
    service.envConfig.push(
        createEnvField('WARDEN_API_TOKEN', wardenApiToken, {
            label: 'Warden API Token',
            readOnly: true,
            description: `Auto-generated token ${service.name} uses to read back its own runtime config from Warden.`,
            sensitive: true,
            serverManaged: true,
            required: false,
        }),
    );
}

const addonDockers = Object.fromEntries(
    rawList.map(service => {
        const internal = service.internalPort || service.port;
        const exposed = service.exposed || (internal ? { [`${internal}/tcp`]: {} } : {});
        const ports = service.ports || (internal && service.port
            ? { [`${internal}/tcp`]: [{ HostPort: String(service.port) }] }
            : {});

        return [
            service.name,
            {
                ...service,
                exposed,
                ports,
            },
        ];
    })
);

export default addonDockers;
