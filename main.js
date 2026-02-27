const fs = require("fs");
const path = require("path");
const axios = require("axios");
const chalk = require("chalk");
const { HttpsProxyAgent } = require("https-proxy-agent");
require("dotenv").config();

class ProxyManager {
  constructor(filepath) {
    this.proxies = this._load(filepath);
    this.index = 0;
    this.deadProxies = new Set();

    if (this.proxies.length === 0) {
      console.log(chalk.yellow("[WARN]") + " No proxies loaded – running without proxy.");
    } else {
      console.log(chalk.cyan(`[PROXY]`) + ` Loaded ${this.proxies.length} proxies.`);
    }
  }

  _load(filepath) {
    if (!fs.existsSync(filepath)) return [];
    return fs
      .readFileSync(filepath, "utf-8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
  }

  current() {
    const alive = this._alive();
    if (alive.length === 0) return null;
    return alive[this.index % alive.length];
  }

  next() {
    const alive = this._alive();
    if (alive.length === 0) return null;
    this.index = (this.index + 1) % alive.length;
    const proxy = alive[this.index];
    console.log(chalk.magenta(`[PROXY SWITCH]`) + ` Now using: ${proxy}`);
    return proxy;
  }

  markDead(proxy) {
    if (!proxy) return;
    this.deadProxies.add(proxy);
    console.log(chalk.red(`[PROXY DEAD]`) + ` ${proxy} – removing from rotation.`);
  }

  _alive() {
    return this.proxies.filter((p) => !this.deadProxies.has(p));
  }

  get aliveCount() {
    return this._alive().length;
  }
}

function loadConfig() {
  const webhookUrl = (process.env.DISCORD_WEBHOOK_URL || "").trim();
  const charset = process.env.USERNAME_CHARSET || "abcdefghijklmnopqrstuvwxyz0123456789";
  const minLength = parseInt(process.env.USERNAME_MIN_LENGTH || "3", 10);
  const maxLength = parseInt(process.env.USERNAME_MAX_LENGTH || "4", 10);
  const sleepBetweenChecks = parseFloat(process.env.SLEEP_BETWEEN_CHECKS || "0.2");

  if (!webhookUrl) {
    console.log(
      chalk.yellow("[WARN]") +
        " No DISCORD_WEBHOOK_URL in .env – open usernames will NOT be sent anywhere."
    );
  }

  if (minLength < 3 || maxLength > 4) {
    console.log(
      chalk.yellow("[WARN]") +
        " This tool is designed for length 3 and 4. Values outside that range may be very slow."
    );
  }

  return { webhookUrl, charset, minLength, maxLength, sleepBetweenChecks };
}

function generateUsernames(charset, minLength, maxLength) {
  const results = [];

  function backtrack(prefix, length) {
    if (prefix.length === length) {
      results.push(prefix);
      return;
    }
    for (const ch of charset) {
      backtrack(prefix + ch, length);
    }
  }

  for (let length = minLength; length <= maxLength; length++) {
    backtrack("", length);
  }

  return results;
}

function writeUsernamesToFile(filepath, usernames) {
  fs.writeFileSync(filepath, usernames.join("\n") + "\n", { encoding: "utf-8" });
}

function readUsernamesFromFile(filepath) {
  const content = fs.readFileSync(filepath, { encoding: "utf-8" });
  return content
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

async function sendWebhook(webhookUrl, username) {
  if (!webhookUrl) return;

  const payload = {
    content: `Found available username: \`${username}\``,
    username: "Spidey Bot",
  };

  try {
    await axios.post(webhookUrl, payload, { timeout: 10000 });
  } catch (err) {
    console.log(
      chalk.yellow("[WEBHOOK ERROR]") +
        ` Failed to send username '${username}': ${err.message}`
    );
  }
}

async function isUsernameTaken(username, proxyManager) {
  const MAX_PROXY_RETRIES = 5;
  let proxyRetries = 0;

  while (true) {
    const proxy = proxyManager.current();

    const config = {
      timeout: 8000,
      headers: {
        "Content-Type": "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      },
    };

    if (proxy) {
      const proxyUrl = proxy.startsWith("http") ? proxy : `http://${proxy}`;
      config.httpsAgent = new HttpsProxyAgent(proxyUrl);
      config.proxy = false;
    }

    try {
      const response = await axios.post(
        "https://discord.com/api/v10/unique-username/username-attempt-unauthed",
        { username },
        config
      );

      return response.data?.taken === true;

    } catch (err) {
      const status = err.response?.status;

      if (status === 429) {
        const retryAfter = (err.response.data?.retry_after ?? 2) * 1000;
        console.log(
          chalk.yellow(`[RATE LIMIT]`) +
            ` ${proxy || "no proxy"} – switching proxy (retry in ${retryAfter / 1000}s)...`
        );
        await sleep(retryAfter);
        proxyManager.next();
        continue;
      }

      const isProxyError =
        !status &&
        (err.code === "ECONNREFUSED" ||
          err.code === "ECONNRESET" ||
          err.code === "ETIMEDOUT" ||
          err.code === "ENOTFOUND" ||
          err.message.includes("timeout") ||
          err.message.includes("socket hang up"));

      if (isProxyError) {
        proxyManager.markDead(proxy);
        proxyRetries++;

        if (proxyManager.aliveCount === 0) {
          throw new Error("All proxies are dead. Stopping.");
        }

        if (proxyRetries >= MAX_PROXY_RETRIES) {
          throw new Error(`Too many dead proxies in a row for '${username}'.`);
        }

        proxyManager.next();
        continue;
      }

      throw new Error(`Discord API error for '${username}': ${err.message}`);
    }
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { webhookUrl, charset, minLength, maxLength, sleepBetweenChecks } = loadConfig();

  const proxiesFile = path.join(__dirname, "proxies.txt");
  const proxyManager = new ProxyManager(proxiesFile);

  const usernamesFile = path.join(__dirname, "usernames_3_4.txt");

  console.log(
    chalk.cyan("Generating username list") +
      `\nFile: ${usernamesFile}\nCharset: ${charset}\nLengths: ${minLength} to ${maxLength}\n` +
      `Webhook configured: ${webhookUrl ? "YES" : "NO"}\n`
  );

  const usernames = generateUsernames(charset, minLength, maxLength);
  writeUsernamesToFile(usernamesFile, usernames);

  console.log(chalk.cyan("Username list generated. Starting checks from file...\n"));

  const usernamesFromFile = readUsernamesFromFile(usernamesFile);

  try {
    while (true) {
      for (const username of usernamesFromFile) {
        let taken;
        try {
          taken = await isUsernameTaken(username, proxyManager);
        } catch (err) {
          console.log(chalk.red("[ERROR]") + ` ${username} – ${err.message}`);
          if (err.message.includes("All proxies are dead")) return;
          continue;
        }

        if (taken) {
          console.log(chalk.red("[TAKEN]") + " " + chalk.yellow(username));
        } else {
          console.log(chalk.green("[OPEN]") + " " + chalk.green(username));
          await sendWebhook(webhookUrl, username);
        }

        if (sleepBetweenChecks > 0) {
          await sleep(sleepBetweenChecks * 1000);
        }
      }

      console.log(chalk.cyan("Finished one full pass over username file. Restarting..."));
    }
  } catch (err) {
    console.log(chalk.cyan("\nStopped:"), err.message || err);
  }
}

if (require.main === module) {
  main();
}
