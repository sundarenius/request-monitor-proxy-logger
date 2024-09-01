import http from 'http';
import https from 'https';
import httpProxy from 'http-proxy';
import url from 'url';
import { generateCurlCommand } from './generate-curl-command.js';

// Create an HTTP(S) proxy server
const proxy = httpProxy.createProxyServer({
  selfHandleResponse: false,
});

// Array of headers to delete
const headersToDelete = [
  'host',
  'content-length',
  'postman-token',
  'user-agent',
  'vary',
];

// Function to remove specific headers from the request
const removeHeaders = (req, headersToRemove) => {
  headersToRemove.forEach(header => {
    delete req.headers[header.toLowerCase()];
  });
};

// Paths to log
const logThesePaths = ['api', 'target'];

// Function to clean the URL by removing the proxy prefix
const cleanAwayProxyUrl = (reqUrl) => {
  return reqUrl
    .replace('http://localhost:8080?target=', '')
    .replace('https://localhost:8080?target=', '')
    .replace('http://localhost:8080/?target=', '')
    .replace('https://localhost:8080/?target=', '');
};

// Function to construct the full URL
const cleanAndConstructUrl = (parsedUrl) => {
  const { protocol, host, pathname, query } = parsedUrl;

  const cleanQueryValue = (value) => typeof value === 'string' ? value.replace(/(\?|\/\?)/g, '') : value;

  const cleanedQuery = Object.fromEntries(Object.entries(query).map(([key, value]) => [key, cleanQueryValue(value)]));

  const queryString = new URLSearchParams(cleanedQuery).toString();
  return `${protocol}//${host}${pathname}${queryString ? '?' + queryString : ''}`;
};

// Function to extract the target URL from the incoming request
const getTargetUrl = (reqUrl) => {
  if (reqUrl.includes('target=')) {
    const splitUrl = reqUrl.split('target=')[1];
    const parsedUrl = url.parse(splitUrl, true);
    return cleanAndConstructUrl(parsedUrl);
  }

  if (!reqUrl.includes('http')) {
    const targetBaseUrl = 'http://localhost:3000';
    return `${targetBaseUrl}${reqUrl}`;
  }

  return reqUrl;
};

// Function to clean specific parts of the request object
const cleanRequest = (req) => {
  req.url = cleanAwayProxyUrl(req.url);
  for (const header in req.headers) {
    if (typeof req.headers[header] === 'string') {
      req.headers[header] = cleanAwayProxyUrl(req.headers[header]);
    }
  }
  return req;
};

// Function to proxy the request
const proxyRequest = (req, res, targetUrl) => {
  const parsedTarget = url.parse(targetUrl);
  const isHttps = parsedTarget.protocol === 'https:';

  proxy.web(req, res, {
    target: targetUrl,
    changeOrigin: true,
    secure: isHttps,
    agent: isHttps ? https.globalAgent : http.globalAgent,
    headers: req.headers,
  }, (err) => {
    if (err) {
      console.error('Proxy Error:', err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Something went wrong with the proxy server.');
    }
  });
};

// Modify response headers
proxy.on('proxyRes', (proxyRes, req, res) => {
  delete proxyRes.headers['vary'];
  // Capture headers
  const headers = {};
  for (const [key, value] of Object.entries(proxyRes.headers)) {
    // Convert to the original case if needed or use the header directly
    headers[key] = value;
  }

  // Set response headers
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }

  headersToDelete.forEach((h) => {
    delete proxyRes.headers[h];
  })
});

// Handle proxy errors
proxy.on('error', (err, req, res) => {
  console.error('Proxy Error:', err);
  res.writeHead(500, { 'Content-Type': 'text/plain' });
  res.end('Proxy server error.');
});

// Create an HTTP server that uses the proxy
const server = http.createServer((r, res) => {
  const req = cleanRequest(r);
  const targetUrl = getTargetUrl(req.url);

  removeHeaders(req, headersToDelete);

  if (logThesePaths.some(path => req.url.includes(path))) {
    let requestBody = '';

    req.on('data', chunk => {
      requestBody += chunk;
    });

    req.on('end', () => {
      const time = new Date().toISOString().replace('T', ' ').substring(0, 19);
      console.log('************ NEW REQUEST TO LOG ************');
      console.log('Time:', time);
      console.log('URL:', req.url);
      console.log('Method:', req.method);
      console.log('Headers:', req.headers);
      console.log('Body:', requestBody || null);
      console.log('Proxying to:', targetUrl);
      
      generateCurlCommand({
        method: req.method,
        url: targetUrl,
        headers: req.headers,
        body: requestBody,
      });

      console.log(`************ NEW REQUEST LOGGING DONE ************\n`);

      proxyRequest(req, res, targetUrl);
    });
  } else {
    proxyRequest(req, res, targetUrl);
  }
});

// Start the server
const PORT = 8080;
server.listen(PORT, () => {
  console.log(`* ||||||||| Proxy server listening on port ${PORT} ||||||||| *`);
});
