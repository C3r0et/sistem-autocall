# 📞 Sistem Autocall

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.0-blue?style=for-the-badge)
![Node.js](https://img.shields.io/badge/node.js-20%20LTS-brightgreen?style=for-the-badge&logo=node.js)
![SIP](https://img.shields.io/badge/protocol-SIP-orange?style=for-the-badge)
![MySQL](https://img.shields.io/badge/MySQL-8.0-blue?style=for-the-badge&logo=mysql)
![Socket.IO](https://img.shields.io/badge/socket.io-4.x-black?style=for-the-badge&logo=socket.io)
![License](https://img.shields.io/badge/license-Private-orange?style=for-the-badge)

**Sistem panggilan otomatis (automated calling) berbasis protokol SIP untuk keperluan pengumuman, reminder, dan notifikasi suara kepada pelanggan/karyawan PT. Sahabat Sakinah.**

</div>

---

## 📋 Daftar Isi

- [Gambaran Umum](#-gambaran-umum)
- [Fitur](#-fitur)
- [Arsitektur](#-arsitektur)
- [Prasyarat](#-prasyarat)
- [Instalasi](#-instalasi)
- [Konfigurasi](#-konfigurasi)
- [API Endpoints](#-api-endpoints)
- [Deployment (Bare Metal)](#-deployment-bare-metal)

---

## 🌐 Gambaran Umum

Sistem Autocall ini memungkinkan melakukan panggilan telepon otomatis melalui infrastruktur VoIP/SIP. Setiap Mini PC node terhubung sebagai **SIP agent** ke server PBX dan mampu melakukan panggilan outbound secara bersamaan.

Dalam infrastruktur cluster, dijalankan pada **5 Mini PC** di belakang Nginx Load Balancer. Notifikasi WhatsApp (jika diperlukan) diteruskan ke **WA Gateway** yang terpisah — service ini murni untuk SIP calling.

---

## ✨ Fitur

| Fitur | Deskripsi |
|-------|-----------|
| 📞 **SIP Calling** | Panggilan outbound via protokol SIP/VoIP |
| 🎵 **Audio Playback** | Putar audio rekaman saat panggilan tersambung |
| 🔄 **Queue Management** | Antrian panggilan dengan retry otomatis |
| 📊 **Real-time Status** | Monitor status panggilan via Socket.IO |
| 🔐 **SSO Auth** | Terintegrasi dengan SSO internal (JWT) |
| 📝 **Call Recording** | Simpan rekaman panggilan via SFTP |
| 📋 **Audit Log** | Riwayat panggilan tersimpan di database |
| ❤️ **Health Check** | Endpoint `/health` untuk load balancer |

---

## 🏗️ Arsitektur

```
Browser / FE App
      │
      ▼
 Nginx Load Balancer (192.168.56.250)
      │  path: /autocall/*
      ▼
 Autocall Node (192.168.56.21-25:3003)
      │
      ├── SIP Stack ──► PBX Server / PSTN
      ├── FFmpeg ──────► Audio Processing
      ├── SFTP ────────► Recording Storage
      ├── Socket.IO ──► Realtime Call Status
      └── MySQL ──────► Call Logs (10.9.9.110)
```

---

## ⚙️ Prasyarat

- **Node.js** v20 LTS
- **MySQL** 8.0 (remote di `10.9.9.110`)
- **ffmpeg** (untuk audio processing)
- **SIP Server / PBX** yang dapat diakses dari jaringan lokal
- OS: **Debian 13** (recommended)

> ⚠️ **Catatan**: `puppeteer` dan `whatsapp-web.js` yang ada di package lama **tidak digunakan** di versi ini. Notifikasi WhatsApp sudah dihandle oleh service WA Gateway terpisah.

---

## 📦 Instalasi

```bash
# Clone repository
git clone https://github.com/USERNAME/sistem-autocall.git
cd sistem-autocall/server

# Install dependencies
npm install

# Salin dan edit konfigurasi
cp .env.example .env
nano .env

# Jalankan
node index.js
```

---

## 🔧 Konfigurasi

Buat file `.env` di dalam folder `server/`:

```env
# Server
PORT=3003
SERVER_ID=AC-NODE-01           # ID unik per node
LOCAL_IP=192.168.56.21         # IP interface jaringan PC ini (WAJIB untuk SIP)
NODE_OPTIONS=--max-old-space-size=512

# SIP Config
SIP_NO_AUTO_62=true            # Otomatis tambah kode negara 62

# Auth
JWT_SECRET=your-secret-key

# Database
EMPLOYEE_DB_HOST=10.9.9.110
EMPLOYEE_DB_USER=userdb
EMPLOYEE_DB_PASSWORD=your-password
EMPLOYEE_DB_NAME=app

# Disable WA (sudah dihandle WA Gateway)
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
WA_NOTIFICATION_DISABLED=true
```

> ⚠️ `LOCAL_IP` **harus** diisi dengan IP interface ethernet PC ini agar SIP RTP stream berjalan benar.

---

## 📡 API Endpoints

### Authentication
```
Authorization: Bearer <JWT_TOKEN>
```

### Calls

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `POST` | `/api/call` | Buat panggilan baru |
| `GET` | `/api/calls` | Daftar riwayat panggilan |
| `GET` | `/api/calls/:id` | Detail panggilan |
| `DELETE` | `/api/calls/:id` | Batalkan panggilan |

### Agents

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/api/agents` | Status semua SIP agent |
| `POST` | `/api/agents/reload` | Reload konfigurasi SIP |

### System

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/health` | Health check (untuk LB) |

---

## 🚀 Deployment (Bare Metal)

```bash
# Di Mini PC yang dialokasikan sebagai Autocall
sudo bash /opt/cluster-setup/scripts/setup-base.sh
sudo bash /opt/cluster-setup/scripts/deploy-autocall.sh
sudo bash /opt/cluster-setup/scripts/deploy-agent.sh
```

### PM2 Commands
```bash
pm2 status           # Cek status
pm2 logs autocall    # Lihat log realtime
pm2 restart autocall # Restart service
```

---

<div align="center">

**PT. Sahabat Sakinah** · Backend Team · 2026

</div>
