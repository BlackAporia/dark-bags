// Arms Race: everyone enters equal (knife, 100 HP). Experience moves you up the
// ladder one weapon at a time; after the laser sniper you wrap back to the knife.

export const WEAPONS = [
  { id: 'knife', name: 'Knife', melee: true, dmg: 50, reach: 44, arc: 1.9, cd: 0.42 },
  { id: 'pistol', name: 'Pistol', dmg: 24, cd: 0.3, speed: 1000, range: 520, spread: 0.035, pellets: 1 },
  { id: 'shotgun', name: 'Shotgun', dmg: 13, cd: 0.8, speed: 900, range: 300, spread: 0.34, pellets: 7 },
  { id: 'smg', name: 'SMG', dmg: 11, cd: 0.085, speed: 950, range: 420, spread: 0.13, pellets: 1 },
  { id: 'rifle', name: 'Rifle', dmg: 17, cd: 0.12, speed: 1100, range: 620, spread: 0.055, pellets: 1 },
  { id: 'sniper', name: 'Laser sniper', dmg: 95, cd: 1.25, speed: 2400, range: 1100, spread: 0.004, pellets: 1, laser: true },
];

export const XP_PER_LEVEL = 100;
export const XP = {
  kill: 100, // one kill = one weapon up
  botOnBot: 35, // bots farming each other climb three times slower
  botOnBotDamage: 0.4, // multiplier on damage xp when a bot hits a bot
  damage: 0.4, // per hp of damage dealt
  loot: [1, 3, 12], // per orb tier picked up (small: kills are what climb the ladder)
  bag: 20, // opening someone's dropped bag
};

// Engagement distance bots try to hold with each weapon.
export const BOT_RANGE = { knife: 0, pistol: 280, shotgun: 140, smg: 220, rifle: 300, sniper: 430 };
