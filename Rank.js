.pragma library

// Skål's search ranking on top of the stock MenuModel score. Kept apart from
// MenuModel.js so that file can be replaced wholesale with each Omarchy
// release; everything here adjusts the stock score rather than replacing it.
//
// Community asks this answers:
//  - apps first (omacom/omarchy#10340, #7630): typing "rust" + Enter must
//    launch RustDesk, never run Remove › Development › Rust.
//  - frecency (#10726, #11580): what you open often and lately floats up.
//  - typo tolerance (#2074, #11580): "firfox", "spotfy", "ffx" still match.

// Stock tiers are score/1000: 0 exact, 10 prefix, 30 substring, 40 name,
// 60 description. Fuzzy-only matches sit below all of them.
var FUZZY_TIER = 70
// Destructive subtrees sink past every non-destructive match of the same
// quality, so Enter on a short query can't uninstall something.
var DESTRUCTIVE_PENALTY = 25
// The most a frecency history can lift a row, in tiers. Enough to lift a
// favorite's prefix match (10) over another row's exact match (0..2), not
// enough to lift a substring match (30) over a prefix one.
var MAX_FRECENCY_TIERS = 12
var HALF_LIFE_MS = 7 * 24 * 3600 * 1000
var MAX_TRACKED = 300

function isDestructive(id) {
  id = String(id || "")
  return id === "remove" || id.indexOf("remove.") === 0
}

function words(text) {
  return String(text || "").toLowerCase().split(/[^a-z0-9]+/).filter(function(w) { return w.length > 0 })
}

// Damerau-style distance bounded at 2; returns 3 when it's worse.
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 3
  var prev2 = null
  var prev = []
  for (var j = 0; j <= b.length; j++) prev.push(j)
  for (var i = 1; i <= a.length; i++) {
    var cur = [i]
    var rowMin = i
    for (var k = 1; k <= b.length; k++) {
      var cost = a.charAt(i - 1) === b.charAt(k - 1) ? 0 : 1
      var v = Math.min(prev[k] + 1, cur[k - 1] + 1, prev[k - 1] + cost)
      if (prev2 && i > 1 && k > 1 && a.charAt(i - 1) === b.charAt(k - 2) && a.charAt(i - 2) === b.charAt(k - 1))
        v = Math.min(v, prev2[k - 2] + 1)
      cur.push(v)
      if (v < rowMin) rowMin = v
    }
    if (rowMin > 2) return 3
    prev2 = prev
    prev = cur
  }
  return prev[b.length]
}

// One typed term against a label: a typo'd word ("firfox"), a typo'd word
// prefix ("spotfy" → spotify), or the initials/subsequence of the label
// ("ffx", "vsc"). Returns a penalty in points, or -1 for no match.
function fuzzyTerm(term, label) {
  if (term.length < 3) return -1
  var ws = words(label)
  var allowed = term.length >= 7 ? 2 : 1
  var best = -1
  for (var i = 0; i < ws.length; i++) {
    var w = ws[i]
    // Short words are a typo away from too much ("btop" vs "top").
    if (w.length < 4) continue
    var d = editDistance(term, w)
    if (d > allowed && w.length > term.length) d = Math.min(d, editDistance(term, w.substring(0, term.length)) + 1)
    if (d <= allowed) {
      var p = d * 100
      if (best < 0 || p < best) best = p
    }
  }
  if (best >= 0) return best

  // Subsequence over the label, all letters in order, starting on the first
  // letter of a word. Gaps cost a little so tight runs rank first.
  var flat = String(label || "").toLowerCase()
  var pos = -1
  var gaps = 0
  for (var c = 0; c < term.length; c++) {
    var next = flat.indexOf(term.charAt(c), pos + 1)
    if (next < 0) return -1
    if (c === 0 && next > 0 && /[a-z0-9]/.test(flat.charAt(next - 1))) {
      // Walk forward to an occurrence that starts a word.
      var found = -1
      for (var s = next; s >= 0; s = flat.indexOf(term.charAt(0), s + 1)) {
        if (s === 0 || !/[a-z0-9]/.test(flat.charAt(s - 1))) { found = s; break }
      }
      if (found < 0) return -1
      next = found
    }
    if (c > 0) gaps += next - pos - 1
    pos = next
  }
  return 300 + Math.min(gaps, 40) * 10
}

// Actions run on Enter, so only rows that open something get typo matches.
function fuzzyEligible(entry) {
  return !!entry && (entry.kind === "app" || entry.kind === "menu" || entry.kind === "link")
}

// Every term must hit fuzzily. Only labels count: fuzzy matching against
// descriptions would surface noise for every three-letter query.
function fuzzyMatch(entry, query) {
  var terms = String(query || "").toLowerCase().trim().split(/\s+/)
  var label = String(entry.label || "")
  var total = 0
  var any = false
  for (var i = 0; i < terms.length; i++) {
    if (!terms[i]) continue
    var p = fuzzyTerm(terms[i], label)
    if (p < 0) return -1
    total += p
    any = true
  }
  return any ? total : -1
}

// Recency-weighted use count: each launch is worth 1, halving every week.
function frecency(store, id, now) {
  var rec = store && store[id]
  if (!rec) return 0
  var age = Math.max(0, now - (rec.last || 0))
  return (rec.score || 0) * Math.pow(0.5, age / HALF_LIFE_MS)
}

function frecencyTiers(store, id, now) {
  var f = frecency(store, id, now)
  if (f <= 0) return 0
  return Math.min(MAX_FRECENCY_TIERS, Math.round(Math.log(1 + f) / Math.LN2 * 4))
}

function record(store, id, now) {
  var next = ({})
  var keys = Object.keys(store || {})
  for (var i = 0; i < keys.length; i++) next[keys[i]] = store[keys[i]]
  next[id] = { score: frecency(store, id, now) + 1, last: now }
  keys = Object.keys(next)
  if (keys.length > MAX_TRACKED) {
    keys.sort(function(a, b) { return frecency(next, a, now) - frecency(next, b, now) })
    for (var k = 0; k < keys.length - MAX_TRACKED; k++) delete next[keys[k]]
  }
  return next
}

function parseStore(raw) {
  if (!raw || raw.length > 262144) return ({})
  try {
    var parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== "object" || parsed instanceof Array) return ({})
    var out = ({})
    var keys = Object.keys(parsed)
    for (var i = 0; i < keys.length && i < MAX_TRACKED; i++) {
      var k = keys[i]
      var rec = parsed[k]
      if (k.length > 200 || !rec || typeof rec.score !== "number" || typeof rec.last !== "number") continue
      if (!isFinite(rec.score) || !isFinite(rec.last)) continue
      out[k] = { score: Math.max(0, Math.min(rec.score, 1e6)), last: rec.last }
    }
    return out
  } catch (e) {
    return ({})
  }
}

// Adjust the stock score (tier * 1000 + depth * 25 + order).
function adjust(entry, query, stockScore, store, now) {
  var score = stockScore
  var needle = String(query || "").toLowerCase().trim()
  if (entry.kind === "app") {
    // A word of the app's name starting with the query beats any menu
    // action whose label merely equals it.
    var ws = words(entry.label)
    for (var i = 0; i < ws.length; i++) {
      if (needle && ws[i].indexOf(needle) === 0) { score = Math.min(score, -1000 + (i > 0 ? 300 : 0)); break }
    }
  }
  if (isDestructive(entry.id)) score += DESTRUCTIVE_PENALTY * 1000
  score -= frecencyTiers(store, entry.id, now) * 1000
  return score
}

// ------------------------------------------------------------ quicklinks
//
// "!g rust ownership" searches Google, "!yt lofi" YouTube, and so on: the
// Walker-era prefixes people carried over (#11580). A bang alone ("!gh")
// lists the known bangs instead.

var BANGS = [
  { bang: "ddg", name: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s" },
  { bang: "g", name: "Google", url: "https://www.google.com/search?q=%s" },
  { bang: "yt", name: "YouTube", url: "https://www.youtube.com/results?search_query=%s" },
  { bang: "gh", name: "GitHub", url: "https://github.com/search?q=%s&type=repositories" },
  { bang: "w", name: "Wikipedia", url: "https://en.wikipedia.org/wiki/Special:Search?search=%s" },
  { bang: "aw", name: "Arch Wiki", url: "https://wiki.archlinux.org/index.php?search=%s" },
  { bang: "aur", name: "AUR", url: "https://aur.archlinux.org/packages?K=%s" },
  { bang: "pkg", name: "Arch packages", url: "https://archlinux.org/packages/?q=%s" },
  { bang: "maps", name: "Maps", url: "https://www.openstreetmap.org/search?query=%s" }
]

// {bang, name, url, terms} for "!x terms", {listing: [...]} for a bare or
// partial "!x", null for anything else.
function parseBang(query) {
  var m = /^!([a-z0-9]*)(?:\s+(.*))?$/i.exec(String(query || "").trim())
  if (!m) return null
  var key = m[1].toLowerCase()
  var terms = (m[2] || "").trim()
  for (var i = 0; i < BANGS.length; i++) {
    if (BANGS[i].bang === key && terms) {
      return { bang: key, name: BANGS[i].name, url: BANGS[i].url.replace("%s", encodeURIComponent(terms)), terms: terms }
    }
  }
  var listing = BANGS.filter(function(b) { return b.bang.indexOf(key) === 0 })
  return { listing: listing, terms: terms }
}
