"""
ninja_name.py
Vanity-slug service for public profile URLs (`/profile/{ninja_name}`).

Pattern: {adjective}-{noun}-{4charsuffix}, e.g. "silent-fox-9k2x".
Charset: ^[a-z0-9-]{3,32}$.
Reserved route names + offensive terms blocked.

Used by:
  - auth signup → first-time provision sets ninja_name.
  - POST /profile/ninja-name → user-driven update.
  - One-off backfill script for existing users.
"""

from __future__ import annotations

import re
import secrets
from typing import Optional

from supabase import Client

# ── Wordlists ───────────────────────────────────────────────────────────────
# Curated. No slurs, no profanity, no real-world identity markers. Skew toward
# adventure/ninja/maker vibe so generated names feel intentional.

ADJECTIVES: list[str] = [
    "silent", "quiet", "swift", "wild", "calm", "bold", "brave", "clever",
    "crafty", "daring", "fierce", "gentle", "humble", "keen", "kind",
    "lively", "loyal", "mighty", "modest", "noble", "patient", "quick",
    "ready", "sharp", "silly", "smart", "steady", "stoic", "strong", "sunny",
    "tidy", "tough", "vivid", "warm", "wise", "witty", "zealous", "alpha",
    "amber", "ash", "azure", "bronze", "cedar", "cobalt", "copper", "crimson",
    "dawn", "dusk", "ebony", "ember", "emerald", "frost", "glacier", "ivory",
    "jade", "lunar", "mica", "midnight", "mint", "neon", "obsidian", "onyx",
    "opal", "pearl", "plum", "ruby", "saffron", "sage", "scarlet", "silver",
    "slate", "solar", "stellar", "stone", "storm", "teal", "topaz", "tundra",
    "velvet", "violet", "willow", "winter", "ash", "atomic", "binary",
    "cosmic", "cyber", "digital", "electric", "epic", "feral", "galactic",
    "haunted", "hidden", "infinite", "inverse", "iron", "ivory", "lazy",
    "lone", "lucid", "magnetic", "majestic", "mystic", "nimble", "northern",
    "obsidian", "orbital", "phantom", "pixel", "polar", "primal", "prime",
    "quantum", "radiant", "raven", "regal", "restless", "retro", "rogue",
    "secret", "shadow", "shifty", "sleek", "smooth", "sneaky", "sonic",
    "southern", "spectral", "stealth", "stoneborn", "stormy", "sturdy",
    "sublime", "subtle", "swiftborn", "tactical", "techno", "thunder",
    "timeless", "tireless", "twilight", "ultra", "valiant", "vector",
    "veiled", "verdant", "vintage", "watchful", "wayward", "western",
    "whisper", "wired", "wooden", "wandering", "yonder", "zigzag", "zen",
    "blazing", "boundless", "fearless", "frosty", "graceful", "hardy",
    "ironclad", "jovial", "lyrical", "merry", "nascent", "opaque", "plucky",
    "quirky", "rapid", "rustic", "savvy", "scenic", "spry", "stark",
    "stately", "trusty", "umbral", "vexed", "vibrant", "vital", "wakeful",
    "wholesome", "wistful", "zealful", "agile", "ample", "awake", "blithe",
    "candid", "casual", "cheerful", "cordial", "crystal", "deft", "earnest",
    "elated", "exact", "fervid", "fluent", "freshborn", "genuine", "groovy",
    "happy", "hopeful", "huge", "iridescent", "joyful", "jubilant",
]

NOUNS: list[str] = [
    "fox", "wolf", "lynx", "tiger", "otter", "panda", "raven", "owl",
    "eagle", "hawk", "falcon", "heron", "crane", "swan", "stag", "doe",
    "bear", "puma", "ocelot", "marten", "ferret", "badger", "weasel",
    "mole", "vole", "shrew", "lion", "leopard", "jaguar", "cheetah",
    "panther", "bobcat", "cougar", "kit", "cub", "pup", "joey", "calf",
    "foal", "lamb", "fawn", "chick", "owlet", "drake", "hen", "ram",
    "buck", "boar", "yak", "ox", "deer", "moose", "elk", "ibex", "antelope",
    "gazelle", "kudu", "oryx", "saiga", "argali", "muntjac", "tapir",
    "okapi", "manul", "serval", "caracal", "civet", "fennec", "dingo",
    "coyote", "jackal", "hyena", "meerkat", "mongoose", "pangolin", "sloth",
    "armadillo", "anteater", "echidna", "platypus", "wallaby", "kangaroo",
    "koala", "quokka", "wombat", "lemur", "loris", "tarsier", "mandrill",
    "gibbon", "macaque", "monkey", "ape", "gorilla", "orca", "narwhal",
    "beluga", "dolphin", "porpoise", "manatee", "dugong", "seal", "walrus",
    "otter", "beaver", "muskrat", "capybara", "marmot", "groundhog",
    "chipmunk", "squirrel", "dormouse", "hedgehog", "porcupine", "rabbit",
    "hare", "pika", "kit", "ninja", "samurai", "ronin", "shogun", "sensei",
    "pilot", "rider", "ranger", "scout", "guide", "sherpa", "mariner",
    "skipper", "captain", "voyager", "wanderer", "rambler", "drifter",
    "nomad", "pilgrim", "hiker", "climber", "diver", "skier", "surfer",
    "skater", "racer", "runner", "sprinter", "jumper", "vaulter", "archer",
    "ranger", "huntress", "hunter", "fisher", "miner", "smith",
    "mason", "weaver", "potter", "baker", "brewer", "tailor", "cobbler",
    "scribe", "bard", "monk", "oracle", "seer", "mystic", "alchemist",
    "tinkerer", "maker", "crafter", "builder", "engineer", "architect",
    "scholar", "explorer", "stargazer", "skylark", "comet",
    "meteor", "nebula", "nova", "pulsar", "quasar", "satellite", "drone",
    "rover", "glider", "kite", "raft", "kayak", "canoe", "skiff", "yacht",
    "frigate", "schooner", "clipper", "dinghy", "gondola", "barge",
    "compass", "lantern", "torch", "beacon", "anchor", "rudder", "sail",
    "mast", "keel", "prow", "hull", "deck", "bow", "stern",
]

# ── Reserved + validation ───────────────────────────────────────────────────

RESERVED_WORDS: set[str] = {
    "admin", "administrator", "root", "system", "owner", "support", "help",
    "api", "auth", "login", "logout", "signup", "signin", "signout",
    "register", "onboarding", "settings", "settings", "account", "billing",
    "subscribe", "unsubscribe", "profile", "profiles", "user", "users",
    "me", "you", "myself", "yourself", "self",
    "home", "dashboard", "mission", "market", "skills", "skill", "cv",
    "jobs", "job", "tracker", "diary", "forge", "xp", "companies",
    "company", "intel", "share", "public", "private", "internal",
    "robots", "sitemap", "favicon", "manifest", "static", "assets",
    "fellow", "fellows", "team", "teams", "org", "orgs",
    "myro", "mirror", "true-yodha", "trueyodha",
    "null", "undefined", "test", "tests", "preview", "dev", "staging",
    "prod", "production",
}

_PATTERN = re.compile(r"^[a-z0-9-]{3,32}$")


def is_valid(name: str) -> bool:
    """Charset + length + reserved-words check. Pure function."""
    if not isinstance(name, str):
        return False
    if not _PATTERN.fullmatch(name):
        return False
    if name in RESERVED_WORDS:
        return False
    return True


# ── Generation ──────────────────────────────────────────────────────────────

_SUFFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"


def _random_suffix() -> str:
    return "".join(secrets.choice(_SUFFIX_ALPHABET) for _ in range(4))


def generate() -> str:
    """Produce one candidate name. No uniqueness check — caller's job."""
    adj = secrets.choice(ADJECTIVES)
    noun = secrets.choice(NOUNS)
    return f"{adj}-{noun}-{_random_suffix()}"


# ── Availability + retry ────────────────────────────────────────────────────

def is_available(name: str, admin: Client) -> bool:
    """Returns False if a user_profiles row already holds this ninja_name."""
    result = (
        admin.table("user_profiles")
        .select("id")
        .eq("ninja_name", name)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return len(rows) == 0


def generate_unique(admin: Client, max_attempts: int = 25) -> str:
    """Generate a name that survives an availability check. Retry on collision."""
    for _ in range(max_attempts):
        candidate = generate()
        if is_available(candidate, admin=admin):
            return candidate
    raise RuntimeError(
        f"ninja_name.generate_unique exhausted {max_attempts} attempts without finding "
        "an available slug — wordlist or suffix space likely degenerate."
    )


def claim(user_id: str, name: str, admin: Client) -> None:
    """Persist a chosen name on user_profiles. Caller validated + checked availability."""
    admin.table("user_profiles").update({"ninja_name": name}).eq("id", user_id).execute()


def resolve_user_id_by_name(name: str, admin: Client) -> Optional[str]:
    """Lookup user_id by ninja_name. Used by referral attribution."""
    if not is_valid(name):
        return None
    result = (
        admin.table("user_profiles")
        .select("id")
        .eq("ninja_name", name)
        .limit(1)
        .maybe_single()
        .execute()
    )
    if not result or not result.data:
        return None
    return result.data.get("id")
