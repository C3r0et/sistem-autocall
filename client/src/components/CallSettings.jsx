import { useState, useEffect } from 'react';
import axios from 'axios';

// ─── Komponen Slider Setting ─────────────────────────────────────────
function SliderSetting({ icon, label, description, value, min, max, step = 1, unit, onChange, disabled }) {
    return (
        <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            padding: '1.25rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontSize: '1.2rem' }}>{icon}</span>
                        <span style={{ fontWeight: '600', color: 'white', fontSize: '0.95rem' }}>{label}</span>
                    </div>
                    <p style={{ fontSize: '0.78rem', color: '#64748b', margin: 0 }}>{description}</p>
                </div>
                <div style={{
                    background: 'rgba(59,130,246,0.15)',
                    border: '1px solid rgba(59,130,246,0.3)',
                    borderRadius: '8px',
                    padding: '6px 14px',
                    minWidth: '70px',
                    textAlign: 'center'
                }}>
                    <span style={{ fontSize: '1.4rem', fontWeight: '700', color: '#60a5fa' }}>{value}</span>
                    <span style={{ fontSize: '0.7rem', color: '#94a3b8', marginLeft: '4px' }}>{unit}</span>
                </div>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={e => onChange(Number(e.target.value))}
                disabled={disabled}
                style={{
                    width: '100%',
                    accentColor: '#3b82f6',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    height: '6px'
                }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: '#475569' }}>
                <span>{min} {unit}</span>
                <span>{max} {unit}</span>
            </div>
        </div>
    );
}

// ─── Komponen Toggle Setting ─────────────────────────────────────────
function ToggleSetting({ icon, label, description, value, onChange }) {
    return (
        <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            padding: '1.25rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.2rem' }}>{icon}</span>
                <div>
                    <div style={{ fontWeight: '600', color: 'white', fontSize: '0.95rem', marginBottom: '2px' }}>{label}</div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{description}</div>
                </div>
            </div>
            <button
                onClick={() => onChange(!value)}
                style={{
                    minWidth: '56px', maxWidth: '56px', height: '30px',
                    borderRadius: '15px',
                    border: value ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(255,255,255,0.2)',
                    cursor: 'pointer',
                    background: value ? 'linear-gradient(135deg, #10b981, #059669)' : 'rgba(0,0,0,0.4)',
                    position: 'relative',
                    transition: 'all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
                    flexShrink: 0,
                    boxShadow: value ? '0 0 10px rgba(16, 185, 129, 0.4)' : 'inset 0 2px 4px rgba(0,0,0,0.5)'
                }}
            >
                <div style={{
                    width: '24px', height: '24px',
                    borderRadius: '50%',
                    background: 'white',
                    position: 'absolute',
                    top: '2px',
                    left: value ? '28px' : '2px',
                    transition: 'all 0.3s cubic-bezier(0.4, 0.0, 0.2, 1)',
                    boxShadow: '0 2px 5px rgba(0,0,0,0.3)'
                }} />
            </button>
        </div>
    );
}

// ─── Komponen Select Setting ─────────────────────────────────────────
function SelectSetting({ icon, label, description, value, options, onChange }) {
    return (
        <div style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: '12px',
            padding: '1.25rem 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                <span style={{ fontSize: '1.2rem' }}>{icon}</span>
                <div>
                    <div style={{ fontWeight: '600', color: 'white', fontSize: '0.95rem', marginBottom: '2px' }}>{label}</div>
                    <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{description}</div>
                </div>
            </div>
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                style={{
                    background: 'rgba(15,23,42,0.8)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    borderRadius: '8px',
                    color: 'white',
                    padding: '6px 12px',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    minWidth: '130px'
                }}
            >
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
        </div>
    );
}

// ─── Halaman Utama CallSettings ──────────────────────────────────────
export default function CallSettings() {
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    // ── Defaults dari localStorage / backend ──
    const load = (key, def) => {
        const raw = localStorage.getItem('autocall_settings');
        if (raw) {
            try { const p = JSON.parse(raw); if (p[key] !== undefined) return p[key]; } catch {}
        }
        return def;
    };

    const [callDuration,   setCallDuration]   = useState(() => load('callDuration',   5));
    const [maxConcurrent,  setMaxConcurrent]  = useState(() => load('maxConcurrent',  10));
    const [ringTimeout,    setRingTimeout]    = useState(() => load('ringTimeout',    15));
    const [globalVendor,   setGlobalVendor]   = useState(() => load('globalVendor',   'telesave'));
    const [autoRetry,      setAutoRetry]      = useState(() => load('autoRetry',      false));
    const [numberPrefix,   setNumberPrefix]   = useState(() => load('numberPrefix',   'auto'));

    // Fetch settings dari backend pada mount
    useEffect(() => {
        axios.get('/api/dashboard/settings')
            .then(res => {
                const s = res.data;
                if (s.global_vendor) setGlobalVendor(s.global_vendor);
                if (s.callDuration) setCallDuration(Number(s.callDuration));
                if (s.maxConcurrent) setMaxConcurrent(Number(s.maxConcurrent));
                if (s.ringTimeout) setRingTimeout(Number(s.ringTimeout));
                if (s.autoRetry !== undefined) setAutoRetry(s.autoRetry === 'true');
                if (s.numberPrefix) setNumberPrefix(s.numberPrefix);
            })
            .catch(() => {});
    }, []);

    const handleSave = async () => {
        setSaving(true);
        const settings = { callDuration, maxConcurrent, ringTimeout, globalVendor, autoRetry, numberPrefix };

        // Simpan ke localStorage agar OperationalTools bisa baca
        localStorage.setItem('autocall_settings', JSON.stringify(settings));

        // Simpan parameter lokal ke autocall_state agar OperationalTools langsung pakai
        const oldState = JSON.parse(localStorage.getItem('autocall_state') || '{}');
        localStorage.setItem('autocall_state', JSON.stringify({
            ...oldState,
            blastDuration: callDuration,
            maxConcurrent
        }));

        try {
            // Simpan semua settings ke backend db
            await Promise.all([
                axios.post('/api/dashboard/settings', { key: 'global_vendor', value: globalVendor }),
                axios.post('/api/dashboard/settings', { key: 'callDuration', value: callDuration }),
                axios.post('/api/dashboard/settings', { key: 'maxConcurrent', value: maxConcurrent }),
                axios.post('/api/dashboard/settings', { key: 'ringTimeout', value: ringTimeout }),
                axios.post('/api/dashboard/settings', { key: 'autoRetry', value: String(autoRetry) }),
                axios.post('/api/dashboard/settings', { key: 'numberPrefix', value: numberPrefix })
            ]);
        } catch (e) {
            console.warn('Failed to save settings to backend:', e.message);
        }

        setSaving(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    };

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: '2rem' }}>
                <h2 style={{
                    fontSize: '1.5rem', fontWeight: '700', margin: 0,
                    background: 'linear-gradient(to right, #38bdf8, #818cf8)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
                }}>
                    ⚙️ Pengaturan Blast Call
                </h2>
                <p style={{ marginTop: '0.4rem', color: '#64748b', fontSize: '0.9rem' }}>
                    Semua parameter panggilan otomatis dikumpulkan di sini. Perubahan berlaku pada blast call berikutnya.
                </p>
            </div>

            {/* ── Seksi: Durasi & Timing ── */}
            <div style={{ marginBottom: '2rem' }}>
                <div style={{
                    fontSize: '0.75rem', fontWeight: '700', letterSpacing: '1.5px',
                    color: '#475569', textTransform: 'uppercase', marginBottom: '0.75rem',
                    display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)' }} />
                    ⏱ Durasi &amp; Timing
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <SliderSetting
                        icon="📞"
                        label="Durasi Panggilan"
                        description="Berapa detik call ditahan setelah nomor tujuan MENJAWAB, lalu otomatis diputus."
                        value={callDuration}
                        min={3}
                        max={60}
                        unit="detik"
                        onChange={setCallDuration}
                    />
                    <SliderSetting
                        icon="🔔"
                        label="Batas Waktu Berdering (Ring Timeout)"
                        description="Berapa detik menunggu jawaban. Jika tidak dijawab dalam waktu ini, call dianggap gagal."
                        value={ringTimeout}
                        min={5}
                        max={60}
                        unit="detik"
                        onChange={setRingTimeout}
                    />
                </div>
            </div>

            {/* ── Seksi: Kapasitas ── */}
            <div style={{ marginBottom: '2rem' }}>
                <div style={{
                    fontSize: '0.75rem', fontWeight: '700', letterSpacing: '1.5px',
                    color: '#475569', textTransform: 'uppercase', marginBottom: '0.75rem',
                    display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)' }} />
                    🚀 Kapasitas &amp; Performa
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <SliderSetting
                        icon="⚡"
                        label="Maks Panggilan Bersamaan"
                        description="Jumlah nomor yang dihubungi secara bersamaan (concurrency). Sesuaikan dengan jumlah extension aktif."
                        value={maxConcurrent}
                        min={1}
                        max={33}
                        unit="lines"
                        onChange={setMaxConcurrent}
                    />
                </div>
            </div>

            {/* ── Seksi: Vendor & Jaringan ── */}
            <div style={{ marginBottom: '2rem' }}>
                <div style={{
                    fontSize: '0.75rem', fontWeight: '700', letterSpacing: '1.5px',
                    color: '#475569', textTransform: 'uppercase', marginBottom: '0.75rem',
                    display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)' }} />
                    🌐 Vendor &amp; Jaringan
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <SelectSetting
                        icon="🏢"
                        label="Vendor SIP"
                        description="Semua blast call akan menggunakan SIP trunk vendor yang dipilih."
                        value={globalVendor}
                        options={[
                            { value: 'telesave', label: '📡 Telesave (119.47.90.37)' },
                            { value: 'dankom',   label: '🔗 Dankom (10.9.7.95)' },
                        ]}
                        onChange={setGlobalVendor}
                    />
                    <SelectSetting
                        icon="🔢"
                        label="Format Nomor Tujuan"
                        description="Otomatis: 08xx → 628xx. Manual: kirim apa adanya."
                        value={numberPrefix}
                        options={[
                            { value: 'auto',   label: '🔄 Otomatis (08xx → 628xx)' },
                            { value: 'manual', label: '✏️ Manual (apa adanya)' },
                        ]}
                        onChange={setNumberPrefix}
                    />
                </div>
            </div>

            {/* ── Seksi: Perilaku ── */}
            <div style={{ marginBottom: '2.5rem' }}>
                <div style={{
                    fontSize: '0.75rem', fontWeight: '700', letterSpacing: '1.5px',
                    color: '#475569', textTransform: 'uppercase', marginBottom: '0.75rem',
                    display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)' }} />
                    🔧 Perilaku Panggilan
                    <div style={{ flex: 1, height: '1px', background: 'rgba(255,255,255,0.07)' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <ToggleSetting
                        icon="🔁"
                        label="Auto Retry saat Gagal"
                        description="Jika panggilan gagal (BUSY/TIMEOUT), coba ulang 1x sebelum tandai FAILED."
                        value={autoRetry}
                        onChange={setAutoRetry}
                    />
                </div>
            </div>

            {/* Ringkasan Saat Ini */}
            <div style={{
                background: 'rgba(59,130,246,0.05)',
                border: '1px solid rgba(59,130,246,0.15)',
                borderRadius: '12px',
                padding: '1rem 1.5rem',
                marginBottom: '1.5rem',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '1rem'
            }}>
                <div style={{ fontSize: '0.8rem', color: '#94a3b8', flex: 1 }}>
                    <span style={{ marginRight: '6px' }}>📋</span>
                    <strong style={{ color: '#e2e8f0' }}>Ringkasan:</strong>{' '}
                    Blast call akan menggunakan vendor <strong style={{color:'#60a5fa'}}>{globalVendor === 'dankom' ? 'Dankom' : 'Telesave'}</strong>,
                    durasi <strong style={{color:'#60a5fa'}}>{callDuration} detik</strong>,
                    maks <strong style={{color:'#60a5fa'}}>{maxConcurrent} panggilan</strong> bersamaan,
                    ring timeout <strong style={{color:'#60a5fa'}}>{ringTimeout} detik</strong>.
                    {autoRetry && <span> Retry aktif.</span>}
                </div>
            </div>

            {/* Tombol Simpan */}
            <button
                onClick={handleSave}
                disabled={saving}
                style={{
                    width: '100%',
                    padding: '0.9rem',
                    borderRadius: '10px',
                    border: 'none',
                    background: saved
                        ? 'linear-gradient(135deg, #10b981, #059669)'
                        : 'linear-gradient(135deg, #3b82f6, #2563eb)',
                    color: 'white',
                    fontSize: '1rem',
                    fontWeight: '700',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    transition: 'all 0.3s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 15px rgba(59,130,246,0.3)'
                }}
            >
                {saving ? '⏳ Menyimpan...' : saved ? '✅ Tersimpan!' : '💾 Simpan Pengaturan'}
            </button>
        </div>
    );
}
