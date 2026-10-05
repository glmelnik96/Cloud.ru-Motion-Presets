// The catalog (spec 7): a search over the titles, the chips of the categories that have items, and the cards. The card
// under the cursor (or with the keyboard focus) plays its preview, muted and looped; the others show the poster.
import { useState } from 'preact/hooks';
import type { Item } from '../core/types';
import { ALL, cardOf, categoryChips, filterItems, type Card } from './catalog';

export interface CatalogProps {
  items: Item[];
  root: string;
  query: string;
  category: string;
  onQuery(query: string): void;
  onCategory(category: string): void;
  onOpen(id: string): void;
}

// The picture of an item: its poster (or a plain tile when it has none), with the preview laid over it while it plays.
// The poster is never taken out of the page: a card that swapped its picture on the pointer's arrival would lose a
// quick click, whose mouse-down landed on the node that left.
export function Thumb({ card, playing }: { card: Card; playing: boolean }) {
  const [broken, setBroken] = useState(false);
  return (
    <>
      {card.poster ? (
        <img class="thumb-media" src={card.poster} alt="" loading="lazy" />
      ) : (
        <span class="thumb-empty" aria-hidden="true">{card.title.slice(0, 1)}</span>
      )}
      {playing && card.preview && !broken ? (
        <video
          class="thumb-media over"
          src={card.preview}
          muted
          loop
          autoPlay
          playsInline
          onError={() => setBroken(true)}
        />
      ) : null}
    </>
  );
}

function CardView({ card, onOpen }: { card: Card; onOpen(id: string): void }) {
  const [hot, setHot] = useState(false);
  return (
    <li>
      <button
        type="button"
        class="card"
        onClick={() => onOpen(card.id)}
        onMouseEnter={() => setHot(true)}
        onMouseLeave={() => setHot(false)}
        onFocus={() => setHot(true)}
        onBlur={() => setHot(false)}
      >
        <span class="thumb"><Thumb card={card} playing={hot} /></span>
        <span class="card-title">{card.title}</span>
        {card.formats ? <span class="card-meta">{card.formats}</span> : null}
      </button>
    </li>
  );
}

export function Catalog({ items, root, query, category, onQuery, onCategory, onOpen }: CatalogProps) {
  const chips = categoryChips(items);
  const shown = filterItems(items, query, category);
  return (
    <section class="catalog">
      <div class="search-wrap">
        <input
          class="input search"
          type="search"
          value={query}
          placeholder="Поиск по названию"
          aria-label="Поиск по названию"
          autoComplete="off"
          spellcheck={false}
          onInput={(e) => onQuery(e.currentTarget.value)}
        />
        {query ? <button type="button" class="clear" aria-label="Очистить поиск" onClick={() => onQuery('')}>×</button> : null}
      </div>
      {chips.length > 0 ? (
        <div class="chips" role="group" aria-label="Категории">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              class={'chip' + (c.key === category ? ' on' : '')}
              aria-pressed={c.key === category}
              onClick={() => onCategory(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
      ) : null}
      {items.length === 0 ? (
        <p class="empty">В библиотеке нет шаблонов для этого приложения.</p>
      ) : shown.length === 0 ? (
        <p class="empty">
          Ничего не найдено.
          {query || category !== ALL ? (
            <>
              {' '}
              <button type="button" class="link" onClick={() => { onQuery(''); onCategory(ALL); }}>Показать всё</button>
            </>
          ) : null}
        </p>
      ) : (
        <ul class="grid">
          {shown.map((it) => <CardView key={it.id} card={cardOf(it, root)} onOpen={onOpen} />)}
        </ul>
      )}
    </section>
  );
}
