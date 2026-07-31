import type { H3Event } from 'h3'
import { HostingerClient } from '../integrations/hostinger-client'
import { HostingerPortfolioService } from '../services/hostinger-portfolio-service'
import { getRuntimeSettings } from './config'

export function getHostingerPortfolioService(event?: H3Event): HostingerPortfolioService {
  const settings = getRuntimeSettings(event).integrations
  return new HostingerPortfolioService(
    new HostingerClient(settings.hostingerApiToken, settings.hostingerApiBaseUrl)
  )
}
