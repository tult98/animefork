import { decryptM3u8, init } from "src/logic/decrypt-hls-animevsub"
import { getQualityByLabel } from "src/logic/get-quality-by-label"
import { post } from "src/logic/http"
// import { post } from "src/logic/http"

const addProtocolUrl = (file: string) =>
  file.startsWith("http") ? file : `https:${file}`

// Build the playlist URL instead of downloading the body: hls.js fetches it
// through the custom loader (the #tag is what the extension matches to set
// Referer and CORS), and that loader decrypts it (see avs-playlist.ts).
// Downloading it ourselves and stuffing it into a data:/blob: URL makes the
// loader stall with manifestLoadTimeout and loaded: 0.
const VSUB_TAG = "#animevsub-vsub_extrao"
const RE_PLAYER_ID = /id\s*=\s*"([^"]+)"/
const RE_AVS_TOKEN = /avsToken\s*=\s*"([^"]+)"/

async function resolveIframePlaylistUrl(playerUrl: string): Promise<string> {
  const pageRes = await fetch(playerUrl + VSUB_TAG)
  if (!pageRes.ok) throw new Error(`player page ${pageRes.status}`)
  const html = await pageRes.text()

  const id = RE_PLAYER_ID.exec(html)?.[1]
  const token = RE_AVS_TOKEN.exec(html)?.[1]
  if (!id || !token) throw new Error("player page: id or avsToken not found")

  const playlistUrl = new URL(`/playlist/${id}/playlist.m3u8`, new URL(playerUrl))
  playlistUrl.searchParams.set("token", token)
  playlistUrl.searchParams.set("fc", btoa("cross-origin"))
  // no #animevsub-vsub tag here: the player appends its own before fetching,
  // and a doubled tag ends the URL with something the extension does not match
  return playlistUrl.href
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
          const file = await resolveIframePlaylistUrl(config.link as string)

          config.link = [
            {
              file,
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
