# Contributing Guide

Terima kasih sudah tertarik berkontribusi ke Cybx-GateawayQue. Project ini menerima kontribusi melalui pull request agar setiap perubahan dapat direview sebelum masuk ke branch utama.

## Alur Kontribusi

1. Fork repository ini.
2. Buat branch baru dari branch `main`.
3. Kerjakan perubahan di branch tersebut.
4. Jalankan test atau build yang relevan.
5. Push branch ke fork Anda.
6. Buka pull request ke branch `main` repository ini.
7. Isi template pull request dengan jelas.
8. Tunggu review sebelum perubahan di-merge.

Contoh nama branch:

```text
fix/kiro-routing-error
feature/dashboard-usage-filter
docs/update-install-guide
test/account-failover
```

## Aturan Perubahan

- Jangan push langsung ke branch `main`.
- Jangan commit file rahasia atau file runtime.
- Jangan commit `.env`, `.env.local`, token, API key, password, cookie, private key, atau credentials JSON.
- Jangan commit isi folder `Backend/data`.
- Jangan commit binary build seperti `.exe`.
- Pisahkan perubahan besar menjadi beberapa pull request kecil jika memungkinkan.
- Untuk perubahan besar, buka issue terlebih dahulu agar scope dapat disepakati.

## Area Project

- `Backend`: gateway Go, Kiro client, translator, account pool, proxy, auth, content filter, integration, dan tunnel.
- `Dashboard`: dashboard Next.js, halaman admin, state management, chat client, dan komponen UI.
- `docker`: konfigurasi container dan entrypoint.
- `README.md` dan dokumentasi lain: instruksi setup, API reference, dan panduan penggunaan.

## Standar Backend

- Ikuti pola kode Go yang sudah ada.
- Jalankan `go test ./...` dari folder `Backend` sebelum membuka pull request.
- Tambahkan atau update test untuk perubahan logika routing, auth, account pool, translator, proxy, token, atau usage tracking.
- Jangan mengubah perilaku public API tanpa mencantumkan alasan di pull request.

## Standar Dashboard

- Ikuti pola komponen dan styling yang sudah ada.
- Pastikan UI tetap konsisten dengan layout dashboard.
- Untuk perubahan visual, sertakan screenshot atau video pendek di pull request.
- Jalankan build jika perubahan menyentuh dependency, routing, atau komponen utama.

```bash
npm run build
```

## Keamanan

Sebelum membuka pull request, pastikan tidak ada data sensitif yang ikut berubah.

Periksa file yang berubah:

```bash
git status --short
git diff --stat
```

Periksa pola credential umum:

```bash
git grep -n "apiKey\|accessToken\|refreshToken\|clientSecret\|password" -- .
```

Jika tidak sengaja meng-commit credential, jangan lanjutkan pull request. Rotasi credential tersebut terlebih dahulu dan bersihkan commit sebelum push.

## Review Pull Request

Pull request akan direview berdasarkan:

- Kesesuaian scope.
- Kebenaran logic.
- Dampak ke API dan dashboard.
- Risiko credential leak.
- Hasil test atau build.
- Kejelasan penjelasan perubahan.

Maintainer dapat meminta revisi sebelum pull request di-merge.
