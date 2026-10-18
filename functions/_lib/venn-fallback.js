// Venn puzzles used when the AI can't write one. Round 1 lists at least 25 well-known answers for the
// overlap; round 2 at least 8 for the center. `typical` = answers a typical player finds in 90 seconds.
export const VENN_FALLBACK = [
  {
    round: 1, typical: 9, circles: ['Things colored orange', 'Foods people eat'],
    answers: ['orange', 'carrot', 'pumpkin', 'sweet potato', 'cantaloupe', 'mango', 'peach', 'apricot', 'papaya', 'tangerine',
      'butternut squash', 'cheddar cheese', 'Cheetos', 'macaroni and cheese', 'orange bell pepper', 'persimmon', 'salmon', 'Goldfish crackers',
      'nectarine', 'kumquat', 'candy corn', 'pumpkin pie', 'sweet potato fries', 'Cheez-Its', 'Doritos', 'Reese\'s Pieces', 'egg yolk', 'orange juice']
  },
  {
    round: 1, typical: 11, circles: ['Animals', 'Things that can fly'],
    answers: ['eagle', 'bat', 'bee', 'butterfly', 'owl', 'parrot', 'pigeon', 'crow', 'hawk', 'falcon', 'hummingbird', 'seagull', 'duck',
      'goose', 'swan', 'mosquito', 'housefly', 'dragonfly', 'ladybug', 'moth', 'robin', 'sparrow', 'flamingo', 'pelican', 'wasp',
      'blue jay', 'cardinal', 'stork', 'vulture', 'heron', 'bald eagle', 'woodpecker']
  },
  {
    round: 1, typical: 9, circles: ['Things found in a kitchen', 'Things made of metal'],
    answers: ['fork', 'spoon', 'knife', 'pot', 'frying pan', 'toaster', 'kettle', 'whisk', 'can opener', 'ladle', 'cheese grater',
      'baking sheet', 'muffin tin', 'colander', 'refrigerator', 'oven', 'stove', 'sink', 'faucet', 'tongs', 'vegetable peeler',
      'aluminum foil', 'cookie cutter', 'tin can', 'measuring spoons', 'wok', 'cast iron skillet', 'ice cream scoop', 'corkscrew', 'pizza cutter']
  },
  {
    round: 1, typical: 11, circles: ['Things that are round', 'Things you can eat'],
    answers: ['orange', 'apple', 'pizza', 'pancake', 'donut', 'bagel', 'meatball', 'cookie', 'tortilla', 'grape', 'cherry', 'blueberry',
      'pea', 'tomato', 'peach', 'plum', 'watermelon', 'cantaloupe', 'grapefruit', 'lime', 'lemon', 'onion', 'hamburger bun', 'Oreo',
      'pepperoni', 'gumball', 'jawbreaker', 'falafel', 'lollipop', 'cupcake', 'English muffin']
  },
  {
    round: 1, typical: 10, circles: ['Words that start with the letter B', 'Animals'],
    answers: ['bear', 'bee', 'bat', 'beaver', 'bison', 'buffalo', 'butterfly', 'baboon', 'badger', 'barracuda', 'beetle', 'blue jay',
      'bluebird', 'bobcat', 'boar', 'bull', 'bulldog', 'budgie', 'blue whale', 'bald eagle', 'beluga whale', 'black widow spider',
      'buzzard', 'bumblebee', 'bass', 'beagle', 'boa constrictor', 'bunny', 'bloodhound']
  },
  {
    round: 1, typical: 9, circles: ['Famous real people', 'Names that start with the letter M'],
    answers: ['Michael Jackson', 'Madonna', 'Mozart', 'Michael Jordan', 'Magic Johnson', 'Muhammad Ali', 'Marilyn Monroe',
      'Martin Luther King Jr.', 'Mark Zuckerberg', 'Mother Teresa', 'Mahatma Gandhi', 'Michelangelo', 'Morgan Freeman', 'Meryl Streep',
      'Mariah Carey', 'Miley Cyrus', 'Michelle Obama', 'Mike Tyson', 'Malala Yousafzai', 'Marie Curie', 'Mick Jagger', 'Matt Damon',
      'Margaret Thatcher', 'Mao Zedong', 'Martha Stewart', 'Mark Twain', 'Mel Gibson']
  },
  {
    round: 1, typical: 10, circles: ['Things made of wood', 'Furniture'],
    answers: ['chair', 'table', 'desk', 'bookshelf', 'dresser', 'bed frame', 'rocking chair', 'bench', 'stool', 'cabinet', 'wardrobe',
      'nightstand', 'crib', 'coffee table', 'armoire', 'headboard', 'chest', 'bunk bed', 'picnic table', 'coat rack', 'cupboard',
      'Adirondack chair', 'bar stool', 'end table', 'TV stand', 'china cabinet', 'hope chest']
  },
  {
    round: 2, typical: 6, circles: ['Foods people eat', 'Things colored red', 'Things that grow on plants'],
    answers: ['strawberry', 'cherry', 'tomato', 'apple', 'raspberry', 'red bell pepper', 'chili pepper', 'cranberry', 'pomegranate',
      'radish', 'red onion', 'rhubarb', 'red grapes', 'beet', 'kidney bean']
  },
  {
    round: 2, typical: 6, circles: ['Things with wheels', 'Things bigger than a person', 'Things people ride in'],
    answers: ['car', 'bus', 'truck', 'train', 'airplane', 'tractor', 'RV', 'fire truck', 'ambulance', 'limousine', 'golf cart', 'van',
      'taxi', 'tank', 'school bus', 'garbage truck', 'monster truck']
  },
  {
    round: 2, typical: 6, circles: ['Sports', 'Played with a ball', 'Played on a team'],
    answers: ['soccer', 'basketball', 'baseball', 'volleyball', 'American football', 'rugby', 'water polo', 'cricket', 'softball',
      'handball', 'lacrosse', 'field hockey', 'dodgeball', 'kickball']
  },
  {
    round: 2, typical: 5, circles: ['Countries', 'Places in Europe', 'Places on an ocean or sea coast'],
    answers: ['France', 'Spain', 'Italy', 'Portugal', 'Germany', 'United Kingdom', 'Ireland', 'Greece', 'Norway', 'Sweden', 'Denmark',
      'Netherlands', 'Belgium', 'Poland', 'Croatia', 'Finland', 'Iceland']
  },
  {
    round: 2, typical: 6, circles: ['Words that start with the letter S', 'Things found in the ocean', 'Animals'],
    answers: ['shark', 'seal', 'starfish', 'squid', 'sea turtle', 'stingray', 'swordfish', 'sardine', 'salmon', 'sea lion', 'seahorse',
      'snapper', 'sea urchin', 'shrimp', 'sponge', 'sea otter', 'sperm whale', 'scallop']
  },
  {
    round: 2, typical: 5, circles: ['Things that get hot', 'Things found in a kitchen', 'Things that plug into the wall'],
    answers: ['toaster', 'oven', 'microwave', 'electric stove', 'electric kettle', 'toaster oven', 'air fryer', 'coffee maker',
      'waffle iron', 'slow cooker', 'rice cooker', 'electric griddle', 'panini press', 'hot plate', 'dishwasher']
  }
];
