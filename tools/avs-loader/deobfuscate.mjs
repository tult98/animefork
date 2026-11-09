import fs from "node:fs"
import path from "node:path"
import vm from "node:vm"
import { deobfuscate } from "obfuscator-io-deobfuscator"
import { defaultConfig } from "obfuscator-io-deobfuscator/dist/deobfuscator/transformations/config.js"
import { parse } from "@babel/parser"
import _traverse from "@babel/traverse"
import _generate from "@babel/generator"
import * as t from "@babel/types"

const traverse = _traverse.default ?? _traverse
const generate = _generate.default ?? _generate

const input = process.argv[2]
if (!input) {
  console.error("usage: node deobfuscate.mjs <avs-loader.min.js>")
  process.exit(1)
}

function fail(stage, message) {
  console.error(`stage "${stage}" failed: ${message}`)
  process.exit(1)
}

if (!fs.existsSync(input)) fail("input", `${input} does not exist`)
const source = fs.readFileSync(input, "utf8")

let code
try {
  code = deobfuscate(source, { ...defaultConfig, silent: true })
} catch (error) {
  fail("obfuscator-io-deobfuscator", error.message)
}

// The string table, its decoder and its rotation all sit before the main
// IIFE, so running only that prefix yields the decoder without running the
// player.
const split = source.indexOf(",!function(q){'use strict';")
if (split < 0) {
  fail(
    "string-table reveal",
    "split point `,!function(q){'use strict';` not found"
  )
}
const sandbox = vm.createContext({})
try {
  vm.runInContext(`${source.slice(0, split)})`, sandbox)
} catch (error) {
  fail("string-table reveal", `prefix did not run: ${error.message}`)
}
const decoder = sandbox.a0hgs0b
if (typeof decoder !== "function") {
  fail("string-table reveal", "prefix did not define a0hgs0b")
}
code = code.replace(
  /a0hgs0b\(\s*(0x[0-9a-f]+|\d+)\s*,\s*-?(?:0x[0-9a-f]+|\d+)\s*\)/gi,
  (call, index) => {
    try {
      return JSON.stringify(decoder(Number(index)))
    } catch {
      return call
    }
  }
)

const ast = parse(code, {
  sourceType: "script",
  allowReturnOutsideFunction: true
})

const foldStrings = {
  BinaryExpression: {
    exit(p) {
      const { left, right, operator } = p.node
      if (
        operator === "+" &&
        t.isStringLiteral(left) &&
        t.isStringLiteral(right)
      ) {
        p.replaceWith(t.stringLiteral(left.value + right.value))
      }
    }
  }
}
const fold = () => {
  for (let i = 0; i < 6; i++) traverse(ast, foldStrings)
}
fold()

const table = new Map()
traverse(ast, {
  VariableDeclarator(p) {
    if (!t.isIdentifier(p.node.id, { name: "z" })) return
    if (!t.isObjectExpression(p.node.init)) return
    for (const prop of p.node.init.properties) {
      if (!t.isObjectProperty(prop)) continue
      table.set(
        t.isStringLiteral(prop.key) ? prop.key.value : prop.key.name,
        prop.value
      )
    }
  }
})
if (!table.size) fail("z-table inline", "no `z = { ... }` helper table found")

const isSimple = (node) => t.isIdentifier(node) || t.isLiteral(node)
const isPlainKey = (p) =>
  p.parent.type === "MemberExpression" &&
  p.key === "property" &&
  !p.parent.computed

function keyOf(node) {
  if (
    !t.isMemberExpression(node) ||
    !t.isIdentifier(node.object, { name: "z" })
  )
    return null
  if (node.computed && t.isStringLiteral(node.property))
    return node.property.value
  if (!node.computed && t.isIdentifier(node.property)) return node.property.name
  return null
}

// Inlines `function (a, b) { return <expr> }` at a call site. Gives up when a
// parameter used more than once would duplicate a non-trivial argument.
function inlineCall(fn, args) {
  if (!t.isFunctionExpression(fn) || fn.body.body.length !== 1) return null
  if (!t.isReturnStatement(fn.body.body[0])) return null
  const names = fn.params.map((param) => param.name)
  const wrap = t.file(
    t.program([
      t.expressionStatement(t.cloneNode(fn.body.body[0].argument, true))
    ])
  )
  const uses = {}
  traverse(wrap, {
    Identifier(p) {
      if (names.includes(p.node.name) && !isPlainKey(p)) {
        uses[p.node.name] = (uses[p.node.name] || 0) + 1
      }
    }
  })
  if (names.some((name, i) => uses[name] > 1 && !isSimple(args[i]))) return null
  traverse(wrap, {
    Identifier(p) {
      const i = names.indexOf(p.node.name)
      if (i < 0 || isPlainKey(p)) return
      if (p.parent.type === "ObjectProperty" && p.key === "key") return
      p.replaceWith(t.cloneNode(args[i] ?? t.identifier("undefined"), true))
      p.skip()
    }
  })
  return wrap.program.body[0].expression
}

for (let round = 0, changed = 1; changed && round < 30; round++) {
  changed = 0
  traverse(ast, {
    CallExpression(p) {
      const key = keyOf(p.node.callee)
      if (!key || !table.has(key)) return
      const inlined = inlineCall(table.get(key), p.node.arguments)
      if (inlined) {
        p.replaceWith(inlined)
        changed++
      }
    },
    MemberExpression(p) {
      const key = keyOf(p.node)
      if (!key || !table.has(key)) return
      if (t.isCallExpression(p.parent) && p.parent.callee === p.node) return
      const value = table.get(key)
      if (t.isLiteral(value)) {
        p.replaceWith(t.cloneNode(value))
        changed++
      }
    }
  })
  fold()
}

const output = generate(ast, { jsescOption: { minimal: true } }).code
const name = path
  .basename(input)
  .replace(/\.js$/, "")
  .replace(/\.min$/, "")
const file = path.join("out", `${name}.clean.js`)
fs.mkdirSync("out", { recursive: true })
fs.writeFileSync(file, output)

const count = (pattern) => output.match(pattern)?.length ?? 0
console.log(`wrote ${file} (${output.split("\n").length} lines)`)
console.log(`remaining a0hgs0b( calls: ${count(/(?<!function )a0hgs0b\(/g)}`)
console.log(`remaining z[ references:  ${count(/\bz\[/g)}`)
