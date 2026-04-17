import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';

const STATUS_COLORS = {
    COMPLETED: '#10b981',
    FAILED: '#ef4444',
    blast_started: '#3b82f6',
    blast_calling: '#f59e0b',
    blast_result: '#8b5cf6',
    agent: '#06b6d4',
};

function TimeAgo({ ts }) {
    const diff = Math.floor((Date.now() - new Date(ts)) / 1000);
    if (diff < 60) return <span>{diff}d lalu</span>;
    if (diff < 3600) return <span>{Math.floor(diff / 60)}m lalu</span>;
    return <span>{Math.floor(diff / 3600)}j lalu</span>;
}

function AgentStatusBadge({ agent }) {
    const color = !agent.registered ? '#64748b' : agent.isBusy ? '#f59e0b' : '#10b981';
    const label = !agent.registered ? 'OFFLINE' : agent.isBusy ? 'SIBUK' : 'ONLINE';
    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '8px 12px', borderRadius: '8px',
            background: 'rgba(255,255,255,0.04)',
            border: `1px solid ${color}33`,
            fontSize: '0.8rem'
        }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: `0 0 6px ${color}` }} />
            <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', color: 'white' }}>Ext {agent.extension}</div>
                {agent.currentCall && <div style={{ color: '#94a3b8', fontSize: '0.72rem', fontFamily: 'monospace' }}>📞 {agent.currentCall}</div>}
                {agent.isBusy && agent.currentUserId && (
                    <div style={{ color: '#fbbf24', fontSize: '0.68rem', marginTop: '2px' }}>
                        👤 User {agent.currentUserId}
                    </div>
                )}
            </div>
            <span style={{ color, fontWeight: 'bold', fontSize: '0.7rem' }}>{label}</span>
            {agent.handledCalls > 0 && <span style={{ color: '#64748b', fontSize: '0.7rem' }}>({agent.handledCalls})</span>}
        </div>
    );
}

function ActivityItem({ item }) {
    const icons = {
        blast_started: '🚀',
        blast_calling: '📞',
        blast_result: item.status === 'COMPLETED' ? '✅' : '❌',
        agent: '🔌',
    };
    const colors = {
        blast_started: '#3b82f6',
        blast_calling: '#f59e0b',
        blast_result: item.status === 'COMPLETED' ? '#10b981' : '#ef4444',
        agent: '#06b6d4',
    };
    const color = colors[item.type] || '#94a3b8';

    return (
        <div style={{
            display: 'flex', gap: '10px', alignItems: 'flex-start',
            padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
            animation: 'fadeIn 0.3s ease'
        }}>
            <span style={{ fontSize: '1rem', flexShrink: 0, marginTop: '1px' }}>{icons[item.type] || '📌'}</span>
            <div style={{ flex: 1, fontSize: '0.8rem' }}>
                {item.type === 'blast_started' && (
                    <span>User <b style={{ color: '#38bdf8' }}>{item.userId}</b> memulai blast <b style={{ color }}>{item.count}</b> nomor (dur: {item.callDuration}s, concurrent: {item.maxConcurrent})</span>
                )}
                {item.type === 'blast_calling' && (
                    <span>Memanggil <b style={{ color: '#fcd34d', fontFamily: 'monospace' }}>{item.number}</b> via Ext.<b>{item.agent}</b> <span style={{ color: '#64748b' }}>· antrian: {item.queueRemaining}</span></span>
                )}
                {item.type === 'blast_result' && (
                    <span>
                        <b style={{ fontFamily: 'monospace', color: '#fcd34d' }}>{item.number}</b> → <span style={{ color }}>{item.status}</span>
                        {item.error && <span style={{ color: '#ef4444', fontSize: '0.72rem' }}> ({item.error})</span>}
                        <span style={{ color: '#64748b' }}> · Ext.{item.agent}</span>
                    </span>
                )}
                {item.type === 'agent' && (
                    <span>Ext.<b>{item.extension}</b> → <span style={{ color }}>{item.status}</span></span>
                )}
            </div>
            <span style={{ color: '#475569', fontSize: '0.7rem', flexShrink: 0, whiteSpace: 'nowrap' }}>
                <TimeAgo ts={item.timestamp} />
            </span>
        </div>
    );
}

export default function DashboardOverview() {
    const [stats, setStats] = useState(null);
    const [globalVendor, setGlobalVendor] = useState('telesave');
    const [agents, setAgents] = useState([]);
    const [activities, setActivities] = useState([]);
    const [queueLength, setQueueLength] = useState(0);
    const [queueByUser, setQueueByUser] = useState([]);
    const [activeBlast, setActiveBlast] = useState(0);
    const [loading, setLoading] = useState(true);
    const socketRef = useRef(null);
    const ACTIVITY_LIMIT = 80;

    const addActivity = (item) => {
        setActivities(prev => [item, ...prev].slice(0, ACTIVITY_LIMIT));
    };

    // Fetch stats dari DB (call logs history)
    const fetchStats = async () => {
        try {
            const res = await axios.get('/api/dashboard/stats');
            setStats(res.data);
            
            const settingsRes = await axios.get('/api/dashboard/settings');
            if (settingsRes.data && settingsRes.data.global_vendor) {
                setGlobalVendor(settingsRes.data.global_vendor);
            }
            
            setLoading(false);
        } catch {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStats();
        const interval = setInterval(fetchStats, 30000);

        // Connect Socket.IO ke server yang sama dengan axios baseURL
        const serverUrl = axios.defaults.baseURL || window.location.origin;
        const socket = io(serverUrl);
        socketRef.current = socket;

        socket.on('connect', () => {
            socket.emit('join-admin'); // Bergabung ke admin-room
        });

        // Snapshot awal saat connect
        socket.on('admin-snapshot', (data) => {
            setAgents(data.agents || []);
            setQueueLength(data.queueLength || 0);
            setQueueByUser(data.queueByUser || []);
        });

        // Activity stream
        socket.on('admin-activity', (data) => {
            addActivity({ ...data, timestamp: data.timestamp || new Date() });
            if (data.queueRemaining !== undefined) setQueueLength(data.queueRemaining);
            if (data.activeBlastCalls !== undefined) setActiveBlast(data.activeBlastCalls);
            if (data.queueByUser !== undefined) setQueueByUser(data.queueByUser);
        });

        // Update status agent
        socket.on('extension-update', (agentData) => {
            setAgents(prev => {
                const idx = prev.findIndex(a => a.extension === agentData.extension);
                if (idx > -1) {
                    const updated = [...prev];
                    updated[idx] = agentData;
                    return updated;
                }
                return [...prev, agentData];
            });
            // Tambah ke activity log jika status berubah signifikan
            if (agentData.status === 'OFFLINE' || agentData.status === 'ONLINE') {
                addActivity({ type: 'agent', extension: agentData.extension, status: agentData.status, timestamp: new Date() });
            }
        });

        return () => {
            clearInterval(interval);
            socket.disconnect();
        };
    }, []);

    // Computed agent stats
    const onlineAgents = agents.filter(a => a.registered && !a.isBusy).length;
    const busyAgents = agents.filter(a => a.isBusy).length;
    const offlineAgents = agents.filter(a => !a.registered).length;
    const totalHandled = agents.reduce((sum, a) => sum + (a.handledCalls || 0), 0);

    // Chart data
    const COLORS = ['#10b981', '#f59e0b', '#64748b', '#ef4444'];
    const pieData = stats ? [
        { name: 'Answered', value: stats.successCount },
        { name: 'Busy', value: stats.busyCount },
        { name: 'No Answer', value: stats.noAnswerCount },
        { name: 'Failed', value: stats.failedCount },
    ] : [];
    const barData = stats ? Object.keys(stats.typeDistribution).map(k => ({ name: k, count: stats.typeDistribution[k] })) : [];

    const handleGlobalVendorChange = async (e) => {
        const val = e.target.value;
        setGlobalVendor(val);
        try {
            await axios.post('/api/dashboard/settings', { key: 'global_vendor', value: val });
        } catch (err) {
            alert('Gagal menyimpan routing global');
        }
    };

    return (
        <div>
            <style>{`
                @keyframes fadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }
                .pulse-dot { animation: pulse 2s infinite; }
                @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
            `}</style>

            <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ fontSize: '1.4rem', margin: 0 }}>📊 Live Monitor & Overview</h2>
                    <p style={{ color: '#94a3b8', marginTop: '0.25rem', fontSize: '0.85rem' }}>Real-time aktivitas sistem — blast call, agent, &amp; statistik</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255,255,255,0.05)', padding: '8px 12px', borderRadius: '8px' }}>
                     <label style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>🌐 Global Blast Routing:</label>
                     <select 
                         value={globalVendor} 
                         onChange={handleGlobalVendorChange}
                         style={{ background: '#1e293b', color: 'white', border: '1px solid #334155', borderRadius: '4px', padding: '4px 8px', fontSize: '0.8rem', outline: 'none' }}
                     >
                         <option value="all">Balance (Semua Agent)</option>
                         <option value="telesave">Telesave Khusus</option>
                         <option value="dankom">Dankom Khusus</option>
                     </select>
                </div>
            </div>

            {/* ═══ LIVE METRICS TOP ═══ */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                {[
                    { label: 'Antrian', value: queueLength, color: '#f59e0b', icon: '⏳', sub: 'nomor menunggu' },
                    { label: 'Panggilan Aktif', value: activeBlast, color: '#3b82f6', icon: '📞', sub: 'sedang berjalan' },
                    { label: 'Agent Online', value: onlineAgents, color: '#10b981', icon: '🟢', sub: 'siap pakai' },
                    { label: 'Agent Sibuk', value: busyAgents, color: '#f59e0b', icon: '🟡', sub: 'sedang panggil' },
                    { label: 'Total Handled', value: totalHandled, color: '#8b5cf6', icon: '📈', sub: 'sesi ini' },
                ].map(item => (
                    <div key={item.label} className="glass-panel" style={{ padding: '1rem', position: 'relative', overflow: 'hidden' }}>
                        {item.value > 0 && item.label !== 'Total Handled' && (
                            <div style={{ position: 'absolute', top: 8, right: 8, width: 8, height: 8, borderRadius: '50%', background: item.color }} className="pulse-dot" />
                        )}
                        <div style={{ fontSize: '1.4rem', marginBottom: '4px' }}>{item.icon}</div>
                        <div style={{ fontSize: '2rem', fontWeight: 'bold', color: item.color, lineHeight: 1 }}>{item.value}</div>
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>{item.label}</div>
                        <div style={{ fontSize: '0.7rem', color: '#475569' }}>{item.sub}</div>
                    </div>
                ))}
            </div>

            {/* ═══ AGENT GRID + ACTIVITY FEED ═══ */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1.5rem', marginBottom: '1.5rem' }}>

                {/* Agent Pool Status */}
                <div className="glass-panel" style={{ maxHeight: '420px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <h3 style={{ margin: 0, fontSize: '0.95rem' }}>🔌 Antrian Saya</h3>
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{agents.length} agent</span>
                    </div>
                    {queueByUser.length === 0 && queueLength === 0 ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: '0.85rem' }}>
                            ✅ Tidak ada nomor dalam antrian
                        </div>
                    ) : (
                        <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                            {queueByUser.map(({ userId, employeeId, count }) => {
                                const idToDisplay = employeeId || userId;
                                return (
                                <div key={idToDisplay} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: 'rgba(56,189,248,0.05)', borderRadius: '8px', border: '1px solid rgba(56,189,248,0.2)' }}>
                                    <span style={{ color: '#e2e8f0', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{width: 8, height: 8, borderRadius: '50%', background: '#38bdf8', boxShadow: '0 0 8px #38bdf8'}} />
                                        User / ID: <b style={{ color: '#38bdf8' }}>{idToDisplay}</b>
                                    </span>
                                    <span style={{ 
                                        background: 'linear-gradient(135deg, #f59e0b, #d97706)', 
                                        color: '#fff', padding: '4px 12px', borderRadius: '4px', 
                                        fontWeight: 'bold', fontSize: '0.8rem',
                                        boxShadow: '0 2px 8px rgba(245,158,11,0.3)' 
                                    }}>
                                        {count} Nomor
                                    </span>
                                </div>
                            )})}
                        </div>
                    )}
                </div>

                {/* Live Activity Feed */}
                <div className="glass-panel" style={{ maxHeight: '420px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <h3 style={{ margin: 0, fontSize: '0.95rem' }}>⚡ Live Activity</h3>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#10b981' }}>
                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} className="pulse-dot" />
                            LIVE
                        </div>
                    </div>
                    {activities.length === 0 ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: '0.85rem', flexDirection: 'column', gap: '8px' }}>
                            <span style={{ fontSize: '2rem' }}>👁️</span>
                            Menunggu aktivitas...
                        </div>
                    ) : (
                        <div style={{ overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
                            {activities.map((item, i) => <ActivityItem key={i} item={item} />)}
                        </div>
                    )}
                </div>
            </div>

            {/* ═══ HISTORICAL STATS CHARTS ═══ */}
            {!loading && stats && (
                <>
                    <h3 style={{ fontSize: '0.95rem', color: '#94a3b8', marginBottom: '1rem' }}>📚 Statistik Historis (DB)</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                        {[
                            { label: 'Total Panggilan', value: stats.totalCalls, color: 'white' },
                            { label: 'Diangkat', value: stats.successCount, color: '#10b981', sub: stats.totalCalls > 0 ? `${((stats.successCount / stats.totalCalls) * 100).toFixed(1)}%` : '0%' },
                            { label: 'Tdk Diangkat / Sibuk', value: stats.noAnswerCount + stats.busyCount, color: '#f59e0b' },
                            { label: 'Gagal', value: stats.failedCount, color: '#ef4444' },
                        ].map(c => (
                            <div key={c.label} className="stat-card">
                                <h3>{c.label}</h3>
                                <div className="value" style={{ color: c.color }}>{c.value}</div>
                                {c.sub && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{c.sub} success rate</div>}
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
                        <div className="glass-panel" style={{ height: '320px' }}>
                            <h3 style={{ marginBottom: '1rem', fontSize: '0.9rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>Hasil Panggilan</h3>
                            <ResponsiveContainer width="100%" height="88%">
                                <PieChart>
                                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={75} paddingAngle={4} dataKey="value">
                                        {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                                    </Pie>
                                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px', fontSize: '0.8rem' }} />
                                    <Legend verticalAlign="bottom" height={30} wrapperStyle={{ fontSize: '0.75rem' }} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="glass-panel" style={{ height: '320px' }}>
                            <h3 style={{ marginBottom: '1rem', fontSize: '0.9rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '0.5rem' }}>Distribusi Tipe Nomor</h3>
                            <ResponsiveContainer width="100%" height="88%">
                                <BarChart data={barData} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                                    <XAxis dataKey="name" stroke="#64748b" fontSize={10} tick={{ dy: 8 }} interval={0} />
                                    <YAxis stroke="#64748b" fontSize={10} />
                                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px', fontSize: '0.8rem' }} />
                                    <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Top Numbers */}
                    {stats.topNumbers?.length > 0 && (
                        <div className="glass-panel">
                            <h3 style={{ marginBottom: '1rem', fontSize: '0.9rem' }}>🏆 Top 5 Nomor Terbanyak</h3>
                            <div className="table-container">
                                <table>
                                    <thead><tr><th>Nomor</th><th>Tipe</th><th>Jumlah Panggilan</th></tr></thead>
                                    <tbody>
                                        {stats.topNumbers.map((num, i) => (
                                            <tr key={i}>
                                                <td style={{ fontFamily: 'monospace' }}>{num.number}</td>
                                                <td><span className="status-badge" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>{num.type}</span></td>
                                                <td>{num.count}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </>
            )}
            {loading && <div style={{ color: '#64748b', padding: '2rem', textAlign: 'center' }}>Memuat statistik...</div>}
        </div>
    );
}
