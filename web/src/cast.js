export const CARS = [
  { id: 'blue', words: ['blue', 'sedan'], name: 'BLUE-SEDAN', short: 'BLUE', kind: 'sedan', color: '#2f6fe0', lane: 0, z: 46 },
  { id: 'silver', words: ['silver', 'grey', 'gray', 'hatch', 'hatchback'], name: 'SILVER-HATCH', short: 'SILVER', kind: 'hatch', color: '#c4cbd6', lane: 0, z: 6 },
  { id: 'truck', words: ['red', 'truck', 'lorry'], name: 'RED-TRUCK', short: 'TRUCK', kind: 'truck', color: '#d63b3b', lane: 1, z: 24 },
  { id: 'cab', words: ['yellow', 'cab', 'taxi'], name: 'YELLOW-CAB', short: 'CAB', kind: 'cab', color: '#f2c118', lane: 2, z: 52 },
  { id: 'van', words: ['green', 'van'], name: 'GREEN-VAN', short: 'VAN', kind: 'van', color: '#2f9e5a', lane: 2, z: 12 },
  { id: 'suv', words: ['black', 'suv'], name: 'BLACK-SUV', short: 'SUV', kind: 'suv', color: '#39425a', lane: 3, z: 32 },
]

export const ITEMS = [
  { id: 'pothole', kind: 'pothole', label: 'POTHOLE', scope: 'road' },
  { id: 'debris', kind: 'debris', label: 'DEBRIS', scope: 'road' },
  { id: 'speed', kind: 'speed', label: 'SPD METER', scope: 'road' },
  { id: 'police', kind: 'police', label: 'POLICE', scope: 'lane' },
  { id: 'slow', kind: 'slow', label: 'SLOW CAR', scope: 'lane' },
]

export const INTRO = [
  { speaker: null, text: 'A WILD HIGHWAY APPEARED!' },
  { speaker: null, text: 'SIX CARS, FOUR LANES, ONE LOCAL LINK.' },
  { speaker: null, text: 'DRAG A HAZARD ONTO THE ROAD.' },
]
