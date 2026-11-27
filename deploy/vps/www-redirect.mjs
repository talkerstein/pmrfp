import { readFileSync } from "node:fs";
import { createServer } from "node:https";

createServer({
  key: readFileSync("/tls/privkey.pem"),
  cert: readFileSync("/tls/fullchain.pem"),
  minVersion: "TLSv1.2",
}, (request, response) => {
  const target = request.url ?? "";
  const host = request.headers.host?.toLowerCase();
  if ((host !== "www.pmrfp.com" && host !== "www.pmrfp.com:443") ||
      !target.startsWith("/") || /[\x00-\x20\x7f]/.test(target)) {
    response.writeHead(400).end();
    return;
  }
  response.writeHead(308, { location: "https://pmrfp.com" + target }).end();
}).listen(8443, "0.0.0.0");
