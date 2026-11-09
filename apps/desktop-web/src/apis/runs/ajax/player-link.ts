/* eslint-disable camelcase */
import { decryptM3u8, init } from "src/logic/decrypt-hls-animevsub"
import { getQualityByLabel } from "src/logic/get-quality-by-label"
import { post } from "src/logic/http"
import newDhaInit, { get_m3u8_content } from "src/logic/new-dha/pkg/new_dha"
import newDhaWasmUrl from "src/logic/new-dha/pkg/new_dha_bg.wasm?url"
// import { post } from "src/logic/http"

const addProtocolUrl = (file: string) =>
  file.startsWith("http") ? file : `https:${file}`

interface PlayerLinkReturn {
  readonly link:
    | {
        file: string
        label: "FHD|HD" | "HD" | "FHD" | `${720 | 360 | 340}p`
        qualityCode: ReturnType<typeof getQualityByLabel>
        preload?: string
        type:
          | "hls"
          | "aac"
          | "f4a"
          | "mp4"
          | "f4v"
          | "m3u"
          | "m3u8"
          | "m4v"
          | "mov"
          | "mp3"
          | "mpeg"
          | "oga"
          | "ogg"
          | "ogv"
          | "vorbis"
          | "webm"
          | "youtube"
      }[]
    | string
  readonly playTech: "api" | "trailer" | "iframe"
}

type Writeable<T> = {
  -readonly [P in keyof T]: T[P] extends object ? Writeable<T[P]> : T[P]
}

export function PlayerLink(config: {
  id: string
  play: string
  hash: string
}): Promise<PlayerLinkReturn> {
  const { id, play, hash: link } = config
  //  "#animevsub-vsub" + "_extra"
  return (
    post("/ajax/player", {
      id,
      play,
      link,
      backuplinks: "1"
    })
      // .then(({ data }) => {
      // return fetch(`${C_URL}/ajax/player#animevsub-vsub_extrao`, {
      //   method: "post",
      //   body: new URLSearchParams({ id, play, link, backuplinks: "1" })
      // })
      .then((res) => JSON.parse(res.data) as Writeable<PlayerLinkReturn>)
      .then(async (config) => {
        if (!config.link)
          throw Object.assign(new Error("This server not found."), {
            not_found: true
          })

        if (config.playTech === "iframe") {
          await newDhaInit(newDhaWasmUrl)
          // dev: capture the raw CDN responses the wasm makes (playlist, key)
          if (import.meta.env.DEV) {
            const origFetch = window.fetch
            window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
              const res = await origFetch(input as RequestInfo, init)
              const url = typeof input === "string" ? input : (input as Request).url
              if (/playlist\.m3u8|seg-key/.test(url)) {
                const clone = res.clone()
                const buf = await clone.arrayBuffer()
                const text = new TextDecoder().decode(buf)
                console.info(
                  `[new-dha raw] ${res.status} ${url}\nheaders: ` +
                    JSON.stringify(Object.fromEntries(res.headers)) +
                    `\nbody(${text.length}): ${text.slice(0, 500)}`
                )
                if (/playlist\.m3u8/.test(url)) {
                  ;(window as unknown as any).__newDhaRawPlaylist = text
                } else {
                  ;(window as unknown as any).__newDhaKeyHex = Array.from(
                    new Uint8Array(buf)
                  )
                    .map((b) => b.toString(16).padStart(2, "0"))
                    .join("")
                }
              }
              return res
            }
            setTimeout(() => {
              window.fetch = origFetch
            }, 30_000)
          }
          const m3u8 = await get_m3u8_content(config.link as string)
          if (import.meta.env.DEV) {
            const lines = m3u8.split(/\r?\n/)
            console.info(
              `[new-dha] playlist ${m3u8.length}B, ${lines.length} lines, ` +
                `${lines.filter((l) => l && !l.startsWith("#")).length} uri lines`
            )
            console.info(
              "[new-dha] head:\n" + lines.slice(0, 12).join("\n") +
                "\n[new-dha] tail:\n" + lines.slice(-6).join("\n")
            )
            ;(window as unknown as any).__newDhaPlaylist = m3u8
          }
          config.link = [
            {
              file: `data:application/vnd.apple.mpegurl;base64,${btoa(m3u8)}`,
              label: "HD",
              preload: "auto",
              qualityCode: getQualityByLabel("HD"),
              type: "hls"
            }
          ]

          return config
        }

        if (typeof config.link === "string")
          throw new Error("Can't decryption this format")

        await Promise.all(
          config.link.map(async (item) => {
            if (item.file.includes("://")) {
              item.file = addProtocolUrl(item.file)
            } else {
              await init()
              item.file = `data:application/vnd.apple.mpegurl;base64,${btoa(
                await decryptM3u8(item.file)
              )}`

              item.label = "HD"
              item.preload = "auto"
              item.type = "hls"
            }

            switch (
              (item.label as typeof item.label | undefined)?.toUpperCase() as
                | Uppercase<Exclude<typeof item.label, undefined>>
                | undefined
            ) {
              case "HD":
                if (item.preload) item.label = "FHD|HD"
                break
              case undefined:
                item.label = "HD"
                break
            }
            item.qualityCode = getQualityByLabel(item.label)
            item.type ??= "mp4"
          })
        )

        return config
      })
  )
}
