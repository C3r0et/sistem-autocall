import { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

export default function WhatsAppManager() {
    const [sessions, setSessions] = useState([]);
    const [selectedSessionId, setSelectedSessionId] = useState('');
    const [status, setStatus] = useState({ isReady: false, isAuthenticated: false });
    
    // Tool States
    const [checkNumber, setCheckNumber] = useState('');
    const [checkResult, setCheckResult] = useState(null);
    const [sendNumber, setSendNumber] = useState('');
    const [sendMessage, setSendMessage] = useState('');
    const [sendLog, setSendLog] = useState('');
    const [loading, setLoading] = useState(false);

    // 1. Fetch Sessions on Mount
    useEffect(() => {
        const fetchSessions = async () => {
            try {
                const res = await axios.get('/api/whatsapp/sessions');
                setSessions(res.data);
                if (res.data.length > 0) {
                    // Default to first connected or first available
                    const connected = res.data.find(s => s.status === 'connected');
                    setSelectedSessionId(connected ? connected.id : res.data[0].id);
                }
            } catch (error) {
                console.error("Failed to fetch sessions", error);
            }
        };
        fetchSessions();
    }, []);

    // 2. Poll Status of Selected Session
    useEffect(() => {
        if (!selectedSessionId) return;

        const fetchStatus = async () => {
            try {
                const res = await axios.get(`/api/whatsapp/${selectedSessionId}/status`);
                setStatus(res.data);
            } catch (error) {
                console.error("Failed to fetch WA status", error);
            }
        };

        fetchStatus();
        const interval = setInterval(fetchStatus, 3000);
        return () => clearInterval(interval);
    }, [selectedSessionId]);

    const handleCheckNumber = async (e) => {
        e.preventDefault();
        setLoading(true);
        setCheckResult(null);
        try {
            const res = await axios.post(`/api/whatsapp/${selectedSessionId}/check`, { number: checkNumber });
            setCheckResult(res.data);
        } catch (error) {
            setCheckResult({ error: error.response?.data?.error || error.message });
        } finally {
            setLoading(false);
        }
    };

    const handleSendMessage = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await axios.post(`/api/whatsapp/${selectedSessionId}/send`, { number: sendNumber, message: sendMessage });
            setSendLog(`✅ Sent to ${sendNumber}`);
            setSendMessage('');
        } catch (error) {
            setSendLog(`❌ Failed: ${error.response?.data?.error || error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const selectedSession = sessions.find(s => s.id === selectedSessionId);

    if (sessions.length === 0) {
        return (
            <div className="tab-content whatsapp-manager" style={{ textAlign: 'center', padding: '3rem' }}>
                <h2>WhatsApp Operational Tools</h2>
                <div className="glass-panel" style={{ marginTop: '2rem', display: 'inline-block' }}>
                    <p style={{ marginBottom: '1rem' }}>No WhatsApp accounts configured.</p>
                    <Link to="/whatsapp-accounts">
                        <button className="btn-primary">Go to WA Accounts to Add One</button>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="tab-content whatsapp-manager">
            <h2 style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>WhatsApp Tools</span>
                <Link to="/whatsapp-accounts" style={{ fontSize: '0.9rem', textDecoration: 'none' }}>
                    <button className="btn-secondary">Manage Accounts</button>
                </Link>
            </h2>

            {/* Session Selector */}
            <div style={{ marginBottom: '2rem' }}>
                <label style={{ marginRight: '10px' }}>Select Account:</label>
                <select 
                    value={selectedSessionId} 
                    onChange={e => setSelectedSessionId(e.target.value)}
                    className="input-single"
                    style={{ width: 'auto', display: 'inline-block' }}
                >
                    {sessions.map(s => (
                        <option key={s.id} value={s.id}>
                            {s.name} ({s.status})
                        </option>
                    ))}
                </select>
                <span style={{ marginLeft: '10px', color: status.isAuthenticated ? '#34d399' : '#f87171' }}>
                    {status.isAuthenticated ? '● Connected' : '● Disconnected'}
                </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                {/* Tools Panel */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', gridColumn: '1 / -1' }}>
                    
                    {/* Check Number */}
                    <div className="glass-panel">
                        <h3 style={{ marginBottom: '1rem' }}>🔍 Check Number</h3>
                        <form onSubmit={handleCheckNumber} style={{ display: 'flex', gap: '10px' }}>
                            <input 
                                type="text" 
                                placeholder="e.g. 08123456789" 
                                className="input-single"
                                value={checkNumber}
                                onChange={e => setCheckNumber(e.target.value)}
                                disabled={!status.isReady || loading}
                            />
                            <button type="submit" className="btn-primary" disabled={!status.isReady || loading}>
                                Check
                            </button>
                        </form>
                        {checkResult && (
                            <div style={{ marginTop: '1rem', padding: '0.5rem', borderRadius: '4px', background: checkResult.isRegistered ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)' }}>
                                {checkResult.error ? (
                                    <span style={{ color: '#ef4444' }}>Error: {checkResult.error}</span>
                                ) : (
                                    <span style={{ color: checkResult.isRegistered ? '#34d399' : '#fca5a5' }}>
                                        {checkResult.isRegistered ? '✅ Active on WhatsApp' : '❌ Not Registered'}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Send Message */}
                    <div className="glass-panel" style={{ flex: 1 }}>
                        <h3 style={{ marginBottom: '1rem' }}>📤 Send Message</h3>
                        <form onSubmit={handleSendMessage} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            <input 
                                type="text" 
                                placeholder="Target Number (e.g. 0812...)" 
                                className="input-single"
                                value={sendNumber}
                                onChange={e => setSendNumber(e.target.value)}
                                disabled={!status.isReady || loading}
                            />
                            <textarea 
                                placeholder="Message..." 
                                className="input-area"
                                value={sendMessage}
                                onChange={e => setSendMessage(e.target.value)}
                                style={{ height: '80px', resize: 'none' }}
                                disabled={!status.isReady || loading}
                            />
                            <button type="submit" className="btn-primary" disabled={!status.isReady || loading || !sendNumber || !sendMessage}>
                                {loading ? 'Sending...' : 'Send Message'}
                            </button>
                        </form>
                        {sendLog && (
                            <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
                                {sendLog}
                            </div>
                        )}
                    </div>

                </div>
            </div>
        </div>
    );
}
