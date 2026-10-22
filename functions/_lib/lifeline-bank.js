// Lifeline's built-in days: used when a day has nothing approved and no draft. Each pair was checked against
// the built-in people list (lifeline-people.js); `examples` are the best-known people alive for both events.
export const BANK = [
  [
    {"round":1,"a":{"label":"The attack on Pearl Harbor","date":"1941-12-07","prec":11},"b":{"label":"The Apollo 11 Moon landing","date":"1969-07-20","prec":11},"examples":["Ronald Reagan","Nelson Mandela","Pablo Picasso"]},
    {"round":2,"a":{"label":"The Battle of Waterloo","date":"1815-06-18","prec":11},"b":{"label":"The assassination of Abraham Lincoln","date":"1865-04-14","prec":11},"examples":["Abraham Lincoln","Charles Darwin","Victor Hugo"]},
    {"round":3,"a":{"label":"The Treaty of Utrecht is signed","date":"1713-04-11","prec":11},"b":{"label":"The Boston Tea Party","date":"1773-12-16","prec":11},"examples":["Voltaire","Jean-Jacques Rousseau","Benjamin Franklin"]}
  ],
  [
    {"round":1,"a":{"label":"Sputnik 1 is launched","date":"1957-10-04","prec":11},"b":{"label":"The fall of the Berlin Wall","date":"1989-11-09","prec":11},"examples":["Donald Trump","Vladimir Putin","Ronald Reagan"]},
    {"round":2,"a":{"label":"The sinking of the Titanic","date":"1912-04-15","prec":11},"b":{"label":"The assassination of John F. Kennedy","date":"1963-11-22","prec":11},"examples":["Ronald Reagan","Pablo Picasso","Winston Churchill"]},
    {"round":3,"a":{"label":"The Gunpowder Plot is foiled","date":"1605-11-05","prec":11},"b":{"label":"King Charles I is executed","date":"1649-01-30","prec":11},"examples":["René Descartes","Thomas Hobbes","Oliver Cromwell"]}
  ],
  [
    {"round":1,"a":{"label":"The Wall Street Crash (Black Tuesday)","date":"1929-10-29","prec":11},"b":{"label":"The Beatles play The Ed Sullivan Show","date":"1964-02-09","prec":11},"examples":["Ronald Reagan","Nelson Mandela","Pablo Picasso"]},
    {"round":2,"a":{"label":"Darwin publishes On the Origin of Species","date":"1859-11-24","prec":11},"b":{"label":"Lindbergh lands in Paris after the first solo transatlantic flight","date":"1927-05-21","prec":11},"examples":["Thomas Edison","Sigmund Freud","Nikola Tesla"]},
    {"round":3,"a":{"label":"King Charles I is executed","date":"1649-01-30","prec":11},"b":{"label":"Newton publishes the Principia","date":"1687-07-05","prec":11},"examples":["Isaac Newton","John Locke","Gottfried Wilhelm Leibniz"]}
  ],
  [
    {"round":1,"a":{"label":"Archduke Franz Ferdinand is assassinated","date":"1914-06-28","prec":11},"b":{"label":"India becomes independent","date":"1947-08-15","prec":11},"examples":["Albert Einstein","Ronald Reagan","Mahatma Gandhi"]},
    {"round":2,"a":{"label":"The Eiffel Tower is inaugurated","date":"1889-03-31","prec":11},"b":{"label":"The coronation of Elizabeth II","date":"1953-06-02","prec":11},"examples":["Albert Einstein","Pablo Picasso","Winston Churchill"]},
    {"round":3,"a":{"label":"The Great Fire of London begins","date":"1666-09-02","prec":11},"b":{"label":"Peter the Great founds Saint Petersburg","date":"1703-05-27","prec":11},"examples":["Isaac Newton","John Locke","Gottfried Wilhelm Leibniz"]}
  ],
  [
    {"round":1,"a":{"label":"Brown v. Board of Education is decided","date":"1954-05-17","prec":11},"b":{"label":"Nelson Mandela walks out of prison","date":"1990-02-11","prec":11},"examples":["Donald Trump","Vladimir Putin","Ronald Reagan"]},
    {"round":2,"a":{"label":"The Boston Tea Party","date":"1773-12-16","prec":11},"b":{"label":"The coronation of Queen Victoria","date":"1838-06-28","prec":11},"examples":["Andrew Jackson","William Wordsworth","Arthur Wellesley, 1st Duke of Wellington"]},
    {"round":3,"a":{"label":"The Spanish Armada is beaten at Gravelines","date":"1588-08-08","prec":11},"b":{"label":"Galileo is convicted by the Inquisition","date":"1633-06-22","prec":11},"examples":["Galileo Galilei","Thomas Hobbes","Armand-Jean du Plessis, duc de Richelieu"]}
  ],
  [
    {"round":1,"a":{"label":"The World War I armistice","date":"1918-11-11","prec":11},"b":{"label":"Sputnik 1 is launched","date":"1957-10-04","prec":11},"examples":["Ronald Reagan","Nelson Mandela","Pablo Picasso"]},
    {"round":2,"a":{"label":"The Louisiana Purchase is signed","date":"1803-04-30","prec":11},"b":{"label":"Alexander Graham Bell patents the telephone","date":"1876-03-07","prec":11},"examples":["Victor Hugo","Sojourner Truth","Cornelius Vanderbilt"]},
    {"round":3,"a":{"label":"The fall of Constantinople","date":"1453-05-29","prec":11},"b":{"label":"Michelangelo unveils the Sistine Chapel ceiling","date":"1512-10-31","prec":11},"examples":["Leonardo da Vinci","Ferdinand II of Aragon"]}
  ],
  [
    {"round":1,"a":{"label":"Lindbergh lands in Paris after the first solo transatlantic flight","date":"1927-05-21","prec":11},"b":{"label":"Yuri Gagarin becomes the first person in space","date":"1961-04-12","prec":11},"examples":["Ronald Reagan","Nelson Mandela","Pablo Picasso"]},
    {"round":2,"a":{"label":"The Battle of Trafalgar","date":"1805-10-21","prec":11},"b":{"label":"The golden spike finishes the first transcontinental railroad","date":"1869-05-10","prec":11},"examples":["Victor Hugo","Hans Christian Andersen","Alexandre Dumas"]},
    {"round":3,"a":{"label":"Magellan sets sail to circle the globe","date":"1519-09-20","prec":11},"b":{"label":"Copernicus publishes his Sun-centered universe","date":"1543-01-01","prec":9},"examples":["Michelangelo","Martin Luther","Nicolaus Copernicus"]}
  ],
  [
    {"round":1,"a":{"label":"The Treaty of Versailles is signed","date":"1919-06-28","prec":11},"b":{"label":"The assassination of John F. Kennedy","date":"1963-11-22","prec":11},"examples":["Ronald Reagan","Nelson Mandela","Pablo Picasso"]},
    {"round":2,"a":{"label":"Napoleon crowns himself Emperor","date":"1804-12-02","prec":11},"b":{"label":"The Emancipation Proclamation takes effect","date":"1863-01-01","prec":11},"examples":["Victor Hugo","Michael Faraday","Alexandre Dumas"]},
    {"round":3,"a":{"label":"Joan of Arc is burned at the stake","date":"1431-05-30","prec":11},"b":{"label":"The fall of Constantinople","date":"1453-05-29","prec":11},"examples":["Johannes Gutenberg","Donatello"]}
  ],
  [
    {"round":1,"a":{"label":"Woodstock begins","date":"1969-08-15","prec":11},"b":{"label":"The September 11 attacks","date":"2001-09-11","prec":11},"examples":["Barack Obama","Donald Trump","Michael Jackson"]},
    {"round":2,"a":{"label":"Alexander Graham Bell patents the telephone","date":"1876-03-07","prec":11},"b":{"label":"The atomic bombing of Hiroshima","date":"1945-08-06","prec":11},"examples":["Mahatma Gandhi","Winston Churchill","Henry Ford"]},
    {"round":3,"a":{"label":"Julius Caesar is assassinated","date":"-0044-03-15","prec":11},"b":{"label":"The Battle of Actium","date":"-0031-09-02","prec":11},"examples":["Augustus","Virgil","Cleopatra"]}
  ],
  [
    {"round":1,"a":{"label":"The Chernobyl disaster","date":"1986-04-26","prec":11},"b":{"label":"The first iPhone goes on sale","date":"2007-06-29","prec":11},"examples":["Barack Obama","Donald Trump","Michael Jackson"]},
    {"round":2,"a":{"label":"The Wright brothers' first powered flight","date":"1903-12-17","prec":11},"b":{"label":"The Apollo 11 Moon landing","date":"1969-07-20","prec":11},"examples":["Pablo Picasso","Charlie Chaplin","Mao Zedong"]},
    {"round":3,"a":{"label":"Galileo is convicted by the Inquisition","date":"1633-06-22","prec":11},"b":{"label":"Newton publishes the Principia","date":"1687-07-05","prec":11},"examples":["John Locke","Robert Boyle","Charles Perrault"]}
  ],
  [
    {"round":1,"a":{"label":"The atomic bombing of Hiroshima","date":"1945-08-06","prec":11},"b":{"label":"The Chernobyl disaster","date":"1986-04-26","prec":11},"examples":["Ronald Reagan","Nelson Mandela","Joe Biden"]},
    {"round":2,"a":{"label":"The golden spike finishes the first transcontinental railroad","date":"1869-05-10","prec":11},"b":{"label":"The Wall Street Crash (Black Tuesday)","date":"1929-10-29","prec":11},"examples":["Thomas Edison","Sigmund Freud","Marie Curie"]},
    {"round":3,"a":{"label":"Jamestown is founded","date":"1607-05-14","prec":11},"b":{"label":"The Great Fire of London begins","date":"1666-09-02","prec":11},"examples":["Rembrandt","Thomas Hobbes"]}
  ],
  [
    {"round":1,"a":{"label":"Yuri Gagarin becomes the first person in space","date":"1961-04-12","prec":11},"b":{"label":"The September 11 attacks","date":"2001-09-11","prec":11},"examples":["Donald Trump","Michael Jackson","Vladimir Putin"]},
    {"round":2,"a":{"label":"The Battle of Gettysburg begins","date":"1863-07-01","prec":11},"b":{"label":"The World War I armistice","date":"1918-11-11","prec":11},"examples":["Thomas Edison","Sigmund Freud","Rabindranath Tagore"]},
    {"round":3,"a":{"label":"Elizabeth I is crowned","date":"1559-01-15","prec":11},"b":{"label":"William Shakespeare dies","date":"1616-04-23","prec":11},"examples":["Tokugawa Ieyasu","Walter Raleigh"]}
  ]
];
