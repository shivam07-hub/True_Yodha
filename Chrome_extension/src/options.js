import { getConfig, saveConfig } from "./storage.js"

const form = document.querySelector("#settings-form")
const apiUrl = document.querySelector("#api-url")
const token = document.querySelector("#token")
const statusText = document.querySelector("#status-text")

async function init() {
  const config = await getConfig()
  apiUrl.value = config.apiUrl
  token.value = config.token

  form.addEventListener("submit", async (event) => {
    event.preventDefault()
    await saveConfig({
      apiUrl: apiUrl.value.trim(),
      token: token.value.trim(),
    })
    statusText.textContent = "Saved. Myro can now track jobs from the extension."
  })
}

init()
