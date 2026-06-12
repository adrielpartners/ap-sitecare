import { lstatSync, realpathSync } from 'node:fs'
import { opendir } from 'node:fs/promises'
import { isAbsolute, relative } from 'node:path'
import type { HostingConnection } from '../domain/types'
import type { HostingConnectionAdapter, HostingConnectionAssessment } from './hosting-connection'
import { calculateRestoreCapability } from './hosting-connection'

export class LocalVpsConnection implements HostingConnectionAdapter {
  readonly type = 'local-vps' as const

  constructor(private readonly allowedBaseDirectories: string[]) {}

  assess(connection: HostingConnection): HostingConnectionAssessment {
    const messages: string[] = []
    let pathAllowed = false
    try {
      if (!connection.localPath) throw new Error('A local WordPress path is required.')
      this.validatePath(connection.localPath)
      pathAllowed = true
      messages.push('Local WordPress path is inside an allowed base directory.')
    } catch (error) {
      messages.push(error instanceof Error ? error.message : 'Local WordPress path is not valid.')
    }
    if (!connection.databaseConfigured) messages.push('Database credentials are not configured.')
    return {
      type: this.type,
      implemented: true,
      backupFiles: pathAllowed,
      backupDatabase: connection.databaseConfigured,
      restoreFiles: pathAllowed,
      restoreDatabase: connection.databaseConfigured,
      restoreCapability: calculateRestoreCapability(pathAllowed, connection.databaseConfigured, pathAllowed, connection.databaseConfigured),
      messages
    }
  }

  validatePath(inputPath: string): string {
    if (!isAbsolute(inputPath)) throw new Error('Local WordPress path must be absolute.')
    if (!this.allowedBaseDirectories.length) throw new Error('No allowed local backup base directories are configured.')
    try {
      const stat = lstatSync(inputPath)
      if (stat.isSymbolicLink()) throw new Error('Local WordPress path must not be a symbolic link.')
      if (!stat.isDirectory()) throw new Error('Local WordPress path must be a directory.')
    } catch (error) {
      if (error instanceof Error && error.message.includes('symbolic link')) throw error
      throw new Error('Local WordPress path does not exist.')
    }

    const target = this.resolveExisting(inputPath, 'Local WordPress path does not exist.')
    const allowed = this.allowedBaseDirectories.some((base) => {
      const resolvedBase = this.resolveExisting(base, 'An allowed local backup base directory does not exist.')
      const pathFromBase = relative(resolvedBase, target)
      return pathFromBase === '' || (!pathFromBase.startsWith('..') && !isAbsolute(pathFromBase))
    })
    if (!allowed) throw new Error('Local WordPress path is outside the configured allowed base directories.')
    return target
  }

  async validateTreeHasNoSymlinks(root: string): Promise<void> {
    const directory = await opendir(root)
    for await (const entry of directory) {
      const entryPath = `${root}/${entry.name}`
      if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not allowed in backup source paths: ${entry.name}`)
      if (entry.isDirectory()) await this.validateTreeHasNoSymlinks(entryPath)
    }
  }

  private resolveExisting(path: string, message: string): string {
    try {
      return realpathSync(path)
    } catch {
      throw new Error(message)
    }
  }
}
