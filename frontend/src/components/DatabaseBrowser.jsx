import React, { useState, useMemo } from 'react';
import axios from 'axios';
import { AgGridReact } from 'ag-grid-react';
import 'ag-grid-community/styles/ag-grid.css';
import 'ag-grid-community/styles/ag-theme-alpine.css';
import './DatabaseBrowser.css';

function DatabaseBrowser({ databases, apiUrl }) {
  const [selectedDb, setSelectedDb] = useState(null);
  const [selectedTable, setSelectedTable] = useState(null);
  const [tables, setTables] = useState([]);
  const [tableData, setTableData] = useState([]);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleDbSelect = async (dbId) => {
    if (selectedDb === dbId) return;
    
    setSelectedDb(dbId);
    setSelectedTable(null);
    setTables([]);
    setTableData([]);
    setColumns([]);

    try {
      setLoading(true);
      setError(null);
      const response = await axios.get(`${apiUrl}/api/databases/${dbId}/tables`);
      setTables(response.data || []);
    } catch (error) {
      console.error('Failed to load tables:', error);
      setError(error.response?.data?.error || error.message || 'Failed to load tables');
      setTables([]);
    } finally {
      setLoading(false);
    }
  };

  const handleTableSelect = async (table) => {
    setSelectedTable(table);
    setTableData([]);
    setColumns([]);

    try {
      setLoading(true);
      
      // Get schema first
      const schemaRes = await axios.get(
        `${apiUrl}/api/databases/${selectedDb}/tables/${table.name}/schema`,
        { params: { schema: table.schema || null } }
      );
      
      // Get data
      const dataRes = await axios.get(
        `${apiUrl}/api/databases/${selectedDb}/tables/${table.name}/data`,
        { params: { schema: table.schema || null, limit: 1000 } }
      );

      // Create columns from schema with value formatters for complex types
      const cols = schemaRes.data.map(col => ({
        field: col.name,
        headerName: col.name,
        resizable: true,
        sortable: true,
        editable: true,
        flex: 1,
        minWidth: 100,
        valueFormatter: (params) => {
          if (params.value === null || params.value === undefined) {
            return '';
          }
          if (typeof params.value === 'object') {
            return JSON.stringify(params.value);
          }
          return String(params.value);
        },
        valueParser: (params) => {
          if (!params.newValue) return null;
          try {
            return JSON.parse(params.newValue);
          } catch {
            return params.newValue;
          }
        }
      }));

      setColumns(cols);
      setTableData(dataRes.data.rows || []);
    } catch (error) {
      console.error('Failed to load table data:', error);
    } finally {
      setLoading(false);
    }
  };

  const defaultColDef = useMemo(() => ({
    resizable: true,
    sortable: true,
    editable: true,
    flex: 1,
    minWidth: 100
  }), []);

  const onCellValueChanged = (params) => {
    // Handle cell value changes for future auto-save functionality
  };

  return (
    <div className="database-browser">
      <div className="sidebar">
        <div className="sidebar-section">
          <h3>Databases</h3>
          <div className="db-list">
            {databases.length === 0 ? (
              <div className="loading" style={{ padding: '1rem', color: '#888' }}>
                No databases configured
              </div>
            ) : (
              databases.map(db => (
                <div
                  key={db.id}
                  className={`db-item ${selectedDb === db.id ? 'active' : ''} ${db.status === 'error' ? 'error' : ''}`}
                  onClick={() => handleDbSelect(db.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleDbSelect(db.id);
                    }
                  }}
                >
                <span className="db-icon">{getDbIcon(db.type)}</span>
                <div className="db-info">
                  <div className="db-name">{db.name}</div>
                  <div className="db-type">{db.type}</div>
                </div>
                <span className={`db-status ${db.status}`}>
                  {db.status === 'connected' ? '●' : '○'}
                </span>
              </div>
              ))
            )}
          </div>
        </div>

        {selectedDb && (
          <div className="sidebar-section">
            <h3>Tables</h3>
            {loading ? (
              <div className="loading">Loading tables...</div>
            ) : error ? (
              <div className="error-message" style={{ padding: '1rem', color: '#ff6b6b', fontSize: '0.85rem' }}>
                {error}
              </div>
            ) : (
              <div className="table-list">
                {tables.length === 0 ? (
                  <div className="loading" style={{ padding: '1rem', color: '#888', fontSize: '0.85rem' }}>
                    No tables found
                  </div>
                ) : (
                  tables.map((table, idx) => (
                    <div
                      key={idx}
                      className={`table-item ${selectedTable?.name === table.name ? 'active' : ''}`}
                      onClick={() => handleTableSelect(table)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleTableSelect(table);
                        }
                      }}
                    >
                    {table.name}
                    {table.schema && table.schema !== 'public' && table.schema !== 'main' && (
                      <span className="table-schema">.{table.schema}</span>
                    )}
                  </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="main-content">
        {selectedTable ? (
          <div className="table-view">
            <div className="table-header">
              <h2>
                {selectedTable.schema && selectedTable.schema !== 'public' && selectedTable.schema !== 'main' 
                  ? `${selectedTable.schema}.${selectedTable.name}`
                  : selectedTable.name}
              </h2>
              <div className="table-stats">
                {tableData.length} rows
              </div>
            </div>
            
            {loading ? (
              <div className="loading">Loading data...</div>
            ) : (
              <div className="grid-container ag-theme-alpine">
                <AgGridReact
                  rowData={tableData}
                  columnDefs={columns}
                  defaultColDef={defaultColDef}
                  onCellValueChanged={onCellValueChanged}
                  animateRows={true}
                  rowSelection="multiple"
                  suppressRowClickSelection={true}
                  domLayout="normal"
                />
              </div>
            )}
          </div>
        ) : (
          <div className="empty-state">
            <div className="empty-icon">📊</div>
            <h2>Select a database and table to view data</h2>
            <p>Choose a database from the sidebar to get started</p>
          </div>
        )}
      </div>
    </div>
  );
}

function getDbIcon(type) {
  const icons = {
    postgres: '🐘',
    postgresql: '🐘',
    mysql: '🐬',
    mariadb: '🐬',
    mssql: '🔷',
    sqlserver: '🔷'
  };
  return icons[type] || '🗄️';
}

export default DatabaseBrowser;

