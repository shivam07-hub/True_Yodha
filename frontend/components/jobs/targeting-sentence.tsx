"use client"

/**
 * The search order, written in plain English and signed off before dispatch.
 *
 * This replaced six labelled form rows. The rows were numbered 01–06, which read
 * as a sequence and was not one — you do not fill a search brief in order, and
 * numbering that encodes nothing is decoration. One sentence has no steps, so
 * the numerals went with the rows.
 *
 * The interaction: every noun in the paragraph IS its control. Tap a role, a
 * city, a won't-take, and you edit it where it sits — the sentence never
 * reflows into a form. The risk worth taking here is that the prose re-grammars
 * itself as you edit: drop one of three roles and "a, b and c" becomes "a and
 * b"; empty a clause and the clause leaves rather than stranding "in ." on the
 * screen. That is what makes this read as something Myro will act on instead of
 * a settings summary with the labels hidden.
 *
 * Nothing here writes. The modal owns persistence on Run/Save — see
 * MatchRefreshGate — so a Discard still means discard.
 */

import { useEffect, useRef, useState } from "react"

export type PhraseGroup = "roles" | "location" | "lean" | "avoid" | "goal" | "power"

/** Which clause a phrase belongs to, and whether it is one of many or the only one. */
type Target = { group: PhraseGroup; index: number }

export type SentenceValue = {
  roles: string[]
  location: string
  lean: string[]
  avoid: string[]
  goal: string
  power: string
}

/* Utility register, not prose: these sit under the sentence, so they read as
 * things you can add rather than words in it. */
const ADD_LABEL: Record<PhraseGroup, string> = {
  roles: "+ a role",
  location: "+ a place",
  lean: "+ what draws you",
  avoid: "+ what doesn't",
  goal: "+ where you're headed",
  power: "+ what you're best at",
}

/** "a" · "a and b" · "a, b and c" — the join is part of the sentence, not a list. */
function joinNodes(nodes: React.ReactNode[]): React.ReactNode[] {
  if (nodes.length <= 1) return nodes
  const out: React.ReactNode[] = []
  nodes.forEach((node, i) => {
    if (i > 0) out.push(<span key={`j${i}`}>{i === nodes.length - 1 ? " and " : ", "}</span>)
    out.push(node)
  })
  return out
}

function Phrase({
  text, active, onOpen,
}: { text: string; active: boolean; onOpen: (el: HTMLButtonElement) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => onOpen(e.currentTarget)}
      className="tm-ts-phrase"
      data-active={active ? "true" : undefined}
    >
      {text}
    </button>
  )
}

function AddPhrase({ label, onOpen }: { label: string; onOpen: (el: HTMLButtonElement) => void }) {
  return (
    <button type="button" onClick={(e) => onOpen(e.currentTarget)} className="tm-ts-add">
      {label}
    </button>
  )
}

/** Edit one phrase in place. Enter commits, Escape cancels, Remove drops it. */
function PhraseEditor({
  initial, canRemove, onCommit, onRemove, onClose,
}: {
  initial: string
  canRemove: boolean
  onCommit: (value: string) => void
  onRemove: () => void
  onClose: () => void
}) {
  const [value, setValue] = useState(initial)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { ref.current?.focus(); ref.current?.select() }, [])
  return (
    <div className="tm-ts-editor" role="dialog" aria-label="Edit phrase">
      <input
        ref={ref}
        value={value}
        maxLength={120}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); onCommit(value) }
          if (e.key === "Escape") { e.preventDefault(); onClose() }
        }}
        className="tm-ts-input"
        placeholder="Type a phrase"
      />
      <div className="tm-ts-editor-actions">
        {canRemove && (
          <button type="button" onClick={onRemove} className="tm-ts-remove">Remove</button>
        )}
        <button type="button" onClick={() => onCommit(value)} className="tm-ts-save">Save</button>
      </div>
    </div>
  )
}

export function TargetingSentence({
  value, onChange, maxPerGroup = 6,
}: {
  value: SentenceValue
  onChange: (next: SentenceValue) => void
  maxPerGroup?: number
}) {
  const [editing, setEditing] = useState<Target | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!editing) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setEditing(null)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [editing])

  const listOf = (group: PhraseGroup): string[] => {
    if (group === "location") return value.location ? [value.location] : []
    if (group === "goal") return value.goal ? [value.goal] : []
    if (group === "power") return value.power ? [value.power] : []
    return value[group]
  }

  function write(group: PhraseGroup, next: string[]) {
    if (group === "location") return onChange({ ...value, location: next[0] ?? "" })
    if (group === "goal") return onChange({ ...value, goal: next[0] ?? "" })
    if (group === "power") return onChange({ ...value, power: next[0] ?? "" })
    onChange({ ...value, [group]: next })
  }

  function commit(target: Target, raw: string) {
    const phrase = raw.trim().replace(/\s+/g, " ")
    const list = listOf(target.group)
    if (!phrase) { setEditing(null); return }
    const clash = list.some((v, i) => i !== target.index && v.toLowerCase() === phrase.toLowerCase())
    if (clash) { setEditing(null); return }
    const next = [...list]
    next[target.index] = phrase
    write(target.group, next.slice(0, maxPerGroup))
    setEditing(null)
  }

  function remove(target: Target) {
    write(target.group, listOf(target.group).filter((_, i) => i !== target.index))
    setEditing(null)
  }

  const isEditing = (g: PhraseGroup, i: number) => editing?.group === g && editing.index === i

  /** One clause's phrases. No add affordance here: an invitation inside a noun
   *  phrase reads as "Technical Account Manager add a role roles in Bengaluru",
   *  which is not a sentence. The prose states what is true; what is missing is
   *  offered underneath it. */
  function nodes(group: PhraseGroup) {
    return joinNodes(
      listOf(group).map((text, i) => (
        <Phrase
          key={`${group}-${i}-${text}`}
          text={text}
          active={isEditing(group, i)}
          onOpen={() => setEditing({ group, index: i })}
        />
      )),
    )
  }

  const hasRoles = value.roles.length > 0
  const hasDirection = value.lean.length > 0 || value.avoid.length > 0
  const editorFor = editing
    ? { initial: listOf(editing.group)[editing.index] ?? "", canRemove: editing.index < listOf(editing.group).length }
    : null

  /** Every clause with room left, in sentence order — but before there is a
   *  role there is nothing to qualify, and a role is also the one thing Run is
   *  blocked on. An empty brief asks for one thing, not six. */
  const openings: PhraseGroup[] = !hasRoles
    ? ["roles"]
    : (["roles", "location", "lean", "avoid", "goal", "power"] as const).filter(
        (g) => (["location", "goal", "power"].includes(g) ? listOf(g).length === 0 : listOf(g).length < maxPerGroup),
      )

  return (
    <div ref={wrapRef} className="tm-ts">
      <p className="tm-ts-body">
        {hasRoles ? (
          <>
            Myro will look for {nodes("roles")} roles
            {value.location && <> in {nodes("location")}</>}.
          </>
        ) : (
          <>Myro needs one thing before it can search — the kind of work you want.</>
        )}

        {hasDirection && (
          <>
            {" "}
            {value.lean.length > 0
              ? <>You lean toward {nodes("lean")}</>
              : <>You want nothing to do with {nodes("avoid")}</>}
            {value.lean.length > 0 && value.avoid.length > 0 && <> — and away from {nodes("avoid")}</>}.
          </>
        )}

        {value.goal && <> You&apos;re heading for {nodes("goal")}.</>}
        {value.power && <> You&apos;re best at {nodes("power")}.</>}
      </p>

      {openings.length > 0 && !editing && (
        <div className="tm-ts-openings">
          {openings.map((group) => (
            <AddPhrase
              key={group}
              label={ADD_LABEL[group]}
              onOpen={() => setEditing({ group, index: listOf(group).length })}
            />
          ))}
        </div>
      )}

      {editing && editorFor && (
        <PhraseEditor
          key={`${editing.group}-${editing.index}`}
          initial={editorFor.initial}
          canRemove={editorFor.canRemove}
          onCommit={(v) => commit(editing, v)}
          onRemove={() => remove(editing)}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
