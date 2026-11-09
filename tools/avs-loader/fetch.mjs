import fs from "node:fs"

const REFERER = "https://animevietsub.best/"
const USAGE = `usage:
  node fetch.mjs <player-url>
  node fetch.mjs --script <avs-loader.min.js url>`

const args = process.argv.slice(2)
const direct = args[0] === "--script"
const target = direct ? args[1] : args[0]
if (!target) {
  console.error(USAGE)
  process.exit(1)
}

async function get(url) {
  const res = await fetch(url, { headers: { Referer: REFERER } })
  if (!res.ok) throw new Error(`${url} answered ${res.status}`)
  return res.text()
}

let scriptUrl = target
if (!direct) {
  let html
  try {
    html = await get(target)
  } catch (error) {
    // Cloudflare blocks plain Node on /player/ but not on /static/
    console.error(`${error.message}
Cannot read the player page from Node. Open it in Chrome, find the
/static/avs-loader.min.js?v=... request in the network tab, then run:
  node fetch.mjs --script "<that url>"`)
    process.exit(1)
  }
  const found = /["']([^"']*\/static\/avs-loader\.min\.js\?v=[\w.-]+)["']/.exec(
    html
  )
  if (!found) {
    console.error("no /static/avs-loader.min.js?v=<version> in the player page")
    process.exit(1)
  }
  scriptUrl = new URL(found[1], target).href
}

const version = new URL(scriptUrl).searchParams.get("v")
if (!version) {
  console.error(`script url has no ?v=<version>: ${scriptUrl}`)
  process.exit(1)
}

const file = `out/avs-loader-${version}.min.js`
fs.mkdirSync("out", { recursive: true })
fs.writeFileSync(file, await get(scriptUrl))
console.log(`version ${version}\nsaved ${file}`)
