import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { chmod, lstat, readFile, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { spawn } from 'node:child_process'
import type { BackupManifest, BackupManifestArtifact } from '../domain/types'

export const FILE_BACKUP_EXCLUSIONS = [
  'wp-content/cache',
  'wp-content/upgrade',
  'wp-content/uploads/cache',
  'wp-content/ai1wm-backups',
  'wp-content/updraft',
  'wp-content/backups',
  'wp-content/backup-db',
  'node_modules',
  '*.log',
  '*.tmp',
  '.git'
] as const

export interface DatabaseBackupConfiguration {
  host: string
  port: number
  name: string
  username: string
  password: string
}

export interface BuiltBackupArtifact {
  type: BackupManifestArtifact['type']
  path: string
  archiveName: string
  sizeBytes: number
  checksumSha256: string
}

export interface ProcessRunner {
  run(executable: string, args: string[], options?: { cwd?: string }): Promise<void>
}

export class FixedProcessRunner implements ProcessRunner {
  async run(executable: string, args: string[], options?: { cwd?: string }): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(executable, args, {
        cwd: options?.cwd,
        shell: false,
        stdio: ['ignore', 'ignore', 'pipe']
      })
      child.stderr.resume()
      child.once('error', () => reject(new Error(`Required backup executable is unavailable: ${basename(executable)}.`)))
      child.once('exit', code => code === 0
        ? resolve()
        : reject(new Error(`${basename(executable)} exited with code ${code}.`)))
    })
  }
}

export class BackupArtifactBuilder {
  constructor(
    private readonly processRunner: ProcessRunner = new FixedProcessRunner(),
    private readonly tarExecutable = '/usr/bin/tar',
    private readonly mysqldumpExecutable = '/usr/bin/mysqldump',
    private readonly gzipExecutable = '/usr/bin/gzip'
  ) {}

  async createFilesArchive(wordpressPath: string, workDirectory: string): Promise<BuiltBackupArtifact> {
    const archiveName = 'wordpress-files.tar.gz'
    const archivePath = join(workDirectory, archiveName)
    const args = [
      '-czf', archivePath,
      ...FILE_BACKUP_EXCLUSIONS.flatMap(path => ['--exclude', path, '--exclude', `./${path}`]),
      '-C', wordpressPath,
      '.'
    ]
    await this.processRunner.run(this.tarExecutable, args)
    return this.describe('files', archivePath)
  }

  async createDatabaseArchive(configuration: DatabaseBackupConfiguration, workDirectory: string): Promise<BuiltBackupArtifact> {
    const credentialsPath = join(workDirectory, 'mysql-client.cnf')
    const sqlPath = join(workDirectory, 'wordpress-database.sql')
    await writeFile(credentialsPath, [
      '[client]',
      `host="${escapeOption(configuration.host)}"`,
      `port=${configuration.port}`,
      `user="${escapeOption(configuration.username)}"`,
      `password="${escapeOption(configuration.password)}"`,
      ''
    ].join('\n'), { mode: 0o600 })
    await chmod(credentialsPath, 0o600)
    try {
      await this.processRunner.run(this.mysqldumpExecutable, [
        `--defaults-extra-file=${credentialsPath}`,
        '--single-transaction',
        '--quick',
        '--lock-tables=false',
        '--routines',
        '--events',
        '--triggers',
        `--result-file=${sqlPath}`,
        '--databases',
        configuration.name
      ])
      await ensureNonEmptyFile(sqlPath, 'Database dump was empty.')
      await this.processRunner.run(this.gzipExecutable, ['-f', sqlPath])
      return this.describe('database', `${sqlPath}.gz`)
    } finally {
      await writeFile(credentialsPath, '', { mode: 0o600 }).catch(() => undefined)
    }
  }

  async writeManifestAndChecksums(
    workDirectory: string,
    manifest: Omit<BackupManifest, 'includedArtifacts' | 'archiveNames'>,
    artifacts: BuiltBackupArtifact[]
  ): Promise<{ manifest: BackupManifest, files: BuiltBackupArtifact[] }> {
    const includedArtifacts: BackupManifestArtifact[] = artifacts.map(artifact => ({
      type: artifact.type,
      archiveName: artifact.archiveName,
      sizeBytes: artifact.sizeBytes,
      checksumSha256: artifact.checksumSha256
    }))
    const completeManifest: BackupManifest = {
      ...manifest,
      includedArtifacts,
      archiveNames: artifacts.map(artifact => artifact.archiveName)
    }
    const manifestPath = join(workDirectory, 'manifest.json')
    await writeFile(manifestPath, `${JSON.stringify(completeManifest, null, 2)}\n`, { mode: 0o600 })
    const describedManifest = await this.describe('manifest', manifestPath)
    const checksumPath = join(workDirectory, 'checksum.sha256')
    const checksumLines = [...artifacts, describedManifest]
      .map(artifact => `${artifact.checksumSha256}  ${artifact.archiveName}`)
      .join('\n')
    await writeFile(checksumPath, `${checksumLines}\n`, { mode: 0o600 })
    const describedChecksums = await this.describe('checksums', checksumPath)
    await this.verifyChecksums(workDirectory, checksumPath)
    return { manifest: completeManifest, files: [...artifacts, describedManifest, describedChecksums] }
  }

  async verifyChecksums(workDirectory: string, checksumPath: string): Promise<void> {
    const lines = (await readFile(checksumPath, 'utf8')).trim().split('\n').filter(Boolean)
    for (const line of lines) {
      const match = /^([a-f0-9]{64})  ([a-zA-Z0-9._-]+)$/.exec(line)
      if (!match) throw new Error('Checksum file contains an invalid entry.')
      const actual = await sha256(join(workDirectory, match[2]))
      if (actual !== match[1]) throw new Error(`Checksum verification failed for ${match[2]}.`)
    }
  }

  private async describe(type: BuiltBackupArtifact['type'], path: string): Promise<BuiltBackupArtifact> {
    const stat = await ensureNonEmptyFile(path, `${basename(path)} was empty.`)
    return {
      type,
      path,
      archiveName: basename(path),
      sizeBytes: stat.size,
      checksumSha256: await sha256(path)
    }
  }
}

async function ensureNonEmptyFile(path: string, message: string) {
  const stat = await lstat(path)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 1) throw new Error(message)
  return stat
}

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

function escapeOption(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
}
