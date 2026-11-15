/* Factory Pulse — console renderer. Loads data/snapshot.json and draws the
   fleet readout, issue classes, priority faults, and the geographic schematic
   (nodes + reticles + annotation callouts with elbow leads). Pure vanilla. */

const SVGNS = "http://www.w3.org/2000/svg";
const $ = (s) => document.querySelector(s);
const el = (n, a = {}) => {
  const e = document.createElementNS(SVGNS, n);
  for (const k in a) e.setAttribute(k, a[k]);
  return e;
};
const esc = (s) => String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
const trunc = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

// ---- live clock ----
function tick() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, "0");
  $("#clock").textContent = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} LOCAL`;
}
setInterval(tick, 1000); tick();

// ---- main ----
fetch("data/snapshot.json").then((r) => r.json()).then(render).catch((e) => {
  $("#plot").innerHTML = `<div style="padding:20px;color:#e4493f;font:11px monospace">
    SNAPSHOT LOAD FAILED — ${esc(e.message)}</div>`;
});

function render(d) {
  // fleet readout
  const f = d.fleet;
  const stats = [
    ["SENSORS DEPLOYED", f.sensors, ""],
    ["REPORTING", f.reporting, `/ ${f.sensors}`],
    ["FLAGGED", f.flagged, `/ ${f.reporting}`],
    ["ISSUES LOGGED", f.issues_total.toLocaleString(), ""],
  ];
  $("#readout").innerHTML = stats.map(([k, v, u]) =>
    `<div class="stat"><div class="v">${v}<span class="u">${u}</span></div>
     <div class="k">${k}</div></div>`).join("");

  // issue classes
  const maxC = Math.max(...d.by_type.map((t) => t.n), 1);
  $("#classes").innerHTML = d.by_type.map((t) =>
    `<div class="cls"><span>${t.type.replace(/_/g, " ").toUpperCase()}</span>
     <span class="cn">${t.n.toLocaleString()}</span>
     <span class="cbar"><i style="width:${(t.n / maxC * 100).toFixed(1)}%"></i></span></div>`).join("");

  // priority faults
  $("#faults").innerHTML = d.attention.map((a) => {
    const tot = Math.max(a.issues, 1);
    const seg = (n, c) => n ? `<i class="${c}" style="width:${(n / tot * 100).toFixed(1)}%"></i>` : "";
    return `<div class="fault-row">
      <div class="fr-top"><span class="fr-id">NODE ${a.id}</span><span class="fr-n">${a.issues}</span></div>
      <div class="fr-name">${esc(trunc(a.desc, 30))}</div>
      <div class="fr-mix">${seg(a.outages, "o")}${seg(a.flat, "f")}${seg(a.off, "b")}</div>
    </div>`;
  }).join("");

  // hero counts
  const ok = d.sensors.filter((s) => s.status === "ok").length;
  const fault = d.sensors.filter((s) => s.status === "fault").length;
  const nd = d.sensors.filter((s) => s.status === "nodata").length;
  $("#n-nodes").textContent = d.sensors.length;
  $("#n-ok").textContent = ok; $("#n-fault").textContent = fault; $("#n-nd").textContent = nd;

  // worst outage
  if (d.worst_outage) {
    const w = d.worst_outage;
    $("#worst").innerHTML = `LONGEST OUTAGE<b>${w.hours} H</b>
      NODE ${w.id} · ${esc(trunc(w.desc, 26))}`;
  }
  $("#gen").textContent = "SNAPSHOT · " + d.generated.replace("T", " ").replace("+00:00", "Z");

  drawSchematic(d);
  window.addEventListener("resize", () => drawSchematic(d), { passive: true });
}

function drawSchematic(d) {
  const W = 1000, H = 640, padX = 78, padY = 64;
  const svg = $("#svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = "";

  const pts = d.sensors;
  const lons = pts.map((p) => p.lon), lats = pts.map((p) => p.lat);
  const lo0 = Math.min(...lons), lo1 = Math.max(...lons);
  const la0 = Math.min(...lats), la1 = Math.max(...lats);
  const X = (lon) => padX + (lon - lo0) / (lo1 - lo0) * (W - 2 * padX);
  const Y = (lat) => padY + (la1 - lat) / (la1 - la0) * (H - 2 * padY);

  // grid + axis ticks
  const g = el("g");
  for (let i = 0; i <= 8; i++) {
    const x = padX + i / 8 * (W - 2 * padX);
    g.appendChild(el("line", { x1: x, y1: padY, x2: x, y2: H - padY, class: "gridline" }));
    const lon = lo0 + i / 8 * (lo1 - lo0);
    const t = el("text", { x, y: H - padY + 16, class: "axislab", "text-anchor": "middle" });
    t.textContent = lon.toFixed(3) + "°E"; g.appendChild(t);
  }
  for (let i = 0; i <= 6; i++) {
    const y = padY + i / 6 * (H - 2 * padY);
    g.appendChild(el("line", { x1: padX, y1: y, x2: W - padX, y2: y, class: "gridline" }));
    const lat = la1 - i / 6 * (la1 - la0);
    const t = el("text", { x: padX - 10, y: y + 3, class: "axislab", "text-anchor": "end" });
    t.textContent = lat.toFixed(3) + "°"; g.appendChild(t);
  }
  svg.appendChild(g);

  // nodes
  const nodeG = el("g");
  for (const p of pts) {
    const r = p.status === "fault" ? 3 + Math.min(Math.sqrt(p.issues) * 0.7, 13) : 2.6;
    nodeG.appendChild(el("circle", { cx: X(p.lon), cy: Y(p.lat), r, class: "node " + p.status }));
  }
  svg.appendChild(nodeG);

  // annotation callouts for up to 4 top faults that have coordinates
  const byId = new Map(pts.map((p) => [p.id, p]));
  const picks = d.attention.filter((a) => byId.has(a.id)).slice(0, 4);
  const boxW = 156, boxH = 46;
  const slots = [
    { x: padX - 8, y: padY + 6, side: "right" },              // top-left
    { x: W - padX - boxW + 8, y: padY + 6, side: "left" },    // top-right
    { x: padX - 8, y: H - padY - boxH - 6, side: "right" },   // bottom-left
    { x: W - padX - boxW + 8, y: H - padY - boxH - 6, side: "left" }, // bottom-right
  ];
  const aG = el("g");
  picks.forEach((a, i) => {
    const p = byId.get(a.id), nx = X(p.lon), ny = Y(p.lat), s = slots[i];
    const edgeX = s.side === "left" ? s.x : s.x + boxW;      // box edge the lead hits
    const ty = s.y + boxH / 2;

    // elbow lead: node -> vertical to callout y -> horizontal to box edge
    aG.appendChild(el("path", { d: `M ${nx} ${ny} L ${nx} ${ty} L ${edgeX} ${ty}`, class: "lead" }));

    // reticle on the node
    aG.appendChild(el("circle", { cx: nx, cy: ny, r: 8, class: "reticle" }));
    aG.appendChild(el("line", { x1: nx - 12, y1: ny, x2: nx + 12, y2: ny, class: "reticle" }));
    aG.appendChild(el("line", { x1: nx, y1: ny - 12, x2: nx, y2: ny + 12, class: "reticle" }));

    // callout box
    aG.appendChild(el("rect", { x: s.x, y: s.y, width: boxW, height: boxH, class: "callout" }));
    const t1 = el("text", { x: s.x + 9, y: s.y + 16, class: "co-id" }); t1.textContent = `NODE ${a.id}`;
    const t2 = el("text", { x: s.x + 9, y: s.y + 29, class: "co-name" }); t2.textContent = trunc(a.desc, 22);
    const t3 = el("text", { x: s.x + 9, y: s.y + 40, class: "co-meta" });
    t3.textContent = `ISS ${a.issues} · OUT ${a.outages} · OFF ${a.off}`;
    aG.append(t1, t2, t3);
  });
  svg.appendChild(aG);
}
