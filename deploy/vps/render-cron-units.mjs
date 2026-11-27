import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const routePattern = /^\/api\/cron\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;
const container = process.env.PMRFP_CRON_CONTAINER ?? "pmrfp-vps-app-1";
const port = process.env.PMRFP_CRON_PORT ?? "4320";
if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(container) || !/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
  throw new Error("Invalid VPS cron container or port");
}

function numbers(field, min, max) {
  if (field === "*") return field;
  const parts = field.split(",");
  if (!parts.every(value => /^\d{1,2}$/.test(value) && Number(value) >= min && Number(value) <= max)) {
    throw new Error("Unsupported schedule field: " + field);
  }
  return parts.map(value => value.padStart(2, "0")).join(",");
}

function calendar(schedule) {
  const fields = schedule.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error("A five-field schedule is required");
  const [minute, hour, day, month, weekday] = fields;
  if (day !== "*" && weekday !== "*") {
    throw new Error("A schedule combining day of month and weekday needs an explicit translation");
  }
  const days = weekday === "*" ? "" :
    numbers(weekday, 0, 6).split(",").map(value => weekdays[Number(value)]).join(",") + " ";
  return `${days}*-${numbers(month, 1, 12)}-${numbers(day, 1, 31)} ${numbers(hour, 0, 23)}:${numbers(minute, 0, 59)}:00 UTC`;
}

const run = `const secret = process.env.CRON_SECRET;
if (!secret || process.env.PMRFP_ISOLATED_D1_STAGING === "enabled") {
  console.error("PMRFP cron unavailable in this deployment");
  process.exit(2);
}
fetch("http://127.0.0.1:${port}" + process.argv[1], {
  headers: { authorization: "Bearer " + secret, host: "pmrfp.com",
    "x-forwarded-host": "pmrfp.com", "x-forwarded-proto": "https", "x-forwarded-port": "443" },
  redirect: "error",
  signal: AbortSignal.timeout(600000),
}).then(async response => {
  const result = response.ok && response.headers.get("content-type")?.includes("application/json")
    ? await response.json() : null;
  if (result === null) await response.body?.cancel();
  console.log("PMRFP cron HTTP " + response.status);
  const missingBackend = result?.skipped === "no service client" || result?.skipped === "no supabase";
  if (missingBackend) console.error("PMRFP cron backend unavailable");
  process.exitCode = response.ok && !missingBackend ? 0 : 1;
}).catch(() => {
  console.error("PMRFP cron request failed");
  process.exitCode = 1;
});`.replace(/\n/g, " ");

const destination = process.argv[2];
if (!destination) throw new Error("Usage: node deploy/vps/render-cron-units.mjs <new-output-directory>");
const { crons } = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
const requested = new Set(process.argv.slice(3));
const units = new Map();
for (const job of crons) {
  if (!routePattern.test(job.path)) throw new Error("Unexpected scheduled route");
  if (requested.size && !requested.has(job.path)) continue;
  const name = "pmrfp-cron-" + job.path.slice("/api/cron/".length).replaceAll("/", "-");
  if (units.has(name)) throw new Error("Duplicate systemd unit name: " + name);
  units.set(name, {
    service: `[Unit]
Description=Run PMRFP job ${job.path}
After=docker.service

[Service]
Type=oneshot
ExecStart=/usr/bin/docker exec ${container} node -e ${JSON.stringify(run)} ${job.path}
TimeoutStartSec=660
`,
    timer: `[Unit]
Description=Schedule PMRFP job ${job.path}

[Timer]
OnCalendar=${calendar(job.schedule)}
AccuracySec=1s
Persistent=false

[Install]
WantedBy=timers.target
`,
  });
}
if (requested.size && units.size !== requested.size) throw new Error("Unknown scheduled route");

mkdirSync(destination, { mode: 0o700 });
for (const [name, unit] of units) {
  writeFileSync(join(destination, name + ".service"), unit.service);
  writeFileSync(join(destination, name + ".timer"), unit.timer);
}
console.log(`Generated ${units.size} VPS schedules in UTC. No jobs were activated.`);
