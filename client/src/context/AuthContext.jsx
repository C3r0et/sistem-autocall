import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';

const AuthContext = createContext();

// Alamat SSO pusat (Container)
const SSO_BASE_URL = 'https://sso-auth.sahabatsakinah.id';
// Alamat Backend Autocall (Port 3001)
const AUTOCALL_BASE_URL = 'http://localhost:3001';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('auth_user');
    const savedToken = localStorage.getItem('auth_token');

    if (savedUser) {
      try { setUser(JSON.parse(savedUser)); } catch {}
    }

    // Set default axios base URL ke Autocall Backend
    axios.defaults.baseURL = AUTOCALL_BASE_URL;

    if (savedToken) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${savedToken}`;
    }

    setLoading(false);
  }, []);

  /**
   * Login Langsung ke SSO Pusat (Port 4000)
   * @param {string} identifier - employee_id
   * @param {string} password
   */
  const login = async (identifier, password) => {
    setLoading(true);
    setError(null);
    try {
      // Langsung nembak ke port 4000 (SSO Service)
      const res = await axios.post(`${SSO_BASE_URL}/api/auth/login`, {
        employee_id: identifier,
        password: password
      });

      const { token, user } = res.data;

      // Proteksi Akses: Hanya Tim IT yang boleh masuk Autocall
      const allowedRoles = ['SPV_IT', 'STAFF_IT', 'STAFF_IT_HELPER'];
      if (!allowedRoles.includes(user.role)) {
         throw new Error(`Akses Ditolak. Jabatan Anda (${user.role}) bukan Tim IT.`);
      }

      // Simpan credentials
      localStorage.setItem('auth_token', token);
      localStorage.setItem('auth_user', JSON.stringify(user));

      // Update axios header untuk request ke 3001 (Autocall) nanti
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      setUser(user);
      return true;
    } catch (e) {
      const msg = e.response?.data?.message || e.response?.data?.error || e.message || 'Login gagal';
      setError(msg);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, error }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
