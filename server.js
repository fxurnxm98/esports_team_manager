const express = require("express");
const path = require("node:path");
const fs = require("node:fs");
const { DatabaseSync } = require("node:sqlite");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Database ----------
const dataDir = path.join(__dirname, "data");
fs.mkdirSync(dataDir, { recursive: true });

const databasePath = path.join(dataDir, "esports.db");
const isNewDatabase = !fs.existsSync(databasePath);

const db = new DatabaseSync(databasePath);

db.exec(`
  PRAGMA foreign_keys = ON;
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    region TEXT NOT NULL,
    founded_year INTEGER NOT NULL
      CHECK (founded_year BETWEEN 1950 AND 2100)
  );

  CREATE TABLE IF NOT EXISTS players (
    id INTEGER PRIMARY KEY,
    team_id INTEGER NOT NULL,
    gamer_tag TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL
      CHECK (role IN (
        'Duelist', 'Initiator', 'Controller', 'Sentinel', 'Flex'
      )),
    age INTEGER NOT NULL CHECK (age BETWEEN 13 AND 80),
    email TEXT UNIQUE,
    FOREIGN KEY (team_id)
      REFERENCES teams(id) ON DELETE RESTRICT
  );

  CREATE TABLE IF NOT EXISTS gear (
    id INTEGER PRIMARY KEY,
    asset_code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    player_id INTEGER,
    price REAL NOT NULL CHECK (price >= 0),
    status TEXT NOT NULL
      CHECK (status IN ('Available', 'In use', 'Repair')),
    FOREIGN KEY (player_id)
      REFERENCES players(id) ON DELETE RESTRICT
  );

  CREATE TABLE IF NOT EXISTS tournaments (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    game TEXT NOT NULL,
    start_date TEXT NOT NULL,
    prize_pool REAL NOT NULL CHECK (prize_pool >= 0)
  );

  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY,
    tournament_id INTEGER NOT NULL,
    team_id INTEGER NOT NULL,
    opponent_team_id INTEGER NOT NULL,
    match_date TEXT NOT NULL,
    team_score INTEGER NOT NULL
      CHECK (team_score BETWEEN 0 AND 100),
    opponent_score INTEGER NOT NULL
      CHECK (opponent_score BETWEEN 0 AND 100),
    status TEXT NOT NULL
      CHECK (status IN ('Scheduled', 'Live', 'Completed')),
    CHECK (team_id <> opponent_team_id),
    FOREIGN KEY (tournament_id)
      REFERENCES tournaments(id) ON DELETE RESTRICT,
    FOREIGN KEY (team_id)
      REFERENCES teams(id) ON DELETE RESTRICT,
    FOREIGN KEY (opponent_team_id)
      REFERENCES teams(id) ON DELETE RESTRICT
  );

  CREATE INDEX IF NOT EXISTS idx_players_team
    ON players(team_id);

  CREATE INDEX IF NOT EXISTS idx_gear_player
    ON gear(player_id);

  CREATE INDEX IF NOT EXISTS idx_matches_tournament
    ON matches(tournament_id);

  CREATE INDEX IF NOT EXISTS idx_matches_team
    ON matches(team_id);

  CREATE INDEX IF NOT EXISTS idx_matches_opponent
    ON matches(opponent_team_id);
`);

// ---------- Mock data ----------
function seedDatabase() {
  const teamNames = [
    "Nova Phoenix",
    "Cyber Wolves",
    "Titan Force",
    "Shadow Ravens",
    "Pixel Knights",
    "Thunder Fox",
    "Frost Dragons",
    "Solar Eagles",
    "Neon Tigers",
    "Quantum Sharks"
  ];

  const regions = ["Thailand", "Japan", "Korea", "Singapore", "Vietnam"];

  const roles = [
    "Duelist",
    "Initiator",
    "Controller",
    "Sentinel",
    "Flex"
  ];

  const insertTeam = db.prepare(`
    INSERT INTO teams (name, region, founded_year)
    VALUES (?, ?, ?)
  `);

  const insertPlayer = db.prepare(`
    INSERT INTO players (team_id, gamer_tag, role, age, email)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertGear = db.prepare(`
    INSERT INTO gear (asset_code, name, player_id, price, status)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertTournament = db.prepare(`
    INSERT INTO tournaments (name, game, start_date, prize_pool)
    VALUES (?, ?, ?, ?)
  `);

  const insertMatch = db.prepare(`
    INSERT INTO matches (
      tournament_id,
      team_id,
      opponent_team_id,
      match_date,
      team_score,
      opponent_score,
      status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  db.exec("BEGIN");

  try {
    teamNames.forEach((name, index) => {
      insertTeam.run(
        name,
        regions[index % regions.length],
        2016 + (index % 9)
      );
    });

    for (let teamId = 1; teamId <= 10; teamId++) {
      for (let position = 0; position < 5; position++) {
        const number = (teamId - 1) * 5 + position + 1;
        const prefix = teamNames[teamId - 1].split(" ")[0];

        insertPlayer.run(
          teamId,
          `${prefix}_${position + 1}`,
          roles[position],
          18 + (number % 10),
          `player${number}@example.com`
        );
      }
    }

    const equipment = [
      "Gaming Mouse",
      "Mechanical Keyboard",
      "Gaming Headset",
      "240Hz Monitor"
    ];

    for (let i = 1; i <= 20; i++) {
      const unassigned = i % 5 === 0;

      insertGear.run(
        `GEAR-${String(i).padStart(3, "0")}`,
        equipment[(i - 1) % equipment.length],
        unassigned ? null : i,
        1500 + i * 350,
        unassigned ? "Available" : i % 7 === 0 ? "Repair" : "In use"
      );
    }

    for (let i = 1; i <= 10; i++) {
      const month = String(i).padStart(2, "0");

      insertTournament.run(
        `Valorant Community Cup ${i}`,
        "VALORANT",
        `2026-${month}-10`,
        10000 * i
      );
    }

    for (let i = 1; i <= 15; i++) {
      const tournamentId = ((i - 1) % 10) + 1;
      const teamId = ((i - 1) % 10) + 1;
      const opponentId = (teamId % 10) + 1;
      const month = String(tournamentId).padStart(2, "0");

      const status =
        i <= 10 ? "Completed" : i === 11 ? "Live" : "Scheduled";

      insertMatch.run(
        tournamentId,
        teamId,
        opponentId,
        `2026-${month}-15`,
        status === "Completed" ? 2 : status === "Live" ? 1 : 0,
        status === "Completed" ? i % 2 : 0,
        status
      );
    }

    db.exec("COMMIT");
    console.log("Created 105 mock records.");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

if (isNewDatabase) {
  seedDatabase();
}

// ---------- Table metadata ----------
const tables = {
  teams: {
    title: "ทีม",
    display: "name",
    fields: [
      { key: "name", label: "ชื่อทีม", type: "text", required: true },
      { key: "region", label: "ประเทศ / ภูมิภาค", type: "text", required: true },
      {
        key: "founded_year",
        label: "ปีก่อตั้ง (ค.ศ.)",
        type: "number",
        integer: true,
        min: 1950,
        max: 2100,
        required: true
      }
    ]
  },

  players: {
    title: "ผู้เล่น",
    display: "gamer_tag",
    fields: [
      { key: "team_id", label: "ทีม", type: "select", ref: "teams", required: true },
      { key: "gamer_tag", label: "ชื่อในเกม", type: "text", required: true },
      {
        key: "role",
        label: "ตำแหน่ง",
        type: "select",
        options: ["Duelist", "Initiator", "Controller", "Sentinel", "Flex"],
        required: true
      },
      {
        key: "age",
        label: "อายุ",
        type: "number",
        integer: true,
        min: 13,
        max: 80,
        required: true
      },
      { key: "email", label: "อีเมล", type: "email", required: false }
    ]
  },

  gear: {
    title: "อุปกรณ์",
    display: "name",
    fields: [
      { key: "asset_code", label: "รหัสอุปกรณ์", type: "text", required: true },
      { key: "name", label: "ชื่ออุปกรณ์", type: "text", required: true },
      { key: "player_id", label: "ผู้รับผิดชอบ", type: "select", ref: "players", required: false },
      { key: "price", label: "ราคา (บาท)", type: "number", min: 0, required: true },
      {
        key: "status",
        label: "สถานะ",
        type: "select",
        options: ["Available", "In use", "Repair"],
        required: true
      }
    ]
  },

  tournaments: {
    title: "รายการแข่งขัน",
    display: "name",
    fields: [
      { key: "name", label: "ชื่อรายการ", type: "text", required: true },
      { key: "game", label: "เกม", type: "text", required: true },
      { key: "start_date", label: "วันเริ่มรายการ", type: "date", required: true },
      { key: "prize_pool", label: "เงินรางวัล (บาท)", type: "number", min: 0, required: true }
    ]
  },

  matches: {
    title: "แมตช์แข่งขัน",
    display: "id",
    fields: [
      { key: "tournament_id", label: "รายการแข่งขัน", type: "select", ref: "tournaments", required: true },
      { key: "team_id", label: "ทีม A", type: "select", ref: "teams", required: true },
      { key: "opponent_team_id", label: "ทีม B", type: "select", ref: "teams", required: true },
      { key: "match_date", label: "วันที่แข่งขัน", type: "date", required: true },
      {
        key: "team_score",
        label: "คะแนนทีม A",
        type: "number",
        integer: true,
        min: 0,
        max: 100,
        required: true
      },
      {
        key: "opponent_score",
        label: "คะแนนทีม B",
        type: "number",
        integer: true,
        min: 0,
        max: 100,
        required: true
      },
      {
        key: "status",
        label: "สถานะแมตช์",
        type: "select",
        options: ["Scheduled", "Live", "Completed"],
        required: true
      }
    ]
  }
};

// ---------- Validation ----------
function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function getTable(name) {
  if (!Object.hasOwn(tables, name)) {
    fail("ไม่พบตารางข้อมูล", 404);
  }

  return tables[name];
}

function getId(value) {
  const id = Number(value);

  if (!Number.isSafeInteger(id) || id < 1) {
    fail("รหัสข้อมูลไม่ถูกต้อง");
  }

  return id;
}

function validate(tableName, body) {
  const config = getTable(tableName);
  const values = {};

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    fail("รูปแบบข้อมูลไม่ถูกต้อง");
  }

  for (const field of config.fields) {
    let value = body[field.key];

    if (typeof value === "string") {
      value = value.trim();
    }

    if (value === "" || value === undefined || value === null) {
      if (field.required) {
        fail(`กรุณากรอก ${field.label}`);
      }

      values[field.key] = null;
      continue;
    }

    if (field.ref || field.type === "number") {
      if (typeof value !== "string" && typeof value !== "number") {
        fail(`${field.label} ต้องเป็นตัวเลข`);
      }

      value = Number(value);

      if (!Number.isFinite(value)) {
        fail(`${field.label} ต้องเป็นตัวเลขที่ถูกต้อง`);
      }

      if ((field.ref || field.integer) && !Number.isSafeInteger(value)) {
        fail(`${field.label} ต้องเป็นจำนวนเต็ม`);
      }

      if (field.min !== undefined && value < field.min) {
        fail(`${field.label} ต้องไม่น้อยกว่า ${field.min}`);
      }

      if (field.max !== undefined && value > field.max) {
        fail(`${field.label} ต้องไม่เกิน ${field.max}`);
      }

      if (field.ref) {
        const referencedRow = db
          .prepare(`SELECT id FROM ${field.ref} WHERE id = ?`)
          .get(value);

        if (!referencedRow) {
          fail(`ไม่พบข้อมูลอ้างอิงของ ${field.label}`);
        }
      }
    } else {
      if (typeof value !== "string") {
        fail(`${field.label} ต้องเป็นข้อความ`);
      }

      if (value.length > 150) {
        fail(`${field.label} ต้องไม่เกิน 150 ตัวอักษร`);
      }

      if (field.options && !field.options.includes(value)) {
        fail(`${field.label} ไม่อยู่ในตัวเลือกที่กำหนด`);
      }

      if (
        field.type === "email" &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      ) {
        fail("รูปแบบอีเมลไม่ถูกต้อง");
      }

      if (field.type === "date") {
        const date = new Date(`${value}T00:00:00Z`);

        if (
          !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
          Number.isNaN(date.getTime()) ||
          date.toISOString().slice(0, 10) !== value
        ) {
          fail(`${field.label} ต้องเป็นวันที่ที่ถูกต้อง`);
        }
      }
    }

    values[field.key] = value;
  }

  if (
    tableName === "matches" &&
    values.team_id === values.opponent_team_id
  ) {
    fail("ทีม A และทีม B ต้องเป็นคนละทีม");
  }

  if (
    tableName === "gear" &&
    values.status === "In use" &&
    values.player_id === null
  ) {
    fail("อุปกรณ์ที่กำลังใช้งานต้องระบุผู้รับผิดชอบ");
  }

  return values;
}

// ---------- Middleware ----------
app.use(express.json({ limit: "100kb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  const publicIndex = path.join(__dirname, "public", "index.html");
  const rootIndex = path.join(__dirname, "index.html");
  res.sendFile(fs.existsSync(publicIndex) ? publicIndex : rootIndex);
});

// ---------- Read API ----------
app.get("/api/meta", (req, res) => {
  res.json(tables);
});

app.get("/api/data", (req, res) => {
  const result = {};

  for (const tableName of Object.keys(tables)) {
    result[tableName] = db
      .prepare(`SELECT * FROM ${tableName} ORDER BY id DESC`)
      .all();
  }

  res.json(result);
});

app.get("/api/dashboard", (req, res) => {
  const counts = {};

  for (const tableName of Object.keys(tables)) {
    counts[tableName] = db
      .prepare(`SELECT COUNT(*) AS total FROM ${tableName}`)
      .get().total;
  }

  const recentMatches = db.prepare(`
    SELECT
      m.id,
      m.match_date,
      m.team_score,
      m.opponent_score,
      m.status,
      t.name AS tournament_name,
      a.name AS team_name,
      b.name AS opponent_name
    FROM matches AS m
    JOIN tournaments AS t ON m.tournament_id = t.id
    JOIN teams AS a ON m.team_id = a.id
    JOIN teams AS b ON m.opponent_team_id = b.id
    ORDER BY m.match_date DESC, m.id DESC
    LIMIT 8
  `).all();

  const roster = db.prepare(`
    SELECT
      t.id,
      t.name,
      t.region,
      COUNT(p.id) AS player_count
    FROM teams AS t
    LEFT JOIN players AS p ON p.team_id = t.id
    GROUP BY t.id, t.name, t.region
    ORDER BY player_count DESC, t.name ASC
  `).all();

  const equipment = db.prepare(`
    SELECT
      COALESCE(SUM(price), 0) AS total_value,
      COUNT(CASE WHEN status = 'Available' THEN 1 END) AS available
    FROM gear
  `).get();

  res.json({ counts, recentMatches, roster, equipment });
});

app.get("/api/:table", (req, res) => {
  const tableName = req.params.table;
  getTable(tableName);

  res.json(
    db.prepare(`SELECT * FROM ${tableName} ORDER BY id DESC`).all()
  );
});

// ---------- Create ----------
app.post("/api/:table", (req, res) => {
  const tableName = req.params.table;
  const values = validate(tableName, req.body);

  const columns = Object.keys(values);
  const placeholders = columns.map(() => "?").join(", ");

  const result = db.prepare(`
    INSERT INTO ${tableName} (${columns.join(", ")})
    VALUES (${placeholders})
  `).run(...Object.values(values));

  res.status(201).json({
    message: "เพิ่มข้อมูลสำเร็จ",
    id: Number(result.lastInsertRowid)
  });
});

// ---------- Update ----------
app.put("/api/:table/:id", (req, res) => {
  const tableName = req.params.table;
  const id = getId(req.params.id);
  const values = validate(tableName, req.body);

  const assignments = Object.keys(values)
    .map(column => `${column} = ?`)
    .join(", ");

  const result = db.prepare(`
    UPDATE ${tableName}
    SET ${assignments}
    WHERE id = ?
  `).run(...Object.values(values), id);

  if (Number(result.changes) === 0) {
    fail("ไม่พบข้อมูลที่ต้องการแก้ไข", 404);
  }

  res.json({ message: "แก้ไขข้อมูลสำเร็จ" });
});

// ---------- Delete ----------
app.delete("/api/:table/:id", (req, res) => {
  const tableName = req.params.table;
  getTable(tableName);

  const id = getId(req.params.id);

  const result = db
    .prepare(`DELETE FROM ${tableName} WHERE id = ?`)
    .run(id);

  if (Number(result.changes) === 0) {
    fail("ไม่พบข้อมูลที่ต้องการลบ", 404);
  }

  res.json({ message: "ลบข้อมูลสำเร็จ" });
});

// ---------- Error handler ----------
app.use((error, req, res, next) => {
  console.error(error.message);

  if (error.type === "entity.parse.failed") {
    return res.status(400).json({ error: "รูปแบบ JSON ไม่ถูกต้อง" });
  }

  if (error.message.includes("FOREIGN KEY constraint failed")) {
    return res.status(400).json({
      error:
        "ไม่สามารถดำเนินการได้ เพราะข้อมูลมีความเชื่อมโยงกับรายการอื่น กรุณาจัดการข้อมูลที่อ้างอิงก่อน"
    });
  }

  if (error.message.includes("UNIQUE constraint failed")) {
    return res.status(400).json({
      error: "ข้อมูลซ้ำ กรุณาตรวจสอบชื่อทีม ชื่อผู้เล่น อีเมล หรือรหัสอุปกรณ์"
    });
  }

  if (
    error.message.includes("CHECK constraint failed") ||
    error.message.includes("NOT NULL constraint failed")
  ) {
    return res.status(400).json({
      error: "ข้อมูลไม่ผ่านเงื่อนไขความถูกต้องของฐานข้อมูล"
    });
  }

  const status = error.status || 500;

  res.status(status).json({
    error: status >= 500 ? "เกิดข้อผิดพลาดภายในระบบ" : error.message
  });
});

app.listen(PORT, () => {
  console.log(`Esports Team Manager: http://localhost:${PORT}`);
  console.log(`Database: ${databasePath}`);
});
