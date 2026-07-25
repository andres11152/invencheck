import { config } from 'dotenv';
import { execSync } from 'child_process';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../../.env.test'), quiet: true });

execSync('npx prisma migrate deploy', {
  cwd: resolve(__dirname, '../..'),
  stdio: 'inherit',
  env: process.env,
});
