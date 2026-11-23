// PM2 process file: runs the web app and the background worker, restarts them if they crash
// and on server reboot. Usage (from the project folder): pm2 start deploy/ecosystem.config.cjs
const path = require("path");
const cwd = path.join(__dirname, "..");

module.exports = {
  apps: [
    {
      name: "venner-seo-web",
      cwd,
      script: "node_modules/next/dist/bin/next",
      args: `start -p ${process.env.PORT || 3000}`,
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
