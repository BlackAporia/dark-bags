// Arms Race: everyone enters equal (knife, 100 HP). Experience moves you up the
// ladder one weapon at a time; after the laser sniper you start over at the pistol (the knife
// is only for the start of a match), and in the respawn modes every death costs one step.
// A counter-strike style arsenal: pistols, shotguns, SMGs, rifles, a machine gun and
// snipers. Every gun has a magazine and reloads by itself, on PC and phone alike: at once
// when it runs dry, or after a short pause in the shooting when it is half empty. For
// those seconds you cannot shoot. snd: the gunshot family it sounds like; pitch
// shifts it so each gun is recognisable.

export const WEAPONS = [
  { id: 'knife', name: 'Knife', melee: true, dmg: 50, reach: 44, arc: 1.9, cd: 0.42 },
  { id: 'pistol', name: 'Pistol', dmg: 24, cd: 0.3, speed: 1000, range: 380, spread: 0.035, pellets: 1, mag: 15, reload: 1.3, snd: 'pistol' },
  { id: 'deagle', name: 'Hand Cannon', dmg: 46, cd: 0.55, speed: 1300, range: 440, spread: 0.03, pellets: 1, mag: 7, reload: 1.7, snd: 'pistol', pitch: 0.72, heavy: true },
  { id: 'shotgun', name: 'Shotgun', dmg: 13, cd: 0.8, speed: 900, range: 400, spread: 0.34, pellets: 7, mag: 6, reload: 2.4, snd: 'shotgun', heavy: true },
  { id: 'autoshotgun', name: 'Auto Shotgun', dmg: 10, cd: 0.34, speed: 900, range: 390, spread: 0.3, pellets: 6, mag: 7, reload: 2.8, snd: 'shotgun', pitch: 1.12, heavy: true },
  { id: 'smg', name: 'SMG', dmg: 11, cd: 0.085, speed: 950, range: 470, spread: 0.13, pellets: 1, mag: 30, reload: 1.7, snd: 'smg' },
  { id: 'pdw', name: 'PDW', dmg: 9, cd: 0.066, speed: 950, range: 450, spread: 0.16, pellets: 1, mag: 50, reload: 2.5, snd: 'smg', pitch: 1.15 },
  { id: 'rifle', name: 'Rifle', dmg: 18, cd: 0.11, speed: 1100, range: 640, spread: 0.06, pellets: 1, mag: 30, reload: 2.3, snd: 'rifle' },
  { id: 'carbine', name: 'Carbine', dmg: 15, cd: 0.095, speed: 1150, range: 680, spread: 0.04, pellets: 1, mag: 30, reload: 2.0, snd: 'rifle', pitch: 1.12 },
  { id: 'scout', name: 'Scout', dmg: 70, cd: 0.95, speed: 2200, range: 960, spread: 0.006, pellets: 1, mag: 10, reload: 2.2, snd: 'sniper', pitch: 1.25, heavy: true },
  { id: 'lmg', name: 'Machine Gun', dmg: 14, cd: 0.075, speed: 1050, range: 620, spread: 0.11, pellets: 1, mag: 100, reload: 4.2, snd: 'rifle', pitch: 0.85 },
  { id: 'magnum', name: 'Magnum Sniper', dmg: 100, cd: 1.45, speed: 2600, range: 1150, spread: 0.003, pellets: 1, mag: 5, reload: 3.1, snd: 'sniper', pitch: 0.85, heavy: true },
  { id: 'sniper', name: 'Laser sniper', dmg: 95, cd: 1.25, speed: 2400, range: 1250, spread: 0.004, pellets: 1, laser: true, mag: 6, reload: 2.8, snd: 'sniper', heavy: true },
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

// Range (how far a round flies and still hurts) climbs with the class: the pistol reaches the
// shortest, shotguns and SMGs a little further, rifles and the machine gun mid-range, and
// the snipers furthest of all (the laser sniper the furthest).

// Engagement distance bots try to hold with each weapon.
export const BOT_RANGE = { knife: 0, pistol: 280, deagle: 320, shotgun: 140, autoshotgun: 130, smg: 220, pdw: 200, rifle: 300, carbine: 320, scout: 420, lmg: 300, magnum: 450, sniper: 430 };
