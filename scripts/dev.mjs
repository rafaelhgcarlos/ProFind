import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const forwardedArguments = process.argv.slice(2)
const commands = [
  {
    name: 'frontend',
    entry: resolve(projectRoot, 'node_modules/vite/bin/vite.js'),
    arguments: forwardedArguments,
  },
  {
    name: 'image-worker',
    entry: resolve(projectRoot, 'node_modules/wrangler/bin/wrangler.js'),
    arguments: [
      'dev',
      '--config',
      'worker/wrangler.jsonc',
      '--port',
      '8787',
    ],
  },
]

let stopping = false
const children = commands.map(({ name, entry, arguments: args }) => {
  const child = spawn(process.execPath, [entry, ...args], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
  })
  child.once('error', (error) => {
    console.error(`[${name}] Não foi possível iniciar: ${error.message}`)
  })
  return { name, child }
})

function stopAll(exitCode) {
  if (stopping) return
  stopping = true
  process.exitCode = exitCode
  for (const { child } of children) {
    if (!child.killed) child.kill()
  }
}

for (const { name, child } of children) {
  child.once('exit', (code, signal) => {
    if (stopping) return
    const reason = signal ? `sinal ${signal}` : `código ${code ?? 1}`
    console.error(`[${name}] Processo encerrado com ${reason}.`)
    stopAll(code ?? 1)
  })
}

process.once('SIGINT', () => stopAll(0))
process.once('SIGTERM', () => stopAll(0))
