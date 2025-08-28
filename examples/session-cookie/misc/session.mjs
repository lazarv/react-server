import { randomBytes } from "node:crypto";

export const cookieName = "loginSession";
export const password = randomBytes(32).toString("hex");
