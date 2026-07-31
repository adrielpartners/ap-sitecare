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

  async createFilesArchive(wordpressPath: string, workDirectory: string, packagePrefix = ''): Promise<BuiltBackupArtifact> {
    const archiveName = packageName(packagePrefix, 'wordpress-files.tar.gz')
    const archivePath = join(workDirectory, archiveName)
    const args = [
      '-czf', archivePath,
      ...FILE_BACKUP_EXCLUSIONS.flatMap(path => ['--exclude', path, '--exclude', `./${path}`]),
      '-C', wordpressPath,
      '.'
    ]
    await this.processRunner.run(this.tarExecutable, args)
    const artifact = await this.describe('files', archivePath)
    await this.processRunner.run(this.tarExecutable, ['-tzf', archivePath])
    return artifact
  }

  async createDatabaseArchive(configuration: DatabaseBackupConfiguration, workDirectory: string, packagePrefix = ''): Promise<BuiltBackupArtifact> {
    const credentialsPath = join(workDirectory, 'mysql-client.cnf')
    const sqlPath = join(workDirectory, packageName(packagePrefix, 'wordpress-database.sql'))
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
      await this.processRunner.run(this.gzipExecutable, ['-t', `${sqlPath}.gz`])
      return this.describe('database', `${sqlPath}.gz`)
    } finally {
      await writeFile(credentialsPath, '', { mode: 0o600 }).catch(() => undefined)
    }
  }

  async createDatabaseArchiveFromSql(sqlPath: string): Promise<BuiltBackupArtifact> {
    await ensureNonEmptyFile(sqlPath, 'Remote WordPress database export was empty.')
    await this.processRunner.run(this.gzipExecutable, ['-f', sqlPath])
    await this.processRunner.run(this.gzipExecutable, ['-t', `${sqlPath}.gz`])
    return this.describe('database', `${sqlPath}.gz`)
  }

  async writeManifestAndChecksums(
    workDirectory: string,
    manifest: Omit<BackupManifest, 'includedArtifacts' | 'archiveNames'>,
    artifacts: BuiltBackupArtifact[],
    packagePrefix = ''
  ): Promise<{ manifest: BackupManifest, files: BuiltBackupArtifact[] }> {
    const readmePath = join(workDirectory, packageName(packagePrefix, 'RESTORE.md'))
    await writeFile(readmePath, restoreReadme(manifest, artifacts), { mode: 0o600 })
    const describedReadme = await this.describe('readme', readmePath)
    const portableArtifacts = [...artifacts, describedReadme]
    const includedArtifacts: BackupManifestArtifact[] = portableArtifacts.map(artifact => ({
      type: artifact.type,
      archiveName: artifact.archiveName,
      sizeBytes: artifact.sizeBytes,
      checksumSha256: artifact.checksumSha256
    }))
    const completeManifest: BackupManifest = {
      ...manifest,
      includedArtifacts,
      archiveNames: portableArtifacts.map(artifact => artifact.archiveName)
    }
    const manifestPath = join(workDirectory, packageName(packagePrefix, 'manifest.json'))
    await writeFile(manifestPath, `${JSON.stringify(completeManifest, null, 2)}\n`, { mode: 0o600 })
    const describedManifest = await this.describe('manifest', manifestPath)
    const checksumPath = join(workDirectory, packageName(packagePrefix, 'checksum.sha256'))
    const checksumLines = [...portableArtifacts, describedManifest]
      .map(artifact => `${artifact.checksumSha256}  ${artifact.archiveName}`)
      .join('\n')
    await writeFile(checksumPath, `${checksumLines}\n`, { mode: 0o600 })
    const describedChecksums = await this.describe('checksums', checksumPath)
    await this.verifyChecksums(workDirectory, checksumPath)
    return { manifest: completeManifest, files: [...portableArtifacts, describedManifest, describedChecksums] }
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

function packageName(prefix: string, suffix: string): string {
  const safePrefix = prefix.trim().replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-')
  return safePrefix ? `${safePrefix}_${suffix}` : suffix
}

function restoreReadme(
  manifest: Omit<BackupManifest, 'includedArtifacts' | 'archiveNames'>,
  artifacts: BuiltBackupArtifact[]
): string {
  const files = artifacts.find(artifact => artifact.type === 'files')?.archiveName ?? 'Not included'
  const database = artifacts.find(artifact => artifact.type === 'database')?.archiveName ?? 'Not included'
  return `# SiteCare portable WordPress backup\n\n` +
    `Website: ${manifest.siteDomain}\n\n` +
    `Backup ID: ${manifest.backupId}\n\n` +
    `Created: ${manifest.backupTimestamp}\n\n` +
    `Files archive: ${files}\n\n` +
    `Database archive: ${database}\n\n` +
    `## Supervised restoration\n\n` +
    `1. Verify every file against the SHA-256 checksum file.\n` +
    `2. Extract the WordPress files archive into the target web root.\n` +
    `3. Decompress the SQL archive and import it with the target host's database tooling.\n` +
    `4. Update wp-config.php and site URLs only when required by the target host.\n` +
    `5. Confirm the homepage, WordPress admin, plugins, themes, media, SSL, and permalinks.\n` +
    `6. Record the technician, timestamps, target host, and outcome in SiteCare.\n\n` +
    `SiteCare does not perform unattended restore execution.\n`
}
