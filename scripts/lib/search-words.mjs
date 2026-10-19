// Compact search words for the Ctrl+K palette (js/command-palette.js): the
// distinctive words of a writeup or slide, most frequent first, so a search
// for "kerberoast" or "modbus" finds the page without shipping whole bodies.
//
// Spoilers never reach the index: ||hidden|| spans, braced flags
// (THM{...}, HTB{...}, any WORD{...}) and long hex strings (hashes, keys)
// are removed before anything is counted.

const STOP = new Set(`
a about above after again against all also am an and any are as at be because been before being below between both
but by can could did do does doing down during each few for from further had has have having he her here hers him
his how i if in into is it its itself just let me more most my no nor not now of off on once only or other our ours
out over own same she should so some such than that the their theirs them then there these they this those through
to too under until up very was we were what when where which while who whom why will with would you your yours
one two three first second next back get got gets using use used via way well also into onto each per like see
shows show shown run runs ran find found look looked looking need needs needed make makes made take took give gave
here's that's it's i'm i've don't doesn't didn't can't won't isn't wasn't there's let's we're you're they're
writeup room machine challenge task tasks question questions answer answers flag flags step steps part note notes
`.split(/\s+/).filter(Boolean));

export const searchWords = (text, { limit = 300 } = {}) => {
  const clean = String(text || "")
    .replace(/\|\|[\s\S]*?\|\|/g, " ")
    .replace(/\b[A-Za-z0-9_]+\{[^}\n]*\}/g, " ")
    .replace(/\b[0-9a-f]{24,}\b/gi, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .toLowerCase();

  const counts = new Map();
  for (const match of clean.matchAll(/[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*/g)) {
    const word = match[0];
    if (word.length < 3 || word.length > 40 || STOP.has(word)) continue;
    counts.set(word, (counts.get(word) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word)
    .join(" ");
};
