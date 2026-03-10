import { getDatabase, closeDatabase } from '../connection.js';
import { runMigrations } from './001_initial.js';

const db = getDatabase();
runMigrations(db);
console.log('Migrations complete');
closeDatabase();
