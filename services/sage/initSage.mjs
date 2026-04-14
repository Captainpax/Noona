// services/sage/initSage.mjs

import {loadServiceRuntimeConfig} from '../../utilities/etc/wardenRuntimeBootstrap.mjs'

await loadServiceRuntimeConfig()

const {startSage} = await import('./app/createSageApp.mjs')

startSage()
