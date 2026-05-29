# Cybx-GateawayQue

<video src="https://github.com/user-attachments/assets/a084b7aa-2742-4689-a503-e31509b77ac3" controls width="100%"></video>

[Lihat video preview](https://github.com/user-attachments/assets/a084b7aa-2742-4689-a503-e31509b77ac3)

**Cybx-GateawayQue** adalah gateway proxy self-hosted untuk mengelola akses Kiro melalui dashboard admin berbasis **Next.js 16 + React 19**. Project ini menyediakan kompatibilitas API format OpenAI Chat Completions dan Anthropic Messages, pool multi-akun Kiro, pencatatan penggunaan, manajemen API key, proxy pool, content filter, integrasi tool AI coding, dan dashboard operasional.

---

## Fitur & Komponen Utama

Sistem ini berfokus pada 3 komponen utama:

1. **Gateway Backend**: Menyediakan endpoint HTTP untuk OpenAI-compatible API, Anthropic-compatible API, dashboard API, health check, statistik penggunaan, dan routing request ke Kiro upstream.
2. **Dashboard Admin**: Mengelola akun, provider, model, API key, logs, usage chart, filter, proxy pool, scraper, tunnel, keamanan, dan integrasi tool.
3. **Client / API Consumer**: Mengakses proxy melalui endpoint `/v1/chat/completions`, `/v1/messages`, atau konfigurasi integrasi tool seperti Claude Code, OpenCode, Cline, Hermes, Pi, Zed, dan Open Claw.

Fitur yang tersedia:

- Multi-account pool untuk akun Kiro.
- Round-robin routing dan failover antar akun.
- Refresh token otomatis saat token mendekati masa kedaluwarsa.
- Endpoint OpenAI Chat Completions compatible.
- Endpoint Anthropic Messages compatible.
- Streaming response dengan Server-Sent Events.
- Estimasi dan pencatatan token.
- Statistik penggunaan per model dan per akun.
- Dashboard logs untuk request dan response.
- API key generator dan toggle proteksi API.
- Custom model management.
- Content filter berbasis regex.
- Proxy pool manual dan proxy scraper.
- Cloudflare Tunnel quick mode dan named tunnel.
- Export dan import konfigurasi akun.
- Integrasi otomatis ke beberapa tool AI coding.

---

## Arsitektur & Alur Sistem

### 1. Backend Gateway

Backend berada pada folder `Backend` dan entry point utama berada di `Backend/main.go`.

Alur request utama:

1. Client mengirim request ke `/v1/chat/completions` atau `/v1/messages`.
2. Backend memvalidasi API key jika `requireApiKey` aktif.
3. Account pool memilih akun aktif yang tersedia, sesuai model yang diminta, dan belum diblokir oleh limit.
4. Payload OpenAI atau Anthropic diterjemahkan menjadi payload Kiro.
5. Backend memastikan token akun masih valid atau melakukan refresh token sebelum request diteruskan.
6. Request diteruskan ke endpoint Kiro.
7. Response upstream diterjemahkan kembali ke format OpenAI atau Anthropic.
8. Statistik penggunaan dan log request disimpan ke file runtime.

### 2. Dashboard Admin

Dashboard berada pada folder `Dashboard` dan menggunakan Next.js App Router.

Halaman utama dashboard:

- `/` untuk overview statistik.
- `/accounts` untuk daftar akun, import, export, refresh token, dan pengecekan kredit.
- `/providers` dan `/providers/kiro` untuk onboarding akun Kiro.
- `/models` untuk model bawaan dan custom model.
- `/logs` untuk riwayat request.
- `/filters` untuk content filter.
- `/api-key` untuk membuat dan menghapus API key.
- `/proxy` untuk proxy pool.
- `/proxy/scraper` untuk mengambil dan menguji proxy publik.
- `/integration` untuk auto-bind ke tool AI coding.
- `/tunnel` untuk Cloudflare Tunnel.
- `/security` untuk password dashboard dan session.
- `/chat` untuk chat client internal.
- `/docs` untuk dokumentasi API di dalam dashboard.

### 3. Penyimpanan Runtime

File runtime disimpan di `Backend/data` saat aplikasi berjalan secara lokal.

| File | Fungsi |
|------|--------|
| `config.json` | Konfigurasi utama, akun, API key, statistik global |
| `usage_records.json` | Riwayat penggunaan request |
| `custom_models.json` | Daftar custom model |
| `cybxai_settings.json` | Pengaturan dashboard, auth, dan session |
| `proxies.json` | Proxy pool |
| `proxy-settings.json` | Pengaturan proxy aktif |
| `tunnel-config.json` | Konfigurasi cloudflared |
| `tunnel-state.json` | Status tunnel |

---

## Menjalankan Aplikasi

Aplikasi berjalan pada ekosistem lokal menggunakan stack berikut:

- **Go** >= 1.21
- **Node.js** >= 20
- **npm**
- **Bun** opsional untuk instalasi dependency dashboard
- **Docker** dan **Docker Compose** untuk deployment container
- **cloudflared** opsional jika ingin memakai fitur Cloudflare Tunnel

### Menjalankan via Docker

Pada project ini sudah disediakan `Dockerfile` dan `docker-compose.yml`.

PowerShell:

```powershell
Copy-Item .env.example .env
docker compose up -d --build
```

macOS/Linux:

```bash
cp .env.example .env
docker compose up -d --build
```

Setelah dijalankan, akses URL berikut:

- **Backend/API:** `http://localhost:8085`
- **Dashboard:** `http://localhost:8084`

Konfigurasi Docker dapat diubah melalui file `.env`.

```env
ADMIN_PASSWORD=your-secure-password
BACKEND_PORT=8085
DASHBOARD_PORT=8084
NEXT_PUBLIC_API_URL=http://127.0.0.1:8085
```

Volume Docker menyimpan data runtime backend di `/app/backend/data`.

### Menjalankan Tanpa Docker

**1. Clone repository**

```bash
git clone https://github.com/cybha22/Cybx-GateawayQue.git
cd Cybx-GateawayQue
```

**2. Install dependency root**

```bash
npm install
```

**3. Install dependency dashboard**

Menggunakan npm:

```bash
cd Dashboard
npm install
cd ..
```

Alternatif menggunakan `bun` (project menyertakan `bun.lock`):

```bash
cd Dashboard
bun install
cd ..
```

Atau dari root setelah dependency root tersedia:

```bash
npm run install:all
```

Buat file environment dashboard:

PowerShell:

```powershell
Copy-Item Dashboard/.env.example Dashboard/.env.local
```

macOS/Linux:

```bash
cp Dashboard/.env.example Dashboard/.env.local
```

Isi `Dashboard/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8085
```

**4. Jalankan backend dan dashboard**

```bash
npm run dev
```

Saat memakai script root, service berjalan di:

- **Backend/API:** `http://127.0.0.1:8085`
- **Dashboard:** `http://127.0.0.1:8084`

**5. Akses dashboard**

Buka:

```text
http://127.0.0.1:8084
```

Password default backend adalah:

```text
changeme
```

Untuk mengganti password dari environment sebelum menjalankan server:

```powershell
$env:ADMIN_PASSWORD="your-secure-password"
npm run dev
```

Password juga dapat diganti melalui halaman `/security`.

---

## Menjalankan Service Secara Terpisah

Jika ingin menjalankan backend dan dashboard di terminal berbeda:

**Backend**

```bash
cd Backend
go run .
```

**Dashboard**

```bash
cd Dashboard
npm run dev
```

Jika menjalankan dashboard langsung dari folder `Dashboard`, port default dashboard mengikuti `Dashboard/package.json`, yaitu:

```text
http://127.0.0.1:7471
```

---

## Build Production

Build backend dan dashboard dari root project:

```bash
npm run build
```

Menjalankan hasil build:

```bash
npm run start
```

Output backend lokal:

```text
Backend/kiro-go.exe
```

Catatan: build dashboard dapat menampilkan peringatan Next.js tentang multiple lockfile karena root project dan folder `Dashboard` sama-sama memiliki `package-lock.json`. Peringatan ini tidak memblokir proses build.

---

## Konfigurasi Utama

Konfigurasi backend dibuat otomatis saat pertama kali aplikasi berjalan.

Default lokasi:

```text
Backend/data/config.json
```

Jika ingin menggunakan lokasi custom:

```powershell
$env:CONFIG_PATH="C:\path\to\config.json"
go run .
```

Field penting di `config.json`:

| Field | Fungsi |
|-------|--------|
| `password` | Password admin dashboard |
| `port` | Port backend |
| `host` | Host binding backend |
| `apiKey` | API key utama untuk endpoint `/v1/*` |
| `requireApiKey` | Mengaktifkan validasi API key |
| `accounts` | Daftar akun Kiro |
| `proxyURL` | Proxy aktif untuk koneksi outbound |
| `preferredEndpoint` | Endpoint upstream prioritas |
| `endpointFallback` | Mengizinkan fallback endpoint |
| `thinkingSuffix` | Suffix model untuk thinking mode |
| `identityPrompt` | Prompt identitas tambahan |
| `logLevel` | Level log backend |

Environment yang dipakai:

| Environment | Fungsi |
|-------------|--------|
| `ADMIN_PASSWORD` | Override password dashboard saat startup |
| `CONFIG_PATH` | Lokasi file config backend |
| `LOG_LEVEL` | Override level log |
| `NEXT_PUBLIC_API_URL` | Base URL backend untuk dashboard |
| `BACKEND_PORT` | Port host Docker Compose untuk backend |
| `DASHBOARD_PORT` | Port host Docker Compose untuk dashboard |

---

## Menambahkan Akun Kiro

Akun Kiro dapat ditambahkan melalui dashboard:

```text
/providers/kiro
```

Metode onboarding yang tersedia:

1. **Refresh Token** untuk menambahkan akun dari refresh token yang sudah tersedia.
2. **Web Token** untuk menambahkan akun dari token web flow.
3. **IAM SSO** untuk akun AWS IAM Identity Center.
4. **Builder ID** untuk flow AWS Builder ID.
5. **Credentials JSON** untuk import credentials dari format JSON.

Setelah akun ditambahkan, akun akan muncul di:

```text
/accounts
```

Dari halaman tersebut, akun dapat diaktifkan, dinonaktifkan, dihapus, dicek kreditnya, di-refresh tokennya, serta diekspor atau diimpor.

---

## API Reference

Base URL backend lokal:

```text
http://127.0.0.1:8085
```

### Endpoint Utama

| Method | Endpoint | Fungsi |
|--------|----------|--------|
| `POST` | `/v1/chat/completions` | OpenAI-compatible chat completions |
| `POST` | `/chat/completions` | Alias OpenAI-compatible chat completions |
| `POST` | `/api/chat/completions` | Chat completions untuk dashboard adapter |
| `POST` | `/v1/messages` | Anthropic-compatible Messages API |
| `POST` | `/messages` | Alias Anthropic-compatible Messages API |
| `POST` | `/anthropic/v1/messages` | Alias Anthropic-compatible Messages API |
| `POST` | `/v1/messages/count_tokens` | Hitung token request Messages API |
| `GET` | `/v1/models` | Daftar model |
| `GET` | `/v1/stats` | Statistik proxy |
| `GET` | `/health` | Health check |
| `GET` | `/api/system` | Informasi versi dan port |
| `ANY` | `/api/*` | API dashboard |
| `ANY` | `/admin/api/*` | API admin legacy |

### Autentikasi API

Endpoint `/v1/chat/completions`, `/v1/messages`, `/v1/messages/count_tokens`, `/v1/stats`, dan `/api/chat/completions` akan memvalidasi API key jika `requireApiKey` aktif.

Header yang didukung:

```http
Authorization: Bearer <your-api-key>
```

atau:

```http
X-Api-Key: <your-api-key>
```

API key dapat dibuat melalui halaman:

```text
/api-key
```

Endpoint `/admin/api/*` memakai:

```http
X-Admin-Password: <admin-password>
```

atau cookie:

```text
admin_password
```

### Format Model

Backend menerima model Kiro dalam format langsung maupun namespace dashboard:

```text
claude-sonnet-4.5
kr/claude-sonnet-4.5
cybxai/kr/claude-sonnet-4.5
```

Model Claude versi baru dengan format dash juga dinormalisasi otomatis, misalnya `claude-opus-4-8` menjadi `claude-opus-4.8`.

### Contoh OpenAI Chat Completions

```bash
curl http://127.0.0.1:8085/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-api-key>" \
  -d '{
    "model": "claude-sonnet-4.5",
    "stream": false,
    "messages": [
      {
        "role": "user",
        "content": "Hello"
      }
    ]
  }'
```

### Contoh Anthropic Messages API

```bash
curl http://127.0.0.1:8085/v1/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-api-key>" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-sonnet-4.5",
    "max_tokens": 1024,
    "stream": false,
    "messages": [
      {
        "role": "user",
        "content": "Explain recursion briefly."
      }
    ]
  }'
```

### Contoh List Models

```bash
curl http://127.0.0.1:8085/v1/models
```

### Contoh Health Check

```bash
curl http://127.0.0.1:8085/health
```

---

## Integrasi Tool

Halaman integrasi tersedia di:

```text
/integration
```

Backend dapat mendeteksi dan melakukan bind konfigurasi untuk tool berikut:

| Tool | Config |
|------|--------|
| Claude Code | `~/.claude/settings.json` |
| OpenCode | Config OpenCode lokal |
| Open Claw | `~/.openclaw/openclaw.json` |
| Cline | `~/.cline/endpoints.json` |
| Hermes | `~/.hermes/config.yaml` |
| Pi | `~/.pi/agent/models.json` |
| Zed | Settings Zed lokal |

Integrasi menggunakan base URL:

```text
http://127.0.0.1:8085/v1
```

---

## Proxy Pool & Scraper

Proxy pool tersedia di:

```text
/proxy
```

Fitur yang tersedia:

- Menambahkan proxy HTTP, SOCKS4, dan SOCKS5.
- Mengecek status proxy.
- Menghapus proxy dead.
- Menghapus seluruh proxy.
- Batch add proxy.
- Mengatur proxy aktif untuk koneksi outbound.

Proxy scraper tersedia di:

```text
/proxy/scraper
```

Sumber scraper yang tersedia antara lain:

- TheSpeedX SOCKS5
- TheSpeedX SOCKS4
- TheSpeedX HTTP
- Geonode HTTP/SOCKS5
- clarketm HTTP
- monosans HTTP
- monosans SOCKS5
- hookzof SOCKS5

---

## Cloudflare Tunnel

Fitur tunnel tersedia di:

```text
/tunnel
```

Mode yang didukung:

1. **Quick Tunnel** untuk membuat URL sementara `trycloudflare.com`.
2. **Named Tunnel** untuk domain Cloudflare yang sudah dikonfigurasi.

Syarat:

- Binary `cloudflared` tersedia di PATH, atau
- Path binary diatur melalui halaman `/tunnel`.

Untuk named tunnel, jalankan autentikasi Cloudflare terlebih dahulu:

```bash
cloudflared login
```

---

## Struktur Project

```text
Cybx-GateawayQue/
|-- Backend/
|   |-- auth/
|   |-- config/
|   |-- contentfilter/
|   |-- context-filtes/
|   |   |-- filters.json
|   |-- data/
|   |-- integration/
|   |-- logger/
|   |-- pool/
|   |-- proxy/
|   |-- go.mod
|   |-- go.sum
|   |-- main.go
|
|-- Dashboard/
|   |-- public/
|   |-- src/
|   |   |-- app/
|   |   |-- components/
|   |   |-- hooks/
|   |   |-- lib/
|   |   |-- stores/
|   |-- components.json
|   |-- next.config.ts
|   |-- package.json
|   |-- tsconfig.json
|
|-- docker/
|   |-- entrypoint.sh
|
|-- .dockerignore
|-- .env.example
|-- .gitignore
|-- Dockerfile
|-- docker-compose.yml
|-- package.json
|-- README.md
```

Keterangan folder:

- `Backend/auth` berisi flow autentikasi OIDC, IAM SSO, Builder ID, dan token refresh.
- `Backend/config` berisi struktur dan operasi konfigurasi.
- `Backend/contentfilter` berisi compiler dan runtime filter regex.
- `Backend/context-filtes/filters.json` berisi konfigurasi rule filter yang dimuat saat startup.
- `Backend/data` berisi file runtime (`config.json`, `usage_records.json`, dll). Folder ini dibuat otomatis saat aplikasi pertama kali berjalan.
- `Backend/integration` berisi generator konfigurasi tool AI coding.
- `Backend/logger` berisi modul logging backend.
- `Backend/pool` berisi account pool dan pemilihan akun.
- `Backend/proxy` berisi HTTP handler, translator, Kiro client, proxy pool, scraper, tunnel, dan usage tracker.
- `Dashboard/src/app` berisi route halaman dashboard.
- `Dashboard/src/components` berisi komponen UI dashboard.
- `Dashboard/src/hooks` berisi custom React hooks.
- `Dashboard/src/lib` berisi helper API dan utilitas frontend.
- `Dashboard/src/stores` berisi state management Zustand.
- `docker/entrypoint.sh` berisi entrypoint container yang menjalankan backend dan dashboard secara paralel.

---

## Lisensi

Project ini dilisensikan di bawah [MIT License](LICENSE).

```
MIT License

Copyright (c) 2026 Cybha

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
