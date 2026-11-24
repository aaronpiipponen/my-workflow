// Capture the coordinator's feed in the OpenCode session view as a documentation screenshot.
//
// Usage: node docs/assets/capture/coordinator-feed.mjs <workspace root> [output path] [message text]
//
// The workspace root's `.opencode/coordinator/links.json` names the coordinator session. The script
// starts a headless Chromium, authenticates through a fresh `opencode pair` link, opens that session
// and scrolls the last message containing the given text into view before writing a PNG.

import { execFileSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, "..", "..", "..")
const workspace = path.resolve(process.argv[2] ?? "")
const output = path.resolve(process.argv[3] ?? path.join(ROOT, "docs", "assets", "screenshots", "coordinator-feed.png"))
const phrase = process.argv[4] ?? "FEED from"

if (!process.argv[2]) {
  console.error("usage: node docs/assets/capture/coordinator-feed.mjs <workspace root> [output path]")
  process.exit(2)
}

function browser() {
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(process.env.HOME, ".cache", "ms-playwright")
  const shell = execFileSync("find", [cache, "-type", "f", "-path", "*chrome-headless-shell-linux-*/chrome-headless-shell"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean)
    .sort()
    .at(-1)
  if (!shell) throw new Error(`no Chromium headless shell under ${cache}`)
  return shell
}

function pairURL() {
  const text = execFileSync("opencode", ["pair"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
  const match = text.match(/https?:\/\/[^\s]+\/auth\/connect\/[A-Za-z0-9_-]+/)
  if (!match) throw new Error("opencode pair printed no connect link")
  return match[0]
}

async function connect() {
  const target = (await (await fetch("http://127.0.0.1:9223/json")).json())[0]
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true })
    ws.addEventListener("error", reject, { once: true })
  })
  let id = 0
  const pending = new Map()
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data)
    const resolve = pending.get(message.id)
    if (resolve) {
      pending.delete(message.id)
      resolve(message)
    }
  })
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const call = ++id
      pending.set(call, resolve)
      ws.send(JSON.stringify({ id: call, method, params }))
    })
  return { send, close: () => ws.close() }
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const profile = mkdtempSync(path.join(tmpdir(), "docs-coordinator-feed-"))
const chrome = spawn(browser(), [
  "--no-sandbox",
  "--hide-scrollbars",
  "--remote-debugging-port=9223",
  `--user-data-dir=${profile}`,
  "--window-size=1200,720",
  "about:blank",
])

try {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await fetch("http://127.0.0.1:9223/json/version")
      break
    } catch {
      await wait(100)
    }
  }
  const cdp = await connect()
  await cdp.send("Page.enable")
  await cdp.send("Runtime.enable")
  // The interface follows the reader's colour scheme, so capture it as a dark-mode reader sees it.
  await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "dark" }] })
  const pair = pairURL()
  await cdp.send("Page.navigate", { url: pair })
  await wait(2500)
  const origin = (await cdp.send("Runtime.evaluate", { expression: "location.origin", returnByValue: true })).result.result.value
  const links = JSON.parse(readFileSync(path.join(workspace, ".opencode", "coordinator", "links.json"), "utf8"))
  if (!links.coordinator) throw new Error(`${workspace} has no coordinator session`)
  const key = Buffer.from(origin).toString("base64url")
  await cdp.send("Page.navigate", { url: `${origin}/server/${key}/session/${links.coordinator}` })
  await wait(3000)
  // A moved session view shows an internal move notice; hide it before the capture.
  const clean = `(() => {
    for (const entry of document.querySelectorAll("*")) {
      if (!(entry.textContent ?? "").includes("Moved to /tmp/opencode") || entry.childElementCount > 4) continue
      let node = entry
      while (node && node.getBoundingClientRect().height < 200) {
        node.style.display = "none"
        node = node.parentElement
      }
    }
    return true
  })()`
  await cdp.send("Runtime.evaluate", { expression: clean, returnByValue: true })
  const scroll = `(() => {
    const node = Array.from(document.querySelectorAll("p, div, pre"))
      .filter((entry) => entry.innerText?.includes(${JSON.stringify(phrase)}))
      .at(-1)
    if (!node) return "missing"
    node.scrollIntoView({ block: "center" })
    return "scrolled"
  })()`
  if ((await cdp.send("Runtime.evaluate", { expression: scroll, returnByValue: true })).result.result.value !== "scrolled") {
    throw new Error(`the coordinator session has no message containing ${phrase}`)
  }
  await wait(1200)
  // The session was moved for the capture, and the view shows that internal notice below the
  // message; the clip stops above it.
  const shot = await cdp.send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1200, height: 420, scale: 1 } })
  mkdirSync(path.dirname(output), { recursive: true })
  writeFileSync(output, Buffer.from(shot.result.data, "base64"))
  console.log(output)
  cdp.close()
} finally {
  chrome.kill("SIGTERM")
  if (!existsSync(output)) rmSync(profile, { recursive: true, force: true })
}
