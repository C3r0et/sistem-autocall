import React, { useState, useEffect } from 'react';
import axios from 'axios';
import QRCode from 'react-qr-code';

export default function WhatsAppManagement() {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [selectedSessionId, setSelectedSessionId] = useState(null); // ID only, not object
    const [newSessionName, setNewSessionName] = useState('');

    useEffect(() => {
        fetchSessions();
        // Poll faster to catch QR codes and Status updates quickly
        const interval = setInterval(fetchSessions, 2000); 
        return () => clearInterval(interval);
    }, []);

    const fetchSessions = async () => {
        try {
            const res = await axios.get('/api/whatsapp/sessions');
            setSessions(res.data);
            setLoading(false);
        } catch (error) {
            console.error('Error fetching sessions:', error);
        }
    };

    const createSession = async () => {
        if (!newSessionName) return alert('Session Name is required');
        try {
            await axios.post('/api/whatsapp/session', { name: newSessionName });
            setNewSessionName('');
            fetchSessions();
        } catch (error) {
            alert('Error creating session');
        }
    };

    const logoutSession = async (id) => {
        if (!confirm('Are you sure you want to disconnect this session?')) return;
        try {
            await axios.post(`/api/whatsapp/session/${id}/logout`);
            fetchSessions();
        } catch (error) {
            alert('Error logging out session');
        }
    };

    const deleteSession = async (id) => {
        if (!confirm('Are you sure you want to delete this session?')) return;
        try {
            await axios.delete(`/api/whatsapp/session/${id}`);
            fetchSessions();
        } catch (error) {
            alert('Error deleting session');
        }
    };

    const openQR = (sessionId) => {
        setSelectedSessionId(sessionId);
        setShowModal(true);
        // Immediate fetch to update status right away
        fetchSessions();
    };

    const closeModal = () => {
        setShowModal(false);
        setSelectedSessionId(null);
    };

    // Derived State: Current Session Object
    const activeSession = sessions.find(s => s.id === selectedSessionId) || null;

    // Auto-Close Modal if Connected
    useEffect(() => {
        if (showModal && activeSession && activeSession.status === 'connected') {
            // Optional: Give user a moment to see success
            // setTimeout(() => closeModal(), 1000); 
            // Or just let them close it manually, but update UI
        }
    }, [showModal, activeSession]);

    return (
        <div style={{ padding: '2rem', height: '100%', overflowY: 'auto' }}>
            <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                📱 WhatsApp Account Management
            </h2>

            {/* Create New Session */}
            <div className="glass-panel" style={{ marginBottom: '2rem', display: 'flex', gap: '1rem', alignItems: 'center', padding: '1rem' }}>
                <input 
                    type="text" 
                    placeholder="Account Name (e.g. Marketing WA)" 
                    value={newSessionName}
                    onChange={(e) => setNewSessionName(e.target.value)}
                    className="input-area"
                    style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}
                />
                <button className="btn-primary" onClick={createSession}>
                    + Add New Account
                </button>
            </div>

            {/* Session List */}
            <div className="glass-panel" style={{ padding: '0' }}>
                <table className="table-logs" style={{ width: '100%' }}>
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'left', padding: '1rem' }}>Account Name</th>
                            <th style={{ textAlign: 'left', padding: '1rem' }}>Status</th>
                            <th style={{ textAlign: 'left', padding: '1rem' }}>Connection Info</th>
                            <th style={{ textAlign: 'left', padding: '1rem' }}>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sessions.map(session => (
                            <tr key={session.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <td style={{ padding: '1rem' }}>{session.name || session.id}</td>
                                <td style={{ padding: '1rem' }}>
                                    <span style={{ 
                                        padding: '4px 8px', 
                                        borderRadius: '4px', 
                                        fontSize: '0.8rem',
                                        background: session.status === 'connected' ? 'rgba(16, 185, 129, 0.2)' : 
                                                    (session.status.includes('sync') ? 'rgba(59, 130, 246, 0.2)' : 'rgba(239, 68, 68, 0.2)'),
                                        color: session.status === 'connected' ? '#34d399' : 
                                               (session.status.includes('sync') ? '#60a5fa' : '#f87171')
                                    }}>
                                        {session.status.toUpperCase()}
                                    </span>
                                </td>
                                <td style={{ padding: '1rem', fontSize: '0.9rem', color: '#94a3b8' }}>
                                    {session.info ? `${session.info.pushname} (${session.info.wid.user})` : '-'}
                                </td>
                                <td style={{ padding: '1rem', display: 'flex', gap: '0.5rem' }}>
                                    {session.status === 'connected' ? (
                                        <button 
                                            className="btn-secondary" 
                                            style={{ padding: '4px 8px', fontSize: '0.8rem', background: 'rgba(245, 158, 11, 0.1)', color: '#fbbf24', border: '1px solid rgba(245, 158, 11, 0.2)' }}
                                            onClick={() => logoutSession(session.id)}
                                        >
                                            Disconnect
                                        </button>
                                    ) : (
                                        <button 
                                            className="btn-primary" 
                                            style={{ padding: '4px 8px', fontSize: '0.8rem' }}
                                            onClick={() => openQR(session.id)}
                                        >
                                            {session.status === 'initializing' ? 'Initializing...' : 'Scan QR'}
                                        </button>
                                    )}
                                    <button 
                                        className="btn-secondary" 
                                        style={{ padding: '4px 8px', fontSize: '0.8rem', background: 'rgba(239, 68, 68, 0.1)', color: '#f87171', border: '1px solid rgba(239, 68, 68, 0.2)' }}
                                        onClick={() => deleteSession(session.id)}
                                    >
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                         {sessions.length === 0 && !loading && (
                            <tr>
                                <td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                                    No WhatsApp accounts found. Add one above.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* QR/Status Modal */}
            {showModal && activeSession && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                }} onClick={closeModal}>
                    <div className="glass-panel" style={{ padding: '2rem', width: '400px', textAlign: 'center', background: '#1e293b' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ marginBottom: '1rem' }}>
                            {activeSession.status === 'connected' ? 'Connected! 🎉' : `Link ${activeSession.name}`}
                        </h3>
                        
                        {activeSession.status === 'connected' ? (
                            <div style={{ padding: '2rem' }}>
                                <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>✅</div>
                                <p style={{ color: '#34d399' }}>Account successfully linked.</p>
                                <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>{activeSession.info?.pushname} ({activeSession.info?.wid?.user})</p>
                            </div>
                        ) : activeSession.loading ? (
                             <div style={{ padding: '2rem' }}>
                                <div className="spinner" style={{ margin: '0 auto 1rem' }}></div> 
                                {/* Assuming spinner class exists, if not just text */}
                                <h4 style={{ color: '#60a5fa' }}>Synchronizing...</h4>
                                <p>{activeSession.loading.message} ({activeSession.loading.percent}%)</p>
                            </div>
                        ) : activeSession.qrCode ? (
                             <div style={{ background: 'white', padding: '16px', borderRadius: '8px', display: 'inline-block' }}>
                                <QRCode value={activeSession.qrCode} size={256} />
                            </div>
                        ) : (
                            <div style={{ padding: '2rem', color: '#94a3b8' }}>
                                <div style={{ marginBottom: '1rem' }}>⏳ Initializing...</div>
                                <small>Please wait for QR Code</small>
                            </div>
                        )}
                        
                        <div style={{ marginTop: '1.5rem' }}>
                            <button className="btn-secondary" onClick={closeModal}>Close</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
