/**
 * cv-spellcheck — lightweight, zero-dependency spell check for CV prose.
 *
 * Deliberately a CURATED set of common English + resume misspellings, NOT a
 * full dictionary. On a CV, a full dictionary flags every proper noun, tool,
 * and acronym (Capgemini, GTM, MaaS, fintech) — noise that destroys trust.
 * Matching only known nonwords gives near-zero false positives by construction.
 *
 * Scope = human-written prose (summary, bullets, certs). Skips skills_line
 * (tool/acronym soup), company/role/institution names, and dates.
 */
import type { CVStructured } from "@/lib/api"

/** misspelling → suggested correction. Keys MUST be unambiguous nonwords
 *  (never a valid word in any context) so we never flag correct writing. */
const MISSPELLINGS: Record<string, string> = {
  // resume-frequent
  implentation: "implementation",
  imlementation: "implementation",
  implmentation: "implementation",
  profitibality: "profitability",
  profitibility: "profitability",
  responsibilty: "responsibility",
  responsibilites: "responsibilities",
  managment: "management",
  enviroment: "environment",
  enviornment: "environment",
  acheive: "achieve",
  acheived: "achieved",
  acheivement: "achievement",
  acheivements: "achievements",
  recieve: "receive",
  recieved: "received",
  succesful: "successful",
  successfull: "successful",
  sucessful: "successful",
  sucess: "success",
  begining: "beginning",
  comitted: "committed",
  commited: "committed",
  comitment: "commitment",
  collaberation: "collaboration",
  collabration: "collaboration",
  communcation: "communication",
  comunication: "communication",
  developement: "development",
  experiance: "experience",
  knowlege: "knowledge",
  knowledgable: "knowledgeable",
  leadeship: "leadership",
  leardership: "leadership",
  oppertunity: "opportunity",
  oportunity: "opportunity",
  opportunites: "opportunities",
  performace: "performance",
  perfomance: "performance",
  proffesional: "professional",
  professtional: "professional",
  reponsible: "responsible",
  strenght: "strength",
  strenghts: "strengths",
  tecnical: "technical",
  techical: "technical",
  analize: "analyze",
  // common English
  seperate: "separate",
  seperated: "separated",
  occured: "occurred",
  occurence: "occurrence",
  definately: "definitely",
  goverment: "government",
  buisness: "business",
  bussiness: "business",
  calender: "calendar",
  catagory: "category",
  cumulative: "cumulative",
  efficency: "efficiency",
  effeciency: "efficiency",
  garantee: "guarantee",
  garunteed: "guaranteed",
  independant: "independent",
  liason: "liaison",
  maintainance: "maintenance",
  maintenence: "maintenance",
  neccessary: "necessary",
  necesary: "necessary",
  occassion: "occasion",
  posession: "possession",
  prefered: "preferred",
  reccomend: "recommend",
  recomend: "recommend",
  refered: "referred",
  relevent: "relevant",
  goverance: "governance",
  scalibility: "scalability",
  teh: "the",
  thier: "their",
  truely: "truly",
  untill: "until",
  wich: "which",
  writeing: "writing",
}

export interface Misspelling {
  wrong: string
  suggest: string
}

/** Concatenate the prose fields where spelling actually matters. */
function cvProse(cv: CVStructured): string {
  const parts: string[] = []
  if (cv.summary) parts.push(cv.summary)
  for (const e of cv.experience) parts.push(...e.bullets)
  for (const p of cv.projects) parts.push(...p.bullets)
  parts.push(...cv.certs)
  return parts.join("\n")
}

/** Return each distinct misspelling found in the text (order of first sight). */
export function findMisspellings(text: string): Misspelling[] {
  const seen = new Set<string>()
  const out: Misspelling[] = []
  // split on anything that is not a letter or apostrophe
  for (const raw of text.toLowerCase().split(/[^a-z']+/)) {
    const word = raw.replace(/^'+|'+$/g, "")
    if (!word || seen.has(word)) continue
    const suggest = MISSPELLINGS[word]
    if (suggest) {
      seen.add(word)
      out.push({ wrong: word, suggest })
    }
  }
  return out
}

/** Spell check over a structured CV's prose. */
export function spellCheckCv(cv: CVStructured): Misspelling[] {
  return findMisspellings(cvProse(cv))
}
