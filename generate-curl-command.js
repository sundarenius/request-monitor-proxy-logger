import clc from "cli-color";

// Function to generate a curl command from an HTTP request
export const generateCurlCommand = (req) => {
  // Escape special characters in headers and body for proper shell usage
  const escapeShellString = (str) => {
    return str.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  };

  const method = req.method;
  const url = req.url;
  const headers = req.headers;
  const body = req.body || '';

  // Start building the curl command
  let curlCommand = `curl -X ${method} '${escapeShellString(url)}'`;

  // Add headers to the curl command
  for (const [key, value] of Object.entries(headers)) {
    // Skip headers that are undefined or empty
    if (value && key !== 'content-length') {
      curlCommand += ` -H '${escapeShellString(key)}: ${escapeShellString(value)}'`;
    }
  }

  // Add body to the curl command if present
  if (body) {
    curlCommand += ` -d '${escapeShellString(body)}'`;
  }

  console.log('');
  console.log('CURL command:');
  console.log(clc.blue(curlCommand));
};
