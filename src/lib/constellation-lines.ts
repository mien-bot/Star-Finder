// IAU standard stick-figure connections for major constellations
// Each entry maps a constellation abbreviation to pairs of Hipparcos (HIP) star IDs
// that should be connected to form the constellation figure.

export const constellationLines: Record<string, [number, number][]> = {
  // Ursa Major (Big Dipper)
  // Dubhe(54061), Merak(53910), Phecda(54539), Megrez(59774),
  // Alioth(62956), Mizar(65378), Alkaid(67301)
  UMa: [
    [54061, 53910],
    [53910, 54539],
    [54539, 59774],
    [59774, 62956],
    [62956, 65378],
    [65378, 67301],
    [54539, 54061],
  ],

  // Orion
  // Betelgeuse(27989), Bellatrix(25336), Mintaka(26727), Alnilam(25930),
  // Alnitak(26311), Rigel(24436), Saiph(27366), Meissa(22449), 22549, 22797, Mu Ori(29038)
  Ori: [
    [27989, 22449],
    [22449, 25336],
    [25336, 26727],
    [26727, 25930],
    [25930, 26311],
    [26311, 27366],
    [27366, 27989],
    [24436, 26727],
    [24436, 25336],
  ],

  // Cassiopeia
  // Caph(746), Schedar(3179), Gamma Cas(4427), Ruchbah(6686), Segin(8886)
  Cas: [
    [746, 4427],
    [4427, 3179],
    [4427, 6686],
    [6686, 8886],
  ],

  // Scorpius
  // Dschubba(78265), 78401, 78820, Antares(80763), 82396, 82514, 82729, 83081,
  // Sargas(84143), Shaula(85927), Lesath(86228)
  Sco: [
    [78265, 78401],
    [78401, 78820],
    [78820, 80763],
    [80763, 82396],
    [82396, 82514],
    [82514, 82729],
    [82729, 83081],
    [83081, 84143],
    [84143, 85927],
    [85927, 86228],
  ],

  // Cygnus (Northern Cross)
  // Deneb(102098), Sadr(100453), Gienah(95947), wing(104732), Albireo(97165)
  Cyg: [
    [102098, 100453],
    [100453, 95947],
    [100453, 104732],
    [100453, 97165],
  ],

  // Leo
  // Regulus(49669), 50583, Denebola(54872), Zosma(57632), Algieba(50335),
  // Adhafera(49583), Ras Elased Australis(47908), Ras Elased Borealis(46750)
  Leo: [
    [49669, 50583],
    [50583, 54872],
    [54872, 57632],
    [57632, 50335],
    [50335, 49583],
    [49583, 47908],
    [47908, 46750],
    [46750, 49669],
    [57632, 50583],
  ],

  // Ursa Minor (Little Dipper)
  // Polaris(11767), Kochab(85822), 75097, 77055, 79822, 82080
  UMi: [
    [11767, 85822],
    [85822, 82080],
    [82080, 79822],
    [79822, 77055],
    [77055, 75097],
  ],

  // Gemini
  // Pollux(36850), Castor(37826), 31681, 29655, 32362, 35550, 34088, 30883
  Gem: [
    [36850, 37826],
    [36850, 35550],
    [35550, 34088],
    [34088, 31681],
    [31681, 29655],
    [37826, 32362],
    [32362, 30883],
  ],

  // Taurus
  // Aldebaran(21421), Elnath(25428), Zeta Tau(26451), Theta2 Tau(20894),
  // Gamma Tau(20205), Delta Tau(20455), Epsilon Tau(20889), Ain/omi Tau(20885),
  // Lambda Tau(18724), Xi Tau(16083)
  Tau: [
    [21421, 20889],
    [20889, 20455],
    [20455, 20205],
    [20205, 20894],
    [20894, 21421],
    [21421, 25428],
    [21421, 26451],
    [18724, 21421],
    [16083, 18724],
  ],

  // Canis Major
  // Sirius(32349), Mirzam(30324), Wezen(34444), Aludra(35904),
  // Adhara(33579), Furud(30122), Eta CMa(35037)
  CMa: [
    [32349, 30324],
    [32349, 33579],
    [33579, 34444],
    [34444, 35904],
    [34444, 35037],
    [33579, 30122],
  ],

  // Lyra
  // Vega(91262), Sheliak(92420), Sulafat(93194), Delta2 Lyr(92791),
  // Zeta1 Lyr(91971), Epsilon1 Lyr(91926), Epsilon2 Lyr(91952)
  Lyr: [
    [91262, 91971],
    [91971, 92420],
    [92420, 93194],
    [93194, 92791],
    [92791, 91971],
  ],

  // Aquila
  // Altair(97649), Tarazed(97278), Alshain(98036), Delta Aql(99473),
  // Lambda Aql(93805), Zeta Aql(93747), Theta Aql(97804)
  Aql: [
    [97649, 97278],
    [97649, 98036],
    [97278, 99473],
    [98036, 93805],
    [97649, 97804],
    [97804, 93747],
  ],

  // Virgo
  // Spica(65474), Zavijava(57757), Porrima(61941), Vindemiatrix(63608),
  // Heze(72220), Auva(60129), Epsilon Vir(63608), Eta Vir(60129),
  // Tau Vir(68520), Zeta Vir(66249), 109 Vir(72220)
  Vir: [
    [65474, 63608],
    [63608, 61941],
    [61941, 57757],
    [61941, 60129],
    [65474, 66249],
    [66249, 72220],
    [63608, 68520],
  ],

  // Pisces
  // Eta Psc(5742), Gamma Psc(6193), Kappa Psc(8198), Lambda Psc(8911),
  // Iota Psc(116771), Theta Psc(115830), Omega Psc(4906),
  // Delta Psc(3786), Epsilon Psc(4586), Alpha Psc(113136),
  // Nu Psc(7884), Mu Psc(7007)
  Psc: [
    [5742, 6193],
    [6193, 7884],
    [7884, 8198],
    [8198, 8911],
    [5742, 4906],
    [4906, 4586],
    [4586, 3786],
    [3786, 113136],
    [113136, 115830],
    [115830, 116771],
    [116771, 7007],
  ],

  // Aries
  // Hamal(9884), Sheratan(8903), Mesarthim(8832), 41 Ari(13209)
  Ari: [
    [9884, 8903],
    [8903, 8832],
    [9884, 13209],
  ],

  // Sagittarius (Teapot asterism)
  // Kaus Australis(90185), Kaus Media(89931), Kaus Borealis(86032),
  // Nunki(92855), Phi Sgr(92041), Ascella(93506), Tau Sgr(93864),
  // Nash(88635), Delta Sgr(89931)
  Sgr: [
    [90185, 89931],
    [89931, 86032],
    [86032, 88635],
    [88635, 90185],
    [90185, 93506],
    [93506, 92855],
    [92855, 86032],
    [93506, 93864],
    [92855, 92041],
  ],

  // Auriga
  // Capella(24608), Menkalinan(28360), Theta Aur(28380),
  // Mahasim(23453), Hassaleh(23015), Elnath(25428 - shared with Taurus),
  // Almaaz(23416)
  Aur: [
    [24608, 28360],
    [28360, 28380],
    [28380, 25428],
    [25428, 23015],
    [23015, 23416],
    [23416, 24608],
    [24608, 23453],
  ],

  // Perseus
  // Mirfak(15863), Algol(14576), Delta Per(17358), Epsilon Per(18532),
  // Zeta Per(18246), Gamma Per(14328), Eta Per(13268),
  // Tau Per(15338), Iota Per(14632), Kappa Per(14668)
  Per: [
    [15863, 14328],
    [14328, 13268],
    [15863, 17358],
    [17358, 18532],
    [18532, 18246],
    [15863, 15338],
    [15338, 14576],
    [14576, 14632],
    [14632, 14668],
  ],

  // Andromeda
  // Alpheratz(677), Delta And(3092), Mirach(5447), Almach(9640),
  // Mu And(4436), Nu And(4463), Phi And(5434)
  And: [
    [677, 3092],
    [3092, 5447],
    [5447, 9640],
    [3092, 4436],
    [4436, 4463],
    [5447, 5434],
  ],

  // Pegasus (Great Square)
  // Markab(113963), Scheat(113881), Algenib(1067), Alpheratz(677 - shared with And),
  // Enif(107315), Baham(109427), Homam(112029), Matar(109352)
  Peg: [
    [113963, 113881],
    [113881, 677],
    [677, 1067],
    [1067, 113963],
    [113963, 109427],
    [109427, 107315],
    [113963, 112029],
    [112029, 109352],
  ],

  // Draco
  // Eltanin(87833), Rastaban(85670), Grumium(89937), Xi Dra(87585),
  // Thuban(68756), Kappa Dra(61281), Lambda Dra(56211),
  // Iota Dra(75458), Theta Dra(78527), Eta Dra(80331),
  // Zeta Dra(83895), Chi Dra(89908), Delta Dra(94376)
  Dra: [
    [87833, 85670],
    [85670, 86614],
    [86614, 87585],
    [87585, 89937],
    [85670, 83895],
    [83895, 80331],
    [80331, 78527],
    [78527, 75458],
    [75458, 68756],
    [68756, 61281],
    [61281, 56211],
    [56211, 94376],
  ],

  // Cepheus
  // Alderamin(105199), Alfirk(106032), Er Rai(116727),
  // Delta Cep(110991), Zeta Cep(109492), Iota Cep(112724),
  // Mu Cep(107259)
  Cep: [
    [105199, 106032],
    [106032, 116727],
    [116727, 112724],
    [112724, 110991],
    [110991, 105199],
    [105199, 109492],
    [109492, 107259],
  ],

  // Bootes
  // Arcturus(69673), Izar(72105), Muphrid(67927), Nekkar(73555),
  // Seginus(71075), Rho Boo(71053), Delta Boo(72370),
  // Eta Boo(67927), Zeta Boo(71795)
  Boo: [
    [69673, 72105],
    [72105, 73555],
    [73555, 71075],
    [71075, 69673],
    [69673, 67927],
    [72105, 72370],
    [71075, 71795],
  ],

  // Corona Borealis
  // Alphecca(76267), Nusakan(75695), Gamma CrB(76952),
  // Delta CrB(77512), Epsilon CrB(78159), Theta CrB(74824),
  // Iota CrB(78493)
  CrB: [
    [74824, 75695],
    [75695, 76267],
    [76267, 76952],
    [76952, 77512],
    [77512, 78159],
    [78159, 78493],
  ],

  // Hercules
  // Rasalgethi(84345), Kornephoros(86414), Zeta Her(81693),
  // Eta Her(81833), Pi Her(84380), Epsilon Her(83207),
  // Delta Her(84379), Mu Her(86974), Xi Her(87933),
  // Omicron Her(88794), Theta Her(80170), Iota Her(80463)
  Her: [
    [84345, 86414],
    [86414, 84379],
    [84379, 81693],
    [81693, 80170],
    [80170, 80463],
    [80463, 81693],
    [81693, 81833],
    [81833, 83207],
    [83207, 84379],
    [86414, 86974],
    [86974, 87933],
    [84345, 84380],
  ],

  // Corvus
  // Gienah Corvi(59803), Kraz(59316), Algorab(60965), Minkar(61359),
  // Delta Crv(60965), Epsilon Crv(59199)
  Crv: [
    [59803, 59316],
    [59316, 60965],
    [60965, 61359],
    [59803, 61359],
    [59316, 59199],
  ],

  // Crater
  // Alpha Crt(53740), Beta Crt(54682), Gamma Crt(55282),
  // Delta Crt(55687), Epsilon Crt(54987), Zeta Crt(53740),
  // Theta Crt(52943), Eta Crt(54539)
  Crt: [
    [53740, 54682],
    [54682, 55282],
    [55282, 55687],
    [55687, 54987],
    [54987, 53740],
    [53740, 52943],
  ],

  // Libra
  // Zubenelgenubi(72622), Zubeneschamali(74785), Sigma Lib(73714),
  // Upsilon Lib(75379), Tau Lib(74395), Gamma Lib(76333)
  Lib: [
    [72622, 74785],
    [74785, 76333],
    [72622, 73714],
    [73714, 75379],
    [74785, 74395],
  ],

  // Capricornus
  // Algedi(100064), Dabih(100345), Nashira(104139), Deneb Algedi(105881),
  // Omega Cap(102485), Psi Cap(102978), Zeta Cap(104139),
  // Theta Cap(105515), Iota Cap(106039), Gamma Cap(104139)
  Cap: [
    [100064, 100345],
    [100345, 102485],
    [102485, 102978],
    [102978, 104139],
    [104139, 105881],
    [105881, 106039],
    [106039, 105515],
  ],

  // Aquarius
  // Sadalsuud(106278), Sadalmelik(109074), Sadachbia(110395),
  // Skat(113136), Lambda Aqr(112961), Eta Aqr(111497),
  // Zeta Aqr(110960), Gamma Aqr(110395), Phi Aqr(114341),
  // Theta Aqr(110003), Delta Aqr(113136), Albali(102618)
  Aqr: [
    [109074, 106278],
    [109074, 110395],
    [110395, 110960],
    [110960, 112961],
    [112961, 114341],
    [110395, 110003],
    [110003, 111497],
    [109074, 102618],
  ],
}

// Full constellation names mapped from IAU abbreviations
export const constellationNames: Record<string, string> = {
  UMa: 'Ursa Major',
  Ori: 'Orion',
  Cas: 'Cassiopeia',
  Sco: 'Scorpius',
  Cyg: 'Cygnus',
  Leo: 'Leo',
  UMi: 'Ursa Minor',
  Gem: 'Gemini',
  Tau: 'Taurus',
  CMa: 'Canis Major',
  Lyr: 'Lyra',
  Aql: 'Aquila',
  Vir: 'Virgo',
  Psc: 'Pisces',
  Ari: 'Aries',
  Sgr: 'Sagittarius',
  Aur: 'Auriga',
  Per: 'Perseus',
  And: 'Andromeda',
  Peg: 'Pegasus',
  Dra: 'Draco',
  Cep: 'Cepheus',
  Boo: 'Bootes',
  CrB: 'Corona Borealis',
  Her: 'Hercules',
  Crv: 'Corvus',
  Crt: 'Crater',
  Lib: 'Libra',
  Cap: 'Capricornus',
  Aqr: 'Aquarius',
}
