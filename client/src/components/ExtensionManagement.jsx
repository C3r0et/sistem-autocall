import { useState, useEffect } from 'react';
import axios from 'axios';

export default function ExtensionManagement({ socket, isConnected }) {
    const [extensions, setExtensions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // New Extension Form Data
    const [formData, setFormData] = useState({
        mode: 'single',
        vendor: 'telesave',
        extension: '',
        start: '',
        end: ''
    });

    const fetchData = async () => {
        try {
            // Fetch DB list dari /api/extensions dan status live dari /api/extensions/status
            const [confRes, statusRes] = await Promise.all([
                axios.get('/api/extensions'),
                axios.get('/api/extensions/status')
            ]);
            
            const dbExts = confRes.data.extensions || [];
            const statusExts = Array.isArray(statusRes.data) ? statusRes.data : [];
            
            // Merge Data
            const merged = dbExts.map(conf => {
                const status = statusExts.find(s => s.extension === conf.extension);
                return { 
                    ...conf, 
                    ...status, 
                    status: status ? status.status : 'OFFLINE', // Default to offline if agent not running yet
                    currentCall: status ? status.currentCall : null
                };
            });
            
            merged.sort((a, b) => parseInt(a.extension) - parseInt(b.extension));
            setExtensions(merged);
            setLoading(false);
        } catch (error) {
            console.error("Failed to fetch extensions", error);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();

        if (socket) {
            // Listen for real-time updates
            socket.on('extension-update', (updatedExt) => {
                setExtensions(prev => {
                    return prev.map(ext => 
                        ext.extension === updatedExt.extension 
                        ? { ...ext, ...updatedExt } 
                        : ext
                    );
                });
            });

            return () => {
                socket.off('extension-update');
            };
        }
    }, [socket]);

    const handleAddSubmit = async (e) => {
        e.preventDefault();
        try {
            let payload = [];
            const timestamp = Date.now(); // Anti-cache for some reason? No, just logic.

            if (formData.mode === 'single') {
                payload.push({
                    extension: formData.extension.toString(),
                    vendor: formData.vendor
                });
            } else {
                const start = parseInt(formData.start);
                const end = parseInt(formData.end);
                
                if (start > end) {
                    alert('Start range must be less than end range');
                    return;
                }
                
                if ((end - start) > 50) {
                     if (!confirm(`You are about to add ${end - start + 1} extensions. Continue?`)) return;
                }

                for (let i = start; i <= end; i++) {
                    payload.push({
                        extension: i.toString(),
                        vendor: formData.vendor
                    });
                }
            }

            // Send to backend
            await axios.post('/api/extensions', { extensions: payload });
            
            setIsModalOpen(false);
            setFormData({
                mode: 'single',
                vendor: 'telesave',
                extension: '',
                start: '',
                end: ''
            });
            // Refresh list (Backend will trigger reloadAgents, wait a ms)
            setTimeout(fetchData, 1000);
        } catch (error) {
            alert('Failed to add extension: ' + (error.response?.data?.error || error.message));
        }
    };

    const handleDisconnect = async (extension) => {
        // No confirm needed for quick action? Or keep it? User said "setelah saya disconnect", implies intentional.
        // Let's keep confirm but make it simple.
        if (confirm(`Stop Extension ${extension}?`)) {
            try {
                await axios.post(`/api/extensions/${extension}/disconnect`);
            } catch (error) {
                alert('Disconnect failed: ' + error.message);
            }
        }
    };

    const handleConnect = async (extension) => {
        try {
            await axios.post(`/api/extensions/${extension}/connect`);
        } catch (error) {
            alert('Connect failed: ' + error.message);
        }
    };

    const handleDelete = async (id, extension) => {
        if (confirm(`Are you sure you want to delete Extension ${extension}?`)) {
            try {
                await axios.delete(`/api/extensions/${id}`);
                setTimeout(fetchData, 500); // Wait for backend refresh
            } catch (error) {
                alert('Delete failed: ' + error.message);
            }
        }
    };

    if (!isConnected) return <div style={{ color: 'white', padding: '2rem', textAlign: 'center' }}>Connecting to Real-time service...</div>;
    if (loading) return <div style={{ color: 'white', padding: '2rem' }}>Loading Extensions...</div>;

    return (
        <div className="tab-content" style={{ padding: '0 2rem 2rem 2rem' }}>
            <div className="results-header" style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ fontSize: '1.4rem', fontWeight: '700', margin: 0, background: 'linear-gradient(to right, #f472b6, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        📞 Extension Monitor
                    </h2>
                    <p style={{ marginTop: '0.25rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Real-time status of SIP extensions</p>
                </div>
                
                <button 
                    className="btn-primary" 
                    onClick={() => setIsModalOpen(true)}
                    style={{ 
                        display: 'flex', alignItems: 'center', gap: '8px', 
                        padding: '0.5rem 1rem', fontSize: '0.85rem',
                        background: 'linear-gradient(135deg, #10b981, #059669)',
                        border: '1px solid rgba(16, 185, 129, 0.4)',
                        boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
                        borderRadius: '8px',
                        transition: 'all 0.2s',
                        fontWeight: '600',
                        cursor: 'pointer',
                        width: 'max-content'
                    }}
                    onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                    onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                >
                    <span style={{ fontSize: '1.2rem', lineHeight: 1, fontWeight: 'bold' }}>+</span> New Extension
                </button>
            </div>

            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', 
                gap: '1.5rem' 
            }}>
                {extensions.map((ext) => (
                    <div key={ext.extension} className="glass-panel" 
                         style={{ 
                             padding: '1.5rem', 
                             border: '1px solid rgba(255,255,255,0.08)',
                             position: 'relative',
                             overflow: 'hidden'
                         }}
                    >
                        {/* Status Glow */}
                        <div style={{
                            position: 'absolute', top: 0, left: 0, width: '4px', bottom: 0,
                            background: ext.status === 'BUSY' ? '#f59e0b' : (ext.status === 'ONLINE' ? '#10b981' : '#ef4444'),
                            boxShadow: `0 0 10px ${ext.status === 'BUSY' ? '#f59e0b' : (ext.status === 'ONLINE' ? '#10b981' : '#ef4444')}`
                        }} />

                        {/* Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                            <div>
                                <h3 style={{ fontSize: '1.5rem', fontWeight: '700', margin: 0, color: 'white' }}>{ext.extension}</h3>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                    {ext.serverIp} <span style={{ margin: '0 4px', opacity: 0.5 }}>|</span> 
                                    <strong style={{ color: '#94a3b8' }}>{ext.handledCalls || 0}</strong> Calls
                                </div>
                            </div>
                            
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
                                <div style={{ 
                                    padding: '4px 8px', borderRadius: '4px', 
                                    fontSize: '0.7rem', fontWeight: '700', letterSpacing: '0.5px',
                                    background: ext.status === 'BUSY' ? 'rgba(245, 158, 11, 0.2)' : (ext.status === 'ONLINE' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)'),
                                    color: ext.status === 'BUSY' ? '#f59e0b' : (ext.status === 'ONLINE' ? '#10b981' : '#ef4444'),
                                    border: `1px solid ${ext.status === 'BUSY' ? 'rgba(245, 158, 11, 0.3)' : (ext.status === 'ONLINE' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)')}`
                                }}>
                                    {ext.status}
                                </div>
                                    {/* Action Buttons */}
                                    {ext.status === 'ONLINE' || ext.status === 'BUSY' ? (
                                        <button 
                                            onClick={() => handleDisconnect(ext.extension)}
                                            style={{ 
                                                background: 'transparent', border: 'none', cursor: 'pointer', 
                                                opacity: 0.8, fontSize: '1rem', padding: '4px',
                                                color: '#fca5a5', transition: 'transform 0.2s'
                                            }}
                                            className="hover:scale-110"
                                            title="Stop / Disconnect"
                                        >
                                            🛑
                                        </button>
                                    ) : (
                                        <button 
                                            onClick={() => handleConnect(ext.extension)}
                                            style={{ 
                                                background: 'transparent', border: 'none', cursor: 'pointer', 
                                                opacity: 0.8, fontSize: '1rem', padding: '4px',
                                                color: '#4ade80', transition: 'transform 0.2s'
                                            }}
                                            className="hover:scale-110"
                                            title="Start / Connect"
                                        >
                                            ▶️
                                        </button>
                                    )}
                                    <button 
                                        onClick={() => handleDelete(ext.id, ext.extension)}
                                        style={{ 
                                            background: 'transparent', border: 'none', cursor: 'pointer', 
                                            opacity: 0.5, fontSize: '0.8rem', padding: '2px' 
                                        }}
                                        className="hover:opacity-100"
                                        title="Delete Extension"
                                    >
                                        🗑️
                                    </button>
                                </div>
                        </div>

                        {/* Activity */}
                        <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginBottom: '4px' }}>Current Activity</div>
                            {ext.status === 'BUSY' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ 
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        color: '#f59e0b', fontWeight: '500', fontSize: '0.9rem' 
                                    }}>
                                        <span style={{ animation: 'pulse 1.5s infinite' }}>📞</span> 
                                        Calling: {ext.currentCall || 'Unknown'}
                                    </div>
                                    {ext.callStatus && ext.callStatus !== 'IDLE' && (
                                         <div style={{ 
                                            alignSelf: 'flex-start', marginLeft: '26px',
                                            fontSize: '0.75rem', padding: '2px 8px', borderRadius: '10px',
                                            background: ext.callStatus === 'ANSWERED' ? 'rgba(74, 222, 128, 0.2)' : 
                                                        (ext.callStatus === 'RINGING' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(245, 158, 11, 0.2)'),
                                            color: ext.callStatus === 'ANSWERED' ? '#4ade80' : 
                                                   (ext.callStatus === 'RINGING' ? '#38bdf8' : '#f59e0b'),
                                            border: `1px solid ${ext.callStatus === 'ANSWERED' ? 'rgba(74, 222, 128, 0.3)' : 
                                                                (ext.callStatus === 'RINGING' ? 'rgba(56, 189, 248, 0.3)' : 'rgba(245, 158, 11, 0.3)')}`
                                         }}>
                                            {ext.callStatus}
                                         </div>
                                    )}
                                </div>
                            ) : (
                                <div style={{ color: '#64748b', fontSize: '0.9rem', fontStyle: 'italic' }}>
                                    Idle
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* ADD MODAL */}
            {isModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(8px)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                }}>
                    <div className="glass-panel" 
                         style={{ 
                             width: '400px', 
                             background: '#1e293b', 
                             padding: '1.5rem',
                             borderRadius: '12px',
                             border: '1px solid rgba(255,255,255,0.1)',
                             boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
                         }}
                    >
                        <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.75rem' }}>
                            ✨ Add SIP Extension
                        </h3>
                        
                        {/* Mode Toggle */}
                        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: '8px', marginBottom: '1.5rem' }}>
                            <button 
                                type="button" 
                                onClick={() => setFormData({...formData, mode: 'single'})}
                                style={{
                                    flex: 1, padding: '8px', borderRadius: '6px', border: 'none',
                                    background: formData.mode === 'single' ? '#3b82f6' : 'transparent',
                                    color: formData.mode === 'single' ? 'white' : '#94a3b8',
                                    cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500'
                                }}
                            >
                                Single
                            </button>
                            <button 
                                type="button" 
                                onClick={() => setFormData({...formData, mode: 'range'})}
                                style={{
                                    flex: 1, padding: '8px', borderRadius: '6px', border: 'none',
                                    background: formData.mode === 'range' ? '#3b82f6' : 'transparent',
                                    color: formData.mode === 'range' ? 'white' : '#94a3b8',
                                    cursor: 'pointer', fontSize: '0.9rem', fontWeight: '500'
                                }}
                            >
                                Range
                            </button>
                        </div>
                        
                        <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <label>
                                <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>Vendor</div>
                                <select 
                                    className="input-single"
                                    value={formData.vendor} 
                                    onChange={e => {
                                        const vendor = e.target.value;
                                        setFormData({
                                            ...formData, 
                                            vendor
                                        });
                                    }}
                                    style={{ width: '100%' }}
                                >
                                    <option value="telesave">Telesave</option>
                                    <option value="dankom">Dankom</option>
                                </select>
                            </label>

                            {formData.mode === 'single' ? (
                                <label>
                                    <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>Extension Number</div>
                                    <input 
                                        type="number" required placeholder={formData.vendor === 'telesave' ? "e.g. 1011" : "e.g. 445"}
                                        className="input-single"
                                        value={formData.extension} onChange={e => setFormData({...formData, extension: e.target.value})}
                                    />
                                </label>
                            ) : (
                                <div style={{ display: 'flex', gap: '1rem' }}>
                                    <label style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>Start From</div>
                                        <input 
                                            type="number" required placeholder={formData.vendor === 'telesave' ? "1001" : "445"}
                                            className="input-single"
                                            value={formData.start} onChange={e => setFormData({...formData, start: e.target.value})}
                                        />
                                    </label>
                                    <label style={{ flex: 1 }}>
                                        <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px' }}>End At</div>
                                        <input 
                                            type="number" required placeholder={formData.vendor === 'telesave' ? "1010" : "455"}
                                            className="input-single"
                                            value={formData.end} onChange={e => setFormData({...formData, end: e.target.value})}
                                        />
                                    </label>
                                </div>
                            )}

                            {formData.vendor === 'dankom' && (
                                <div style={{ 
                                    background: 'rgba(251, 191, 36, 0.1)',
                                    border: '1px solid rgba(251, 191, 36, 0.3)',
                                    borderRadius: '8px',
                                    padding: '10px 12px',
                                    fontSize: '0.8rem',
                                    color: '#fbbf24'
                                }}>
                                    🔑 <strong>Password default Dankom:</strong> <code style={{background:'rgba(0,0,0,0.3)',padding:'2px 6px',borderRadius:'4px',color:'#fde68a'}}>d4nk0mptsss1234!</code>
                                    <div style={{marginTop:'4px',color:'#94a3b8',fontSize:'0.75rem'}}>Server IP: <strong style={{color:'#e2e8f0'}}>10.9.7.95</strong></div>
                                </div>
                            )}

                            <div style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic', marginTop: '0.5rem' }}>
                                * Credentials dan IP akan diset otomatis di backend berdasarkan vendor.
                            </div>
                            
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button type="button" onClick={() => setIsModalOpen(false)} className="btn-secondary" style={{ flex: 1 }}>Cancel</button>
                                <button type="submit" className="btn-primary" style={{ flex: 2 }}>
                                    {formData.mode === 'single' ? 'Add Extension' : 'Add Range'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
