import { spawn } from 'child_process'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { ConnectionConfig, DumpResult } from '@shared/types'

function windowsPgBins(): string[] {
  const roots = ['C:\\Program Files\\PostgreSQL', 'C:\\Program Files (x86)\\PostgreSQL']
  const bins: string[] = []
  for (const root of roots) {
    if (!existsSync(root)) continue
    for (const name of readdirSync(root)) {
      const bin = join(root, name, 'bin')
      if (existsSync(bin)) bins.push(bin)
    }
  }
  return bins.sort().reverse()
}

function resolveTool(name: string): string {
  const exe = process.platform === 'win32' ? `${name}.exe` : name
  for (const dir of windowsPgBins()) {
    const full = join(dir, exe)
    if (existsSync(full)) return full
  }
  return exe
}

function runTool(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (error) => reject(error))
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
  })
}

function targetEnv(config: ConnectionConfig, host: string, port: number): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PGPASSWORD: config.password ?? '',
    PGHOST: host,
    PGPORT: String(port),
    PGUSER: config.user,
    PGDATABASE: config.database
  }
}

export async function runPgDump(
  config: ConnectionConfig,
  host: string,
  port: number,
  file: string
): Promise<DumpResult> {
  const tool = resolveTool('pg_dump')
  const format = file.toLowerCase().endsWith('.sql') ? 'p' : 'c'
  try {
    const result = await runTool(
      tool,
      ['-h', host, '-p', String(port), '-U', config.user, '-d', config.database, '-F', format, '-f', file],
      targetEnv(config, host, port)
    )
    if (result.code !== 0) {
      return { ok: false, tool, file, message: result.stderr || result.stdout || `pg_dump exited ${result.code}` }
    }
    return { ok: true, tool, file, message: `Dumped to ${file}` }
  } catch (error) {
    return {
      ok: false,
      tool,
      file,
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

export async function runPgRestore(
  config: ConnectionConfig,
  host: string,
  port: number,
  file: string
): Promise<DumpResult> {
  const isSql = file.toLowerCase().endsWith('.sql')
  const tool = resolveTool(isSql ? 'psql' : 'pg_restore')
  const args = isSql
    ? ['-h', host, '-p', String(port), '-U', config.user, '-d', config.database, '-f', file]
    : ['-h', host, '-p', String(port), '-U', config.user, '-d', config.database, '--no-owner', file]
  try {
    const result = await runTool(tool, args, targetEnv(config, host, port))
    if (result.code !== 0) {
      return { ok: false, tool, file, message: result.stderr || result.stdout || `${tool} exited ${result.code}` }
    }
    return { ok: true, tool, file, message: `Restored from ${file}` }
  } catch (error) {
    return {
      ok: false,
      tool,
      file,
      message: error instanceof Error ? error.message : String(error)
    }
  }
}

export function readSqlFile(file: string): string {
  return readFileSync(file, 'utf8')
}
