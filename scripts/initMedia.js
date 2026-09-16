require("dotenv").config({ silent: true });
const fs = require("fs");
const path = require("path");

const clientPublic = path.resolve(process.cwd(), "client", "public");
const VOLUME_ROOT = process.env.MEDIA_VOLUME || "/app/data";
const DIRS = ["media", "meta-media", "notification", "recordings"];

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

try {
  fs.accessSync(VOLUME_ROOT, fs.constants.W_OK);
} catch (err) {
  console.log(`[initMedia] No persistent volume at ${VOLUME_ROOT}, skipping`);
  process.exit(0);
}

for (const dir of DIRS) {
  const volumeDir = path.join(VOLUME_ROOT, dir);
  const appDir = path.join(clientPublic, dir);

  ensureDir(volumeDir);

  if (fs.readdirSync(volumeDir).length === 0 && fs.existsSync(appDir)) {
    try {
      fs.cpSync(appDir, volumeDir, { recursive: true });
      console.log(`[initMedia] Seeded ${volumeDir} from committed defaults`);
    } catch (err) {
      console.log(`[initMedia] Seed failed for ${dir}: ${err.message}`);
    }
  }

  try {
    const stat = fs.lstatSync(appDir);
    if (stat.isSymbolicLink()) continue;
    fs.rmSync(appDir, { recursive: true, force: true });
  } catch (err) {
    // not present, nothing to remove
  }

  fs.symlinkSync(volumeDir, appDir, "dir");
  console.log(`[initMedia] Linked ${appDir} -> ${volumeDir}`);
}

console.log("[initMedia] Done");