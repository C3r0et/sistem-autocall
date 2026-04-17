import os
import sys
import csv
import time

try:
    import paramiko
except ImportError:
    print("Error: Library 'paramiko' tidak ditemukan.")
    print("Silakan install dengan menjalankan perintah di bawah ini pada terminal:")
    print("pip install paramiko")
    sys.exit(1)

try:
    import pandas as pd
    HAS_PANDAS = True
except ImportError:
    HAS_PANDAS = False

# ANSI Color Codes
C_GREEN = '\033[92m'
C_YELLOW = '\033[93m'
C_RED = '\033[91m'
C_CYAN = '\033[96m'
C_RESET = '\033[0m'
C_BOLD = '\033[1m'

SFTP_HOST = '10.9.7.95'
SFTP_USER = 'ptsss'
SFTP_PASS = 'ptsss1234'
SFTP_PORT = 22

def print_banner():
    banner = f"""{C_CYAN}{C_BOLD}
   =================================================
      ⏬ DANKOM RECORDING DOWNLOADER TOOL (SFTP) ⏬
   ================================================={C_RESET}
   Alat ini digunakan untuk mendownload file rekaman
   secara langsung dari Server Dankom ({SFTP_HOST})
   berdasarkan data file Laporan Excel/CSV.
    """
    print(banner)

def get_input(prompt, default=None):
    if default:
        p = f"{C_YELLOW}?{C_RESET} {prompt} [{C_GREEN}default: {default}{C_RESET}]: "
    else:
        p = f"{C_YELLOW}?{C_RESET} {prompt}: "
    val = input(p)
    if not val and default is not None:
        return default
    return val

def read_data(filepath):
    data = []
    filepath = filepath.strip('\r\n "''')
    
    if not os.path.exists(filepath):
        print(f"{C_RED}❌ File tidak ditemukan: {filepath}{C_RESET}")
        return data

    ext = filepath.lower().split('.')[-1]
    print(f"{C_CYAN}⏳ Membaca file {ext.upper()}...{C_RESET}")

    if ext == 'csv':
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                reader = csv.DictReader(f)
                for row in reader:
                    clean_row = {}
                    for k, v in row.items():
                        if k is not None:
                            key_str = str(k).strip(' "\'')
                            val_str = str(v).strip(' "\'') if v is not None else ""
                            clean_row[key_str] = val_str
                    data.append(clean_row)
            return data
        except Exception as e:
            print(f"{C_RED}❌ Error membaca CSV: {e}{C_RESET}")
            return []

    elif ext in ['xls', 'xlsx']:
        if not HAS_PANDAS:
            print(f"{C_RED}❌ Library 'pandas' dan 'openpyxl' (untuk Excel) tidak terinstall.{C_RESET}")
            print(f"{C_YELLOW}💡 Solusi:{C_RESET} Anda bisa export data sebagai CSV, atau install pandas:")
            print(f"   pip install pandas openpyxl")
            return []
        try:
            df = pd.read_excel(filepath)
            for _, row in df.iterrows():
                clean_row = {str(k).strip(): str(v).strip() for k, v in row.items()}
                data.append(clean_row)
            return data
        except Exception as e:
            print(f"{C_RED}❌ Error membaca Excel: {e}{C_RESET}")
            return []
    else:
        print(f"{C_RED}❌ Format file '{ext}' tidak didukung. Mohon gunakan .csv atau .xlsx{C_RESET}")
        return []

def extract_safe_date_parts(waktu_str):
    # Format "25/03/2026 13.00.00" -> yyyy, mm, dd
    if not waktu_str: return None
    parts = str(waktu_str).split(' ')
    date_part = parts[0]
    if '/' in date_part:
        dmy = date_part.split('/')
        if len(dmy) == 3:
            d, m, y = dmy
            return y, m.zfill(2), d.zfill(2)
    return None

def main():
    os.system('cls' if os.name == 'nt' else 'clear')
    print_banner()

    print("")
    filepath = get_input("Silakan drag & drop file .csv atau .xlsx laporan ke sini")
    
    data = read_data(filepath)
    if not data:
        sys.exit(1)
        
    print(f"{C_GREEN}✅ Ditemukan {len(data)} baris data.{C_RESET}")
    
    headers = data[0].keys() if len(data) > 0 else []
    col_waktu = next((h for h in headers if h.lower() in ['waktu', 'tanggal', 'date', 'timestamp']), None)
    col_nomor = next((h for h in headers if h.lower() in ['nomor', 'no', 'number', 'phone']), None)
    col_status = next((h for h in headers if h.lower() in ['status', 'hasil']), None)
    col_agent = next((h for h in headers if h.lower() in ['agent', 'ext', 'extension', 'agent_extension']), None)

    if not col_nomor or not col_waktu:
        print(f"{C_RED}❌ File tidak memiliki kolom 'Waktu' dan 'Nomor'. Kolom yang tersedia: {list(headers)}{C_RESET}")
        sys.exit(1)

    only_answered = get_input("Hanya download panggilan yang berstatus ANSWERED/COMPLETED? (y/n)", "y").lower() == 'y'
    
    filtered_data = []
    for row in data:
        num = row.get(col_nomor, "")
        wkt = row.get(col_waktu, "")
        ext_val = row.get(col_agent, "")
        stat = row.get(col_status, "").upper() if col_status else "UNKNOWN"
        
        if not num or not wkt:
            continue
            
        if only_answered and stat not in ['ANSWERED', 'COMPLETED']:
            continue
            
        # Simpan info agent/ext ke dalam row data
        row['_clean_ext'] = str(ext_val).strip()
        filtered_data.append(row)

    print(f"\n{C_CYAN}📊 Target download: {len(filtered_data)} data panggilan.{C_RESET}")
    if len(filtered_data) == 0:
        print("Batal mendownload karena tidak ada data yang masuk kriteria.")
        sys.exit(0)
        
    output_dir = 'Download_Recordings'
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    print(f"Folder penyimpanan: {os.path.abspath(output_dir)}\n")
    
    print(f"{C_CYAN}⏳ Menghubungkan ke server SFTP {SFTP_HOST}...{C_RESET}")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    try:
        ssh.connect(hostname=SFTP_HOST, port=SFTP_PORT, username=SFTP_USER, password=SFTP_PASS, timeout=15)
        sftp = ssh.open_sftp()
        print(f"{C_GREEN}✅ Berhasil terhubung ke Dankom SFTP.{C_RESET}\n")
    except Exception as e:
        print(f"{C_RED}❌ Gagal terhubung ke SFTP: {e}{C_RESET}")
        sys.exit(1)

    success_count = 0
    fail_count = 0
    skip_count = 0
    
    # Cache directory listing agar lebih cepat
    dir_cache = {}

    for i, row in enumerate(filtered_data, 1):
        num = row[col_nomor]
        wkt = row[col_waktu]
        ext_agent = row.get('_clean_ext', '')
        date_parts = extract_safe_date_parts(wkt)
        
        if not date_parts:
            print(f"[{i}/{len(filtered_data)}] {num} -> {C_RED}Format waktu salah: {wkt}{C_RESET}")
            fail_count += 1
            continue
            
        yyyy, mm, dd = date_parts
        safe_date = f"{yyyy}-{mm}-{dd}"
        
        print(f"[{i}/{len(filtered_data)}] Memproses {num} (Ext: {ext_agent or '?'}) ... ", end="")
        sys.stdout.flush()
        
        target_path = f"/recording/monitor/{yyyy}/{mm}/{dd}"
        
        # Baca folder server jika belum ada di cache
        if target_path not in dir_cache:
            try:
                files = sftp.listdir(target_path)
                dir_cache[target_path] = files
            except UnicodeDecodeError:
                stdin, stdout, stderr = ssh.exec_command(f"ls -1 {target_path}")
                raw_out = stdout.read()
                safe_out = raw_out.decode('utf-8', errors='ignore')
                files = [f.strip() for f in safe_out.split('\n') if f.strip()]
                dir_cache[target_path] = files
            except IOError:
                dir_cache[target_path] = []
        
        folder_files = dir_cache[target_path]
        
        if not folder_files:
            print(f"{C_RED}❌ FAIL (Folder tgl {safe_date} kosong/tidak ada){C_RESET}")
            fail_count += 1
            continue
            
        # Pencarian file yang lebih cerdas: Cocokkan Nomor + Extension (jika ada)
        safe_number = num[-8:] if len(num) > 8 else num
        matching_files = []
        
        for f in folder_files:
            if not f.endswith('.wav'): continue
            
            # Cek apakah nomor nasabah ada di nama file
            if safe_number in f:
                # Jika di CSV ada info Agent/Ext, pastikan ext tsb juga ada di nama file Dankom
                if ext_agent and ext_agent in f:
                    matching_files.append(f)
                elif not ext_agent:
                    # Jika di CSV tidak ada info Agent, ambil saja semua yang cocok nomor hp nya
                    matching_files.append(f)
                
        if not matching_files:
            print(f"{C_RED}❌ NOT FOUND{C_RESET}")
            fail_count += 1
            continue
            
        for idx, m_file in enumerate(matching_files, 1):
            # Gunakan nama file asli dari server sesuai permintaan user
            final_filename = m_file
            output_path = os.path.join(output_dir, final_filename)
            
            if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
                print(f"{C_YELLOW}SKIP{C_RESET}", end=" ")
                skip_count += 1
                continue
                
            remote_filepath = f"{target_path}/{m_file}"
            try:
                sftp.get(remote_filepath, output_path)
                print(f"{C_GREEN}✅ OK{C_RESET}", end=" ")
                success_count += 1
            except Exception as e:
                print(f"{C_RED}❌ FAIL{C_RESET}", end=" ")
                fail_count += 1
                
        print("") # New line after finishing one row
            
    sftp.close()
    ssh.close()
    
    print(f"\n{C_CYAN}======================================{C_RESET}")
    print(f"{C_BOLD}DOWNLOAD SELESAI !{C_RESET}")
    print(f"✅ Berhasil didownload: {success_count} file")
    print(f"⏩ Dilewati (sudah ada): {skip_count} file")
    print(f"❌ Gagal / Tidak ada    : {fail_count} panggilan")
    print(f"📂 Silakan periksa folder: {os.path.abspath(output_dir)}")
    print(f"{C_CYAN}======================================{C_RESET}")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n{C_RED}Proses dibatalkan oleh pengguna.{C_RESET}")
        sys.exit(0)
