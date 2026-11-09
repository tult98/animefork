# new-dha probe

Công cụ để chạy **module wasm thật** của `new-dha` (module private, bị stub trong repo này) ở local và xem nó request gì, trả gì.

## Vì sao có cái này

`apps/desktop-web/src/logic/new-dha/pkg/` trong repo là stub: file `new_dha_bg.wasm` chỉ 8 byte, `get_m3u8_content` / `decrypt_segment` reject ngay, nên server iframe (`stream.googleapiscdn.com`) không phát được.

Bản build thật vẫn còn trong web app đã deploy công khai:

- wasm: `https://animevsub.netlify.app/assets/new_dha_bg-DYkE-i0Y.wasm` (1.35 MB, sha256 `bc925a88...d535a`)
- glue wasm-bindgen: nằm inline trong chunk `_season-BZevj6JN.js` của cùng bản deploy

Đã lấy về `pkg/new_dha_bg.wasm` + `pkg/glue.mjs`, nên **app chạy được ngay** (xem mục dưới). Cái còn thiếu chỉ là hiểu thuật toán để port sang TS.

## Chạy app với wasm thật

`pkg/new_dha.js` đã được thay bằng bản dùng wasm thật thay vì stub. Không phải sửa call site (`player-link.ts`, `hls-patched.ts` giữ nguyên). Chỉ cần:

```bash
pnpm install
pnpm nx run desktop-web:dev   # hoặc target dev hiện có trong repo
```

Nếu bản build deploy đổi hash file wasm, tải lại và ghi đè `pkg/new_dha_bg.wasm`, rồi chạy lại `extract-glue.mjs`.

## Chạy probe

Cần một link player thật, dạng `https://stream.googleapiscdn.com/player/<hash>` (lấy từ DevTools khi bấm play một tập dùng server iframe).

```bash
node tools/new-dha-probe/probe.mjs "https://stream.googleapiscdn.com/player/<hash>"
```

Nó sẽ:

1. load wasm thật,
2. gọi `get_m3u8_content(link)`: fetch trang player, bóc `avsToken`, lấy playlist, giải mã,
3. in playlist đã giải mã + chạy `decrypt_segment()` trên vài segment đầu,
4. ghi ra `out/`: `playlist.m3u8`, `segments.json`, `requests.json`, `req-NN.txt` (body từng request).

`out/` đã ignore, không commit.

### Nếu gặp Cloudflare

`/player/*` bị Cloudflare managed challenge với IP datacenter. IP nhà thường qua được. Nếu vẫn 403:

```bash
node tools/new-dha-probe/probe.mjs "<url>" \
  --cookie "cf_clearance=..." \
  --ua "<user-agent của đúng browser đó>"
```

Lấy `cf_clearance` trong DevTools → Application → Cookies. Cookie không bị ghi vào file log.

## Cái đang chờ

Thuật toán nằm **toàn bộ trong wasm** (73 import đều là glue `fetch` / `crypto.subtle` / `TextDecoder`, không có logic trong JS). String table cho biết khung:

- `/playlist/`, `/playlist.m3u8?token=`
- regex `avsToken\s*=\s*"([^"]+)"`, `token_avsCryptoHarden\s*=\s*true`, `bad_i_param`
- `AES-CTR`, `AES-GCM`, `HMAC` + `SHA-256` + `sign`
- lỗi `SK_GLOBAL_DECODED not set; call get_m3u8_content first` → key playlist được cache global, `decrypt_segment` phụ thuộc lần gọi trước

Muốn port sang TS thì cần đúng một lần chạy probe thành công (playlist + vài cặp URL trước/sau của `decrypt_segment`).
