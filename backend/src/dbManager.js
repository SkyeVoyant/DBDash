import pg from 'pg';
import mysql from 'mysql2/promise';
import sql from 'mssql';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DBManager {
  constructor() {
    this.connections = new Map();
  }

  reloadEnv() {
    // Reload environment variables from .env file
    dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });
  }

  async closeConnection(db) {
    // Close database connection based on database type
    try {
      if (!db.connection) return;

      const { connection, type } = db;

      switch (type) {
        case 'postgres':
        case 'postgresql':
          await connection.end();
          break;
        case 'mysql':
        case 'mariadb':
          await connection.end();
          break;
        case 'mssql':
        case 'sqlserver':
          // MSSQL uses connection-per-query pattern, no persistent connection to close
          break;
      }
    } catch (error) {
      console.error(`Error closing connection for ${db.id}:`, error.message);
    }
  }

  async reloadConnections() {
    // Reload all database connections from .env file
    console.log('🔄 Reloading database connections...');
    
    // Close all existing connections
    for (const [id, db] of this.connections.entries()) {
      await this.closeConnection(db);
    }
    
    // Clear connections map
    this.connections.clear();
    
    // Reload environment variables
    this.reloadEnv();
    
    // Initialize connections with reloaded configuration
    this.initializeConnections();
    
    console.log(`✅ Reloaded ${this.connections.size} database connections`);
  }

  initializeConnections() {
    // Initialize database connections from .env configuration
    this.reloadEnv();
    
    const dbConfigs = this.parseEnvConfigs();
    
    // Create connection for each configured database
    dbConfigs.forEach((config, index) => {
      try {
        const connection = this.createConnection(config);
        this.connections.set(config.id, {
          ...config,
          connection,
          status: 'connected'
        });
        console.log(`✅ Connected to ${config.type}:${config.id} (${config.name})`);
      } catch (error) {
        console.error(`❌ Failed to connect to ${config.id}:`, error.message);
        this.connections.set(config.id, {
          ...config,
          connection: null,
          status: 'error',
          error: error.message
        });
      }
    });
  }

  parseEnvConfigs() {
    // Parse database configurations from environment variables
    const configs = [];
    let index = 1;

    while (true) {
      const prefix = `DB_${index}_`;
      const type = process.env[`${prefix}TYPE`];
      
      if (!type) break;

      const config = {
        id: process.env[`${prefix}ID`] || `db_${index}`,
        name: process.env[`${prefix}NAME`] || `Database ${index}`,
        type: type.toLowerCase(),
        host: process.env[`${prefix}HOST`],
        port: parseInt(process.env[`${prefix}PORT`] || '0'),
        user: process.env[`${prefix}USER`],
        password: process.env[`${prefix}PASSWORD`],
        database: process.env[`${prefix}DATABASE`],
        options: {}
      };

      // Parse additional connection options from JSON string
      const optionsStr = process.env[`${prefix}OPTIONS`];
      if (optionsStr) {
        try {
          config.options = JSON.parse(optionsStr);
        } catch (e) {
          // Invalid JSON, skip options
        }
      }

      configs.push(config);
      index++;
    }

    return configs;
  }

  createConnection(config) {
    // Create database connection based on database type
    switch (config.type) {
      case 'postgres':
      case 'postgresql':
        // PostgreSQL connection pool
        return new Pool({
          host: config.host,
          port: config.port,
          user: config.user,
          password: config.password,
          database: config.database,
          ...config.options
        });

      case 'mysql':
      case 'mariadb':
        // MySQL/MariaDB connection pool
        return mysql.createPool({
          host: config.host,
          port: config.port,
          user: config.user,
          password: config.password,
          database: config.database,
          waitForConnections: true,
          connectionLimit: 10,
          ...config.options
        });

      case 'mssql':
      case 'sqlserver':
        // SQL Server connection config (lazy connection per query)
        return {
          config: {
            server: config.host,
            port: config.port,
            user: config.user,
            password: config.password,
            database: config.database,
            options: {
              encrypt: config.options.encrypt !== false,
              trustServerCertificate: true,
              ...config.options
            }
          }
        };

      default:
        throw new Error(`Unsupported database type: ${config.type}`);
    }
  }

  async getConnection(dbId) {
    const db = this.connections.get(dbId);
    if (!db) {
      throw new Error(`Database ${dbId} not found`);
    }
    if (db.status !== 'connected') {
      throw new Error(`Database ${dbId} is not connected: ${db.error || 'Unknown error'}`);
    }
    return db;
  }

  async query(dbId, sqlQuery, params = []) {
    // Execute SQL query on specified database with parameterized values
    const db = await this.getConnection(dbId);
    const { connection, type } = db;

    try {
      switch (type) {
        case 'postgres':
        case 'postgresql':
          // PostgreSQL uses $1, $2, etc. for parameters
          if (!connection || connection.ended) {
            throw new Error('Database connection closed');
          }
          const pgResult = await connection.query(sqlQuery, params);
          return { rows: pgResult.rows, rowCount: pgResult.rowCount || pgResult.rows.length };

        case 'mysql':
        case 'mariadb':
          // MySQL uses ? for parameters
          const [rows] = await connection.execute(sqlQuery, params);
          return { rows, rowCount: rows.length };

        case 'mssql':
        case 'sqlserver':
          // SQL Server creates connection per query
          const pool = await sql.connect(connection.config);
          const result = await pool.request()
            .query(sqlQuery);
          await pool.close();
          return { rows: result.recordset, rowCount: result.rowsAffected[0] || 0 };

        default:
          throw new Error(`Unsupported database type: ${type}`);
      }
    } catch (error) {
      const errorMsg = error.message || error.toString() || 'Unknown error';
      console.error(`Query error for ${dbId}:`, errorMsg, error);
      throw new Error(`Query failed: ${errorMsg}`);
    }
  }

  async getTables(dbId) {
    // Get list of tables from database using database-specific queries
    const db = await this.getConnection(dbId);
    const { type, database } = db;

    let query;
    switch (type) {
      case 'postgres':
      case 'postgresql':
        // PostgreSQL: query information_schema excluding system schemas
        query = `
          SELECT table_name as name, 
                 table_schema as schema
          FROM information_schema.tables 
          WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
          ORDER BY table_schema, table_name
        `;
        break;

      case 'mysql':
      case 'mariadb':
        // MySQL: query information_schema for specific database
        query = `
          SELECT table_name as name, 
                 table_schema as schema
          FROM information_schema.tables 
          WHERE table_schema = ?
          ORDER BY table_name
        `;
        return await this.query(dbId, query, [database]);

      case 'mssql':
      case 'sqlserver':
        // SQL Server: query information_schema for base tables
        query = `
          SELECT table_name as name, 
                 table_schema as schema
          FROM information_schema.tables 
          WHERE table_type = 'BASE TABLE'
          ORDER BY table_schema, table_name
        `;
        break;

      default:
        throw new Error(`Unsupported database type: ${type}`);
    }

    try {
      const result = await this.query(dbId, query);
      return result;
    } catch (error) {
      console.error(`Error in getTables for ${dbId}:`, error);
      throw error;
    }
  }

  async getTableSchema(dbId, tableName, schema = null) {
    // Get column schema information for a specific table
    const db = await this.getConnection(dbId);
    const { type, database } = db;

    let query;
    switch (type) {
      case 'postgres':
      case 'postgresql':
        // PostgreSQL: query information_schema.columns
        query = `
          SELECT 
            column_name as name,
            data_type as type,
            is_nullable as nullable,
            column_default as default_value
          FROM information_schema.columns
          WHERE table_schema = COALESCE($1, 'public')
            AND table_name = $2
          ORDER BY ordinal_position
        `;
        return await this.query(dbId, query, [schema || 'public', tableName]);

      case 'mysql':
      case 'mariadb':
        // MySQL: query information_schema.columns
        query = `
          SELECT 
            column_name as name,
            data_type as type,
            is_nullable as nullable,
            column_default as default_value
          FROM information_schema.columns
          WHERE table_schema = ? AND table_name = ?
          ORDER BY ordinal_position
        `;
        return await this.query(dbId, query, [database, tableName]);

      case 'mssql':
      case 'sqlserver':
        // SQL Server: query information_schema.columns
        query = `
          SELECT 
            column_name as name,
            data_type as type,
            is_nullable as nullable,
            column_default as default_value
          FROM information_schema.columns
          WHERE table_schema = COALESCE(?, 'dbo')
            AND table_name = ?
          ORDER BY ordinal_position
        `;
        return await this.query(dbId, query, [schema || 'dbo', tableName]);

      default:
        throw new Error(`Unsupported database type: ${type}`);
    }
  }

  getConnectionCount() {
    return this.connections.size;
  }

  getAllConnections() {
    return Array.from(this.connections.values()).map(db => ({
      id: db.id,
      name: db.name,
      type: db.type,
      status: db.status,
      error: db.error || null
    }));
  }
}

export const dbManager = new DBManager();

