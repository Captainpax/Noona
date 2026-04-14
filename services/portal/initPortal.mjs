/**
 * @fileoverview Runs Portal as a standalone entrypoint and re-exports the runtime controls.
 * Related files:
 * - app/portalRuntime.mjs
 * - config/portalConfig.mjs
 * - app/createPortalApp.mjs
 * Times this file has been edited: 6
 */

import {errMSG} from '../../utilities/etc/logger.mjs';
import {loadServiceRuntimeConfig} from '../../utilities/etc/wardenRuntimeBootstrap.mjs';

await loadServiceRuntimeConfig({
    logger: {
        warn: (message) => errMSG(message),
    },
});

const {createSignalHandler, startPortal, stopPortal} = await import('./app/portalRuntime.mjs');

const isDirectRun = (() => {
    if (!process.argv[1]) {
        return false;
    }

    try {
        const entryUrl = new URL(process.argv[1], 'file:');
        return entryUrl.href === import.meta.url;
    } catch (error) {
        return false;
    }
})();

if (isDirectRun) {
    startPortal().catch((error) => {
        errMSG(`[Portal] Failed to start: ${error.message}`);
        process.exit(1);
    });

    process.on('SIGINT', () => createSignalHandler('SIGINT'));
    process.on('SIGTERM', () => createSignalHandler('SIGTERM'));

    setInterval(() => process.stdout.write('.'), 60000);
}

export {startPortal, stopPortal};
export default startPortal;
