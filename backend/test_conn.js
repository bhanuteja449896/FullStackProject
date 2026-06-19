const db = require('./db');

async function test() {
  try {
    console.log('Testing connection to PostgreSQL database...');
    const res = await db.query('SELECT NOW()');
    console.log('Connection successful! Current time from DB:', res.rows[0].now);
    
    const tablesRes = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    console.log('Tables in public schema:', tablesRes.rows.map(r => r.table_name));
  } catch (err) {
    console.error('Database connection failed:', err);
  } finally {
    await db.end();
  }
}

test();
