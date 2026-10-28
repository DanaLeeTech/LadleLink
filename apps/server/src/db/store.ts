import Database from "better-sqlite3";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExportPayload, MeasurementPrefs, Recipe, RecipeInput } from "@ladlelink/types";
import { DEFAULT_MEASUREMENT_PREFS } from "@ladlelink/types";
import { v4 as uuid } from "uuid";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface DbPaths {
  dataDir: string;
  dbPath: string;
  photosDir: string;
}

export function resolvePaths(dataDir: string): DbPaths {
  const photosDir = join(dataDir, "photos");
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(photosDir, { recursive: true });
  return {
    dataDir,
    dbPath: join(dataDir, "recipes.db"),
    photosDir,
  };
}

export function openDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const migrationsDir = join(__dirname, "migrations");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied = new Set(
    db.prepare("SELECT id FROM schema_migrations").all().map((r) => (r as { id: string }).id)
  );

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(migrationsDir, file), "utf8");
    const run = db.transaction(() => {
      db.exec(sql);
      db.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(
        file,
        new Date().toISOString()
      );
    });
    run();
  }

  // Seed measurement prefs if missing
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get("measurement") as
    | { value: string }
    | undefined;
  if (!row) {
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(
      "measurement",
      JSON.stringify(DEFAULT_MEASUREMENT_PREFS)
    );
  }
}

interface RecipeRow {
  id: string;
  title: string;
  servings: number;
  steps: string;
  ingredients: string;
  sections: string | null;
  tags: string;
  notes: string | null;
  photo_path: string | null;
  image_url: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    title: row.title,
    servings: row.servings,
    steps: JSON.parse(row.steps),
    ingredients: JSON.parse(row.ingredients),
    sections: row.sections ? JSON.parse(row.sections) : undefined,
    tags: JSON.parse(row.tags),
    notes: row.notes,
    photoPath: row.photo_path,
    imageUrl: row.image_url,
    sourceUrl: row.source_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class RecipeStore {
  constructor(private db: Database.Database) {}

  list(query?: string, tag?: string): Recipe[] {
    let rows = this.db.prepare("SELECT * FROM recipes ORDER BY updated_at DESC").all() as RecipeRow[];
    let recipes = rows.map(rowToRecipe);
    if (query) {
      const q = query.toLowerCase();
      recipes = recipes.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          r.tags.some((t) => t.toLowerCase().includes(q)) ||
          r.ingredients.some((i) => i.name.toLowerCase().includes(q))
      );
    }
    if (tag) {
      const t = tag.toLowerCase();
      recipes = recipes.filter((r) => r.tags.some((x) => x.toLowerCase() === t));
    }
    return recipes;
  }

  get(id: string): Recipe | null {
    const row = this.db.prepare("SELECT * FROM recipes WHERE id = ?").get(id) as RecipeRow | undefined;
    return row ? rowToRecipe(row) : null;
  }

  create(input: RecipeInput): Recipe {
    const now = new Date().toISOString();
    const recipe: Recipe = {
      id: uuid(),
      title: input.title,
      servings: input.servings,
      steps: input.steps,
      ingredients: input.ingredients,
      sections: input.sections?.length ? input.sections : undefined,
      tags: input.tags ?? [],
      notes: input.notes ?? null,
      photoPath: input.photoPath ?? null,
      imageUrl: input.imageUrl ?? null,
      sourceUrl: input.sourceUrl ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.db
      .prepare(
        `INSERT INTO recipes
        (id, title, servings, steps, ingredients, sections, tags, notes, photo_path, image_url, source_url, created_at, updated_at)
        VALUES (@id, @title, @servings, @steps, @ingredients, @sections, @tags, @notes, @photo_path, @image_url, @source_url, @created_at, @updated_at)`
      )
      .run({
        id: recipe.id,
        title: recipe.title,
        servings: recipe.servings,
        steps: JSON.stringify(recipe.steps),
        ingredients: JSON.stringify(recipe.ingredients),
        sections: JSON.stringify(recipe.sections ?? []),
        tags: JSON.stringify(recipe.tags),
        notes: recipe.notes,
        photo_path: recipe.photoPath,
        image_url: recipe.imageUrl,
        source_url: recipe.sourceUrl,
        created_at: recipe.createdAt,
        updated_at: recipe.updatedAt,
      });
    return recipe;
  }

  update(id: string, input: RecipeInput): Recipe | null {
    const existing = this.get(id);
    if (!existing) return null;
    const now = new Date().toISOString();
    const recipe: Recipe = {
      ...existing,
      title: input.title,
      servings: input.servings,
      steps: input.steps,
      ingredients: input.ingredients,
      sections: input.sections ?? existing.sections,
      tags: input.tags ?? [],
      notes: input.notes ?? null,
      photoPath: input.photoPath !== undefined ? input.photoPath : existing.photoPath,
      imageUrl: input.imageUrl !== undefined ? input.imageUrl : existing.imageUrl,
      sourceUrl: input.sourceUrl !== undefined ? input.sourceUrl : existing.sourceUrl,
      updatedAt: now,
    };
    this.db
      .prepare(
        `UPDATE recipes SET
          title = @title,
          servings = @servings,
          steps = @steps,
          ingredients = @ingredients,
          sections = @sections,
          tags = @tags,
          notes = @notes,
          photo_path = @photo_path,
          image_url = @image_url,
          source_url = @source_url,
          updated_at = @updated_at
        WHERE id = @id`
      )
      .run({
        id,
        title: recipe.title,
        servings: recipe.servings,
        steps: JSON.stringify(recipe.steps),
        ingredients: JSON.stringify(recipe.ingredients),
        sections: JSON.stringify(recipe.sections ?? []),
        tags: JSON.stringify(recipe.tags),
        notes: recipe.notes,
        photo_path: recipe.photoPath,
        image_url: recipe.imageUrl,
        source_url: recipe.sourceUrl,
        updated_at: recipe.updatedAt,
      });
    return recipe;
  }

  delete(id: string): boolean {
    const result = this.db.prepare("DELETE FROM recipes WHERE id = ?").run(id);
    return result.changes > 0;
  }

  getMeasurementPrefs(): MeasurementPrefs {
    const row = this.db.prepare("SELECT value FROM settings WHERE key = ?").get("measurement") as
      | { value: string }
      | undefined;
    if (!row) return { ...DEFAULT_MEASUREMENT_PREFS };
    return { ...DEFAULT_MEASUREMENT_PREFS, ...JSON.parse(row.value) };
  }

  setMeasurementPrefs(prefs: MeasurementPrefs): MeasurementPrefs {
    const merged = { ...DEFAULT_MEASUREMENT_PREFS, ...prefs };
    this.db
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      )
      .run("measurement", JSON.stringify(merged));
    return merged;
  }

  exportAll(): ExportPayload {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      recipes: this.list(),
      settings: { measurement: this.getMeasurementPrefs() },
    };
  }

  importAll(payload: ExportPayload, mode: "merge" | "replace" = "merge"): { imported: number } {
    const run = this.db.transaction(() => {
      if (mode === "replace") {
        this.db.prepare("DELETE FROM recipes").run();
      }
      let imported = 0;
      for (const recipe of payload.recipes ?? []) {
        const existing = this.get(recipe.id);
        if (!existing) {
          this.db
            .prepare(
              `INSERT INTO recipes
              (id, title, servings, steps, ingredients, sections, tags, notes, photo_path, image_url, source_url, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .run(
              recipe.id,
              recipe.title,
              recipe.servings,
              JSON.stringify(recipe.steps),
              JSON.stringify(recipe.ingredients),
              JSON.stringify(recipe.sections ?? []),
              JSON.stringify(recipe.tags ?? []),
              recipe.notes ?? null,
              recipe.photoPath ?? null,
              recipe.imageUrl ?? null,
              recipe.sourceUrl ?? null,
              recipe.createdAt,
              recipe.updatedAt
            );
          imported++;
        } else if (recipe.updatedAt > existing.updatedAt) {
          this.update(recipe.id, {
            title: recipe.title,
            servings: recipe.servings,
            steps: recipe.steps,
            ingredients: recipe.ingredients,
            sections: recipe.sections,
            tags: recipe.tags,
            notes: recipe.notes,
            photoPath: recipe.photoPath,
            imageUrl: recipe.imageUrl,
            sourceUrl: recipe.sourceUrl,
          });
          // Preserve imported timestamps for LWW fidelity
          this.db
            .prepare("UPDATE recipes SET updated_at = ?, created_at = ? WHERE id = ?")
            .run(recipe.updatedAt, recipe.createdAt, recipe.id);
          imported++;
        }
      }
      if (payload.settings?.measurement) {
        this.setMeasurementPrefs(payload.settings.measurement);
      }
      return imported;
    });
    return { imported: run() };
  }
}
