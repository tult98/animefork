/* eslint-disable camelcase */
import { decryptM3u8, init } from "src/logic/decrypt-hls-animevsub"
import { getQualityByLabel } from "src/logic/get-quality-by-label"
import { post } from "src/logic/http"
import newDhaInit, { get_m3u8_content } from "src/logic/new-dha/pkg/new_dha"
import newDhaWasmUrl from "src/logic/new-dha/pkg/new_dha_bg.wasm?url"
// import { post } from "src/logic/http"

const addProtocolUrl = (file: string) =>
  file.startsWith("http") ? file : `https:${file}`

// The iframe server hands back a plain m3u8: the playlist itself is not
// encrypted, and its segment URIs are absolute /chunks/... URLs. The private
// wasm does the same fetch but drops every URI because it only understands the
// older /hls/<24hex>.ts layout, which leaves hls.js with zero fragments.
const VSUB_TAG = "#animevsub-vsub_extrao"
const RE_PLAYER_ID = /id\s*=\s*"([^"]+)"/
const RE_AVS_TOKEN = /avsToken\s*=\s*"([^"]+)"/

async function fetchIframePlaylist(playerUrl: string): Promise<string> {
  const pageUrl = playerUrl.includes("#") ? playerUrl : playerUrl + VSUB_TAG
  const pageRes = await fetch(pageUrl)
  if (!pageRes.ok) throw new Error(`player page ${pageRes.status}`)
  const html = await pageRes.text()

  const id = RE_PLAYER_ID.exec(html)?.[1]
  const token = RE_AVS_TOKEN.exec(html)?.[1]
  if (!id || !token)
    throw new Error("player page: id or avsToken not found")

  const playlistUrl = new URL(`/playlist/${id}/playlist.m3u8`, new URL(playerUrl))
  playlistUrl.searchParams.set("token", token)
  playlistUrl.searchParams.set("fc", btoa("cross-origin"))

  const res = await fetch(playlistUrl.href + VSUB_TAG)
  if (!res.ok) throw new Error(`playlist ${res.status} ${res.statusText}`)
  return res.text()
}

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
          let m3u8: string
          try {
            m3u8 = await fetchIframePlaylist(config.link as string)
          } catch (error) {
            if (!import.meta.env.DEV) throw error
            console.warn("[new-dha] direct playlist failed, falling back to wasm", error)
            await newDhaInit(newDhaWasmUrl)
            m3u8 = await get_m3u8_content(config.link as string)
          }

          if (import.meta.env.DEV) {
            const lines = m3u8.split(/\r?\n/)
            console.info(
              `[new-dha] playlist ${m3u8.length}B, ${lines.length} lines, ` +
                `${lines.filter((l) => l && !l.startsWith("#")).length} uri lines`
            )
            ;(window as unknown as any).__newDhaRawPlaylist = m3u8
          }

          config.link = [
            {
              // hls.js stalls on large data: URLs (manifestLoadTimeout with
              // loaded: 0); a blob URL is same-origin and resolves instantly
              file: URL.createObjectURL(
                new Blob([m3u8], { type: "application/vnd.apple.mpegurl" })
              ),
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
