import { defineConfig, type Plugin } from 'vitest/config';
import fs from 'node:fs';

function sqlTextPlugin(): Plugin {
  return {
    name: 'sql-text',
    load(id) {
      if (id.endsWith('.sql')) {
        return `export default ${JSON.stringify(fs.readFileSync(id, 'utf-8'))};`;
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [sqlTextPlugin()],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
  },
});
