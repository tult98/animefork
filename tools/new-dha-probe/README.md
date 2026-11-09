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

## Lỗi `{"status":"fail","message":"domain not allowed"}`

Token của playlist được mint lúc fetch **trang player**, và gắn với domain gọi nó. App chạy ở `localhost:9000` nên bị chặn. App deploy thật (`animevsub.eu.org`) thì qua.

Cách né, không cần sửa site: cho traffic đi qua proxy local, proxy gắn `Referer`/`Origin` của domain được phép.

```bash
# 1. chạy proxy
node tools/new-dha-probe/dev-proxy.mjs --referer https://animevietsub.best/

# 2. trong app, mở DevTools console, dán:
window.__NEW_DHA_PROXY__ = "http://127.0.0.1:8787/"

# 3. bấm play lại
```

`pkg/new_dha.js` sẽ bọc `fetch` để đẩy mọi request `https://...` qua proxy. Proxy log status, số byte, `x-edge-tag` của từng request ra `tools/new-dha-probe/out/proxy.log`.

Nếu vẫn "domain not allowed": đổi `--referer` sang domain khác mà site đang chấp nhận (`animevsub.eu.org`, `animevietsub.id`, `animevietsub.pl`). Cách chắc chắn nhất là xem header `Referer` của request `playlist.m3u8` đang chạy được trên site thật: DevTools → Network → chọn request → Request Headers.

## Giao thức đã dựng lại được 🍌

Từ việc chạy wasm với một trang player giả (`fake-player.mjs`):

1. `GET <link>#animevsub-vsub_extrao`, tải trang player.
2. Bóc HTML bằng regex: `id\s*=\s*"([^"]+)"`, `avsToken\s*=\s*"([^"]+)"`, `token_avsCryptoHarden\s*=\s*true`, `_avsCryptoHardenShadow\s*=\s*true`.
3. `GET /playlist/<id>/playlist.m3u8?token=<avsToken>&fc=<base64("cross-origin")>`.
4. Response là envelope: cần header `X-Envelope` + `X-edge-Tag` (thiếu thì lỗi `Can't find stag`), có `X-Cache-Node`, `X-Request-Trace`, `X-Proxy-Digest`.
5. Giải mã bằng `AES-CTR`/`AES-GCM` + `HMAC`/`SHA-256` (và `SHA-1` cho digest), key cache lại trong biến global, lỗi `SK_GLOBAL_DECODED not set` nếu gọi `decrypt_segment` trước.
6. Segment: `decrypt_segment(url)` trả URL mới; chỉ áp cho dạng `/hls/([0-9a-f]{24})\.ts`, URL khác trả nguyên.

Còn thiếu để port sang TS: một playlist response thật (kèm header `X-Envelope`/`X-edge-Tag`) và vài cặp vào/ra của `decrypt_segment`.

