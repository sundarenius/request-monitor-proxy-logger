const http = require('http');
const https = require('https');
const httpProxy = require('http-proxy');
const url = require('url');

// Create an HTTP(S) proxy server
const proxy = httpProxy.createProxyServer({});

// Paths to log
const logThesePaths = [
  'api',
  'target',
];

// Function to clean the URL by removing the proxy prefix
const cleanAwayProxyUrl = (reqUrl) => {
  return reqUrl
    .replace('http://localhost:8080?target=', '')
    .replace('https://localhost:8080?target=', '')
    .replace('http://localhost:8080/?target=', '')
    .replace('https://localhost:8080/?target=', '');
};

function cleanAndConstructUrl(parsedUrl) {
  // Destructure necessary properties from the parsedUrl object
  const { protocol, slashes, host, pathname, query } = parsedUrl;

  // Function to clean a query value
  const cleanQueryValue = (value) => {
    if (typeof value === 'string') {
      return value.replace(/(\?|\/\?)/g, ''); // Remove any "?" or "/?"
    }
    return value;
  };

  // Clean all query values
  const cleanedQuery = Object.fromEntries(
    Object.entries(query).map(([key, value]) => [key, cleanQueryValue(value)])
  );

  // Reconstruct the query string from the cleaned query object
  const queryString = new URLSearchParams(cleanedQuery).toString();

  // Construct the full URL
  const fullUrl = `${protocol}//${host}${pathname}${queryString ? '?' + queryString : ''}`;

  return fullUrl;
};
// Function to extract the target URL from the incoming request
const getTargetUrl = (reqUrl) => {
  if (reqUrl.includes('target=')) {
    const splitUrl = reqUrl.split('target=')[1];
    const parsedUrl = url.parse(splitUrl, true); // parse the URL with query parameters
    return cleanAndConstructUrl(parsedUrl);
  }

  if (!reqUrl.includes('http')) {
    const targetBaseUrl = 'http://localhost:3000'; // Default target URL
    return `${targetBaseUrl}${reqUrl}`;
  }

  return reqUrl;
};

// Function to clean specific parts of the request object
const cleanRequest = (req) => {
  // Clean URL
  req.url = cleanAwayProxyUrl(req.url);

  // Clean headers
  for (const header in req.headers) {
    if (typeof req.headers[header] === 'string') {
      req.headers[header] = cleanAwayProxyUrl(req.headers[header]);
    }
  }

  // Clean body
  if (req.body && typeof req.body === 'string') {
    req.body = cleanAwayProxyUrl(req.body);
  }

  return req;
};

// Create an HTTP server that uses the proxy
const server = http.createServer((r, res) => {
  const req = cleanRequest(r);
  const targetUrl = getTargetUrl(req.url);

  if (logThesePaths.some(path => req.url.includes(path))) {
    let requestBody = '';

    // Collect request body chunks
    req.on('data', chunk => {
      requestBody += chunk;
    });

    req.on('end', () => {
      // Log details of the incoming request
      const time = new Date().toISOString().replace('T', ' ').substring(0, 19);
      console.log('************ NEW REQUEST TO LOG ************');
      console.log('Time:', time);
      console.log('URL:', targetUrl);
      console.log('Method:', req.method);
      console.log('Headers:', req.headers);
      console.log('Body:', requestBody || null);

      // Log the target URL
      console.log('Proxying to:', targetUrl);

      console.log(`************ NEW REQUEST LOGGING DONE ************
`);

      // Proxy the request to the target URL
      proxyRequest(req, res, targetUrl);
    });
  } else {
    // Directly proxy the request if it doesn't need logging
    proxyRequest(req, res, targetUrl);
  }
});

// Function to proxy the request
const proxyRequest = (req, res, targetUrl) => {
  const parsedTarget = url.parse(targetUrl);
  const isHttps = parsedTarget.protocol === 'https:';

  // Proxy the request to the target URL
  proxy.web(req, res, {
    target: targetUrl,
    changeOrigin: true,
    secure: isHttps, // only enforce SSL if target is HTTPS
    agent: isHttps ? https.globalAgent : http.globalAgent,
  }, (err) => {
    // Log errors if the proxy operation fails
    console.error('Proxy Error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Something went wrong with the proxy server.');
  });
};

// Handle proxy errors
proxy.on('error', (err, req, res) => {
  console.error('Proxy Error:', err);
  res.writeHead(500, { 'Content-Type': 'text/plain' });
  res.end('Proxy server error.');
});

// Start the server
const PORT = 8080;
server.listen(PORT, () => {
  console.log(`* ||||||||| Proxy server listening on port ${PORT} ||||||||| *`);
});
