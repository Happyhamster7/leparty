import type { ShopCategory } from '@/components/pixel/shop';

/**
 * Sample shop for the /kit gallery. Drink prices and points are open
 * decisions (docs/halloween-game-design.md, section 11) and the items
 * are placeholders (section 7), so these numbers are illustrative only.
 */
export const SHOP_DEMO: ShopCategory[] = [
  {
    key: 'drinks',
    label: 'Drinks',
    icon: 'mug',
    items: [
      {
        key: 'beer',
        name: 'Beer',
        plural: 'beers',
        icon: 'mug',
        price: 10,
        line: 'Light',
        tag: '+2 pts',
        needsTarget: true,
        stats: [
          { label: 'Points', value: '+2', tone: 'good' },
          { label: 'Strength', value: 'Light' },
        ],
        description: 'Sent to a team, not a person. They choose who drinks it at the bar.',
      },
      {
        key: 'shot',
        name: 'Shot',
        plural: 'shots',
        icon: 'shot',
        price: 15,
        line: 'Strong',
        tag: '+3 pts',
        needsTarget: true,
        stats: [
          { label: 'Points', value: '+3', tone: 'good' },
          { label: 'Strength', value: 'Strong' },
        ],
        description: 'Quick to serve, hard to forget. Points land when the bartender serves it.',
      },
      {
        key: 'cocktail',
        name: 'Cocktail',
        plural: 'cocktails',
        icon: 'cocktail',
        price: 25,
        tag: '+5 pts',
        line: 'Medium',
        needsTarget: true,
        stats: [
          { label: 'Points', value: '+5', tone: 'good' },
          { label: 'Strength', value: 'Medium' },
        ],
        description: 'The bar mixes it to order, so it takes a little longer to come out.',
      },
      {
        key: 'water',
        name: 'Water',
        plural: 'waters',
        icon: 'water',
        price: 5,
        line: 'No alcohol',
        tag: '+1 pt',
        needsTarget: true,
        stats: [
          { label: 'Points', value: '+1', tone: 'good' },
          { label: 'Strength', value: 'None' },
        ],
        description: 'For a team that needs pacing. Still counts as a drink sent.',
      },
    ],
  },
  {
    key: 'items',
    label: 'Items',
    icon: 'chest',
    items: [
      {
        key: 'reflect',
        name: 'Reflect',
        icon: 'shield',
        price: 40,
        tag: '1 a night',
        max: 1,
        stats: [
          { label: 'Effect', value: 'Bounce back' },
          { label: 'Left tonight', value: '1' },
        ],
        description:
          'Every drink aimed at you this round goes back to whoever sent it, and the points go to you. Only one team can play it each round.',
      },
      {
        key: 'eye-spy',
        name: 'Eye Spy',
        icon: 'eye',
        price: 25,
        tag: '1 a round',
        max: 1,
        stats: [
          { label: 'Effect', value: 'See orders' },
          { label: 'Left this round', value: '1' },
        ],
        description: 'Shows a private table of who has sent drinks to whom, round by round, since the start of the night.',
      },
      {
        key: 'mystery',
        name: 'Mystery',
        icon: 'potion',
        price: 30,
        tag: 'Soon',
        soldOut: 'Not yet',
        stats: [
          { label: 'Effect', value: '?' },
          { label: 'Left', value: '0' },
        ],
        description: 'More items are still being designed.',
      },
    ],
  },
];

export const SHOP_TARGETS = ['Block A', 'Block C', 'Block D', 'Block E', 'Block F'];
