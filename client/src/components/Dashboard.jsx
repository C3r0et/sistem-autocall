import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function Dashboard() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [chartData, setChartData] = useState([]);
    const [stats, setStats] = useState(null);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    // Filter & pagination state — server-side
    const [filterStatus, setFilterStatus] = useState('ALL');
    const [searchTerm, setSearchTerm] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [pagination, setPagination] = useState({ currentPage: 1, totalPages: 1, totalLogs: 0 });
    const [sortConfig, setSortConfig] = useState({ key: 'timestamp', direction: 'desc' });
    const [limit, setLimit] = useState(20);

    const fetchStats = useCallback(async (page = 1, status = filterStatus, search = searchTerm) => {
        try {
            const params = new URLSearchParams({ page, limit });
            if (status && status !== 'ALL') params.set('status', status);
            if (search.trim()) params.set('search', search.trim());
            const res = await axios.get(`/api/stats/dashboard?${params}`);
            setStats(res.data.stats);
            setLogs(res.data.logs);
            if (res.data.pagination) setPagination(res.data.pagination);
            setLoading(false);
        } catch (error) {
            console.error("Failed to fetch dashboard stats", error);
            setLoading(false);
        }
    }, [filterStatus, searchTerm, limit]);

    useEffect(() => {
        if (user?.role === 'admin') {
            axios.get('/api/stats/employee-activity')
                .then(res => setChartData(res.data))
                .catch(e => console.error('Failed to load chart data', e));
        }
    }, [user]);

    useEffect(() => {
        fetchStats(currentPage, filterStatus, searchTerm);
    }, [currentPage, filterStatus, limit]);

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => {
            setCurrentPage(1);
            fetchStats(1, filterStatus, searchTerm);
        }, 400);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Auto-refresh every 10s
    useEffect(() => {
        const interval = setInterval(() => fetchStats(currentPage, filterStatus, searchTerm), 10000);
        return () => clearInterval(interval);
    }, [currentPage, filterStatus, searchTerm, limit, fetchStats]);

    const handleSort = (key) => {
        setSortConfig(prev => ({
            key,
            direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
        }));
    };

    const sortedLogs = [...logs].sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
        if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    const handleStatusFilter = (status) => {
        setFilterStatus(status);
        setCurrentPage(1);
    };

    const handleExport = async () => {
        try {
            const params = new URLSearchParams();
            if (filterStatus && filterStatus !== 'ALL') params.set('status', filterStatus);
            if (searchTerm.trim()) params.set('search', searchTerm.trim());
            
            const res = await axios.get(`/api/stats/export?${params}`);
            const data = res.data;
            if (data.length === 0) return alert('Tidak ada data yang cocok dengan filter untuk di-export.');
            
            // Build CSV
            const headers = ['Waktu', 'Nomor', 'Employee ID', 'Status', 'Durasi', 'Agent', 'Error'];
            const csvRows = [headers.join(',')];
            
            data.forEach(log => {
                const date = new Date(log.timestamp).toLocaleString('id-ID').replace(/,/g, '');
                const row = [
                    `"${date}"`,
                    `"${log.number}"`,
                    `"${log.employee_id || ''}"`,
                    `"${log.status}"`,
                    `"${log.duration || 0}"`,
                    `"${log.agent_extension || ''}"`,
                    `"${(log.error_message || '').replace(/"/g, '""')}"`
                ];
                csvRows.push(row.join(','));
            });
            
            const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Report_Calls_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error("Export failed", error);
            alert('Gagal mengekspor data.');
        }
    };

    const getStatusStyle = (status) => {
        if (status === 'ANSWERED' || status === 'COMPLETED')
            return { bg: 'rgba(16,185,129,0.15)', color: '#10b981', border: 'rgba(16,185,129,0.3)' };
        if (status === 'FAILED' || status === 'BUSY')
            return { bg: 'rgba(239,68,68,0.15)', color: '#ef4444', border: 'rgba(239,68,68,0.3)' };
        if (status === 'TIMEOUT')
            return { bg: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: 'rgba(245,158,11,0.3)' };
        return { bg: 'rgba(100,116,139,0.15)', color: '#94a3b8', border: 'rgba(100,116,139,0.3)' };
    };

    const SortTh = ({ label, skey, style = {} }) => (
        <th onClick={() => handleSort(skey)} style={{
            cursor: 'pointer', padding: '12px 14px',
            borderBottom: '2px solid rgba(255,255,255,0.08)',
            fontSize: '0.75rem', fontWeight: '600', letterSpacing: '0.05em',
            color: sortConfig.key === skey ? '#38bdf8' : '#64748b',
            textTransform: 'uppercase', whiteSpace: 'nowrap',
            userSelect: 'none', ...style
        }}>
            {label} {sortConfig.key === skey && (sortConfig.direction === 'asc' ? '↑' : '↓')}
        </th>
    );

    // Pagination page numbers
    const getPageNumbers = () => {
        const { totalPages } = pagination;
        if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
        const pages = [];
        pages.push(1);
        if (currentPage > 3) pages.push('...');
        for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
            pages.push(i);
        }
        if (currentPage < totalPages - 2) pages.push('...');
        pages.push(totalPages);
        return pages;
    };

    if (loading) return <div style={{ padding: '2rem', color: 'white' }}>Loading Dashboard...</div>;

    return (
        <div className="tab-content dashboard">
            <h2 style={{ marginBottom: '1.5rem', fontSize: '1.5rem', fontWeight: '600' }}>System Call Logs</h2>

            {/* KPI Cards */}
            <div style={{ marginBottom: '2rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                {[
                    { label: "Today's Calls", value: stats?.todayCalls || 0, sub: `Total: ${stats?.totalCalls || 0}`, color: '#38bdf8' },
                    { label: "Success Rate", value: `${stats?.successRate || 0}%`, sub: 'Answered / Total', color: '#10b981' },
                    { label: "Active Agents", value: stats?.activeAgents || 0, sub: 'Online & Working', color: '#f59e0b' },
                ].map(card => (
                    <div key={card.label} className="stat-card" style={{ background: 'linear-gradient(145deg, rgba(30,41,59,0.6), rgba(15,23,42,0.6))', border: '1px solid rgba(255,255,255,0.05)' }}>
                        <h3>{card.label}</h3>
                        <div className="value" style={{ color: card.color }}>{card.value}</div>
                        <div className="sub-text">{card.sub}</div>
                    </div>
                ))}
                <div className="stat-card" style={{ cursor: 'pointer', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)' }}
                    onClick={() => navigate('/tools')}>
                    <h3 style={{ color: '#3b82f6' }}>Quick Action</h3>
                    <div className="value" style={{ fontSize: '1.2rem', marginTop: '5px' }}>🚀 Start Blast</div>
                    <div className="sub-text">Go to Tools →</div>
                </div>
            </div>

            {/* Admin Chart Panel */}
            {user?.role === 'admin' && chartData.length > 0 && (
                <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: '1.5rem', marginBottom: '2rem' }}>
                    <h3 style={{ margin: '0 0 1.25rem 0', fontSize: '1.1rem', fontWeight: '600' }}>📊 Aktivitas Blast Call per Employee (Top 10)</h3>
                    <div style={{ width: '100%', height: '300px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                <XAxis dataKey="employee_id" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: 'rgba(15,23,42,0.9)', borderColor: 'rgba(255,255,255,0.1)', color: '#fff', borderRadius: '8px' }}
                                    itemStyle={{ color: '#e2e8f0', fontSize: '0.9rem' }}
                                />
                                <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                                <Bar dataKey="total_calls" name="Total Panggilan" fill="#38bdf8" radius={[4, 4, 0, 0]} barSize={35} />
                                <Bar dataKey="answered_calls" name="Diangkat / Sukses" fill="#10b981" radius={[4, 4, 0, 0]} barSize={35} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Table Panel */}
            <div className="glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: '1.5rem' }}>
                {/* Header */}
                <div style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '600' }}>📋 Call Log History</h3>
                    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* Search */}
                        <input
                            type="text"
                            placeholder="🔍 Nomor / Employee ID / Agent..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{
                                padding: '0.45rem 0.9rem', borderRadius: '6px',
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'rgba(0,0,0,0.25)', color: 'white',
                                outline: 'none', fontSize: '0.85rem', minWidth: '230px'
                            }}
                        />
                        {/* Status Filter */}
                        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', borderRadius: '6px', padding: '3px' }}>
                            {['ALL', 'ANSWERED', 'FAILED', 'BUSY', 'TIMEOUT'].map(s => (
                                <button key={s} onClick={() => handleStatusFilter(s)} style={{
                                    background: filterStatus === s ? 'var(--primary)' : 'transparent',
                                    color: filterStatus === s ? 'white' : '#64748b',
                                    border: 'none', padding: '0.35rem 0.6rem',
                                    borderRadius: '4px', fontSize: '0.72rem',
                                    cursor: 'pointer', fontWeight: filterStatus === s ? '700' : '400',
                                    transition: 'all 0.2s'
                                }}>
                                    {s}
                                </button>
                            ))}
                        </div>
                        <button className="btn-secondary" onClick={() => fetchStats(currentPage, filterStatus, searchTerm)}
                            style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.82rem', padding: '0.4rem 0.75rem' }}>
                            🔄 Refresh
                        </button>
                        <button className="btn-secondary" onClick={handleExport}
                            style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.82rem', padding: '0.4rem 0.75rem', background: 'rgba(16, 185, 129, 0.2)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
                            📥 Export CSV
                        </button>
                    </div>
                </div>

                {/* Table */}
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: '0.85rem' }}>
                        <thead style={{ position: 'sticky', top: 0, background: '#1a2740', zIndex: 1 }}>
                            <tr>
                                <SortTh label="Waktu" skey="timestamp" />
                                <SortTh label="Nomor" skey="number" />
                                <th style={{ padding: '12px 14px', borderBottom: '2px solid rgba(255,255,255,0.08)', fontSize: '0.75rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    👤 Employee ID
                                </th>
                                <SortTh label="Status" skey="status" />
                                <SortTh label="Durasi" skey="duration" />
                                <SortTh label="Agent" skey="agent_extension" />
                                <th style={{ padding: '12px 14px', borderBottom: '2px solid rgba(255,255,255,0.08)', fontSize: '0.75rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Error</th>
                                <th style={{ padding: '12px 14px', borderBottom: '2px solid rgba(255,255,255,0.08)', fontSize: '0.75rem', fontWeight: '600', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center' }}>Rekaman</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedLogs.map((log) => {
                                const st = getStatusStyle(log.status);
                                return (
                                    <tr key={log.id}
                                        onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.025)'}
                                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                        style={{ transition: 'background 0.15s' }}>
                                        <td style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#64748b', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                            {new Date(log.timestamp).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                                        </td>
                                        <td style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', fontWeight: '500', fontFamily: 'monospace', letterSpacing: '0.03em' }}>
                                            {log.number}
                                        </td>
                                        <td style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            {log.employee_id ? (
                                                <span style={{
                                                    background: 'rgba(99,102,241,0.15)',
                                                    border: '1px solid rgba(99,102,241,0.3)',
                                                    color: '#a5b4fc',
                                                    padding: '3px 8px', borderRadius: '5px',
                                                    fontSize: '0.78rem', fontWeight: '600', fontFamily: 'monospace'
                                                }}>
                                                    {log.employee_id}
                                                </span>
                                            ) : (
                                                <span style={{ color: '#334155', fontSize: '0.75rem' }}>—</span>
                                            )}
                                        </td>
                                        <td style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            <span style={{
                                                background: st.bg, color: st.color,
                                                border: `1px solid ${st.border}`,
                                                padding: '3px 8px', borderRadius: '5px',
                                                fontSize: '0.72rem', fontWeight: '700', letterSpacing: '0.04em'
                                            }}>
                                                {log.status}
                                            </span>
                                        </td>
                                        <td style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#94a3b8' }}>
                                            {log.duration ? `${log.duration}s` : '—'}
                                        </td>
                                        <td style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                            {log.agent_extension ? (
                                                <span style={{ background: 'rgba(255,255,255,0.07)', padding: '2px 7px', borderRadius: '4px', fontSize: '0.78rem', color: '#94a3b8' }}>
                                                    {log.agent_extension}
                                                </span>
                                            ) : '—'}
                                        </td>
                                        <td style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', color: '#ef4444', fontSize: '0.78rem', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {log.error_message || '—'}
                                        </td>
                                        <td style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', textAlign: 'center' }}>
                                                <audio 
                                                    controls 
                                                    preload="none" 
                                                    style={{ height: '30px', width: '130px', margin: '0 auto', display: 'block' }}
                                                    src={`/api/recordings/stream?number=${log.number}&date=${encodeURIComponent(log.timestamp)}&token=${localStorage.getItem('auth_token')}`}
                                                >
                                                    Browser Anda tidak support.
                                                </audio>
                                        </td>
                                    </tr>
                                );
                            })}
                            {sortedLogs.length === 0 && (
                                <tr>
                                    <td colSpan="8" style={{ textAlign: 'center', padding: '3rem', color: '#334155' }}>
                                        <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📭</div>
                                        <div style={{ fontSize: '0.9rem' }}>Tidak ada log yang cocok dengan filter.</div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination */}
                <div style={{
                    marginTop: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem', flexWrap: 'wrap', gap: '0.5rem'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                        <div style={{ color: '#475569', fontSize: '0.8rem' }}>
                            Menampilkan <strong style={{ color: '#94a3b8' }}>{(currentPage - 1) * limit + (pagination.totalLogs > 0 ? 1 : 0)}–{Math.min(currentPage * limit, pagination.totalLogs)}</strong>{' '}
                            dari <strong style={{ color: '#94a3b8' }}>{pagination.totalLogs}</strong> entri
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#64748b' }}>
                            <span>Rows per page:</span>
                            <select 
                                value={limit} 
                                onChange={e => { 
                                    setLimit(Number(e.target.value)); 
                                    setCurrentPage(1); 
                                }}
                                style={{ 
                                    background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', 
                                    color: 'white', borderRadius: '4px', padding: '2px 4px', outline: 'none',
                                    cursor: 'pointer'
                                }}
                            >
                                <option value={10}>10</option>
                                <option value={20}>20</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        {/* Prev */}
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage <= 1}
                            style={{
                                padding: '5px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)',
                                background: currentPage <= 1 ? 'transparent' : 'rgba(255,255,255,0.06)',
                                color: currentPage <= 1 ? '#334155' : '#94a3b8',
                                cursor: currentPage <= 1 ? 'not-allowed' : 'pointer', fontSize: '0.82rem'
                            }}>
                            ‹ Prev
                        </button>

                        {/* Page Numbers */}
                        {getPageNumbers().map((pg, i) => (
                            pg === '...' ? (
                                <span key={`dots-${i}`} style={{ color: '#334155', padding: '0 4px', fontSize: '0.82rem' }}>…</span>
                            ) : (
                                <button key={pg} onClick={() => setCurrentPage(pg)} style={{
                                    width: '34px', height: '32px', borderRadius: '6px',
                                    border: '1px solid ' + (currentPage === pg ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.07)'),
                                    background: currentPage === pg ? 'rgba(59,130,246,0.25)' : 'rgba(255,255,255,0.04)',
                                    color: currentPage === pg ? '#60a5fa' : '#64748b',
                                    cursor: 'pointer', fontSize: '0.82rem', fontWeight: currentPage === pg ? '700' : '400',
                                    transition: 'all 0.15s'
                                }}>
                                    {pg}
                                </button>
                            )
                        ))}

                        {/* Next */}
                        <button
                            onClick={() => setCurrentPage(p => Math.min(pagination.totalPages, p + 1))}
                            disabled={currentPage >= pagination.totalPages}
                            style={{
                                padding: '5px 12px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)',
                                background: currentPage >= pagination.totalPages ? 'transparent' : 'rgba(255,255,255,0.06)',
                                color: currentPage >= pagination.totalPages ? '#334155' : '#94a3b8',
                                cursor: currentPage >= pagination.totalPages ? 'not-allowed' : 'pointer', fontSize: '0.82rem'
                            }}>
                            Next ›
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
