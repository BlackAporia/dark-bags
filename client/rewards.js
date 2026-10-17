// What a PvE mode pays, shown before you play: cards with the thing itself (the runner in the
// outfit, the gun in its finish, the style item) and its name and rarity; tap one for a big look.
// The Descent, the story operations and Zombies all use it, in the lobby and on the result.
import { OUTFIT, WSKIN, RARITIES } from '../shared/cosmetics.js';
import { STYLE } from '../shared/style.js';
import { figureStill } from './stickman.js';
import { weaponStill } from './locker.js';
import { styleStill } from './flair.js';
import { t } from './i18n.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const itemOf = (it) => (it.k === 'outfit' ? OUTFIT[it.id] : it.k === 'wskin' ? WSKIN[it.id] : STYLE[it.id]);
export const itemKind = (it) => (it.k === 'outfit' ? t('dx.kOutfit') : it.k === 'wskin' ? t('dx.kSkin') : t(`dx.k.${STYLE[it.id]?.kind ?? 'frame'}`));

// the item's picture as an image URL, sized for a card (big: the close look)
function art(it, big = false) {
  if (it.k === 'outfit') return figureStill({ outfit: it.id, body: OUTFIT[it.id]?.body ?? 'm' }, big ? 180 : 72, big ? 250 : 100);
  if (it.k === 'wskin') return weaponStill(it.id, big ? 300 : 110, big ? 180 : 70);
  return styleStill(it.id, big ? 300 : 110, big ? 170 : 64);
}

/**
 * Reward cards. items: [{ k, id, ... }]; owned(it) marks what you have; tag(it) adds a line
 * (where it comes from: a floor, a wave, a difficulty).
 */
export function rewardCards(items, { owned = () => false, tag = () => '', only = '' } = {}) {
  if (!items.length) return '';
  return `<ul class="rw-cards" data-only="${esc(only)}">${items
    .map((it) => {
      const x = itemOf(it);
      const r = x?.rarity ?? 'rare';
      const got = owned(it);
      const tg = tag(it);
      return `<li><button type="button" class="rw-card${got ? ' got' : ''}" data-k="${it.k}" data-id="${esc(it.id)}" data-tag="${esc(tg)}" style="--rc:${RARITIES[r]?.color ?? '#fff'}" aria-label="${esc(x?.name ?? it.id)}">
        <span class="rw-art${it.k === 'outfit' ? ' fig' : ''}"><img src="${art(it)}" alt="" loading="lazy"></span>
        <b>${esc(x?.name ?? it.id)}</b><small>${esc(itemKind(it))} · <em>${esc(t(`r.${r}`))}</em></small>${tg ? `<i>${esc(tg)}</i>` : ''}${got ? `<span class="rw-got">✓ ${esc(t('rw.owned'))}</span>` : ''}
      </button></li>`;
    })
    .join('')}</ul>`;
}

// the close look: the item big, its name, rarity and where it comes from
let modal = null;
export function showReward(it, { tag = '', only = '' } = {}) {
  if (!modal) {
    modal = document.createElement('div');
    modal.className = 'rw-modal';
    modal.hidden = true;
    modal.innerHTML = '<div class="rw-box" role="dialog" aria-modal="true"><button type="button" class="rw-x" aria-label="Close">✕</button><div class="rw-big"></div><p class="eyebrow rw-kind"></p><h3></h3><p class="rw-tag"></p><p class="rw-only"></p></div>';
    document.body.append(modal);
    const close = () => (modal.hidden = true);
    modal.addEventListener('click', (e) => e.target === modal && close());
    modal.querySelector('.rw-x').addEventListener('click', close);
    addEventListener('keydown', (e) => e.key === 'Escape' && close());
  }
  const x = itemOf(it);
  const r = x?.rarity ?? 'rare';
  modal.style.setProperty('--rc', RARITIES[r]?.color ?? '#fff');
  modal.querySelector('.rw-big').innerHTML = `<img src="${art(it, true)}" alt="">`;
  modal.querySelector('.rw-big').classList.toggle('fig', it.k === 'outfit');
  modal.querySelector('.rw-kind').textContent = `${itemKind(it)} · ${t(`r.${r}`)}`;
  modal.querySelector('h3').textContent = x?.name ?? it.id;
  modal.querySelector('.rw-tag').textContent = tag;
  modal.querySelector('.rw-only').textContent = only;
  modal.hidden = false;
}

// wire every reward card inside root to the close look (each card carries its item)
export function wireRewards(root) {
  for (const b of root?.querySelectorAll('.rw-card[data-k]') ?? []) {
    if (b.dataset.wired) continue;
    b.dataset.wired = '1';
    b.addEventListener('click', () => showReward({ k: b.dataset.k, id: b.dataset.id }, { tag: b.dataset.tag, only: b.closest('.rw-cards')?.dataset.only ?? '' }));
  }
}

// owned, from the locker's lists
export const ownedIn = (L) => (it) => !!L && ((it.k === 'outfit' ? L.owned : it.k === 'wskin' ? L.wowned : L.sowned) ?? []).includes(it.id);
