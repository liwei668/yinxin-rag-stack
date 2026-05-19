import { createServer as createHttpServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { parse } from 'url';
import next from 'next';
import fs from 'fs';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '3000', 10);
const useHttps = process.env.HTTPS === 'true';

const app = next({ dev, hostname, port });

app.prepare().then(() => {
  const handle = app.getRequestHandler();

  const handler = async (req, res) => {
    try {
      await handle(req, res, parse(req.url, true));
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  };

  if (useHttps) {
    // HTTPS 模式（本地开发用自签名证书）
    const httpsOptions = {
      key: fs.readFileSync('localhost-key.pem'),
      cert: fs.readFileSync('localhost.pem'),
    };
    createHttpsServer(httpsOptions, handler).listen(port, () => {
      console.log(`> Ready on https://localhost:${port}`);
      console.log(`> Network: https://192.168.0.160:${port}`);
    });
  } else {
    // HTTP 模式（配合花生壳 HTTPS 使用）
    createHttpServer(handler).listen(port, () => {
      console.log(`> Ready on http://localhost:${port}`);
      console.log(`> Network: http://192.168.0.160:${port}`);
    });
  }
});
