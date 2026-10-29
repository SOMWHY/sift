import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import http from 'node:http';

let child: ChildProcess | null = null;
let token: string | null = null;

const DEFAULT_PORT = 3000;
const HOST = '127.0.0.1';
const READY_TIMEOUT_MS = 15000;
const READY_POLL_MS = 200;

export function getStartupToken(): string {
  if (!token) {
    token = process.env.SIFT_STARTUP_TOKEN ?? randomBytes(16).toString('hex');
  }
  return token;
}

export function getServerUrl(): string {
  return `http://${HOST}:${DEFAULT_PORT}`;
}

function standaloneDir(): string {
  return process.env.SIFT_STANDALONE_DIR ?? path.join(process.cwd(), '.next', 'standalone');
}

/**
 * 轮询 /health 直到渲染服务返回 200，或超时抛错。
 */
function waitForReady(url: string, timeoutMs: number = READY_TIMEOUT_MS): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = (): void => {
      const req = http.get(`${url}/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve();
        } else {
          retry();
        }
      });
      req.on('error', retry);
      req.setTimeout(500, () => {
        req.destroy();
        retry();
      });
    };
    const retry = (): void => {
      if (Date.now() > deadline) {
        reject(new Error(`渲染服务在 ${timeoutMs}ms 内未就绪：${url}`));
      } else {
        setTimeout(tick, READY_POLL_MS);
      }
    };
    tick();
  });
}

/**
 * 以独立子进程启动 Next.js standalone server（生产模式）。
 * 返回 Promise，在 /health 返回 200 后 resolve。
 */
export async function startServer(): Promise<void> {
  if (child && child.exitCode === null) {
    return waitForReady(getServerUrl());
  }

  const cwd = standaloneDir();
  const serverJs = path.join(cwd, 'server.js');

  child = spawn(process.execPath, [serverJs], {
    cwd,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: HOST,
      PORT: String(DEFAULT_PORT),
      SIFT_STARTUP_TOKEN: getStartupToken(),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout?.on('data', (d) => process.stdout.write(`[next] ${d}`));
  child.stderr?.on('data', (d) => process.stderr.write(`[next] ${d}`));
  child.on('exit', (code) => {
    child = null;
    process.stderr.write(`[next] server exited with code ${code}\n`);
  });

  return waitForReady(getServerUrl());
}

export function stopServer(): void {
  child?.kill();
  child = null;
}
