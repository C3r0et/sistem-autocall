import os
import re
import sys
import wave
import contextlib

try:
    import pandas as pd
except ImportError:
    print("Library 'pandas' atau 'openpyxl' tidak terinstall.")
    print("Jalankan: pip install pandas openpyxl")
    sys.exit(1)

C_GREEN = '\033[92m'
C_YELLOW = '\033[93m'
C_CYAN = '\033[96m'
C_RESET = '\033[0m'
C_BOLD = '\033[1m'

def get_wav_duration(filepath):
    """Mendapatkan durasi sekunder dari file WAV."""
    try:
        with contextlib.closing(wave.open(filepath, 'r')) as f:
            frames = f.getnframes()
            rate = f.getframerate()
            return frames / float(rate)
    except Exception:
        # Fallback perhitungan kasar berdasarkan ukuran file jika file header WAV pbx sedikit aneh
        # Asumsi format G.711 / standard PBX WAV rate: 8000 bytes/sec
        try:
            sz = os.path.getsize(filepath)
            # asumsikan 8KB = 1 detik untuk alaw/ulaw pbx (8000 bytes per second)
            return max(0, sz - 44) / 8000.0  
        except:
            return 0.0

def format_duration(seconds):
    if seconds < 0: seconds = 0
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"

def main():
    os.system('cls' if os.name == 'nt' else 'clear')
    folder_path = "Download_Recordings"
    
    print(f"{C_CYAN}{C_BOLD}\n   🔍 AUTO-CALL RECORDING ANALYZER 🔍\n{C_RESET}")
    
    if not os.path.exists(folder_path):
        print(f"{C_RED}❌ Folder '{folder_path}' tidak ditemukan! Pastikan telah men-download rekaman via script sebelumnya.{C_RESET}")
        return
        
    print(f"{C_CYAN}⏳ Mengambil dan menghitung durasi file-file WAV di dalam {folder_path}...{C_RESET}")
    files = [f for f in os.listdir(folder_path) if f.lower().endswith('.wav')]
    
    if not files:
        print(f"{C_YELLOW}⚠️ Tidak ada file rekaman (WAV) untuk dianalisis di folder tersebut.{C_RESET}")
        return

    data = []
    
    # Pola Tanggal dan Waktu (biasanya dari Dankom: "...-YYYYMMDD-HHMMSS-...")
    date_pattern = re.compile(r'(\d{8})-(\d{6})')
    
    for idx, f in enumerate(files, 1):
        filepath = os.path.join(folder_path, f)
        duration_sec = get_wav_duration(filepath)
        
        match = date_pattern.search(f)
        date_str = "Tidak Diketahui"
        time_str = "Tidak Diketahui"
        
        if match:
            d_raw = match.group(1) # YYYYMMDD
            t_raw = match.group(2) # HHMMSS
            date_str = f"{d_raw[:4]}-{d_raw[4:6]}-{d_raw[6:]}"
            time_str = f"{t_raw[:2]}:{t_raw[2:4]}:{t_raw[4:]}"
            
        # Jika file hasil download_recordings.py sebelumnya, biasanya dinamai "NOMOR_sisa_file.wav"
        parts = f.split('_', 1)
        nomor = parts[0] if len(parts) > 1 and parts[0].isdigit() else "Tidak Spesifik"

        data.append({
            "Nama File": f,
            "Nomor Telepon": nomor,
            "Tanggal Panggilan": date_str,
            "Waktu Panggilan": time_str,
            "Durasi (Detik)": round(duration_sec, 2),
            "Durasi Format": format_duration(duration_sec),
            "Ukuran (KB)": round(os.path.getsize(filepath) / 1024, 2)
        })
        
        sys.stdout.write(f"\rMemproses: {idx}/{len(files)} file...")
        sys.stdout.flush()

    # Buat jadi DataFrame dengan Pandas
    df = pd.DataFrame(data)
    
    # ---- 1. EXCEL REPORT (Filter Durasi 0 -> Tertinggi) ----
    df_sorted_asc = df.sort_values(by=["Durasi (Detik)"], ascending=True)
    excel_filename = "Laporan_Durasi_Panggilan.xlsx"
    
    try:
        df_sorted_asc.to_excel(excel_filename, index=False)
        print(f"\n\n{C_GREEN}✅ File Excel berurutan secara ASCENDING (0 -> Tertinggi) berhasil terbuat!{C_RESET}")
        print(f"📂 Lokasi Excel: {os.path.abspath(excel_filename)}")
    except Exception as e:
        print(f"\n\n{C_RED}❌ Gagal menyimpan Excel: {e}{C_RESET}")

    # ---- 2. TERMINAL SUMMARY (Tertinggi -> Terendah, Beda Tanggal) ----
    print(f"\n{C_BOLD}====== RINGKASAN DURASI (TERTINGGI KE TERENDAH) ======{C_RESET}")
    
    # Sort secara DESCENDING berdasarkan durasi, lalu group by tanggal
    df_desc = df.sort_values(by=["Durasi (Detik)", "Waktu Panggilan"], ascending=[False, True])
    
    # Kumpulkan unique 'Tanggal Panggilan'
    unique_dates = df_desc["Tanggal Panggilan"].unique()
    
    for tgl in sorted(unique_dates, reverse=True): # Tanggal terbaru di atas
        print(f"\n{C_YELLOW}📅 TANGGAL: {tgl}{C_RESET}")
        print("-" * 75)
        print(f"{'JAM':<10} | {'NOMOR TELEPON':<15} | {'DURASI':<8} | {'(DETIK)':<8} | {'NAMA FILE':<20}")
        print("-" * 75)
        
        subset = df_desc[df_desc["Tanggal Panggilan"] == tgl]
        
        # Iterasi dari durasi paling gede ke paling kecil untuk tanggal ini
        for _, row in subset.iterrows():
            dur_fmt = row["Durasi Format"]
            dur_sec = row["Durasi (Detik)"]
            num_tgt = row["Nomor Telepon"]
            wkt = row["Waktu Panggilan"]
            fn = row["Nama File"]
            
            # Potong nama file jika terlalu panjang agar tidak merusak CLI
            short_fn = (fn[:20] + '..') if len(fn) > 22 else fn
            
            print(f"{wkt:<10} | {num_tgt:<15} | {dur_fmt:<8} | {dur_sec:<6} s | {short_fn}")

    print(f"\n{C_CYAN}Analisis Selesai!{C_RESET}")

if __name__ == "__main__":
    main()
