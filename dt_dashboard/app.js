import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const DATA_URL = "../outputs/dt_state_v1.json";
const TIMESERIES_URL = "../outputs/dt_timeseries_v1.json";
const EPS = 1e-9;
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const colors = {
  hvac: 0x0f766e,
  lighting: 0xd97706,
  plug_load: 0x2563eb,
  service_load: 0x16a34a,
  shared: 0x7c3aed,
  action: 0xea580c,
  immutable: 0xdc2626,
  floor: 0xf8fafc,
  floorEdge: 0x0f766e,
  wall: 0xcbd5e1,
  room: 0xecfdf5,
};

const categoryLabels = {
  hvac: "HVAC",
  lighting: "Aydınlatma",
  plug_load: "Priz yükü",
  service_load: "Servis yükü",
  appliance: "Cihaz yükü",
  shared: "Ortak yük",
  other: "Diğer",
};

const floorLabels = {
  floor1: "1. Kat",
  floor2: "2. Kat",
  shared: "Ortak yük",
};

const floorFilterLabels = {
  all: "Tüm cihazlar",
  floor1: "1. Kat",
  floor2: "2. Kat",
  shared: "Ortak yükler",
};

const ROOM_LAYOUTS = {
  floor1: [
    { name: "Lobi", x: -3.55, z: -1.55, w: 2.25, d: 1.95 },
    { name: "Ofis Kanadı", x: -0.45, z: -1.55, w: 3.75, d: 1.95 },
    { name: "Kopyalama / Teknik", x: 3.35, z: -1.55, w: 2.35, d: 1.95 },
    { name: "Mutfak + Banyo", x: -3.35, z: 1.25, w: 2.65, d: 2.45 },
    { name: "Açık Ofis", x: 0.15, z: 1.25, w: 3.55, d: 2.45 },
    { name: "Mekanik", x: 3.65, z: 1.25, w: 2.25, d: 2.45 },
  ],
  floor2: [
    { name: "Derslik", x: -2.75, z: -1.35, w: 4.15, d: 2.35 },
    { name: "Bilgisayar Odası", x: 2.25, z: -1.35, w: 3.85, d: 2.35 },
    { name: "Mutfak + Servis", x: -3.35, z: 1.45, w: 3.05, d: 2.15 },
    { name: "Ofis", x: 0.05, z: 1.45, w: 2.45, d: 2.15 },
    { name: "Depo / Kopyalama", x: 3.25, z: 1.45, w: 2.75, d: 2.15 },
  ],
};

const els = {
  canvas: document.querySelector("#twin-canvas"),
  hudText: document.querySelector("#hud-text"),
  metricGrid: document.querySelector("#metric-grid"),
  zoneNodes: [...document.querySelectorAll(".zone-node")],
  floorList: document.querySelector("#floor-list"),
  actionList: document.querySelector("#action-list"),
  inspector: document.querySelector("#device-inspector"),
  manualForm: document.querySelector("#manual-form"),
  manualDevice: document.querySelector("#manual-device"),
  manualReduction: document.querySelector("#manual-reduction"),
  manualHelper: document.querySelector("#manual-helper"),
  previewManual: document.querySelector("#preview-manual"),
  clearManual: document.querySelector("#clear-manual"),
  applyRecourse: document.querySelector("#apply-recourse"),
  resetScene: document.querySelector("#reset-scene"),
  playPause: document.querySelector("#play-pause"),
  frameSlider: document.querySelector("#frame-slider"),
  timelineLabel: document.querySelector("#timeline-label"),
  speedSelect: document.querySelector("#speed-select"),
  floorButtons: [...document.querySelectorAll("[data-floor-filter]")],
};

const state = {
  data: null,
  scene: null,
  camera: null,
  renderer: null,
  controls: null,
  raycaster: new THREE.Raycaster(),
  pointer: new THREE.Vector2(),
  deviceMeshes: new Map(),
  deviceById: new Map(),
  selectedDeviceId: null,
  appliedRecourse: false,
  manualPreviewId: null,
  floorFilter: "all",
  timeseries: null,
  frameIndex: 0,
  playTimer: null,
};

init();

async function init() {
  try {
    const response = await fetch(DATA_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Digital Twin durum verisi okunamadı: ${response.status}`);
    }

    state.data = await response.json();
    state.data.devices.forEach((device) => state.deviceById.set(device.id, device));
    await loadTimeseriesIfAvailable();
    if (state.timeseries?.frames?.length) {
      configureTimeline();
      applyFrameToData(0);
    }

    renderDashboard();
    bindEvents();
    try {
      setupScene();
      renderSceneFromData();
      animate();
      els.hudText.textContent = formatHudStatus();
    } catch (sceneError) {
      showSceneFallback(sceneError);
    }
  } catch (error) {
    showFatalError(error);
  }
}

async function loadTimeseriesIfAvailable() {
  try {
    const response = await fetch(TIMESERIES_URL, { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    state.timeseries = await response.json();
  } catch (error) {
    console.warn("Hourly timeseries could not be loaded; falling back to single-state mode.", error);
  }
}

function configureTimeline() {
  const frames = state.timeseries.frames;
  els.frameSlider.max = String(frames.length - 1);
  els.frameSlider.value = "0";
  els.timelineLabel.textContent = `${frames.length.toLocaleString("tr-TR")} saatlik durum hazır.`;
}

function currentFrame() {
  return state.timeseries?.frames?.[state.frameIndex] || null;
}

function applyFrameToData(index) {
  const frame = state.timeseries.frames[index];
  if (!frame) {
    return;
  }
  state.frameIndex = index;
  state.appliedRecourse = false;
  state.manualPreviewId = null;

  state.data.timestamp = frame.timestamp;
  state.data.unit = state.timeseries.unit;
  state.data.model = state.timeseries.model;
  state.data.building = {
    current_total_kwh: frame.current_total_kwh,
    predicted_t_plus_1_kwh: frame.predicted_t_plus_1_kwh,
    predicted_zone: frame.predicted_zone,
    target_zone: frame.target_zone,
    observed_t_plus_1_kwh: frame.observed_t_plus_1_kwh,
  };
  state.data.floors = [
    {
      id: "floor1",
      label: "1. Kat",
      current_kwh: frame.floor1_kwh,
      zone: zoneLabelFromValue(frame.floor1_kwh, state.data.zone_config.floor1),
      device_ids: state.data.floors?.find((floor) => floor.id === "floor1")?.device_ids || [],
    },
    {
      id: "floor2",
      label: "2. Kat",
      current_kwh: frame.floor2_kwh,
      zone: zoneLabelFromValue(frame.floor2_kwh, state.data.zone_config.floor2),
      device_ids: state.data.floors?.find((floor) => floor.id === "floor2")?.device_ids || [],
    },
  ];
  state.data.shared_loads = {
    current_kwh: frame.shared_kwh,
    device_ids: state.data.shared_loads?.device_ids || [],
  };

  state.data.devices.forEach((device, deviceIndex) => {
    device.current_kwh = Number(frame.device_values[deviceIndex] || 0);
    device.max_auto_reduction_fraction = maxReductionFraction(device.source_column || device.label, frame.hour);
  });

  state.data.recourse = normalizeFrameRecourse(frame.recourse);
}

function normalizeFrameRecourse(recourse) {
  const actions = (recourse?.actions || []).map((action) => ({
    ...action,
    action_type: action.after_kwh <= EPS ? "turn_off" : "reduce_percent",
  }));
  return {
    method: recourse?.method || "ACE_STREAM_GREEDY",
    success: Boolean(recourse?.success),
    before: {
      predicted_kwh: Number(recourse?.before_kwh || state.data.building.predicted_t_plus_1_kwh),
      zone: recourse?.before_zone || state.data.building.predicted_zone,
    },
    after: {
      predicted_kwh: Number(recourse?.after_kwh || state.data.building.predicted_t_plus_1_kwh),
      zone: recourse?.after_zone || state.data.building.predicted_zone,
    },
    target_zone: recourse?.target_zone || state.data.building.target_zone,
    delta_kwh: Number(recourse?.delta_kwh || 0),
    actions,
  };
}

function setupScene() {
  if (!isWebglAvailable()) {
    throw new Error("WebGL desteklenmiyor veya devre dışı.");
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf7fbff);
  scene.fog = new THREE.Fog(0xf7fbff, 14, 28);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);
  camera.position.set(8.4, 6.3, 9.2);

  const renderer = new THREE.WebGLRenderer({
    canvas: els.canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !reducedMotion;
  controls.dampingFactor = 0.08;
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = 0.28;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 7;
  controls.maxDistance = 18;
  controls.target.set(0, 0.75, 0);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xc7d8e5, 1.8));

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.2);
  keyLight.position.set(4, 9, 3);
  scene.add(keyLight);

  const cyanLight = new THREE.PointLight(colors.floorEdge, 2.2, 18);
  cyanLight.position.set(-5, 3, 4);
  scene.add(cyanLight);

  const orangeLight = new THREE.PointLight(colors.action, 2.4, 16);
  orangeLight.position.set(4.5, 2.8, -3.5);
  scene.add(orangeLight);

  const grid = new THREE.GridHelper(14, 14, 0xb7d4e8, 0xd7e7f1);
  grid.position.y = -0.04;
  scene.add(grid);

  state.scene = scene;
  state.camera = camera;
  state.renderer = renderer;
  state.controls = controls;

  resizeRenderer();
  window.addEventListener("resize", resizeRenderer);
}

function renderSceneFromData() {
  if (!state.scene) {
    return;
  }
  createFloor("floor1", "1. Kat", 0);
  createFloor("floor2", "2. Kat", 1.65);
  createSharedServiceRail();

  state.data.devices.forEach((device) => {
    const mesh = createDeviceMesh(device);
    state.deviceMeshes.set(device.id, mesh);
    state.scene.add(mesh.group);
  });

  createActionConnectors();
}

function createFloor(floorId, label, y) {
  const group = new THREE.Group();
  group.name = floorId;

  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(9.6, 0.12, 5.7),
    new THREE.MeshStandardMaterial({
      color: colors.floor,
      metalness: 0.08,
      roughness: 0.52,
      transparent: true,
      opacity: 0.96,
    }),
  );
  slab.position.y = y;
  group.add(slab);

  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(9.75, 0.16, 5.85)),
    new THREE.LineBasicMaterial({
      color: colors.floorEdge,
      transparent: true,
      opacity: 0.86,
    }),
  );
  edge.position.y = y;
  group.add(edge);

  const walls = createFloorWalls(y);
  group.add(walls);
  group.add(createRoomLayout(floorId, y));

  const labelSprite = createTextSprite(label, "#102033", "rgba(255, 255, 255, 0.86)");
  labelSprite.position.set(-4.85, y + 0.36, -2.82);
  group.add(labelSprite);

  state.scene.add(group);
}

function createFloorWalls(y) {
  const walls = new THREE.Group();
  const wallMaterial = new THREE.MeshStandardMaterial({
    color: colors.wall,
    transparent: true,
    opacity: 0.44,
    metalness: 0.02,
    roughness: 0.38,
  });
  const back = new THREE.Mesh(new THREE.BoxGeometry(9.7, 0.62, 0.06), wallMaterial);
  const front = new THREE.Mesh(new THREE.BoxGeometry(9.7, 0.28, 0.045), wallMaterial);
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.62, 5.8), wallMaterial);
  const right = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 5.8), wallMaterial);
  back.position.set(0, y + 0.34, -2.92);
  front.position.set(0, y + 0.18, 2.92);
  left.position.set(-4.9, y + 0.34, 0);
  right.position.set(4.9, y + 0.18, 0);
  walls.add(back, front, left, right);
  return walls;
}

function createRoomLayout(floorId, y) {
  const layout = new THREE.Group();
  const rooms = ROOM_LAYOUTS[floorId] || [];
  rooms.forEach((room, index) => {
    const tint = index % 2 === 0 ? 0xf4faff : 0xeaf4fb;
    const floorPatch = new THREE.Mesh(
      new THREE.BoxGeometry(room.w, 0.025, room.d),
      new THREE.MeshStandardMaterial({
        color: tint,
        transparent: true,
        opacity: 0.92,
        roughness: 0.7,
      }),
    );
    floorPatch.position.set(room.x, y + 0.075, room.z);
    layout.add(floorPatch);

    const border = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(room.w, 0.04, room.d)),
      new THREE.LineBasicMaterial({
        color: 0x8bb9d6,
        transparent: true,
        opacity: 0.74,
      }),
    );
    border.position.set(room.x, y + 0.105, room.z);
    layout.add(border);

    const halfHeight = 0.34;
    const wallMaterial = new THREE.MeshStandardMaterial({
      color: 0xd9ebf6,
      transparent: true,
      opacity: 0.48,
      roughness: 0.42,
    });
    const north = new THREE.Mesh(new THREE.BoxGeometry(room.w, halfHeight, 0.045), wallMaterial);
    const south = new THREE.Mesh(new THREE.BoxGeometry(room.w, halfHeight * 0.62, 0.035), wallMaterial);
    const west = new THREE.Mesh(new THREE.BoxGeometry(0.045, halfHeight, room.d), wallMaterial);
    const east = new THREE.Mesh(new THREE.BoxGeometry(0.035, halfHeight * 0.62, room.d), wallMaterial);
    north.position.set(room.x, y + 0.24, room.z - room.d / 2);
    south.position.set(room.x, y + 0.16, room.z + room.d / 2);
    west.position.set(room.x - room.w / 2, y + 0.24, room.z);
    east.position.set(room.x + room.w / 2, y + 0.16, room.z);
    layout.add(north, south, west, east);

    const label = createTextSprite(room.name, "#102033", "rgba(255, 255, 255, 0.74)");
    label.position.set(room.x - room.w / 2 + 0.78, y + 0.22, room.z - room.d / 2 + 0.28);
    label.scale.set(1.02, 0.25, 1);
    layout.add(label);
  });
  return layout;
}

function createSharedServiceRail() {
  const rail = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 2.1, 5.6),
    new THREE.MeshStandardMaterial({
      color: colors.shared,
      emissive: colors.shared,
      emissiveIntensity: 0.08,
      transparent: true,
      opacity: 0.42,
    }),
  );
  rail.position.set(5.45, 0.95, 0);
  state.scene.add(rail);
}

function createDeviceMesh(device) {
  const action = findActionForDevice(device.id);
  const isAction = Boolean(action);
  const color = isAction ? colors.action : deviceColor(device);
  const position = scenePosition(device);
  const valueScale = Math.max(0.26, Math.min(1.2, 0.26 + device.current_kwh * 1.8));

  const group = new THREE.Group();
  group.name = device.id;
  group.position.set(position.x, position.y, position.z);
  group.userData.deviceId = device.id;

  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: isAction ? 0.22 : 0.04,
    metalness: 0.1,
    roughness: 0.42,
  });

  const body = new THREE.Mesh(createDeviceGeometry(device), material);
  body.scale.setScalar(valueScale);
  body.userData.deviceId = device.id;
  group.add(body);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.34, 0.018, 12, 48),
    new THREE.MeshBasicMaterial({
      color: colors.action,
      transparent: true,
      opacity: 0.72,
    }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.userData.isActionRing = true;
  ring.visible = isAction;
  group.add(ring);

  if (!device.actionable) {
    const lock = new THREE.Mesh(
      new THREE.TorusGeometry(0.24, 0.012, 10, 36),
      new THREE.MeshBasicMaterial({
        color: colors.immutable,
        transparent: true,
        opacity: 0.7,
      }),
    );
    lock.rotation.x = Math.PI / 2;
    lock.position.y = 0.04;
    group.add(lock);
  }

  const label = createTextSprite(shorten(displayDeviceName(device), 20), "#102033", "rgba(255, 255, 255, 0.9)");
  label.position.y = 0.52;
  label.visible = isAction;
  group.add(label);

  return { group, body, material, label, action };
}

function createDeviceGeometry(device) {
  if (device.category === "hvac") {
    return new THREE.CylinderGeometry(0.18, 0.22, 0.42, 18);
  }
  if (device.category === "lighting") {
    return new THREE.SphereGeometry(0.22, 20, 14);
  }
  if (device.floor === "shared") {
    return new THREE.OctahedronGeometry(0.25);
  }
  return new THREE.BoxGeometry(0.34, 0.34, 0.34);
}

function createActionConnectors() {
  if (!state.scene) {
    return;
  }
  [...state.scene.children].forEach((child) => {
    if (child.userData.isActionConnector) {
      state.scene.remove(child);
      child.geometry?.dispose?.();
      child.material?.dispose?.();
    }
  });

  const actionDevices = state.data.recourse.actions
    .map((action) => state.deviceMeshes.get(action.device_id))
    .filter(Boolean);

  actionDevices.forEach((meshState) => {
    const point = meshState.group.position;
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(point.x, point.y + 0.05, point.z),
      new THREE.Vector3(point.x, point.y + 0.8, point.z - 0.35),
      new THREE.Vector3(0, 2.65, -3.4),
    ]);
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(path, 28, 0.012, 8, false),
      new THREE.MeshBasicMaterial({
        color: colors.action,
        transparent: true,
        opacity: 0.55,
      }),
    );
    tube.userData.isActionConnector = true;
    tube.visible = state.appliedRecourse;
    state.scene.add(tube);
  });
}

function createTextSprite(text, color, background) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const scale = 2;
  canvas.width = 360 * scale;
  canvas.height = 86 * scale;
  context.scale(scale, scale);
  context.fillStyle = background;
  roundRect(context, 0, 0, 360, 86, 8);
  context.fill();
  context.fillStyle = color;
  context.font = "700 24px Manrope, sans-serif";
  context.fillText(text, 20, 54);

  const texture = new THREE.CanvasTexture(canvas);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.45, 0.35, 1);
  return sprite;
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + width, y, x + width, y + height, radius);
  context.arcTo(x + width, y + height, x, y + height, radius);
  context.arcTo(x, y + height, x, y, radius);
  context.arcTo(x, y, x + width, y, radius);
  context.closePath();
}

function renderDashboard() {
  renderMetrics();
  renderZones();
  renderFloors();
  renderActions();
  renderManualOptions();
  renderInspector(null);
  updateTimelineUi();
}

function renderMetrics() {
  const building = state.data.building;
  const recourse = state.data.recourse;
  const metricCards = [
    {
      label: "Anlık yük",
      value: formatKwh(building.current_total_kwh),
      sub: "Seçili saatteki toplam tüketim",
    },
    {
      label: "Sonraki saat tahmini",
      value: formatKwh(state.appliedRecourse ? recourse.after.predicted_kwh : building.predicted_t_plus_1_kwh),
      sub: `Enerji zone'u ${formatZone(state.appliedRecourse ? recourse.after.zone : building.predicted_zone)}`,
    },
    {
      label: "Hedef zone",
      value: formatZone(building.target_zone),
      sub: recourse.success ? "ACE önerisiyle erişilebilir" : "Ek müdahale gerekebilir",
    },
    {
      label: "Model",
      value: `R2 ${state.data.model.metrics.R2.toFixed(3)}`,
      sub: `MAE ${state.data.model.metrics.MAE.toFixed(3)} | zone doğruluğu ${state.data.model.metrics.zone_accuracy.toFixed(3)}`,
    },
  ];

  els.metricGrid.innerHTML = metricCards
    .map(
      (card) => `
        <article class="metric-card">
          <p class="metric-label">${card.label}</p>
          <p class="metric-value">${card.value}</p>
          <p class="metric-sub">${card.sub}</p>
        </article>
      `,
    )
    .join("");
}

function renderZones() {
  const current = state.appliedRecourse ? state.data.recourse.after.zone : state.data.building.predicted_zone;
  const target = state.data.building.target_zone;
  els.zoneNodes.forEach((node) => {
    node.classList.toggle("current", node.dataset.zone === current);
    node.classList.toggle("target", node.dataset.zone === target && node.dataset.zone !== current);
  });
}

function renderFloors() {
  const items = [
    ...state.data.floors.map((floor) => ({
      title: floor.label || floorLabels[floor.id] || floor.id,
      zone: formatZone(floor.zone),
      current_kwh: floor.current_kwh,
    })),
    {
      title: "Ortak yükler",
      zone: "Paylaşılan",
      current_kwh: state.data.shared_loads.current_kwh,
    },
  ];
  const maxKwh = Math.max(...items.map((item) => item.current_kwh), EPS);
  els.floorList.innerHTML = items
    .map((item) => {
      const percent = Math.max(4, Math.round((item.current_kwh / maxKwh) * 100));
      return `
        <article class="floor-card">
          <div class="floor-head">
            <p class="floor-title">${item.title}</p>
            <span class="pill">${item.zone}</span>
          </div>
          <p class="floor-kwh">${formatKwh(item.current_kwh)}</p>
          <div class="bar-shell" aria-hidden="true">
            <div class="bar-fill" style="--bar-value: ${percent}%"></div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderActions() {
  const actions = state.data.recourse.actions;
  const recourse = state.data.recourse;
  if (!actions.length) {
    els.actionList.innerHTML = `
      <div class="recourse-summary">
        <strong>ACE bu saat için aksiyon önermiyor.</strong>
        <p class="xai-copy">Tahmin hedef zone içinde olabilir veya mevcut azaltma seçenekleri anlamlı bir iyileşme üretmemiş olabilir.</p>
      </div>
    `;
    return;
  }

  const summary = `
    <div class="recourse-summary">
      <strong>${formatZone(recourse.before.zone)} seviyesinden ${formatZone(recourse.after.zone)} seviyesine inebilir.</strong>
      <p class="xai-copy">
        CatBoost tahmini ${formatKwh(recourse.before.predicted_kwh)} iken ACE önerisi
        ${formatKwh(recourse.after.predicted_kwh)} sonucunu verir.
        ${recourse.success ? "Bu sonuç hedef zone için yeterlidir." : "Bu sonuç hedef zone için tek başına yeterli değildir."}
      </p>
    </div>
  `;

  els.actionList.innerHTML = summary + actions
    .map((action, index) => {
      const percent = Math.round(action.reduction_fraction * 100);
      const modelDelta = Number(action.model_delta_kwh || 0);
      return `
        <article class="action-card">
          <div class="action-head">
            <p class="action-title">${index + 1}. ${displayFeatureName(action.label || action.feature)}</p>
            <span class="pill action">-${percent}%</span>
          </div>
          <p class="action-delta">${formatKwh(action.before_kwh)} → ${formatKwh(action.after_kwh)}</p>
          <p class="metric-sub">Model etkisi ${formatKwh(modelDelta)} | müdahale maliyeti ${action.cost_weight}</p>
          <p class="xai-title">Neden bu cihaza dokunuyoruz?</p>
          <p class="xai-copy">
            Bu yük kontrol edilebilir, seçili saatte yüksek etkiye sahiptir ve
            ${action.cap_percent || percent}% operasyonel azaltma sınırı içinde kalır.
            Bu nedenle hedef zone'a yaklaşmak için öncelikli adaydır.
          </p>
          <button class="button ghost" type="button" data-focus-device="${action.device_id}">
            Cihaza odaklan
          </button>
        </article>
      `;
    })
    .join("");
}

function renderManualOptions() {
  const options = state.data.devices
    .map((device) => {
      const disabled = device.actionable ? "" : "disabled";
      const suffix = device.actionable ? "" : " - sabit yük";
      return `<option value="${device.id}" ${disabled}>${displayDeviceName(device)}${suffix}</option>`;
    })
    .join("");
  els.manualDevice.innerHTML = options;
  const firstAction = state.data.recourse.actions[0];
  if (firstAction) {
    els.manualDevice.value = firstAction.device_id;
  }
  updateManualHelper();
}

function renderInspector(device) {
  if (!device) {
    els.inspector.innerHTML = `<p class="empty-state">Detayları görmek için sahneden veya ACE listesinden bir cihaz seçin.</p>`;
    return;
  }

  const action = findActionForDevice(device.id);
  const actionPill = action
    ? `<span class="pill action">ACE aksiyonu -${Math.round(action.reduction_fraction * 100)}%</span>`
    : "";
  const lockPill = device.actionable ? "" : `<span class="pill locked">sabit yük</span>`;
  const cap = Math.round(device.max_auto_reduction_fraction * 100);

  els.inspector.innerHTML = `
    <h3 class="device-title">${displayDeviceName(device)}</h3>
    <p class="metric-sub">${categoryLabels[device.category] || device.category} | ${floorLabels[device.floor] || device.floor}</p>
    <div class="device-meta">
      <span class="pill">${formatKwh(device.current_kwh)}</span>
      <span class="pill">sınır ${cap}%</span>
      <span class="pill">konfor ${device.comfort_weight}</span>
      ${actionPill}
      ${lockPill}
    </div>
    <p class="metric-sub">
      ${action ? `Önerilen değer: ${formatKwh(action.after_kwh)} | azaltım ${formatKwh(action.delta_kwh)}` : "Bu cihaz mevcut ACE öneri setinde değişmiyor."}
    </p>
  `;
}

function selectFrame(index) {
  if (!state.timeseries?.frames?.length) {
    return;
  }
  const boundedIndex = Math.max(0, Math.min(index, state.timeseries.frames.length - 1));
  applyFrameToData(boundedIndex);
  clearManualPreview();
  updateSceneForCurrentFrame();
  renderMetrics();
  renderZones();
  renderFloors();
  renderActions();
  updateTimelineUi();
  if (state.selectedDeviceId) {
    renderInspector(state.deviceById.get(state.selectedDeviceId));
  }
  els.hudText.textContent = `${formatTimestamp(state.data.timestamp)} | ${formatZone(state.data.building.predicted_zone)} → ${formatZone(state.data.building.target_zone)}`;
}

function updateTimelineUi() {
  const frame = currentFrame();
  if (!frame) {
    return;
  }
  els.frameSlider.value = String(state.frameIndex);
  els.timelineLabel.textContent = `${state.frameIndex + 1}/${state.timeseries.frames.length.toLocaleString("tr-TR")} | ${formatTimestamp(frame.timestamp)} | saat ${String(frame.hour).padStart(2, "0")}:00`;
}

function togglePlayback() {
  if (state.playTimer) {
    stopPlayback();
  } else {
    startPlayback();
  }
}

function startPlayback() {
  if (!state.timeseries?.frames?.length) {
    return;
  }
  els.playPause.textContent = "Duraklat";
  state.playTimer = window.setInterval(() => {
    const next = state.frameIndex >= state.timeseries.frames.length - 1 ? 0 : state.frameIndex + 1;
    selectFrame(next);
  }, Number(els.speedSelect.value || 650));
}

function stopPlayback() {
  if (state.playTimer) {
    window.clearInterval(state.playTimer);
    state.playTimer = null;
  }
  els.playPause.textContent = "Akışı başlat";
}

function updateSceneForCurrentFrame() {
  const actions = new Set(state.data.recourse.actions.map((action) => action.device_id));
  state.data.devices.forEach((device) => {
    const meshState = state.deviceMeshes.get(device.id);
    if (!meshState) {
      return;
    }
    meshState.action = findActionForDevice(device.id);
    const isAction = actions.has(device.id);
    const color = state.appliedRecourse && isAction ? colors.action : deviceColor(device);
    const valueScale = Math.max(0.26, Math.min(1.2, 0.26 + Number(device.current_kwh || 0) * 1.8));
    meshState.body.scale.setScalar(valueScale);
    meshState.material.color.set(isAction ? colors.action : color);
    meshState.material.emissive.set(isAction ? colors.action : color);
    meshState.material.emissiveIntensity = isAction ? 0.22 : 0.04;
    meshState.label.visible = isAction;
    const ring = meshState.group.children.find((child) => child.userData.isActionRing);
    if (ring) {
      ring.visible = state.appliedRecourse && isAction;
    }
    meshState.group.scale.setScalar(1);
  });
  createActionConnectors();
  applyFloorFilter();
}

function bindEvents() {
  els.canvas.addEventListener("pointermove", onPointerMove);
  els.canvas.addEventListener("click", onCanvasClick);

  els.applyRecourse.addEventListener("click", () => {
    stopPlayback();
    state.appliedRecourse = true;
    createActionConnectors();
    highlightRecourse(true);
    renderMetrics();
    renderZones();
    els.hudText.textContent = `ACE uygulandı | ${formatZone(state.data.recourse.before.zone)} → ${formatZone(state.data.recourse.after.zone)}`;
  });

  els.resetScene.addEventListener("click", () => {
    state.appliedRecourse = false;
    state.manualPreviewId = null;
    state.selectedDeviceId = null;
    highlightRecourse(false);
    clearManualPreview();
    createActionConnectors();
    renderMetrics();
    renderZones();
    renderActions();
    renderInspector(null);
    els.hudText.textContent = formatHudStatus();
  });

  els.floorButtons.forEach((button) => {
    button.addEventListener("click", () => {
      state.floorFilter = button.dataset.floorFilter;
      els.floorButtons.forEach((item) => item.classList.toggle("active", item === button));
      applyFloorFilter();
    });
  });

  els.actionList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-focus-device]");
    if (!button) {
      return;
    }
    focusDevice(button.dataset.focusDevice);
  });

  els.manualDevice.addEventListener("change", updateManualHelper);
  els.manualReduction.addEventListener("input", updateManualHelper);
  els.manualForm.addEventListener("submit", (event) => {
    event.preventDefault();
    previewManualOverride();
  });
  els.clearManual.addEventListener("click", clearManualPreview);
  els.playPause.addEventListener("click", togglePlayback);
  els.speedSelect.addEventListener("change", () => {
    if (state.playTimer) {
      stopPlayback();
      startPlayback();
    }
  });
  els.frameSlider.addEventListener("input", () => {
    stopPlayback();
    selectFrame(Number(els.frameSlider.value));
  });
}

function onPointerMove(event) {
  const hit = intersectDevice(event);
  els.canvas.style.cursor = hit ? "pointer" : "grab";
}

function onCanvasClick(event) {
  const hit = intersectDevice(event);
  if (!hit) {
    return;
  }
  focusDevice(hit.object.userData.deviceId);
}

function intersectDevice(event) {
  const rect = els.canvas.getBoundingClientRect();
  state.pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  state.pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  state.raycaster.setFromCamera(state.pointer, state.camera);
  const bodies = [...state.deviceMeshes.values()].map((item) => item.body);
  const hits = state.raycaster.intersectObjects(bodies, false);
  return hits[0] || null;
}

function focusDevice(deviceId) {
  const device = state.deviceById.get(deviceId);
  const mesh = state.deviceMeshes.get(deviceId);
  if (!device || !mesh) {
    return;
  }

  state.selectedDeviceId = deviceId;
  renderInspector(device);

  state.controls.target.copy(mesh.group.position);
  state.camera.position.lerp(new THREE.Vector3(mesh.group.position.x + 4, mesh.group.position.y + 3, mesh.group.position.z + 5), 0.45);
  pulseDevice(deviceId);
}

function highlightRecourse(enabled) {
  if (!state.scene) {
    return;
  }
  const actionIds = new Set(state.data.recourse.actions.map((action) => action.device_id));
  state.data.recourse.actions.forEach((action) => {
    const meshState = state.deviceMeshes.get(action.device_id);
    if (!meshState) {
      return;
    }
    meshState.material.color.set(enabled ? colors.action : deviceColor(state.deviceById.get(action.device_id)));
    meshState.material.emissive.set(enabled ? colors.action : deviceColor(state.deviceById.get(action.device_id)));
    meshState.material.emissiveIntensity = enabled ? 0.46 : 0.22;
    meshState.label.visible = true;
  });

  state.deviceMeshes.forEach((meshState, deviceId) => {
    const ring = meshState.group.children.find((child) => child.userData.isActionRing);
    if (ring) {
      ring.visible = enabled && actionIds.has(deviceId);
    }
    if (!enabled && !actionIds.has(deviceId)) {
      const device = state.deviceById.get(deviceId);
      const color = deviceColor(device);
      meshState.material.color.set(color);
      meshState.material.emissive.set(color);
      meshState.material.emissiveIntensity = 0.04;
      meshState.label.visible = false;
    }
  });

  state.scene.children.forEach((child) => {
    if (child.userData.isActionConnector) {
      child.visible = enabled;
    }
  });
}

function applyFloorFilter() {
  state.deviceMeshes.forEach((meshState, deviceId) => {
    const device = state.deviceById.get(deviceId);
    const visible = state.floorFilter === "all" || device.floor === state.floorFilter;
    meshState.group.visible = visible;
  });
  els.hudText.textContent = `Filtre: ${floorFilterLabels[state.floorFilter] || state.floorFilter}`;
}

function previewManualOverride() {
  const device = state.deviceById.get(els.manualDevice.value);
  if (!device || !device.actionable) {
    return;
  }
  clearManualPreview();
  state.manualPreviewId = device.id;
  const reduction = Number(els.manualReduction.value) / 100;
  const mesh = state.deviceMeshes.get(device.id);
  if (!mesh) {
    els.hudText.textContent = "Manuel önizleme için 3D sahne gerekli.";
    return;
  }
  mesh.material.color.set(0xffb454);
  mesh.material.emissive.set(0xffb454);
  mesh.material.emissiveIntensity = 0.65;
  mesh.group.scale.setScalar(Math.max(0.38, 1 - reduction * 0.42));
  focusDevice(device.id);
  els.hudText.textContent = `Manuel önizleme: ${displayDeviceName(device)} -%${Math.round(reduction * 100)}`;
}

function clearManualPreview() {
  if (!state.manualPreviewId) {
    return;
  }
  const device = state.deviceById.get(state.manualPreviewId);
  const mesh = state.deviceMeshes.get(state.manualPreviewId);
  if (device && mesh) {
    const isAction = Boolean(findActionForDevice(device.id)) && state.appliedRecourse;
    const color = isAction ? colors.action : deviceColor(device);
    mesh.material.color.set(color);
    mesh.material.emissive.set(color);
    mesh.material.emissiveIntensity = isAction ? 0.72 : 0.15;
    mesh.group.scale.setScalar(1);
  }
  state.manualPreviewId = null;
  els.hudText.textContent = "Manuel önizleme temizlendi.";
}

function updateManualHelper() {
  const device = state.deviceById.get(els.manualDevice.value);
  const reduction = Number(els.manualReduction.value);
  if (!device) {
    return;
  }
  const capPercent = Math.round((device.max_auto_reduction_fraction ?? 0.8) * 100);
  const capped = Math.min(reduction, capPercent);
  els.manualHelper.textContent = `${displayDeviceName(device)}: seçilen oran %${reduction}, otomatik sınır %${capPercent}. Görsel önizleme %${capped} azaltımı temsil eder.`;
}

function pulseDevice(deviceId) {
  const mesh = state.deviceMeshes.get(deviceId);
  if (!mesh || reducedMotion) {
    return;
  }
  mesh.group.scale.setScalar(1.18);
  window.setTimeout(() => {
    if (state.manualPreviewId !== deviceId) {
      mesh.group.scale.setScalar(1);
    }
  }, 260);
}

function animate(time = 0) {
  requestAnimationFrame(animate);
  if (!state.renderer) {
    return;
  }

  if (!reducedMotion) {
    state.deviceMeshes.forEach((meshState) => {
      if (meshState.action || state.manualPreviewId === meshState.group.name) {
        meshState.group.rotation.y = Math.sin(time * 0.002) * 0.22;
      }
      const ring = meshState.group.children.find((child) => child.userData.isActionRing);
      if (ring) {
        ring.scale.setScalar(1 + Math.sin(time * 0.005) * 0.08);
      }
    });
  }

  state.controls.update();
  state.renderer.render(state.scene, state.camera);
}

function resizeRenderer() {
  const rect = els.canvas.getBoundingClientRect();
  const width = Math.max(320, rect.width);
  const height = Math.max(480, rect.height);
  state.renderer.setSize(width, height, false);
  state.camera.aspect = width / height;
  state.camera.updateProjectionMatrix();
}

function scenePosition(device) {
  const base = device.scene || { x: 0, y: 0, z: 0 };
  if (device.floor === "floor2") {
    return { x: base.x, y: 1.98, z: base.z };
  }
  if (device.floor === "shared") {
    return { x: base.x + 5.45, y: 0.56 + (base.z + 1.8) * 0.26, z: base.z };
  }
  return { x: base.x, y: 0.34, z: base.z };
}

function deviceColor(device) {
  if (!device.actionable) {
    return colors.immutable;
  }
  if (device.floor === "shared") {
    return colors.shared;
  }
  return colors[device.category] || colors.plug_load;
}

function maxReductionFraction(name, hour) {
  const normalized = String(name).toLowerCase();
  if (normalized.includes("refridgerator") || normalized.includes("refrigerator")) {
    return 0;
  }
  if (normalized.includes("exterior lights")) {
    return hour >= 20 || hour <= 5 ? 0.25 : 0.7;
  }
  if (normalized.includes("ahu") || normalized.includes("hp") || normalized.includes("erv")) {
    return 0.3;
  }
  if (normalized.includes("light")) {
    return 0.5;
  }
  if (normalized.includes("water heater") || normalized.includes("oven")) {
    return 0.6;
  }
  return 0.8;
}

function isWebglAvailable() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl2") || canvas.getContext("webgl") || canvas.getContext("experimental-webgl")),
    );
  } catch {
    return false;
  }
}

function findActionForDevice(deviceId) {
  return state.data?.recourse?.actions?.find((action) => action.device_id === deviceId);
}

function formatKwh(value) {
  return `${Number(value).toFixed(3)} kWh`;
}

function formatZone(value) {
  return String(value || "").toUpperCase();
}

function zoneLabelFromValue(value, thresholds) {
  const zone = thresholds.filter((threshold) => Number(value) >= threshold).length + 1;
  return `s${zone}`;
}

function formatTimestamp(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("tr-TR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function shorten(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}.` : text;
}

function displayDeviceName(device) {
  return displayFeatureName(device?.label || device?.source_column || "");
}

function displayFeatureName(value) {
  return normalizeLabel(value);
}

function normalizeLabel(value) {
  return String(value || "")
    .trim()
    .replace(/Refridgerator/gi, "Refrigerator")
    .replace(/Bathoom/gi, "Bathroom")
    .replace(/\b1st flr\b/gi, "1. Kat")
    .replace(/\b2nd flr\b/gi, "2. Kat")
    .replace(/Computer Room/gi, "Bilgisayar Odası")
    .replace(/Copy Room/gi, "Kopyalama Odası")
    .replace(/Storage Room/gi, "Depo")
    .replace(/Utility Room/gi, "Teknik Oda")
    .replace(/Classroom/gi, "Derslik")
    .replace(/Lobby/gi, "Lobi")
    .replace(/Office/gi, "Ofis")
    .replace(/Bathroom/gi, "Banyo")
    .replace(/Kitchen/gi, "Mutfak")
    .replace(/Lights/gi, "Aydınlatma")
    .replace(/Exterior/gi, "Dış")
    .replace(/Water Heater/gi, "Su Isıtıcı")
    .replace(/Water Cooler/gi, "Su Sebili")
    .replace(/Dishwasher/gi, "Bulaşık Makinesi")
    .replace(/Oven/gi, "Fırın")
    .replace(/\brecp\b/gi, "priz")
    .replace(/\s+/g, " ");
}

function formatHudStatus() {
  return `${formatTimestamp(state.data.timestamp)} | ${formatZone(state.data.building.predicted_zone)} → ${formatZone(state.data.building.target_zone)} | ${state.data.zone_config_version}`;
}

function showSceneFallback(error) {
  console.info("3D scene fallback:", error.message);
  els.canvas.hidden = true;
  els.hudText.textContent = "3D sahne kullanılamıyor.";
  const frame = els.canvas.closest(".scene-frame");
  frame.classList.add("scene-frame--fallback");
  const fallback = document.createElement("div");
  fallback.className = "scene-fallback";
  fallback.setAttribute("role", "status");
  fallback.innerHTML = `
    <p class="eyebrow">3D sahne hazır değil</p>
    <h3>Tarayıcı WebGL bağlamı oluşturamadı.</h3>
    <p>Dashboard verileri, metrikler ve ACE önerileri yüklenmeye devam eder. 3D sahne için WebGL destekli güncel bir tarayıcı kullanın.</p>
  `;
  frame.append(fallback);
}

function showFatalError(error) {
  const message = `
    <div class="error-panel" role="alert">
      <h2>Digital Twin verisi yüklenemedi</h2>
      <p>${error.message}</p>
      <p>Dashboard'u dosya olarak açmak yerine proje kökünde yerel HTTP server ile çalıştırın.</p>
    </div>
  `;
  document.querySelector("#main").innerHTML = message;
  els.hudText.textContent = "Veri yükleme hatası";
  console.error(error);
}
