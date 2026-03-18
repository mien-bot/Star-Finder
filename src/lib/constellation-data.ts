export interface Constellation {
  name: string
  stars: [number, number, number][]  // [x, y, magnitude]
  connections: [number, number][]
  description: string
  mythology?: string
  visibility: {
    season: string
    hemisphere: string
  }
}

export interface ConstellationResult {
  constellations: Constellation[]
}

// Mock constellation data - positions are relative to a 1000x1000 image
export const mockConstellationData: ConstellationResult = {
  constellations: [
    {
      name: "Orion",
      stars: [
        [200, 150, 0.5], // Betelgeuse
        [350, 150, 1.6], // Bellatrix
        [275, 250, 2.0], // Center
        [200, 350, 2.1], // Saiph
        [350, 350, 0.1], // Rigel
        [240, 250, 1.7], // Belt 1
        [275, 250, 1.7], // Belt 2
        [310, 250, 2.2], // Belt 3
      ],
      connections: [
        [0, 2],
        [1, 2],
        [2, 3],
        [2, 4],
        [5, 6],
        [6, 7],
      ],
      description:
        "One of the most recognizable constellations in the night sky, featuring three bright stars forming Orion's Belt.",
      mythology:
        "Named after the Greek mythological hunter who was placed among the stars by Zeus.",
      visibility: {
        season: "Winter",
        hemisphere: "Both",
      },
    },
    {
      name: "Ursa Major",
      stars: [
        [550, 120, 1.8], // Dubhe
        [620, 110, 2.4], // Merak
        [680, 130, 2.4], // Phecda
        [750, 120, 3.3], // Megrez
        [820, 100, 1.8], // Alioth
        [880, 130, 2.1], // Mizar
        [950, 150, 1.9], // Alkaid
      ],
      connections: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 5],
        [5, 6],
        [2, 0],
      ],
      description:
        "The Big Dipper asterism, part of the larger Great Bear constellation, is one of the most easily recognized star patterns.",
      mythology:
        "In Greek mythology, Zeus transformed Callisto into a bear and placed her in the sky.",
      visibility: {
        season: "Year-round",
        hemisphere: "Northern",
      },
    },
    {
      name: "Cassiopeia",
      stars: [
        [480, 450, 2.2], // Schedar
        [540, 420, 2.3], // Caph
        [600, 450, 2.5], // Gamma
        [660, 410, 2.7], // Ruchbah
        [720, 440, 3.4], // Segin
      ],
      connections: [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
      ],
      description:
        "A distinctive W-shaped constellation that is circumpolar in the Northern Hemisphere, visible throughout the year.",
      mythology:
        "Named after the vain queen Cassiopeia from Greek mythology, who boasted about her beauty.",
      visibility: {
        season: "Year-round",
        hemisphere: "Northern",
      },
    },
    {
      name: "Scorpius",
      stars: [
        [150, 600, 1.0], // Antares
        [120, 550, 2.6], // Graffias
        [100, 500, 2.3], // Dschubba
        [130, 650, 1.9], // Sargas
        [180, 700, 1.6], // Shaula
        [220, 720, 2.7], // Lesath
        [200, 650, 2.4], // Tail curve
      ],
      connections: [
        [0, 1],
        [1, 2],
        [0, 3],
        [3, 6],
        [6, 4],
        [4, 5],
      ],
      description:
        "A zodiac constellation with a distinctive curved tail, featuring the bright red star Antares at its heart.",
      mythology:
        "In Greek mythology, it was the scorpion that killed Orion, which is why they are placed on opposite sides of the sky.",
      visibility: {
        season: "Summer",
        hemisphere: "Southern",
      },
    },
    {
      name: "Cygnus",
      stars: [
        [800, 550, 1.3], // Deneb
        [750, 600, 2.2], // Sadr
        [700, 650, 2.5], // Wing 1
        [800, 650, 2.5], // Wing 2
        [750, 700, 3.1], // Albireo
      ],
      connections: [
        [0, 1],
        [1, 2],
        [1, 3],
        [1, 4],
      ],
      description:
        "Known as the Northern Cross, this constellation represents a swan flying along the Milky Way.",
      mythology:
        "Associated with several Greek myths, including Zeus disguised as a swan.",
      visibility: {
        season: "Summer/Fall",
        hemisphere: "Northern",
      },
    },
  ],
}

// Simulates an AI API call with a delay
export async function analyzeNightSkyImage(): Promise<ConstellationResult> {
  // Simulate API processing time
  await new Promise((resolve) => setTimeout(resolve, 2500))
  return mockConstellationData
}
