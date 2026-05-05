#!/usr/bin/env node
import { randomBytes, scrypt as scryptCallback } from "node:crypto"
import readline from "node:readline/promises"
import { promisify } from "node:util"

const scrypt = promisify(scryptCallback)

async function readPassword() {
    if (process.argv[2]) return process.argv[2]
    if (process.env.DRAWIO_PASSWORD) return process.env.DRAWIO_PASSWORD

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    })
    try {
        return await rl.question("Password: ")
    } finally {
        rl.close()
    }
}

const password = await readPassword()
if (!password) {
    console.error("Password is required")
    process.exit(1)
}

const salt = randomBytes(16)
const derived = await scrypt(password, salt, 64)
console.log(
    `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`,
)
