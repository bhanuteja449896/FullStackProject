const fs = require('fs');
const path = require('path');
const db = require('./db');

async function runMigration() {
  console.log('Starting migration to PostgreSQL database...');
  
  try {
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at: ${schemaPath}`);
    }
    
    console.log(`Reading schema definitions from database/schema.sql...`);
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    
    console.log('Executing SQL schema queries...');
    await db.query(schemaSql);
    
    console.log('==================================================');
    console.log(' ✓ Database migration completed successfully!');
    console.log('   All tables, indexes, and demo roles have been created.');
    console.log('==================================================');
  } catch (error) {
    console.error(' ✗ Database migration failed:', error);
  } finally {
    await db.end();
  }
}

runMigration();
