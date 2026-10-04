'use server'

import config from '@payload-config'
import { handleServerFunctions } from '@payloadcms/next/layouts'
import type { ServerFunctionClient } from 'payload'
import { importMap } from './admin/importMap.js'

// A module-level exported action gives the compiler a stable registration for
// Payload's client-side form and document operations.
export const serverFunction: ServerFunctionClient = async (args) =>
  handleServerFunctions({ ...args, config, importMap })
