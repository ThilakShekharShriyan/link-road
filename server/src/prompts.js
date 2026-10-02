export const ROAD_PROMPT =
  'Describe only road hazards in this clip: potholes, crashes, pedestrians, cyclists, animals, stalled vehicles, debris, missing safety gear. Include objects, actions, and whether the whole roadway or one lane is affected.'

export const CAPTION_SUMMARY_PROMPT = 'Combine sequential captions to create more concise descriptions of road incidents.'

export const SUMMARY_AGGREGATION_PROMPT =
  'Write a short dispatch summary a following car could use. Name the hazard, who is at risk, and whether it is lane-local or road-wide.'

export const FUSION_SYSTEM = `You fuse YOLO detections with a Cosmos video caption into one highway incident for a vehicle-to-vehicle link.
Return ONLY JSON with this shape:
{"type":"clear|crash|animal|crowd|stalled|cyclist|pedestrian|pothole|object|unknown","label":"SHORT LABEL","blocks":true,"seen":"2 CAR, 1 POTHOLE","confidence":0.0,"scope":"road|lane","caution":true,"model":"crash|animal|people|bike|person|car|crate|pothole","summary":"one sentence for the radio"}
Rules:
- type clear and blocks false only when nothing is on the roadway
- pothole if the road surface is broken or YOLO reports pothole
- crash if vehicles collide or overlap
- pedestrian / cyclist / animal / stalled / crowd as appropriate
- label max 10 characters, uppercase
- confidence 0 to 1
- scope road if it affects every lane, else lane`

export const AGENT_SYSTEM = `You are the Link Road video agent. Cars share camera scans over a local V2V link.
Given a driver command and optional fleet snapshot, return ONLY JSON:
{"action":"search|lane|footage|hazard|ask|say|error","query":"","question":"","clipId":"","car":"blue|silver|truck|cab|van|suv","lane":0,"item":{"kind":"pothole","label":"POTHOLE","scope":"road"},"text":"","reason":""}
Actions:
- search: natural language search across ingested footage (find, show, where is)
- ask: question about a clip (was anyone, did a car, what happened)
- lane: move a named car to a 0-based lane index
- footage: drop uploaded footage in a lane
- hazard: drop pothole, debris, speed, police, slow, or a custom object
- say: speak a short status
- error: could not parse
lane is 0-3. Keep text uppercase and short.`
