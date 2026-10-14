// Runner names made up for a player: the welcome's dice, and the server when a new account
// would otherwise inherit a name another account wears (a second wallet on the same browser).
export const NAME_PARTS = [
  ['Night', 'Neon', 'Ghost', 'Rogue', 'Silent', 'Lucky', 'Crypto', 'Shadow', 'Iron', 'Wild', 'Frost', 'Hex'],
  ['Fox', 'Raven', 'Wolf', 'Viper', 'Runner', 'Hawk', 'Tiger', 'Bandit', 'Jackal', 'Lynx', 'Cobra', 'Mantis'],
];
const pick = (a, rnd) => a[Math.floor(rnd() * a.length)];
export const randomRunnerName = (rnd = Math.random) => `${pick(NAME_PARTS[0], rnd)}${pick(NAME_PARTS[1], rnd)}${Math.floor(rnd() * 90 + 10)}`;
