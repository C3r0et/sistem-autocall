# Sistem AutoCall — API Documentation

**Base URL**: `http://<server-ip>:3001`  
**Versi**: 2.2 | **Diperbarui**: 2026-03-27

## Autentikasi

Semua endpoint (kecuali `/api/auth/*` dan `/api/health`) memerlukan JWT token:
```
Authorization: Bearer <your-token>
```
Token didapat dari endpoint login. Masa berlaku: **30 hari**.

---

## 1. Auth — `/api/auth`

### `POST /api/auth/login`
Login **khusus Admin** menggunakan email.

> Hanya akun dengan `role: "admin"` yang dapat menggunakan endpoint ini.

```json
// Request
{ "email": "abdi@sahabatsakinah.id", "password": "password_admin" }

// Response 200
{
  "auth": true,
  "token": "jwt...",
  "user": { "id": 1, "email": "abdi@sahabatsakinah.id", "role": "admin" }
}

// Response 403 — jika bukan admin
{ "error": "Akses ditolak. Gunakan Employee ID untuk login." }
```

---

### `POST /api/auth/employee-login`
Login **karyawan PT Sahabat Sakinah Senter** menggunakan Employee ID.

**Alur verifikasi:**
1. Cek `employee_id` ke DB karyawan eksternal (`10.9.9.110`) — jika tidak ditemukan → **403**
2. Verifikasi password ke database lokal (SQLite) — jika salah → **401**
3. Cek masa aktif akun — jika expired → **403**

```json
// Request
{ "employee_id": "EMP001", "password": "password_lokal" }

// Response 200 (sukses)
{
  "auth": true,
  "token": "jwt...",
  "user": { "id": 5, "employee_id": "EMP001", "role": "user", "isSubscribed": 0, "trialEndsAt": "..." }
}

// Response 403 — employee_id tidak terdaftar sebagai karyawan
{ "error": "Employee ID tidak terdaftar sebagai karyawan PT Sahabat Sakinah Senter" }

// Response 404 — karyawan valid tapi belum punya akun lokal
{ "error": "Akun belum dibuat. Silakan hubungi admin.", "hint": "employee_verified" }

// Response 403 — akses expired
{ "auth": false, "error": "Akses habis. Silakan hubungi admin." }
```

> **Catatan**: Akun lokal karyawan dibuat oleh admin melalui `POST /api/users` dengan menyertakan `employee_id`.

---

### `GET /api/auth/me`
Cek status token dan ambil data user yang sedang login. **Butuh token.**

```json
// Response 200
{ "id": 1, "email": "abdi@sahabatsakinah.id", "employee_id": null, "role": "admin", "isSubscribed": 1, "trialEndsAt": "..." }
```

---

## 2. User Management — `/api/users` *(Admin Only)*

### `GET /api/users`
Daftar semua pengguna.

### `POST /api/users`
Buat akun baru (biasanya untuk mendaftarkan karyawan).
```json
// Request
{
  "email": "opsional@mail.com",
  "employee_id": "EMP001",
  "password": "pass123",
  "role": "user"
}
// Response 201
{ "message": "User created successfully", "user": { "id": 2, "employee_id": "EMP001" } }
```

### `PUT /api/users/:id`
Update data user. Semua field opsional.
```json
{ "employee_id": "EMP002", "role": "admin", "password": "newpass" }
```

### `DELETE /api/users/:id`
Hapus user.

### `POST /api/users/:id/generate-token`
Generate API token jangka panjang (1 tahun).
```json
// Response
{ "token": "jwt-long-lived...", "note": "Valid 1 tahun." }
```

---

## 3. SIP Extensions — `/api/extensions`

### `GET /api/extensions`
Daftar konfigurasi SIP extension dari database.

### `GET /api/extensions/status`
Status live semua SIP agent (registered, busy, handledCalls, dll).
```json
// Response
[{ "extension": "1001", "registered": true, "isBusy": false, "status": "ONLINE", "handledCalls": 42 }]
```

### `POST /api/extensions`
Tambah extension baru. Mendukung single atau bulk.
```json
// Single
{ "extension": "1011", "password": "pass", "serverIp": "119.47.90.37", "domain": "sakinah.telesave.voip" }

// Bulk
{ "extensions": [{ "extension": "1011", ... }, { "extension": "1012", ... }] }
```

### `DELETE /api/extensions/:id`
Hapus extension.

### `POST /api/extensions/:extension/connect`
Aktifkan / re-register extension.

### `POST /api/extensions/:extension/disconnect`
Matikan extension.

---

## 4. Blast Call — `/api/blast-call`

Setiap user memiliki **antrian dan batas concurrency sendiri**. Blast satu user tidak memengaruhi user lain.

### `POST /api/blast-call`
Mulai blast call. **Butuh token + subscription aktif.**

> **INFO PENTING (v2.2):** Parameter `duration` dan `maxConcurrent` jika dikirim dari client **akan dihiraukan**. Pengaturan durasi, batas pemanggilan harian, dan konkurensi diputuskan murni secara global/oleh Admin melalui Panel Settings & Employee Settings.

```json
// Request
{
  "numbers": ["081234567890", "082345678901"]
}

// Response
{
  "message": "Blast call dimulai/diantrekan",
  "queueLength": 12,
  "yourQueueSize": 2,
  "callDuration": 10,
  "maxConcurrent": 3,
  "totalAgents": 10
}
```

### `POST /api/blast-call/stop`
Hentikan blast user yang sedang login. **Tidak memengaruhi user lain.**
```json
{ "message": "Blast call dihentikan", "removedFromQueue": 5, "stoppedActive": 2 }
```

### `GET /api/blast-call/report`
Hasil blast (PENDING / COMPLETED / FAILED / CANCELED) milik user sendiri.
```json
[
  { "id": "uuid", "number": "081234", "status": "COMPLETED", "agent": "1001", "completedAt": "..." },
  { "id": "uuid", "number": "082345", "status": "FAILED", "error": "Nomor Tidak Ditemukan (404)", "agent": "1002" }
]
```

### `GET /api/blast-call/status`
Ringkasan status blast aktif milik user yang login.
```json
{
  "inQueue": 8,
  "activeAgents": 2,
  "maxConcurrent": 3,
  "summary": { "pending": 8, "completed": 3, "failed": 1, "canceled": 0 }
}
```

**Socket.IO Events** (join room dengan `join-user` setelah connect):

| Event | Payload | Keterangan |
|---|---|---|
| `blast-update` | `{ id, number, status, agent, error? }` | Update status per nomor real-time |
| `blast-complete` | — | Seluruh antrian user selesai |
| `extension-update` | `{ extension, registered, isBusy, status }` | Status agent berubah |

**Admin-only Socket.IO Events** (join room dengan `join-admin`):

| Event | Payload | Keterangan |
|---|---|---|
| `admin-snapshot` | `{ agents, queueLength }` | Status awal saat admin connect |
| `admin-activity` | `{ type, userId, number, status, ... }` | Stream semua aktivitas blast dari semua user |

---

## 5. WhatsApp — `/api/whatsapp`

### `GET /api/whatsapp/sessions`
Daftar semua sesi dan statusnya (`connected`, `scanning`, `initializing`, `disconnected`).

### `POST /api/whatsapp/session`
Buat sesi baru.
```json
{ "name": "Marketing WA" }
// Response: { "sessionId": "uuid", "message": "Session created" }
```

### `GET /api/whatsapp/:id/status`
Status live sesi + QR code (jika scanning).

### `POST /api/whatsapp/session/:id/logout`
Logout sesi (konfigurasi tidak dihapus).

### `DELETE /api/whatsapp/session/:id`
Hapus sesi permanen.

### `POST /api/whatsapp/:id/send`
Kirim pesan teks.
```json
{ "number": "081234567890", "message": "Halo dari API!" }
```

### `POST /api/whatsapp/:id/check`
Cek apakah nomor terdaftar di WhatsApp.
```json
{ "number": "081234567890" }
// Response: { "number": "...", "formatted": "628...", "isRegistered": true }
```

### `POST /api/whatsapp/:id/check-bulk`
Cek banyak nomor sekaligus.
```json
{ "numbers": ["081234567890", "082345678901"] }
```

### `POST /api/whatsapp/:id/send-bulk`
Kirim ke banyak penerima dengan delay antar pesan.
```json
{
  "recipients": [
    { "number": "081234567890", "message": "Halo 1" },
    { "number": "082345678901", "message": "Halo 2" }
  ],
  "delay": 2000
}
```

---

## 6. Employee Settings (Limits & Routing) — `/api/dashboard/employee-settings`

Hak akses untuk endpoint ini hanya terbuka bagi akun dengan role **Admin**. Fitur ini mengatur batas limit harian, aturan bypass agen spesifik, dan pemblokiran user untuk melakukan blast call.

### `GET /api/dashboard/employee-settings`
Mendapatkan semua aturan karyawan.
```json
// Response
[
  { "employee_id": "ID-SSS001", "daily_limit": 50, "assigned_agent": "", "is_blocked": 0 }
]
```

### `POST /api/dashboard/employee-settings`
Menambah atau memperbarui aturan karyawan spesifik.
```json
// Request
{
  "employee_id": "ID-SSS001",
  "daily_limit": 50,
  "assigned_agent": "1001",
  "is_blocked": false
}
// Response 201: { "message": "Aturan karyawan disimpan." }
```

### `POST /api/dashboard/employee-settings/bulk`
Impor massal aturan karyawan dalam bentuk JSON Array. Biasanya digunakan setelah parse CSV/Excel di Frontend.
```json
// Request
{
  "settings": [
    { "employee_id": "ID-SSS001", "daily_limit": -1, "is_blocked": true },
    { "employee_id": "ID-SSS002", "daily_limit": 20 }
  ]
}
// Response 200: { "message": "Berhasil impor 2 pengaturan karyawan", "imported": 2, ... }
```

### `DELETE /api/dashboard/employee-settings/:id`
Menghapus aturan yang telah dibuat. Parameter `:id` adalah `employee_id`.

---

## 7. Dashboard — `/api/dashboard`

### `GET /api/dashboard/stats`
Statistik historis panggilan dari database (total, sukses, gagal, distribusi tipe, top numbers).

---

## 8. Health Check

### `GET /api/health`
Cek server berjalan. **Tidak perlu auth.**
```json
{ "status": "ok", "time": "2026-03-25T10:00:00.000Z" }
```

---

## Referensi Status

### Status Blast per Nomor

| Status | Keterangan |
|---|---|
| `PENDING` | Menunggu diproses |
| `CALLING` | Sedang dial |
| `RINGING` | Nomor berdering |
| `COMPLETED` | Panggilan berhasil diangkat |
| `FAILED` | Panggilan gagal |
| `CANCELED` | Dibatalkan user (stop-blast) |

### Kode Error SIP

| Kode | Pesan |
|---|---|
| 404 | Nomor Tidak Ditemukan |
| 408 | Request Timeout |
| 480 | Nomor Tidak Tersedia Sementara |
| 486 | Nomor Sedang Sibuk |
| 503 | Layanan Tidak Tersedia |
| 603 | Panggilan Ditolak |
