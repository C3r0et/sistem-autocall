import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function AdminLayout({ children }) {
    const { logout, user } = useAuth();
    const location = useLocation();
    const [collapsed, setCollapsed] = useState(false);

    const isActive = (path) => location.pathname === path;

    const sidebarWidth = collapsed ? '70px' : '240px';

    return (
        <div style={{ display: 'flex', height: '100vh', width: '100vw', background: 'var(--bg-dark)' }}>
            
            {/* SIDEBAR */}
            <aside style={{ 
                width: sidebarWidth, 
                minWidth: sidebarWidth,
                background: 'rgba(30, 41, 59, 0.5)', 
                borderRight: '1px solid var(--glass-border)',
                display: 'flex',
                flexDirection: 'column',
                padding: '1.5rem 0.5rem',
                transition: 'all 0.3s ease',
                overflow: 'hidden'
            }}>
                <div style={{ marginBottom: '2rem', paddingLeft: collapsed ? '0' : '0.5rem', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between' }}>
                    {!collapsed && (
                        <div>
                            <h1 style={{ fontSize: '1.5rem', background: 'linear-gradient(to right, #38bdf8, #818cf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0, whiteSpace: 'nowrap' }}>
                                AutoCall
                            </h1>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                                ver 2.0
                            </p>
                        </div>
                    )}
                    <button 
                        onClick={() => setCollapsed(!collapsed)}
                        style={{ 
                            background: 'transparent', 
                            border: 'none', 
                            color: 'var(--text-muted)', 
                            cursor: 'pointer',
                            padding: '4px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        {collapsed ? '☰' : '◀'}
                    </button>
                </div>

                <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {[
                        { path: '/dashboard', icon: '📊', label: 'Dashboard' },
                        { path: '/whatsapp', icon: '📱', label: 'WhatsApp' },
                        { path: '/tools', icon: '🛠️', label: 'Tools' },
                        { path: '/logs', icon: '📋', label: 'Call Logs' },
                        { path: '/users', icon: '👥', label: 'Users' },
                        { path: '/employee-control', icon: '🛡️', label: 'Employee Rules' },
                        { path: '/extensions', icon: '📞', label: 'Extensions' },
                        { path: '/settings', icon: '⚙️', label: 'Settings' }
                    ].map((item) => (
                        <Link key={item.path} to={item.path} style={{ textDecoration: 'none' }} title={collapsed ? item.label : ''}>
                            <div className={`nav-item ${isActive(item.path) ? 'active' : ''}`} 
                                 style={{ 
                                     padding: '0.75rem 0', 
                                     borderRadius: '8px', 
                                     color: isActive(item.path) ? 'white' : 'var(--text-muted)',
                                     background: isActive(item.path) ? 'var(--primary)' : 'transparent',
                                     cursor: 'pointer',
                                     display: 'flex', 
                                     alignItems: 'center', 
                                     justifyContent: collapsed ? 'center' : 'flex-start',
                                     gap: '10px',
                                     transition: 'all 0.2s',
                                     paddingLeft: collapsed ? 0 : '1rem'
                                 }}>
                                <span style={{ fontSize: '1.2rem' }}>{item.icon}</span> 
                                {!collapsed && <span>{item.label}</span>}
                            </div>
                        </Link>
                    ))}
                </nav>

                <div style={{ marginTop: 'auto', borderTop: '1px solid var(--glass-border)', paddingTop: '1rem' }}>
                    {!collapsed ? (
                        <div style={{ padding: '0.5rem', marginBottom: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email || 'Admin'}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--color-success)' }}>● Online</div>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
                            <div style={{ width: '10px', height: '10px', background: 'var(--color-success)', borderRadius: '50%', margin: '0 auto' }} title="Online"></div>
                        </div>
                    )}
                    
                    <button onClick={logout} style={{ 
                        width: '100%', 
                        background: 'rgba(239,68,68,0.1)', 
                        color: 'var(--color-error)', 
                        border: '1px solid rgba(239,68,68,0.2)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center'
                    }} title={collapsed ? 'Logout' : ''}>
                        {collapsed ? '🚪' : 'Logout'}
                    </button>
                </div>
            </aside>

            {/* MAIN CONTENT AREA */}
            <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* HEADER */}
                <header style={{ 
                    height: '60px', 
                    borderBottom: '1px solid var(--glass-border)', 
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '0 2rem',
                    background: 'rgba(15, 23, 42, 0.8)',
                    backdropFilter: 'blur(10px)'
                }}>
                    <div style={{ color: 'var(--text-muted)' }}>
                        {location.pathname === '/dashboard' && 'Overview & Statistics'}
                        {location.pathname === '/whatsapp' && 'WhatsApp Verification & Sender'}
                        {location.pathname === '/tools' && 'Broadcast & Validation Tools'}
                        {location.pathname === '/logs' && 'System Call History'}
                        {location.pathname === '/users' && 'User Access Management'}
                        {location.pathname === '/employee-control' && 'Employee Blast Restrictions'}
                        {location.pathname === '/extensions' && 'SIP Extension Conf'}
                        {location.pathname === '/settings' && '⚙️ Parameter Blast Call'}
                    </div>
                    <div>
                         {/* Date/Time or Notifications could go here */}
                         <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>{new Date().toLocaleDateString()}</span>
                    </div>
                </header>

                {/* SCROLLABLE CONTENT */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
                    {children}
                </div>

                {/* FOOTER */}
                <footer style={{ 
                    padding: '1rem 2rem', 
                    borderTop: '1px solid var(--glass-border)', 
                    fontSize: '0.8rem', 
                    color: 'var(--text-muted)',
                    textAlign: 'center'
                }}>
                    &copy; 2026 AutoCall Pro System. All rights reserved.
                </footer>
            </main>
        </div>
    );
}
