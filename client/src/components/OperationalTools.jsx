import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx';

export default function OperationalTools({ socket, isConnected, user }) {
  // Helper: baca dari autocall_settings (CallSettings page) atau fallback ke autocall_state
  const getInitialState = (key, defaultValue) => {
    // Prioritas 1: baca dari autocall_settings (centralized settings page)
    const settingsRaw = localStorage.getItem('autocall_settings');
    if (settingsRaw) {
      try {
        const settings = JSON.parse(settingsRaw);
        if (key === 'blastDuration' && settings.callDuration !== undefined) return settings.callDuration;
        if (key === 'maxConcurrent' && settings.maxConcurrent !== undefined) return settings.maxConcurrent;
      } catch {}
    }
    // Prioritas 2: baca dari autocall_state (session terakhir)
    const saved = localStorage.getItem('autocall_state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed[key] !== undefined ? parsed[key] : defaultValue;
      } catch {}
    }
    return defaultValue;
  };

  // App State
  const [numbers, setNumbers] = useState(() => getInitialState('numbers', ''));
  const [results, setResults] = useState(() => getInitialState('results', []));
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState(() => getInitialState('stats', { active: 0, inactive: 0, error: 0, total: 0 }));
  const [blasting, setBlasting] = useState(false);
  const [blastDuration, setBlastDuration] = useState(() => getInitialState('blastDuration', 3));
  const [blastResults, setBlastResults] = useState(() => getInitialState('blastResults', []));
  const [blastNumbers, setBlastNumbers] = useState(() => getInitialState('blastNumbers', '')); 
  const [maxConcurrent, setMaxConcurrent] = useState(() => getInitialState('maxConcurrent', 10));
  const originalNumbersRef = useRef('');
  const isInitialMount = useRef(true);
  const [activeTab, setActiveTab] = useState('validation'); // 'validation' | 'blast'

  // Fetch latest blast report from server on mount
  useEffect(() => {
    const fetchBlastReport = async () => {
        try {
            const res = await axios.get('/api/blast-call/report');
            if (res.data && Array.isArray(res.data) && res.data.length > 0) {
                setBlastResults(res.data);
                // Also update blasting state if any are still pending/calling/ringing
                const isStillRunning = res.data.some(r => ['PENDING', 'CALLING', 'RINGING'].includes(r.status));
                if (isStillRunning) setBlasting(true);
            }
        } catch (e) {
            console.error('Failed to sync blast report from server', e);
        }
    };
    fetchBlastReport();
  }, []);

  // Save state
  useEffect(() => {
    if (isInitialMount.current) {
        isInitialMount.current = false;
        return;
    }

    const stateToSave = {
        numbers,
        results,
        blastNumbers,
        blastDuration,
        blastResults,
        maxConcurrent
    };
    localStorage.setItem('autocall_state', JSON.stringify(stateToSave));
  }, [numbers, results, stats, blastNumbers, blastDuration, blastResults, maxConcurrent]);

  // Socket Listeners - We need to set them up here or pass them down
  // Since socket is passed as prop, we should set up listeners in a useEffect
  // BUT: The main App might already have listeners? 
  // Better approach: Main App handles socket connection, but SPECIFIC listeners for tools should be here?
  // Actually, in the previous code, listeners updated local state. So we must attach listeners here.
  
  useEffect(() => {
    if (!socket || !isConnected) return;

    // Join User Room for Scoped Updates
    if (user && user.id) {
        console.log('Joining user room:', user.id);
        socket.emit('join-user', user.id);
    }

    const onStatusUpdate = (data) => {
      setResults(prev => {
        const idx = prev.findIndex(item => item.number === data.number);
        if (idx >= 0) {
          const newResults = [...prev];
          newResults[idx] = { ...newResults[idx], status: data.status, details: data.details };
          return newResults;
        }
        return prev;
      });
      
      if (['ACTIVE', 'INACTIVE', 'ERROR'].includes(data.status)) {
           setStats(prev => {
               const s = { ...prev };
               if (data.status === 'ACTIVE') s.active++;
               else if (data.status === 'INACTIVE') s.inactive++;
               else s.error++;
               return s;
           });
      }
    };

    const onBlastUpdate = (data) => {
      setBlastResults(prev => {
        if (data.id) {
            const idx = prev.findIndex(item => item.id === data.id);
            if (idx >= 0) {
                const newResults = [...prev];
                newResults[idx] = { 
                    ...newResults[idx], 
                    status: data.status, 
                    agent: data.agent, 
                    error: data.error,
                    details: data.details 
                };
                return newResults;
            }
        }
        return prev;
      });
    };

    const onBlastComplete = () => {
      setBlasting(false);
      console.log('Blast call completed');
    };

    const onCheckComplete = () => {
      setRunning(false);
      console.log('Validation completed - auto-stopped');
      setResults(currentResults => {
        const activeNumbersSet = new Set(
          currentResults.filter(r => r.status === 'ACTIVE').map(r => r.number)
        );
        const originalLines = originalNumbersRef.current.split('\n').map(l => l.trim()).filter(l => l);
        const activeNumbersWithDuplicates = originalLines.filter(num => activeNumbersSet.has(num));
        if (activeNumbersWithDuplicates.length > 0) {
          setBlastNumbers(activeNumbersWithDuplicates.join('\n'));
        }
        return currentResults;
      });
    };

    socket.on('status-update', onStatusUpdate);
    socket.on('blast-update', onBlastUpdate);
    socket.on('blast-complete', onBlastComplete);
    socket.on('check-complete', onCheckComplete);

    return () => {
      socket.off('status-update', onStatusUpdate);
      socket.off('blast-update', onBlastUpdate);
      socket.off('blast-complete', onBlastComplete);
      socket.off('check-complete', onCheckComplete);
    };
  }, [socket, isConnected, user]);


  const handleStart = async () => {
    const lines = numbers.split('\n').map(l => l.trim()).filter(l => l);
    if (!lines.length) return;
    originalNumbersRef.current = numbers;
    const initialResults = lines.map(n => ({ number: n, status: 'PENDING', details: '' }));
    setResults(initialResults);
    setStats({ active: 0, inactive: 0, error: 0, total: lines.length });
    setRunning(true);
    try {
      await axios.post('/api/check', { numbers: lines });
    } catch (e) {
      alert('Error starting: ' + (e.response?.data?.error || e.message));
      setRunning(false);
    }
  };

  const handleStop = async () => {
    await axios.post('/api/stop');
    setRunning(false);
  };

  const handleStopBlast = async () => {
    try {
      await axios.post('/api/blast-call/stop');
    } catch (e) {
      console.error('Error stopping blast:', e);
    }
    setBlasting(false);
  };

  const handleDirectBlast = async () => {
    const lines = blastNumbers.split('\n').map(l => l.trim()).filter(l => l);
    if (!lines.length) {
      alert('Please enter phone numbers!');
      return;
    }
    const maxCallsPerNumber = 10;
    const callCount = {};
    const limitedNumbers = lines.filter(num => {
      callCount[num] = (callCount[num] || 0) + 1;
      return callCount[num] <= maxCallsPerNumber;
    });

    const totalOriginal = lines.length;
    const totalLimited = limitedNumbers.length;
    const confirmMsg = totalOriginal > totalLimited 
      ? `Call ${totalLimited} numbers (limited from ${totalOriginal}, max ${maxCallsPerNumber} calls per number) for ${blastDuration} seconds each?`
      : `Call ${totalLimited} numbers for ${blastDuration} seconds each?`;

    if (!confirm(confirmMsg)) return;

    setBlasting(true);
    const now = new Date().toISOString();
    const queueItems = limitedNumbers.map(n => ({
        id: Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9), 
        number: n, 
        status: 'PENDING',
        timestamp: now
    }));
    setBlastResults(queueItems);

    try {
      await axios.post('/api/blast-call', { 
        numbers: queueItems, 
        duration: blastDuration,
        maxConcurrent: maxConcurrent
      });
    } catch (e) {
      alert('Error starting blast call: ' + (e.response?.data?.error || e.message));
      setBlasting(false);
    }
  };

  const handleExportExcel = (filter = 'all') => {
    if (!results.length) {
      alert('No results to export!');
      return;
    }
    let filteredResults = results;
    if (filter === 'active') {
      filteredResults = results.filter(r => r.status === 'ACTIVE');
    } else if (filter === 'inactive') {
      filteredResults = results.filter(r => r.status === 'INACTIVE');
    }

    if (!filteredResults.length) {
      alert(`No ${filter} numbers to export!`);
      return;
    }

    const exportData = filteredResults.map(r => ({
      'Phone Number': r.number,
      'Status': r.status,
      'Details': r.details || '-'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Validation Results');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filterSuffix = filter !== 'all' ? `-${filter}` : '';
    const filename = `number-validation${filterSuffix}-${timestamp}.xlsx`;
    XLSX.writeFile(wb, filename);
  };
  
  const getStatusColor = (status) => {
      switch(status) {
          case 'ACTIVE': return 'var(--color-success)';
          case 'INACTIVE': return 'var(--color-error)';
          case 'DIALING': return 'var(--color-warning)';
          case 'PENDING': return 'rgba(255,255,255,0.2)';
          default: return 'var(--color-error)';
      }
  };

  if (!isConnected) {
      return (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#cbd5e1' }}>
              <h2>Connecting to server...</h2>
              <p>Please wait or check your connection.</p>
          </div>
      );
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 1rem' }}>
            <div className="tab-nav" style={{ marginBottom: 0, borderBottom: 'none' }}>
                <button 
                    className={`tab-btn ${activeTab === 'validation' ? 'active' : ''}`}
                    onClick={() => setActiveTab('validation')}
                >
                    📋 Validation
                </button>
                <button 
                    className={`tab-btn ${activeTab === 'blast' ? 'active' : ''}`}
                    onClick={() => setActiveTab('blast')}
                >
                    🔥 Blast Call
                </button>
            </div>
        </div>

        {/* VALIDATION TAB */}
        {activeTab === 'validation' && (
            <div className="tab-content" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ marginBottom: '1rem' }}>
                    <h2 style={{ fontSize: '1.2rem', marginBottom: '4px' }}>Number Validation (Ping)</h2>
                    <p style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                        This feature "pings" numbers to check reachability.
                        <strong> Note:</strong> Recipients see a 1-second missed call.
                    </p>
                </div>

                <div className="glass-panel main-panel" style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <div style={{ flex: 1 }}>
                            <textarea 
                                className="input-area"
                                placeholder="Enter phone numbers (one per line)"
                                value={numbers}
                                onChange={e => setNumbers(e.target.value)}
                                disabled={running}
                                style={{ height: '120px', fontSize: '0.9rem', padding: '10px' }}
                            />
                        </div>
                        <div style={{ width: '180px', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            <div className="stats-grid" style={{ gridTemplateColumns: '1fr', gap: '0.5rem' }}>
                                <div className="stat-card" style={{ padding: '0.75rem' }}>
                                    <h3 style={{ fontSize: '0.75rem' }}>Total</h3>
                                    <div className="value" style={{ fontSize: '1.25rem' }}>{stats.total}</div>
                                </div>
                                <div className="stat-card active" style={{ padding: '0.75rem' }}>
                                    <h3 style={{ fontSize: '0.75rem', color: '#10b981' }}>Reachable</h3>
                                    <div className="value" style={{ fontSize: '1.25rem', color: '#10b981' }}>{stats.active}</div>
                                </div>
                            </div>
                            
                            <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                                <button className="btn-primary" onClick={handleStart} disabled={running} style={{ flex: 1, padding: '0.5rem', fontSize: '0.9rem' }}>
                                    {running ? 'Checking...' : 'Check Status'}
                                </button>
                                {running && (
                                    <button className="btn-danger" onClick={handleStop} style={{ padding: '0.5rem' }}>
                                        Stop
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="glass-panel results-panel" style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div className="results-header" style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 style={{ fontSize: '1rem' }}>Verification Results</h2>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button className="btn-secondary" onClick={() => handleExportExcel('reachable')} disabled={!results.some(r => r.status === 'ACTIVE')} style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
                                ✅ Active
                            </button>
                            <button className="btn-secondary" onClick={() => handleExportExcel('all')} disabled={!results.length} style={{ padding: '4px 8px', fontSize: '0.75rem' }}>
                                📊 All
                            </button>
                        </div>
                    </div>
                    
                    <div className="table-container" style={{ flex: 1, overflowY: 'auto' }}>
                        <table style={{ fontSize: '0.85rem' }}>
                            <thead>
                                <tr>
                                    <th style={{ padding: '8px' }}>Number</th>
                                    <th style={{ padding: '8px' }}>Status</th>
                                    <th style={{ padding: '8px' }}>Details</th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((r, i) => (
                                    <tr key={i}>
                                        <td style={{ padding: '6px 8px' }}>{r.number}</td>
                                        <td style={{ padding: '6px 8px' }}>
                                            <span style={{ 
                                                fontSize: '0.65rem', 
                                                padding: '2px 6px', 
                                                borderRadius: '4px',
                                                background: r.status === 'ACTIVE' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                                color: r.status === 'ACTIVE' ? '#10b981' : '#ef4444',
                                                border: `1px solid ${r.status === 'ACTIVE' ? '#10b981' : '#ef4444'}`
                                            }}>
                                                {r.status === 'ACTIVE' ? 'REACHABLE' : r.status === 'INACTIVE' ? 'UNREACHABLE' : r.status}
                                            </span>
                                        </td>
                                        <td style={{ padding: '6px 8px', color: 'var(--text-muted)' }}>{r.details}</td>
                                    </tr>
                                ))}
                                {results.length === 0 && (
                                    <tr>
                                        <td colSpan="3" style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                            No results yet. Enter numbers and click Check.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}

        {/* BLAST TAB */}
        {activeTab === 'blast' && (
            <div className="tab-content">
                <div className="glass-panel main-panel" style={{ marginBottom: '1rem' }}>
                    <textarea 
                        className="input-area"
                        placeholder="Enter numbers to blast call..."
                        value={blastNumbers}
                        onChange={e => setBlastNumbers(e.target.value)}
                        disabled={blasting}
                        style={{ height: '150px', fontSize: '0.9rem', padding: '10px' }}
                    />
                    
                    <div style={{ display: 'flex', gap: '1rem', alignItems: 'end' }}>
                        <div className="duration-control" style={{ maxWidth: '100px' }}>
                            <label style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Duration (s)</label>
                            <input 
                                type="number" 
                                min="5" 
                                max="60" 
                                value={blastDuration}
                                onChange={e => setBlastDuration(parseInt(e.target.value))}
                                disabled={blasting}
                                style={{ marginTop: '4px', height: '36px' }}
                            />
                        </div>
                        <div className="concurrency-control" style={{ maxWidth: '120px' }}>
                            <label style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Lines: {maxConcurrent}</label>
                            <input 
                                type="range" 
                                min="1" 
                                max="33" 
                                value={maxConcurrent}
                                onChange={e => setMaxConcurrent(parseInt(e.target.value))}
                                disabled={blasting}
                                style={{ marginTop: '10px', display: 'block' }}
                            />
                        </div>
                        <div style={{ flex: 1, display: 'flex', gap: '0.5rem' }}>
                            <button className="btn-blast" onClick={handleDirectBlast} disabled={blasting} style={{ flex: 1 }}>
                                {blasting ? 'Calling...' : 'Start Blast Call'}
                            </button>
                            {blasting && (
                                <button className="btn-danger" onClick={handleStopBlast}>
                                    Stop
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {blastResults.length > 0 && (
                    <div className="glass-panel blast-results-panel" style={{ flex: 1, maxHeight: '300px', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <h3 style={{ fontSize: '0.9rem' }}>Blast Progress</h3>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button className="btn-secondary" onClick={() => {
                                    if (!blastResults.length) return;
                                    const exportData = blastResults.map(r => ({
                                        'Timestamp': r.timestamp || '-',
                                        'Phone Number': r.number,
                                        'Agent': r.agent || '-',
                                        'Status': r.status,
                                        'Error/Details': r.error || r.details || '-'
                                    }));
                                    const ws = XLSX.utils.json_to_sheet(exportData);
                                    const wb = XLSX.utils.book_new();
                                    XLSX.utils.book_append_sheet(wb, ws, 'Blast Results');
                                    XLSX.writeFile(wb, `blast-report-${new Date().getTime()}.xlsx`);
                                }} style={{ padding: '2px 8px', fontSize: '0.7rem' }}>
                                    📥 Export Excel
                                </button>
                                <button className="btn-secondary" onClick={() => { if(confirm('Clear results?')) setBlastResults([]); }} style={{ padding: '2px 8px', fontSize: '0.7rem', color: 'var(--color-error)' }}>
                                    🗑️ Clear
                                </button>
                            </div>
                        </div>

                        {/* Summary Bar */}
                        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
                            {[
                                { label: 'Total', val: blastResults.length, color: '#94a3b8' },
                                { label: 'Done', val: blastResults.filter(r => r.status === 'COMPLETED').length, color: 'var(--color-success)' },
                                { label: 'Failed', val: blastResults.filter(r => r.status === 'FAILED').length, color: 'var(--color-error)' },
                                { label: 'Pending', val: blastResults.filter(r => r.status === 'PENDING' || r.status === 'CALLING' || r.status === 'RINGING').length, color: 'var(--color-warning)' }
                            ].map(s => (
                                <div key={s.label} style={{ flex: 1, background: 'rgba(255,255,255,0.05)', padding: '4px 8px', borderRadius: '4px', textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.65rem', color: '#94a3b8', textTransform: 'uppercase' }}>{s.label}</div>
                                    <div style={{ fontSize: '0.9rem', fontWeight: 'bold', color: s.color }}>{s.val}</div>
                                </div>
                            ))}
                        </div>

                        <div className="blast-list" style={{ flex: 1, overflowY: 'auto' }} ref={el => { if (el) el.scrollTop = el.scrollHeight; }}>
                            {blastResults.map((r, i) => (
                                <div key={i} className="blast-item" style={{ fontSize: '0.8rem', padding: '6px 8px', borderBottom: '1px solid rgba(255,255,255,0.03)', display: 'flex', justifyContent: 'space-between' }}>
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.65rem', color: '#64748b', minWidth: '50px' }}>{r.timestamp?.split('T')[1]?.split('.')[0] || '--:--'}</span>
                                        <span className="number" style={{ fontWeight: '500' }}>{r.number}</span>
                                    </div>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        {r.agent && (
                                            <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                                via {r.agent}
                                            </span>
                                        )}
                                        {r.status === 'FAILED' && r.error ? (
                                             <span className="blast-status failed" style={{ fontSize: '0.75rem', padding: '2px 6px' }}>
                                                 {r.error}
                                             </span>
                                        ) : r.status === 'RETRYING' ? (
                                             <span className="blast-status dialing" style={{ fontSize: '0.75rem', padding: '2px 6px' }}>
                                                 {r.details || 'Retrying...'}
                                             </span>
                                        ) : (
                                            <span className={`blast-status ${r.status.toLowerCase()}`} style={{ fontSize: '0.75rem', padding: '2px 6px' }}>
                                                {r.status === 'ACTIVE' ? 'REACHABLE' : r.status === 'INACTIVE' ? 'UNREACHABLE' : r.status}
                                            </span>
                                        )}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        )}
    </div>
  );
}
