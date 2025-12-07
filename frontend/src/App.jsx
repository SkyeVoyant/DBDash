import React, { useState, useEffect } from 'react';
import axios from 'axios';
import DatabaseBrowser from './components/DatabaseBrowser';
import Login from './components/Login';
import './App.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8889';

// Set up axios interceptor to include token in requests
axios.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('dbdash_token');
    if (token && !config.headers.Authorization) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Handle 401 responses (unauthorized)
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    // Skip auto-reload for authentication endpoints
    const isAuthEndpoint = error.config?.url?.includes('/api/auth/');
    
    if ((error.response?.status === 401 || error.response?.status === 403) && !isAuthEndpoint) {
      localStorage.removeItem('dbdash_token');
      delete axios.defaults.headers.common['Authorization'];
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [databases, setDatabases] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    
    // Set a fallback timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      if (isMounted) {
        console.warn('Auth check timeout - showing login');
        setCheckingAuth(false);
      }
    }, 5000);

    checkAuthentication().finally(() => {
      if (isMounted) {
        clearTimeout(timeoutId);
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, []);

  const checkAuthentication = async () => {
    try {
      const token = localStorage.getItem('dbdash_token');
      
      if (!token) {
        setCheckingAuth(false);
        return;
      }

      const response = await axios.get(`${API_URL}/api/auth/verify`, {
        headers: {
          'Authorization': `Bearer ${token}`
        },
        timeout: 3000
      });
      
      if (response && response.data && response.data.authenticated === true) {
        setAuthenticated(true);
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        setCheckingAuth(false);
        loadDatabases();
      } else {
        localStorage.removeItem('dbdash_token');
        delete axios.defaults.headers.common['Authorization'];
        setCheckingAuth(false);
      }
    } catch (err) {
      // Any error - clear token and show login
      console.error('Auth verification failed:', err.message);
      localStorage.removeItem('dbdash_token');
      delete axios.defaults.headers.common['Authorization'];
      setCheckingAuth(false);
    }
  };

  const handleLogin = (token) => {
    setAuthenticated(true);
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    loadDatabases();
  };

  const handleLogout = () => {
    localStorage.removeItem('dbdash_token');
    delete axios.defaults.headers.common['Authorization'];
    setAuthenticated(false);
    setDatabases([]);
  };

  const loadDatabases = async (reload = false) => {
    try {
      setLoading(true);
      
      // If reload is requested, call the reload endpoint first
      if (reload) {
        try {
          await axios.post(`${API_URL}/api/databases/reload`);
        } catch (reloadErr) {
          console.warn('Reload failed, continuing with current connections:', reloadErr);
        }
      }
      
      const response = await axios.get(`${API_URL}/api/databases`);
      setDatabases(response.data);
      setError(null);
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) {
        setAuthenticated(false);
        localStorage.removeItem('dbdash_token');
      } else {
        setError(err.message);
        console.error('Failed to load databases:', err);
      }
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="app-loading">
        <div className="loading-spinner"></div>
        <p>Checking authentication...</p>
      </div>
    );
  }

  if (!authenticated) {
    return <Login onLogin={handleLogin} />;
  }

  if (loading && databases.length === 0) {
    return (
      <div className="app-loading">
        <div className="loading-spinner"></div>
        <p>Loading databases...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-error">
        <h2>Connection Error</h2>
        <p>{error}</p>
        <button onClick={loadDatabases}>Retry</button>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div>
            <h1><span className="header-icon">🗄️</span> DBDash</h1>
            <p className="app-subtitle">Universal SQL Database Browser</p>
          </div>
          <div className="header-actions">
            <button 
              className="reload-button"
              onClick={() => loadDatabases(true)}
              title="Reload databases from .env"
              disabled={loading}
            >
              🔄 Reload
            </button>
            <button 
              className="logout-button"
              onClick={handleLogout}
              title="Logout"
            >
              🚪 Logout
            </button>
          </div>
        </div>
      </header>
      <DatabaseBrowser databases={databases} apiUrl={API_URL} />
    </div>
  );
}

export default App;

