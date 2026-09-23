import { readdir, readFile } from 'node:fs/promises'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const bundleRoot = fileURLToPath(new URL('../dist/', import.meta.url))
const forbidden = ['IMAGEKIT_PRIVATE_KEY']
if (process.env.IMAGEKIT_PRIVATE_KEY) {
  forbidden.push(process.env.IMAGEKIT_PRIVATE_KEY)
}

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name)
      return entry.isDirectory() ? files(path) : [path]
    }),
  )
  return nested.flat()
}

const textExtensions = new Set(['.html', '.js', '.css', '.map', '.json'])
for (const path of await files(bundleRoot)) {
  if (!textExtensions.has(extname(path))) continue
  const content = await readFile(path, 'utf8')
  for (const value of forbidden) {
    if (value && content.includes(value)) {
      throw new Error(`Possível segredo do ImageKit encontrado no bundle: ${path}`)
    }
  }
}

console.log('Bundle verificado: nenhuma chave privada do ImageKit foi encontrada.')
