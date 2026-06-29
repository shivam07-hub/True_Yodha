function uniquePush(list, value) {
  const label = value.trim()
  if (label && !list.some((item) => item.toLowerCase() === label.toLowerCase())) {
    list.push(label)
  }
}

function chip(label, actions) {
  const wrapper = document.createElement("span")
  wrapper.className = "skill-chip"
  const text = document.createElement("span")
  text.textContent = label
  wrapper.append(text)
  for (const action of actions) {
    const button = document.createElement("button")
    button.type = "button"
    button.textContent = action.label
    button.title = action.title
    button.setAttribute("aria-label", action.title)
    button.addEventListener("click", action.onClick)
    wrapper.append(button)
  }
  return wrapper
}

function renderChipList(container, labels, actionsForIndex) {
  container.replaceChildren()
  for (const [index, label] of labels.entries()) {
    container.append(chip(label, actionsForIndex(index)))
  }
}

export function renderSkills(elements, state) {
  const rerender = () => renderSkills(elements, state)
  const removeAt = (list, index) => {
    list.splice(index, 1)
    rerender()
  }
  const moveSkill = (from, to, index) => {
    const [skill] = from.splice(index, 1)
    uniquePush(to, skill)
    rerender()
  }

  renderChipList(elements.primaryChips, state.primarySkills, (index) => [
    { label: "S", title: "Move to secondary skills", onClick: () => moveSkill(state.primarySkills, state.secondarySkills, index) },
    { label: "×", title: "Remove skill", onClick: () => removeAt(state.primarySkills, index) },
  ])
  renderChipList(elements.secondaryChips, state.secondarySkills, (index) => [
    { label: "P", title: "Move to primary skills", onClick: () => moveSkill(state.secondarySkills, state.primarySkills, index) },
    { label: "×", title: "Remove skill", onClick: () => removeAt(state.secondarySkills, index) },
  ])
  renderChipList(elements.emergingChips, state.emergingSkills, (index) => [
    { label: "×", title: "Remove emerging skill", onClick: () => removeAt(state.emergingSkills, index) },
  ])
}
