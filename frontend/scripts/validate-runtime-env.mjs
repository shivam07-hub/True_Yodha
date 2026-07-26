import nextEnv from "@next/env"

import { validateProductionEnv } from "../runtime-env.mjs"

const { loadEnvConfig } = nextEnv

loadEnvConfig(process.cwd())
validateProductionEnv(process.env)
