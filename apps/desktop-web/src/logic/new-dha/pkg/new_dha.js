const unavailable = () =>
  Promise.reject(
    new Error("new-dha is a stub. Replace pkg/ with the real build to enable playback.")
  )

export default function init() {
  return Promise.resolve()
}
export const get_m3u8_content = unavailable
export const decrypt_segment = unavailable
