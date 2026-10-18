import {
  checkDatabaseConnection,
  disconnectDatabase,
} from '../database/prisma.js';

try {
  await checkDatabaseConnection();
  console.log('Database connection successful.');
} catch (error) {
  console.error('Database connection failed.', error);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
