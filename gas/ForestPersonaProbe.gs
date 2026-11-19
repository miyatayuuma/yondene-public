var ForestPersonaProbe = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // gas/ForestPersonaProbe.mjs
  var ForestPersonaProbe_exports = {};
  __export(ForestPersonaProbe_exports, {
    compactProbeStorage: () => compactProbeStorage,
    previewForestProfile: () => previewForestProfile,
    probeConversation: () => probeConversation,
    probeInput: () => probeInput,
    processQueue: () => processQueue
  });

  // reading-shelf-firebase/forest-character-registry.mjs
  var FIRST_PERSON = {
    king: ["\u307C\u304F", "\u50D5", "\u304A\u308C", "\u4FFA", "\u308F\u305F\u3057", "\u79C1", "\u3042\u305F\u3057", "\u304A\u3089"],
    kiki: ["\u307C\u304F", "\u50D5", "\u304A\u308C", "\u4FFA", "\u304A\u308C\u3055\u307E", "\u4FFA\u69D8", "\u304A\u3089", "\u4F59"],
    jiji: ["\u308F\u305F\u3057", "\u79C1", "\u3042\u305F\u3057", "\u304A\u308C", "\u4FFA", "\u304A\u308C\u3055\u307E", "\u4FFA\u69D8", "\u304A\u3089", "\u4F59"],
    skipper: ["\u308F\u305F\u3057", "\u79C1", "\u3042\u305F\u3057", "\u304A\u308C", "\u4FFA", "\u304A\u308C\u3055\u307E", "\u4FFA\u69D8", "\u304A\u3089", "\u4F59"],
    zorori: ["\u307C\u304F", "\u50D5", "\u308F\u305F\u3057", "\u79C1", "\u3042\u305F\u3057", "\u304A\u3089", "\u4F59"],
    ishishi: ["\u307C\u304F", "\u50D5", "\u308F\u305F\u3057", "\u79C1", "\u3042\u305F\u3057", "\u304A\u308C", "\u4FFA", "\u304A\u308C\u3055\u307E", "\u4FFA\u69D8", "\u4F59"],
    noshishi: ["\u307C\u304F", "\u50D5", "\u308F\u305F\u3057", "\u79C1", "\u3042\u305F\u3057", "\u304A\u308C", "\u4FFA", "\u304A\u308C\u3055\u307E", "\u4FFA\u69D8", "\u4F59"]
  };
  var roster = [
    {
      id: "king",
      name: "\u738B\u3055\u307E",
      aliases: ["\u738B\u3055\u307E", "\u738B\u69D8"],
      related: ["cat"],
      actor: { x: -22, z: 17, scale: 1.2, roamRadius: 5, walkSpeed: 1.1 },
      voice: { rate: 1.34, pitch: 0.88 },
      mode: "ai",
      goodbye: "\u7D9A\u304D\u306F\u307E\u305F\u4ECA\u5EA6\u3060\u3002\u9054\u8005\u3067\u306A\uFF01"
    },
    {
      id: "cat",
      name: "\u306D\u3053",
      aliases: ["\u306D\u3053"],
      related: ["king"],
      actor: { x: -49, z: 23, scale: 0.7, roamRadius: 5, walkSpeed: 1.35 },
      mode: "silent",
      outputMode: "action-writing"
    },
    {
      id: "kiki",
      name: "\u30AD\u30AD",
      aliases: ["\u30AD\u30AD"],
      related: ["jiji"],
      actor: { x: 24, z: 9, scale: 1, roamRadius: 5, walkSpeed: 1.3 },
      voice: { rate: 1.48, pitch: 1.13 },
      mode: "ai",
      goodbye: "\u3058\u3083\u3042\u3001\u307E\u305F\u68EE\u3067\u4F1A\u304A\u3046\u306D\uFF01"
    },
    {
      id: "jiji",
      name: "\u30B8\u30B8",
      aliases: ["\u30B8\u30B8"],
      related: ["kiki"],
      actor: { x: 29, z: 13, scale: 0.5, roamRadius: 3.8, walkSpeed: 1.65 },
      voice: { rate: 1.42, pitch: 0.98 },
      mode: "ai",
      goodbye: "\u307E\u305F\u306D\u3002\u6C17\u3092\u3064\u3051\u3066\u6B69\u304F\u3093\u3060\u3088\u3002"
    },
    {
      id: "skipper",
      name: "\u30B9\u30AD\u30C3\u30D1\u30FC",
      aliases: ["\u30B9\u30AD\u30C3\u30D1\u30FC"],
      related: ["twins"],
      actor: { x: 41, z: -10, scale: 0.8, roamRadius: 6, walkSpeed: 1.15 },
      voice: { rate: 1.38, pitch: 0.93 },
      mode: "ai",
      goodbye: "\u307E\u305F\u3044\u3063\u3057\u3087\u306B\u63A2\u691C\u3057\u3088\u3046\uFF01"
    },
    {
      id: "twins",
      name: "\u3075\u305F\u3054",
      aliases: ["\u3075\u305F\u3054", "\u53CC\u5B50"],
      related: ["skipper"],
      actor: { x: 52, z: 30, scale: 0.8, roamRadius: 4.5, walkSpeed: 1.2, groupId: "twins" },
      additionalActors: [{
        id: "twins_second",
        dialogueId: "twins",
        spriteId: "twins",
        name: "\u3075\u305F\u3054",
        groupId: "twins",
        x: 56,
        z: 33,
        scale: 0.8,
        roamRadius: 4.5,
        walkSpeed: 1.2
      }],
      voiceId: "twins_first",
      voice: { rate: 1.45, pitch: 1.16 },
      voiceLabel: "\u3075\u305F\u3054\uFF082\u4EBA\u5171\u901A\uFF09",
      mode: "twins"
    },
    {
      id: "zorori",
      name: "\u30BE\u30ED\u30EA",
      aliases: ["\u30BE\u30ED\u30EA"],
      related: ["ishishi", "noshishi"],
      actor: { x: -72, z: -8, scale: 1.2, roamRadius: 7, walkSpeed: 1.35 },
      voice: { rate: 1.52, pitch: 0.91 },
      mode: "ai",
      goodbye: "\u6B21\u306F\u3082\u3063\u3068\u9762\u767D\u3044\u8A71\u3092\u3057\u3066\u3084\u308B\u305C\uFF01"
    },
    {
      id: "ishishi",
      name: "\u30A4\u30B7\u30B7",
      aliases: ["\u30A4\u30B7\u30B7"],
      related: ["zorori", "noshishi"],
      actor: { x: 61, z: 60, scale: 0.8, roamRadius: 4, walkSpeed: 1.2 },
      voice: { rate: 1.48, pitch: 1.08 },
      voiceLabel: "\u30A4\u30B7\u30B7\u30FB\u30CE\u30B7\u30B7\uFF08\u5171\u901A\uFF09",
      mode: "ai",
      goodbye: "\u3058\u3083\u3042\u306A\uFF01\u307E\u305F\u904A\u307C\u3046\u305C\uFF01"
    },
    {
      id: "noshishi",
      name: "\u30CE\u30B7\u30B7",
      aliases: ["\u30CE\u30B7\u30B7"],
      related: ["zorori", "ishishi"],
      actor: { x: 66, z: 62, scale: 0.8, roamRadius: 4, walkSpeed: 1.2 },
      voiceId: "ishishi",
      mode: "ai",
      goodbye: "\u307E\u305F\u306D\u3002\u306E\u3093\u3073\u308A\u5F85\u3063\u3066\u308B\u3088\u3002"
    },
    {
      id: "hachibee",
      name: "\u30CF\u30C1\u30D9\u30A8",
      aliases: ["\u30CF\u30C1\u30D9\u30A8"],
      related: ["hakase", "mochan"],
      actor: { x: -28, z: 41, scale: 0.77, roamRadius: 4, walkSpeed: 1.5 },
      sprite: "optional",
      voice: { rate: 1.55, pitch: 1.12 },
      mode: "ai",
      goodbye: "\u3058\u3083\u3042\u306A\uFF01\u3000\u304A\u308C\u3001\u3082\u3046\u5C11\u3057\u68EE\u3092\u898B\u3066\u304F\u308B\u305C\u3002"
    },
    {
      id: "hakase",
      name: "\u30CF\u30AB\u30BB",
      aliases: ["\u30CF\u30AB\u30BB"],
      related: ["hachibee", "mochan"],
      actor: { x: -33, z: 43, scale: 0.85, roamRadius: 3.5, walkSpeed: 1.15 },
      sprite: "optional",
      voice: { rate: 1.41, pitch: 1.02 },
      mode: "ai",
      goodbye: "\u307E\u305F\u306D\u3002\u6B21\u306F\u5225\u306E\u624B\u304C\u304B\u308A\u3082\u898B\u3064\u304B\u308B\u3068\u3044\u3044\u306A\u3002"
    },
    {
      id: "mochan",
      name: "\u30E2\u30FC\u3061\u3083\u3093",
      aliases: ["\u30E2\u30FC\u3061\u3083\u3093"],
      related: ["hachibee", "hakase"],
      actor: { x: -37, z: 47, scale: 1.03, roamRadius: 3, walkSpeed: 0.88 },
      sprite: "optional",
      voice: { rate: 1.32, pitch: 0.92 },
      mode: "ai",
      goodbye: "\u307E\u305F\u306D\u3002\u307C\u304F\u3001\u3053\u3053\u3067\u3082\u3046\u5C11\u3057\u4F11\u3093\u3067\u3044\u304F\u3088\u3002"
    }
  ];
  var rosterIdentity = roster.map((item) => [
    item.id,
    item.mode,
    item.sprite || "required"
  ].join(":")).join("|");
  var rosterHash = 2166136261;
  for (const char of rosterIdentity) rosterHash = Math.imul(rosterHash ^ char.charCodeAt(0), 16777619);
  var FOREST_ROSTER_REVISION = (rosterHash >>> 0).toString(36);
  var FOREST_CHARACTER_REGISTRY = Object.freeze(roster.map((item) => Object.freeze(item)));
  var FOREST_CHARACTER_IDS = Object.freeze(roster.map((item) => item.id));
  var FOREST_AI_SPEAKER_IDS = Object.freeze(roster.filter((item) => item.mode === "ai").map((item) => item.id));
  var FOREST_ACTION_WRITING_IDS = Object.freeze(roster.filter((item) => item.outputMode === "action-writing").map((item) => item.id));
  var FOREST_AI_GENERATION_IDS = Object.freeze(roster.filter((item) => item.mode === "ai" || item.mode === "twins" || item.outputMode === "action-writing").map((item) => item.id));
  var FOREST_MULTI_SPEAKER_IDS = Object.freeze(roster.filter((item) => item.mode === "twins").map((item) => item.id));
  var FOREST_ACTORS = Object.freeze(roster.flatMap((item) => [
    {
      id: item.id,
      name: item.name,
      ...item.actor,
      ...item.sprite === "optional" ? { requiresSprite: true } : {}
    },
    ...item.additionalActors || []
  ]));
  var FOREST_REQUIRED_SPRITE_NAMES = Object.freeze([
    ...roster.filter((item) => item.sprite !== "optional").map((item) => item.id),
    "player_cat",
    "player_rabbit"
  ]);
  var FOREST_OPTIONAL_SPRITE_NAMES = Object.freeze(
    roster.filter((item) => item.sprite === "optional").map((item) => item.id)
  );
  var FOREST_ACTOR_NAMES = Object.freeze(Object.fromEntries(
    roster.map((item) => [item.id, [item.id, ...item.aliases || []]])
  ));
  var FOREST_RELATIONS = Object.freeze(Object.fromEntries(
    roster.filter((item) => item.related?.length).map((item) => [item.id, [...item.related]])
  ));
  var FOREST_SELF_NAMES = Object.freeze(Object.fromEntries(
    roster.filter((item) => item.mode === "ai").map((item) => [item.id, item.name])
  ));
  var FOREST_GOODBYES = Object.freeze(Object.fromEntries(
    roster.filter((item) => item.goodbye).map((item) => [item.id, item.goodbye])
  ));
  var FOREST_WRONG_FIRST_PERSON = Object.freeze(FIRST_PERSON);
  var FOREST_VOICE_ALIASES = Object.freeze(Object.fromEntries([
    ...roster.filter((item) => item.voiceId && item.voiceId !== item.id).map((item) => [item.id, item.voiceId]),
    ...roster.flatMap((item) => (item.additionalActors || []).map((actor) => [actor.id, item.voiceId || item.id]))
  ]));
  var FOREST_DEFAULT_VOICES = Object.freeze(Object.fromEntries(
    roster.filter((item) => item.voice).map((item) => [
      item.voiceId || item.id,
      { ...item.voice, volume: 1, voiceURI: "" }
    ])
  ));
  var FOREST_VOICE_CHARACTERS = Object.freeze([
    ...roster.filter((item) => item.mode === "ai" && item.voice && !item.voiceId).map((item) => ({ id: item.id, name: item.voiceLabel || item.name })),
    ...roster.filter((item) => item.mode === "twins" && item.voice).map((item) => ({ id: item.voiceId || item.id, name: item.voiceLabel || item.name }))
  ]);
  var FOREST_DISPLAY_NAMES = Object.freeze(Object.fromEntries(
    roster.map(({ id, name }) => [id, name])
  ));
  function canonicalForestMention(text, speakers = []) {
    if (typeof text !== "string" || Array.isArray(speakers) && speakers.some((speaker) => speaker?.name?.includes?.("\u30CF\u30C1\u30D3\u30FC"))) return text;
    return text.replace(/(?<![ァ-ヿー])ハチビー(?![ァ-ヿー])/gu, FOREST_DISPLAY_NAMES.hachibee);
  }
  var FOREST_DIALOGUE_PROTOCOL = "scene-dialogue-v36-profile2";
  function forestMemoryBelongsToCharacter(memory, characterId) {
    const names = FOREST_ACTOR_NAMES[characterId] || [];
    return String(memory?.characters || "").split(/[\s,，、|;；]+/u).some((name) => names.includes(name));
  }

  // reading-shelf-firebase/book-forest-character-profiles.mjs
  var CHARACTER_IDS = new Set(FOREST_CHARACTER_IDS);
  var ACTION_WRITING_IDS = new Set(FOREST_ACTION_WRITING_IDS);
  var AI_IDS = new Set(FOREST_AI_GENERATION_IDS);
  var FOREST_PROFILE_SCHEMA = 2;
  var FOREST_PROFILE_ROWS = 2e3;
  var FOREST_PROFILE_HEADERS = [
    "NPC ID",
    "\u9805\u76EE",
    "\u5185\u5BB9",
    "\u6839\u62E0\u533A\u5206",
    "\u6839\u62E0\u8CC7\u6599ID",
    "\u9069\u7528\u7BC4\u56F2",
    "\u76E3\u4FEE\u72B6\u614B",
    "\u8A2D\u5B9A\u7248"
  ];
  var FOREST_PROFILE_FIELDS = {
    summary: "\u4EBA\u7269\u50CF",
    values: "\u4FA1\u5024\u89B3",
    motivation: "\u52D5\u6A5F",
    relationships: "\u95A2\u4FC2\u6027",
    behavior: "\u884C\u52D5",
    reactions: "\u53CD\u5FDC",
    firstPerson: "\u4E00\u4EBA\u79F0",
    address: "\u547C\u79F0",
    cadence: "\u53E3\u8ABF",
    endings: "\u8A9E\u5C3E",
    habits: "\u7656\u306E\u983B\u5EA6",
    expression: "\u8A00\u3044\u56DE\u3057",
    emotion: "\u611F\u60C5\u5909\u5316",
    avoid: "\u7981\u6B62\u30FB\u6CE8\u610F"
  };
  var BASES = /* @__PURE__ */ new Set(["\u539F\u4F5C\u672C\u6587", "\u516C\u5F0F\u8CC7\u6599", "\u4E8C\u6B21\u8CC7\u6599", "\u7DE8\u96C6\u89E3\u91C8", "\u30B2\u30FC\u30E0\u6F14\u51FA"]);
  var REVIEWS = /* @__PURE__ */ new Set(["\u78BA\u8A8D\u6E08", "\u66AB\u5B9A\u63A1\u7528"]);
  var METADATA = /* @__PURE__ */ new Set(["\u8868\u793A\u540D", "\u4F5C\u54C1\u30FB\u7248", "\u76E3\u4FEE\u30E1\u30E2"]);
  var NORMALIZE = (value) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/gu, " ").trim().replace(/\s+/gu, " ");
  var FIELD_KEYS = Object.keys(FOREST_PROFILE_FIELDS);
  var KEY_BY_LABEL = Object.fromEntries(Object.entries(FOREST_PROFILE_FIELDS).map(([k, v]) => [v, k]));
  function fingerprint(value) {
    let a = 2166136261, b = 5381;
    for (const c of JSON.stringify(value)) {
      const n = c.codePointAt(0);
      a = Math.imul(a ^ n, 16777619);
      b = Math.imul(b, 33) ^ n;
    }
    return "profile2-" + (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
  }
  function profileError(id, reason) {
    throw Error("\u4EBA\u7269\u8A2D\u5B9A " + id + ": " + reason);
  }
  function parseForestCharacterProfiles(rows, sources = []) {
    if (!Array.isArray(rows) || !Array.isArray(rows[0])) return [];
    const headers = rows[0].map(NORMALIZE);
    if (FOREST_PROFILE_HEADERS.some((h) => !headers.includes(h))) throw Error("\u4EBA\u7269\u8A2D\u5B9A\u306E\u30D8\u30C3\u30C0\u30FC\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093");
    if (rows.length > FOREST_PROFILE_ROWS + 1) throw Error("\u4EBA\u7269\u8A2D\u5B9A\u306E\u884C\u6570\u4E0A\u9650\u3092\u8D85\u3048\u3066\u3044\u307E\u3059");
    const sourceIds = new Set(sources.map((s) => s.id));
    const people = /* @__PURE__ */ new Map();
    for (const row of rows.slice(1)) {
      if (!Array.isArray(row) || row.every((v) => !NORMALIZE(v))) continue;
      const [id, field, text, basis, refs, scope, review, version] = FOREST_PROFILE_HEADERS.map((h) => NORMALIZE(row[headers.indexOf(h)]));
      if (!CHARACTER_IDS.has(id)) continue;
      if (METADATA.has(field)) continue;
      const key = KEY_BY_LABEL[field];
      if (!key) profileError(id, "\u4E0D\u660E\u306A\u9805\u76EE");
      if (!text || text.length > 1200 || !scope || scope.length > 200 || !version || version.length > 80)
        profileError(id, "\u5185\u5BB9\u30FB\u9069\u7528\u7BC4\u56F2\u30FB\u8A2D\u5B9A\u7248\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044\uFF08\u81EA\u52D5\u5207\u6368\u3066\u306F\u3057\u307E\u305B\u3093\uFF09");
      if (!BASES.has(basis) || !REVIEWS.has(review)) profileError(id, "\u6839\u62E0\u533A\u5206\u30FB\u76E3\u4FEE\u72B6\u614B\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044");
      if (review === "\u78BA\u8A8D\u6E08" && ["\u7DE8\u96C6\u89E3\u91C8", "\u30B2\u30FC\u30E0\u6F14\u51FA"].includes(basis))
        profileError(id, "\u89E3\u91C8\u30FB\u6F14\u51FA\u306F\u539F\u4F5C\u78BA\u8A8D\u6E08\u306B\u3067\u304D\u307E\u305B\u3093");
      const sourceRefs = [...new Set(refs.split(/[,、\s]+/u).filter(Boolean))];
      if (sourceRefs.some((ref) => !sourceIds.has(ref)) || review === "\u78BA\u8A8D\u6E08" && sourceRefs.some((ref) => sources.find((s) => s.id === ref)?.status !== "\u78BA\u8A8D\u6E08") || ["\u539F\u4F5C\u672C\u6587", "\u516C\u5F0F\u8CC7\u6599", "\u4E8C\u6B21\u8CC7\u6599"].includes(basis) && !sourceRefs.length)
        profileError(id, "\u6839\u62E0\u8CC7\u6599ID\u3092\u78BA\u8A8D\u3057\u3066\u304F\u3060\u3055\u3044");
      if (!people.has(id)) people.set(id, { id, schemaVersion: FOREST_PROFILE_SCHEMA, version, claims: [] });
      const p = people.get(id);
      if (p.version !== version || p.claims.some((c) => c.key === key)) profileError(id, "\u9805\u76EE\u91CD\u8907\u307E\u305F\u306F\u8A2D\u5B9A\u7248\u306E\u4E0D\u4E00\u81F4");
      p.claims.push({ key, text, basis, sourceRefs, scope, review });
    }
    return [...people.values()].map((p) => {
      p.claims.sort((a, b) => FIELD_KEYS.indexOf(a.key) - FIELD_KEYS.indexOf(b.key));
      for (const c of p.claims) p[c.key] = c.text;
      for (const k of FIELD_KEYS) if (p[k] === void 0) p[k] = "";
      const used = new Set(p.claims.flatMap((c) => c.sourceRefs));
      p.sources = sources.filter((s) => used.has(s.id)).map(({ id, kind, status }) => ({ id, kind, status }));
      p.review = p.claims.some((c) => c.review === "\u66AB\u5B9A\u63A1\u7528") ? "\u66AB\u5B9A\u4E8B\u9805\u3042\u308A" : "\u78BA\u8A8D\u6E08";
      p.revision = fingerprint([p.id, p.version, p.claims, p.sources]);
      if (!validForestCharacterProfiles([p]).length) profileError(p.id, "\u5FC5\u9808\u9805\u76EE\u4E0D\u8DB3\u307E\u305F\u306F\u751F\u6210\u5165\u529B\u306E\u4E0A\u9650\u8D85\u904E");
      return p;
    });
  }
  function parseForestProfileSources(rows) {
    if (!Array.isArray(rows) || !Array.isArray(rows[0])) return [];
    const headers = rows[0].map(NORMALIZE), required = ["\u8CC7\u6599ID", "\u6839\u62E0\u306E\u7A2E\u5225", "\u78BA\u8A8D\u72B6\u614B"];
    if (required.some((h) => !headers.includes(h))) throw Error("\u6839\u62E0\u8CC7\u6599\u306E\u30D8\u30C3\u30C0\u30FC\u304C\u6B63\u3057\u304F\u3042\u308A\u307E\u305B\u3093");
    const ids = /* @__PURE__ */ new Set();
    return rows.slice(1).filter((r) => Array.isArray(r) && NORMALIZE(r[0])).map((row) => {
      const [id, kind, status] = required.map((h) => NORMALIZE(row[headers.indexOf(h)]));
      if (ids.has(id) || !id || !kind || !status) throw Error("\u6839\u62E0\u8CC7\u6599ID\u306E\u91CD\u8907\u307E\u305F\u306F\u8CC7\u6599\u60C5\u5831\u306E\u4E0D\u8DB3");
      ids.add(id);
      return { id, kind, status };
    });
  }
  function guideText(p) {
    return [
      "\u4EBA\u7269\u8A2D\u5B9A\u7248:" + p.version + " / " + p.revision,
      "\u512A\u5148\u9806:\u4FA1\u5024\u89B3\u30FB\u52D5\u6A5F\u30FB\u95A2\u4FC2\u6027\u30FB\u884C\u52D5\u3092\u6838\u306B\u53CD\u5FDC\u3059\u308B\u3002\u8A71\u3057\u65B9\u306F\u305D\u306E\u8868\u73FE\u3002",
      "\u6839\u62E0\u898F\u7D04:\u539F\u4F5C\u672C\u6587\u30FB\u516C\u5F0F\u8CC7\u6599\u30FB\u4E8C\u6B21\u8CC7\u6599\u3092\u533A\u5225\u3002\u7DE8\u96C6\u89E3\u91C8\u30FB\u30B2\u30FC\u30E0\u6F14\u51FA\u30FB\u66AB\u5B9A\u63A1\u7528\u306F\u539F\u4F5C\u78BA\u5B9A\u3067\u306F\u306A\u3044\u3002\u5404\u9069\u7528\u7BC4\u56F2\u3068\u672C\u6587\u306E\u7559\u4FDD\u3092\u5B88\u308A\u3001\u672A\u78BA\u8A8D\u4E8B\u9805\u3092\u65AD\u5B9A\u3057\u306A\u3044\u3002",
      ...p.claims.map((c) => FOREST_PROFILE_FIELDS[c.key] + " [" + c.basis + " / " + c.review + " / " + c.scope + (c.sourceRefs.length ? " / \u8CC7\u6599:" + c.sourceRefs.join(",") : "") + "]:" + c.text),
      ...p.sources.length ? ["\u8CC7\u6599\u306E\u7A2E\u5225\u30FB\u7167\u5408\u72B6\u614B:" + p.sources.map((s) => s.id + "=" + s.kind + "(" + s.status + ")").join(";")] : []
    ].join("\n");
  }
  function validForestCharacterProfiles(profiles) {
    if (!Array.isArray(profiles) || profiles.length > CHARACTER_IDS.size) return [];
    const seen = /* @__PURE__ */ new Set();
    return profiles.filter((p) => {
      if (!p || !CHARACTER_IDS.has(p.id) || seen.has(p.id) || p.schemaVersion !== FOREST_PROFILE_SCHEMA || typeof p.version !== "string" || !p.version || p.version.length > 80 || !Array.isArray(p.claims) || p.claims.length > FIELD_KEYS.length || !Array.isArray(p.sources) || p.sources.length > 80 || !p.summary || !p.cadence || !p.avoid || !p.firstPerson && !ACTION_WRITING_IDS.has(p.id)) return false;
      const keys = /* @__PURE__ */ new Set();
      for (const c of p.claims) {
        if (!c || !FIELD_KEYS.includes(c.key) || keys.has(c.key) || typeof c.text !== "string" || !c.text || c.text.length > 1200 || p[c.key] !== c.text || !BASES.has(c.basis) || !REVIEWS.has(c.review) || !c.scope || c.scope.length > 200 || !Array.isArray(c.sourceRefs) || c.sourceRefs.some((ref) => !p.sources.some((s) => s.id === ref)) || ["\u539F\u4F5C\u672C\u6587", "\u516C\u5F0F\u8CC7\u6599", "\u4E8C\u6B21\u8CC7\u6599"].includes(c.basis) && !c.sourceRefs.length || c.review === "\u78BA\u8A8D\u6E08" && c.sourceRefs.some((ref) => p.sources.find((s) => s.id === ref)?.status !== "\u78BA\u8A8D\u6E08") || c.review === "\u78BA\u8A8D\u6E08" && ["\u7DE8\u96C6\u89E3\u91C8", "\u30B2\u30FC\u30E0\u6F14\u51FA"].includes(c.basis)) return false;
        keys.add(c.key);
      }
      if (FIELD_KEYS.some((k) => typeof p[k] !== "string" || p[k] && !keys.has(k)) || p.sources.some((s) => typeof s.id !== "string" || typeof s.kind !== "string" || typeof s.status !== "string") || p.revision !== fingerprint([p.id, p.version, p.claims, p.sources]) || guideText(p).length > 6e3) return false;
      seen.add(p.id);
      return true;
    });
  }
  function forestCharacterVoiceGuide(profile) {
    return validForestCharacterProfiles([profile]).length ? guideText(profile) : "";
  }

  // reading-shelf-firebase/book-forest-story-memory.mjs
  var ALLOWED_CHARACTERS = new Set(FOREST_CHARACTER_IDS);
  function parseStoryMemoryRows(values) {
    if (!Array.isArray(values) || !Array.isArray(values[0])) return [];
    const names = values[0].map((value) => String(value ?? ""));
    const required = [
      "schemaVersion",
      "memoryId",
      "bookId",
      "bookTitle",
      "text",
      "tags",
      "characters",
      "spoilerLevel",
      "evidenceStatus",
      "confidence",
      "sourceUrl"
    ];
    if (required.some((key) => !names.includes(key))) return [];
    return values.slice(1).filter(Array.isArray).map((row) => {
      const get2 = (name) => row[names.indexOf(name)];
      return {
        schemaVersion: Number(get2("schemaVersion")),
        id: String(get2("memoryId") ?? ""),
        bookId: String(get2("bookId") ?? ""),
        bookTitle: String(get2("bookTitle") ?? ""),
        text: String(get2("text") ?? ""),
        tags: String(get2("tags") ?? ""),
        characters: String(get2("characters") ?? ""),
        spoilerLevel: Number(get2("spoilerLevel")),
        evidenceStatus: String(get2("evidenceStatus") ?? ""),
        confidence: String(get2("confidence") ?? ""),
        sourceUrl: String(get2("sourceUrl") ?? "")
      };
    }).filter((record) => record.id);
  }
  function unlockedStoryMemories(books, catalog, { maxSpoilerLevel = 2 } = {}) {
    const readableIds = new Set((Array.isArray(books) ? books : []).filter((book) => book?.status === "read" && typeof book?.id === "string" && book.id.length > 0).map((book) => book.id));
    const spoiler = Number.isInteger(maxSpoilerLevel) ? Math.min(3, Math.max(0, maxSpoilerLevel)) : 2;
    const usedIds = /* @__PURE__ */ new Set();
    return (Array.isArray(catalog) ? catalog : []).filter((item) => {
      if (item?.schemaVersion !== 1 || typeof item?.id !== "string" || !item.id || usedIds.has(item.id)) return false;
      if (typeof item.bookId !== "string" || !readableIds.has(item.bookId)) return false;
      if (item.evidenceStatus !== "approved" || !["high", "medium"].includes(item.confidence)) return false;
      if (typeof item.sourceUrl !== "string" || !/^https:\/\/[^\s]+$/iu.test(item.sourceUrl)) return false;
      if (typeof item.text !== "string" || !item.text.trim() || item.text.length > 400) return false;
      if (!Number.isInteger(item.spoilerLevel) || item.spoilerLevel < 0 || item.spoilerLevel > spoiler) return false;
      usedIds.add(item.id);
      return true;
    });
  }

  // reading-shelf-firebase/book-forest-twins.mjs
  var ID = /^[A-Za-z0-9_-]{1,100}$/u;
  var NAME = /^[^「」『』<>\r\n{}]{1,12}$/u;
  var MAX_LINES = 160;
  function validateTwinTurns(turns) {
    if (!Array.isArray(turns) || turns.length !== 2) return null;
    const lines = turns.map((turn) => ({ speakerSlot: turn?.speakerSlot, text: typeof turn?.text === "string" ? turn.text.trim() : "" }));
    if (lines.some((line) => ![1, 2].includes(line.speakerSlot) || typeof line.text !== "string" || line.text.length < 2 || line.text.length > 90 || /[「」『』{}<>\r\n]/u.test(line.text)) || lines[0].speakerSlot === lines[1].speakerSlot || lines[0].text === lines[1].text) return null;
    return lines;
  }
  function twinDialogueFrame(line, names, { next, choices = [], closing = false } = {}) {
    const nameFor = (slot) => slot === 1 ? names.firstName : names.secondName;
    return {
      mode: "twins",
      speakerSlot: line.speakerSlot,
      speakerName: nameFor(line.speakerSlot),
      text: line.text,
      choices: next ? [] : choices,
      conversationComplete: closing && !next,
      ...next ? {
        autoNext: true,
        autoDelayMs: Math.min(5500, 2900 + line.text.length * 65),
        nextSpeakerSlot: next.speakerSlot,
        nextSpeakerName: nameFor(next.speakerSlot)
      } : {}
    };
  }
  var acceptableText = (value) => typeof value === "string" && value.trim().length > 0 && value.length <= 180 && !/[「」<>]/u.test(value) && !/\{(?!firstName\}|secondName\})[^}]*\}/u.test(value);
  var allowedName = (value) => typeof value === "string" && NAME.test(value.trim());
  function validateTwinNamePairs(pairs) {
    if (!Array.isArray(pairs)) return [];
    const ids = /* @__PURE__ */ new Set();
    return pairs.slice(0, 20).filter((pair) => {
      if (pair?.schemaVersion !== 1 || pair.approval !== "approved" || !ID.test(pair.id) || !allowedName(pair.firstName) || !allowedName(pair.secondName) || pair.firstName === pair.secondName || ids.has(pair.id)) return false;
      ids.add(pair.id);
      return true;
    });
  }
  function validLine(line) {
    if (line?.schemaVersion !== 1 || line.approval !== "approved" || !ID.test(line.sceneId) || !Number.isInteger(line.sequence) || line.sequence < 1 || line.sequence > 10 || ![0, 1, 2].includes(line.speakerSlot) || !acceptableText(line.text)) return false;
    if ((line.bookId || line.memoryId) && (!ID.test(line.bookId) || !ID.test(line.memoryId))) return false;
    if (line.choices !== void 0 && (!Array.isArray(line.choices) || line.choices.length > 2 || line.choices.some((choice) => !ID.test(choice?.id) || !acceptableText(choice?.label) || choice.label.length > 24 || ![1, 2].includes(choice?.speakerSlot) || !acceptableText(choice?.text)))) return false;
    return true;
  }
  function validateTwinScenes(lines) {
    if (!Array.isArray(lines)) return [];
    const source = lines.flatMap((item) => Array.isArray(item?.lines) ? item.lines : [item]);
    const groups = /* @__PURE__ */ new Map();
    for (const line of source.slice(0, MAX_LINES)) {
      if (!ID.test(line?.sceneId)) continue;
      if (!groups.has(line.sceneId)) groups.set(line.sceneId, []);
      groups.get(line.sceneId).push(line);
    }
    const scenes = [];
    for (const [id, rows] of groups) {
      rows.sort((a, b) => a.sequence - b.sequence);
      if (rows.length < 3 || rows.length > 10 || rows.some((line, i) => !validLine(line) || line.sequence !== i + 1 || i !== 0 && line.speakerSlot === 0 || (line.bookId || "") !== (rows[0].bookId || "") || (line.memoryId || "") !== (rows[0].memoryId || ""))) continue;
      if (id === "intro" && rows[0].speakerSlot !== 0) continue;
      if (id !== "intro" && rows.some((line) => line.speakerSlot === 0)) continue;
      scenes.push({
        id,
        bookId: rows[0].bookId || null,
        memoryId: rows[0].memoryId || null,
        lines: rows
      });
    }
    return scenes;
  }
  function createTwinConversationDirector({
    getBooks = () => [],
    getCatalog = () => [],
    getNamePairs = () => [],
    getScenes = () => [],
    getPinnedPairId = () => null,
    setPinnedPairId = () => {
    }
  } = {}) {
    let active = null;
    async function allowedScenes() {
      const books = await getBooks(), catalog = await getCatalog();
      const memories = new Map(unlockedStoryMemories(books, catalog).map((item) => [item.id, item]));
      return validateTwinScenes(await getScenes()).filter((scene) => !scene.memoryId || memories.get(scene.memoryId)?.bookId === scene.bookId);
    }
    function nameFor(slot) {
      return slot === 0 ? "\u3075\u305F\u3054" : slot === 1 ? active.names.firstName : active.names.secondName;
    }
    function render(line) {
      const text = line.text.replaceAll("{firstName}", active.names.firstName).replaceAll("{secondName}", active.names.secondName);
      const choices = (line.choices || []).map((choice) => ({ id: choice.id, label: choice.label }));
      active.pendingChoices = line.choices || [];
      const hasNext = active.offset < active.scene.lines.length;
      return {
        mode: "twins",
        speakerName: nameFor(line.speakerSlot),
        speakerSlot: line.speakerSlot,
        text,
        choices,
        ...nextSpeaker(),
        conversationComplete: !hasNext,
        autoNext: hasNext,
        autoDelayMs: choices.length ? 11500 : Math.min(7700, Math.max(3400, 2500 + text.length * 90))
      };
    }
    function chooseEncounterScene(scenes, encounter) {
      const all = scenes.filter((scene) => scene.id !== "intro");
      const ambient = all.filter((scene) => !scene.memoryId), story = all.filter((scene) => scene.memoryId);
      const preferStory = encounter % 3 === 2;
      let pool = preferStory && story.length ? story : ambient.length ? ambient : story;
      if (!pool.length) return null;
      return pool[(encounter - 1) % pool.length];
    }
    function nextSpeaker() {
      const next = active.scene.lines[active.offset];
      return next ? { nextSpeakerName: nameFor(next.speakerSlot), nextSpeakerSlot: next.speakerSlot } : {};
    }
    function advanceLocal() {
      if (!active) return null;
      if (active.offset >= active.scene.lines.length) {
        active = null;
        return null;
      }
      return render(active.scene.lines[active.offset++]);
    }
    return {
      async start({ encounter = 0 } = {}) {
        const names = validateTwinNamePairs(await getNamePairs());
        const scenes = await allowedScenes();
        const introduction = scenes.find((scene2) => scene2.id === "intro");
        if (!names.length || !introduction || scenes.length < 2) {
          active = null;
          return null;
        }
        const scene = encounter === 0 ? introduction : chooseEncounterScene(scenes, encounter);
        if (!scene) {
          active = null;
          return null;
        }
        let pinned = null;
        try {
          pinned = getPinnedPairId();
        } catch {
        }
        const pair = names.find((item) => item.id === pinned) || names[0];
        if (pair.id !== pinned) {
          try {
            setPinnedPairId(pair.id);
          } catch {
          }
        }
        active = { names: pair, scenes, scene, offset: 0, pendingChoices: [] };
        return advanceLocal();
      },
      async advance() {
        if (!active) return null;
        active.scenes = await allowedScenes();
        if (active.scene.memoryId) {
          const stillAllowed = active.scenes.some((scene) => scene.id === active.scene.id);
          if (!stillAllowed) {
            active = null;
            return null;
          }
        }
        return advanceLocal();
      },
      select({ choiceId } = {}) {
        if (!active) return null;
        const choice = active.pendingChoices.find((item) => item.id === choiceId);
        if (!choice) return null;
        active.pendingChoices = [];
        const text = choice.text.replaceAll("{firstName}", active.names.firstName).replaceAll("{secondName}", active.names.secondName);
        const hasNext = active.offset < active.scene.lines.length;
        return {
          mode: "twins",
          speakerName: nameFor(choice.speakerSlot),
          speakerSlot: choice.speakerSlot,
          text,
          ...nextSpeaker(),
          choices: [],
          conversationComplete: !hasNext,
          autoNext: hasNext,
          autoDelayMs: Math.min(6600, 3200 + text.length * 80)
        };
      },
      end() {
        active = null;
      },
      getActiveNames() {
        return active ? { ...active.names } : null;
      }
    };
  }

  // reading-shelf-firebase/book-forest-dialogue-director.mjs
  var CHARACTERS = new Set(FOREST_CHARACTER_IDS);
  var KINDS = /* @__PURE__ */ new Set(["meet", "ambient", "story", "reflection", "relay"]);
  var MAX_CUES = 600;
  var MAX_SEEN = 100;
  var MAX_TEXT = 230;
  var SELF_NAMES = FOREST_SELF_NAMES;
  var validId = (value) => typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
  var normalizeText = (value) => typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : "";
  var relayText = (value) => typeof value === "string" && value.length <= 150 && !/[{}<>]/u.test(value) ? normalizeText(value) : "";
  var numbers = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max ? value : min;
  var unique = (list) => [...new Set(list)];
  function validCue(cue) {
    if (!cue || cue.schemaVersion !== 1 || cue.approval !== "approved" || !validId(cue.id) || !CHARACTERS.has(cue.characterId) || !KINDS.has(cue.kind) || !normalizeText(cue.text) || cue.text.length > MAX_TEXT) return false;
    if (["story", "reflection"].includes(cue.kind) && cue.bookId !== void 0 && !validId(cue.bookId)) return false;
    if (cue.kind === "story" && (!validId(cue.memoryId) || cue.text.includes("{memory}"))) return false;
    if (cue.kind === "story") {
      const text = normalizeText(cue.text);
      const name = SELF_NAMES[cue.characterId];
      if (name && (text.startsWith(name + "\u306F") || text.startsWith(name + "\u304C"))) return false;
      if (cue.characterId === "cat" && (!/^（.*）$/u.test(text) || /[「」]/u.test(text))) return false;
    }
    if (cue.kind === "relay" && !CHARACTERS.has(cue.fromCharacterId)) return false;
    if (cue.memoryId !== void 0 && !validId(cue.memoryId)) return false;
    if (cue.choices !== void 0 && (!Array.isArray(cue.choices) || cue.choices.length > 3 || cue.choices.some((choice) => !validId(choice?.id) || !normalizeText(choice?.label) || choice.label.length > 28 || choice.text !== void 0 && (!normalizeText(choice.text) || choice.text.length > MAX_TEXT) || choice.relayTo !== void 0 && !CHARACTERS.has(choice.relayTo)))) return false;
    return true;
  }
  function validateForestDialogueCues(cues) {
    if (!Array.isArray(cues)) return [];
    const seen = /* @__PURE__ */ new Set();
    return cues.slice(0, MAX_CUES).filter((cue) => {
      if (!validCue(cue) || seen.has(cue.id)) return false;
      seen.add(cue.id);
      return true;
    });
  }
  function emptyState() {
    return {
      version: 1,
      visits: {},
      lastKinds: {},
      seen: [],
      seenMemories: [],
      seenReviews: [],
      recentEncounters: [],
      knownRead: [],
      freshRead: [],
      readInitialized: false,
      pendingRelay: null,
      twinPairId: null
    };
  }
  function parseState(raw) {
    try {
      const value = JSON.parse(raw);
      if (value?.version !== 1) return emptyState();
      const visits = {};
      for (const [id, count] of Object.entries(value.visits || {})) {
        if (CHARACTERS.has(id)) visits[id] = numbers(count, 0, 1e5);
      }
      const lastKinds = {};
      for (const [id, kind] of Object.entries(value.lastKinds || {})) {
        if (CHARACTERS.has(id) && KINDS.has(kind)) lastKinds[id] = kind;
      }
      const ids = (field) => unique((Array.isArray(value[field]) ? value[field] : []).filter(validId)).slice(-MAX_SEEN);
      const relay = value.pendingRelay;
      return {
        version: 1,
        visits,
        lastKinds,
        seen: ids("seen"),
        seenMemories: ids("seenMemories"),
        seenReviews: ids("seenReviews"),
        knownRead: ids("knownRead"),
        freshRead: ids("freshRead"),
        recentEncounters: (Array.isArray(value.recentEncounters) ? value.recentEncounters : []).filter((e) => CHARACTERS.has(e?.npc) && KINDS.has(e.kind) && (!e.memoryId || validId(e.memoryId))).slice(-24),
        readInitialized: value.readInitialized === true,
        twinPairId: validId(value.twinPairId) ? value.twinPairId : null,
        pendingRelay: CHARACTERS.has(relay?.to) && CHARACTERS.has(relay?.from) ? {
          from: relay.from,
          to: relay.to,
          memoryId: validId(relay.memoryId) ? relay.memoryId : null,
          ...relayText(relay.message) ? { message: relayText(relay.message) } : {}
        } : null
      };
    } catch {
      return emptyState();
    }
  }
  function remember(items, id) {
    if (validId(id)) {
      const index = items.indexOf(id);
      if (index !== -1) items.splice(index, 1);
      items.push(id);
      if (items.length > MAX_SEEN) items.shift();
    }
  }
  function safeReview(entry) {
    if (!validId(entry?.id) || !["verbatim", "parent-summary"].includes(entry?.attribution)) return null;
    const quote = normalizeText(entry.quote || entry.text);
    if (!quote || quote.length > 3e3) return null;
    return { id: entry.id, attribution: entry.attribution, quote };
  }
  function reviewExcerpt(review, narration = false) {
    const short = review.quote.slice(0, 45).replace(/[「」]/gu, "");
    if (narration) return `\u300C${short}${review.quote.length > 45 ? "\u2026" : ""}\u300D\uFF08${review.attribution === "verbatim" ? "\u672C\u4EBA\u306E\u8A00\u8449" : "\u4FDD\u8B77\u8005\u306E\u8A18\u9332"}\uFF09`;
    const label = review.attribution === "verbatim" ? "\u304D\u307F\u306E\u3053\u3068\u3070" : "\u304A\u3046\u3061\u306E\u4EBA\u304C\u6B8B\u3057\u305F\u8A18\u9332";
    return `${label}\u306B\u300C${short}${review.quote.length > 45 ? "\u2026" : ""}\u300D\u3068\u3042\u3063\u305F\u306D\u3002`;
  }
  function createForestDialogueDirector({
    getBooks = () => [],
    getCatalog = () => [],
    getCues = () => [],
    getReflections = async () => [],
    getTwinNames = () => [],
    getTwinScenes = () => [],
    storage = null,
    storageKey = "forest-dialogue-local-v1",
    maxSpoilerLevel = 2
  } = {}) {
    let state = parseState(storage?.getItem?.(storageKey) || null), active = null;
    const twins = createTwinConversationDirector({
      getBooks,
      getCatalog,
      getNamePairs: getTwinNames,
      getScenes: getTwinScenes,
      getPinnedPairId: () => state.twinPairId,
      setPinnedPairId: (id) => {
        if (validId(id) && state.twinPairId !== id) {
          state.twinPairId = id;
          persist();
        }
      }
    });
    function persist() {
      try {
        storage?.setItem?.(storageKey, JSON.stringify(state));
      } catch {
      }
    }
    function memoryPenalty(memoryId, characterId) {
      const recent = state.recentEncounters.slice().reverse();
      const own = recent.filter((e) => e.npc === characterId);
      const distance = own.findIndex((e) => e.memoryId === memoryId);
      return (distance < 0 ? 0 : Math.max(0, 50 - distance * 12)) + (recent.slice(0, 2).some((e) => e.npc !== characterId && e.memoryId === memoryId) ? 12 : 0);
    }
    async function candidates(characterId, generation = false) {
      const books = await getBooks(), catalog = await getCatalog();
      const readable = new Set((Array.isArray(books) ? books : []).filter((book) => book?.status === "read" && validId(book.id)).map((book) => book.id));
      if (!state.readInitialized) {
        state.knownRead = [...readable].slice(-MAX_SEEN);
        state.readInitialized = true;
      } else {
        const previous = new Set(state.knownRead);
        for (const bookId of readable) {
          if (!previous.has(bookId)) remember(state.freshRead, bookId);
        }
        state.knownRead = [...readable].slice(-MAX_SEEN);
        state.freshRead = state.freshRead.filter((bookId) => readable.has(bookId));
      }
      persist();
      const memories = unlockedStoryMemories(books, catalog, { maxSpoilerLevel });
      const memoryById = new Map(memories.map((item) => [item.id, item]));
      const approved = validateForestDialogueCues(await getCues());
      const relevant = approved.filter((cue) => cue.characterId === characterId);
      if (generation && FOREST_AI_GENERATION_IDS.includes(characterId)) {
        const visit = state.visits[characterId] || 0, last = state.lastKinds[characterId];
        const options2 = [];
        const add = (kind, score, memory = null, relayMessage = "") => {
          const fallback = approved.find((cue2) => cue2.characterId === characterId && cue2.kind === kind && (kind === "story" ? cue2.memoryId === memory?.id : !cue2.bookId && !cue2.memoryId) && (kind !== "relay" || cue2.fromCharacterId === state.pendingRelay?.from) && !cue2.text.includes("{reflection}") && !cue2.text.includes("{memory}"));
          const related = (FOREST_RELATIONS[characterId] || []).find((id) => id !== characterId);
          const relay = related && kind !== "meet" && kind !== "relay" ? {
            id: "scene-relay",
            label: FOREST_DISPLAY_NAMES[related] + "\u3078\u306E\u4F1D\u8A00\u3092\u805E\u304F",
            relayTo: related
          } : null;
          const cue = {
            id: "scene-" + characterId + "-" + kind,
            characterId,
            kind,
            text: fallback?.text || (characterId === "cat" ? "\uFF08\u306D\u3053\u306F\u524D\u8DB3\u3067\u5730\u9762\u3092\u3061\u3087\u3093\u3068\u305F\u305F\u3044\u305F\u3002\uFF09" : "\uFF08\u68EE\u306E\u98A8\u306B\u3001\u305D\u3063\u3068\u8033\u3092\u3059\u307E\u305B\u3066\u3044\u308B\u3002\uFF09"),
            choices: [{ id: "another-topic", label: "\u307B\u304B\u306E\u8A71\u3082\u805E\u304F" }, ...relay ? [relay] : []]
          };
          options2.push({
            cue,
            memory,
            relayMessage,
            index: options2.length,
            score,
            situation: {
              place: "\u672C\u306E\u68EE",
              presentNpcIds: characterId === "twins" ? ["twins", "twins_second"] : [characterId],
              firstEncounter: visit === 0,
              visitNumber: visit + 1,
              focus: kind === "ambient" ? visit % 2 ? "character" : "forest" : kind,
              ...kind === "relay" ? { fromNpc: state.pendingRelay.from } : {},
              relatedNpcIds: FOREST_RELATIONS[characterId] || []
            }
          });
        };
        if (!visit) add("meet", 200);
        if (state.pendingRelay?.to === characterId) {
          const { memoryId, message } = state.pendingRelay;
          const memory = memoryById.get(memoryId);
          add(
            "relay",
            220,
            memory && forestMemoryBelongsToCharacter(memory, characterId) ? memory : null,
            !memoryId || memory ? message : ""
          );
        }
        add("ambient", 70);
        for (const memory of memories.filter((item) => forestMemoryBelongsToCharacter(item, characterId))) {
          add("story", 90 + (state.freshRead.includes(memory.bookId) ? 30 : 0) - memoryPenalty(memory.id, characterId) - (last === "story" ? 55 : 0), memory);
        }
        return options2.sort((a, b) => b.score - a.score || a.index - b.index);
      }
      const relayTargets = /* @__PURE__ */ new Map();
      for (const voice of approved.filter((cue) => cue.kind === "story" && memoryById.has(cue.memoryId))) {
        if (!relayTargets.has(voice.memoryId)) relayTargets.set(voice.memoryId, /* @__PURE__ */ new Set());
        relayTargets.get(voice.memoryId).add(voice.characterId);
      }
      const voicedMemories = new Map(relevant.filter((cue) => cue.kind === "story").map((cue) => [cue.memoryId, cue]));
      const reviewBooks = unique(relevant.filter((cue) => cue.kind === "reflection" && cue.bookId && readable.has(cue.bookId)).map((cue) => cue.bookId)).slice(0, 5);
      const reviews = /* @__PURE__ */ new Map();
      await Promise.all(reviewBooks.map(async (bookId) => {
        try {
          reviews.set(bookId, (await getReflections(bookId)).map(safeReview).filter(Boolean).slice(0, 5));
        } catch {
          reviews.set(bookId, []);
        }
      }));
      const options = [], lastKind = state.lastKinds[characterId];
      for (const [index, cue] of relevant.entries()) {
        if (cue.kind === "meet" && (state.visits[characterId] || 0) > 0) continue;
        if (cue.kind === "relay" && !(state.pendingRelay?.to === characterId && state.pendingRelay?.from === cue.fromCharacterId)) continue;
        if (cue.kind === "relay") {
          const related = memoryById.get(state.pendingRelay?.memoryId) || null;
          if (related && !voicedMemories.has(related.id)) {
            state.pendingRelay = null;
            persist();
            continue;
          }
          options.push({
            cue,
            memory: related,
            voiceCue: related ? voicedMemories.get(related.id) : null,
            relayTargets,
            index,
            score: 150 + (related ? 4 : 0)
          });
          continue;
        }
        if (cue.kind === "story") {
          const matches = [memoryById.get(cue.memoryId)].filter((memory) => memory && (!cue.bookId || cue.bookId === memory.bookId));
          for (const memory of matches) {
            const relevance = String(memory.characters || "").split(/[\s,，、|]+/u).includes(characterId) ? 6 : 0;
            options.push({ cue, memory, relayTargets, index, score: 66 + relevance + (state.seenMemories.includes(memory.id) ? -35 : 22) + (state.seen.includes(cue.id) ? -12 : 0) + (lastKind === "story" ? -45 : lastKind === "ambient" ? 18 : 0) + (state.freshRead.includes(memory.bookId) ? 42 : 0) });
          }
          continue;
        }
        if (cue.kind === "reflection") {
          for (const review of reviews.get(cue.bookId) || []) {
            options.push({ cue, review, index, score: 82 + (state.seenReviews.includes(review.id) ? -65 : 60) + (state.seen.includes(cue.id) ? -12 : 0) + (lastKind === "reflection" ? -120 : 0) });
          }
          continue;
        }
        const base = { meet: 160, ambient: 40 }[cue.kind];
        options.push({ cue, index, score: base + (state.seen.includes(cue.id) ? -12 : 20) + (cue.kind === "ambient" && lastKind === "ambient" ? -12 : 0) });
      }
      return options.sort((a, b) => b.score - a.score || a.index - b.index || String(a.memory?.id || a.review?.id || "").localeCompare(String(b.memory?.id || b.review?.id || "")));
    }
    function render(option) {
      const { cue, memory, review, voiceCue, relayTargets, situation, relayMessage } = option;
      let text = normalizeText(cue.text);
      if (cue.kind === "story" && !memory) return null;
      if (cue.kind === "relay") {
        if (memory && text.includes("{memory}") && !voiceCue) return null;
        text = text.replaceAll("{memory}", normalizeText(voiceCue?.text));
      }
      if (review) text = text.replaceAll("{reflection}", reviewExcerpt(review, cue.characterId === "cat"));
      if (/\{(?:memory|reflection)\}/u.test(text)) return null;
      const choices = (cue.choices || []).filter((choice) => situation || !choice.relayTo || !memory || relayTargets?.get(memory.id)?.has(choice.relayTo)).map((choice) => ({
        id: choice.id,
        label: choice.label,
        ...choice.relayTo ? { relayTo: choice.relayTo } : {}
      }));
      if (!choices.length) choices.push({ id: "another-topic", label: "\u307B\u304B\u306E\u8A71\u3082\u805E\u304F" });
      return {
        text,
        choices,
        sourceKind: cue.kind,
        ...situation ? { situation } : {},
        ...memory?.id ? { sourceMemoryId: memory.id } : {},
        ...relayMessage ? { relayMessage } : {}
      };
    }
    function selectOption(option, characterId) {
      const response = render(option);
      if (!response) return null;
      active = { characterId, option, choices: response.choices, committed: false };
      if (!option.situation) commitActive();
      return response;
    }
    function commitActive() {
      if (!active || active.committed) return;
      active.committed = true;
      const { option, characterId } = active;
      remember(state.seen, option.cue.id);
      state.lastKinds[characterId] = option.cue.kind;
      if (option.memory) remember(state.seenMemories, option.memory.id);
      if (option.cue.kind === "story" && option.memory) {
        state.freshRead = state.freshRead.filter((id) => id !== option.memory.bookId);
      }
      if (option.review) remember(state.seenReviews, option.review.id);
      if (option.cue.kind === "relay") state.pendingRelay = null;
      state.recentEncounters.push({
        npc: characterId,
        kind: option.cue.kind,
        ...option.memory ? { memoryId: option.memory.id } : {}
      });
      state.recentEncounters = state.recentEncounters.slice(-24);
      if (option.situation) state.visits[characterId] = numbers((state.visits[characterId] || 0) + 1, 0, 1e5);
      persist();
    }
    async function nextTopic(characterId, excludeKey = "", preferredMemoryId = "", generation = false) {
      const options = await candidates(characterId, generation);
      const preferred = preferredMemoryId && (!generation || state.visits[characterId]) && options.find((option) => option.cue.kind === "story" && option.memory?.id === preferredMemoryId && render(option));
      const picked = preferred || options.find((option) => `${option.cue.id}:${option.memory?.id || option.review?.id || ""}` !== excludeKey && render(option)) || options.find((option) => render(option));
      if (picked) return selectOption(picked, characterId);
      active = null;
      return { text: characterId === "cat" ? "\uFF08\u306D\u3053\u306F\u3057\u3063\u307D\u3092\u3086\u3063\u304F\u308A\u632F\u3063\u3066\u3001\u68EE\u306E\u5965\u3092\u898B\u3064\u3081\u3066\u3044\u308B\u3002\uFF09" : "\u3044\u307E\u306F\u3001\u68EE\u3092\u3044\u3063\u3057\u3087\u306B\u6B69\u3044\u3066\u307F\u3088\u3046\u3002", choices: [] };
    }
    return {
      setRelayMessage({ from, to, text }) {
        const relay = state.pendingRelay, message = relayText(text);
        if (!message || relay?.from !== from || relay.to !== to) return;
        relay.message = message;
        persist();
      },
      async start({ characterId, preferredMemoryId = "", generation = false } = {}) {
        if (!CHARACTERS.has(characterId)) return { text: "\u307E\u305F\u3001\u68EE\u3067\u4F1A\u304A\u3046\u306D\u3002", choices: [] };
        active = null;
        if (characterId === "twins" && !generation) {
          const result2 = await twins.start({ encounter: state.visits.twins || 0 });
          if (result2) {
            state.visits.twins = numbers((state.visits.twins || 0) + 1, 0, 1e5);
            persist();
            return result2;
          }
        }
        const result = await nextTopic(characterId, "", preferredMemoryId, generation);
        if (!generation) {
          state.visits[characterId] = numbers((state.visits[characterId] || 0) + 1, 0, 1e5);
          persist();
        }
        return result;
      },
      async twinNames() {
        const pairs = validateTwinNamePairs(await getTwinNames());
        return pairs.find((pair) => pair.id === state.twinPairId) || pairs[0] || null;
      },
      pinTwinNames(pair) {
        if (validId(pair?.id) && state.twinPairId !== pair.id) {
          state.twinPairId = pair.id;
          persist();
        }
      },
      onDisplayed(result, { characterId } = {}) {
        if (active?.characterId === characterId && result?.situation) commitActive();
      },
      async select({ characterId, choiceId } = {}) {
        if (characterId === "twins" && twins.getActiveNames()) return twins.select({ choiceId });
        if (!active || active.characterId !== characterId || !active.choices.some((choice2) => choice2.id === choiceId)) return null;
        const { option } = active;
        if (choiceId === "another-topic") {
          const key = `${option.cue.id}:${option.memory?.id || option.review?.id || ""}`;
          return nextTopic(characterId, key);
        }
        const choice = option.cue.choices?.find((item) => item.id === choiceId);
        if (!choice) return null;
        if (choice.relayTo && choice.relayTo !== characterId) {
          state.pendingRelay = {
            from: characterId,
            to: choice.relayTo,
            memoryId: option.memory?.id || null
          };
          persist();
          active.choices = [];
          return { text: normalizeText(choice.text), choices: [], conversationComplete: true };
        }
        const response = normalizeText(choice.text);
        if (response) {
          active.choices = [];
          return { text: response, choices: [] };
        }
        return nextTopic(characterId, `${option.cue.id}:${option.memory?.id || option.review?.id || ""}`);
      },
      async advance({ characterId } = {}) {
        return characterId === "twins" ? twins.advance() : null;
      },
      end() {
        active = null;
        twins.end();
      },
      // Expose only a count summary for developer tests, never raw reviews.
      getProgress() {
        return {
          visits: { ...state.visits },
          seenTopics: state.seen.length,
          seenMemories: state.seenMemories.length,
          seenReflections: state.seenReviews.length,
          nextNpc: state.pendingRelay?.to || null
        };
      }
    };
  }

  // reading-shelf-firebase/book-forest-private-dialogue.mjs
  function parseChoices(value) {
    if (!value) return [];
    try {
      const choices = JSON.parse(value);
      return Array.isArray(choices) ? choices : [];
    } catch {
      return [];
    }
  }
  function parseForestDialogueRows(values) {
    if (!Array.isArray(values) || !Array.isArray(values[0])) return [];
    const header = values[0].map(String);
    const names = [
      "schemaVersion",
      "cueId",
      "npcId",
      "kind",
      "bookId",
      "memoryId",
      "fromNpc",
      "text",
      "choicesJson",
      "approval"
    ];
    if (names.some((name) => !header.includes(name))) return [];
    const result = values.slice(1).filter(Array.isArray).map((row) => {
      const field = (name) => String(row[header.indexOf(name)] ?? "").trim();
      const cue = {
        schemaVersion: Number(field("schemaVersion")),
        id: field("cueId"),
        characterId: field("npcId"),
        kind: field("kind"),
        text: field("text"),
        approval: field("approval"),
        choices: parseChoices(field("choicesJson"))
      };
      if (field("bookId")) cue.bookId = field("bookId");
      if (field("memoryId")) cue.memoryId = field("memoryId");
      if (field("fromNpc")) cue.fromCharacterId = field("fromNpc");
      return cue;
    });
    return validateForestDialogueCues(result);
  }
  function rowObjects(values, columns) {
    if (!Array.isArray(values) || !Array.isArray(values[0])) return [];
    const header = values[0].map(String);
    if (columns.some((column) => !header.includes(column))) return [];
    return values.slice(1).filter(Array.isArray).map((row) => Object.fromEntries(columns.map((column) => [column, row[header.indexOf(column)] ?? ""])));
  }
  function parseTwinNameRows(values) {
    const rows = rowObjects(values, ["schemaVersion", "pairId", "firstName", "secondName", "approval"]);
    return validateTwinNamePairs(rows.map((row) => ({
      schemaVersion: Number(row.schemaVersion),
      id: String(row.pairId),
      firstName: String(row.firstName).trim(),
      secondName: String(row.secondName).trim(),
      approval: String(row.approval)
    })));
  }
  function parseTwinSceneRows(values) {
    const rows = rowObjects(values, [
      "schemaVersion",
      "sceneId",
      "sequence",
      "speakerSlot",
      "text",
      "bookId",
      "memoryId",
      "choicesJson",
      "approval"
    ]);
    return validateTwinScenes(rows.map((row) => ({
      schemaVersion: Number(row.schemaVersion),
      sceneId: String(row.sceneId),
      sequence: Number(row.sequence),
      speakerSlot: Number(row.speakerSlot),
      text: String(row.text),
      ...row.bookId ? { bookId: String(row.bookId) } : {},
      ...row.memoryId ? { memoryId: String(row.memoryId) } : {},
      choices: parseChoices(String(row.choicesJson)),
      approval: String(row.approval)
    })));
  }

  // reading-shelf-firebase/book-forest-reflection-spotlight.mjs
  var GENERATORS = new Set(FOREST_AI_GENERATION_IDS);
  var MAX_FRESH_DAYS = 14;
  var DAY_MS = 864e5;
  var ARCHIVE_COOLDOWN = 7 * DAY_MS;
  var forestReflectionArchiveCutoff = (now) => now - MAX_FRESH_DAYS * DAY_MS;
  var KEY = /^[a-z0-9]{1,12}$/u;
  var clean = (value, max) => String(value ?? "").trim().replace(/\s+/gu, " ").slice(0, max);
  var dayJapan = (now) => new Date(now + 9 * 36e5).toISOString().slice(0, 10);
  function hash(value) {
    let n = 2166136261;
    for (const char of String(value)) n = Math.imul(n ^ char.codePointAt(0), 16777619);
    return (n >>> 0).toString(36);
  }
  function validKeys(value, limit = 250) {
    return [...new Set((Array.isArray(value) ? value : []).filter((x) => typeof x === "string" && KEY.test(x)))].slice(-limit);
  }
  function load(storage, key, now) {
    let raw;
    try {
      raw = JSON.parse(storage?.getItem?.(key) || "null");
    } catch {
    }
    const acknowledged = raw?.version === 2 ? validKeys(raw.acknowledged) : raw?.version === 1 && raw.seen && typeof raw.seen === "object" ? validKeys(Object.values(raw.seen).flatMap((x) => Array.isArray(x) ? x : [])) : [];
    const day = dayJapan(now);
    const active = raw?.version === 2 && raw.day === day;
    const archiveUsage = Object.fromEntries(Object.entries(raw?.archiveUsage || {}).filter(([key2, at]) => KEY.test(key2) && Number.isFinite(at) && at > now - ARCHIVE_COOLDOWN && at <= now).slice(-80));
    return {
      version: 2,
      day,
      acknowledged,
      archiveUsage,
      visits: active && Number.isSafeInteger(raw.visits) ? Math.max(0, raw.visits) : 0,
      lastReactionVisit: active && Number.isSafeInteger(raw.lastReactionVisit) ? Math.max(0, raw.lastReactionVisit) : 0,
      reactors: active ? Array.isArray(raw.reactors) ? raw.reactors.filter((x) => GENERATORS.has(x)) : [] : [],
      books: active ? validKeys(raw.books, 20) : []
    };
  }
  function save(storage, key, state) {
    try {
      storage?.setItem?.(key, JSON.stringify(state));
    } catch {
    }
  }
  function stamp(value) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }
  function affinityFor(bookId, characterId, memories, cues) {
    if (memories.some((memory) => memory.bookId === bookId && forestMemoryBelongsToCharacter(memory, characterId)))
      return 2;
    const relatedMemories = new Set(memories.filter((memory) => memory.bookId === bookId).map((m) => m.id));
    if ((Array.isArray(cues) ? cues : []).some((cue) => cue?.approval === "approved" && cue.characterId === characterId && cue.kind === "story" && (cue.bookId === bookId || relatedMemories.has(cue.memoryId)))) return 1;
    return 0;
  }
  function archiveScope({ characterId, books, catalog, cues, sourceMemoryId }, state) {
    const memories = unlockedStoryMemories(books, catalog);
    const sourceBook = memories.find((memory) => memory.id === sourceMemoryId)?.bookId;
    return books.filter((book) => book?.status === "read" && !state.archiveUsage?.[hash(book.id)]).map((book) => ({ id: book.id, affinity: book.id === sourceBook ? 3 : affinityFor(book.id, characterId, memories, cues) })).filter((item) => item.affinity > 0).sort((a, b) => b.affinity - a.affinity || hash(state.day + ":" + characterId + ":" + a.id).localeCompare(hash(state.day + ":" + characterId + ":" + b.id))).slice(0, 2);
  }
  function mayReact(characterId, state) {
    return GENERATORS.has(characterId) && !(state.reactors || []).includes(characterId) && // At least two ambient encounters between review conversations.
    !(state.lastReactionVisit > 0 && (state.visits || 0) - state.lastReactionVisit < 2);
  }
  function chooseForestReflectionSpotlight({
    characterId,
    books = [],
    reflections = [],
    catalog = [],
    cues = [],
    state = {},
    now = Date.now(),
    archiveBooks = null
  } = {}) {
    if (!mayReact(characterId, state) || !Array.isArray(reflections)) return null;
    const readBooks = new Map((Array.isArray(books) ? books : []).filter((book) => book?.status === "read" && typeof book.id === "string").map((book) => [book.id, book]));
    const memories = unlockedStoryMemories(books, catalog);
    const acknowledged = new Set(state.acknowledged || []);
    const discussedBooks = new Set(state.books || []);
    const candidates = [];
    for (const review of reflections) {
      if (!review || !readBooks.has(review.bookId) || !["verbatim", "parent-summary"].includes(review.attribution) || typeof review.id !== "string" || !review.id) continue;
      const at = stamp(review.createdAt);
      const ageDays = (now - at) / DAY_MS;
      const archiveAffinity = archiveBooks?.find((book2) => book2.id === review.bookId)?.affinity;
      if (!at || (archiveBooks ? ageDays <= MAX_FRESH_DAYS || !archiveAffinity : ageDays < -1 || ageDays > MAX_FRESH_DAYS)) continue;
      const quote = clean(review.quote, 180);
      if (!quote) continue;
      const key = hash(review.bookId + ":" + review.id);
      const bookKey = hash(review.bookId);
      if (discussedBooks.has(bookKey) || !archiveBooks && acknowledged.has(key)) continue;
      const book = readBooks.get(review.bookId);
      const affinity = affinityFor(review.bookId, characterId, memories, cues);
      const incident = memories.find((memory) => memory.bookId === review.bookId && forestMemoryBelongsToCharacter(memory, characterId)) || memories.find((memory) => memory.bookId === review.bookId);
      candidates.push({
        key,
        bookKey,
        sourceBookId: review.bookId,
        sourceReflectionId: review.id,
        ...archiveBooks ? { kind: "reading-memory" } : {},
        createdAt: at,
        // Recency dominates, with a modest bonus for an actual character relation.
        score: archiveBooks ? archiveAffinity : Math.round((MAX_FRESH_DAYS - ageDays) * 5) + affinity * 18,
        bookTitle: clean(book.title, 80),
        summary: /^https:\/\/[^\s]+$/u.test(book.synopsisSourceUrl || "") ? clean(book.synopsis, 260) : "",
        storyContext: incident ? clean(incident.text, 160) : "",
        quote,
        attribution: review.attribution,
        perspective: affinity ? "\u3053\u306E\u672C\u3068\u95A2\u4FC2\u306E\u3042\u308B\u4EBA\u7269\u3002\u305F\u3060\u3057\u539F\u4F5C\u3067\u78BA\u8A8D\u3067\u304D\u306A\u3044\u51FA\u6765\u4E8B\u306F\u7D4C\u9A13\u3057\u305F\u3068\u8A9E\u3089\u306A\u3044\u3002" : "\u4ED6\u306E\u4F5C\u54C1\u3078\u306E\u611F\u60F3\u3092\u805E\u3044\u305F\u7B2C\u4E09\u8005\u3002\u7269\u8A9E\u306E\u767B\u5834\u4EBA\u7269\u3060\u3063\u305F\u3075\u308A\u3092\u3057\u306A\u3044\u3002"
      });
    }
    candidates.sort((a, b) => b.score - a.score || b.createdAt - a.createdAt || a.key.localeCompare(b.key));
    if (!candidates.length) return null;
    const { score, createdAt, ...selected } = candidates[0];
    return selected;
  }
  function isCurrentForestReflection(evidence, { books = [], reflections = [] } = {}) {
    return books.some((book) => book.id === evidence?.sourceBookId && book.status === "read") && reflections.some((review) => review.bookId === evidence.sourceBookId && hash(review.bookId + ":" + review.id) === evidence.key && review.attribution === evidence.attribution && clean(review.quote, 180) === evidence.quote);
  }
  function createForestReflectionSpotlightSession({
    storage = null,
    storageKey = "forest-reflection-reactions-v1",
    now = () => Date.now()
  } = {}) {
    function archiveBooks(input) {
      const state = load(storage, storageKey, now());
      return mayReact(input.characterId, state) ? archiveScope(input, state) : [];
    }
    function choose({ characterId, books = [], reflections = [], catalog = [], cues = [], archiveBooks: archiveBooks2 = null } = {}) {
      return chooseForestReflectionSpotlight({
        characterId,
        books,
        reflections,
        catalog,
        cues,
        state: load(storage, storageKey, now()),
        now: now(),
        archiveBooks: archiveBooks2
      });
    }
    function visited() {
      const state = load(storage, storageKey, now());
      state.visits++;
      save(storage, storageKey, state);
    }
    function displayed(characterId, spotlight) {
      if (!GENERATORS.has(characterId) || !KEY.test(spotlight?.key || "") || !KEY.test(spotlight?.bookKey || "")) return;
      const state = load(storage, storageKey, now());
      if (spotlight.kind === "reading-memory") state.archiveUsage[spotlight.bookKey] = now();
      else state.acknowledged = validKeys([...state.acknowledged, spotlight.key]);
      state.books = validKeys([...state.books, spotlight.bookKey], 20);
      state.reactors = [.../* @__PURE__ */ new Set([...state.reactors, characterId])];
      state.lastReactionVisit = state.visits;
      save(storage, storageKey, state);
    }
    return { choose, archiveBooks, visited, displayed };
  }

  // reading-shelf-firebase/book-forest-daily-context.mjs
  var DAY_MS2 = 864e5;
  var MAX_EVENTS = 24;
  var MAX_RECENT = 8;
  var ACTOR_NAMES = FOREST_ACTOR_NAMES;
  var RELATIONS = FOREST_RELATIONS;
  var dayJapan2 = (timestamp) => new Date(timestamp + 9 * 36e5).toISOString().slice(0, 10);
  var dayNumber = (day) => Math.floor(Date.parse(day + "T00:00:00Z") / DAY_MS2);
  var clean2 = (value, max = 32) => String(value ?? "").trim().replace(/\s+/gu, " ").slice(0, max);
  function hash2(value) {
    let n = 2166136261;
    for (const char of String(value)) n = Math.imul(n ^ char.codePointAt(0), 16777619);
    return n >>> 0;
  }
  function read(storage, key) {
    try {
      return JSON.parse(storage?.getItem?.(key) || "null") || {};
    } catch {
      return {};
    }
  }
  function write(storage, key, value) {
    try {
      storage?.setItem?.(key, JSON.stringify(value));
    } catch {
    }
  }
  function recentReadBonus(book, day) {
    const finished = String(book?.finishedAt || "").slice(0, 10);
    if (!/^\d{4}-\d{2}(?:-\d{2})?$/u.test(finished)) return 0;
    const exact = finished.length === 7 ? finished + "-01" : finished;
    const age = dayNumber(day) - dayNumber(exact);
    return age >= 0 && age <= 21 ? 22 : 0;
  }
  function eligibleForestDailyTopics({ characterId, books = [], catalog = [], cues = [], now = Date.now() } = {}) {
    if (!ACTOR_NAMES[characterId] || characterId === "twins") return [];
    const day = dayJapan2(now), memories = unlockedStoryMemories(books, catalog);
    const authored = new Set((Array.isArray(cues) ? cues : []).filter((cue) => cue?.approval === "approved" && cue.kind === "story" && cue.characterId === characterId && typeof cue.memoryId === "string").map((cue) => cue.memoryId));
    const bookById = new Map((Array.isArray(books) ? books : []).map((book) => [book.id, book]));
    const result = [];
    for (const memory of memories) {
      const affinity = authored.has(memory.id) ? 3 : forestMemoryBelongsToCharacter(memory, characterId) ? 2 : 0;
      if (!affinity) continue;
      result.push({
        key: "memory-" + hash2(memory.id).toString(16),
        memoryId: memory.id,
        affinity,
        freshBonus: recentReadBonus(bookById.get(memory.bookId), day),
        kind: "memory",
        fact: clean2(memory.text, 220),
        theme: clean2(memory.tags, 60)
      });
    }
    return result;
  }
  var idleScene = {
    id: "daily-idle",
    kind: "ambient",
    focus: "\u3044\u307E\u76EE\u306E\u524D\u306E\u68EE\u306E\u3053\u3068\u3092\u3001\u672C\u4EBA\u3089\u3057\u304F\u77ED\u304F\u8A71\u3059",
    tone: "\u6C17\u53D6\u3063\u305F\u6559\u8A13\u3084\u8CEA\u554F\u306B\u305B\u305A\u3001\u81EA\u7136\u306A\u4E00\u8A00\u30FB\u8EAB\u632F\u308A\u30FB\u6C88\u9ED9\u3067\u3082\u3088\u3044",
    evidence: "imagined"
  };
  function sceneFrom(topic, { continuationChoice = "", stage = 1 } = {}) {
    return {
      id: topic.key,
      kind: continuationChoice ? "continuation" : topic.kind,
      focus: topic.fact,
      tone: "\u539F\u4F5C\u306E\u4E8B\u5B9F\u3092\u8AAC\u660E\u305B\u305A\u3001\u672C\u4EBA\u3089\u3057\u3044\u53CD\u5FDC\u30FB\u5C0F\u3055\u306A\u884C\u52D5\u30FB\u4F1A\u8A71\u306B\u3059\u308B",
      theme: topic.theme,
      evidence: "reviewed",
      memoryId: topic.memoryId,
      ...continuationChoice ? { previousChoice: continuationChoice, stage } : {}
    };
  }
  function pickTopic(characterId, day, candidates, recent, usedToday) {
    if (!candidates.length) return null;
    if (hash2(day + ":idle:" + characterId) % 5 === 0) return null;
    const seen = Array.isArray(recent) ? recent : [];
    const recentKeys = new Set(seen.filter((entry) => {
      if (!entry || typeof entry !== "object" || !entry.day) return false;
      const age = dayNumber(day) - dayNumber(entry.day);
      return age >= 0 && age <= 3;
    }).map((entry) => entry.key));
    const fresh = candidates.filter((topic) => !recentKeys.has(topic.key));
    if (!fresh.length) return null;
    return fresh.map((topic) => {
      const shared = usedToday.has(topic.key) ? 28 : 0;
      return { topic, score: topic.affinity * 22 + topic.freshBonus + hash2(day + ":" + characterId + ":" + topic.key) % 17 - shared };
    }).sort((a, b) => b.score - a.score || a.topic.key.localeCompare(b.topic.key))[0].topic;
  }
  function empty(day, prior = {}) {
    return {
      version: 2,
      day,
      events: [],
      visits: {},
      topics: {},
      arcs: prior.version === 2 && prior.arcs && typeof prior.arcs === "object" ? prior.arcs : {},
      recent: prior.version === 2 && prior.recent && typeof prior.recent === "object" ? prior.recent : {}
    };
  }
  function createForestDailyContextSession({
    storage = null,
    storageKey = "forest-daily-context-v2",
    now = () => Date.now()
  } = {}) {
    function current() {
      const day = dayJapan2(now()), previous = read(storage, storageKey);
      return previous.version === 2 && previous.day === day && Array.isArray(previous.events) ? previous : empty(day, previous);
    }
    function save2(state) {
      const topics = Object.fromEntries(Object.entries(state.topics || {}).map(([npc, scene]) => {
        const { memoryId, ...safe } = scene;
        return [npc, safe];
      }));
      write(storage, storageKey, { ...state, topics });
    }
    return {
      visit(characterId, { books = [], catalog = [], cues = [], sourceKind = "", sourceMemoryId = "", commit = true } = {}) {
        const state = current(), candidates = ["meet", "reflection"].includes(sourceKind) ? [] : eligibleForestDailyTopics({ characterId, books, catalog, cues, now: now() });
        const usable = new Map(candidates.map((topic) => [topic.key, topic]));
        const earlier = state.events.slice().reverse();
        const connected = earlier.find((event) => event.npc !== characterId && (RELATIONS[characterId] || []).includes(event.npc));
        const last = earlier.find((event) => event.npc !== characterId);
        const visitsToday = (Number(state.visits[characterId]) || 0) + 1;
        let scene = state.topics[characterId];
        const authored = ["story", "relay"].includes(sourceKind) && sourceMemoryId ? candidates.find((topic) => topic.memoryId === sourceMemoryId) : null;
        if (authored) scene = sceneFrom(authored);
        else if (scene?.evidence === "reviewed") {
          const source = candidates.find((topic) => topic.key === scene.id);
          scene = source ? { ...scene, memoryId: source.memoryId } : null;
        }
        if (!scene) {
          const previous = state.arcs[characterId], delta = previous ? dayNumber(state.day) - dayNumber(previous.day) : 0;
          const candidate = previous && delta === 1 && previous.stage < 3 && previous.choice && !/またね|帰る|やめる|おしまい/iu.test(previous.choice) ? usable.get(previous.key) : null;
          if (candidate) scene = sceneFrom(candidate, {
            continuationChoice: previous.choice,
            stage: previous.stage + 1
          });
          else {
            const usedToday = new Set(Object.values(state.topics).map((item) => item?.id));
            const recent = state.recent[characterId];
            const chosen = pickTopic(characterId, state.day, candidates, recent, usedToday);
            scene = chosen ? sceneFrom(chosen) : { ...idleScene, id: "daily-idle-" + characterId };
          }
        }
        state.topics[characterId] = scene;
        state.visits[characterId] = visitsToday;
        state.events.push({ npc: characterId, kind: "visit" });
        state.events = state.events.slice(-MAX_EVENTS);
        if (scene.evidence === "reviewed" && visitsToday === 1) {
          const list = Array.isArray(state.recent[characterId]) ? state.recent[characterId].slice(-MAX_RECENT + 1) : [];
          state.recent[characterId] = [...list, { key: scene.id, day: state.day }];
        }
        if (commit) save2(state);
        return {
          scene,
          visitsToday,
          metNpcCount: Object.keys(state.visits).length,
          previousNpc: last?.npc || "",
          relatedEncounter: connected ? {
            npc: connected.npc,
            selectedLabel: clean2(connected.kind === "choice" ? connected.label : ""),
            scene: state.topics[connected.npc]?.id || ""
          } : null
        };
      },
      selected(characterId, label) {
        if (!RELATIONS[characterId] || !clean2(label)) return;
        const state = current(), scene = state.topics[characterId];
        state.events.push({ npc: characterId, kind: "choice", label: clean2(label) });
        state.events = state.events.slice(-MAX_EVENTS);
        if (scene?.evidence === "reviewed") {
          state.arcs[characterId] = {
            day: state.day,
            key: scene.id,
            choice: clean2(label),
            stage: scene.stage || 1
          };
        } else delete state.arcs[characterId];
        save2(state);
      },
      getState() {
        return current();
      }
    };
  }

  // reading-shelf-firebase/book-forest-reflection-source.mjs
  var isRead = (book) => book?.status === "read" && typeof book.id === "string" && book.id.length > 0;
  var time = (value) => value?.toMillis?.() ?? (typeof value === "number" ? value : 0);
  function selectRecentForestReflectionEntries(activities = [], books = []) {
    const readIds = new Set((Array.isArray(books) ? books : []).filter(isRead).map((book) => book.id));
    const seen = /* @__PURE__ */ new Set(), selected = [];
    for (const entry of (Array.isArray(activities) ? activities : []).slice(0, 60)) {
      if (entry?.kind !== "reflection" || entry.hidden || !readIds.has(entry.bookId) || typeof entry.sourceId !== "string" || !entry.sourceId) continue;
      const key = entry.bookId + ":" + entry.sourceId;
      if (seen.has(key)) continue;
      seen.add(key);
      selected.push(entry);
      if (selected.length >= 12) break;
    }
    return selected;
  }
  function normalizeRecentForestReflection(entry, record, { id = "" } = {}) {
    if (!record || record.hidden || !["verbatim", "parent-summary"].includes(record.attribution) || typeof entry?.bookId !== "string" || typeof id !== "string" || !id) return null;
    const quote = String(record.quote || record.text || "").trim();
    const createdAt = time(record.createdAt) || time(entry.createdAt);
    return quote && createdAt ? {
      id,
      bookId: entry.bookId,
      quote,
      attribution: record.attribution,
      createdAt
    } : null;
  }

  // reading-shelf-firebase/book-forest-mirror-snapshot.mjs
  var MAX_ROWS = 1e3;
  var MAX_BYTES = 2e6;
  var MAX_AGE_MS = 2 * 60 * 60 * 1e3;
  var parseTime = (value) => Number.isFinite(Date.parse(String(value || ""))) ? Date.parse(value) : 0;
  var get = (fields, key) => {
    const v = fields?.[key];
    if (!v || typeof v !== "object") return void 0;
    if ("stringValue" in v) return v.stringValue;
    if ("timestampValue" in v) return parseTime(v.timestampValue);
    if ("booleanValue" in v) return v.booleanValue;
    if ("integerValue" in v) return Number(v.integerValue);
    if ("doubleValue" in v) return Number(v.doubleValue);
    return void 0;
  };
  var safeId = (v) => typeof v === "string" && /^[a-zA-Z0-9_-]{1,120}$/u.test(v);
  var bookFields = ["title", "status", "finishedAt", "synopsis", "synopsisSourceUrl"];
  function parseForestBookshelfMirror(rows, {
    syncAt,
    now = Date.now(),
    maxAgeMs = MAX_AGE_MS
  } = {}) {
    if (!Array.isArray(rows) || !Array.isArray(rows[0]) || rows.length > MAX_ROWS + 1)
      throw Error("MIRROR_SHAPE");
    const header = rows[0].map(String), cols = ["\u6587\u66F8\u30D1\u30B9", "\u5206\u5272\u756A\u53F7", "\u5206\u5272\u6570", "Firestore JSON"];
    if (cols.some((name) => !header.includes(name))) throw Error("MIRROR_HEADERS");
    const age = now - parseTime(syncAt);
    if (!Number.isFinite(age) || age < -6e5 || age > maxAgeMs) throw Error("MIRROR_STALE");
    const index = Object.fromEntries(cols.map((k) => [k, header.indexOf(k)]));
    const chunks = /* @__PURE__ */ new Map();
    let bytes = 0, root = null;
    for (const row of rows.slice(1)) {
      const path = String(row?.[index["\u6587\u66F8\u30D1\u30B9"]] || "");
      if (!path) continue;
      const parts = path.split("/");
      if (parts[0] !== "families" || !safeId(parts[1])) throw Error("MIRROR_SCOPE");
      if (root === null) root = parts[1];
      if (root !== parts[1]) throw Error("MIRROR_MULTIFAMILY");
      const i = Number(row[index["\u5206\u5272\u756A\u53F7"]]), n = Number(row[index["\u5206\u5272\u6570"]]);
      const chunk = String(row[index["Firestore JSON"]] || "");
      bytes += chunk.length;
      if (bytes > MAX_BYTES || !Number.isInteger(i) || !Number.isInteger(n) || i < 1 || n < 1 || n > 100 || i > n || !chunk) throw Error("MIRROR_PARTS");
      if (!chunks.has(path)) chunks.set(path, { n, parts: /* @__PURE__ */ new Map() });
      const part = chunks.get(path);
      if (part.n !== n || part.parts.has(i)) throw Error("MIRROR_DUPLICATE");
      part.parts.set(i, chunk);
    }
    if (!root || !chunks.has("families/" + root)) throw Error("MIRROR_MISSING_ROOT");
    const books = [], activities = [], records = /* @__PURE__ */ new Map();
    for (const [path, part] of chunks) {
      if (part.parts.size !== part.n) throw Error("MIRROR_INCOMPLETE");
      let doc;
      try {
        doc = JSON.parse(Array.from({ length: part.n }, (_, i) => part.parts.get(i + 1) || "").join(""));
      } catch {
        throw Error("MIRROR_JSON");
      }
      if (!doc || typeof doc.fields !== "object") throw Error("MIRROR_DOCUMENT");
      const p = path.split("/"), f = doc.fields;
      if (p.length === 4 && p[2] === "books" && safeId(p[3])) {
        const book = { id: p[3] };
        for (const k of bookFields) {
          const v = get(f, k);
          if (typeof v === "string") book[k] = v;
        }
        books.push(book);
      } else if (p.length === 4 && p[2] === "activity" && safeId(p[3])) {
        activities.push({
          kind: get(f, "kind"),
          bookId: get(f, "bookId"),
          sourceId: get(f, "sourceId"),
          hidden: get(f, "hidden") === true,
          createdAt: get(f, "createdAt") || 0
        });
      } else if (p.length === 6 && p[2] === "books" && p[4] === "childReflections" && safeId(p[3]) && safeId(p[5])) {
        records.set(p[3] + ":" + p[5], {
          id: p[5],
          hidden: get(f, "hidden") === true,
          attribution: get(f, "attribution"),
          quote: get(f, "quote"),
          text: get(f, "text"),
          createdAt: get(f, "createdAt") || 0
        });
      }
    }
    if (!books.length) throw Error("MIRROR_NO_BOOKS");
    activities.sort((a, b) => b.createdAt - a.createdAt);
    const selected = selectRecentForestReflectionEntries(activities, books);
    const reflections = selected.map((event) => {
      const record = records.get(event.bookId + ":" + event.sourceId);
      return normalizeRecentForestReflection(event, record, { id: record?.id || "" });
    }).filter(Boolean);
    const readIds = new Set(books.filter((book) => book.status === "read").map((book) => book.id));
    const archiveReflections = [];
    for (const [key, record] of records) {
      const bookId = key.split(":")[0];
      if (!readIds.has(bookId)) continue;
      const review = normalizeRecentForestReflection({ bookId }, record, { id: record.id });
      if (review) archiveReflections.push(review);
    }
    return {
      books,
      reflections,
      archiveReflections,
      snapshotAt: parseTime(syncAt),
      bookCount: books.length,
      readCount: books.filter((b) => b.status === "read").length,
      reflectionCount: reflections.length
    };
  }

  // reading-shelf-firebase/book-forest-gesture.mjs
  var FOREST_WRITTEN_TURN_LIMIT = 65;
  var WRITTEN_LAYOUT_LIMIT = 100;
  var JAPANESE_LETTER = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u;
  var WRITTEN_CHARACTERS = /^[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー・、。！？「」『』!? 　]+$/u;
  function validWrittenText(value) {
    return value.length <= WRITTEN_LAYOUT_LIMIT && value.replace(/[ 　]/gu, "").length <= FOREST_WRITTEN_TURN_LIMIT && JAPANESE_LETTER.test(value) && WRITTEN_CHARACTERS.test(value);
  }
  var SPEECH_ACTION = /しゃべ|喋|話しかけ|話し(?:た|て|出)|話す|言っ|言う|声を出|声に出|ささや|囁|つぶや|呟|よびかけ|呼びかけ|といった/u;
  var INNER_VOICE = /心の(?:中|声)|頭の中|胸の内|内心|ひそかに(?:思|考)|と(?:思った|思う|思い|考えた|考える)/iu;
  var BARE_GREETING = /^（(?:こんにちは|こんばんは|おはよう(?:ございます)?|ありがとう(?:ございます)?|さようなら|おやすみ(?:なさい)?|どうも|はい|いいえ|おーい|ごめん(?:なさい)?)[！!？?。、]*）$/u;
  var WRITING_ACTION = /書(?:い|き|く|け|こ)|か(?:い|き|く)[^。]{0,8}(?:見せ|みせ|差し出|さしだ)|(?:紙|地面|落ち葉|葉っぱ|はっぱ|おちば|字|文字)に[^。]{0,12}か(?:いた|き|く)|(?:地面|じめん)をなぞ|(?:もじ|文字|めも|メモ)を(?:かく|かいた|かいて|かき)/u;
  var WRITING_ONLY_END = /(?:書(?:いた|く|きました)|か(?:いた|く|きました)|(?:見せ|みせ|差し出し|さしだし)(?:た|ます))(?:よ|ね)?[。！!]*$/u;
  var WRITTEN_STAGE_DIRECTION = /^(?:[（(]|(?:ねこは)?(?:.*[、])?(?:もじ|文字|めも|メモ)を(?:かく|かいた|書く|書いた)(?:[。！!]|$))/u;
  var CAT_NARRATION = /^(?:ねこ|ネコ|猫)[はが]/u;
  var WRITING_SURFACE = /^(?:紙|地面|じめん|落ち葉|葉っぱ|はっぱ|おちば|字|文字)[にを]/u;
  var PARENTHETICAL_ACTION = /^（[^（）\n\r]+）$/u;
  function validGesture(text) {
    return text.length <= FOREST_WRITTEN_TURN_LIMIT && PARENTHETICAL_ACTION.test(text) && !SPEECH_ACTION.test(text) && !INNER_VOICE.test(text) && !BARE_GREETING.test(text) && !/[「」『』{}<>]/u.test(text);
  }
  function validateForestWrittenTurn(rawText, delivery) {
    if (typeof rawText !== "string") return null;
    const text = rawText.normalize("NFC").trim();
    if (delivery === "written") {
      const annotated = /^(?:（([^（）\r\n]+)）|\(([^()\r\n]+)\))[ 　]*\r?\n([\s\S]+)$/u.exec(text);
      const message = annotated && validGesture("\uFF08" + (annotated[1] ?? annotated[2]) + "\uFF09") ? annotated[3].trim() : text;
      const body = message.replace(/[ 　]*\r?\n[\r\n 　]*/gu, " ");
      const compact = body.replace(/[ 　]/gu, "");
      const narration = CAT_NARRATION.test(compact);
      const writingOnly = (narration || WRITING_SURFACE.test(compact)) && WRITING_ONLY_END.test(compact) && WRITING_ACTION.test(compact);
      if (WRITTEN_STAGE_DIRECTION.test(compact) || writingOnly || narration && (SPEECH_ACTION.test(compact) || INNER_VOICE.test(compact)))
        return null;
      if (validWrittenText(body)) return { text: body, delivery };
    }
    if (delivery === "gesture") {
      const action = text.replace(/^\(([^()（）\r\n]+)\)$/u, "\uFF08$1\uFF09");
      if (validGesture(action) && !WRITING_ACTION.test(action.replace(/[ 　]/gu, ""))) return { text: action, delivery };
    }
    return null;
  }

  // reading-shelf-firebase/book-forest-output-safety.mjs
  var forageFood = /(?:木の実|きのみ|きのこ(?=$|[がはをもにので、。！？!?\s」』）"\]}])|キノコ|茸|赤い実|青い実|(?:木|枝).{0,20}実|(?<![現事真確誠着充])実[がを])/u;
  var vegetation = /(?:植物|しょくぶつ|草|葉|はっぱ|おちば)/u;
  var refersToPlant = (text) => forageFood.test(text) || vegetation.test(text);
  var unknown = /(?:知らない|しらない|未知|見たこと(?:が)?ない|名前.{0,8}(?:わから|不明)|正体.{0,8}(?:わから|不明)|何の|なんの|未確認|拾った|ひろった|見つけた|みつけた|道ばた)/u;
  var consumption = /(?:食べ|たべ|味見|あじみ|口に|ひと[口くち]|おいし|美味|うまそう|食用)/u;
  var reassurance = /(?:安全|だいじょうぶ|大丈夫)/u;
  var directProhibition = /(?:食べ|たべ|口に[ 　]*し|(?:味見|あじみ)[ 　]*し)[ 　]*ては[ 　]*(?:だめ|ダメ|い(?:け(?:ない|ません|ぬ)|かん)|なら(?:ない|ぬ|ん))/u;
  var advisesAgainst = /(?:食べ|たべ|口に[ 　]*す|(?:味見|あじみ)[ 　]*す)るのは[、 　]*[^、。]{0,10}(?:勧め|すすめ)(?:でき(?:ない|ぬ|ん|ません)|ない)/u;
  var refusal = /(?:食べ|たべ)(?:ないで|ない(?:ほう|方)が(?:いい|よい|安全)|ちゃ(?:だめ|ダメ)|るの(?:は|を)やめ|ずに|ません)|(?:味見|あじみ)(?:しない|はしない)|(?:食べ|たべ)(?:られるか|ていいか|てよいか|られるとは).{0,16}(?:わから|知ら|不明|限ら|かぎら)|(?:食べ|たべ)(?:るの|ること|たら|ると).{0,8}(?:危な|危険|だめ|ダメ)|(?:食べ|たべ)ない$|(?:安全|大丈夫|だいじょうぶ).{0,4}(?:とは|か).{0,8}(?:わから|言え|いえ)/u;
  var writingSurface = /(?:落ち葉|葉っぱ|はっぱ|おちば|葉)(?=(?:のうら|の裏|の上)?に[^。！？）」\x22]{0,24}(?:書[いきく]|か[いきく]))/gu;
  var generalFoodSearch = /^(?:おいしい|美味しい)(?:もの|物)を[、 ]*(?:さが|探)そ(?:う|っか)[？?]?$/u;
  var knownFood = /(?:パン|ぱん|おにぎり|弁当|べんとう|サンドイッチ|おやつ|クッキー|ケーキ|スープ)/u;
  function unsafeForestForaging(output, context = {}) {
    const background = JSON.stringify({
      situation: context.situation,
      topic: context.topic,
      scene: context.today?.scene,
      recentTurns: context.recentTurns,
      chosenLabel: context.chosenLabel
    });
    const utterances = Array.isArray(output?.turns) ? output.turns.map((turn) => turn?.text) : [];
    const subject = (background + " " + [output?.text, ...utterances].join(" ")).replace(/[ 　]/gu, "");
    const wild = /(?:本の森|森の|林|野生|道ばた|拾|ひろ|生え|なっている)/u;
    const riskyBackground = refersToPlant(subject) && (unknown.test(subject) || wild.test(subject));
    const edibilityContext = riskyBackground && (unknown.test(subject) || consumption.test(subject) || forageFood.test(subject));
    const lines = [output?.text, ...utterances, ...Array.isArray(output?.choices) ? output.choices.flatMap((x) => typeof x === "string" ? [x] : [x?.label, x?.outcome]) : []];
    return lines.some((line) => typeof line === "string" && line.replace(/[ 　]/gu, "").split(/[。！!\n]|(?:けれども?|けど|、でも)、*/u).some((clause) => {
      if (!(consumption.test(clause) || edibilityContext && reassurance.test(clause)) || directProhibition.test(clause) || advisesAgainst.test(clause) || refusal.test(clause)) return false;
      if (knownFood.test(clause) && !refersToPlant(clause)) return false;
      if (generalFoodSearch.test(clause.trim()) && !refersToPlant(subject.replace(writingSurface, ""))) return false;
      return riskyBackground || refersToPlant(clause) && (unknown.test(clause) || wild.test(clause));
    }));
  }

  // reading-shelf-firebase/book-forest-ending.mjs
  var openInvitation = /(?:^|[、]|へ|まで|に|ついて)(?:(?:(?:ゆっくり)?(?:あるいて|歩いて))?(?:いこう|行こう|いきましょう|行きましょう)|はじめよう|始めよう|おいで)(?:ね|よ|ぜ|ぞ|か)?$/u;
  var unperformedAction = /(?:^|[。！!\n])(?:よし[、！!]|うん[、。])?[^。！!\n]{0,35}(?:正体を暴(?:く|いてやる)|(?:決め|きめ)(?:なきゃ|なくちゃ)|(?:確かめ|たしかめ|調べ|しらべ)(?:よう|てくる)|(?:準備|じゅんび)(?:を)?(?:してくる|しておく))(?=よ|ね|ぞ|ぜ|[。！!]|$)/u;
  var relayRequest = /(?:伝え|つたえ)(?:て(?:おく|おきます|おいて|くる|あげる|あげます|くれる|くれない|ね|よ)|とく|たい|よう|ましょう|て(?=[。！？!?]|$))/u;
  var sayingToSomeone = /(?:(?:言っ|いっ)(?:て(?:おく|おきます|おいて|くる|あげる|あげます|くれる|くれない|ね|よ)|とく)|(?:教え|おしえ)て(?:あげて|あげる|おく|くれる))/u;
  var offscreenAction = /(?:連れて|つれて)(?:行く|いく|くる)(?:よ|ね|ぜ|ぞ|から)?(?=[。！!」』）]|$)|(?:呼んで|よんで|持って|もって|取って|とって)(?:くる|きます)(?:よ|ね|ぜ|ぞ|から)?(?=[。！!」』）]|$)|(?:合流|ごうりゅう)し(?:よう|てくる)(?:よ|ね|ぜ|ぞ)?(?=[。！!」』）]|$)/u;
  function forestUnsupportedAction(text, context = {}) {
    if (typeof text !== "string") return false;
    const compact = text.replace(/[ 　]/gu, "");
    if (offscreenAction.test(compact)) return true;
    if (context.handoffTo) return false;
    if (relayRequest.test(compact)) return true;
    const recipients = [
      ...Object.values(context.npcDisplayNames || {}),
      ...(context.speakers || []).map((s) => s.name),
      "\u738B\u3055\u307E",
      "\u304A\u3046\u3055\u307E",
      "\u672C\u4EBA",
      "\u3042\u306E\u5B50",
      "\u3042\u306E\u3053",
      "\u307F\u3093\u306A",
      "\u76F8\u624B"
    ];
    return compact.split(/[。！？!?]/u).some((sentence) => recipients.some((name) => name && sentence.includes(name + "\u306B")) && sayingToSomeone.test(sentence));
  }
  function forestMisattributesReviewTitle(text, context = {}) {
    const { bookTitle, quote } = context.readerReflection || {};
    if (!bookTitle || !quote || typeof text !== "string") return false;
    const compact = (value) => value.normalize("NFKC").replace(/\s+/gu, "");
    const quoted = compact(quote), title = compact(bookTitle);
    const bookName = /[「『]([^」』]+)[」』](?:という|っていう)(?:タイトル|題名|書名|本(?:を|の|は|が))/gu;
    const inventedTitle = /(?:^もし|なら|だったら|かりの|仮の|つける|付ける|つけた|付けた|考えた|かんがえた|候補|そうぞう|想像)/u;
    for (const sentence of compact(text).split(/[。！？!?]/u)) {
      if (inventedTitle.test(sentence)) continue;
      for (const [, name] of sentence.matchAll(bookName)) {
        if (title.includes(name)) continue;
        if (quoted.includes(name) || name.length >= 5 && quoted.includes(name.slice(0, -1)) || name.length >= 7 && quoted.includes(name.slice(0, -2))) return true;
      }
    }
    return false;
  }
  var unfinished = /[？?][。！!]*$|(?:おしえて|教えて|かくる|ましょう|てみよう|ついてこい|(?:みせ|見せ)て(?:あげる|くれ|ちょうだい))(?:ね|よ|か|ぜ|ぞ|な)?[。！!]*$|(?:準備(?:を)?(?:する|しよう)|じゅんび(?:を)?(?:する|しよう)|(?:まで|へ|に)(?:行こう|いこう)|(?:始め|はじめ)(?:よう|る)|(?:今度|こんど)(?:やろう|しよう))(?:ね|よ|か|ぜ|ぞ|な)?[。！!]*$/u;
  function forestEndingNeedsReply(text) {
    if (typeof text !== "string") return false;
    const compact = text.replace(/[ 　]/gu, "").replace(/[」』）]+$/u, "");
    return unfinished.test(compact) || unperformedAction.test(compact) || compact.split(/[。！？!?]/u).some((sentence) => openInvitation.test(sentence));
  }
  function forestEndingChoices(choices, { context = {}, silent = false, multi = false, line = "", validLine: validLine3 = () => true } = {}) {
    if (!Array.isArray(choices)) return [];
    const offered = [];
    for (const choice of choices.slice(0, 3)) {
      if (typeof choice?.label !== "string" || typeof choice.outcome !== "string") continue;
      const label = canonicalForestMention(choice.label.trim(), context.speakers);
      const outcome = canonicalForestMention(choice.outcome.trim(), context.speakers);
      if (label.length < 2 || label.length > 24 || /[\r\n{}<>「」]/u.test(label) || outcome.length < 2 || outcome.length > (silent ? 140 : 90) || /[{}<>]/u.test(outcome) || !silent && /[\r\n]/u.test(outcome) || offered.some((c) => c.label === label)) continue;
      const speakerSlot = choice.speakerSlot;
      if (multi && speakerSlot !== 1 && speakerSlot !== 2) continue;
      const written = silent ? validateForestWrittenTurn(outcome, choice.delivery ?? "written") : null;
      if (silent ? !written : !validLine3(outcome)) continue;
      const text = written?.text ?? outcome;
      if (forestEndingNeedsReply(text) || forestUnsupportedAction(text, context) || forestUnsupportedAction(label, context) || forestMisattributesReviewTitle(text, context) || forestMisattributesReviewTitle(label, context) || text === line || offered.some((c) => c.outcome === text)) continue;
      if (unsafeForestForaging(
        { text, choices: [label] },
        { ...context, chosenLabel: label, recentTurns: [...context.recentTurns || [], { npc: line }] }
      )) continue;
      offered.push({ label, outcome: text, ...multi ? { speakerSlot } : {}, ...written ? { delivery: written.delivery } : {} });
      if (offered.length === 2) break;
    }
    return offered;
  }

  // reading-shelf-firebase/book-forest-live-dialogue.mjs
  var CHARACTERS2 = new Set(FOREST_CHARACTER_IDS);
  var MULTI_SPEAKER = new Set(FOREST_MULTI_SPEAKER_IDS);
  var SELF_NAMES2 = FOREST_SELF_NAMES;
  var GOODBYE = FOREST_GOODBYES;
  var ACTION_WRITING_IDS2 = new Set(FOREST_ACTION_WRITING_IDS);
  var FOREST_AMBIENT_FOCUS = [
    "\u8449\u3084\u679D\u304C\u98A8\u3067\u9CF4\u308B\u97F3",
    "\u6728\u3082\u308C\u65E5\u3067\u5730\u9762\u306E\u8272\u304C\u5909\u308F\u308B\u3053\u3068",
    "\u68EE\u3067\u8DB3\u3082\u3068\u306E\u5C0F\u3055\u306A\u5909\u5316\u306B\u6C17\u3065\u304F\u3053\u3068",
    "\u76F8\u624B\u304C\u3044\u308B\u3068\u898B\u3048\u65B9\u304C\u5909\u308F\u308B\u3001\u3044\u3064\u3082\u306E\u666F\u8272",
    "\u5915\u65B9\u306E\u68EE\u3067\u97F3\u3084\u8272\u304C\u5909\u308F\u308B\u3053\u3068",
    "\u8DB3\u3092\u6B62\u3081\u308B\u3068\u6C17\u3065\u304F\u3001\u68EE\u306E\u5C0F\u3055\u306A\u4E0D\u601D\u8B70"
  ];
  function ambientFocus(characterId, visitNumber) {
    const offset = [...characterId].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    return FOREST_AMBIENT_FOCUS[(offset + visitNumber - 1) % FOREST_AMBIENT_FOCUS.length];
  }
  var safeEnd = (id, comma = false) => ACTION_WRITING_IDS2.has(id) ? "\uFF08\u306D\u3053\u306F\u3057\u3063\u307D\u3092\u3086\u3063\u304F\u308A\u3075\u3063\u305F\u3002\uFF09" : GOODBYE[id] || (comma ? "\u307E\u305F\u3001\u68EE\u3067\u4F1A\u304A\u3046\u306D\u3002" : "\u307E\u305F\u68EE\u3067\u4F1A\u304A\u3046\u306D\u3002");
  var WRONG_FIRST_PERSON = FOREST_WRONG_FIRST_PERSON;
  var FOREST_PROMPT_VERSION = "forest-scene-generation-v39-profile2";
  var PROMPT_VERSION = FOREST_PROMPT_VERSION;
  var clean3 = (value) => typeof value === "string" ? value.trim().replace(/\s+/gu, " ") : "";
  function relayPayload(text) {
    if (!text) return "";
    const quoted = /[「『]([^」』]+)[」』][ 　]*(?:って|と)[、 　]*(?:伝え|つたえ)/u.exec(text);
    const indirect = /(?:^|[。！？!?])([^。！？!?]+?)って[、 　]*(?:伝え|つたえ)/u.exec(text);
    return (quoted?.[1] ?? indirect?.[1] ?? text).trim();
  }
  function readJson(storage, key, fallback) {
    try {
      return JSON.parse(storage?.getItem?.(key) || "null") || fallback;
    } catch {
      return fallback;
    }
  }
  function generationErrorKind(error) {
    const message = String(error?.message || "");
    if (/Forest AI diagnostic model-json/u.test(message)) return "model-json";
    if (/Forest AI diagnostic output-validation/u.test(message)) return "output-validation";
    if (/Invalid Forest AI JSON/u.test(message)) return "response-json";
    const status = /Forest AI unavailable \((\d{3})\)/u.exec(message)?.[1];
    if (status === "401" || status === "403") return "authentication";
    if (status) return "worker-http-" + status;
    if (/quota reached|neurons.*exceeded|daily free allocation|exhausted/iu.test(message))
      return "quota";
    if (/timeout/iu.test(message)) return "timeout";
    if (/Firebase login|Unauthorized|token/iu.test(message)) return "authentication";
    if (/Invalid Forest AI response|Invalid model/iu.test(message)) return "invalid-response";
    if (/NetworkError|Failed to fetch|fetch failed|network request failed/iu.test(message))
      return "network";
    if (/cancelled|aborted/iu.test(message)) return "cancelled";
    return "request-error";
  }
  function validLine2(characterId, text) {
    const line = clean3(text);
    if (line.length < 2 || line.length > 90 || /[{}<>]/u.test(line)) return false;
    const name = SELF_NAMES2[characterId];
    if (name && new RegExp("(?:^|[\u3002\uFF01\uFF1F\u3001\u300C\u300E\\s])" + name + "[\u306F\u304C]").test(line)) return false;
    if ((WRONG_FIRST_PERSON[characterId] || []).some((word) => new RegExp("(?:^|[\u3002\uFF01\uFF1F\u3001\u300C\u300E\\s])" + word + "(?:\u306F|\u3082|\u304C|\u306E|\u3001|\u3063\u3066|\u306A\u3089)").test(line))) return false;
    if (characterId === "jiji" && /(?:^|[。！？、])\s*そうね[。、]|みんな、元気を出して進みましょう/u.test(line)) return false;
    if (characterId === "skipper" && /(?:さあ[、！! ]*みんな|大冒険の始まりだ)/u.test(line)) return false;
    return true;
  }
  function validateLiveForestOutput(raw, { characterId, requireLine = false, closing = false, context = {} } = {}) {
    let data = raw;
    if (typeof raw === "string") try {
      data = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!data || typeof data !== "object" || !CHARACTERS2.has(characterId)) return null;
    const gesture = ACTION_WRITING_IDS2.has(characterId);
    const text = gesture ? data.text : canonicalForestMention(clean3(data.text), context.speakers);
    const multi = MULTI_SPEAKER.has(characterId);
    const rawTurns = multi ? validateTwinTurns(data.turns) : null;
    const turns = rawTurns?.map((turn) => ({ ...turn, text: canonicalForestMention(turn.text, context.speakers) }));
    const written = gesture ? validateForestWrittenTurn(text, data.delivery) : null;
    if (multi && !turns || gesture && (!written || context.handoffTo && written.delivery !== "written") || !multi && !gesture && requireLine && !validLine2(characterId, text)) return null;
    const lastChoices = !closing && context.repliesLeft === 1;
    const safetyInput = written ? { ...data, text: written.text } : data;
    const lines = turns ? turns.map((turn) => turn.text) : [safetyInput.text];
    if (lines.some((line2) => forestUnsupportedAction(line2, context) || forestMisattributesReviewTitle(line2, context))) return null;
    if (unsafeForestForaging(lastChoices ? { ...safetyInput, choices: [] } : safetyInput, context)) return null;
    const line = turns ? { text: turns.map((turn) => turn.text).join(" "), turns } : written || { text };
    if (closing) return { ...line, labels: [] };
    if (lastChoices) {
      const endings = forestEndingChoices(data.choices, {
        context,
        silent: gesture,
        multi,
        line: line.text,
        validLine: (value) => validLine2(characterId, value)
      });
      if (!endings.length && forestEndingNeedsReply(turns?.at(-1)?.text ?? line.text)) return null;
      return { ...line, labels: endings.map((choice) => choice.label), endings };
    }
    const candidates = Array.isArray(data.choices) ? data.choices.slice(0, 3) : [];
    const byLabel = /* @__PURE__ */ new Map();
    for (const choice of candidates) {
      const label = canonicalForestMention(clean3(typeof choice === "string" ? choice : choice?.label), context.speakers);
      if (label.length < 2 || label.length > 24 || /[\r\n{}<>「」]/u.test(label) || byLabel.has(label) || forestUnsupportedAction(label, context) || forestMisattributesReviewTitle(label, context)) continue;
      byLabel.set(label, true);
    }
    const labels = [...byLabel.keys()].slice(0, 2);
    if (!labels.length || !requireLine && labels.length < 2) {
      if (!requireLine) return null;
      return { ...line, labels: gesture ? ["\u3082\u3046\u3059\u3053\u3057\u307F\u308B", "\u307E\u305F\u306D"] : ["\u3082\u3046\u5C11\u3057\u805E\u304F", "\u307E\u305F\u306D"] };
    }
    return { ...line, text: requireLine ? line.text : null, labels };
  }
  function promptScene(scene, sourceKind) {
    if (!scene) return {};
    if (sourceKind !== "ambient") return { tone: scene.tone || "" };
    const { id, kind, focus, tone, theme, evidence, previousChoice, stage } = scene;
    return {
      id,
      kind,
      focus,
      tone,
      theme,
      evidence,
      ...previousChoice ? { previousChoice, stage } : {}
    };
  }
  function promptFor({
    characterId,
    mode,
    chosenLabel = "",
    history = [],
    closing = false,
    topic = null,
    characterProfile = null,
    sourceKind = "",
    dailyContext = null,
    recentLines = [],
    reviewSpotlight = null,
    situation = null,
    twinNames = null,
    repliesLeft = closing ? 0 : 2,
    handoffTo = "",
    relayMessage = ""
  }) {
    const guide = forestCharacterVoiceGuide(characterProfile);
    const npc = {
      id: characterId,
      displayName: FOREST_DISPLAY_NAMES[characterId],
      voice: guide,
      profileSchemaVersion: 2,
      profileRevision: guide ? characterProfile.revision : "",
      profileVersion: guide ? characterProfile.version : ""
    };
    const nonverbal = ACTION_WRITING_IDS2.has(characterId);
    const visit = situation?.visitNumber;
    const focus = !reviewSpotlight && !topic && ["meet", "ambient"].includes(sourceKind) && Number.isSafeInteger(visit) && visit > 0 ? ambientFocus(characterId, visit) : "";
    const context = {
      npcLine: "",
      sourceKind,
      repliesLeft,
      npcDisplayNames: FOREST_DISPLAY_NAMES,
      ...focus ? { ambientFocus: focus } : {},
      ...twinNames ? { speakers: [{ slot: 1, name: twinNames.firstName }, { slot: 2, name: twinNames.secondName }] } : {},
      ...handoffTo ? { handoffTo: FOREST_DISPLAY_NAMES[handoffTo] } : {},
      ...sourceKind === "relay" && relayMessage ? { relayMessage: relayPayload(relayMessage) } : {},
      chosenLabel: clean3(chosenLabel).slice(0, 24),
      ...situation ? { situation } : {},
      recentTurns: history.slice(-4),
      ...topic ? { topic } : {},
      ...reviewSpotlight ? { readerReflection: Object.fromEntries(
        Object.entries(reviewSpotlight).filter(([key]) => !["key", "bookKey", "sourceBookId", "sourceReflectionId"].includes(key))
      ) } : {},
      ...dailyContext ? { today: {
        scene: promptScene(dailyContext.scene, sourceKind),
        visitsToday: dailyContext.visitsToday,
        previousNpc: dailyContext.previousNpc,
        metNpcCount: dailyContext.metNpcCount,
        relatedEncounter: dailyContext.relatedEncounter
      } } : {},
      ...recentLines.length ? { avoidRecentLines: recentLines.slice(-3) } : {}
    };
    const endingShape = {
      label: "\u5B50\u3069\u3082\u306E\u4E00\u8A00",
      outcome: "\u305D\u306E\u4E00\u8A00\u306B\u5BFE\u3059\u308BNPC\u672C\u4EBA\u306E\u7B54\u3048\u3002\u8CEA\u554F\u306F\u3057\u306A\u3044",
      ...twinNames ? { speakerSlot: 1 } : {},
      ...nonverbal ? { delivery: "written" } : {}
    };
    const finishTask = handoffTo ? "\u76F8\u624B\u306B\u5C4A\u304F\u4E00\u8A00\u3092\u4F1D\u8A00\u672C\u6587\u3068\u3057\u3066\u66F8\u304F\u3002\u5B9B\u5148\u3084\u5B50\u3069\u3082\u3078\u306E\u4F1D\u9054\u4F9D\u983C\u306F\u66F8\u304B\u306A\u3044" : "\u9078\u3070\u308C\u305F\u554F\u3044\u3084\u884C\u52D5\u306B\u5177\u4F53\u7684\u306B\u5FDC\u3048\u3001\u3053\u306E\u8FD4\u4E8B\u3060\u3051\u3067\u3072\u3068\u533A\u5207\u308A\u3064\u3051\u308B";
    const firstLineTask = {
      meet: "\u3053\u306E\u76F8\u624B\u3068\u306F\u521D\u5BFE\u9762\u3002\u4EE5\u524D\u8A71\u3057\u305F\u3075\u308A\u3092\u305B\u305A\u3001\u30AD\u30E3\u30E9\u81EA\u8EAB\u306E\u95A2\u5FC3\u304B\u3089\u81EA\u7136\u306A\u7B2C\u4E00\u58F0\u3068\u8FD4\u7B54\u5019\u88DC2\u3064\u3092\u4F5C\u308B",
      story: "\u3053\u306E\u30AD\u30E3\u30E9\u304C\u95A2\u308F\u308B\u78BA\u8A8D\u6E08\u307F\u306E\u7269\u8A9E\u3092\u904E\u53BB\u306E\u8A18\u61B6\u3068\u3057\u3066\u632F\u308A\u8FD4\u308A\u3001\u672C\u4EBA\u3089\u3057\u3044\u7B2C\u4E00\u58F0\u3068\u8FD4\u7B54\u5019\u88DC2\u3064\u3092\u4F5C\u308B\u3002\u4ECA\u306E\u68EE\u3067\u539F\u4F5C\u306E\u5834\u9762\u304C\u9032\u884C\u4E2D\u3067\u3042\u308B\u3088\u3046\u306B\u518D\u6F14\u3057\u306A\u3044",
      reflection: "\u53F0\u5E33\u304C\u793A\u3059\u8AAD\u66F8\u611F\u60F3\u3092\u53D6\u308A\u4E0A\u3052\u3001\u539F\u6587\u3068\u4FDD\u8B77\u8005\u306E\u8981\u7D04\u3092\u533A\u5225\u3057\u306A\u304C\u3089\u672C\u4EBA\u3089\u3057\u304F\u53CD\u5FDC\u3059\u308B",
      relay: relayMessage ? "\u5B50\u3069\u3082\u304C\u5C4A\u3051\u305F\u4F1D\u8A00\u306E\u5177\u4F53\u7684\u306A\u4E2D\u8EAB\u306B\u3001\u305D\u306E\u4EBA\u7269\u306E\u7ACB\u5834\u304B\u3089\u7B54\u3048\u3001\u8FD4\u7B54\u5019\u88DC2\u3064\u3092\u4F5C\u308B" : "\u524D\u306E\u30AD\u30E3\u30E9\u304B\u3089\u306E\u8A71\u984C\u306E\u5F15\u304D\u7D99\u304E\u3002\u4F1A\u8A71\u3092\u76F4\u63A5\u805E\u3044\u305F\u3075\u308A\u3092\u305B\u305A\u3001\u81EA\u7136\u306A\u7B2C\u4E00\u58F0\u3068\u8FD4\u7B54\u5019\u88DC2\u3064\u3092\u4F5C\u308B",
      ambient: "\u30AD\u30E3\u30E9\u56FA\u6709\u306E\u95A2\u5FC3\u3084\u68EE\u306E\u8EAB\u8FD1\u306A\u51FA\u6765\u4E8B\u304B\u3089\u3001\u6BCE\u56DE\u7570\u306A\u308B\u7B2C\u4E00\u58F0\u3068\u8FD4\u7B54\u5019\u88DC2\u3064\u3092\u4F5C\u308B"
    };
    return {
      mode,
      closing,
      task: closing ? finishTask : mode === "reply" ? repliesLeft === 1 ? "\u76F4\u524D\u306E\u4F1A\u8A71\u3067\u5B50\u3069\u3082\u304C\u9078\u3093\u3060\u8A00\u8449\u306BNPC\u3068\u3057\u3066\u7B54\u3048\u308B\u3002\u6B21\u306B\u3001\u5B50\u3069\u3082\u306E\u8A00\u8449\u3068\u3001\u305D\u308C\u306B\u5BFE\u3059\u308BNPC\u672C\u4EBA\u306E\u7B54\u3048\u3092\u4E8C\u7D44\u4F5C\u308B" : "\u76F4\u524D\u306E\u4F1A\u8A71\u3068\u9078\u3070\u308C\u305F\u8A00\u8449\u3084\u884C\u52D5\u3092\u53D7\u3051\u3001\u6B21\u306E\u53CD\u5FDC\u3092\u8FD4\u3059\u3002\u554F\u3044\u306E\u5FA9\u5531\u3060\u3051\u3067\u6E08\u307E\u305B\u306A\u3044" : reviewSpotlight ? "\u672C\u306E\u611F\u60F3\u306BNPC\u672C\u4EBA\u3089\u3057\u304F\u3001\u611F\u60F3\u306E\u5177\u4F53\u7684\u306A\u4E00\u7B87\u6240\u306B\u53CD\u5FDC\u3057\u3001\u8FD4\u7B54\u5019\u88DC2\u3064\u3092\u4F5C\u308B\u3002\u5225\u4F5C\u54C1\u306A\u3089\u7B2C\u4E09\u8005\u306E\u7ACB\u5834\u3092\u5B88\u308B" : sourceKind === "ambient" && situation?.focus === "character" ? "\u68EE\u306E\u8A71\u984C\u3092\u4EBA\u7269\u8A2D\u5B9A\u306B\u3042\u308B\u95A2\u5FC3\u3084\u666E\u6BB5\u306E\u884C\u52D5\u306B\u7D50\u3073\u4ED8\u3051\u3001\u672C\u4EBA\u3089\u3057\u3044\u96D1\u8AC7\u3084\u5197\u8AC7\u3068\u8FD4\u7B54\u5019\u88DC2\u3064\u3092\u4F5C\u308B" : firstLineTask[sourceKind] || firstLineTask.ambient,
      npc,
      context,
      constraints: [
        "\u4F1A\u8A71\u306F\u65E5\u672C\u8A9E\u3002\u5C0F\u5B66\u6821\u4F4E\u5B66\u5E74\u304C\u8AAD\u3081\u308B\u77ED\u3044\u8A00\u8449\u3068\u7C21\u5358\u306A\u6F22\u5B57\u306B\u3059\u308B",
        "\u4F1A\u8A71\u306E\u76F8\u624B\u306F\u5B9F\u5728\u306E\u5B50\u3069\u3082\u3002\u5BB6\u65CF\u3001\u4F4F\u6240\u3001\u5B66\u6821\u3001\u5E74\u9F62\u3001\u500B\u4EBA\u60C5\u5831\u3092\u8CEA\u554F\u3057\u306A\u3044",
        "\u539F\u4F5C\u306E\u51FA\u6765\u4E8B\u3092\u52DD\u624B\u306B\u4F5C\u3089\u306A\u3044\u3002\u5225\u4F5C\u54C1\u306E\u51FA\u6765\u4E8B\u3092\u305D\u306E\u5834\u3067\u76EE\u6483\u3057\u305F\u3068\u88C5\u308F\u305A\u3001\u53F0\u8A5E\u5F15\u7528\u30FB\u3042\u3089\u3059\u3058\u30FB\u6559\u8A13\u306B\u3057\u306A\u3044",
        "\u611F\u60F3\u306B\u66F8\u304B\u308C\u3066\u3044\u306A\u3044\u672C\u4EBA\u306E\u884C\u52D5\u30FB\u611F\u60C5\u3084\u8AAD\u66F8\u4E2D\u306E\u69D8\u5B50\u3092\u77E5\u3063\u3066\u3044\u308B\u3075\u308A\u3092\u3057\u306A\u3044",
        "\u6700\u512A\u5148\u306FNPC\u672C\u4EBA\u3089\u3057\u3044\u8A00\u8449\u3001\u9593\u3001\u53CD\u5FDC\u3001\u884C\u52D5\u3002\u60C5\u5831\u91CF\u3084\u6DF1\u3044\u8A71\u3092\u6C42\u3081\u305A\u3001\u601D\u8003\u306E\u7A2E\u304B\u3089\u8CEA\u554F\u30FB\u6559\u8A13\u30FB\u7ACB\u6D3E\u306A\u6C17\u3065\u304D\u3092\u5168\u54E1\u306B\u5F37\u3044\u306A\u3044",
        "\u5B8C\u6210\u6E08\u307F\u53F0\u672C\u3092\u53C2\u7167\u305B\u305A\u3001\u4EBA\u7269\u50CF\u30FB\u76EE\u306E\u524D\u306E\u72B6\u6CC1\u30FB\u8A31\u53EF\u3055\u308C\u305F\u65E2\u8AAD\u4E8B\u5B9F\u304B\u3089\u81EA\u7136\u306A\u767A\u8A71\u3092\u65B0\u898F\u306B\u4F5C\u308B",
        "NPC\u306E\u8FD4\u4E8B\u306F\u81EA\u7136\u306A\u4E00\u8A00\u301C2\u6587\u306765\u5B57\u4EE5\u5185\u3002\u524D\u306E\u767A\u8A00\u3092\u7E70\u308A\u8FD4\u3055\u305A\u3001\u8A2D\u5B9A\u306E\u8AAC\u660E\u3092\u4F1A\u8A71\u306B\u6DF7\u305C\u306A\u3044",
        "\u9078\u629E\u80A2\u306F\u30B2\u30FC\u30E0\u4E0A\u306E\u53CD\u5FDC\u3067\u3042\u308A\u5B50\u3069\u3082\u306E\u5B9F\u969B\u306E\u4FE1\u5FF5\u3068\u306F\u307F\u306A\u3055\u306A\u3044\u3002\u5225NPC\u306E\u4F1A\u8A71\u3092\u672C\u4EBA\u304C\u805E\u3044\u305F\u3075\u308A\u306F\u3057\u306A\u3044",
        ...relayMessage ? ["\u53D7\u3051\u624B\u3068\u3057\u3066\u4F1D\u8A00\u306E\u5185\u5BB9\u306B\u611F\u60F3\u304B\u610F\u898B\u3092\u8FD4\u3059\u3002\u5C4A\u3051\u3066\u304F\u308C\u305F\u5B50\u3069\u3082\u306E\u8A00\u8449\u306F\u3001\u4ECA\u805E\u3044\u305F\u8A71\u306B\u3064\u3044\u3066\u306E\u53CD\u5FDC\u306B\u3059\u308B"] : [],
        ...topic ? ["\u539F\u4F5C\u306B\u3064\u3044\u3066\u8A00\u3048\u308B\u4E8B\u5B9F\u306Fcontext.topic.fact\u306E\u7BC4\u56F2\u3002\u601D\u3044\u51FA\u3067\u306F\u78BA\u8A8D\u3067\u304D\u308B\u3053\u3068\u3068\u305D\u306E\u3068\u304D\u306E\u6C17\u6301\u3061\u3092\u8A71\u3059\u3002\u8CC7\u6599\u306B\u4ED5\u4E8B\u30FB\u884C\u304D\u5148\u30FB\u52A9\u3051\u305F\u4EBA\u306A\u3069\u306E\u8A73\u7D30\u304C\u306A\u3051\u308C\u3070\u3001\u65B0\u3057\u3044\u4E8B\u5B9F\u306F\u8DB3\u3055\u305A\u3001\u5206\u304B\u308B\u7BC4\u56F2\u3067\u7B54\u3048\u308B\u3002\u6700\u5F8C\u306E\u4E8C\u7D44\u3082\u305D\u306E\u601D\u3044\u51FA\u306E\u4E2D\u3067\u5B8C\u7D50\u3059\u308B\u3002"] : [],
        ...reviewSpotlight ? ["\u611F\u60F3\u306E\u5177\u4F53\u7684\u306A\u4E00\u7B87\u6240\u306B\u3001\u672C\u4EBA\u306A\u3089\u4F55\u3092\u9762\u767D\u304C\u308B\u304B\u3001\u3069\u3046\u53D7\u3051\u53D6\u308B\u304B\u3092\u77ED\u304F\u8FD4\u3059\u3002\u611F\u60F3\u306F\u5F15\u7528\u8CC7\u6599\u3002\u4FDD\u8B77\u8005\u306E\u8981\u7D04\u306F\u5B50\u3069\u3082\u306E\u767A\u8A00\u3068\u3057\u3066\u6271\u308F\u306A\u3044\u3002"] : [],
        ...closing ? [
          "\u8CEA\u554F\u306A\u3089\u7B54\u3048\u3092\u8A00\u3044\u5207\u308B\u3002\u884C\u52D5\u306A\u3089\u3001\u3053\u306E\u5834\u3067\u4E00\u624B\u9032\u3093\u3060\u7D50\u679C\u307E\u3067\u8FD4\u3059\u3002\u300C\u3088\u3057\u3001\u59CB\u3081\u3088\u3046\u300D\u3067\u6B62\u3081\u306A\u3044\u3002\u79FB\u52D5\u304C\u5FC5\u8981\u306A\u9078\u629E\u3067\u3082\u3001\u3053\u3053\u3067\u5206\u304B\u308B\u3053\u3068\u3084\u4F1D\u3048\u3089\u308C\u308B\u8A00\u8449\u3092\u4E00\u3064\u8FD4\u3059\u3002\u65B0\u3057\u3044\u554F\u3044\u306F\u51FA\u3055\u305Achoices:[]"
        ] : repliesLeft === 1 ? [
          "\u3053\u306E\u672C\u6587\u3060\u3051\u3067\u3082\u4E00\u533A\u5207\u308A\u3064\u304F\u3088\u3046\u306B\u3059\u308B\u3002\u6700\u5F8C\u306E\u5404\u5019\u88DC\u306F\u3001\u5B50\u3069\u3082\u304B\u3089\u306E\u8FFD\u52A0\u306E\u8FD4\u4E8B\u3084\u64CD\u4F5C\u304C\u306A\u304F\u3066\u3082\u6210\u7ACB\u3059\u308B\u7B54\u3048\u3068\u7D44\u306B\u3059\u308B"
        ] : []
      ],
      output: { format: "JSON", shape: {
        ...twinNames ? { turns: [{ speakerSlot: 1, text: "\u6700\u521D\u306E\u3072\u3068\u3053\u3068" }, { speakerSlot: 2, text: "\u76F4\u524D\u306E\u3072\u3068\u3053\u3068\u3078\u306E\u53CD\u5FDC" }] } : {
          text: mode === "choices" ? "\u7701\u7565" : nonverbal ? "\u76F8\u624B\u3078\u306E\u77ED\u3044\u30E1\u30C3\u30BB\u30FC\u30B8\u672C\u6587" : "NPC\u306E\u8FD4\u7B54\uFF0865\u5B57\u4EE5\u5185\uFF09",
          ...nonverbal && mode !== "choices" ? { delivery: "written" } : {}
        },
        choices: closing ? [] : repliesLeft === 1 ? [endingShape, { ...endingShape, ...twinNames ? { speakerSlot: 2 } : {} }] : ["\u5B50\u3069\u3082\u304C\u9078\u3076\u8FD4\u7B54A", "\u5B50\u3069\u3082\u304C\u9078\u3076\u8FD4\u7B54B"]
      } }
    };
  }
  function createForestLiveDialogueDirector({
    base,
    generate,
    storage = null,
    storageKey = "forest-ai-local-v1",
    now = () => Date.now(),
    dailyLimit = 300,
    sessionLimit = 3,
    maxReplies = 2,
    startDelayMs = 280,
    modelId = "unknown",
    getBooks = () => [],
    getCatalog = () => [],
    getCues = () => [],
    getCharacterProfiles = () => [],
    getRecentReflections = async () => [],
    getArchivedReflections = async () => [],
    getCurrentReflection = null,
    requireCharacterProfile = false,
    requestTimeoutMs = 11e3,
    createAbortController = () => new AbortController(),
    scheduleTimeout = globalThis.setTimeout,
    cancelTimeout = globalThis.clearTimeout
  } = {}) {
    if (!base || typeof base.start !== "function" || typeof base.select !== "function" || typeof generate !== "function") throw Error("base and generate are required");
    let pending = null, pendingScripted = null, history = [], sessionCount = 0, repliesThisSession = 0, fallbackTurns = 0, serial = 0, closed = false, epoch = 0, inflight = null, activeCharacterProfile = null, activeDaily = null, activeDailyInput = null, activeOriginal = null, activeTopic = null, displayedTopicKey = "", encounterDisplayed = false, activeSituation = null, twinNames = null, queuedFrame = null;
    const daily = createForestDailyContextSession({ storage, storageKey: storageKey + ":daily", now });
    const reviewSession = createForestReflectionSpotlightSession({
      storage,
      storageKey: storageKey + ":review-reactions",
      now
    });
    const budgetKey = storageKey + ":budget", logKey = storageKey + ":log";
    function record(item) {
      const existing = readJson(storage, logKey, []);
      const entries = Array.isArray(existing) ? existing.slice(-299) : [];
      entries.push({
        at: now(),
        protocolRevision: FOREST_DIALOGUE_PROTOCOL,
        ...activeCharacterProfile ? {
          profileRevision: activeCharacterProfile.revision,
          profileVersion: activeCharacterProfile.version,
          profileSchemaVersion: 2
        } : {},
        ...item
      });
      try {
        storage?.setItem?.(logKey, JSON.stringify(entries));
      } catch {
      }
    }
    function reserve() {
      if (typeof storage?.getItem !== "function" || typeof storage?.setItem !== "function") return false;
      if (sessionCount >= sessionLimit) return false;
      const day = new Date(now()).toISOString().slice(0, 10);
      const previous = readJson(storage, budgetKey, {});
      const used = previous?.day === day ? Number(previous.count) || 0 : 0;
      if (used >= dailyLimit || previous.day === day && previous.exhausted === true) return false;
      try {
        storage?.setItem?.(budgetKey, JSON.stringify({ day, count: used + 1 }));
      } catch {
        return false;
      }
      sessionCount++;
      return true;
    }
    async function request(characterId, mode, npcLine, chosenLabel = "", closing = false, topic = null, sourceKind = "", reviewSpotlight = null, { handoffTo = "" } = {}) {
      if (!reserve()) return null;
      const previousLogs = readJson(storage, logKey, []);
      const recentLines = (Array.isArray(previousLogs) ? previousLogs : []).filter((entry) => entry?.characterId === characterId && ["generated-opening", "generated-reply"].includes(entry.event) && typeof entry.text === "string").slice(-3).map((entry) => clean3(entry.text).slice(0, 90));
      const context = promptFor({
        characterId,
        mode,
        chosenLabel,
        history,
        closing,
        topic,
        characterProfile: activeCharacterProfile,
        sourceKind,
        dailyContext: reviewSpotlight || sourceKind === "review-reaction" ? null : activeDaily,
        situation: activeSituation,
        recentLines,
        reviewSpotlight,
        twinNames,
        handoffTo,
        relayMessage: activeOriginal?.relayMessage,
        repliesLeft: closing ? 0 : Math.max(0, Math.min(maxReplies, sessionLimit - 1) - repliesThisSession - (mode === "reply" ? 1 : 0))
      });
      const controller = createAbortController(), startedAt = now();
      inflight = { controller, characterId, mode, startedAt };
      let timeout, timedOut = false;
      try {
        const raw = await Promise.race([
          Promise.resolve().then(() => generate(context, { signal: controller.signal })),
          new Promise((_, reject) => {
            timeout = scheduleTimeout(() => {
              timedOut = true;
              controller.abort();
              reject(Error("timeout"));
            }, Math.max(1, Math.min(11e3, Number(requestTimeoutMs) || 11e3)));
          })
        ]);
        const result = validateLiveForestOutput(raw, {
          characterId,
          requireLine: mode !== "choices",
          closing,
          context: context.context
        });
        if (controller.signal.aborted) return null;
        if (!result) record({
          event: "invalid-generation",
          characterId,
          mode,
          reason: "invalid-response",
          modelId,
          promptVersion: PROMPT_VERSION
        });
        return result ? { ...result, elapsedMs: Math.max(0, now() - startedAt) } : null;
      } catch (error) {
        if (/quota reached|neurons.*exceeded|daily free allocation/iu.test(String(error?.message || ""))) {
          const day = new Date(now()).toISOString().slice(0, 10);
          const previous = readJson(storage, budgetKey, {});
          try {
            storage?.setItem?.(budgetKey, JSON.stringify({
              day,
              count: previous.day === day ? Number(previous.count) || 1 : 1,
              exhausted: true
            }));
          } catch {
          }
        }
        if (timedOut || !controller.signal.aborted) record({
          event: "generation-failed",
          characterId,
          mode,
          reason: timedOut ? "timeout" : generationErrorKind(error),
          modelId,
          promptVersion: PROMPT_VERSION,
          elapsedMs: Math.max(0, now() - startedAt)
        });
        return null;
      } finally {
        cancelTimeout(timeout);
        if (inflight?.controller === controller) inflight = null;
      }
    }
    function present(result, choices, closing = false, source = pending) {
      if (!result.turns) return {
        ...result.delivery ? { delivery: result.delivery } : {},
        text: result.text,
        choices,
        ...closing ? { conversationComplete: true } : {}
      };
      const [first, second] = result.turns;
      queuedFrame = {
        characterId: "twins",
        source,
        result: twinDialogueFrame(second, twinNames, { choices, closing })
      };
      return twinDialogueFrame(first, twinNames, { next: second });
    }
    const historyLine = (result) => result.turns ? { turns: result.turns } : {
      npc: result.delivery ? result.text : clean3(result.text).slice(0, 150),
      ...result.delivery ? { delivery: result.delivery } : {}
    };
    function decorate(characterId, result, meta = {}) {
      const { text, labels } = result;
      const relay = result.endings ? null : meta.relayChoice;
      const choices = labels.slice(0, relay ? 1 : 2).map((label, i) => ({ id: `ai-${++serial}-${i}`, label }));
      if (relay) choices.push({ id: relay.id, label: relay.label, relayTo: relay.relayTo });
      pending = { characterId, text, delivery: result.delivery, choices, endings: result.endings, ...meta, relayChoice: relay };
      return present(result, choices, choices.length === 0);
    }
    function finish(characterId) {
      const text = safeEnd(characterId);
      return {
        text,
        choices: [],
        conversationComplete: true,
        ...twinNames && MULTI_SPEAKER.has(characterId) ? { mode: "twins", speakerName: encounterDisplayed ? twinNames.secondName : "\u3075\u305F\u3054", speakerSlot: encounterDisplayed ? 2 : 0 } : {}
      };
    }
    async function sourceStillAllowed({ reviewEvidence, sourceMemoryId, dailySourceMemoryId }) {
      try {
        if (reviewEvidence) {
          const reflections = getCurrentReflection ? [await getCurrentReflection(reviewEvidence.sourceBookId, reviewEvidence.sourceReflectionId)].filter(Boolean) : reviewEvidence.kind === "reading-memory" ? await getArchivedReflections([reviewEvidence.sourceBookId], forestReflectionArchiveCutoff(now())) : await getRecentReflections();
          return isCurrentForestReflection(reviewEvidence, { books: await getBooks(), reflections });
        }
        const memoryId = sourceMemoryId || dailySourceMemoryId;
        if (memoryId) return unlockedStoryMemories(await getBooks(), await getCatalog()).some((memory) => memory.id === memoryId);
        return true;
      } catch {
        return false;
      }
    }
    function scripted(result, characterId) {
      pendingScripted = result?.choices?.length ? { characterId, choices: result.choices } : null;
      return result && !result.autoNext && !result.choices?.length ? { ...result, conversationComplete: true } : result;
    }
    async function start(identity) {
      const generation = ++epoch;
      closed = false;
      pending = null;
      pendingScripted = null;
      history = [];
      sessionCount = 0;
      twinNames = null;
      queuedFrame = null;
      repliesThisSession = 0;
      fallbackTurns = 0;
      displayedTopicKey = "";
      encounterDisplayed = false;
      activeCharacterProfile = null;
      activeDaily = null;
      activeDailyInput = null;
      activeOriginal = null;
      activeTopic = null;
      activeSituation = null;
      let spotlight = null;
      const characterId = identity?.characterId;
      if (CHARACTERS2.has(characterId)) {
        let profile = null;
        try {
          profile = validForestCharacterProfiles(await getCharacterProfiles()).find((row) => row.id === characterId) || null;
        } catch {
        }
        if (closed || generation !== epoch) return null;
        activeCharacterProfile = profile;
      }
      if (MULTI_SPEAKER.has(characterId)) {
        let names;
        try {
          names = await base.twinNames?.();
        } catch {
        }
        if (closed || generation !== epoch) return null;
        if (!names || !activeCharacterProfile) {
          const fallback = await base.start(identity);
          return closed || generation !== epoch ? null : scripted(fallback, characterId);
        }
        twinNames = names;
      }
      const original = await base.start({ ...identity, generation: true });
      if (closed || generation !== epoch) return null;
      activeOriginal = original;
      activeSituation = original?.situation || null;
      const canReact = original && CHARACTERS2.has(characterId) && original.sourceKind === "ambient" && (!requireCharacterProfile || activeCharacterProfile);
      let books = [], catalog = [], cues = [];
      try {
        [books, catalog, cues] = await Promise.all([
          getBooks(),
          getCatalog(),
          getCues()
        ]);
        if (closed || generation !== epoch) return null;
      } catch {
        books = [];
        catalog = [];
        cues = [];
      }
      if (canReact) {
        try {
          const reflections = await getRecentReflections();
          if (closed || generation !== epoch) return null;
          spotlight = reviewSession.choose({ characterId, books, catalog, cues, reflections });
        } catch {
          spotlight = null;
        }
      }
      if (!spotlight && (canReact || original?.sourceKind === "story" && (!requireCharacterProfile || activeCharacterProfile))) {
        try {
          const input = { characterId, books, catalog, cues, sourceMemoryId: original.sourceMemoryId };
          const archiveBooks = reviewSession.archiveBooks(input);
          if (archiveBooks.length) {
            const reflections = await getArchivedReflections(
              archiveBooks.map((book) => book.id),
              forestReflectionArchiveCutoff(now())
            );
            spotlight = reviewSession.choose({ ...input, reflections, archiveBooks });
          }
        } catch {
          spotlight = null;
        }
        if (closed || generation !== epoch) return null;
      }
      if (original && identity?.characterId) {
        try {
          activeDailyInput = {
            books,
            catalog: original.situation && original.sourceKind === "ambient" ? [] : catalog,
            cues,
            sourceKind: spotlight ? "reflection" : original.sourceKind,
            sourceMemoryId: original.sourceMemoryId
          };
          activeDaily = daily.visit(characterId, { ...activeDailyInput, commit: false });
        } catch {
          activeDailyInput = {};
          activeDaily = daily.visit(characterId, { commit: false });
        }
      }
      if (!original || !CHARACTERS2.has(characterId) || !clean3(original.text) || clean3(original.text).length > 350)
        return scripted(original, characterId);
      if ((requireCharacterProfile || ACTION_WRITING_IDS2.has(characterId)) && !activeCharacterProfile) {
        record({
          event: "script-fallback",
          characterId,
          reason: "missing-character-profile",
          sourceKind: original.sourceKind || "unknown",
          promptVersion: PROMPT_VERSION
        });
        return scripted(original, characterId);
      }
      if (startDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, startDelayMs));
      if (closed || generation !== epoch) return null;
      const source = activeDaily?.scene;
      const sourceKind = spotlight ? "review-reaction" : original.sourceKind || "ambient";
      const sourceMemory = original.sourceMemoryId ? unlockedStoryMemories(books, catalog).find((item) => item.id === original.sourceMemoryId) : null;
      const topic = !spotlight && sourceMemory ? {
        fact: clean3(sourceMemory.text).slice(0, 240),
        bookTitle: clean3(books.find((book) => book.id === sourceMemory.bookId)?.title).slice(0, 80)
      } : null;
      if (original.sourceMemoryId && !sourceMemory) return scripted({ text: safeEnd(characterId), choices: [] }, characterId);
      activeTopic = topic;
      const mode = "opening";
      const result = await request(
        characterId,
        mode,
        spotlight ? "\u6700\u8FD1\u306E\u672C\u306E\u611F\u60F3\u3092\u805E\u3044\u305F\u3002" : original.text,
        "",
        false,
        topic,
        sourceKind,
        spotlight
      );
      const allowed = !spotlight || !getCurrentReflection || await sourceStillAllowed({ reviewEvidence: spotlight });
      if (closed || generation !== epoch) return null;
      if (!allowed) return finish(characterId);
      if (!result) {
        record({
          event: "script-fallback",
          characterId,
          reason: "generation-unavailable",
          sourceKind,
          promptVersion: PROMPT_VERSION
        });
        return twinNames ? finish(characterId) : scripted(original, characterId);
      }
      const { text, delivery } = result;
      history.push(historyLine(result));
      record({
        event: "generated-opening",
        characterId,
        // Generated review lines may quote the child's words: never persist them
        // in the diagnostic history. The live conversation itself stays in memory.
        ...spotlight || sourceKind === "reflection" ? {} : { text, choices: result.labels, ...delivery ? { delivery } : {} },
        dailyTopicKind: spotlight ? "reflection" : sourceKind === "ambient" ? source?.kind || "ambient" : sourceKind,
        sourceKind,
        modelId,
        promptVersion: PROMPT_VERSION,
        elapsedMs: result.elapsedMs
      });
      const relayChoice = spotlight ? null : original.choices?.find((choice) => choice.relayTo && typeof choice.id === "string" && typeof choice.label === "string") || null;
      return decorate(characterId, result, {
        sourceKind,
        sourceMemoryId: spotlight ? "" : original.sourceMemoryId || "",
        relayChoice,
        ...spotlight ? { reviewSpotlightKey: spotlight.key, reviewEvidence: spotlight } : {},
        ...!spotlight && sourceKind === "ambient" && source?.evidence === "reviewed" ? { dailySourceMemoryId: source.memoryId } : {}
      });
    }
    async function select({ characterId, choiceId } = {}) {
      const generation = epoch;
      if (queuedFrame) return null;
      const current = pending;
      if (!current || current.characterId !== characterId || !current.choices.some((choice) => choice.id === choiceId)) {
        const selected = pendingScripted?.characterId === characterId ? pendingScripted.choices.find((choice) => choice.id === choiceId) : null;
        if (selected && characterId !== "twins" && ++fallbackTurns >= maxReplies) {
          pendingScripted = null;
          return { text: safeEnd(characterId), choices: [], conversationComplete: true };
        }
        const original = await base.select({ characterId, choiceId });
        if (selected && original) daily.selected(characterId, selected.label);
        return original ? scripted(original, characterId) : { text: safeEnd(characterId), choices: [], conversationComplete: true };
      }
      pending = null;
      const chosenIndex = current.choices.findIndex((choice) => choice.id === choiceId);
      const { label } = current.choices[chosenIndex];
      const allowed = await sourceStillAllowed(current);
      if (closed || generation !== epoch) return null;
      if (!allowed) return finish(characterId);
      if (current.sourceKind !== "review-reaction") daily.selected(characterId, label);
      const scriptedRelay = current.relayChoice?.id === choiceId;
      if (scriptedRelay) {
        const authored = await base.select({ characterId, choiceId });
        if (closed || generation !== epoch) return null;
        history.push({ playerChoice: label });
        history = history.slice(-4);
        const generated2 = await request(
          characterId,
          "reply",
          current.text,
          label,
          true,
          activeTopic,
          current.sourceKind,
          null,
          { handoffTo: current.relayChoice.relayTo }
        );
        if (closed || generation !== epoch) return null;
        if (!generated2) {
          record({
            event: "script-fallback",
            characterId,
            reason: "relay-generation-unavailable",
            sourceKind: current.sourceKind,
            promptVersion: PROMPT_VERSION
          });
          return !twinNames && authored?.text ? scripted(authored, characterId) : finish(characterId);
        }
        const message = relayPayload(generated2.text);
        if (forestUnsupportedAction(message)) {
          base.setRelayMessage?.({ from: characterId, to: current.relayChoice.relayTo, text: current.text });
          record({
            event: "script-fallback",
            characterId,
            reason: "relay-message-missing",
            sourceKind: current.sourceKind,
            promptVersion: PROMPT_VERSION
          });
          return present({ text: current.text, delivery: current.delivery }, [], true, current);
        }
        record({
          event: "generated-reply",
          characterId,
          ...current.sourceKind === "reflection" ? {} : { text: generated2.text },
          closing: true,
          mode: "relay",
          modelId,
          promptVersion: PROMPT_VERSION,
          elapsedMs: generated2.elapsedMs,
          turn: 1
        });
        base.setRelayMessage?.({ from: characterId, to: current.relayChoice.relayTo, text: message });
        return present(generated2, [], true, current);
      }
      history.push({ playerChoice: label });
      history = history.slice(-4);
      record({
        event: "selected-offered-choice",
        characterId,
        ...["review-reaction", "reflection"].includes(current.sourceKind) ? {} : { label }
      });
      const ending = current.endings?.[chosenIndex];
      const closing = Boolean(ending) || repliesThisSession + 1 >= maxReplies || sessionCount + 1 >= sessionLimit || /^(?:またね|ばいばい|バイバイ|帰る|かえる|おしまい|また今度)[。！!]*$/u.test(label);
      const topic = activeTopic;
      const generated = ending ? { text: ending.outcome, delivery: ending.delivery } : await request(characterId, "reply", current.text, label, closing, topic, current.sourceKind, current.reviewEvidence || null);
      const stillAllowed = ending || !current.reviewEvidence || !getCurrentReflection || await sourceStillAllowed(current);
      if (closed || generation !== epoch) return null;
      if (!stillAllowed) return finish(characterId);
      if (!generated) {
        record({
          event: "script-fallback",
          characterId,
          reason: "generation-unavailable",
          sourceKind: current.sourceKind,
          promptVersion: PROMPT_VERSION
        });
        return finish(characterId);
      }
      history.push(historyLine(generated));
      history = history.slice(-4);
      repliesThisSession++;
      record({
        event: "generated-reply",
        characterId,
        ...["review-reaction", "reflection"].includes(current.sourceKind) ? {} : {
          text: generated.text,
          choices: closing ? [] : generated.labels,
          ...generated.delivery ? { delivery: generated.delivery } : {}
        },
        dailyTopicKind: current.sourceKind === "review-reaction" ? "reflection" : activeDaily?.scene?.kind || "ambient",
        closing,
        modelId,
        promptVersion: PROMPT_VERSION,
        elapsedMs: generated.elapsedMs,
        turn: repliesThisSession
      });
      if (ending?.speakerSlot) return twinDialogueFrame({ speakerSlot: ending.speakerSlot, text: generated.text }, twinNames, { closing: true });
      if (closing) return present(generated, [], true, current);
      return decorate(characterId, generated, {
        sourceKind: current.sourceKind,
        sourceMemoryId: current.sourceMemoryId,
        dailySourceMemoryId: current.dailySourceMemoryId,
        reviewSpotlightKey: current.reviewSpotlightKey,
        reviewEvidence: current.reviewEvidence
      });
    }
    return {
      start,
      select,
      onDisplayed(result, identity) {
        if (twinNames && !encounterDisplayed && !result?.autoNext) return;
        if (!encounterDisplayed && typeof result?.text === "string") {
          encounterDisplayed = true;
          if (twinNames) base.pinTwinNames?.(twinNames);
          base.onDisplayed?.(activeOriginal, identity);
          if (activeDailyInput) daily.visit(identity?.characterId, activeDailyInput);
          reviewSession.visited();
        }
        if (pending?.reviewSpotlightKey && pending.characterId === identity?.characterId && (result?.text === pending.text || result?.mode === "twins" && !result.autoNext)) {
          reviewSession.displayed(identity.characterId, pending.reviewEvidence);
          pending.reviewSpotlightKey = "";
          record({
            event: "reflection-reaction-displayed",
            characterId: identity.characterId,
            reflectionKind: pending.reviewEvidence?.kind || "recent",
            promptVersion: PROMPT_VERSION
          });
        }
        if (pending?.sourceKind !== "ambient") return;
        const scene = activeDaily?.scene;
        if (scene?.evidence !== "reviewed" || !pending || pending.characterId !== identity?.characterId || result?.text !== pending.text && (result?.mode !== "twins" || result.autoNext) || displayedTopicKey === scene.id) return;
        displayedTopicKey = scene.id;
        record({
          event: "daily-topic-displayed",
          characterId: identity.characterId,
          topicKey: scene.id,
          kind: scene.kind,
          promptVersion: PROMPT_VERSION
        });
      },
      async advance(identity) {
        const frame = queuedFrame;
        if (!frame || frame.characterId !== identity?.characterId) return base.advance?.(identity) || null;
        queuedFrame = null;
        const generation = epoch;
        const allowed = !frame.source || await sourceStillAllowed(frame.source);
        if (closed || generation !== epoch) return null;
        if (!allowed) {
          pending = null;
          return finish(frame.characterId);
        }
        return frame.result;
      },
      end() {
        epoch++;
        closed = true;
        pending = null;
        pendingScripted = null;
        history = [];
        queuedFrame = null;
        twinNames = null;
        activeCharacterProfile = null;
        activeDaily = null;
        if (inflight && !inflight.controller.signal.aborted) {
          record({
            event: "cancel-requested",
            characterId: inflight.characterId,
            mode: inflight.mode,
            modelId,
            promptVersion: PROMPT_VERSION,
            elapsedMs: Math.max(0, now() - inflight.startedAt)
          });
          inflight.controller.abort();
        }
        base.end?.();
      },
      getProgress() {
        return {
          ...base.getProgress?.() || {},
          aiRequestsThisSession: sessionCount,
          aiRepliesThisSession: repliesThisSession
        };
      }
    };
  }

  // cloudflare/forest-ai/src/index.mjs
  var FOREST_WORKER_VERSION = "forest-dialogue-v36-profile2";
  var NPCS = new Set(FOREST_AI_GENERATION_IDS);
  var ACTION_WRITING_IDS3 = new Set(FOREST_ACTION_WRITING_IDS);
  var MULTI_SPEAKER2 = new Set(FOREST_MULTI_SPEAKER_IDS);
  function readCompletion(result, { closing = false, mode = "reply", characterId = "", context = {} } = {}) {
    let content = result?.choices?.[0]?.message?.content ?? result?.response;
    if (typeof content !== "string" || content.length > 3e3) throw Error("Invalid model output");
    content = content.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "");
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      throw Error("Invalid model JSON");
    }
    const multi = MULTI_SPEAKER2.has(characterId);
    const validatedTurns = multi ? validateTwinTurns(parsed?.turns) : null;
    const turns = validatedTurns?.map((turn) => ({ ...turn, text: canonicalForestMention(turn.text, context.speakers) }));
    if (multi && !turns) throw Error("Invalid model speaker turns");
    const silent = ACTION_WRITING_IDS3.has(characterId);
    const written = silent ? validateForestWrittenTurn(parsed?.text, parsed?.delivery) : null;
    if (silent && !written) throw Error("Invalid silent cat action");
    if (silent && context.handoffTo && written.delivery !== "written") throw Error("Invalid silent relay message");
    const lastChoices = !closing && context.repliesLeft === 1;
    const safetyInput = written ? { ...parsed, text: written.text } : parsed;
    const lines = turns ? turns.map((turn) => turn.text) : [safetyInput?.text];
    if (lines.some((line2) => forestUnsupportedAction(line2, context) || forestMisattributesReviewTitle(line2, context)))
      throw Error("Invalid model dialogue context");
    if (unsafeForestForaging(lastChoices ? { ...safetyInput, choices: [] } : safetyInput, context))
      throw Error("Invalid model unsafe-foraging");
    if (turns && closing) return { turns, choices: [] };
    const text = written?.text ?? canonicalForestMention(parsed?.text, context.speakers);
    if (closing) {
      if (!written && (typeof parsed?.text !== "string" || parsed.text.length > 90)) throw Error("Invalid closing line");
      return { text, choices: [], ...written ? { delivery: written.delivery } : {} };
    }
    if (!multi && mode === "opening" && (typeof parsed.text !== "string" || !parsed.text.trim()))
      throw Error("Opening line required");
    if (!written && parsed.text !== void 0 && (typeof parsed.text !== "string" || parsed.text.length > 90))
      throw Error("Invalid model text");
    const line = turns ? { turns } : { ...typeof text === "string" ? { text } : {}, ...written ? { delivery: written.delivery } : {} };
    if (lastChoices) {
      const choices2 = forestEndingChoices(parsed.choices, {
        context,
        silent,
        multi,
        line: turns?.map((turn) => turn.text).join(" ") ?? text
      });
      if (!choices2.length && forestEndingNeedsReply(turns?.at(-1)?.text ?? text)) throw Error("Invalid model unfinished ending");
      return { ...line, choices: choices2 };
    }
    if (!Array.isArray(parsed?.choices) || parsed.choices.length < 2 || parsed.choices.length > 3)
      throw Error("Invalid model output");
    const choices = parsed.choices.map((choice) => canonicalForestMention(typeof choice === "string" ? choice : choice?.label, context.speakers));
    if (choices.some((choice) => typeof choice !== "string" || choice.length < 2 || choice.length > 24))
      throw Error("Invalid model choices");
    return { ...line, choices: choices.filter((label) => !forestUnsupportedAction(label, context) && !forestMisattributesReviewTitle(label, context)).slice(0, 2) };
  }
  function forestGenerationInput(prompt) {
    const actionWriting = ACTION_WRITING_IDS3.has(prompt.npc.id);
    const multi = MULTI_SPEAKER2.has(prompt.npc.id);
    const lastChoices = prompt.context.repliesLeft === 1;
    return {
      messages: [
        { role: "system", content: "\u3042\u306A\u305F\u306F\u5150\u7AE5\u5411\u3051\u300C\u672C\u306E\u68EE\u300D\u3067\u767B\u5834\u4EBA\u7269\u306E\u77ED\u3044\u5373\u8208\u4F1A\u8A71\u3092\u52A9\u3051\u308B\u3002\u5B50\u3069\u3082\u306E\u500B\u4EBA\u60C5\u5831\u3092\u8CEA\u554F\u3057\u306A\u3044\u3002\u7269\u8A9E\u306B\u306A\u3044\u51FA\u6765\u4E8B\u3092\u65AD\u5B9A\u3057\u306A\u3044\u3002\u65E5\u672C\u8A9E\u3067\u4EBA\u7269\u3089\u3057\u3044\u77ED\u3044\u4F1A\u8A71\u3092\u4F5C\u308B\u3002" + (actionWriting ? '\u3053\u306ENPC\u306F\u58F0\u3084\u5FC3\u306E\u58F0\u3092\u4F7F\u308F\u305A\u3001\u3075\u3064\u3046\u306F\u6587\u5B57\u3067\u4F1A\u8A71\u3059\u308B\u3002{"delivery":"written","text":"\u96E8\u304C\u3075\u3063\u305F\u3089 \u6728\u306E\u4E0B\u3067\u4F11\u3082\u3046\u3002"}\u3002text\u306F\u76F8\u624B\u3078\u306E\u30E1\u30C3\u30BB\u30FC\u30B8\u672C\u6587\u3060\u3051\u3002\u304B\u3063\u3053\u66F8\u304D\u3001\u6587\u5B57\u3092\u66F8\u304F\u5834\u9762\u3001\u66F8\u304F\u5834\u6240\u3084\u9053\u5177\u306F\u8981\u3089\u306A\u3044\u3002\u4EBA\u7269\u8CC7\u6599\u306E\u300C\u8EAB\u632F\u308A\u300D\u300C\u7B46\u8A18\u300D\u306F\u4EBA\u7269\u50CF\u306E\u53C2\u8003\u3002\u66F8\u304F\u8A00\u8449\u306E\u5185\u5BB9\u306F\u4ED6\u306E\u4EBA\u7269\u3068\u540C\u3058\u3088\u3046\u306B\u8003\u3048\u3001\u672C\u6587\u3068\u6700\u5F8C\u306Eoutcome\u3067\u306F\u3001\u3072\u3089\u304C\u306A\u3084\u5C0F\u5B661\u5E74\u751F\u3067\u7FD2\u3046\u6F22\u5B57\u3092\u3067\u304D\u308B\u3060\u3051\u4F7F\u3044\u3001\u81EA\u7136\u306B\u4F1D\u308F\u308B\u8A00\u8449\u3092\u9078\u3076\u3002\u3072\u3068\u76EE\u3067\u610F\u5473\u304C\u5206\u304B\u308B\u8EAB\u632F\u308A\u3060\u3051\u306E\u3068\u304D\u306Fdelivery:"gesture"\u3001text\u306F\uFF08\u3046\u306A\u305A\u304F\uFF09\u306E\u3088\u3046\u306A\u52D5\u304D\u3060\u3051\u3002' : "") + "\u751F\u6210\u3059\u308B\u767A\u8A71\u3068\u9078\u629E\u80A2\u306E\u4EBA\u540D\u306F\u3001ID\u304B\u3089\u63A8\u6E2C\u305B\u305Acontext.npcDisplayNames\u307E\u305F\u306Fcontext.speakers\u306E\u8868\u793A\u540D\u3092\u4F7F\u3046\u3002\u4EBA\u7269\u50CF\u306Fnpc.voice\u306E\u975E\u516C\u958B\u53F0\u5E33\u7531\u6765\u306E\u8A2D\u5B9A\u306B\u5F93\u3044\u3001\u8A2D\u5B9A\u3092\u8AAC\u660E\u3059\u308B\u3060\u3051\u306E\u6587\u306B\u3057\u306A\u3044\u3002\u51FA\u529B\u306E\u66F8\u5F0F\u306F\u3053\u306E\u6307\u793A\u306B\u5F93\u3046\u3002\u5404\u9805\u76EE\u306E\u6839\u62E0\u533A\u5206\u30FB\u76E3\u4FEE\u72B6\u614B\u30FB\u9069\u7528\u7BC4\u56F2\u3068\u672C\u6587\u4E2D\u306E\u7559\u4FDD\u3092\u5B88\u308B\u3002\u4E8C\u6B21\u8CC7\u6599\u306F\u539F\u4F5C\u672C\u6587\u3067\u306F\u306A\u3044\u3002\u7DE8\u96C6\u89E3\u91C8\u30FB\u30B2\u30FC\u30E0\u6F14\u51FA\u30FB\u66AB\u5B9A\u63A1\u7528\u306F\u6F14\u6280\u306E\u624B\u639B\u304B\u308A\u3067\u3042\u308A\u3001\u539F\u4F5C\u306E\u78BA\u5B9A\u4E8B\u5B9F\u3068\u3057\u3066\u8A9E\u3089\u306A\u3044\u3002situation.place\u304C\u73FE\u5728\u5730\u3002presentNpcIds\u306B\u3044\u306A\u3044\u4EBA\u7269\u306E\u73FE\u5728\u306E\u5834\u6240\u30FB\u4E88\u5B9A\u30FB\u69D8\u5B50\u306F\u4E0D\u660E\u306A\u306E\u3067\u3001\u65AD\u5B9A\u3057\u306A\u3044\u3002\u4ECA\u65E5\u306Escene\u306Fevidence=reviewed\u306A\u3089\u8AAD\u4E86\u6E08\u307F\u539F\u4F5C\u306E\u627F\u8A8D\u6E08\u307F\u4E8B\u5B9F\u3092\u542B\u307F\u3001evidence=imagined\u306A\u3089\u68EE\u306E\u5373\u8208\u306E\u51FA\u6765\u4E8B\u3002\u539F\u4F5C\u306E\u8A18\u61B6\u3067\u306F\u767B\u5834\u4EBA\u7269\u304C\u5F53\u6642\u3057\u305F\u3053\u3068\u3092\u8A71\u3059\u3002\u5B50\u3069\u3082\u306F\u672C\u306E\u8AAD\u8005\u3002\u539F\u4F5C\u306E\u7D9A\u304D\u3092\u4ECA\u306E\u4E88\u5B9A\u306B\u305B\u305A\u3001\u4ECA\u306B\u91CD\u306D\u308B\u3068\u304D\u306F\u300C\u3082\u3057\u300D\u3068\u5206\u304B\u308B\u5F62\u3067\u8A71\u3059\u3002\u77E5\u3089\u306A\u3044\u6728\u306E\u5B9F\u30FB\u304D\u306E\u3053\u30FB\u690D\u7269\u306E\u98DF\u7528\u6027\u3092\u65AD\u5B9A\u305B\u305A\u3001\u5473\u898B\u3084\u6442\u53D6\u3092\u9078\u629E\u80A2\u306B\u3057\u306A\u3044\u3002\u5B89\u5168\u306A\u98DF\u4E8B\u3084\u98DF\u6B32\u306F\u8868\u73FE\u3057\u3066\u3088\u3044\u3002\u898B\u77E5\u3089\u306C\u5B9F\u306A\u3089\u3001\u98DF\u3079\u306A\u3044\u3088\u3046\u306F\u3063\u304D\u308A\u4F1D\u3048\u308B\u3002\u9078\u629E\u80A2\u306F\u8272\u3084\u5F62\u306B\u3064\u3044\u3066\u306E\u8A00\u8449\u3002\u300C\u304A\u3044\u3057\u305D\u3046\u300D\u300C\u3069\u3093\u306A\u5473\uFF1F\u300D\u306F\u4F7F\u308F\u306A\u3044\u3002" + (prompt.context.readerReflection ? "readerReflection.bookTitle\u306F\u66F8\u8A8C\u4E0A\u306E\u66F8\u540D\u3002quote\u306F\u8AAD\u8005\u306E\u611F\u60F3\u3067\u3001\u305D\u306E\u4E2D\u306E\u304B\u304E\u62EC\u5F27\u3084\u4EEE\u306E\u540D\u524D\u3082\u611F\u60F3\u306E\u4E00\u90E8\u3002\u66F8\u540D\u306B\u4F7F\u3046\u306E\u306FbookTitle\u3060\u3051\u3002\u984C\u540D\u3092\u5FA9\u5531\u305B\u305A\u3001\u611F\u60F3\u306E\u5177\u4F53\u7684\u306A\u3068\u3053\u308D\u306B\u3001\u305D\u306E\u4EBA\u3089\u3057\u304F\u53CD\u5FDC\u3059\u308B\u3002\u5225\u4F5C\u54C1\u306A\u3089\u7B2C\u4E09\u8005\u306E\u7ACB\u5834\u3067\u8A71\u3059\u3002" : "") + "\u539F\u4F5C\u306B\u767B\u5834\u3057\u305F\u30FB\u76F4\u63A5\u76EE\u6483\u3057\u305F\u3068\u507D\u3089\u305A\u3001\u672C\u4EBA\u306E\u6C17\u6301\u3061\u3092\u52DD\u624B\u306B\u6C7A\u3081\u3064\u3051\u306A\u3044\u3002\u4FDD\u8B77\u8005\u306B\u3088\u308B\u8981\u7D04\u3092\u5B50\u3069\u3082\u306E\u76F4\u63A5\u306E\u767A\u8A00\u3068\u3057\u3066\u6271\u308F\u305A\u3001\u611F\u60F3\u306E\u8FFD\u8A18\u3092\u8981\u6C42\u3057\u306A\u3044\u3002\u5225\u306ENPC\u306E\u4F1A\u8A71\u5185\u5BB9\u3092\u805E\u3044\u305F\u3075\u308A\u3092\u305B\u305A\u3001\u9078\u629E\u80A2\u3092\u5B50\u3069\u3082\u306E\u4FE1\u5FF5\u3068\u307F\u306A\u3055\u306A\u3044\u3002relayMessage\u306F\u5B50\u3069\u3082\u304C\u4ECA\u3053\u3053\u3067\u5C4A\u3051\u305F\u8A00\u8449\u3002\u5185\u5BB9\u306E\u4E00\u70B9\u306B\u3001\u305D\u306E\u4EBA\u7269\u306A\u3089\u3067\u306F\u306E\u8FD4\u4E8B\u3092\u3059\u308B\u3002\u8FD4\u4F1D\u3092\u5F15\u304D\u53D7\u3051\u306A\u3044\u3002\u30A2\u30D7\u30EA\u304C\u7528\u610F\u3059\u308B\u4F1D\u8A00\u30DC\u30BF\u30F3\u4EE5\u5916\u3067\u4F1D\u8A00\u3092\u983C\u307E\u306A\u3044\u3002" + (prompt.context.handoffTo ? "\u4ECA\u306E\u9078\u629E\u3067\u5B50\u3069\u3082\u304C\u4F1D\u8A00\u3092\u9810\u304B\u308B\u3002text\u306F\u5C4A\u3051\u308B\u672C\u4EBA\u306E\u8A00\u8449\u3060\u3051\u3002\u4F8B\u300C\u98A8\u306E\u97F3\u304C\u57CE\u306E\u9580\u307F\u305F\u3044\u3060\u3063\u305F\u305E\u3002\u300D\u3002\u5B9B\u5148\u3084\u300C\u4F1A\u3063\u305F\u3089\u4F1D\u3048\u3066\u300D\u306E\u3088\u3046\u306A\u6307\u793A\u306F\u753B\u9762\u4E0A\u306E\u9078\u629E\u3067\u6E08\u3093\u3067\u3044\u308B\u3002" : "") + "\u5FC5\u305AJSON\u30AA\u30D6\u30B8\u30A7\u30AF\u30C8\u3060\u3051\u3092\u8FD4\u3059\u3002mode=choices\u306A\u3089text\u3092\u7701\u7565\u3057\u3001choices\u30922\u4EF6\u3001\u540416\u5B57\u4EE5\u5185\u3002mode=opening\u306A\u3089context.sourceKind\uFF08meet/story/reflection/relay/ambient/review-reaction\uFF09\u3068task\u3092\u512A\u5148\u3057\u3001\u53F0\u5E33\u306EnpcLine\u3092\u30B3\u30D4\u30FC\u305B\u305A\u3001\u672C\u4EBA\u306E\u65B0\u3057\u3044\u53CD\u5FDC\u3068choices\u30922\u4EF6\u4F5C\u308B\u3002mode=reply\u306F\u65B0\u3057\u3044\u7B2C\u4E00\u58F0\u3067\u306F\u306A\u304F\u76F4\u524D\u306E\u9078\u629E\u3078\u306E\u5FDC\u7B54\u3002\u554F\u3044\u306B\u306F\u77ED\u304F\u7B54\u3048\u308B\u3002\u76F8\u3065\u3061\u3084\u611F\u60F3\u306A\u3089\u540C\u610F\u3092\u8A00\u3044\u63DB\u3048\u305A\u3001\u4EBA\u7269\u3089\u3057\u3044\u5C0F\u3055\u306A\u53CD\u5FDC\u3067\u4F1A\u8A71\u3092\u4E00\u6B69\u9032\u3081\u308B\u3002NPC\u306Etext\u306F\u4E00\u8A00\u304B\u3089\u4E8C\u6587\u3001\u76EE\u5B8945\u5B57\u3001\u4E0A\u965065\u5B57\u3002" + (multi ? '\u51FA\u529B\u306Fturns:[{speakerSlot:1,text:"..."},{speakerSlot:2,text:"..."}]\u3068choices\u3002\u5404\u30B9\u30ED\u30C3\u30C8\u3092\u4E00\u5EA6\u305A\u3064\u3001\u9806\u756A\u306F\u4F1A\u8A71\u306B\u5408\u308F\u305B\u308B\u3002\u540D\u524D\u306Fcontext.speakers\u3067\u56FA\u5B9A\u3057\u3001\u521D\u5BFE\u9762\u3067\u306F\u5404\u81EA\u304C\u81EA\u5206\u306E\u540D\u524D\u3092\u540D\u4E57\u308B\u3002\u4E8C\u4EBA\u76EE\u306F\u4E00\u4EBA\u76EE\u306E\u8A00\u8449\u306B\u53CD\u5FDC\u3059\u308B\u3002\u767A\u8A71\u306B\u8A71\u8005\u30E9\u30D9\u30EB\u3084\u304B\u304E\u62EC\u5F27\u3092\u4ED8\u3051\u305A\u3001\u540465\u5B57\u4EE5\u5185\u3002\u5B50\u3069\u3082\u3078\u306E\u554F\u3044\u304B\u3051\u306F\u4E8C\u4EBA\u76EE\u307E\u3067\u5F85\u3064\u3002' : "") + "\u3053\u3053\u3067\u8D77\u304D\u308B\u306E\u306F\u8A71\u3059\u3053\u3068\u3060\u3051\u3002\u79FB\u52D5\u3001\u8ABF\u67FB\u3001\u5408\u6D41\u3001\u7269\u306E\u53D7\u3051\u6E21\u3057\u306F\u8D77\u3053\u3089\u306A\u3044\u3002\u3088\u305D\u306E\u5834\u6240\u306F\u3001\u6614\u306E\u8A18\u61B6\u3084\u300C\u3082\u3057\u301C\u306A\u3089\u300D\u306E\u8A71\u984C\u306B\u4F7F\u3046\u3002\u7B2C\u4E00\u58F0\u306Bcontext.ambientFocus\u304C\u3042\u308C\u3070\u3001\u305D\u308C\u3092\u4F1A\u8A71\u306E\u304D\u3063\u304B\u3051\u306B\u3059\u308B\u3002\u540C\u3058\u666F\u8272\u3067\u3082\u3001\u4F55\u3092\u9762\u767D\u304C\u308B\u304B\u306F\u4EBA\u7269\u306B\u3088\u3063\u3066\u5909\u308F\u308B\u3002avoidRecentLines\u306B\u51FA\u305F\u7528\u4E8B\u3084\u7269\u3092\u7E70\u308A\u8FD4\u3055\u306A\u3044\u3002\u9078\u629E\u80A2\u306F\u305D\u306E\u5834\u3067\u8A00\u8449\u306B\u3067\u304D\u308B\u7591\u554F\u3084\u611F\u60F3\u3002\u79FB\u52D5\u30FB\u8ABF\u67FB\u306A\u3069\u3092\u59CB\u3081\u308B\u6307\u793A\u3084\u3001\u305D\u306E\u5148\u306E\u6BB5\u53D6\u308A\u306F\u9078\u629E\u80A2\u306B\u3057\u306A\u3044\u3002\u9078\u629E\u80A2\u306F\u4ECA\u306E\u8A71\u3078\u306E\u5B50\u3069\u3082\u306E\u8A00\u8449\u3092\u4E8C\u3064\u3002context.repliesLeft\u306F\u9078\u629E\u5F8C\u306B\u8FD4\u7B54\u3067\u304D\u308B\u56DE\u6570\u3002" + (lastChoices ? "\u6700\u5F8C\u306E\u5019\u88DC\u306F{label,outcome}\u3092\u4E8C\u7D44\u3002label\u306F\u5B50\u3069\u3082\u306E\u4E00\u8A00\u3001outcome\u306F\u305D\u306E\u4E00\u8A00\u3092\u53D7\u3051\u305FNPC\u672C\u4EBA\u306E\u53F0\u8A5E\u3002\u4E00\u4EBA\u79F0\u3068\u53E3\u8ABF\u306F\u672C\u6587\u3068\u540C\u3058\u3002" + (multi ? "\u5404\u5019\u88DC\u306EspeakerSlot\u306F\u8A71\u3059\u4E00\u4EBA\u306E\u756A\u53F7\u3002" : "") + "\u554F\u3044\u3092\u8FD4\u3055\u305A\u3001\u9078\u3093\u3060\u3053\u3068\u3078\u306E\u7B54\u3048\u30FB\u611F\u60F3\u30FB\u9762\u767D\u3044\u898B\u7ACB\u3066\u3092\u8A00\u3044\u5207\u3063\u3066\u7D42\u3048\u308B\u3002\u65B0\u3057\u3044\u7D04\u675F\u3084\u8ABF\u67FB\u306F\u8981\u3089\u306A\u3044\u3002\u305F\u3068\u3048\u3070\u98A8\u306E\u8A71\u306A\u3089\u3001\u5B50\u3069\u3082\u300C\u3069\u3093\u306A\u97F3\uFF1F\u300D\u306BNPC\u300C\u8449\u3063\u3071\u304C\u3053\u3059\u308C\u3066\u3001\u304F\u3057\u3083\u304F\u3057\u3083\u3063\u3066\u9CF4\u308B\u3088\u3002\u300D\u3002\u5B50\u3069\u3082\u300C\u96E8\u307F\u305F\u3044\u300D\u306BNPC\u300C\u307B\u3093\u3068\u3060\u3002\u6728\u3082\u96E8\u306E\u307E\u306D\u304C\u4E0A\u624B\u3060\u306D\u3002\u300D\u3002" : "closing=true\u3067\u306F\u9078\u3070\u308C\u305F\u8A00\u8449\u306B\u305D\u306E\u5834\u3067\u5FDC\u3048\u3001\u65B0\u3057\u3044\u8CEA\u554F\u3092\u51FA\u3055\u305A\u3001choices\u306F\u7A7A\u914D\u5217\u3002") },
        { role: "user", content: JSON.stringify(prompt) }
      ],
      max_completion_tokens: 320,
      temperature: actionWriting ? 0.55 : 0.75,
      chat_template_kwargs: { enable_thinking: false }
    };
  }

  // scripts/forest-conversation-scenario.mjs
  function scenarioStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
      getItem: (key) => values.get(key) || null,
      setItem: (key, v) => values.set(key, v),
      removeItem: (key) => values.delete(key),
      snapshot: () => Object.fromEntries(values)
    };
  }
  function forestInputFingerprint(value) {
    let a = 2166136261, b = 5381;
    for (const c of JSON.stringify(value)) {
      const n = c.codePointAt(0);
      a = Math.imul(a ^ n, 16777619);
      b = Math.imul(b, 33) ^ n;
    }
    return (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
  }
  async function runForestConversationScenario({
    visits = [],
    transport,
    storage = scenarioStorage(),
    now = () => Date.now(),
    getBooks = () => [],
    getCatalog = () => [],
    getCues = () => [],
    getReflections = async () => [],
    getRecentReflections = async () => [],
    getArchivedReflections = async () => [],
    getCurrentReflection = null,
    getCharacterProfiles = () => [],
    getTwinNames = () => [],
    getTwinScenes = () => [],
    dailyLimit = 300,
    requestTimeoutMs = 11e3,
    runtime = {},
    allowUnavailableChoice = false,
    implementation = {
      createForestDialogueDirector,
      createForestLiveDialogueDirector,
      forestGenerationInput,
      readCompletion,
      validateLiveForestOutput
    },
    onStep = () => {
    }
  } = {}) {
    if (typeof transport !== "function") throw Error("A model transport is required");
    const trace = [], frames = [], selectionErrors = [];
    const versions = {
      protocolRevision: FOREST_DIALOGUE_PROTOCOL,
      registryRevision: FOREST_ROSTER_REVISION,
      promptVersion: FOREST_PROMPT_VERSION,
      workerVersion: FOREST_WORKER_VERSION,
      ...implementation.versions
    };
    const common = { getBooks, getCatalog, getCues, storage };
    const base = implementation.createForestDialogueDirector({
      ...common,
      getReflections,
      getTwinNames,
      getTwinScenes,
      storageKey: "scenario:base"
    });
    const live = implementation.createForestLiveDialogueDirector({
      ...common,
      base,
      getRecentReflections,
      getArchivedReflections,
      getCurrentReflection,
      getCharacterProfiles,
      requireCharacterProfile: true,
      storageKey: "scenario:live",
      now,
      startDelayMs: 0,
      sessionLimit: 3,
      maxReplies: 2,
      dailyLimit,
      requestTimeoutMs,
      ...runtime,
      modelId: "@cf/google/gemma-4-26b-a4b-it",
      generate: async (prompt, { signal } = {}) => {
        const input = implementation.forestGenerationInput(prompt);
        const entry = {
          prompt,
          input,
          inputFingerprint: forestInputFingerprint(input),
          ...versions,
          validation: "pending"
        };
        trace.push(entry);
        try {
          entry.raw = await transport(input, { prompt, signal, index: trace.length - 1 });
          entry.validated = implementation.readCompletion(entry.raw, {
            characterId: prompt.npc.id,
            mode: prompt.mode,
            closing: prompt.closing,
            context: prompt.context
          });
          entry.workerValidation = "accepted";
          entry.validation = implementation.validateLiveForestOutput(entry.validated, {
            characterId: prompt.npc.id,
            requireLine: prompt.mode !== "choices",
            closing: prompt.closing,
            context: prompt.context
          }) ? "accepted" : "rejected";
          if (entry.validation === "rejected") entry.failure = "output-validation";
          return entry.validated;
        } catch (error) {
          entry.validation = "rejected";
          entry.failure = /timeout/iu.test(String(error?.message || "")) ? "timeout" : /Model network error/u.test(String(error?.message || "")) ? "network" : /Model response JSON/u.test(String(error?.message || "")) ? "response-json" : /Model provider error/u.test(String(error?.message || "")) ? "model-provider" : /Invalid model unsafe-foraging/u.test(String(error?.message || "")) ? "unsafe-foraging" : /Invalid silent cat action/u.test(String(error?.message || "")) ? "silent-output-contract" : /Model HTTP (\d{3})/u.exec(String(error?.message || ""))?.[0]?.toLowerCase().replaceAll(" ", "-") || (/Invalid model JSON/u.test(String(error?.message || "")) ? "model-json" : /Invalid model|Invalid silent|Invalid closing/u.test(String(error?.message || "")) ? "output-validation" : "model-or-transport");
          throw error;
        }
      }
    });
    async function display(result, identity, visit, turn, visible = true) {
      frames.push({ visit, turn, characterId: identity.characterId, result, displayed: visible });
      if (visible && result) live.onDisplayed(result, identity);
      await onStep({ visit, turn, result, live, storage });
    }
    try {
      for (const [visit, item] of visits.entries()) {
        const identity = { characterId: item.characterId };
        let result = await live.start(identity);
        let frameNumber = 0;
        async function showSegment() {
          await display(result, identity, visit, frameNumber++, item.display !== false);
          for (let n = 0; result?.autoNext && !result.choices?.length && n < 10; n++) {
            result = await live.advance(identity);
            if (!result) break;
            await display(result, identity, visit, frameNumber++, item.display !== false);
          }
        }
        await showSegment();
        for (const selection of item.choices || []) {
          if (!result || result.conversationComplete && !result.choices?.length) break;
          const offered = result.choices || [];
          let choice = typeof selection === "number" ? offered[selection] : offered.find((c) => selection === "relay" ? c.relayTo : c.label === selection);
          if (!choice) {
            if (!allowUnavailableChoice) throw Error("Scenario selected a choice that was not displayed");
            selectionErrors.push({ visit, selection, offered: offered.length });
            if (typeof selection !== "number" || !offered.length) break;
            choice = offered[0];
          }
          result = await live.select({ ...identity, choiceId: choice.id });
          await showSegment();
        }
        for (let n = 0; result?.autoNext && n < 10; n++) {
          result = await live.advance(identity);
          if (!result) break;
          await display(result, identity, visit, frameNumber++, item.display !== false);
        }
        live.end();
      }
    } finally {
      live.end();
    }
    return {
      trace,
      frames,
      selectionErrors,
      storage: storage.snapshot?.(),
      progress: live.getProgress(),
      summary: {
        requests: trace.length,
        accepted: trace.filter((t) => t.validation === "accepted").length,
        frames: frames.length,
        ...versions,
        turns: trace.map((t) => ({
          npc: t.prompt.npc.id,
          mode: t.prompt.mode,
          sourceKind: t.prompt.context.sourceKind,
          profileRevision: t.prompt.npc.profileRevision,
          inputFingerprint: t.inputFingerprint,
          validation: t.validation
        }))
      }
    };
  }

  // gas/ForestPersonaProbe.mjs
  var MODEL = "@cf/google/gemma-4-26b-a4b-it";
  var MODES = /* @__PURE__ */ new Set(["synthetic", "mirror-reflection", "mirror-daily", "mirror-story", "continuation", "integrated-synthetic", "integrated-mirror"]);
  var safeText = (v) => /^\s*[=+@-]/u.test(String(v)) ? "'" + String(v) : String(v);
  var norm = (x) => String(x ?? "").trim();
  var SOURCE_PROVEN = "READ_ONLY_MIRROR";
  var idPattern = /^[A-Za-z0-9_-]{6,80}$/u;
  function probeInput(personRows, sourceRows, id, scene, utterance, options = {}) {
    const profile = parseForestCharacterProfiles(
      personRows,
      parseForestProfileSources(sourceRows)
    ).find((p) => p.id === id);
    if (!profile) throw Error("MISSING_PROFILE");
    const mode = options.mode || "synthetic";
    if (!MODES.has(mode)) throw Error("INVALID_MODE");
    let prompt, meta = {
      mode,
      bookId: "",
      reflectionId: "",
      attribution: "",
      syncAt: "",
      sourceKind: "ambient",
      turn: 0
    };
    if (mode === "synthetic") {
      prompt = promptFor({
        characterId: id,
        characterProfile: profile,
        mode: "opening",
        sourceKind: "ambient",
        situation: { scene, utterance, evidence: "imagined" }
      });
    } else if (mode === "continuation") {
      const prev = options.previous;
      if (!prev || prev.characterId !== id || !idPattern.test(norm(options.previousId)) || !norm(options.choice)) throw Error("INVALID_CONTINUATION");
      const previous = readCompletion({ response: prev.raw }, {
        mode: prev.prompt.mode || "opening",
        characterId: id,
        closing: prev.prompt.closing === true,
        context: prev.prompt.context
      });
      if (!previous.choices?.includes(norm(options.choice))) throw Error("INVALID_CHOICE");
      const previousTurns = Array.isArray(prev.prompt.context?.recentTurns) ? prev.prompt.context.recentTurns : [];
      const turn = Number(prev.turn || 0) + 1;
      if (turn > 2) throw Error("MAX_REPLIES");
      const snapshot = options.mirror;
      if (prev.bookId) {
        if (!snapshot || !snapshot.books.some((b) => b.id === prev.bookId && b.status === "read"))
          throw Error("READ_REVOKED");
        if (prev.reflectionId && !snapshot.reflections.some((r) => r.id === prev.reflectionId && r.bookId === prev.bookId && r.attribution === prev.attribution)) throw Error("REFLECTION_REVOKED");
      }
      const review = prev.prompt.context?.readerReflection || null;
      const context = prev.prompt.context || {};
      prompt = promptFor({
        characterId: id,
        characterProfile: profile,
        mode: "reply",
        chosenLabel: norm(options.choice),
        history: [
          ...previousTurns,
          { npc: previous.text },
          { playerChoice: norm(options.choice) }
        ].slice(-4),
        closing: turn >= 2,
        sourceKind: context.sourceKind || "ambient",
        topic: context.topic || null,
        reviewSpotlight: review,
        dailyContext: context.today || null,
        situation: context.situation || null,
        recentLines: [...context.avoidRecentLines || [], previous.text].slice(-3)
      });
      meta = {
        mode,
        bookId: prev.bookId || "",
        reflectionId: prev.reflectionId || "",
        attribution: prev.attribution || "",
        syncAt: snapshot?.snapshotAt || "",
        sourceKind: context.sourceKind || "ambient",
        turn
      };
    } else {
      const snapshot = options.mirror;
      if (!snapshot || !Array.isArray(snapshot.books)) throw Error("MIRROR_REQUIRED");
      const books = snapshot.books, catalog = options.catalog || [], cues = options.cues || [];
      const now = options.now || Date.now(), targetId = norm(options.bookId);
      if (targetId && !books.some((b) => b.id === targetId && b.status === "read"))
        throw Error("BOOK_NOT_READ");
      const daily = createForestDailyContextSession({ now: () => now });
      const situation = { firstEncounter: false, visitNumber: 2, focus: "forest" };
      let sourceKind = "ambient", review = null, topic = null, dailyContext = null;
      if (mode === "mirror-reflection") {
        const available = targetId ? snapshot.reflections.filter((r) => r.bookId === targetId) : snapshot.reflections;
        review = chooseForestReflectionSpotlight({
          characterId: id,
          books,
          reflections: available,
          catalog,
          cues,
          state: { visits: 2, lastReactionVisit: 0, reactors: [], acknowledged: [], books: [] },
          now
        });
        if (!review) throw Error("NO_ELIGIBLE_REFLECTION");
        sourceKind = "review-reaction";
        meta.bookId = review.sourceBookId;
        const reflectionKey = (book, id2) => {
          let n = 2166136261;
          for (const ch of book + ":" + id2) n = Math.imul(n ^ ch.codePointAt(0), 16777619);
          return (n >>> 0).toString(36);
        };
        meta.reflectionId = snapshot.reflections.find((r) => r.bookId === review.sourceBookId && reflectionKey(r.bookId, r.id) === review.key)?.id || "";
        meta.attribution = review.attribution;
        if (!meta.reflectionId) throw Error("REFLECTION_IDENTITY");
      } else if (mode === "mirror-story") {
        const memories = unlockedStoryMemories(books, catalog).filter((m) => forestMemoryBelongsToCharacter(m, id) && (!targetId || m.bookId === targetId));
        if (!memories.length) throw Error("NO_VERIFIED_STORY");
        const memory = memories[0], book = books.find((b) => b.id === memory.bookId);
        sourceKind = "story";
        topic = { fact: memory.text.slice(0, 240), bookTitle: (book?.title || "").slice(0, 80) };
        meta.bookId = memory.bookId;
        dailyContext = daily.visit(id, { books, catalog, cues, sourceKind: "story", sourceMemoryId: memory.id });
        situation.focus = "story";
      } else {
        dailyContext = daily.visit(id, { books, catalog, cues, sourceKind: "ambient" });
        situation.focus = "forest";
      }
      prompt = promptFor({
        characterId: id,
        characterProfile: profile,
        mode: "opening",
        sourceKind,
        topic,
        reviewSpotlight: review,
        dailyContext: review ? null : dailyContext,
        situation
      });
      meta = { ...meta, mode, syncAt: snapshot.snapshotAt, sourceKind };
    }
    for (const claim of profile.claims) if (!prompt.npc.voice.includes(claim.text))
      throw Error("PROFILE_LOSS");
    return { profile, prompt, input: forestGenerationInput(prompt), meta };
  }
  function readMirror(spreadsheet, props) {
    const setting = spreadsheet.getSheetByName("Gemma\u691C\u8A3C\u8A2D\u5B9A");
    const spreadsheetId = norm(props.getProperty("YONDENE_TEST_SHELF_MIRROR_ID") || setting?.getRange(22, 2).getDisplayValue());
    if (!/^[A-Za-z0-9_-]{20,120}$/u.test(spreadsheetId)) throw Error("MIRROR_NOT_CONFIGURED");
    let source;
    try {
      source = SpreadsheetApp.openById(spreadsheetId);
    } catch {
      throw Error("MIRROR_NO_ACCESS");
    }
    if (!source || source.getId() === spreadsheet.getId()) throw Error("MIRROR_WRONG_SHEET");
    const status = source.getSheetByName("\u540C\u671F\u72B6\u614B"), docs = source.getSheetByName("Firestore\u539F\u672C");
    if (!status || !docs) throw Error("MIRROR_TABS");
    const labels = status.getRange(1, 1, 12, 2).getDisplayValues();
    const last = labels.find((row) => row[0] === "\u524D\u56DE\u6210\u529F")?.[1];
    return parseForestBookshelfMirror(docs.getDataRange().getDisplayValues(), { syncAt: last });
  }
  function previewForestProfile(rows, raw) {
    let edit;
    try {
      edit = JSON.parse(raw);
    } catch {
      throw Error("INVALID_PROFILE_PREVIEW");
    }
    if (!edit || typeof edit.npc !== "string" || typeof edit.version !== "string" || !edit.fields || Array.isArray(edit.fields) || typeof edit.fields !== "object")
      throw Error("INVALID_PROFILE_PREVIEW");
    const columns = ["NPC ID", "\u9805\u76EE", "\u5185\u5BB9", "\u8A2D\u5B9A\u7248"].map((name) => rows[0].indexOf(name));
    if (columns.some((index) => index < 0)) throw Error("INVALID_PROFILE_PREVIEW");
    const [npc, field, text, version] = columns;
    const applied = /* @__PURE__ */ new Set();
    const patched = rows.map((row, index) => {
      if (index === 0 || row[npc] !== edit.npc) return row;
      const next = [...row];
      next[version] = edit.version;
      if (Object.prototype.hasOwnProperty.call(edit.fields, row[field])) {
        next[text] = edit.fields[row[field]];
        if (typeof next[text] !== "string" || !next[text].trim()) throw Error("INVALID_PROFILE_PREVIEW");
        applied.add(row[field]);
      }
      return next;
    });
    if (!applied.size || applied.size !== Object.keys(edit.fields).length)
      throw Error("INVALID_PROFILE_PREVIEW");
    return patched;
  }
  function getPrevious(rows, id) {
    const list = rows.filter((row2) => row2[0] === id);
    if (list.length !== 1 || list[0][17] !== "PASS") throw Error("PREVIOUS_RESULT_MISSING");
    const row = list[0], raw = row[5];
    let input, prompt;
    try {
      input = JSON.parse(row[15]);
      prompt = JSON.parse(input.messages[1].content);
    } catch {
      throw Error("PREVIOUS_INPUT_INVALID");
    }
    if (!prompt || !raw) throw Error("PREVIOUS_INPUT_INVALID");
    return {
      characterId: row[1],
      prompt,
      raw,
      bookId: row[20] || "",
      attribution: row[21] || "",
      reflectionId: row[27] || "",
      turn: Number(row[26]) || 0
    };
  }
  function compactProbeStorage(storage) {
    const result = { ...storage }, key = "scenario:live:log";
    const entries = JSON.parse(result[key] || "[]"), counts = {};
    result[key] = JSON.stringify(entries.slice().reverse().filter((e) => {
      if (!["generated-opening", "generated-reply"].includes(e.event) || typeof e.text !== "string") return false;
      counts[e.characterId] = (counts[e.characterId] || 0) + 1;
      return counts[e.characterId] <= 3;
    }).reverse().filter((e) => typeof e.text === "string").map(({ event, characterId, text }) => ({ event, characterId, text })));
    return result;
  }
  async function probeConversation(personRows, sourceRows, characterId, {
    snapshot = { books: [], reflections: [] },
    catalog = [],
    cues = [],
    twinNames = [],
    twinScenes = [],
    storage,
    choices = [0, 0],
    transport,
    now = () => Date.now()
  } = {}) {
    const profiles = parseForestCharacterProfiles(personRows, parseForestProfileSources(sourceRows));
    if (!profiles.some((p) => p.id === characterId)) throw Error("MISSING_PROFILE");
    return runForestConversationScenario({
      visits: [{ characterId, choices }],
      transport,
      allowUnavailableChoice: true,
      now,
      storage: scenarioStorage(storage || {}),
      getBooks: () => snapshot.books,
      getCatalog: () => catalog,
      getCues: () => cues,
      getCharacterProfiles: () => profiles,
      getTwinNames: () => twinNames,
      getTwinScenes: () => twinScenes,
      getRecentReflections: async () => snapshot.reflections || [],
      getArchivedReflections: async (bookIds, before) => bookIds.flatMap((bookId) => (snapshot.archiveReflections || []).filter((row) => row.bookId === bookId && row.createdAt < before).sort((a, b) => b.createdAt - a.createdAt).slice(0, 3)),
      getCurrentReflection: async (bookId, id) => [...snapshot.reflections || [], ...snapshot.archiveReflections || []].find((row) => row.bookId === bookId && row.id === id) || null,
      getReflections: async (bookId) => (snapshot.reflections || []).filter((r) => r.bookId === bookId),
      runtime: {
        createAbortController: () => ({ signal: { aborted: false }, abort() {
          this.signal.aborted = true;
        } }),
        scheduleTimeout: () => null,
        cancelTimeout: () => {
        }
      }
    });
  }
  async function processQueue({ maxCases = 3, oneIntegrated = true } = {}) {
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(1e3)) return;
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const q = ss.getSheetByName("Gemma\u691C\u8A3C\u30AD\u30E5\u30FC"), out = ss.getSheetByName("Gemma\u691C\u8A3C\u7D50\u679C");
      const person = ss.getSheetByName("\u4EBA\u7269\u8A2D\u5B9A"), source = ss.getSheetByName("\u6839\u62E0\u8CC7\u6599");
      if (!q || !out || !person || !source) throw Error("MISSING_TEST_SHEETS");
      const props = PropertiesService.getScriptProperties();
      const token = props.getProperty("CLOUDFLARE_AI_TEST_TOKEN");
      const account = props.getProperty("CLOUDFLARE_AI_TEST_ACCOUNT_ID");
      if (!token || !account || !/^[a-f0-9]{32}$/iu.test(account.trim()))
        throw Error("MISSING_TEST_PROPERTIES");
      const rows = q.getDataRange().getDisplayValues().slice(1), counts = {};
      for (const row of rows) counts[row[0]] = (counts[row[0]] || 0) + 1;
      const results = out.getDataRange().getDisplayValues().slice(1), existing = new Set(results.map((r) => r[0]));
      const today = Utilities.formatDate(/* @__PURE__ */ new Date(), "UTC", "yyyy-MM-dd");
      const key = "YONDENE_GEMMA_TEST_ATTEMPTS_UTC_" + today;
      let attempts = Number(props.getProperty(key) || 0), done = 0, mirror = null;
      if (!Number.isFinite(attempts) || attempts < 0) throw Error("INVALID_LOCAL_USAGE_COUNTER");
      const catalogSheet = ss.getSheetByName("\u7269\u8A9E\u8A18\u61B6");
      const cuesSheet = ss.getSheetByName("\u4F1A\u8A71\u53F0\u672C");
      const catalog = parseStoryMemoryRows(catalogSheet?.getDataRange().getDisplayValues() || []);
      const cues = parseForestDialogueRows(cuesSheet?.getDataRange().getDisplayValues() || []);
      const originalPeople = person.getDataRange().getDisplayValues(), originalSources = source.getDataRange().getDisplayValues();
      for (let i = 0; i < rows.length && done < maxCases; i++) {
        const [id, npc, scene, utterance, state, , , , modeCell, bookId, previousId, choice, caseId, issue] = rows[i];
        if (state !== "PENDING") continue;
        const mode = norm(modeCell) || "synthetic";
        const mark = (status, code) => {
          q.getRange(i + 2, 5).setValue(status);
          q.getRange(i + 2, 7, 1, 2).setValues([[/* @__PURE__ */ new Date(), code]]);
        };
        if (counts[id] !== 1 || !idPattern.test(id) || !scene || scene.length > 500 || utterance.length > 300 || !MODES.has(mode) || !idPattern.test(npc) && !/^[a-z_-]{2,32}$/u.test(npc) || mode === "continuation" && (!idPattern.test(previousId) || !choice)) {
          mark("ERROR", "INVALID_INPUT");
          continue;
        }
        if (existing.has(id)) {
          mark("APPLIED", "ALREADY_RECORDED");
          continue;
        }
        const integrated = mode.startsWith("integrated-");
        const caseKey = norm(caseId);
        const usePreview = integrated && caseKey.startsWith("profile-preview:");
        const scenario = usePreview ? caseKey.slice("profile-preview:".length) : caseKey;
        const replayOpening = integrated && scenario === "replay-opening";
        const fixtureReflection = mode === "integrated-mirror" && scenario === "fictional-reflection";
        if (fixtureReflection && (!bookId || !utterance)) {
          mark("ERROR", "INVALID_INPUT");
          continue;
        }
        let selectedChoices;
        if (integrated) {
          try {
            selectedChoices = choice ? JSON.parse(choice) : [0, 0];
          } catch {
          }
          if (!Array.isArray(selectedChoices) || selectedChoices.length > 2 || selectedChoices.some((c) => c !== "relay" && c !== 0 && c !== 1) || replayOpening && (!previousId || selectedChoices.length !== 2)) {
            mark("ERROR", "INVALID_CHOICE");
            continue;
          }
          if (oneIntegrated && done !== 0) break;
        }
        mark("RUNNING", "");
        SpreadsheetApp.flush();
        done++;
        let prepared;
        try {
          if (!["synthetic", "integrated-synthetic"].includes(mode) && !mirror) mirror = readMirror(ss, props);
          if (integrated) {
            let prior = null, replay = null;
            if (previousId) {
              const matches = results.filter((row) => row[0] === previousId && ["PASS", "FAIL"].includes(row[17]) && row[18] === mode);
              if (matches.length !== 1) throw Error("PREVIOUS_RESULT_MISSING");
              try {
                const previous2 = JSON.parse(matches[0][15]).conversation;
                if (replayOpening) {
                  const first = previous2.trace[0];
                  const prompt = JSON.parse(first.input.messages[1].content);
                  if (first.validation !== "accepted" || prompt.mode !== "opening" || prompt.npc.id !== npc || !first.raw)
                    throw Error("PREVIOUS_INPUT_INVALID");
                  replay = { prompt, raw: first.raw };
                } else {
                  prior = previous2.storage;
                  if (!prior) throw Error("PREVIOUS_INPUT_INVALID");
                }
              } catch {
                throw Error("PREVIOUS_INPUT_INVALID");
              }
            }
            let snapshot = mode === "integrated-mirror" ? mirror : { books: [], reflections: [] };
            if (bookId) {
              const books = snapshot.books.filter((book) => book.id === bookId && book.status === "read");
              if (!books.length) throw Error("BOOK_NOT_READ");
              snapshot = { ...snapshot, books };
            }
            if (fixtureReflection) {
              snapshot = { ...snapshot, reflections: [{
                id: "fixture-" + id,
                bookId,
                quote: utterance,
                attribution: "verbatim",
                createdAt: Date.now()
              }], archiveReflections: [] };
            }
            const people = usePreview ? previewForestProfile(
              originalPeople,
              ss.getSheetByName("Gemma\u691C\u8A3C\u8A2D\u5B9A")?.getRange(27, 2).getDisplayValue()
            ) : originalPeople;
            const conversation = await probeConversation(people, originalSources, npc, {
              snapshot,
              catalog,
              cues,
              storage: prior,
              choices: selectedChoices,
              ...npc === "twins" ? {
                twinNames: parseTwinNameRows(ss.getSheetByName("\u3075\u305F\u3054\u540D\u524D")?.getDataRange().getDisplayValues() || []),
                twinScenes: parseTwinSceneRows(ss.getSheetByName("\u3075\u305F\u3054\u4F1A\u8A71")?.getDataRange().getDisplayValues() || [])
              } : {},
              transport: async (input, { prompt }) => {
                if (replay && prompt.mode === "opening") {
                  if (prompt.npc.profileRevision !== replay.prompt.npc.profileRevision || JSON.stringify(prompt.context.speakers) !== JSON.stringify(replay.prompt.context.speakers))
                    throw Error("Previous opening no longer matches this visit");
                  return replay.raw;
                }
                props.setProperty(key, String(++attempts));
                const started = Date.now();
                let response;
                try {
                  response = UrlFetchApp.fetch("https://api.cloudflare.com/client/v4/accounts/" + account.trim() + "/ai/run/" + MODEL, {
                    method: "post",
                    contentType: "application/json",
                    headers: { Authorization: "Bearer " + token.trim() },
                    payload: JSON.stringify({ ...input, stream: false }),
                    muteHttpExceptions: true,
                    followRedirects: false
                  });
                } catch {
                  throw Error("Model network error");
                }
                if (Date.now() - started > 11e3) throw Error("timeout");
                const status = response.getResponseCode();
                if (status < 200 || status >= 300) throw Error("Model HTTP " + status);
                let envelope;
                try {
                  envelope = JSON.parse(response.getContentText());
                } catch {
                  throw Error("Model response JSON");
                }
                if (envelope?.success === false) throw Error("Model provider error");
                return envelope.result;
              }
            });
            if (oneIntegrated) done = maxCases;
            const valid2 = conversation.trace.length > 0 && conversation.trace.every((t) => t.validation === "accepted") && conversation.frames.at(-1)?.result?.conversationComplete === true && !conversation.selectionErrors.some((error) => error.selection === "relay") && (!fixtureReflection || conversation.summary.turns[0]?.sourceKind === "review-reaction");
            const compact = {
              ...conversation,
              ...replay ? { replayedOpeningId: previousId } : {},
              storage: compactProbeStorage(conversation.storage),
              trace: conversation.trace.map(({ prompt, ...rest }) => rest)
            };
            const saved = JSON.stringify({ conversation: compact });
            if (saved.length > 48e3) throw Error("TRACE_TOO_LARGE");
            const savedRow = [
              safeText(id),
              npc,
              npc,
              safeText(scene),
              safeText(utterance),
              safeText(JSON.stringify(conversation.frames.map((f) => f.result))),
              MODEL,
              conversation.trace[0]?.prompt.npc.profileVersion || "",
              "",
              conversation.summary.promptVersion,
              /* @__PURE__ */ new Date(),
              "",
              "",
              "",
              "\u54C1\u8CEA\u8A55\u4FA1\u672A\u5B9F\u65BD",
              safeText(saved),
              /* @__PURE__ */ new Date(),
              valid2 ? "PASS" : "FAIL",
              mode,
              mirror?.snapshotAt ? new Date(mirror.snapshotAt) : "",
              safeText(bookId || ""),
              "",
              fixtureReflection ? "MIRROR_WITH_FICTIONAL_REFLECTION" : mode === "integrated-synthetic" ? "SYNTHETIC" : "READ_ONLY_MIRROR",
              safeText(previousId || ""),
              safeText(caseId || ""),
              safeText(issue || ""),
              conversation.trace.filter((t) => t.prompt.mode === "reply").length,
              ""
            ];
            out.appendRow(savedRow);
            results.push(savedRow);
            existing.add(id);
            mark(valid2 ? "APPLIED" : "ERROR", valid2 ? "" : conversation.trace.find((t) => t.failure)?.failure || "CONVERSATION_INCOMPLETE");
            continue;
          }
          const previous = mode === "continuation" ? getPrevious(results, previousId) : null;
          prepared = probeInput(originalPeople, originalSources, npc, scene, utterance, {
            mode,
            mirror: mode === "synthetic" ? null : mirror,
            catalog,
            cues,
            bookId,
            previous,
            previousId,
            choice,
            now: Date.now()
          });
        } catch (error) {
          const code = String(error?.message || "");
          mark("ERROR", /^(?:MIRROR_[A-Z_]+|BOOK_NOT_READ|READ_REVOKED|REFLECTION_REVOKED|NO_ELIGIBLE_REFLECTION|NO_VERIFIED_STORY|INVALID_CHOICE|INVALID_PROFILE_PREVIEW|PREVIOUS_[A-Z_]+|REFLECTION_IDENTITY|INVALID_CONTINUATION|MAX_REPLIES|TRACE_TOO_LARGE)$/u.test(code) ? code : "PROFILE_CONTRACT");
          continue;
        }
        props.setProperty(key, String(++attempts));
        let result;
        try {
          const response = UrlFetchApp.fetch("https://api.cloudflare.com/client/v4/accounts/" + account.trim() + "/ai/run/" + MODEL, {
            method: "post",
            contentType: "application/json",
            headers: { Authorization: "Bearer " + token.trim() },
            payload: JSON.stringify({ ...prepared.input, stream: false }),
            muteHttpExceptions: true,
            followRedirects: false
          });
          const status = response.getResponseCode();
          if (status < 200 || status >= 300) {
            mark("ERROR", "HTTP_" + status);
            continue;
          }
          const envelope = JSON.parse(response.getContentText());
          if (envelope.success === false) {
            mark("ERROR", "PROVIDER_ERROR");
            continue;
          }
          result = envelope.result;
        } catch {
          mark("ERROR", "NETWORK_OR_RESPONSE");
          continue;
        }
        const raw = result?.response ?? result?.choices?.[0]?.message?.content;
        let valid = false;
        try {
          readCompletion(result, {
            mode: prepared.prompt.mode,
            characterId: npc,
            closing: prepared.prompt.closing === true,
            context: prepared.prompt.context
          });
          valid = true;
        } catch {
        }
        out.getRange(1, 16, 1, 13).setValues([[
          "\u751F\u6210\u5165\u529BJSON",
          "\u4EBA\u7269\u8A2D\u5B9A\u53D6\u5F97\u6642\u523B",
          "\u51FA\u529B\u5F62\u5F0F\u691C\u8A3C",
          "\u6587\u8108\u30E2\u30FC\u30C9",
          "\u672C\u68DA\u540C\u671F\u65E5\u6642",
          "\u5BFE\u8C61\u66F8\u7C4DID",
          "\u611F\u60F3\u5E30\u5C5E",
          "\u6587\u8108\u78BA\u8A8D",
          "\u5148\u884CrequestId",
          "\u30B1\u30FC\u30B9ID",
          "\u95A2\u9023Issue",
          "\u8FD4\u7B54\u6BB5\u968E",
          "\u611F\u60F3ID"
        ]]);
        const meta = prepared.meta;
        out.appendRow([
          safeText(id),
          safeText(npc),
          safeText(npc),
          safeText(scene),
          safeText(utterance),
          safeText(typeof raw === "string" ? raw : JSON.stringify(raw ?? null)),
          MODEL,
          prepared.profile.version + " / " + prepared.profile.revision,
          prepared.profile.review,
          FOREST_PROMPT_VERSION,
          /* @__PURE__ */ new Date(),
          "",
          "",
          "",
          "\u54C1\u8CEA\u8A55\u4FA1\u672A\u5B9F\u65BD",
          safeText(JSON.stringify(prepared.input)),
          /* @__PURE__ */ new Date(),
          valid ? "PASS" : "FAIL",
          mode,
          meta.syncAt ? new Date(meta.syncAt) : "",
          safeText(meta.bookId || ""),
          meta.attribution || "",
          mode === "synthetic" ? "SYNTHETIC" : SOURCE_PROVEN,
          safeText(previousId || ""),
          safeText(caseId || ""),
          safeText(issue || ""),
          meta.turn || 0,
          safeText(meta.reflectionId || "")
        ]);
        existing.add(id);
        mark(valid ? "APPLIED" : "ERROR", valid ? "" : "OUTPUT_VALIDATION");
      }
    } finally {
      lock.releaseLock();
    }
  }
  return __toCommonJS(ForestPersonaProbe_exports);
})();

function yondeneGemmaTestProcessQueue(){return ForestPersonaProbe.processQueue();}
function yondeneGemmaTestRunPendingNow(){return ForestPersonaProbe.processQueue({maxCases:5,oneIntegrated:false});}
