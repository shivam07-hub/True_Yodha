/**
 * A logged-out open of Jobs inside the Android app.
 *
 * The TWA starts at /market. The page's own HTML is the jobs skeleton, and
 * the auth gate only runs after that HTML has painted. This module decides
 * the redirect, and the same decision is inlined as a blocking script so the
 * skeleton never paints. The web is left on /market until the gate sends it
 * to /login.
 *
 * The script reads the session token from localStorage because that is where
 * the session lives. It never writes the shell flag there.
 */
import { ANDROID_APP_REFERRER, SHELL_KEY, referrerIsAndroidApp } from "@/lib/platform/app-shell"

const ACCESS_TOKEN_KEY = "mirror_token"
const REFRESH_TOKEN_KEY = "mirror_refresh_token"

export function isJobsEntry(pathname: string): boolean {
  return pathname === "/market" || pathname.startsWith("/market/")
}

export interface ColdOpen {
  pathname: string
  search: string
  referrer: string
  shellStored: string | null
  accessToken: string | null
  refreshToken: string | null
}

/** `/signup?shell=android` when this load must not paint Jobs. Null means stay. */
export function coldOpenRedirect(input: ColdOpen): string | null {
  if (!isJobsEntry(input.pathname)) return null
  if (input.accessToken || input.refreshToken) return null
  const params = new URLSearchParams(input.search)
  const inApp =
    params.get("shell") === "android" ||
    referrerIsAndroidApp(input.referrer) ||
    input.shellStored === "android"
  if (!inApp) return null
  params.set("shell", "android")
  return `/signup?${params.toString()}`
}

/**
 * Runs as the first script in <body>, before the jobs skeleton is parsed.
 * A same-tab restore (back/forward cache) runs it again; the page it leaves
 * is not left `visibility: hidden`, or Back would restore a blank Jobs.
 */
export const COLD_OPEN_SCRIPT = `(function(){
  var ACCESS=${JSON.stringify(ACCESS_TOKEN_KEY)};
  var REFRESH=${JSON.stringify(REFRESH_TOKEN_KEY)};
  var SHELL=${JSON.stringify(SHELL_KEY)};
  var PREFIX=${JSON.stringify(ANDROID_APP_REFERRER)};
  function read(store, key){try{return store?store.getItem(key):null}catch(e){return null}}
  function leave(){
    try{
      var path=location.pathname;
      if(path!=="/market"&&path.indexOf("/market/")!==0)return;
      var local=null,tab=null;
      try{local=window.localStorage}catch(e){}
      try{tab=window.sessionStorage}catch(e){}
      if(read(local,ACCESS)||read(tab,ACCESS)||read(local,REFRESH)||read(tab,REFRESH))return;
      var params=new URLSearchParams(location.search||"");
      var ref="";
      try{ref=document.referrer||""}catch(e){}
      var refOk=ref.indexOf(PREFIX)===0;
      if(refOk){var n=ref.charAt(PREFIX.length);refOk=n===""||n==="/"||n==="?"||n==="#"}
      if(params.get("shell")!=="android"&&!refOk&&read(tab,SHELL)!=="android")return;
      params.set("shell","android");
      try{if(tab)tab.setItem(SHELL,"android")}catch(e){}
      location.replace("/signup?"+params.toString());
    }catch(e){}
  }
  leave();
  window.addEventListener("pageshow",leave);
})();`
