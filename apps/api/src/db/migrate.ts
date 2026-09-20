import { loadConfig } from "../config.js";
import { connectDb } from "./client.js";

const cfg = loadConfig();
const handle = await connectDb(cfg.DATABASE_URL);
await handle.close();
console.log("Migreringar klara.");
