// PM2 process file: runs the web app and the background worker, restarts them if they crash
// and on server reboot. Usage (from the project folder): pm2 start deploy/ecosystem.config.cjs
const path = require("path");
const fs = require("fs");
const cwd = path.join(__dirname, "..");

// Port: shell PORT wins, then PORT= in .env, then the .port file setup-server.sh writes, then 3000.
// Reading these files keeps the port stable when update.sh restarts without PORT in the shell.
function read(file) {
  try {
    return fs.readFileSync(path.join(cwd, file), "utf8");
  } catch {
    return "";
  }
}
const port =
  process.env.PORT ||
  (read(".env").match(/^PORT=["']?(\d+)/m) || [])[1] ||
  (read(".port").match(/\d+/) || [])[0] ||
  3000;

module.exports = {
  apps: [
    {
      name: "venner-seo-web",
      cwd,
      script: "node_modules/next/dist/bin/next",
      args: `start -p ${port}`,
      env: { NODE_ENV: "production", TZ: "Asia/Kolkata" },
      max_memory_restart: "1G",
    },
    {
      name: "venner-seo-worker",
      cwd,
      script: "node_modules/tsx/dist/cli.mjs",
      args: "--env-file=.env src/worker/index.ts",
      env: { NODE_ENV: "production", TZ: "Asia/Kolkata" },
      max_memory_restart: "800M",
    },
  ],
};
