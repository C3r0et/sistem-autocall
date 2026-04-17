import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';

export default function EmployeeControl() {
    const [settings, setSettings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // Form State
    const [formData, setFormData] = useState({
        employee_id: '',
        daily_limit: -1,
        assigned_agent: '',
        is_blocked: false
    });

    const fetchSettings = async () => {
        try {
            const res = await axios.get('/api/dashboard/employee-settings');
            setSettings(res.data);
            setLoading(false);
        } catch (error) {
            console.error("Failed to fetch settings", error);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    const resetForm = () => {
        setFormData({ employee_id: '', daily_limit: -1, assigned_agent: '', is_blocked: false });
    };

    const handleOpenModal = (setting = null) => {
        if (setting) {
            setFormData({ 
                employee_id: setting.employee_id, 
                daily_limit: setting.daily_limit, 
                assigned_agent: setting.assigned_agent || '', 
                is_blocked: setting.is_blocked === 1 
            });
        } else {
            resetForm();
        }
        setIsModalOpen(true);
    };

    const fileInputRef = useRef(null);

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const data = new Uint8Array(evt.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet);

                if (jsonData.length === 0) {
                    alert("Excel file is empty");
                    return;
                }

                // Map Excel columns to our DB schema
                // Handle different possible column names (e.g. "Employee ID" vs "employee_id")
                const bulkSettings = jsonData.map(row => {
                    const findKey = (searchStrings) => {
                        const keys = Object.keys(row);
                        return keys.find(k => searchStrings.some(s => k.toLowerCase().includes(s)));
                    };

                    const empIdKey = findKey(['employee', 'id']);
                    const limitKey = findKey(['limit', 'kuota', 'daily']);
                    const agentKey = findKey(['agent', 'ekstensi', 'ext', 'extension']);
                    const blockedKey = findKey(['block', 'ban', 'status']);

                    let isBlocked = false;
                    if (blockedKey) {
                        const val = String(row[blockedKey]).toLowerCase();
                        isBlocked = val === 'yes' || val === 'true' || val === '1' || val === 'banned' || val === 'blocked' || val === 'blokir';
                    }

                    return {
                        employee_id: row[empIdKey] ? String(row[empIdKey]).trim() : null,
                        daily_limit: row[limitKey] ? parseInt(row[limitKey]) : -1,
                        assigned_agent: row[agentKey] ? String(row[agentKey]).trim() : null,
                        is_blocked: isBlocked
                    };
                }).filter(s => s.employee_id); // Only keep rows with an Employee ID

                if (bulkSettings.length === 0) {
                    alert("No valid Employee IDs found in the file. Make sure your column name contains 'Employee' or 'ID'.");
                    return;
                }

                if (confirm(`Found ${bulkSettings.length} employee rules. Start importing? This will overwrite existing rules with matching IDs.`)) {
                    setLoading(true);
                    await axios.post('/api/dashboard/employee-settings/bulk', { settings: bulkSettings });
                    fetchSettings();
                    alert("Import successful!");
                }
            } catch (error) {
                console.error(error);
                alert("Error parsing Excel file");
                setLoading(false);
            }
        };
        reader.readAsArrayBuffer(file);
        
        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await axios.post('/api/dashboard/employee-settings', formData);
            setIsModalOpen(false);
            fetchSettings();
            resetForm();
        } catch (error) {
            alert('Operation failed: ' + (error.response?.data?.error || error.message));
        }
    };

    const handleDelete = async (id) => {
        if (confirm(`Remove custom rules for Employee ${id}? They will return to default (Unlimited, Any Agent, Allowed).`)) {
            try {
                await axios.delete(`/api/dashboard/employee-settings/${id}`);
                fetchSettings();
            } catch (error) {
                alert('Delete failed: ' + error.message);
            }
        }
    };

    if (loading) return <div style={{ color: 'white', padding: '2rem' }}>Loading Settings...</div>;

    return (
        <div className="tab-content" style={{ width: '100%', boxSizing: 'border-box' }}>
            <div className="results-header" style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: '700', margin: 0, background: 'linear-gradient(to right, #f43f5e, #fb923c)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                        🛡️ Employee Blast Rules
                    </h2>
                    <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.2rem' }}>
                        Set daily limits, direct agent mapping, and blocklists for specific Employee IDs.
                    </p>
                </div>
                
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input 
                        type="file" 
                        accept=".xlsx, .xls, .csv" 
                        style={{ display: 'none' }} 
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                    />
                    <button 
                        className="btn-secondary" 
                        onClick={() => fileInputRef.current?.click()} 
                        style={{ 
                            display: 'flex', alignItems: 'center', gap: '6px', 
                            padding: '0.4rem 0.8rem', 
                            fontSize: '0.8rem',
                            border: '1px solid rgba(244, 63, 94, 0.4)',
                            color: '#f43f5e',
                            background: 'rgba(244, 63, 94, 0.1)',
                            boxShadow: '0 2px 4px -1px rgba(0, 0, 0, 0.1)',
                            borderRadius: '6px'
                        }}
                    >
                        📁 Import Excel
                    </button>
                    <button 
                        className="btn-primary" 
                        onClick={() => handleOpenModal()} 
                        style={{ 
                            display: 'flex', alignItems: 'center', gap: '6px', 
                            padding: '0.4rem 0.8rem', 
                            fontSize: '0.8rem',
                            background: 'linear-gradient(135deg, #f43f5e, #e11d48)',
                            boxShadow: '0 2px 4px -1px rgba(0, 0, 0, 0.1)',
                            lineHeight: 1,
                            borderRadius: '6px'
                        }}
                    >
                        <span style={{ fontSize: '1rem', lineHeight: 1 }}>+</span> Add Rule
                    </button>
                </div>
            </div>

            <div className="glass-panel" style={{ padding: '0', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="table-container">
                    <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0', fontSize: '0.85rem' }}>
                        <thead style={{ background: 'rgba(30, 41, 59, 0.8)' }}>
                            <tr>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: '600', color: '#94a3b8' }}>EMPLOYEE ID</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: '600', color: '#94a3b8' }}>STATUS</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: '600', color: '#94a3b8' }}>DAILY LIMIT</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontWeight: '600', color: '#94a3b8' }}>ASSIGNED AGENT</th>
                                <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: '600', color: '#94a3b8' }}>ACTIONS</th>
                            </tr>
                        </thead>
                        <tbody>
                            {settings.length === 0 ? (
                                <tr>
                                    <td colSpan="5" style={{ textAlign: 'center', padding: '2rem', color: '#64748b' }}>
                                        No specific rules configured. All employees follow global settings.
                                    </td>
                                </tr>
                            ) : settings.map((s, index) => (
                                <tr key={s.employee_id} 
                                    style={{ 
                                        transition: 'background 0.2s', 
                                        background: index % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                                        opacity: s.is_blocked ? 0.6 : 1
                                    }}
                                    onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
                                    onMouseOut={e => e.currentTarget.style.background = index % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent'}
                                >
                                    <td style={{ padding: '0.6rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                        <div style={{ fontWeight: '600', color: s.is_blocked ? '#ef4444' : 'white', fontFamily: 'monospace', letterSpacing: '1px' }}>
                                            {s.employee_id}
                                        </div>
                                    </td>
                                    <td style={{ padding: '0.6rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
                                        {s.is_blocked ? 
                                            <span style={{ color: '#ef4444', fontSize: '0.75rem', fontWeight: 'bold', background: 'rgba(239,68,68,0.2)', padding: '2px 6px', borderRadius: '4px' }}>BANNED</span> 
                                            : 
                                            <span style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: 'bold', background: 'rgba(16,185,129,0.2)', padding: '2px 6px', borderRadius: '4px' }}>ALLOWED</span>
                                        }
                                    </td>
                                    <td style={{ padding: '0.6rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
                                        <span style={{ color: s.daily_limit === -1 ? '#94a3b8' : '#38bdf8', fontWeight: 'bold' }}>
                                            {s.daily_limit === -1 ? 'Unlimited' : s.daily_limit}
                                        </span>
                                    </td>
                                    <td style={{ padding: '0.6rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'center' }}>
                                        {s.assigned_agent ? (
                                            <span style={{ color: '#a78bfa', fontFamily: 'monospace', background: 'rgba(167, 139, 250, 0.15)', padding: '2px 6px', borderRadius: '4px' }}>
                                                Ext {s.assigned_agent}
                                            </span>
                                        ) : (
                                            <span style={{ color: '#64748b', fontSize: '0.8rem' }}>Any Agent</span>
                                        )}
                                    </td>
                                    <td style={{ padding: '0.6rem 1rem', borderBottom: '1px solid rgba(255,255,255,0.05)', textAlign: 'right' }}>
                                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                                            <button 
                                                className="btn-secondary" 
                                                onClick={() => handleOpenModal(s)} 
                                                title="Edit Rule"
                                                style={{ padding: '4px 8px', borderRadius: '6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                            >
                                                ✏️
                                            </button>
                                            <button 
                                                className="btn-danger" 
                                                onClick={() => handleDelete(s.employee_id)} 
                                                title="Delete Rule"
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

            {/* EDIT MODAL */}
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
                            ⚙️ Configure Employee
                        </h3>
                        
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <label>
                                <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px', fontWeight: '500' }}>Employee ID</div>
                                <div style={{ 
                                    display: 'flex', alignItems: 'center', 
                                    background: formData.employee_id ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.3)', 
                                    border: '1px solid rgba(255,255,255,0.1)', borderRadius: '6px', overflow: 'hidden',
                                    transition: 'border-color 0.2s'
                                }}>
                                    <span style={{ 
                                        padding: '0.6rem 0.8rem', color: '#cbd5e1', 
                                        background: 'rgba(255,255,255,0.05)', borderRight: '1px solid rgba(255,255,255,0.1)', 
                                        fontFamily: 'monospace', fontSize: '0.9rem', fontWeight: 'bold' 
                                    }}>
                                        ID-SSS
                                    </span>
                                    <input 
                                        style={{ 
                                            flex: 1, padding: '0.6rem', border: 'none', background: 'transparent',
                                            color: 'white', outline: 'none',
                                            fontSize: '0.9rem', fontFamily: 'monospace'
                                        }}
                                        type="text" required
                                        disabled={settings.some(s => s.employee_id === formData.employee_id) && formData.employee_id !== ''}
                                        placeholder="12345"
                                        value={formData.employee_id ? formData.employee_id.replace('ID-SSS', '') : ''} 
                                        onChange={e => {
                                            const val = e.target.value.replace(/[^0-9]/g, ''); // Allow digits only
                                            setFormData({...formData, employee_id: val ? `ID-SSS${val}` : ''});
                                        }}
                                    />
                                </div>
                                {settings.some(s => s.employee_id === formData.employee_id) && formData.employee_id !== '' && (
                                    <div style={{fontSize: '0.7rem', color: '#fbbf24', marginTop: '4px'}}>Editing existing employee</div>
                                )}
                            </label>

                            <label>
                                <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px', fontWeight: '500' }}>Daily Call Limit (-1 for unlimited)</div>
                                <input 
                                    style={{ 
                                        width: '100%', padding: '0.6rem', borderRadius: '6px', 
                                        background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                                        color: 'white', outline: 'none', transition: 'border-color 0.2s',
                                        fontSize: '0.9rem'
                                    }}
                                    type="number" min="-1" required
                                    value={formData.daily_limit} onChange={e => setFormData({...formData, daily_limit: parseInt(e.target.value)})}
                                />
                            </label>

                            <label>
                                <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '6px', fontWeight: '500' }}>Force Specific Agent / Extension</div>
                                <input 
                                    style={{ 
                                        width: '100%', padding: '0.6rem', borderRadius: '6px', 
                                        background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)',
                                        color: 'white', outline: 'none', transition: 'border-color 0.2s',
                                        fontSize: '0.9rem'
                                    }}
                                    type="text"
                                    placeholder="e.g. 1011 (Leave empty for Any)"
                                    value={formData.assigned_agent} onChange={e => setFormData({...formData, assigned_agent: e.target.value})}
                                />
                            </label>

                            <label style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', padding: '10px', borderRadius: '6px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                                <input 
                                    type="checkbox" 
                                    checked={formData.is_blocked}
                                    onChange={e => setFormData({...formData, is_blocked: e.target.checked})}
                                    style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: '#ef4444' }}
                                />
                                <div>
                                    <div style={{ color: '#ef4444', fontWeight: 'bold', fontSize: '0.9rem' }}>Block Blast Access</div>
                                    <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>If checked, this employee cannot make blast calls.</div>
                                </div>
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
                                        background: 'linear-gradient(135deg, #f43f5e, #e11d48)', color: 'white', cursor: 'pointer', fontWeight: '600',
                                        boxShadow: '0 4px 6px -1px rgba(225, 29, 72, 0.5)',
                                        fontSize: '0.9rem'
                                    }}
                                >
                                    Save Rule
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
