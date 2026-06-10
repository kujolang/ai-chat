const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const projectRoot = path.resolve(__dirname, "..");
const dbPath = process.env.DB_PATH || path.join(projectRoot, "data", "ai_chat.db");
const backupDir = process.env.DB_BACKUP_DIR || path.join(projectRoot, "data", "backups");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
fs.mkdirSync(backupDir, { recursive: true });

if (!fs.existsSync(dbPath)) {
	console.error("Database file does not exist yet:", dbPath);
	process.exit(1);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const targetPath = path.join(backupDir, `ai-chat-${stamp}.db`);
const safeTarget = targetPath.replace(/'/g, "''");

const db = new Database(dbPath);
try {
	db.exec(`VACUUM INTO '${safeTarget}'`);
	console.log("Backup complete:", targetPath);
} finally {
	db.close();
}
