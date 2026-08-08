// Tiny hand-rolled syntax highlighter for the CTF writeups reader.
//
// Token-based: each grammar is an ordered list of { type, pattern } rules.
// The tokenizer walks the source left-to-right, taking the first rule that
// matches at the cursor. Unmatched characters fall through as a plain text run.
//
// Output is a sequence of { type, value } tokens, rendered as
// <span class="tok-<type>">…</span>. Plain text runs are emitted verbatim
// (after HTML escaping).
//
// Adding a language: define a `grammars[name]` entry. Order matters — put
// longer / more specific patterns first (e.g. multi-char operators before
// single-char ones; comments before everything).
//
// Patterns are leading-anchored with ^ and matched against the remaining
// source slice on each step. This is slightly less efficient than sticky-flag
// regex but keeps the rules readable and avoids global-state pitfalls.

const escapeForHtml = (text) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

// --- Grammars ---------------------------------------------------------------

const SHARED = {
  // double- and single-quoted strings, with backslash escapes
  doubleString: { type: "string", pattern: /^"(?:\\.|[^"\\])*"/ },
  singleString: { type: "string", pattern: /^'(?:\\.|[^'\\])*'/ },
  // numbers: int, float, hex
  number: { type: "number", pattern: /^(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?)\b/ },
  whitespace: { type: "text", pattern: /^\s+/ },
};

const grammars = {
  // ---- Splunk SPL ---------------------------------------------------------
  // Highlights commands after the `|` pipe, common functions, time modifiers,
  // field=value pairs.
  spl: [
    { type: "comment", pattern: /^(?:```[\s\S]*?```|\/\/[^\n]*)/ },
    SHARED.doubleString,
    SHARED.singleString,
    {
      type: "keyword",
      pattern:
        /^\b(?:search|where|stats|eval|rex|regex|sort|table|fields|head|tail|dedup|rename|join|append|union|lookup|inputlookup|outputlookup|tstats|datamodel|from|index|sourcetype|source|host|earliest|latest|by|as|over|with|chart|timechart|top|rare|bucket|bin|fillnull|streamstats|eventstats|transaction|mvexpand|mvfilter|spath|xmlkv|kvform|extract|makemv|nomv|format|map|foreach|return|collect|outputcsv|inputcsv|loadjob|sendemail|abstract)\b/,
    },
    {
      type: "builtin",
      pattern:
        /^\b(?:count|sum|avg|max|min|values|dc|distinct_count|first|last|list|median|mode|range|stdev|var|earliest_time|latest_time|now|relative_time|strftime|strptime|tostring|tonumber|isnotnull|isnull|if|case|coalesce|like|match|len|lower|upper|replace|substr|split|trim|round|ceiling|floor|abs|log|sqrt|md5|sha1|sha256|urldecode|json_object|json_extract|mvcount|mvfind|mvindex|mvjoin|mvrange|mvsort|mvzip|cidrmatch)\(/,
    },
    SHARED.number,
    { type: "operator", pattern: /^[|=!<>+\-*/%]+/ },
    { type: "property", pattern: /^[A-Za-z_][\w.]*(?=\s*=)/ },
    { type: "text", pattern: /^[A-Za-z_][\w.]*/ },
    SHARED.whitespace,
  ],

  // ---- PowerShell ---------------------------------------------------------
  powershell: [
    { type: "comment", pattern: /^(?:#[^\n]*|<#[\s\S]*?#>)/ },
    SHARED.doubleString,
    SHARED.singleString,
    // here-strings (basic)
    { type: "string", pattern: /^(?:@"[\s\S]*?"@|@'[\s\S]*?'@)/ },
    // variables — $var, $script:var, ${complex name}
    { type: "variable", pattern: /^\$(?:\{[^}]+\}|[A-Za-z_][\w:]*)/ },
    {
      type: "keyword",
      pattern:
        /^\b(?:if|else|elseif|switch|foreach|for|while|do|until|break|continue|return|try|catch|finally|throw|function|filter|param|begin|process|end|in|true|false|null)\b/i,
    },
    // common cmdlet verbs (Verb-Noun pattern)
    {
      type: "builtin",
      pattern:
        /^\b(?:Get|Set|Add|Remove|New|Start|Stop|Restart|Enable|Disable|Test|Invoke|Out|Write|Read|Select|Sort|Group|Measure|Export|Import|ConvertTo|ConvertFrom|Where|ForEach|Format|Reset|Revoke|Disconnect|Connect|Push|Pop|Use)-[A-Za-z]+/,
    },
    SHARED.number,
    // parameter flags — -Path, -Recurse
    { type: "property", pattern: /^-[A-Za-z]\w*\b(?!\w)/ },
    { type: "operator", pattern: /^-(?:eq|ne|gt|ge|lt|le|like|notlike|match|notmatch|contains|notcontains|in|notin|and|or|not|band|bor|bxor|bnot|replace)\b/ },
    { type: "operator", pattern: /^(?:\|\||&&|::|\.\.|[|=+\-*/%<>!])/ },
    { type: "text", pattern: /^[A-Za-z_]\w*/ },
    SHARED.whitespace,
  ],

  // ---- Bash / shell -------------------------------------------------------
  bash: [
    { type: "comment", pattern: /^#[^\n]*/ },
    SHARED.doubleString,
    SHARED.singleString,
    // here-doc start (basic — highlights the marker)
    { type: "string", pattern: /^<<-?\s*['"]?[A-Za-z_]\w*['"]?/ },
    // variables — $var, ${var}, $1
    { type: "variable", pattern: /^\$(?:\{[^}]+\}|\d+|[A-Za-z_]\w*)/ },
    {
      type: "keyword",
      pattern:
        /^\b(?:if|then|else|elif|fi|case|esac|for|in|do|done|while|until|function|return|break|continue|exit|export|local|readonly|declare|typeset|set|unset|source|alias|trap|wait|true|false)\b/,
    },
    {
      type: "builtin",
      pattern:
        /^\b(?:echo|printf|cat|grep|egrep|fgrep|sed|awk|cut|sort|uniq|head|tail|wc|tr|tee|ls|cp|mv|rm|mkdir|rmdir|touch|chmod|chown|find|xargs|tar|gzip|gunzip|zip|unzip|curl|wget|ssh|scp|rsync|ps|kill|killall|top|df|du|free|date|sleep|read|jq|tshark|tcpdump|zeek|yara|capa|floss|sha256sum|md5sum|openssl|nc|netstat|ss|lsof|systemctl|journalctl|crontab|sudo|chroot|mount|umount|dd|ewfacquire|vol|log2timeline|psort)\b/,
    },
    SHARED.number,
    // short flags -x, long flags --foo
    { type: "property", pattern: /^--?[A-Za-z][\w-]*/ },
    // operators (compound first)
    { type: "operator", pattern: /^(?:&&|\|\||>>|<<|2>&1|[|&;<>(){}[\]=!*])/ },
    { type: "text", pattern: /^[A-Za-z_./][\w./-]*/ },
    SHARED.whitespace,
  ],

  // ---- JSON ---------------------------------------------------------------
  json: [
    { type: "property", pattern: /^"(?:\\.|[^"\\])*"(?=\s*:)/ },
    SHARED.doubleString,
    { type: "number", pattern: /^-?(?:\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/ },
    { type: "keyword", pattern: /^\b(?:true|false|null)\b/ },
    { type: "operator", pattern: /^[{}[\]:,]/ },
    SHARED.whitespace,
  ],

  // ---- KQL (Microsoft Sentinel / Defender) --------------------------------
  kql: [
    { type: "comment", pattern: /^\/\/[^\n]*/ },
    SHARED.doubleString,
    SHARED.singleString,
    {
      type: "keyword",
      pattern:
        /^\b(?:let|where|project|project-away|project-rename|project-reorder|extend|summarize|join|union|order|sort|by|asc|desc|take|top|limit|distinct|render|evaluate|parse|parse-where|mv-expand|mv-apply|make-series|range|datatable|externaldata|lookup|invoke|search|find|fork|facet|getschema|serialize|as|on|kind|step|with|between|and|or|not|in|has|has_any|has_all|has_cs|hasprefix|hassuffix|contains|contains_cs|startswith|endswith|matches|regex)\b/,
    },
    {
      type: "builtin",
      pattern:
        /^\b(?:ago|now|datetime|timespan|bin|floor|ceiling|count|countif|dcount|dcountif|sum|sumif|avg|avgif|min|max|arg_max|arg_min|make_list|make_set|make_bag|percentile|percentiles|strcat|strcat_delim|split|extract|extract_all|parse_json|parse_xml|parse_url|parse_path|parse_user_agent|todynamic|tostring|toint|tolong|todouble|tobool|todatetime|totimespan|tohex|isempty|isnotempty|isnull|isnotnull|iff|iif|case|coalesce|tolower|toupper|trim|trim_start|trim_end|substring|strlen|indexof|replace_string|replace_regex|countof|format_datetime|format_timespan|startofday|endofday|startofweek|startofmonth|dayofweek|hourofday|datetime_diff|datetime_add|hash|hash_sha256|hash_md5|base64_decode_tostring|base64_encode_tostring|geo_info_from_ip_address|ipv4_is_private|ipv4_is_in_range|pack|pack_array|bag_pack|bag_keys|array_length|array_sort_asc|array_sort_desc|set_has_element|column_ifexists|materialize|toscalar|row_number|prev|next|series_decompose_anomalies)\(/,
    },
    // timespan literals — 7d, 24h, 90m, 30s, 500ms
    { type: "number", pattern: /^\d+(?:\.\d+)?(?:ms|[dhms])\b/ },
    SHARED.number,
    { type: "operator", pattern: /^(?:\|+|==|!=|=~|!~|<=|>=|<>|\.\.|[=<>+\-*/%!])/ },
    { type: "property", pattern: /^[A-Za-z_]\w*(?=\s*=(?!=|~))/ },
    { type: "text", pattern: /^[A-Za-z_][\w.]*/ },
    SHARED.whitespace,
  ],

  // ---- YAML (Sigma rules, configs) -----------------------------------------
  // Keys are matched by a colon lookahead; Sigma's piped modifiers
  // (Image|endswith:) are part of the key. Everything else falls through
  // as plain values.
  yaml: [
    { type: "comment", pattern: /^#[^\n]*/ },
    { type: "property", pattern: /^[A-Za-z_$][\w.|*-]*(?=:(?:\s|$))/ },
    SHARED.doubleString,
    SHARED.singleString,
    { type: "keyword", pattern: /^\b(?:true|false|null|yes|no)\b/i },
    // document markers, anchors, block scalars, list dashes
    { type: "operator", pattern: /^(?:---|\.\.\.|[:>|]|- |[&*][\w-]+)/ },
    SHARED.number,
    { type: "text", pattern: /^[^\s#]+/ },
    SHARED.whitespace,
  ],

  // ---- Python ---------------------------------------------------------------
  python: [
    { type: "comment", pattern: /^#[^\n]*/ },
    // triple-quoted strings first so they swallow internal quotes
    { type: "string", pattern: /^(?:[rbfu]{0,2})(?:"""[\s\S]*?"""|'''[\s\S]*?''')/i },
    { type: "string", pattern: /^(?:[rbfu]{0,2})"(?:\\.|[^"\\])*"/i },
    { type: "string", pattern: /^(?:[rbfu]{0,2})'(?:\\.|[^'\\])*'/i },
    { type: "keyword", pattern: /^\b(?:def|class|return|yield|lambda|if|elif|else|for|while|break|continue|pass|import|from|as|with|try|except|finally|raise|assert|global|nonlocal|del|in|is|not|and|or|None|True|False|async|await|match|case)\b/ },
    {
      type: "builtin",
      pattern:
        /^\b(?:print|len|range|enumerate|zip|map|filter|sorted|reversed|open|input|int|str|float|bool|list|dict|set|tuple|bytes|bytearray|type|isinstance|hasattr|getattr|setattr|repr|abs|min|max|sum|round|hex|oct|bin|ord|chr|format|any|all|next|iter|super|id|vars|dir|exit)\b(?=\()/,
    },
    { type: "variable", pattern: /^@[A-Za-z_]\w*/ }, // decorators
    SHARED.number,
    { type: "operator", pattern: /^(?:\*\*|\/\/|<<|>>|<=|>=|==|!=|->|:=|[+\-*/%=<>!&|^~@])/ },
    { type: "text", pattern: /^[A-Za-z_]\w*/ },
    SHARED.whitespace,
  ],

  // ---- PHP ------------------------------------------------------------------
  php: [
    { type: "comment", pattern: /^(?:\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)/ },
    SHARED.doubleString,
    SHARED.singleString,
    { type: "variable", pattern: /^\$[A-Za-z_]\w*/ },
    { type: "keyword", pattern: /^(?:<\?php|\?>)/ },
    {
      type: "keyword",
      pattern:
        /^\b(?:if|else|elseif|switch|case|default|for|foreach|while|do|break|continue|return|function|class|interface|trait|extends|implements|public|private|protected|static|const|new|echo|print|require|require_once|include|include_once|namespace|use|as|try|catch|finally|throw|global|true|false|null|array|isset|unset|empty|die|exit)\b/i,
    },
    {
      type: "builtin",
      pattern:
        /^\b(?:strlen|strpos|substr|str_replace|preg_match|preg_replace|explode|implode|trim|strtolower|strtoupper|sprintf|printf|count|in_array|array_keys|array_values|array_merge|json_encode|json_decode|file_get_contents|file_put_contents|fopen|fread|fwrite|fclose|header|htmlspecialchars|urlencode|urldecode|base64_encode|base64_decode|md5|sha1|hash|system|exec|shell_exec|passthru|eval)\b(?=\()/i,
    },
    SHARED.number,
    { type: "operator", pattern: /^(?:===|!==|<=>|->|=>|::|\+\+|--|&&|\|\||[+\-*/%=<>!.&|^~?:])/ },
    { type: "text", pattern: /^[A-Za-z_]\w*/ },
    SHARED.whitespace,
  ],

  // ---- JavaScript / TypeScript --------------------------------------------
  javascript: [
    { type: "comment", pattern: /^(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/)/ },
    // template literal first so it swallows internal quotes
    { type: "string", pattern: /^`(?:\\.|[^`\\])*`/ },
    SHARED.doubleString,
    SHARED.singleString,
    {
      type: "keyword",
      pattern:
        /^\b(?:var|let|const|function|return|if|else|for|while|do|break|continue|switch|case|default|throw|try|catch|finally|new|delete|typeof|instanceof|in|of|void|yield|async|await|class|extends|super|this|import|export|from|as|null|undefined|true|false|interface|type|enum|implements|public|private|protected|readonly)\b/,
    },
    {
      type: "builtin",
      pattern:
        /^\b(?:console|document|window|globalThis|Math|JSON|Object|Array|String|Number|Boolean|Date|RegExp|Map|Set|WeakMap|WeakSet|Promise|Symbol|Proxy|Reflect|Error|parseInt|parseFloat|isNaN|isFinite|encodeURIComponent|decodeURIComponent|encodeURI|decodeURI|fetch|setTimeout|setInterval|clearTimeout|clearInterval|alert|require|module|exports|process|atob|btoa)\b/,
    },
    SHARED.number,
    { type: "operator", pattern: /^(?:===|!==|==|!=|<=|>=|=>|\+\+|--|&&|\|\||\?\?|\.\.\.|[+\-*/%=<>!&|^~?:.])/ },
    { type: "text", pattern: /^[A-Za-z_$][\w$]*/ },
    SHARED.whitespace,
  ],

  // ---- SQL ------------------------------------------------------------------
  // Keywords are case-insensitive; functions matched by a paren lookahead.
  sql: [
    { type: "comment", pattern: /^(?:--[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)/ },
    SHARED.singleString,
    { type: "string", pattern: /^"(?:\\.|[^"\\])*"/ },
    {
      type: "keyword",
      pattern:
        /^\b(?:select|from|where|insert|into|values|update|set|delete|create|alter|drop|truncate|table|database|schema|index|view|join|inner|left|right|outer|full|cross|natural|on|using|union|intersect|except|all|distinct|group|by|order|having|limit|offset|fetch|asc|desc|as|and|or|not|in|is|null|like|ilike|between|exists|any|some|case|when|then|else|end|primary|key|foreign|references|default|unique|check|constraint|auto_increment|grant|revoke|with|begin|commit|rollback|transaction|declare|cast|convert|if|while|return)\b/i,
    },
    {
      type: "builtin",
      pattern:
        /^\b(?:count|sum|avg|min|max|coalesce|nullif|concat|concat_ws|substring|substr|left|right|length|len|char_length|lower|upper|trim|ltrim|rtrim|lpad|rpad|replace|reverse|now|current_timestamp|current_date|current_user|getdate|datediff|dateadd|date_format|extract|year|month|day|round|floor|ceil|ceiling|abs|mod|power|sqrt|rand|md5|sha1|sha2|hex|unhex|version|user|database|schema_name|group_concat|string_agg|array_agg|row_number|rank|dense_rank|ntile|over|partition)\b(?=\s*\()/i,
    },
    SHARED.number,
    { type: "operator", pattern: /^(?:<=|>=|<>|!=|\|\||::|[=<>+\-*/%,;().])/ },
    { type: "text", pattern: /^[A-Za-z_][\w$]*/ },
    SHARED.whitespace,
  ],

  // ---- HTTP (raw request / response) --------------------------------------
  // Line-oriented: method + version as anchors, Header-Name: as a property.
  http: [
    { type: "keyword", pattern: /^\b(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT)\b/ },
    { type: "builtin", pattern: /^HTTP\/\d(?:\.\d)?/ },
    SHARED.doubleString,
    SHARED.singleString,
    // header name sitting immediately before its colon
    { type: "property", pattern: /^[A-Za-z][A-Za-z0-9-]*(?=:)/ },
    SHARED.number,
    { type: "operator", pattern: /^[:?&=/]/ },
    { type: "text", pattern: /^[^\s:?&=/]+/ },
    SHARED.whitespace,
  ],

  // ---- x86 / x86-64 assembly ----------------------------------------------
  asm: [
    { type: "comment", pattern: /^(?:;[^\n]*|#[^\n]*|\/\/[^\n]*)/ },
    SHARED.doubleString,
    SHARED.singleString,
    // labels — a name immediately followed by a colon
    { type: "property", pattern: /^[A-Za-z_.$][\w.$]*:/ },
    // directives and operand-size keywords
    {
      type: "builtin",
      pattern:
        /^(?:\.[A-Za-z]\w*|\b(?:section|segment|global|globl|extern|public|db|dw|dd|dq|dt|resb|resw|resd|resq|equ|times|align|byte|word|dword|qword|tword|ptr|offset|org)\b)/i,
    },
    // registers
    {
      type: "variable",
      pattern:
        /^\b(?:r[abcd]x|r[sd]i|r[bs]p|r(?:8|9|1[0-5])[dwb]?|e?[abcd]x|e?[sd]i|e?[bs]p|[abcd][lh]|[cdefgs]s|rip|eip|ip|[xy]mm\d+|cr\d|dr\d)\b/i,
    },
    // mnemonics
    {
      type: "keyword",
      pattern:
        /^\b(?:mov(?:zx|sx)?|lea|push|pop|pusha[dq]?|popa[dq]?|pushf[dq]?|popf[dq]?|add|adc|sub|sbb|i?mul|i?div|inc|dec|neg|not|and|or|xor|shl|shr|sal|sar|rol|ror|rcl|rcr|cmp|test|bt|bts|btr|jmp|je|jne|jz|jnz|jg|jge|jl|jle|ja|jae|jb|jbe|jc|jnc|jo|jno|js|jns|jp|jnp|loop|call|ret|retn|leave|enter|nop|int3?|into|iret[dq]?|syscall|sysenter|sysret|cdq|cqo|cbw|cwde|cdqe|set[a-z]+|cmov[a-z]+|rep|repe|repne|repnz|movs[bwdq]?|stos[bwdq]?|lods[bwdq]?|scas[bwdq]?|cmps[bwdq]?|in|out|hlt|cli|sti|cld|std|clc|stc|cmc|xchg|xadd|cmpxchg|bswap|fld|fst|fstp|fadd|fsub|fmul|fdiv)\b/i,
    },
    { type: "number", pattern: /^(?:0x[0-9a-fA-F]+|\b\d[0-9a-fA-F]*h\b|\b[01]+b\b|\b\d+\b)/i },
    { type: "operator", pattern: /^[[\]+\-*,:]/ },
    { type: "text", pattern: /^[A-Za-z_.$][\w.$]*/ },
    SHARED.whitespace,
  ],
};

const ALIASES = {
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  terminal: "bash",
  ps1: "powershell",
  pwsh: "powershell",
  splunk: "spl",
  kusto: "kql",
  yml: "yaml",
  py: "python",
  python3: "python",
  js: "javascript",
  ts: "javascript",
  typescript: "javascript",
  jsx: "javascript",
  tsx: "javascript",
  node: "javascript",
  mysql: "sql",
  postgres: "sql",
  postgresql: "sql",
  psql: "sql",
  sqlite: "sql",
  tsql: "sql",
  https: "http",
  x86: "asm",
  x86asm: "asm",
  "x86-64": "asm",
  x64: "asm",
  nasm: "asm",
  gas: "asm",
  disasm: "asm",
  assembly: "asm",
};

// --- Tokenizer -------------------------------------------------------------

const tokenize = (source, languageName) => {
  const language = grammars[ALIASES[languageName] || languageName];
  if (!language) return [{ type: "text", value: source }];

  const tokens = [];
  let remaining = source;
  let pending = "";

  while (remaining.length > 0) {
    let matched = false;
    for (const rule of language) {
      const m = remaining.match(rule.pattern);
      if (m && m.index === 0) {
        if (pending) {
          tokens.push({ type: "text", value: pending });
          pending = "";
        }
        tokens.push({ type: rule.type, value: m[0] });
        remaining = remaining.slice(m[0].length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      pending += remaining[0];
      remaining = remaining.slice(1);
    }
  }
  if (pending) tokens.push({ type: "text", value: pending });
  return tokens;
};

const renderTokens = (tokens) =>
  tokens
    .map(({ type, value }) =>
      type === "text"
        ? escapeForHtml(value)
        : `<span class="tok-${type}">${escapeForHtml(value)}</span>`
    )
    .join("");

// --- Public API ------------------------------------------------------------

// Highlights a single <code> element if it has a language-* class.
// Idempotent — already-highlighted elements are skipped.
export const highlightElement = (codeEl) => {
  if (!(codeEl instanceof HTMLElement)) return;
  if (codeEl.dataset.highlighted === "true") return;

  const match = /(?:^|\s)language-([\w-]+)/.exec(codeEl.className);
  if (!match) return;

  const language = match[1].toLowerCase();
  if (!grammars[ALIASES[language] || language]) return;

  // textContent gives us the raw, unescaped source — perfect for tokenising
  const source = codeEl.textContent || "";
  const tokens = tokenize(source, language);
  // Safe: every value passes through escapeForHtml before being wrapped in a
  // span. No untrusted HTML is interpolated.
  codeEl.innerHTML = renderTokens(tokens);
  codeEl.dataset.highlighted = "true";
};

// Highlights every <code class="language-*"> under a root element.
export const highlightAllIn = (root) => {
  if (!(root instanceof Element || root instanceof Document)) return;
  root.querySelectorAll('code[class*="language-"]').forEach(highlightElement);
};
