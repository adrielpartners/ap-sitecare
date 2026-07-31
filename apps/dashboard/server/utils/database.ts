import { Pool, types, type PoolClient, type QueryResult, type QueryResultRow } from 'pg'
import { runMigrations } from '../database/migrations'
import { getRuntimeSettings } from './config'

types.setTypeParser(20, value => Number(value))
types.setTypeParser(1114, value => new Date(`${value}Z`).toISOString())
types.setTypeParser(1184, value => new Date(value).toISOString())

export interface QueryExecutor {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<QueryResult<Row>>
}

export interface TransactionalQueryExecutor extends QueryExecutor {
  transaction<Result>(work: (executor: QueryExecutor) => Promise<Result>): Promise<Result>
}

export interface CreateDatabaseOptions {
  applicationName?: string
  schema?: string
  maxConnections?: number
}

function validatedSchema(value: string | undefined): string {
  const schema = value?.trim() || 'public'
  if (!/^[a-z_][a-z0-9_]*$/i.test(schema)) {
    throw new Error('PostgreSQL schema names may contain only letters, numbers, and underscores.')
  }
  return schema
}

export class PostgresDatabase implements TransactionalQueryExecutor {
  private readonly pool: Pool
  private readonly schema: string
  private readonly initialization: Promise<void>

  constructor(databaseUrl: string, options: CreateDatabaseOptions = {}) {
    if (!databaseUrl.trim()) throw new Error('NUXT_DATABASE_URL is required.')
    this.schema = validatedSchema(options.schema)
    this.pool = new Pool({
      connectionString: databaseUrl,
      application_name: options.applicationName ?? 'ap-sitecare-dashboard',
      max: options.maxConnections ?? 10,
      options: `-c search_path=${this.schema},public`
    })
    this.initialization = this.initialize()
  }

  async ready(): Promise<void> {
    await this.initialization
  }

  async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = []
  ): Promise<QueryResult<Row>> {
    await this.ready()
    return this.pool.query<Row>(text, [...values])
  }

  async transaction<Result>(work: (executor: QueryExecutor) => Promise<Result>): Promise<Result> {
    await this.ready()
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await work(new TransactionExecutor(client))
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async close(): Promise<void> {
    await this.initialization.catch(() => undefined)
    await this.pool.end()
  }

  async dropSchema(): Promise<void> {
    if (this.schema === 'public') throw new Error('The public schema cannot be dropped through the application database helper.')
    await this.ready()
    await this.pool.query(`DROP SCHEMA IF EXISTS "${this.schema}" CASCADE`)
  }

  private async initialize(): Promise<void> {
    if (this.schema !== 'public') {
      await this.pool.query(`CREATE SCHEMA IF NOT EXISTS "${this.schema}"`)
    }
    await runMigrations(this.pool)
  }
}

class TransactionExecutor implements QueryExecutor {
  constructor(private readonly client: PoolClient) {}

  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = []
  ): Promise<QueryResult<Row>> {
    return this.client.query<Row>(text, [...values])
  }
}

let database: PostgresDatabase | undefined

export function createDatabase(databaseUrl: string, options: CreateDatabaseOptions = {}): PostgresDatabase {
  return new PostgresDatabase(databaseUrl, options)
}

export function useDatabase(): PostgresDatabase {
  if (database) return database

  const config = getRuntimeSettings()
  database = createDatabase(config.databaseUrl, {
    applicationName: 'ap-sitecare-dashboard'
  })
  return database
}
