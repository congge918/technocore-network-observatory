const COLORS = {
  base: "#0A1128",
  ice: "#F5F7FA",
  accent: "#00B4D8",
  blue: "#0466C8",
  green: "#32D74B",
  grey: "#5C6670",
  line: "#29334D",
  panel: "#101933"
};

const STAGE_DURATION = 45_000;
const formatter = new Intl.NumberFormat("en-US");
const compactFormatter = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const stage = document.querySelector("#agent-stage");
const stageContext = stage.getContext("2d");
const timeline = document.querySelector("#timeline");
const timelineContext = timeline.getContext("2d");
const scrubber = document.querySelector("#scrubber");
const playPause = document.querySelector("#play-pause");
const restart = document.querySelector("#restart");
const quoteToggle = document.querySelector("#toggle-quotes");
const didSearch = document.querySelector("#did-search");
const currentEventPanel = document.querySelector("#current-event");

let snapshot;
let events = [];
let roomNames = [];
let roomZones = new Map();
let agents = new Map();
let progress = 0;
let appliedIndex = -1;
let playing = false;
let playbackSpeed = 1;
let quotesVisible = true;
let focusedAgentId = null;
let lastFrame = performance.now();
let lastInspectorIndex = -1;

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed, salt = 0) {
  let value = (seed + salt * 0x9e3779b9) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return (value >>> 0) / 4294967295;
}

function shortDid(value) {
  if (!value) return "UNKNOWN";
  if (!value.startsWith("did:key:")) return `~${value}`;
  return `${value.slice(8, 16)}…${value.slice(-6)}`;
}

function formatUtc(value, includeDate = true) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "UNKNOWN TIME";
  const options = {
    timeZone: "UTC",
    hour12: false,
    month: includeDate ? "short" : undefined,
    day: includeDate ? "2-digit" : undefined,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  };
  return `${new Intl.DateTimeFormat("en-GB", options).format(date)} UTC`;
}

function stateRank(event) {
  if (event.signal === "contribution") return 3;
  if (event.hasReference) return 2;
  if (event.signed) return 1;
  return 0;
}

function stateName(rank) {
  return ["UNSIGNED", "SIGNED DID", "PUBLIC REFERENCE", "CONTRIBUTION SIGNAL"][rank] || "OBSERVED";
}

function stateColor(rank) {
  return [COLORS.grey, COLORS.accent, COLORS.blue, COLORS.green][rank] || COLORS.grey;
}

function signalLabel(signal) {
  return {
    communication: "COMMUNICATION",
    commerce: "COMMERCE-SHAPED TEXT",
    memory: "MEMORY-SHAPED TEXT",
    contribution: "CONTRIBUTION SIGNAL"
  }[signal] || "UNCLASSIFIED";
}

function resizeCanvas(canvas, context) {
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * ratio));
  const height = Math.max(1, Math.round(rect.height * ratio));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  return { width: rect.width, height: rect.height, ratio };
}

function buildRoomZones(width, height) {
  const layout = [
    [0.18, 0.24],
    [0.5, 0.2],
    [0.81, 0.27],
    [0.22, 0.7],
    [0.55, 0.72],
    [0.83, 0.66]
  ];
  roomZones = new Map(
    roomNames.map((room, index) => {
      const point = layout[index % layout.length];
      return [room, { x: point[0] * width, y: point[1] * height, index }];
    })
  );
}

function roomPoint(room, sender) {
  const zone = roomZones.get(room) || { x: stage.clientWidth / 2, y: stage.clientHeight / 2, index: 0 };
  const seed = hashString(`${room}|${sender}`);
  const radiusX = Math.min(stage.clientWidth * 0.095, 120);
  const radiusY = Math.min(stage.clientHeight * 0.12, 74);
  return {
    x: zone.x + (seededUnit(seed, 1) - 0.5) * radiusX * 2,
    y: zone.y + (seededUnit(seed, 2) - 0.5) * radiusY * 2
  };
}

function entrancePoint(sender) {
  const seed = hashString(sender);
  const side = seed % 4;
  const unit = seededUnit(seed, 9);
  if (side === 0) return { x: 12, y: 60 + unit * Math.max(80, stage.clientHeight - 120) };
  if (side === 1) return { x: stage.clientWidth - 12, y: 60 + unit * Math.max(80, stage.clientHeight - 120) };
  if (side === 2) return { x: 60 + unit * Math.max(80, stage.clientWidth - 120), y: 12 };
  return { x: 60 + unit * Math.max(80, stage.clientWidth - 120), y: stage.clientHeight - 12 };
}

function applyEvent(event, eventIndex, instant = false) {
  const rank = stateRank(event);
  let agent = agents.get(event.from);
  if (!agent) {
    const start = entrancePoint(event.from);
    agent = {
      id: event.from,
      x: start.x,
      y: start.y,
      targetX: start.x,
      targetY: start.y,
      room: null,
      previousRoom: null,
      rank: 0,
      count: 0,
      signedCount: 0,
      referenceCount: 0,
      contributionCount: 0,
      lastEventIndex: -1,
      lastEvent: null,
      seed: hashString(event.from)
    };
    agents.set(event.from, agent);
  }

  const destination = roomPoint(event.room, event.from);
  agent.previousRoom = agent.room;
  agent.room = event.room;
  agent.targetX = destination.x;
  agent.targetY = destination.y;
  agent.rank = Math.max(agent.rank, rank);
  agent.count += 1;
  agent.signedCount += event.signed ? 1 : 0;
  agent.referenceCount += event.hasReference ? 1 : 0;
  agent.contributionCount += event.signal === "contribution" ? 1 : 0;
  agent.lastEventIndex = eventIndex;
  agent.lastEvent = event;

  if (instant || prefersReducedMotion) {
    agent.x = agent.targetX;
    agent.y = agent.targetY;
  }
}

function resetAgents(targetIndex = -1) {
  agents = new Map();
  appliedIndex = -1;
  lastInspectorIndex = -1;
  for (let index = 0; index <= targetIndex; index += 1) {
    applyEvent(events[index], index, true);
    appliedIndex = index;
  }
  updateInspector(Math.max(0, targetIndex));
  updateFocusPanel();
}

function setProgress(nextProgress, instant = false) {
  progress = Math.max(0, Math.min(1, nextProgress));
  scrubber.value = String(Math.round(progress * 1000));
  const targetIndex = Math.max(0, Math.min(events.length - 1, Math.floor(progress * (events.length - 1))));

  if (targetIndex < appliedIndex || instant) {
    resetAgents(targetIndex);
  } else {
    for (let index = appliedIndex + 1; index <= targetIndex; index += 1) {
      applyEvent(events[index], index, false);
      appliedIndex = index;
    }
  }

  if (targetIndex !== lastInspectorIndex) updateInspector(targetIndex);
}

function updateInspector(index) {
  if (!events.length) return;
  const event = events[Math.max(0, Math.min(events.length - 1, index))];
  lastInspectorIndex = index;
  document.querySelector("#event-clock").textContent = formatUtc(event.ts);

  currentEventPanel.replaceChildren();
  const room = document.createElement("span");
  room.className = "event-room";
  room.textContent = `/r/${event.room} · SEQ ${formatter.format(event.seq)}`;
  const sender = document.createElement("span");
  sender.className = "event-sender";
  sender.textContent = `${shortDid(event.from)} · ${stateName(stateRank(event))}`;
  const message = document.createElement("p");
  message.className = "event-message";
  message.textContent = event.text;
  const foot = document.createElement("div");
  foot.className = "event-foot";
  [formatUtc(event.ts), signalLabel(event.signal), event.signed ? "SIGNED LANE" : "SELF-ASSERTED", `EVENT ${index + 1}/${events.length}`]
    .forEach((value) => {
      const item = document.createElement("span");
      item.textContent = value;
      foot.append(item);
    });
  currentEventPanel.append(room, sender, message, foot);
}

function updateFocusPanel() {
  const did = document.querySelector("#focused-did");
  const summary = document.querySelector("#focused-summary");
  const agent = focusedAgentId ? agents.get(focusedAgentId) : null;
  if (!agent) {
    did.textContent = "NONE";
    summary.textContent = "Click a glyph or search a DID.";
    return;
  }
  did.textContent = agent.id;
  summary.textContent = `${agent.count} sampled records · ${agent.signedCount} signed · ${agent.referenceCount} references · last seen /r/${agent.room}`;
}

function drawGrid(context, width, height) {
  context.save();
  context.strokeStyle = COLORS.line;
  context.lineWidth = 0.6;
  for (let x = 0; x < width; x += 42) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  for (let y = 0; y < height; y += 42) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  context.restore();
}

function drawCutCornerBox(context, x, y, width, height) {
  const cut = 12;
  context.beginPath();
  context.moveTo(x + cut, y);
  context.lineTo(x + width, y);
  context.lineTo(x + width, y + height - cut);
  context.lineTo(x + width - cut, y + height);
  context.lineTo(x, y + height);
  context.lineTo(x, y + cut);
  context.closePath();
}

function drawRooms(context, width, height) {
  buildRoomZones(width, height);
  context.save();
  context.font = '700 9px "Space Mono", monospace';
  context.textAlign = "center";
  roomNames.forEach((room) => {
    const zone = roomZones.get(room);
    const boxWidth = Math.min(190, Math.max(116, width * 0.17));
    const boxHeight = Math.min(120, Math.max(86, height * 0.15));
    drawCutCornerBox(context, zone.x - boxWidth / 2, zone.y - boxHeight / 2, boxWidth, boxHeight);
    context.fillStyle = COLORS.base;
    context.fill();
    context.strokeStyle = room === "technocore" ? COLORS.accent : COLORS.line;
    context.lineWidth = room === "technocore" ? 1.4 : 1;
    context.stroke();
    context.fillStyle = room === "technocore" ? COLORS.accent : COLORS.ice;
    context.fillText(`/R/${room.toUpperCase()}`, zone.x, zone.y - boxHeight / 2 + 18);
  });
  context.restore();
}

function drawHandoffRail(context, agent, width, height) {
  if (!agent.previousRoom || agent.previousRoom === agent.room || agent.lastEventIndex !== appliedIndex) return;
  const start = roomZones.get(agent.previousRoom);
  const end = roomZones.get(agent.room);
  if (!start || !end) return;
  const midX = (start.x + end.x) / 2;
  const direction = end.y >= start.y ? 1 : -1;
  const gap = 9;
  context.save();
  context.strokeStyle = stateColor(agent.rank);
  context.lineWidth = 1.3;
  context.globalAlpha = 0.8;
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(midX - gap, start.y);
  context.lineTo(midX - gap + direction * 12, start.y + direction * 12);
  context.stroke();
  context.beginPath();
  context.moveTo(midX + gap - direction * 12, end.y - direction * 12);
  context.lineTo(midX + gap, end.y);
  context.lineTo(end.x, end.y);
  context.stroke();
  context.restore();
}

function drawAgent(context, agent, delta) {
  const ease = prefersReducedMotion ? 1 : Math.min(1, delta * 0.0055);
  agent.x += (agent.targetX - agent.x) * ease;
  agent.y += (agent.targetY - agent.y) * ease;
  const selected = agent.id === focusedAgentId;
  const recent = appliedIndex - agent.lastEventIndex < 6;
  const scale = selected ? 1.6 : recent ? 1.15 : 1;
  const color = stateColor(agent.rank);

  context.save();
  context.translate(agent.x, agent.y);
  context.scale(scale, scale);
  context.fillStyle = color;
  context.fillRect(-3, -7, 6, 5);
  context.fillRect(-5, -1, 10, 6);
  context.fillRect(-5, 5, 3, 4);
  context.fillRect(2, 5, 3, 4);
  context.fillStyle = COLORS.base;
  context.fillRect(-1, -5, 1, 1);
  context.fillRect(2, -5, 1, 1);

  if (agent.rank >= 2) {
    context.strokeStyle = COLORS.ice;
    context.lineWidth = 1;
    context.strokeRect(5, -2, 4, 5);
  }
  if (selected) {
    context.strokeStyle = COLORS.ice;
    context.lineWidth = 1;
    context.strokeRect(-8, -10, 16, 22);
  }
  context.restore();
}

function wrapText(context, text, maxWidth, maxLines) {
  const words = text.replace(/https?:\/\/\S+/g, "[public link]").split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines - 1) break;
    } else {
      line = next;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (words.join(" ").length > lines.join(" ").length) lines[lines.length - 1] = `${lines.at(-1).slice(0, -1)}…`;
  return lines;
}

function drawQuote(context, width, height) {
  if (!quotesVisible || appliedIndex < 0) return;
  const event = events[appliedIndex];
  const agent = agents.get(event.from);
  if (!agent) return;
  context.save();
  context.font = '700 9px "Space Mono", monospace';
  const boxWidth = Math.min(250, width * 0.34);
  const lines = wrapText(context, event.text, boxWidth - 22, 3);
  const boxHeight = 28 + lines.length * 14;
  let x = agent.x + 16;
  let y = agent.y - boxHeight - 16;
  if (x + boxWidth > width - 10) x = agent.x - boxWidth - 16;
  if (y < 10) y = agent.y + 18;
  x = Math.max(10, Math.min(width - boxWidth - 10, x));
  y = Math.max(10, Math.min(height - boxHeight - 10, y));
  drawCutCornerBox(context, x, y, boxWidth, boxHeight);
  context.fillStyle = COLORS.ice;
  context.fill();
  context.fillStyle = COLORS.base;
  lines.forEach((line, index) => context.fillText(line, x + 11, y + 22 + index * 14));
  context.restore();
}

function drawStage(delta) {
  const { width, height } = resizeCanvas(stage, stageContext);
  stageContext.clearRect(0, 0, width, height);
  stageContext.fillStyle = COLORS.base;
  stageContext.fillRect(0, 0, width, height);
  drawGrid(stageContext, width, height);
  drawRooms(stageContext, width, height);
  agents.forEach((agent) => drawHandoffRail(stageContext, agent, width, height));
  agents.forEach((agent) => drawAgent(stageContext, agent, delta));
  drawQuote(stageContext, width, height);
  document.querySelector("#stage-count").textContent = `${formatter.format(agents.size)} ACTIVE GLYPHS`;
}

function drawTimeline() {
  const { width, height } = resizeCanvas(timeline, timelineContext);
  timelineContext.clearRect(0, 0, width, height);
  timelineContext.fillStyle = COLORS.base;
  timelineContext.fillRect(0, 0, width, height);
  if (!events.length) return;

  const bins = Math.max(40, Math.min(180, Math.floor(width / 6)));
  const counts = Array.from({ length: bins }, () => [0, 0, 0, 0]);
  events.forEach((event, index) => {
    const bin = Math.min(bins - 1, Math.floor((index / events.length) * bins));
    counts[bin][stateRank(event)] += 1;
  });
  const maxTotal = Math.max(...counts.map((bin) => bin.reduce((sum, value) => sum + value, 0)), 1);
  const barWidth = width / bins;
  counts.forEach((bin, binIndex) => {
    let y = height - 14;
    bin.forEach((count, rank) => {
      if (!count) return;
      const barHeight = (count / maxTotal) * (height - 27);
      timelineContext.fillStyle = stateColor(rank);
      timelineContext.fillRect(binIndex * barWidth, y - barHeight, Math.max(1, barWidth - 1), barHeight);
      y -= barHeight;
    });
  });

  const playheadX = progress * width;
  timelineContext.fillStyle = COLORS.ice;
  timelineContext.fillRect(Math.max(0, playheadX - 1), 0, 2, height);
  timelineContext.fillStyle = COLORS.green;
  timelineContext.fillRect(Math.max(0, playheadX - 4), 0, 8, 8);
}

function findNearestAgent(x, y) {
  let nearest = null;
  let distance = 22;
  agents.forEach((agent) => {
    const nextDistance = Math.hypot(agent.x - x, agent.y - y);
    if (nextDistance < distance) {
      distance = nextDistance;
      nearest = agent;
    }
  });
  return nearest;
}

function focusAgent(id) {
  if (!id || !agents.has(id)) return false;
  focusedAgentId = id;
  updateFocusPanel();
  return true;
}

function populateMetrics() {
  const uniqueSenders = new Set(events.map((event) => event.from));
  const signedCount = events.filter((event) => event.signed).length;
  document.querySelector("#capture-time").textContent = `CAPTURED ${formatUtc(snapshot.meta.capturedAt)}`;
  document.querySelector("#metric-rooms").textContent = compactFormatter.format(snapshot.aggregate.publicRooms || snapshot.rooms.length);
  document.querySelector("#metric-room-capacity").textContent = snapshot.aggregate.roomCapacity
    ? `${formatter.format(snapshot.aggregate.publicRooms)} OF ${formatter.format(snapshot.aggregate.roomCapacity)} CAPACITY`
    : "CURRENT SERVICE TOTAL";
  document.querySelector("#metric-senders").textContent = formatter.format(uniqueSenders.size);
  document.querySelector("#metric-signed").textContent = `${Math.round((signedCount / Math.max(events.length, 1)) * 100)}%`;
  document.querySelector("#metric-notes").textContent = compactFormatter.format(snapshot.aggregate.publicNotes || 0);
  document.querySelector("#timeline-start").textContent = formatUtc(events[0].ts);
  document.querySelector("#timeline-end").textContent = formatUtc(events.at(-1).ts);
}

function handleSearch() {
  const query = didSearch.value.trim().toLowerCase();
  if (!query) return;
  const match = [...agents.keys()].find((id) => id.toLowerCase().includes(query));
  if (match) {
    focusAgent(match);
    didSearch.setCustomValidity("");
  } else {
    didSearch.setCustomValidity("No observed sender matches this DID.");
    didSearch.reportValidity();
  }
}

function frame(now) {
  const delta = Math.min(80, now - lastFrame);
  lastFrame = now;
  if (playing && events.length) {
    const next = progress + (delta * playbackSpeed) / STAGE_DURATION;
    if (next >= 1) {
      setProgress(1);
      playing = false;
      playPause.textContent = "PLAY AGAIN";
    } else {
      setProgress(next);
    }
  }
  drawStage(delta);
  drawTimeline();
  requestAnimationFrame(frame);
}

async function initialise() {
  const response = await fetch("data/snapshot.json", { cache: "no-store" });
  if (!response.ok) throw new Error(`Snapshot load failed: ${response.status}`);
  snapshot = await response.json();
  const anchors = (snapshot.anchors || []).map((event) => ({ ...event, anchor: true }));
  events = [...anchors, ...(snapshot.events || [])].sort(
    (a, b) => Date.parse(a.ts) - Date.parse(b.ts) || a.room.localeCompare(b.room) || a.seq - b.seq
  );
  if (!events.length) throw new Error("Snapshot contains no public events.");

  const priority = snapshot.meta.selectedRooms || [];
  roomNames = [...new Set([...priority, ...events.map((event) => event.room)])].slice(0, 6);
  populateMetrics();
  buildRoomZones(stage.clientWidth, stage.clientHeight);
  setProgress(0, true);
  drawStage(16);
  drawTimeline();
  playPause.textContent = prefersReducedMotion ? "PLAY REPLAY" : "PLAY REPLAY";
  requestAnimationFrame(frame);
}

playPause.addEventListener("click", () => {
  if (progress >= 1) setProgress(0, true);
  playing = !playing;
  playPause.textContent = playing ? "PAUSE" : "RESUME";
});

restart.addEventListener("click", () => {
  playing = false;
  setProgress(0, true);
  drawStage(16);
  drawTimeline();
  playPause.textContent = "PLAY REPLAY";
});

quoteToggle.addEventListener("click", () => {
  quotesVisible = !quotesVisible;
  quoteToggle.textContent = quotesVisible ? "QUOTES ON" : "QUOTES OFF";
  quoteToggle.setAttribute("aria-pressed", String(quotesVisible));
});

scrubber.addEventListener("input", () => {
  playing = false;
  setProgress(Number(scrubber.value) / 1000, true);
  drawStage(16);
  drawTimeline();
  playPause.textContent = "RESUME";
});

stage.addEventListener("click", (event) => {
  const rect = stage.getBoundingClientRect();
  const nearest = findNearestAgent(event.clientX - rect.left, event.clientY - rect.top);
  if (nearest) focusAgent(nearest.id);
});

didSearch.addEventListener("search", handleSearch);
didSearch.addEventListener("keydown", (event) => {
  if (event.key === "Enter") handleSearch();
});
didSearch.addEventListener("input", () => didSearch.setCustomValidity(""));

document.querySelectorAll("[data-speed]").forEach((button) => {
  button.addEventListener("click", () => {
    playbackSpeed = Number(button.dataset.speed);
    document.querySelectorAll("[data-speed]").forEach((item) => item.classList.toggle("active", item === button));
  });
});

window.addEventListener("resize", () => {
  buildRoomZones(stage.clientWidth, stage.clientHeight);
  agents.forEach((agent) => {
    const destination = roomPoint(agent.room, agent.id);
    agent.x = destination.x;
    agent.y = destination.y;
    agent.targetX = destination.x;
    agent.targetY = destination.y;
  });
});

initialise().catch((error) => {
  console.error(error);
  currentEventPanel.replaceChildren();
  const message = document.createElement("p");
  message.className = "empty-state";
  message.textContent = "Snapshot unavailable. Run `npm run snapshot`, then reload this page.";
  currentEventPanel.append(message);
});
