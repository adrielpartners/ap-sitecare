import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { HostingConnection } from '../domain/types'
import type { HostingConnectionAdapter, HostingConnectionAssessment } from './hosting-connection'
import { calculateRestoreCapability } from './hosting-connection'

export class SshSftpConnection implements HostingConnectionAdapter {
  readonly type = 'ssh-sftp' as const

  assess(connection: HostingConnection): HostingConnectionAssessment {
    const complete = Boolean(
      connection.remoteHost
      && connection.remotePort
      && connection.remoteUsername
      && connection.remoteRootPath
      && connection.authenticationType === 'ssh-private-key'
      && connection.credentialConfigured
    )
    const ready = complete && connection.connectionStatus === 'ready'
    return {
      type: this.type,
      implemented: true,
      backupFiles: ready,
      backupDatabase: ready,
      restoreFiles: ready,
      restoreDatabase: ready,
      restoreCapability: calculateRestoreCapability(ready, ready, ready, ready),
      messages: ready
        ? ['Hostinger SSH/SFTP source was tested successfully. Files and database export are ready.']
        : complete
          ? ['Hostinger SSH/SFTP details are complete but must pass a connection test before backup execution.']
          : ['Hostinger SSH/SFTP host, port, username, WordPress root, and private key are required.']
    }
  }

  async test(connection: HostingConnection, privateKey: string, workDirectory: string): Promise<{ hostKey: string | null }> {
    const files = await this.connectionFiles(connection, privateKey, workDirectory)
    await run('/usr/bin/ssh', [
      ...this.commonArguments(connection, files, 'ssh'),
      `${connection.remoteUsername}@${connection.remoteHost}`,
      `cd -- '${connection.remoteRootPath}' && test -r wp-config.php && command -v wp >/dev/null`
    ])
    return { hostKey: (await readFile(files.knownHostsPath, 'utf8')).trim() || null }
  }

  async downloadWordPress(
    connection: HostingConnection,
    privateKey: string,
    workDirectory: string,
    destination: string
  ): Promise<void> {
    const files = await this.connectionFiles(connection, privateKey, workDirectory)
    await mkdir(destination, { recursive: true, mode: 0o700 })
    const batchPath = join(workDirectory, 'sftp-batch.txt')
    await writeFile(
      batchPath,
      `get -R ${sftpQuote(`${connection.remoteRootPath}/.`)} ${sftpQuote(destination)}\n`,
      { mode: 0o600 }
    )
    await run('/usr/bin/sftp', [
      '-b', batchPath,
      ...this.commonArguments(connection, files, 'sftp'),
      `${connection.remoteUsername}@${connection.remoteHost}`
    ])
  }

  async exportDatabase(
    connection: HostingConnection,
    privateKey: string,
    workDirectory: string,
    sqlPath: string
  ): Promise<void> {
    const files = await this.connectionFiles(connection, privateKey, workDirectory)
    await run('/usr/bin/ssh', [
      ...this.commonArguments(connection, files, 'ssh'),
      `${connection.remoteUsername}@${connection.remoteHost}`,
      `cd -- '${connection.remoteRootPath}' && wp db export - --quiet`
    ], sqlPath)
  }

  private async connectionFiles(connection: HostingConnection, privateKey: string, workDirectory: string) {
    validateConnection(connection)
    const keyPath = join(workDirectory, 'source-key')
    const knownHostsPath = join(workDirectory, 'known_hosts')
    await writeFile(keyPath, privateKey, { mode: 0o600 })
    await chmod(keyPath, 0o600)
    await writeFile(knownHostsPath, connection.hostKey ? `${connection.hostKey.trim()}\n` : '', { mode: 0o600 })
    return { keyPath, knownHostsPath }
  }

  private commonArguments(
    connection: HostingConnection,
    files: { keyPath: string, knownHostsPath: string },
    client: 'ssh' | 'sftp'
  ): string[] {
    return [
      '-i', files.keyPath,
      client === 'ssh' ? '-p' : '-P', String(connection.remotePort),
      '-o', 'BatchMode=yes',
      '-o', 'IdentitiesOnly=yes',
      '-o', 'ConnectTimeout=20',
      '-o', `UserKnownHostsFile=${files.knownHostsPath}`,
      '-o', connection.hostKey ? 'StrictHostKeyChecking=yes' : 'StrictHostKeyChecking=accept-new'
    ]
  }
}

function validateConnection(connection: HostingConnection): void {
  if (!connection.remoteHost || !/^[a-zA-Z0-9.-]+$/.test(connection.remoteHost)) throw new Error('SSH host is invalid.')
  if (!connection.remotePort || connection.remotePort < 1 || connection.remotePort > 65535) throw new Error('SSH port is invalid.')
  if (!connection.remoteUsername || !/^[a-zA-Z0-9._-]+$/.test(connection.remoteUsername)) throw new Error('SSH username is invalid.')
  if (!connection.remoteRootPath || !/^\/[a-zA-Z0-9._/-]+$/.test(connection.remoteRootPath) || connection.remoteRootPath.includes('..')) {
    throw new Error('Remote WordPress root must be a safe absolute path without spaces or parent traversal.')
  }
}

async function run(executable: string, args: string[], stdoutPath?: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, stdio: ['ignore', stdoutPath ? 'pipe' : 'ignore', 'pipe'] })
    let stderr = ''
    let childClosed = false
    let outputFinished = !stdoutPath
    let settled = false
    const succeedWhenComplete = () => {
      if (!settled && childClosed && outputFinished) {
        settled = true
        resolve()
      }
    }
    const fail = (error: Error) => {
      if (settled) return
      settled = true
      reject(error)
    }
    child.stderr!.on('data', chunk => { stderr += String(chunk).slice(0, 1000) })
    const output = stdoutPath ? createWriteStream(stdoutPath, { mode: 0o600 }) : null
    if (output) {
      output.once('finish', () => {
        outputFinished = true
        succeedWhenComplete()
      })
      output.once('error', () => fail(new Error('The remote database export could not be written to the backup workspace.')))
      child.stdout!.pipe(output)
    }
    child.once('error', () => fail(new Error(`Required source executable is unavailable: ${executable.split('/').at(-1)}.`)))
    child.once('close', (code) => {
      if (code !== 0) {
        fail(new Error(`Hostinger SSH/SFTP operation failed with code ${code}: ${safeMessage(stderr)}`))
        return
      }
      childClosed = true
      succeedWhenComplete()
    })
  })
}

function sftpQuote(value: string): string {
  return `"${value.replace(/([\\"])/g, '\\$1')}"`
}

function safeMessage(value: string): string {
  return value.replace(/[A-Za-z0-9_-]{32,}/g, '[redacted]').trim().slice(0, 500) || 'No diagnostic was returned.'
}
