import express from 'express';
import { dbManager } from '../dbManager.js';

const router = express.Router();
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_$]*$/;
const MAX_QUERY_LIMIT = 5000;

function isPostgres(type) {
  return type === 'postgres' || type === 'postgresql';
}

function isMySql(type) {
  return type === 'mysql' || type === 'mariadb';
}

function isSqlServer(type) {
  return type === 'mssql' || type === 'sqlserver';
}

function sanitizeIdentifier(value, label) {
  const normalized = String(value ?? '').trim();
  if (!IDENTIFIER_PATTERN.test(normalized)) {
    throw new Error(`Invalid ${label}`);
  }
  return normalized;
}

function quoteIdentifier(type, identifier) {
  const safe = sanitizeIdentifier(identifier, 'identifier');
  if (isMySql(type)) return `\`${safe}\``;
  if (isSqlServer(type)) return `[${safe}]`;
  return `"${safe}"`;
}

function buildTableReference(type, tableName, schema) {
  const safeTableName = sanitizeIdentifier(tableName, 'table name');
  if (schema && (isPostgres(type) || isSqlServer(type))) {
    const safeSchema = sanitizeIdentifier(schema, 'schema');
    return `${quoteIdentifier(type, safeSchema)}.${quoteIdentifier(type, safeTableName)}`;
  }
  return quoteIdentifier(type, safeTableName);
}

function getParamPlaceholder(type, index) {
  if (isPostgres(type)) return `$${index}`;
  if (isSqlServer(type)) return `@p${index}`;
  return '?';
}

function parseLimit(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1000;
  return Math.min(parsed, MAX_QUERY_LIMIT);
}

function parseOffset(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function sanitizeSchemaValue(schema) {
  if (!schema) return null;
  return sanitizeIdentifier(schema, 'schema');
}

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
    const safeTableName = sanitizeIdentifier(tableName, 'table name');
    const schema = sanitizeSchemaValue(req.query.schema);
    const result = await dbManager.getTableSchema(dbId, safeTableName, schema);
    res.json(result.rows || []);
  } catch (error) {
    if (error.message.startsWith('Invalid ')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// Get table data with pagination support
router.get('/:dbId/tables/:tableName/data', async (req, res) => {
  try {
    const { dbId, tableName } = req.params;
    const schema = sanitizeSchemaValue(req.query.schema);
    const limit = parseLimit(req.query.limit);
    const offset = parseOffset(req.query.offset);

    const db = await dbManager.getConnection(dbId);
    const { type } = db;

    const tableRef = buildTableReference(type, tableName, schema);
    let finalQuery;
    let params;

    if (isSqlServer(type)) {
      finalQuery = `SELECT * FROM ${tableRef} ORDER BY (SELECT 1) OFFSET ${getParamPlaceholder(type, 1)} ROWS FETCH NEXT ${getParamPlaceholder(type, 2)} ROWS ONLY`;
      params = [offset, limit];
    } else {
      finalQuery = `SELECT * FROM ${tableRef} LIMIT ${getParamPlaceholder(type, 1)} OFFSET ${getParamPlaceholder(type, 2)}`;
      params = [limit, offset];
    }

    const result = await dbManager.query(dbId, finalQuery, params);
    res.json({
      rows: result.rows || [],
      count: result.rowCount || result.rows?.length || 0
    });
  } catch (error) {
    if (error.message.startsWith('Invalid ')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// Update existing row in table
router.put('/:dbId/tables/:tableName/row', async (req, res) => {
  try {
    const { dbId, tableName } = req.params;
    const { primaryKey, primaryValue, data } = req.body;
    const schema = sanitizeSchemaValue(req.query.schema);

    if (!primaryKey || primaryValue === undefined) {
      return res.status(400).json({ error: 'Primary key and value required' });
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return res.status(400).json({ error: 'Row data must be an object' });
    }

    const db = await dbManager.getConnection(dbId);
    const tableRef = buildTableReference(db.type, tableName, schema);
    const schemaResult = await dbManager.getTableSchema(dbId, tableName, schema);
    const allowedColumns = new Set((schemaResult.rows || []).map((col) => col.name));

    const safePrimaryKey = sanitizeIdentifier(primaryKey, 'primary key');
    if (!allowedColumns.has(safePrimaryKey)) {
      return res.status(400).json({ error: 'Invalid primary key for table' });
    }

    const updateEntries = Object.entries(data)
      .filter(([key]) => allowedColumns.has(key));

    if (updateEntries.length === 0) {
      return res.status(400).json({ error: 'No valid columns to update' });
    }

    const setClause = updateEntries
      .map(([key], idx) => `${quoteIdentifier(db.type, key)} = ${getParamPlaceholder(db.type, idx + 1)}`)
      .join(', ');

    const values = updateEntries.map(([, value]) => value);
    const whereClause = `${quoteIdentifier(db.type, safePrimaryKey)} = ${getParamPlaceholder(db.type, values.length + 1)}`;
    const query = `UPDATE ${tableRef} SET ${setClause} WHERE ${whereClause}`;
    const params = [...values, primaryValue];

    await dbManager.query(dbId, query, params);
    res.json({ success: true });
  } catch (error) {
    if (error.message.startsWith('Invalid ')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// Insert new row into table
router.post('/:dbId/tables/:tableName/row', async (req, res) => {
  try {
    const { dbId, tableName } = req.params;
    const { data } = req.body;
    const schema = sanitizeSchemaValue(req.query.schema);

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return res.status(400).json({ error: 'Row data must be an object' });
    }

    const db = await dbManager.getConnection(dbId);
    const tableRef = buildTableReference(db.type, tableName, schema);
    const schemaResult = await dbManager.getTableSchema(dbId, tableName, schema);
    const allowedColumns = new Set((schemaResult.rows || []).map((col) => col.name));

    const insertEntries = Object.entries(data)
      .filter(([key]) => allowedColumns.has(key));

    if (insertEntries.length === 0) {
      return res.status(400).json({ error: 'No valid columns to insert' });
    }

    const columnsSql = insertEntries
      .map(([key]) => quoteIdentifier(db.type, key))
      .join(', ');
    const placeholders = insertEntries
      .map((_, idx) => getParamPlaceholder(db.type, idx + 1))
      .join(', ');
    const values = insertEntries.map(([, value]) => value);
    const query = `INSERT INTO ${tableRef} (${columnsSql}) VALUES (${placeholders})`;

    await dbManager.query(dbId, query, values);
    res.json({ success: true });
  } catch (error) {
    if (error.message.startsWith('Invalid ')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

// Delete row from table
router.delete('/:dbId/tables/:tableName/row', async (req, res) => {
  try {
    const { dbId, tableName } = req.params;
    const { primaryKey, primaryValue } = req.body;
    const schema = sanitizeSchemaValue(req.query.schema);

    if (!primaryKey || primaryValue === undefined) {
      return res.status(400).json({ error: 'Primary key and value required' });
    }

    const db = await dbManager.getConnection(dbId);
    const tableRef = buildTableReference(db.type, tableName, schema);
    const schemaResult = await dbManager.getTableSchema(dbId, tableName, schema);
    const allowedColumns = new Set((schemaResult.rows || []).map((col) => col.name));

    const safePrimaryKey = sanitizeIdentifier(primaryKey, 'primary key');
    if (!allowedColumns.has(safePrimaryKey)) {
      return res.status(400).json({ error: 'Invalid primary key for table' });
    }

    const placeholder = getParamPlaceholder(db.type, 1);
    const query = `DELETE FROM ${tableRef} WHERE ${quoteIdentifier(db.type, safePrimaryKey)} = ${placeholder}`;

    await dbManager.query(dbId, query, [primaryValue]);
    res.json({ success: true });
  } catch (error) {
    if (error.message.startsWith('Invalid ')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message });
  }
});

export { router as databaseRoutes };
