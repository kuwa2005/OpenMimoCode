import { connect, createServer, type Socket } from "node:net"
import { Flag } from "@/flag/flag"
import { Log } from "@/util"

const DEFAULT_TOR_PROXY = "socks5h://127.0.0.1:9050"
const PROXY_ENV_KEYS = ["HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"] as const

function proxyAddress() {
  return Flag.MIMOCODE_TOR_PROXY || DEFAULT_TOR_PROXY
}

function parseProxyAddress(address: string): { host: string; port: number } {
  const url = new URL(address)
  if (url.protocol !== "socks:" && url.protocol !== "socks5:" && url.protocol !== "socks5h:") {
    throw new Error(
      `unsupported proxy protocol "${url.protocol}" for --tor (expected socks5://, socks5h://, or socks://)`,
    )
  }
  return { host: url.hostname, port: url.port ? Number(url.port) : 9050 }
}

// Completes the SOCKS5 handshake (no-auth) over an established socket,
// resolving after the proxy confirms the CONNECT request. The hostname is sent
// as-is (ATYP 0x03) so the proxy performs remote DNS resolution, avoiding DNS
// leaks on the local machine.
function socks5Handshake(socket: Socket, host: string, port: number) {
  return new Promise<void>((resolve, reject) => {
    let buffer = Buffer.alloc(0)
    let greeting = true
    const hostname = Buffer.from(host, "utf8")
    const connectRequest = Buffer.concat([
      Buffer.from([0x05, 0x01, 0x00, 0x03, hostname.length]),
      hostname,
      Buffer.from([(port >> 8) & 0xff, port & 0xff]),
    ])
    const cleanup = () => {
      socket.off("data", onData)
      socket.off("error", onError)
    }
    const fail = (message: string) => {
      cleanup()
      reject(new Error(message))
    }
    const onError = (error: Error) => {
      cleanup()
      reject(error)
    }
    const onData = (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
      if (greeting) {
        if (buffer.length < 2) return
        if (buffer[0] !== 0x05 || buffer[1] !== 0x00) {
          fail(`tor proxy did not accept SOCKS5 no-auth handshake (reply ${buffer[1]})`)
          return
        }
        buffer = buffer.subarray(2)
        greeting = false
        socket.write(connectRequest)
      }
      if (buffer.length < 4) return
      if (buffer[0] !== 0x05 || buffer[1] !== 0x00) {
        fail(`tor proxy refused connection to ${host}:${port} (SOCKS5 reply ${buffer[1]})`)
        return
      }
      const addressLength =
        buffer[3] === 0x01 ? 4 : buffer[3] === 0x04 ? 16 : buffer[3] === 0x03 ? 1 + buffer[4] : undefined
      if (addressLength === undefined) {
        fail(`tor proxy returned unexpected address type ${buffer[3]}`)
        return
      }
      if (buffer.length < 4 + addressLength + 2) return
      cleanup()
      resolve()
    }
    socket.on("data", onData)
    socket.on("error", onError)
    socket.write(Buffer.from([0x05, 0x01, 0x00]))
  })
}

function connectThroughProxy(proxy: { host: string; port: number }, host: string, port: number) {
  return new Promise<Socket>((resolve, reject) => {
    const socket = connect({ host: proxy.host, port: proxy.port })
    const fail = (error: unknown) => {
      socket.off("connect", onConnect)
      socket.off("error", onError)
      socket.destroy()
      reject(error instanceof Error ? error : new Error(String(error)))
    }
    const onError = (error: Error) => fail(error)
    const onConnect = () => {
      socks5Handshake(socket, host, port).then(
        () => {
          socket.off("error", onError)
          resolve(socket)
        },
        (error) => fail(error),
      )
    }
    socket.once("connect", onConnect)
    socket.once("error", onError)
  })
}

function probeTor(proxy: { host: string; port: number }) {
  return new Promise<void>((resolve, reject) => {
    const socket = connect({ host: proxy.host, port: proxy.port })
    let settled = false
    const finish = (fn: () => void) => {
      if (settled) return
      settled = true
      socket.removeAllListeners()
      socket.destroy()
      fn()
    }
    socket.once("connect", () => socket.write(Buffer.from([0x05, 0x01, 0x00])))
    socket.once("data", (chunk) =>
      finish(() => {
        if (chunk.length >= 2 && chunk[0] === 0x05 && chunk[1] === 0x00) resolve()
        else reject(new Error(`tor proxy did not accept SOCKS5 no-auth handshake (reply ${chunk[1] ?? "?"})`))
      }),
    )
    socket.once("error", (error) =>
      finish(() => reject(new Error(`cannot reach tor proxy at ${proxy.host}:${proxy.port}: ${error.message}`))),
    )
    socket.setTimeout(3_000, () =>
      finish(() => reject(new Error(`cannot reach tor proxy at ${proxy.host}:${proxy.port}: timed out`))),
    )
  })
}

// Local forward proxy that bridges plain-HTTP absolute-form requests and HTTPS
// CONNECT tunnels through the Tor SOCKS5 proxy. Bun's native fetch (used by
// every provider) supports http(s) proxies via HTTPS_PROXY/HTTP_PROXY but
// rejects socks:// proxies, so this bridge is what actually speaks SOCKS5 to
// Tor. Bytes are relayed transparently in both directions once the tunnel is up.
function createBridge(proxy: { host: string; port: number }) {
  const server = createServer((client) => {
    let buffer = Buffer.alloc(0)
    let pending: Buffer | null = null
    let tor: Socket | null = null
    client.on("error", () => undefined)
    const onData = (chunk: Buffer) => {
      if (tor) {
        tor.write(chunk)
        return
      }
      buffer = Buffer.concat([buffer, chunk])
      if (pending !== null) return
      const headEnd = buffer.indexOf("\r\n\r\n")
      if (headEnd === -1) return
      const head = buffer.subarray(0, headEnd).toString("latin1")
      pending = buffer.subarray(headEnd + 4)
      buffer = Buffer.alloc(0)
      const [requestLine] = head.split("\r\n")
      const [method, target] = requestLine.split(" ")
      const isConnect = method === "CONNECT"
      let parsed: URL
      try {
        parsed = new URL(isConnect ? `http://${target}` : target)
      } catch {
        client.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n")
        return
      }
      const host = parsed.hostname
      const port = parsed.port ? Number(parsed.port) : parsed.protocol === "https:" ? 443 : 80
      const path = `${parsed.pathname}${parsed.search}`
      const forwarded = isConnect
        ? null
        : [
            `${method} ${path} ${requestLine.split(" ")[2] ?? "HTTP/1.1"}`,
            ...head
              .split("\r\n")
              .slice(1)
              .filter((line) => {
                const key = line.slice(0, line.indexOf(":")).trim().toLowerCase()
                return key !== "connection" && key !== "proxy-connection" && key !== "proxy-authorization"
              }),
            "Connection: close",
            "",
            "",
          ].join("\r\n")
      connectThroughProxy(proxy, host, port).then(
        (tunnel) => {
          tor = tunnel
          tunnel.on("data", (d) => client.write(d))
          tunnel.on("error", () => client.destroy())
          tunnel.on("close", () => client.end())
          if (isConnect) client.write("HTTP/1.1 200 Connection Established\r\n\r\n")
          else tunnel.write(forwarded ?? "")
          if (pending !== null && pending.length > 0) tunnel.write(pending)
          pending = null
          if (buffer.length > 0) {
            tunnel.write(buffer)
            buffer = Buffer.alloc(0)
          }
        },
        () => client.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n"),
      )
    }
    client.on("data", onData)
  })
  return server
}

// Routes every in-process HTTP request (model/API providers, HttpClient,
// upgrade checks) through Tor by starting a local forward proxy and pointing
// HTTPS_PROXY/HTTP_PROXY at it. Returns a cleanup function that restores the
// proxy environment and closes the bridge. No-op unless MIMOCODE_TOR is set.
export async function initTor() {
  if (!Flag.MIMOCODE_TOR) return
  const proxy = parseProxyAddress(proxyAddress())
  await probeTor(proxy)
  const server = createBridge(proxy)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()))
  const address = server.address()
  if (address === null || typeof address === "string") {
    server.close()
    throw new Error("tor bridge failed to bind")
  }
  const bridgeUrl = `http://127.0.0.1:${address.port}`
  const previous = new Map(PROXY_ENV_KEYS.map((key) => [key, process.env[key] as string | undefined]))
  for (const key of PROXY_ENV_KEYS) process.env[key] = bridgeUrl
  Log.Default.info("tor", {
    proxy: proxyAddress(),
    bridge: bridgeUrl,
    note: "routing network traffic through Tor",
  })
  return () => {
    for (const key of PROXY_ENV_KEYS) {
      const value = previous.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
    server.close()
  }
}
