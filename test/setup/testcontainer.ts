import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';

export interface TestContainerHandle {
  container: StartedPostgreSqlContainer;
  url: string;
}

export async function startPostgresContainer(): Promise<TestContainerHandle> {
  const container = await new PostgreSqlContainer('postgres:16').start();

  const url = `postgresql://${container.getUsername()}:${container.getPassword()}@${container.getHost()}:${container.getPort()}/${container.getDatabase()}?schema=public`;

  execSync('pnpm dlx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });

  return { container, url };
}
