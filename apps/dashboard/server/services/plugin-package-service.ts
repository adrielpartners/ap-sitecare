import { createHash, randomUUID } from 'node:crypto'
import { chmod, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { basename, join, posix, resolve, sep } from 'node:path'
import AdmZip from 'adm-zip'
import type { PluginUpdatePackage } from '../domain/plugin-update'
import { PluginUpdateRepository } from '../repositories/plugin-update-repository'
import { AuditService } from './audit-service'

const maximumEntries = 5_000
const maximumExpandedBytes = 200 * 1024 * 1024
const forbiddenExtensions = new Set(['.exe', '.dll', '.dylib', '.so', '.sh', '.bat', '.cmd', '.ps1', '.phar'])

export interface PluginPackageSettings {
  root: string
  maximumBytes: number
}

export class PluginPackageService {
  constructor(
    private readonly settings: PluginPackageSettings,
    private readonly repository = new PluginUpdateRepository(),
    private readonly audit = new AuditService()
  ) {}

  async upload(input: { buffer: Buffer, filename: string, actorIdentifier: string, sourceNote?: string }): Promise<Omit<PluginUpdatePackage, 'storagePath'>> {
    if (!input.filename.toLowerCase().endsWith('.zip')) throw new Error('Only WordPress plugin ZIP files are accepted.')
    if (!input.buffer.length || input.buffer.length > this.settings.maximumBytes) {
      throw new Error(`Plugin package must be between 1 byte and ${this.settings.maximumBytes} bytes.`)
    }
    const packageId = randomUUID()
    const quarantine = resolve(this.settings.root, '.quarantine')
    await mkdir(quarantine, { recursive: true, mode: 0o700 })
    const temporaryPath = join(quarantine, `${packageId}.zip`)
    await writeFile(temporaryPath, input.buffer, { mode: 0o600, flag: 'wx' })
    try {
      const inspection = inspectPluginArchive(input.buffer)
      const checksumSha256 = createHash('sha256').update(input.buffer).digest('hex')
      const duplicate = await this.repository.findPackageByChecksum(checksumSha256)
      if (duplicate) {
        await rm(temporaryPath, { force: true })
        await this.audit.record({
          actorType: 'dashboard-user', actorIdentifier: input.actorIdentifier,
          eventType: 'plugin-package.duplicate-detected', metadata: { packageId: duplicate.id, checksumSha256 }
        })
        return safePackage(duplicate)
      }
      const finalDirectory = resolve(this.settings.root, packageId)
      if (!finalDirectory.startsWith(`${resolve(this.settings.root)}${sep}`)) throw new Error('Package storage path is invalid.')
      await mkdir(finalDirectory, { recursive: true, mode: 0o700 })
      const finalPath = join(finalDirectory, `${checksumSha256}.zip`)
      await rename(temporaryPath, finalPath)
      await chmod(finalPath, 0o600)
      const saved = await this.repository.savePackage({
        id: packageId,
        pluginSlug: inspection.slug,
        pluginName: inspection.name,
        version: inspection.version,
        originalFilename: basename(input.filename).slice(0, 255),
        checksumSha256,
        sizeBytes: input.buffer.length,
        storagePath: finalPath,
        validationStatus: 'validated',
        scanStatus: 'external-unavailable',
        provenance: {
          source: 'administrator-upload',
          note: input.sourceNote?.trim().slice(0, 1_000) || null,
          externalMalwareScanner: 'not-configured'
        },
        manifest: inspection,
        uploadedBy: input.actorIdentifier,
        createdAt: new Date().toISOString()
      })
      await this.audit.record({
        actorType: 'dashboard-user', actorIdentifier: input.actorIdentifier,
        eventType: 'plugin-package.validated', metadata: {
          packageId: saved.id, pluginSlug: saved.pluginSlug, version: saved.version,
          checksumSha256: saved.checksumSha256, sizeBytes: saved.sizeBytes,
          scanStatus: saved.scanStatus
        }
      })
      return safePackage(saved)
    } catch (error) {
      await rm(temporaryPath, { force: true })
      await this.audit.record({
        actorType: 'dashboard-user', actorIdentifier: input.actorIdentifier,
        eventType: 'plugin-package.rejected', metadata: {
          filename: basename(input.filename).slice(0, 255),
          reason: error instanceof Error ? error.message : 'Package validation failed.'
        }
      })
      throw error
    }
  }

  async list(): Promise<Array<Omit<PluginUpdatePackage, 'storagePath'>>> {
    return (await this.repository.listPackages()).map(safePackage)
  }
}

export function inspectPluginArchive(buffer: Buffer): { slug: string, name: string, version: string, pluginFile: string, entryCount: number, expandedBytes: number } {
  let archive: AdmZip
  try {
    archive = new AdmZip(buffer)
  } catch {
    throw new Error('The uploaded file is not a readable ZIP archive.')
  }
  const entries = archive.getEntries()
  if (entries.length === 0 || entries.length > maximumEntries) throw new Error('The ZIP archive has an invalid number of entries.')
  let expandedBytes = 0
  const topLevels = new Set<string>()
  const phpCandidates: typeof entries = []
  for (const entry of entries) {
    const normalized = entry.entryName.replaceAll('\\', '/')
    validateArchivePath(normalized)
    const unixType = (entry.attr >>> 16) & 0xf000
    if (unixType === 0xa000) throw new Error('Symbolic links are not permitted in plugin packages.')
    expandedBytes += entry.header.size
    if (expandedBytes > maximumExpandedBytes) throw new Error('The expanded ZIP archive is too large.')
    const segments = normalized.split('/').filter(Boolean)
    if (segments[0] && segments[0] !== '__MACOSX') topLevels.add(segments[0])
    const extension = posix.extname(normalized).toLowerCase()
    if (forbiddenExtensions.has(extension)) throw new Error(`Executable archive entry is not permitted: ${normalized}`)
    if (!entry.isDirectory && extension === '.php' && segments.length === 2) phpCandidates.push(entry)
  }
  if (topLevels.size !== 1) throw new Error('A plugin ZIP must contain exactly one top-level plugin directory.')
  const slug = [...topLevels][0]!
  if (!/^[a-z0-9][a-z0-9._-]{0,199}$/i.test(slug)) throw new Error('The top-level plugin directory is not a valid plugin slug.')
  let detected: { name: string, version: string, pluginFile: string } | null = null
  for (const entry of phpCandidates) {
    const source = entry.getData().subarray(0, 32_768).toString('utf8')
    const name = source.match(/^[ \t/*#@]*Plugin Name:\s*(.+)$/mi)?.[1]?.trim()
    const version = source.match(/^[ \t/*#@]*Version:\s*(.+)$/mi)?.[1]?.trim()
    if (name && version) {
      if (detected) throw new Error('The archive contains multiple top-level plugin header files.')
      if (!/^[0-9A-Za-z][0-9A-Za-z.+_-]{0,99}$/.test(version)) throw new Error('The plugin version header is invalid.')
      detected = { name: name.slice(0, 300), version, pluginFile: entry.entryName }
    }
  }
  if (!detected) throw new Error('The archive does not contain a top-level WordPress plugin header with a version.')
  return { slug, ...detected, entryCount: entries.length, expandedBytes }
}

export function validateArchivePath(path: string): void {
  if (!path || path.includes('\0') || path.startsWith('/') || /^[A-Za-z]:\//.test(path)) throw new Error('The ZIP archive contains an unsafe path.')
  const normalized = posix.normalize(path)
  if (normalized === '..' || normalized.startsWith('../') || path.split('/').includes('..')) throw new Error('The ZIP archive contains a path traversal entry.')
}

function safePackage(value: PluginUpdatePackage): Omit<PluginUpdatePackage, 'storagePath'> {
  const { storagePath: _storagePath, ...safe } = value
  return safe
}
