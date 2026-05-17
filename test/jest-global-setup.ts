import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { startPostgresContainer } from './setup/testcontainer';

const HANDLE_FILE = join(__dirname, '.testcontainer.json');

export default async function globalSetup(): Promise<void> {
  const { container, url } = await startPostgresContainer();

  process.env.DATABASE_URL = url;

  writeFileSync(
    HANDLE_FILE,
    JSON.stringify({ containerId: container.getId(), url }),
  );

  (
    globalThis as unknown as { __PG_CONTAINER__: typeof container }
  ).__PG_CONTAINER__ = container;
}
