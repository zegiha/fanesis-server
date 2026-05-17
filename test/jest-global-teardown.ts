import { existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql';

const HANDLE_FILE = join(__dirname, '.testcontainer.json');

export default async function globalTeardown(): Promise<void> {
  const fromGlobal = (
    globalThis as unknown as {
      __PG_CONTAINER__?: StartedPostgreSqlContainer;
    }
  ).__PG_CONTAINER__;

  if (fromGlobal) {
    await fromGlobal.stop();
  }
  // If globalThis handle is missing (worker process boundary), Testcontainers'
  // Ryuk reaper will clean up the dangling container.

  if (existsSync(HANDLE_FILE)) {
    unlinkSync(HANDLE_FILE);
  }
}
