import { afterEach, describe, expect, test } from "bun:test"
import { connect, createServer, type AddressInfo, type Server, type Socket } from "node:net"
import { createServer as createHttpServer } from "node:http"
import { initTor } from "../../src/util/tor"

const PROXY_ENV_KEYS = ["HTTPS_PROXY", "HTTP_PROXY", "https_proxy", "http_proxy"] as const

type Cleanup = (() => void) | undefined

// Minimal SOCKS5 (no-auth, remote-DNS) proxy. `resolve` maps the requested
// target to the actual address to connect to, so tests can use fake hostnames
// and prove the request really went through the proxy (a direct connection
// would fail DNS instead of reaching the target).
function startSocksProxy(
  port: number,
  resolve: (host: string, port: number) => { host: string; port: number },
  onConnect: (host: string, port: number) => void,
) {
  return new Promise<Server>((resolveServer) => {
    const server = createServer((client) => {
      client.on("error", () => undefined)
      let buffer = Buffer.alloc(0)
      let greeting = true
      let target: Socket | undefined
      client.on("data", (chunk) => {
        if (target) {
          target.write(chunk)
          return
        }
        buffer = Buffer.concat([buffer, chunk])
        while (buffer.length > 0) {
          if (greeting) {
            if (buffer.length < 3) return
            if (buffer[0] !== 0x05 || buffer[1] !== 0x01 || buffer[2] !== 0x00) {
              client.write(Buffer.from([0x05, 0xff]))
              client.end()
              return
            }
            client.write(Buffer.from([0x05, 0x00]))
            buffer = buffer.subarray(3)
            greeting = false
            continue
          }
          if (buffer.length < 5 || buffer[3] !== 0x03) return
          const length = buffer[4]
          if (buffer.length < 5 + length + 2) return
          const host = buffer.subarray(5, 5 + length).toString()
          const targetPort = buffer.readUInt16BE(5 + length)
          buffer = buffer.subarray(5 + length + 2)
          onConnect(host, targetPort)
          const { host: toHost, port: toPort } = resolve(host, targetPort)
          target = connect({ host: toHost, port: toPort })
          target.on("error", () => {
            client.write(Buffer.from([0x05, 0x01, 0x00, 0x01, 0, 0, 0, 0, 0, 0]))
            client.end()
          })
          target.on("data", (d) => client.write(d))
          target.on("connect", () => {
            client.write(Buffer.from([0x05, 0x00, 0x00, 0x01, 127, 0, 0, 1, 0x1f, 0x90]))
          })
          return
        }
      })
    })
    server.listen(port, "127.0.0.1", () => resolveServer(server))
  })
}

function listen(server: {
  listen(port: number, hostname: string, callback: () => void): unknown
  address(): unknown
}) {
  return new Promise<number>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve((server.address() as AddressInfo).port))
  })
}

describe("util.tor", () => {
  let proxy: Server | undefined
  let cleanup: Cleanup

  afterEach(() => {
    delete process.env.MIMOCODE_TOR
    delete process.env.MIMOCODE_TOR_PROXY
    for (const key of PROXY_ENV_KEYS) delete process.env[key]
    cleanup?.()
    proxy?.close()
    proxy = undefined
    cleanup = undefined
  })

  test("routes fetch through the Tor SOCKS5 proxy via the local bridge", async () => {
    const seen: Array<{ host: string; port: number }> = []
    const target = createHttpServer((_req, res) => res.end("probe-ok"))
    const targetPort = await listen(target)
    proxy = await startSocksProxy(
      0,
      (host, port) => (host === "route-check.example" ? { host: "127.0.0.1", port: targetPort } : { host, port }),
      (host, port) => seen.push({ host, port }),
    )
    const proxyPort = (proxy.address() as AddressInfo).port

    process.env.MIMOCODE_TOR = "1"
    process.env.MIMOCODE_TOR_PROXY = `socks5h://127.0.0.1:${proxyPort}`

    cleanup = await initTor()

    expect(process.env.HTTPS_PROXY).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)

    const res = await fetch(`http://route-check.example:${targetPort}/probe`)
    expect(await res.text()).toBe("probe-ok")
    expect(seen).toContainEqual({ host: "route-check.example", port: targetPort })
    target.close()
  })

  test("rejects with a clear error when the Tor proxy is unreachable", async () => {
    process.env.MIMOCODE_TOR = "1"
    process.env.MIMOCODE_TOR_PROXY = "socks5h://127.0.0.1:1"

    await expect(initTor()).rejects.toThrow(/cannot reach tor proxy/)
  })

  test("throws on an unsupported proxy scheme", async () => {
    process.env.MIMOCODE_TOR = "1"
    process.env.MIMOCODE_TOR_PROXY = "http://127.0.0.1:9050"

    await expect(initTor()).rejects.toThrow(/unsupported proxy protocol/)
  })

  test("no-ops and leaves the environment untouched when MIMOCODE_TOR is not set", async () => {
    const result = await initTor()

    expect(result).toBeUndefined()
    for (const key of PROXY_ENV_KEYS) expect(process.env[key]).toBeUndefined()
  })
})
