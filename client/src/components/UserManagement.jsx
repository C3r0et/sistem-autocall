import { useState, useEffect } from 'react';
import axios from 'axios';

export default function UserManagement() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'email', direction: 'asc' });
    
    // Form State
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        role: 'user'
    });

    const fetchUsers = async () => {
        try {
            const res = await axios.get('/api/users');
            setUsers(res.data.users);
            setLoading(false);
        } catch (error) {
            console.error("Failed to fetch users", error);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    const resetForm = () => {
        setFormData({ email: '', password: '', role: 'user' });
        setEditingUser(null);
    };

    const handleOpenModal = (user = null) => {
        if (user) {
            setEditingUser(user);
            setFormData({ 
                email: user.email, 
                role: user.role || 'user', 
                password: '' 
            });
        } else {
            resetForm();
        }
        setIsModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (editingUser) {
                const payload = { ...formData };
                if (!payload.password) delete payload.password;
                await axios.put(`/api/users/${editingUser.id}`, payload);
            } else {
                await axios.post('/api/users', formData);
            }
            setIsModalOpen(false);
            fetchUsers();
            resetForm();
        } catch (error) {
            alert('Operation failed: ' + (error.response?.data?.error || error.message));
        }
    };

    const handleDelete = async (id) => {
        if (confirm('Are you sure you want to delete this user?')) {
            try {
                await axios.delete(`/api/users/${id}`);
                fetchUsers();
            } catch (error) {
                alert('Delete failed: ' + error.message);
            }
        }
    };

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedUsers = [...users].sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
            return sortConfig.direction === 'asc' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
            return sortConfig.direction === 'asc' ? 1 : -1;
        }
        return 0;
    });

    const SortIndicator = ({ column }) => {
        if (sortConfig.key !== column) return <span style={{ opacity: 0.3, marginLeft: '5px' }}>↕</span>;
        return <span style={{ marginLeft: '5px', color: '#f472b6' }}>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    // Token Modal State
    const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
    const [tokenUser, setTokenUser] = useState(null);
    const [generatedToken, setGeneratedToken] = useState('');

    const handleOpenTokenModal = async (user) => {
        setTokenUser(user);
        setGeneratedToken(''); // Reset
        setIsTokenModalOpen(true);
        
        try {
            // Try to get existing token first
            try {
                const res = await axios.get(`/api/users/${user.id}/token`);
                if (res.data.token) {
                     setGeneratedToken(res.data.token);
                     return;
                }
            } catch (e) {
                // If 404 (no token yet), we just ignore and user can generate
            }

            // If no token exists, do we auto-generate? Maybe not. Let user click.
        } catch (error) {
            alert('Error checking token: ' + error.message);
        }
    };

    const handleGenerateToken = async () => {
        if (!tokenUser) return;
        if (confirm("Generate a NEW token? This will replace the old one (if any).")) {
             try {
                const res = await axios.post(`/api/users/${tokenUser.id}/generate-token`);
                setGeneratedToken(res.data.token);
            } catch (error) {
                alert('Failed to generate token: ' + error.message);
            }
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(generatedToken);
        alert('Token copied to clipboard!');
    };

    if (loading) return <div style={{ color: 'white', padding: '2rem' }}>Loading Users...</div>;

    return (
        <div className="tab-content" style={{ width: '100%', boxSizing: 'border-box' }}>
            <div className="results-header" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: '700', margin: 0, background: 'linear-gradient(to right, #f472b6, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        👥 User Management
                    </h2>
                </div>
                
                <button 
                    className="btn-primary" 
                    onClick={() => handleOpenModal()} 
                    style={{ 
                        display: 'flex', alignItems: 'center', gap: '8px', 
                        padding: '0.5rem 1rem', fontSize: '0.85rem',
                        background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
                        border: '1px solid rgba(59, 130, 246, 0.4)',
                        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.25)',
                        borderRadius: '8px',
                        transition: 'all 0.2s',
                        fontWeight: '600',
                        cursor: 'pointer',
                        width: 'max-content'
                    }}
                    onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                    onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                >
                    <span style={{ fontSize: '1.2rem', lineHeight: 1, fontWeight: 'bold' }}>+</span> Add User
                </button>
            </div>

            <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="table-container">
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0', fontSize: '0.85rem' }}>
                        <thead style={{ background: 'rgba(30, 41, 59, 0.8)' }}>
                            <tr>
                                <th 
                                    onClick={() => handleSort('email')}
                                    style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', color: '#94a3b8', cursor: 'pointer', userSelect: 'none' }}
                                >
                                    USER DETAILS <SortIndicator column="email" />
                                </th>
                                <th 
                                    onClick={() => handleSort('role')}
                                    style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', color: '#94a3b8', cursor: 'pointer', userSelect: 'none' }}
                                >
                                    ROLE <SortIndicator column="role" />
                                </th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '600', color: '#94a3b8' }}>ACTIONS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedUsers.map((user, index) => (
                                <tr key={user.id} 
                                    style={{ 
                                        transition: 'background 0.2s', 
                                        background: index % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' 
                                    }}
                                    onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                    onMouseOut={e => e.currentTarget.style.background = index % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent'}
                                >
                                    <td style={{ padding: '0.6rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{ fontWeight: '500', color: 'white' }}>{user.email}</div>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>ID: #{user.id}</div>
                                    </td>
                                    <td style={{ padding: '0.6rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <span style={{ 
                                            background: user.role === 'admin' ? 'rgba(129, 140, 248, 0.2)' : 'rgba(148, 163, 184, 0.2)',
                                            color: user.role === 'admin' ? '#818cf8' : '#cbd5e1',
                                            padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: '700', letterSpacing: '0.5px',
                                            border: user.role === 'admin' ? '1px solid rgba(129, 140, 248, 0.3)' : '1px solid rgba(148, 163, 184, 0.3)'
                                        }}>
                                            {user.role.toUpperCase()}
                                        </span>
                                    </td>

                                    <td style={{ padding: '0.6rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                            <button 
                                                className="btn-secondary" 
                                                onClick={() => handleOpenTokenModal(user)} 
                                                title="Generate API Key"
                                                style={{ padding: '4px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(234, 179, 8, 0.1)', color: '#facc15', border: '1px solid rgba(234, 179, 8, 0.2)' }}
                                            >
                                                🔑
                                            </button>
                                            <button 
                                                className="btn-secondary" 
                                                onClick={() => handleOpenModal(user)} 
                                                title="Edit User"
                                                style={{ padding: '4px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                            >
                                                ✏️
                                            </button>
                                            <button 
                                                className="btn-danger" 
                                                onClick={() => handleDelete(user.id)} 
                                                title="Delete User"
                                                style={{ padding: '4px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                            >
                                                🗑️
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* EDIT USER MODAL */}
            {isModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(8px)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
                    animation: 'fadeIn 0.2s ease-out'
                }}>
                    <div className="glass-panel" 
                         style={{ 
                             width: '400px', 
                             background: '#1e293b', 
                             border: '1px solid rgba(255,255,255,0.1)',
                             boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                             padding: '1.5rem',
                             borderRadius: '12px'
                         }}
                    >
                        <h3 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.75rem' }}>
                            {editingUser ? '✏️ Edit User' : '✨ Create New User'}
                        </h3>
                        
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <label>
                                <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px', fontWeight: '500' }}>Email Address</div>
                                <input 
                                    style={{ 
                                        width: '100%', padding: '0.6rem', borderRadius: '6px', 
                                        background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                                        color: 'white', outline: 'none', transition: 'border-color 0.2s',
                                        fontSize: '0.9rem'
                                    }}
                                    onFocus={e => e.target.style.borderColor = '#3b82f6'}
                                    onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                                    type="email" required
                                    placeholder="user@example.com"
                                    value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})}
                                />
                            </label>

                            <label>
                                <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px', fontWeight: '500' }}>
                                    Password {editingUser && <span style={{fontWeight: 'normal', fontStyle: 'italic', fontSize: '0.75rem'}}>(Leave blank to keep current)</span>}
                                </div>
                                <input 
                                    style={{ 
                                        width: '100%', padding: '0.6rem', borderRadius: '6px', 
                                        background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                                        color: 'white', outline: 'none', transition: 'border-color 0.2s',
                                        fontSize: '0.9rem'
                                    }}
                                    onFocus={e => e.target.style.borderColor = '#3b82f6'}
                                    onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                                    type="password" 
                                    required={!editingUser}
                                    placeholder="••••••••"
                                    value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})}
                                />
                            </label>

                            <label>
                                <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px', fontWeight: '500' }}>Role</div>
                                <select 
                                    style={{ 
                                        width: '100%', padding: '0.6rem', borderRadius: '6px', 
                                        background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                                        color: 'white', outline: 'none', cursor: 'pointer',
                                        fontSize: '0.9rem'
                                    }}
                                    value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})}
                                >
                                    <option value="user">User</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </label>

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
                                <button 
                                    type="button" 
                                    onClick={() => setIsModalOpen(false)}
                                    style={{ 
                                        flex: 1, padding: '0.6rem', borderRadius: '6px', border: 'none',
                                        background: 'rgba(255,255,255,0.05)', color: '#cbd5e1', cursor: 'pointer', fontWeight: '600',
                                        fontSize: '0.9rem'
                                    }}
                                >
                                    Cancel
                                </button>
                                <button 
                                    type="submit" 
                                    style={{ 
                                        flex: 2, padding: '0.6rem', borderRadius: '6px', border: 'none',
                                        background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: 'white', cursor: 'pointer', fontWeight: '600',
                                        boxShadow: '0 4px 6px -1px rgba(59, 130, 246, 0.5)',
                                        fontSize: '0.9rem'
                                    }}
                                >
                                    {editingUser ? 'Save Changes' : 'Create User'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* TOKEN MODAL */}
            {isTokenModalOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(15, 23, 42, 0.8)', backdropFilter: 'blur(8px)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000,
                    animation: 'fadeIn 0.2s ease-out'
                }}>
                    <div className="glass-panel" 
                         style={{ 
                             width: '500px', 
                             background: '#1e293b', 
                             border: '1px solid rgba(234, 179, 8, 0.2)',
                             boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                             padding: '1.5rem',
                             borderRadius: '12px'
                         }}
                    >
                        <h3 style={{ fontSize: '1.25rem', marginBottom: '1rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.75rem', color: '#facc15' }}>
                            🔑 API Key Access
                        </h3>
                        
                        <p style={{ color: '#cbd5e1', marginBottom: '1rem', fontSize: '0.9rem' }}>
                            View or manage the API Token for <strong>{tokenUser?.email}</strong>.<br/>
                            {generatedToken ? "Here is the current active token:" : "No active token found."}
                        </p>

                        <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
                            <textarea 
                                readOnly
                                value={generatedToken}
                                style={{ 
                                    width: '100%', height: '100px', padding: '0.8rem', borderRadius: '6px', 
                                    background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.1)',
                                    color: '#86efac', fontFamily: 'monospace', fontSize: '0.85rem', resize: 'none'
                                }}
                            />
                            <button 
                                onClick={copyToClipboard}
                                style={{
                                    position: 'absolute', bottom: '10px', right: '10px',
                                    background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)',
                                    color: 'white', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem'
                                }}
                            >
                                Copy
                            </button>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                             <button
                                onClick={handleGenerateToken}
                                style={{
                                    padding: '0.6rem 1rem', borderRadius: '6px', border: '1px solid #facc15',
                                    background: 'rgba(234, 179, 8, 0.1)', color: '#facc15', cursor: 'pointer', fontWeight: '600'
                                }}
                             >
                                {generatedToken ? "🔄 Regenerate Token" : "✨ Generate Token"}
                             </button>

                            <button 
                                onClick={() => setIsTokenModalOpen(false)}
                                style={{ 
                                    padding: '0.6rem 1.5rem', borderRadius: '6px', border: 'none',
                                    background: 'rgba(255,255,255,0.1)', color: 'white', cursor: 'pointer', fontWeight: '600'
                                }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
