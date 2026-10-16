// Used when the AI can't write a puzzle. Values are in each property's base unit.
export const FALLBACK = [
  // tier 1: easy
  { tier: 1, smallItem: 'a paperclip', smallValue: 0.001, bigItem: 'an adult African elephant', bigValue: 6000, property: 'weight', note: 'a large dog, a person, a vending machine' },
  { tier: 1, smallItem: 'a coffee mug', smallValue: 0.095, bigItem: 'Mount Everest', bigValue: 8849, property: 'height', note: 'a house, a giraffe, a telephone pole' },
  { tier: 1, smallItem: 'a garden snail', smallValue: 0.013, bigItem: 'a cruising passenger jet', bigValue: 250, property: 'speed', note: 'a jogger, a bicycle, a horse trotting' },
  { tier: 1, smallItem: 'a pack of gum', smallValue: 1.5, bigItem: 'a Boeing 747', bigValue: 400000000, property: 'price', note: 'a used car, a year of college, a speedboat' },
  { tier: 1, smallItem: 'a grain of rice', smallValue: 0.006, bigItem: 'a blue whale', bigValue: 30, property: 'length', note: 'a pencil, a cat, a skateboard' },
  { tier: 1, smallItem: 'a house cat', smallValue: 4.5, bigItem: 'a blue whale', bigValue: 150000, property: 'weight', note: 'a dairy cow, a grand piano, a moose' },
  // tier 2: medium
  { tier: 2, smallItem: 'a teaspoon', smallValue: 0.005, bigItem: 'an Olympic swimming pool', bigValue: 2500000, property: 'volume', note: 'a bathtub, a trash can, a water heater' },
  { tier: 2, smallItem: 'Iceland', smallValue: 390000, bigItem: 'India', bigValue: 1440000000, property: 'population', note: 'Chicago, Switzerland, Los Angeles' },
  { tier: 2, smallItem: 'a marathon', smallValue: 42195, bigItem: 'the trip from Earth to the Moon', bigValue: 384400000, property: 'distance', note: 'London to Paris, crossing Texas' },
  { tier: 2, smallItem: 'a minivan', smallValue: 7, bigItem: 'Michigan Stadium', bigValue: 107601, property: 'capacity', note: 'a movie theater, a jumbo jet, a concert hall' },
  { tier: 2, smallItem: 'a sneeze', smallValue: 0.5, bigItem: 'a full night of sleep', bigValue: 28800, property: 'duration', note: 'a song, a TV episode, a coffee break' },
  // tier 3: hard
  { tier: 3, smallItem: 'an adult mayfly', smallValue: 0.0027, bigItem: 'a Greenland shark', bigValue: 400, property: 'lifespan', note: 'a hamster, a dog, a goldfish' },
  { tier: 3, smallItem: 'a postage stamp', smallValue: 0.0005, bigItem: 'a tennis court', bigValue: 261, property: 'area', note: 'a pizza box, a door, a bedsheet' },
  { tier: 3, smallItem: 'a smartphone charger', smallValue: 20, bigItem: 'a commercial wind turbine', bigValue: 3000000, property: 'power', note: 'a microwave, a hair dryer, a car engine at idle' },
  { tier: 3, smallItem: 'a haiku', smallValue: 12, bigItem: 'the Harry Potter series', bigValue: 1084000, property: 'words', note: 'a newspaper article, a short story, a picture book' },
  { tier: 3, smallItem: 'a grilled cheese sandwich', smallValue: 360, bigItem: 'a cruise ship', bigValue: 63000000, property: 'build', note: 'a car on an assembly line, a house, a quilt' }
];
