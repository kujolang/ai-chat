const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

const projectRoot = path.resolve(__dirname, "..");
const dbPath = process.env.DB_PATH || path.join(projectRoot, "data", "ai_chat.db");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
if (!fs.existsSync(dbPath)) {
	console.error("Database file does not exist yet:", dbPath);
	process.exit(1);
}

const db = new Database(dbPath);
try {
	db.exec("VACUUM");
	console.log("VACUUM complete for", dbPath);
} finally {
	db.close();
}
