import express from 'express';
import { dbManager } from '../dbManager.js';

const router = express.Router();

// Reload database connections from .env file
router.post('/reload', async (req, res) => {
  try {
    await dbManager.reloadConnections();
    const databases = dbManager.getAllConnections();
    res.json({ 
      success: true, 
      message: 'Databases reloaded successfully',
      databases 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get list of all configured databases
router.get('/', (req, res) => {
  try {
    const databases = dbManager.getAllConnections();
    res.json(databases);
  } catch (error) {
    console.error('Error getting databases:', error);
    res.status(500).json({ 
      error: process.env.NODE_ENV === 'production' 
        ? 'Failed to retrieve databases' 
        : error.message 
    });
  }
});

// Get list of tables for a specific database
router.get('/:dbId/tables', async (req, res) => {
  try {
    const { dbId } = req.params;
    const result = await dbManager.getTables(dbId);
    res.json(result.rows || []);
  } catch (error) {
    console.error(`Error getting tables for ${req.params.dbId}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Get column schema for a specific table
router.get('/:dbId/tables/:tableName/schema', async (req, res) => {
  try {
    const { dbId, tableName } = req.params;
    const schema = req.query.schema || null;
    const result = await dbManager.getTableSchema(dbId, tableName, schema);
    res.json(result.rows || []);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get table data with pagination support
router.get('/:dbId/tables/:tableName/data', async (req, res) => {
  try {
    const { dbId, tableName } = req.params;
    const schema = req.query.schema || null;
    const limit = parseInt(req.query.limit || '1000');
    const offset = parseInt(req.query.offset || '0');
    
    const db = await dbManager.getConnection(dbId);
    const { type } = db;
    
    let tableRef = tableName;
    if (schema && (type === 'postgres' || type === 'postgresql' || type === 'mssql' || type === 'sqlserver')) {
      tableRef = `${schema}.${tableName}`;
    }
    
    const query = `SELECT * FROM ${tableRef} LIMIT ? OFFSET ?`;
    const params = [limit, offset];
    
    // Generate database-specific SQL query with pagination
    let finalQuery = query;
    if (type === 'mssql' || type === 'sqlserver') {
      finalQuery = `SELECT TOP ${limit} * FROM ${tableRef} OFFSET ${offset} ROWS`;
    } else if (type === 'mysql' || type === 'mariadb') {
      finalQuery = `SELECT * FROM ${tableRef} LIMIT ? OFFSET ?`;
    } else if (type === 'postgres' || type === 'postgresql') {
      finalQuery = `SELECT * FROM ${tableRef} LIMIT $1 OFFSET $2`;
    }
    
    const result = await dbManager.query(dbId, finalQuery, params);
    res.json({
      rows: result.rows || [],
      count: result.rowCount || result.rows?.length || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update existing row in table
router.put('/:dbId/tables/:tableName/row', async (req, res) => {
  try {
    const { dbId, tableName } = req.params;
    const { primaryKey, primaryValue, data } = req.body;
    
    if (!primaryKey || primaryValue === undefined) {
      return res.status(400).json({ error: 'Primary key and value required' });
    }
    
    const db = await dbManager.getConnection(dbId);
    const schema = await dbManager.getTableSchema(dbId, tableName);
    const columns = schema.rows || [];
    
    const setClause = Object.keys(data)
      .filter(key => columns.find(col => col.name === key))
      .map((key, idx) => {
        const param = db.type === 'postgres' || db.type === 'postgresql' 
          ? `$${idx + 1}` 
          : '?';
        return `${key} = ${param}`;
      })
      .join(', ');
    
    const values = Object.values(data);
    const whereClause = db.type === 'postgres' || db.type === 'postgresql'
      ? `${primaryKey} = $${values.length + 1}`
      : `${primaryKey} = ?`;
    
    const query = `UPDATE ${tableName} SET ${setClause} WHERE ${whereClause}`;
    const params = [...values, primaryValue];
    
    await dbManager.query(dbId, query, params);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Insert new row into table
router.post('/:dbId/tables/:tableName/row', async (req, res) => {
  try {
    const { dbId, tableName } = req.params;
    const { data } = req.body;
    
    const db = await dbManager.getConnection(dbId);
    const columns = Object.keys(data);
    const values = Object.values(data);
    
    const placeholders = db.type === 'postgres' || db.type === 'postgresql'
      ? values.map((_, i) => `$${i + 1}`).join(', ')
      : values.map(() => '?').join(', ');
    
    const query = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`;
    
    await dbManager.query(dbId, query, values);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete row from table
router.delete('/:dbId/tables/:tableName/row', async (req, res) => {
  try {
    const { dbId, tableName } = req.params;
    const { primaryKey, primaryValue } = req.body;
    
    if (!primaryKey || primaryValue === undefined) {
      return res.status(400).json({ error: 'Primary key and value required' });
    }
    
    const db = await dbManager.getConnection(dbId);
    const placeholder = db.type === 'postgres' || db.type === 'postgresql' ? '$1' : '?';
    const query = `DELETE FROM ${tableName} WHERE ${primaryKey} = ${placeholder}`;
    
    await dbManager.query(dbId, query, [primaryValue]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export { router as databaseRoutes };

