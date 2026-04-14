// services/vault/initVault.mjs

/**
 * @fileoverview
 * Vault microservice for handling secure MongoDB and Redis operations from other Noona services.
 */

import {loadServiceRuntimeConfig} from '../../utilities/etc/wardenRuntimeBootstrap.mjs';

await loadServiceRuntimeConfig();

const dotenv = (await import('dotenv')).default;
const {debugMSG, isDebugEnabled, log, setDebug, warn} = await import('../../utilities/etc/logger.mjs');
const {createVaultApp} = await import('./app/createVaultApp.mjs');
const {createVaultServer} = await import('./app/createVaultServer.mjs');

dotenv.config();

const {app, port} = createVaultApp({
    logger: {log, warn, debug: debugMSG},
    isDebugEnabled,
    setDebug,
});

const {server, protocol} = createVaultServer({
    app,
    env: process.env,
});

server.listen(port, () => log(`Vault listening on ${protocol.toUpperCase()} port ${port}`));
