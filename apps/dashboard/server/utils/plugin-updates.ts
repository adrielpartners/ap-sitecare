import type { H3Event } from 'h3'
import { getRuntimeSettings } from './config'
import { PluginPackageService } from '../services/plugin-package-service'
import { PluginRolloutService } from '../services/plugin-rollout-service'

export function getPluginPackageService(event: H3Event): PluginPackageService {
  const settings = getRuntimeSettings(event)
  return new PluginPackageService(settings.pluginPackages)
}

export function getPluginRolloutService(event?: H3Event): PluginRolloutService {
  const settings = getRuntimeSettings(event)
  return new PluginRolloutService({
    sitecareBaseUrl: settings.sitecareBaseUrl,
    credentialEncryptionKey: settings.credentialEncryptionKey
  })
}
