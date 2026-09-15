import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { ConnectionConfig } from '@shared/types'

interface StoredConnection extends Omit<
  ConnectionConfig,
  'password' | 'sshPassword' | 'sshPrivateKey' | 'sshPassphrase'
> {
  passwordEnc?: string
  sshPasswordEnc?: string
  sshPrivateKeyEnc?: string
  sshPassphraseEnc?: string
}

function storePath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return join(dir, 'connections.json')
}

function encrypt(value: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return `enc:${safeStorage.encryptString(value).toString('base64')}`
  }
  return `b64:${Buffer.from(value, 'utf8').toString('base64')}`
}

function decrypt(value: string | undefined): string {
  if (!value) return ''
  try {
    if (value.startsWith('enc:')) {
      return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'))
    }
    if (value.startsWith('b64:')) {
      return Buffer.from(value.slice(4), 'base64').toString('utf8')
    }
  } catch {
    return ''
  }
  return ''
}

export function listConnections(): ConnectionConfig[] {
  const file = storePath()
  if (!existsSync(file)) return []
  try {
    const stored = JSON.parse(readFileSync(file, 'utf8')) as StoredConnection[]
    return stored.map((c) => ({
      ...c,
      password: decrypt(c.passwordEnc),
      sshPassword: decrypt(c.sshPasswordEnc),
      sshPrivateKey: decrypt(c.sshPrivateKeyEnc),
      sshPassphrase: decrypt(c.sshPassphraseEnc)
    }))
  } catch {
    return []
  }
}

export function saveConnection(config: ConnectionConfig): ConnectionConfig[] {
  const current = listConnections()
  const next = current.filter((c) => c.id !== config.id)
  next.push({
    ...config,
    password: config.savePassword ? config.password : '',
    sshPassword: config.savePassword ? config.sshPassword : ''
  })
  persist(next)
  return listConnections()
}

export function deleteConnection(id: string): ConnectionConfig[] {
  persist(listConnections().filter((c) => c.id !== id))
  return listConnections()
}

function persist(connections: ConnectionConfig[]): void {
  const stored: StoredConnection[] = connections.map(
    ({ password, sshPassword, sshPrivateKey, sshPassphrase, ...rest }) => ({
      ...rest,
      passwordEnc: rest.savePassword && password ? encrypt(password) : undefined,
      sshPasswordEnc: rest.savePassword && sshPassword ? encrypt(sshPassword) : undefined,
      sshPrivateKeyEnc: sshPrivateKey ? encrypt(sshPrivateKey) : undefined,
      sshPassphraseEnc: sshPassphrase ? encrypt(sshPassphrase) : undefined
    })
  )
  writeFileSync(storePath(), JSON.stringify(stored, null, 2), 'utf8')
}
