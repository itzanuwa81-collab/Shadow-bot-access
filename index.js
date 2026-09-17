const http = require("http");

const PORT = process.env.PORT || 3000;

console.log("🔥 SHADOW X TEST APP STARTED");
console.log("📡 PORT:", PORT);

http
  .createServer((req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
    });

    res.end("SHADOW X TEST OK");
  })
  .listen(PORT, "0.0.0.0", () => {
    console.log("✅ SERVER LISTENING ON PORT", PORT);
  });
