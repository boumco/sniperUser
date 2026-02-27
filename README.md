<p align="center">
  <img src="https://img.shields.io/badge/Node.js-18+-green?style=flat-square&logo=node.js" alt="Node" />
  <img src="https://img.shields.io/badge/license-ISC-blue?style=flat-square" alt="License" />
</p>

# SniperUser

Scanner de pseudos Discord (3 et 4 caractères) : génère toutes les combinaisons, vérifie la dispo, envoie les **disponibles** sur un webhook. Rotation de proxies, gestion du rate limit.

<div align="center">

**⭐ Un projet utile ? Mets une étoile pour le soutenir.**  
[![GitHub stars](https://img.shields.io/github/stars/boumco/sniperUser?style=social)](https://github.com/boumco/sniperUser)

</div>

---

### Install

```bash
git clone https://github.com/boumco/sniperUser.git && cd sniperUser
npm install
```

### Config

- **`.env`** — Copie `.env.example`, renseigne au minimum `DISCORD_WEBHOOK_URL`. Optionnel : `USERNAME_CHARSET`, `USERNAME_MIN_LENGTH`, `USERNAME_MAX_LENGTH`, `SLEEP_BETWEEN_CHECKS`.
- **`proxies.txt`** (optionnel) — Un proxy par ligne (`http://...`, `host:port`). Rotation auto, proxies morts exclus.

### Run

```bash
node main.js
```

Génère `usernames_3_4.txt`, parcourt la liste en boucle : `[TAKEN]` / `[OPEN]` en console, envoi webhook si OPEN. **Ctrl+C** pour arrêter.

---

*Usage éducatif. Responsabilité utilisateur. Ne pas commiter `.env`.*
