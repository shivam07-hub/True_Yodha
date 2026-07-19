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
    // Preserve any refresh token from a "Connect with Myro" handshake so saving
    // an API-URL override here doesn't silently drop auto-refresh.
    const current = await getConfig()
    await saveConfig({
      apiUrl: apiUrl.value.trim(),
      token: token.value.trim(),
      refreshToken: current.refreshToken,
    })
    statusText.textContent = "Saved. Myro can now save jobs from the extension."
  })
}

init()
