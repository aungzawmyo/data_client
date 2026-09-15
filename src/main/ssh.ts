import { createServer, type AddressInfo, type Server, type Socket } from 'net'
import { Client } from 'ssh2'
import type { ConnectionConfig } from '@shared/types'

export interface SshTunnel {
  port: number
  close: () => Promise<void>
}

export async function openSshTunnel(config: ConnectionConfig): Promise<SshTunnel> {
  const sshHost = config.sshHost?.trim()
  const sshUser = config.sshUser?.trim()
  if (!sshHost || !sshUser) {
    throw new Error('SSH host and user are required')
  }

  const client = new Client()
  const sockets = new Set<Socket>()

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      client.end()
      reject(new Error('SSH connection timed out'))
    }, 20_000)
    client.once('ready', () => {
      clearTimeout(timer)
      resolve()
    })
    client.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    client.connect({
      host: sshHost,
      port: config.sshPort || 22,
      username: sshUser,
      password: config.sshPassword || undefined,
      privateKey: config.sshPrivateKey?.trim() ? config.sshPrivateKey : undefined,
      passphrase: config.sshPassphrase || undefined,
      readyTimeout: 20_000
    })
  })

  const server: Server = createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    client.forwardOut('127.0.0.1', 0, config.host, config.port, (error, stream) => {
      if (error) {
        socket.destroy()
        return
      }
      socket.pipe(stream).pipe(socket)
    })
  })

  const port = await new Promise<number>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo
      resolve(address.port)
    })
  })

  return {
    port,
    close: async () => {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve) => server.close(() => resolve()))
      client.end()
    }
  }
}
