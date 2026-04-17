import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import { BrowserRouter, Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';

import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './components/LoginPage';
import DashboardOverview from './components/DashboardOverview';
import Dashboard from './components/Dashboard'; // Old Dashboard = Call Logs
import WhatsAppManager from './components/WhatsAppManager';
import WhatsAppManagement from './components/WhatsAppManagement';
import OperationalTools from './components/OperationalTools';
import AdminLayout from './components/AdminLayout';
import UserManagement from './components/UserManagement';
import EmployeeControl from './components/EmployeeControl';
import ExtensionManagement from './components/ExtensionManagement';
import CallSettings from './components/CallSettings';

// Socket instance
let socket = null;

function isITUser(user) {
    if (!user || !user.role) return false;
    const role = user.role.toUpperCase();
    return role.includes('IT') || role.includes('ADMIN');
}

// Trial Banner Component
function TrialBanner() {
    const { user } = useAuth();
    if (!user || isITUser(user) || user.isSubscribed) return null;

    const trialEnds = new Date(user.trialEndsAt);
    const now = new Date();
    const diffTime = trialEnds - now;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 0) {
        return (
            <div style={{ background: '#ef4444', color: 'white', padding: '8px', textAlign: 'center', fontSize: '0.85rem', fontWeight: 'bold' }}>
                Your trial has expired. Please subscribe to continue.
            </div>
        );
    }

    return (
        <div style={{ background: '#3b82f6', color: 'white', padding: '6px', textAlign: 'center', fontSize: '0.8rem' }}>
            Trial Active: {diffDays} days remaining
        </div>
    );

}

function NavBar({ logout }) {
    const location = useLocation();
    const isActive = (path) => location.pathname === path;
    const { user } = useAuth();

    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0.5rem 0 1rem' }}>
            <div className="tab-nav" style={{ marginBottom: 0, borderBottom: 'none' }}>
                {isITUser(user) && (
                    <Link to="/dashboard" style={{ textDecoration: 'none' }}>
                        <button className={`tab-btn ${isActive('/dashboard') ? 'active' : ''}`}>
                            📊 Dashboard
                        </button>
                    </Link>
                )}
                <Link to="/tools" style={{ textDecoration: 'none' }}>
                    <button className={`tab-btn ${isActive('/tools') ? 'active' : ''}`}>
                        🛠️ Tools
                    </button>
                </Link>
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button 
                    onClick={() => { if(confirm('Disconnect?')) window.location.reload(); }} 
                    className="btn-secondary" 
                    style={{ padding: '4px 8px', fontSize: '0.75rem', border: 'none', background: 'rgba(255,255,255,0.05)' }}
                >
                    Disconn
                </button>
                <button onClick={logout} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem', border: 'none', background: 'rgba(239, 68, 68, 0.2)', color: 'var(--color-error)' }}>
                    Logout
                </button>
            </div>
        </div>
    );
}

function MainApp() {
  const { user, logout } = useAuth();
  // Connection State
  const [serverUrl, setServerUrl] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    // Default ke origin saat ini agar melewati Vite proxy (localhost:5173 → localhost:3001)
    const defaultUrl = window.location.origin;
    let savedUrl = localStorage.getItem('autocall_server_url');

    // Hapus URL lama yang mengarah langsung ke IP server (bukan proxy)
    if (savedUrl && !savedUrl.includes('localhost') && !savedUrl.includes('127.0.0.1')) {
      localStorage.removeItem('autocall_server_url');
      savedUrl = null;
    }

    const urlToUse = savedUrl || defaultUrl;
    setServerUrl(urlToUse);
    connectToServer(urlToUse);
  }, []);

  const connectToServer = async (urlOverride = null) => {
    const targetUrl = urlOverride || serverUrl;
    
    if (!targetUrl) {
        alert('Please enter Server URL');
        return;
    }

    setIsConnecting(true);

    try {
        // Test connection and auth
        await axios.get(`${targetUrl}/api/health`);
        
        // Initialize Socket
        socket = io(targetUrl);

        socket.on('connect', () => {
            setIsConnected(true);
            setIsConnecting(false);
            localStorage.setItem('autocall_server_url', targetUrl);
            
            // Configure Axios Base URL
            axios.defaults.baseURL = targetUrl;
            
            // Preserve JWT token after setting baseURL
            const token = localStorage.getItem('auth_token');
            if (token) {
                axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            }
        });

        socket.on('connect_error', (err) => {
            console.error('Connection error:', err);
            setIsConnecting(false);
            if (!urlOverride) {
                alert(`Failed to connect to ${targetUrl}. Make sure server is running.`);
            }
            socket.disconnect();
        });

    } catch (error) {
        console.error('Init error:', error);
        setIsConnecting(false);
        if (!urlOverride) {
            alert('Error initializing connection');
        }
    }
  };

  if (!isConnected) {
    return (
        <div className="container" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '500px' }}>
            <div className="glass-panel" style={{ width: '360px', textAlign: 'center' }}>
                <header style={{ marginBottom: '2rem' }}>
                    <h1>🔌 AutoCall Connect</h1>
                    <p style={{ marginTop: '0.5rem' }}>Enter Server URL to start</p>
                </header>
                <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
                    <input 
                        type="text" 
                        className="input-area"
                        placeholder="e.g. http://localhost:3001"
                        value={serverUrl}
                        onChange={e => setServerUrl(e.target.value)}
                        style={{ minHeight: '44px', padding: '0 12px', height: 'auto', background: 'rgba(0,0,0,0.3)' }}
                    />
                    <button 
                        className="btn-primary" 
                        onClick={() => connectToServer()}
                        disabled={isConnecting}
                        style={{ justifyContent: 'center' }}
                    >
                        {isConnecting ? 'Connecting...' : 'Connect to Server'}
                    </button>
                    {isConnecting && (
                       <p style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '10px' }}>
                           Connecting...
                       </p>
                    )}
                </div>
            </div>
        </div>
    );
  }

  // ADMIN / IT TEAM VIEW
  if (isITUser(user)) {
      return (
          <AdminLayout>
              <Routes>
                  <Route path="/dashboard" element={<DashboardOverview />} />
                  <Route path="/whatsapp" element={<WhatsAppManager />} />
                  <Route path="/whatsapp-accounts" element={<WhatsAppManagement />} />
                  <Route path="/logs" element={<Dashboard />} /> {/* Restored Logs View */}
                  <Route path="/tools" element={<OperationalTools socket={socket} isConnected={isConnected} user={user} />} />
                  <Route path="/users" element={<UserManagement />} />
                  <Route path="/employee-control" element={<EmployeeControl />} />
                  <Route path="/extensions" element={<ExtensionManagement socket={socket} isConnected={isConnected} />} />
                  <Route path="/settings" element={<CallSettings />} />
                   {/* Placeholder for logs if needed, or redirect */}
                  <Route path="*" element={<Navigate to="/dashboard" replace />} />
              </Routes>
          </AdminLayout>
      );
  }

  // USER / EXTENSION VIEW
  return (
    <div className="container-extension" style={{ flexDirection: 'column', height: '100%', padding: '1rem' }}>
        <TrialBanner />
        
        <NavBar logout={logout} />

        <Routes>
            <Route path="/tools" element={<OperationalTools socket={socket} isConnected={isConnected} user={user} />} />
            <Route path="*" element={<Navigate to="/tools" replace />} />
        </Routes>
    </div>
  )
}

function AppContent() {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div style={{ color: 'white', textAlign: 'center', marginTop: '50%' }}>Loading...</div>;
  }

  if (!user) {
    const savedUrl = localStorage.getItem('autocall_server_url');
    return <LoginPage savedServerUrl={savedUrl} onLoginSuccess={(url) => localStorage.setItem('autocall_server_url', url)} />;
  }

  return <MainApp />;
}

export default function App() {
  return (
    <BrowserRouter>
        <AuthProvider>
            <AppContent />
        </AuthProvider>
    </BrowserRouter>
  );
}
