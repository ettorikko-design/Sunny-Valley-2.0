// =====================================================
// FATTORIA 3D - Logica completa
// =====================================================

window.addEventListener('load', function () {
  var errorEl = document.getElementById('error');
  function showError(msg, err) {
    errorEl.style.display = 'block';
    errorEl.textContent = msg + '\n\n' + (err && err.stack ? err.stack : '');
    console.error(msg, err);
  }

  if (typeof THREE === 'undefined') {
    showError('ERRORE: Three.js non è stato caricato.\n\nControlla la connessione internet.');
    return;
  }

  try {
    // =====================================================
    // COSTANTI
    // =====================================================
    var WATER_MAX = 20;
    var FEED_DURATION = 30;
    var PRODUCE_INTERVAL = 15;
    var SAVE_KEY = 'farm_save_v3';
    var AUTOSAVE_INTERVAL = 5;
    var JOY_DEAD_ZONE = 0.15;

    var CROPS = {
      wheat: {
        icon: '🌾', name: 'Grano',
        cost: 0, growTime: 8, sellPrice: 8,
        stemColor: 0x4caf50, matureStemColor: 0xC8A94D,
        headColor: 0xE8C860, headType: 'spike',
        headSize: 0.09, plantCount: 6
      },
      corn: {
        icon: '🌽', name: 'Mais',
        cost: 10, growTime: 15, sellPrice: 25,
        stemColor: 0x558B2F, matureStemColor: 0x7CB342,
        headColor: 0xFFD54F, headType: 'corn',
        headSize: 0.13, plantCount: 3
      },
      carrot: {
        icon: '🥕', name: 'Carota',
        cost: 20, growTime: 25, sellPrice: 60,
        stemColor: 0x43A047, matureStemColor: 0x2E7D32,
        headColor: 0xFF6D00, headType: 'root',
        headSize: 0.12, plantCount: 4
      }
    };

    var PRICES = {
      wheat: 8, corn: 25, carrot: 60, eggs: 15, meat: 25
    };

    // =====================================================
    // IMPOSTAZIONI
    // =====================================================
    var settings = {
      sensitivity: parseFloat(localStorage.getItem('farm_sens') || '1'),
      joySize: parseInt(localStorage.getItem('farm_joysize') || '112')
    };
    document.getElementById('joy').style.width = settings.joySize + 'px';
    document.getElementById('joy').style.height = settings.joySize + 'px';

    // =====================================================
    // SCENA
    // =====================================================
    var scene = new THREE.Scene();
    var skyGeo = new THREE.SphereGeometry(100, 32, 16);
    var skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor:    { value: new THREE.Color(0x2196F3) },
        bottomColor: { value: new THREE.Color(0xE1F5FE) },
        offset:      { value: 20 },
        exponent:    { value: 0.6 }
      },
      vertexShader: [
        'varying vec3 vWorldPosition;',
        'void main() {',
        '  vec4 worldPos = modelMatrix * vec4(position, 1.0);',
        '  vWorldPosition = worldPos.xyz;',
        '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
        '}'
      ].join('\n'),
      fragmentShader: [
        'uniform vec3 topColor;',
        'uniform vec3 bottomColor;',
        'uniform float offset;',
        'uniform float exponent;',
        'varying vec3 vWorldPosition;',
        'void main() {',
        '  float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;',
        '  float f = pow(max(h, 0.0), exponent);',
        '  gl_FragColor = vec4(mix(bottomColor, topColor, f), 1.0);',
        '}'
      ].join('\n'),
      side: THREE.BackSide
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));
    scene.fog = new THREE.Fog(0xE1F5FE, 30, 80);

    var camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 1.7, 8);

    var renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputEncoding = THREE.sRGBEncoding;
    document.body.appendChild(renderer.domElement);

    // =====================================================
    // LUCI
    // =====================================================
    var sun = new THREE.DirectionalLight(0xfff5e0, 1.4);
    sun.position.set(20, 30, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -30;
    sun.shadow.camera.right = 30;
    sun.shadow.camera.top = 30;
    sun.shadow.camera.bottom = -30;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 80;
    sun.shadow.bias = -0.0005;
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    scene.add(new THREE.HemisphereLight(0x87CEEB, 0x4a7c3a, 0.55));

    var sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(2.5, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xfff8b0 })
    );
    sunMesh.position.set(40, 45, 30);
    scene.add(sunMesh);

    // =====================================================
    // TERRENO
    // =====================================================
    var groundGeo = new THREE.PlaneGeometry(120, 120, 30, 30);
    var groundColors = [];
    for (var i = 0; i < groundGeo.attributes.position.count; i++) {
      var g = 0.45 + Math.random() * 0.15;
      groundColors.push(0.35 * g, 0.6 * g, 0.25 * g);
    }
    groundGeo.setAttribute('color', new THREE.Float32BufferAttribute(groundColors, 3));
    var ground = new THREE.Mesh(
      groundGeo,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // =====================================================
    // NUVOLE
    // =====================================================
    var clouds = [];
    function makeCloud(x, y, z) {
      var cg = new THREE.Group();
      for (var k = 0; k < 4; k++) {
        var s = new THREE.Mesh(
          new THREE.SphereGeometry(1.5 + Math.random() * 1.5, 8, 6),
          new THREE.MeshStandardMaterial({
            color: 0xffffff, roughness: 1, transparent: true, opacity: 0.9
          })
        );
        s.position.set((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 2);
        cg.add(s);
      }
      cg.position.set(x, y, z);
      cg.userData.speed = 0.3 + Math.random() * 0.4;
      scene.add(cg);
      clouds.push(cg);
    }
    for (var ci = 0; ci < 8; ci++) {
      makeCloud((Math.random() - 0.5) * 100, 18 + Math.random() * 8, (Math.random() - 0.5) * 100);
    }

    // =====================================================
    // ALBERI
    // =====================================================
    function makeTree(x, z, scale) {
      var tg = new THREE.Group();
      var trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.3, 2, 6),
        new THREE.MeshStandardMaterial({ color: 0x6B4423, roughness: 1 })
      );
      trunk.position.y = 1;
      trunk.castShadow = true;
      tg.add(trunk);
      var treeColors = [0x2E7D32, 0x388E3C, 0x43A047];
      for (var ti = 0; ti < 3; ti++) {
        var crown = new THREE.Mesh(
          new THREE.SphereGeometry(1.2 - ti * 0.15, 8, 8),
          new THREE.MeshStandardMaterial({ color: treeColors[ti], roughness: 1 })
        );
        crown.position.y = 2.2 + ti * 0.7;
        crown.scale.y = 0.85;
        crown.castShadow = true;
        tg.add(crown);
      }
      tg.position.set(x, 0, z);
      tg.scale.setScalar(scale);
      scene.add(tg);
    }
    var treePositions = [
      [-15, 5, 1.2], [-18, -3, 1.5], [-20, 10, 1], [-14, -12, 1.3],
      [15, 5, 1.2], [18, -3, 1.4], [20, 10, 1.1], [14, -14, 1.2],
      [-5, -18, 1.3], [8, -20, 1.2], [-12, -16, 1.1], [16, -18, 1.3],
      [0, 18, 1.4], [-8, 16, 1.2], [10, 17, 1.3]
    ];
    for (var tpi = 0; tpi < treePositions.length; tpi++) {
      var tp = treePositions[tpi];
      makeTree(tp[0], tp[1], tp[2]);
    }

    // Cespugli
    for (var bi = 0; bi < 25; bi++) {
      var bx = (Math.random() - 0.5) * 55;
      var bz = (Math.random() - 0.5) * 55;
      if (Math.abs(bx) < 14 && Math.abs(bz) < 14) continue;
      var bush = new THREE.Mesh(
        new THREE.SphereGeometry(0.35 + Math.random() * 0.3, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0x4CAF50, roughness: 1 })
      );
      bush.position.set(bx, 0.3, bz);
      bush.scale.y = 0.7;
      bush.castShadow = true;
      scene.add(bush);
    }

    // =====================================================
    // RECINZIONE
    // =====================================================
    var fenceMat = new THREE.MeshStandardMaterial({ color: 0xA0522D, roughness: 0.9 });

    function makeFencePost(x, z) {
      var post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.8, 5), fenceMat);
      post.position.set(x, 0.4, z);
      post.castShadow = true;
      scene.add(post);
    }

    function makeFenceRail(x1, z1, x2, z2, y) {
      var dx = x2 - x1;
      var dz = z2 - z1;
      var len = Math.hypot(dx, dz);
      var rail = new THREE.Mesh(new THREE.BoxGeometry(len, 0.08, 0.08), fenceMat);
      rail.position.set((x1 + x2) / 2, y, (z1 + z2) / 2);
      rail.rotation.y = Math.atan2(-dz, dx);
      rail.castShadow = true;
      scene.add(rail);
    }

    function makeFencedArea(minX, maxX, minZ, maxZ) {
      var step = 1.4;
      for (var x = minX; x <= maxX; x += step) {
        makeFencePost(x, minZ);
        makeFencePost(x, maxZ);
      }
      for (var z = minZ; z <= maxZ; z += step) {
        makeFencePost(minX, z);
        makeFencePost(maxX, z);
      }
      makeFenceRail(minX, minZ, maxX, minZ, 0.3);
      makeFenceRail(minX, minZ, maxX, minZ, 0.55);
      makeFenceRail(minX, maxZ, maxX, maxZ, 0.3);
      makeFenceRail(minX, maxZ, maxX, maxZ, 0.55);
      makeFenceRail(minX, minZ, minX, maxZ, 0.3);
      makeFenceRail(minX, minZ, minX, maxZ, 0.55);
      makeFenceRail(maxX, minZ, maxX, maxZ, 0.3);
      makeFenceRail(maxX, minZ, maxX, maxZ, 0.55);
    }

    makeFencedArea(-7, 7, -8, 4);
    makeFencedArea(-4.3, 4.3, -16.3, -9.7);

    // =====================================================
    // GRIGLIA COLTIVAZIONE
    // =====================================================
    var PLOT_SIZE = 8;
    var TILE_SIZE = 1.2;
    var plots = [];
    var matDirt   = new THREE.MeshStandardMaterial({ color: 0x8B5A2B, roughness: 1 });
    var matTilled = new THREE.MeshStandardMaterial({ color: 0x6B4423, roughness: 1 });
    var matWet    = new THREE.MeshStandardMaterial({ color: 0x4a2f15, roughness: 0.7 });
    var matReady  = new THREE.MeshStandardMaterial({ color: 0x5a3a1a, roughness: 0.9 });

    for (var gx = 0; gx < PLOT_SIZE; gx++) {
      for (var gz = 0; gz < PLOT_SIZE; gz++) {
        var px = (gx - PLOT_SIZE / 2 + 0.5) * TILE_SIZE;
        var pz = (gz - PLOT_SIZE / 2 + 0.5) * TILE_SIZE - 2;
        var plotMesh = new THREE.Mesh(
          new THREE.BoxGeometry(TILE_SIZE * 0.93, 0.12, TILE_SIZE * 0.93),
          matDirt
        );
        plotMesh.position.set(px, 0.06, pz);
        plotMesh.receiveShadow = true;
        scene.add(plotMesh);
        plots.push({
          x: px, z: pz, mesh: plotMesh,
          state: 'empty',
          cropType: null,
          watered: false,
          growth: 0,
          cropMesh: null,
          wobble: Math.random() * 6.28
        });
      }
    }

    // =====================================================
    // MERCATO
    // =====================================================
    var MARKET_POS = new THREE.Vector3(-12, 0, -6);
    var SELL_RADIUS = 2.8;

    var marketPad = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, 0.15, 24),
      new THREE.MeshStandardMaterial({ color: 0xC8A94D, roughness: 0.9 })
    );
    marketPad.position.copy(MARKET_POS);
    marketPad.position.y = 0.08;
    marketPad.receiveShadow = true;
    scene.add(marketPad);

    var stall = new THREE.Group();
    var woodMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.9 });
    var darkWood = new THREE.MeshStandardMaterial({ color: 0x5D3A1A, roughness: 0.9 });

    var table = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.15, 1.6), woodMat);
    table.position.y = 1;
    table.castShadow = true;
    table.receiveShadow = true;
    stall.add(table);

    var shelf = new THREE.Mesh(new THREE.BoxGeometry(3, 0.1, 1.4), darkWood);
    shelf.position.y = 0.4;
    shelf.castShadow = true;
    stall.add(shelf);

    for (var li = 0; li < 4; li++) {
      var leg = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1, 0.15), woodMat);
      leg.position.set(li < 2 ? -1.4 : 1.4, 0.5, li % 2 === 0 ? -0.65 : 0.65);
      leg.castShadow = true;
      stall.add(leg);
    }

    for (var si = 0; si < 4; si++) {
      var stripe = new THREE.Mesh(
        new THREE.ConeGeometry(2.8, 1.3, 4, 1, true, si * Math.PI / 2, Math.PI / 2),
        new THREE.MeshStandardMaterial({
          color: si % 2 === 0 ? 0xD32F2F : 0xFFFFFF,
          side: THREE.DoubleSide,
          roughness: 0.9
        })
      );
      stripe.position.y = 2.9;
      stripe.rotation.y = Math.PI / 4;
      stripe.castShadow = true;
      stall.add(stripe);
    }

    for (var sxs = -1; sxs <= 1; sxs += 2) {
      for (var szs = -1; szs <= 1; szs += 2) {
        var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 3.2, 6), woodMat);
        pole.position.set(sxs * 1.5, 1.6, szs * 0.75);
        pole.castShadow = true;
        stall.add(pole);
      }
    }

    stall.position.copy(MARKET_POS);
    stall.position.y = 0.15;
    scene.add(stall);

    var sellZone = new THREE.Mesh(
      new THREE.RingGeometry(SELL_RADIUS - 0.15, SELL_RADIUS, 32),
      new THREE.MeshBasicMaterial({
        color: 0xFFD700, transparent: true, opacity: 0.5, side: THREE.DoubleSide
      })
    );
    sellZone.rotation.x = -Math.PI / 2;
    sellZone.position.copy(MARKET_POS);
    sellZone.position.y = 0.18;
    scene.add(sellZone);

    // =====================================================
    // POZZA
    // =====================================================
    var WELL_POS = new THREE.Vector3(12, 0, -6);
    var WELL_RADIUS = 2;

    var wellBase = new THREE.Mesh(
      new THREE.CylinderGeometry(WELL_RADIUS, WELL_RADIUS + 0.1, 0.7, 20),
      new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 1 })
    );
    wellBase.position.copy(WELL_POS);
    wellBase.position.y = 0.35;
    wellBase.castShadow = true;
    wellBase.receiveShadow = true;
    scene.add(wellBase);

    var wellWater = new THREE.Mesh(
      new THREE.CircleGeometry(WELL_RADIUS - 0.25, 32),
      new THREE.MeshStandardMaterial({
        color: 0x4FC3F7, metalness: 0.4, roughness: 0.15,
        emissive: 0x1565C0, emissiveIntensity: 0.15,
        transparent: true, opacity: 0.92
      })
    );
    wellWater.rotation.x = -Math.PI / 2;
    wellWater.position.copy(WELL_POS);
    wellWater.position.y = 0.7;
    scene.add(wellWater);

    // =====================================================
    // BARRA SAZIETÀ
    // =====================================================
    function createHungerBar() {
      var canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 12;
      var tex = new THREE.CanvasTexture(canvas);
      var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
      var sprite = new THREE.Sprite(mat);
      sprite.scale.set(0.8, 0.15, 1);
      sprite.userData = { canvas: canvas, ctx: canvas.getContext('2d'), tex: tex };
      return sprite;
    }

    function updateHungerBar(sprite, value) {
      var ctx = sprite.userData.ctx;
      var tex = sprite.userData.tex;
      ctx.clearRect(0, 0, 64, 12);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, 64, 12);
      var w = Math.max(0, Math.min(1, value)) * 60;
      var color = value > 0.5 ? '#4CAF50' : value > 0.2 ? '#FFA726' : '#F44336';
      ctx.fillStyle = color;
      ctx.fillRect(2, 2, w, 8);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(1, 1, 62, 10);
      tex.needsUpdate = true;
    }

    // =====================================================
    // GALLINE
    // =====================================================
    var chickens = [];
    var CHICKEN_AREA = { x1: -5, x2: 5, z1: 6, z2: 12 };

    function makeChicken(x, z) {
      var c = new THREE.Group();
      var bodyMat = new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.9 });

      var body = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 10), bodyMat);
      body.scale.set(1, 0.85, 1.2);
      body.position.y = 0.35;
      body.castShadow = true;
      c.add(body);

      var headGroup = new THREE.Group();
      var head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), bodyMat);
      head.castShadow = true;
      headGroup.add(head);

      var combMat = new THREE.MeshStandardMaterial({ color: 0xE53935, roughness: 0.8 });
      for (var i = 0; i < 3; i++) {
        var comb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 4), combMat);
        comb.position.set(0, 0.12 + i * 0.03, -0.03 + i * 0.04);
        comb.scale.set(0.5, 1.2, 1);
        headGroup.add(comb);
      }
      var wattle = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), combMat);
      wattle.position.set(0, -0.12, 0.14);
      wattle.scale.set(0.5, 1.2, 0.8);
      headGroup.add(wattle);

      var beak = new THREE.Mesh(
        new THREE.ConeGeometry(0.06, 0.12, 4),
        new THREE.MeshStandardMaterial({ color: 0xFFA726 })
      );
      beak.position.set(0, -0.04, 0.17);
      beak.rotation.x = Math.PI / 2;
      headGroup.add(beak);

      var eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
      for (var s = -1; s <= 1; s += 2) {
        var eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 6, 4), eyeMat);
        eye.position.set(s * 0.09, 0.03, 0.12);
        headGroup.add(eye);
      }

      headGroup.position.set(0, 0.62, 0.28);
      c.add(headGroup);

      var legMat = new THREE.MeshStandardMaterial({ color: 0xFFA726 });
      for (var s2 = -1; s2 <= 1; s2 += 2) {
        var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.25, 4), legMat);
        leg.position.set(s2 * 0.09, 0.12, 0);
        c.add(leg);
      }

      var tail = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 4), bodyMat);
      tail.position.set(0, 0.42, -0.32);
      tail.rotation.x = -0.5;
      c.add(tail);

      var hungerBar = createHungerBar();
      hungerBar.position.y = 1.2;
      c.add(hungerBar);

      c.position.set(x, 0, z);
      c.rotation.y = Math.random() * Math.PI * 2;
      c.userData = {
        type: 'chicken',
        targetX: x, targetZ: z,
        speed: 0.6 + Math.random() * 0.6,
        pauseTime: Math.random() * 2,
        peckTime: 0,
        hunger: 0,
        produceTimer: 0,
        products: 0,
        headGroup: headGroup,
        hungerBar: hungerBar,
        productMesh: null
      };
      scene.add(c);
      chickens.push(c);
    }

    for (var chi = 0; chi < 5; chi++) {
      makeChicken(
        CHICKEN_AREA.x1 + Math.random() * (CHICKEN_AREA.x2 - CHICKEN_AREA.x1),
        CHICKEN_AREA.z1 + Math.random() * (CHICKEN_AREA.z2 - CHICKEN_AREA.z1)
      );
    }

    // =====================================================
    // MAIALI
    // =====================================================
    var pigs = [];
    var PIG_AREA = { x1: -4, x2: 4, z1: -16, z2: -10 };

    function makePig(x, z) {
      var p = new THREE.Group();
      var pinkMat = new THREE.MeshStandardMaterial({ color: 0xF48FB1, roughness: 0.85 });
      var darkPink = new THREE.MeshStandardMaterial({ color: 0xD81B60, roughness: 0.8 });
      var snoutMat = new THREE.MeshStandardMaterial({ color: 0xEC407A, roughness: 0.8 });

      var body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), pinkMat);
      body.scale.set(1.1, 0.9, 1.5);
      body.position.y = 0.55;
      body.castShadow = true;
      p.add(body);

      var head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), pinkMat);
      head.position.set(0, 0.6, 0.72);
      head.castShadow = true;
      p.add(head);

      var snout = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.14, 0.1, 10), snoutMat);
      snout.rotation.x = Math.PI / 2;
      snout.position.set(0, 0.55, 0.98);
      p.add(snout);

      for (var s = -1; s <= 1; s += 2) {
        var nostril = new THREE.Mesh(
          new THREE.SphereGeometry(0.02, 5, 4),
          new THREE.MeshStandardMaterial({ color: 0x880E4F })
        );
        nostril.position.set(s * 0.04, 0.55, 1.03);
        p.add(nostril);
      }

      var eyeMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
      for (var s2 = -1; s2 <= 1; s2 += 2) {
        var eye = new THREE.Mesh(new THREE.SphereGeometry(0.04, 6, 4), eyeMat);
        eye.position.set(s2 * 0.14, 0.72, 0.92);
        p.add(eye);
      }

      for (var s3 = -1; s3 <= 1; s3 += 2) {
        var ear = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 4), darkPink);
        ear.position.set(s3 * 0.2, 0.9, 0.7);
        ear.rotation.z = s3 * 0.3;
        ear.rotation.x = -0.3;
        p.add(ear);
      }

      for (var sx = -1; sx <= 1; sx += 2) {
        for (var sz = -1; sz <= 1; sz += 2) {
          var leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.35, 6), pinkMat);
          leg.position.set(sx * 0.28, 0.17, sz * 0.4);
          leg.castShadow = true;
          p.add(leg);
        }
      }

      var tailCurve = new THREE.TorusGeometry(0.08, 0.025, 6, 12, Math.PI * 1.8);
      var tail = new THREE.Mesh(tailCurve, darkPink);
      tail.position.set(0, 0.65, -0.78);
      tail.rotation.y = Math.PI / 2;
      p.add(tail);

      var hungerBar = createHungerBar();
      hungerBar.position.y = 1.5;
      hungerBar.scale.set(1, 0.18, 1);
      p.add(hungerBar);

      p.position.set(x, 0, z);
      p.rotation.y = Math.random() * Math.PI * 2;
      p.userData = {
        type: 'pig',
        targetX: x, targetZ: z,
        speed: 0.4 + Math.random() * 0.3,
        pauseTime: Math.random() * 3,
        hunger: 0,
        produceTimer: 0,
        products: 0,
        hungerBar: hungerBar,
        productMesh: null
      };
      scene.add(p);
      pigs.push(p);
    }

    for (var pi = 0; pi < 3; pi++) {
      makePig(
        PIG_AREA.x1 + Math.random() * (PIG_AREA.x2 - PIG_AREA.x1),
        PIG_AREA.z1 + Math.random() * (PIG_AREA.z2 - PIG_AREA.z1)
      );
    }

    // =====================================================
    // STATO
    // =====================================================
    var state = {
      wheat: 0,
      corn: 0,
      carrot: 0,
      eggs: 0,
      meat: 0,
      money: 20,
      water: WATER_MAX,
      tool: 'hoe',
      selectedSeed: 'wheat',
      yaw: 0,
      pitch: 0,
      inSellZone: false,
      marketOpen: false
    };

    var player = { x: 0, z: 8 };

    // =====================================================
    // SALVATAGGIO
    // =====================================================
    var saveIndicator = document.getElementById('saveIndicator');
    var saveIndicatorTimer = null;

    function showSaveIndicator() {
      saveIndicator.textContent = '💾 Salvato';
      saveIndicator.style.opacity = '1';
      if (saveIndicatorTimer) clearTimeout(saveIndicatorTimer);
      saveIndicatorTimer = setTimeout(function () {
        saveIndicator.style.opacity = '0';
      }, 1200);
    }

    function saveGame() {
      try {
        var saveData = {
          version: 3,
          timestamp: Date.now(),
          state: {
            wheat: state.wheat,
            corn: state.corn,
            carrot: state.carrot,
            eggs: state.eggs,
            meat: state.meat,
            money: state.money,
            water: state.water,
            playerX: player.x,
            playerZ: player.z,
            yaw: state.yaw,
            pitch: state.pitch,
            tool: state.tool,
            selectedSeed: state.selectedSeed
          },
          plots: plots.map(function (p) {
            return {
              state: p.state,
              cropType: p.cropType,
              watered: p.watered,
              growth: p.growth
            };
          }),
          chickens: chickens.map(function (c) {
            return {
              x: c.position.x, z: c.position.z, rotY: c.rotation.y,
              hunger: c.userData.hunger,
              produceTimer: c.userData.produceTimer,
              products: c.userData.products,
              targetX: c.userData.targetX,
              targetZ: c.userData.targetZ,
              pauseTime: c.userData.pauseTime
            };
          }),
          pigs: pigs.map(function (p) {
            return {
              x: p.position.x, z: p.position.z, rotY: p.rotation.y,
              hunger: p.userData.hunger,
              produceTimer: p.userData.produceTimer,
              products: p.userData.products,
              targetX: p.userData.targetX,
              targetZ: p.userData.targetZ,
              pauseTime: p.userData.pauseTime
            };
          })
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(saveData));
        showSaveIndicator();
      } catch (e) {
        console.warn('Errore salvataggio:', e);
      }
    }

    function loadGame() {
      try {
        var raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return false;
        var data = JSON.parse(raw);
        if (!data || data.version !== 3) return false;

        var s = data.state;
        state.wheat = s.wheat || 0;
        state.corn = s.corn || 0;
        state.carrot = s.carrot || 0;
        state.eggs = s.eggs || 0;
        state.meat = s.meat || 0;
        state.money = s.money !== undefined ? s.money : 20;
        state.water = s.water !== undefined ? s.water : WATER_MAX;
        state.yaw = s.yaw || 0;
        state.pitch = s.pitch || 0;
        state.tool = s.tool || 'hoe';
        state.selectedSeed = s.selectedSeed || 'wheat';
        player.x = s.playerX || 0;
        player.z = s.playerZ || 8;

        if (data.plots && data.plots.length === plots.length) {
          for (var i = 0; i < plots.length; i++) {
            var plot = plots[i];
            var saved = data.plots[i];
            plot.state = saved.state;
            plot.cropType = saved.cropType;
            plot.watered = saved.watered;
            plot.growth = saved.growth;
            if (plot.state === 'empty') plot.mesh.material = matDirt;
            else if (plot.state === 'tilled') plot.mesh.material = matTilled;
            else if (plot.state === 'planted') {
              plot.mesh.material = plot.watered ? matWet : matTilled;
              createCrop(plot);
              var prog = Math.min(plot.growth / CROPS[plot.cropType].growTime, 1);
              plot.cropMesh.scale.setScalar(0.25 + prog * 0.75);
            } else if (plot.state === 'grown') {
              plot.mesh.material = matReady;
              createCrop(plot);
              plot.cropMesh.scale.setScalar(1);
              growCrop(plot);
            }
          }
        }

        if (data.chickens && data.chickens.length === chickens.length) {
          for (var ci2 = 0; ci2 < chickens.length; ci2++) {
            var c = chickens[ci2];
            var sc = data.chickens[ci2];
            c.position.x = sc.x;
            c.position.z = sc.z;
            c.rotation.y = sc.rotY;
            c.userData.hunger = sc.hunger || 0;
            c.userData.produceTimer = sc.produceTimer || 0;
            c.userData.products = sc.products || 0;
            c.userData.targetX = sc.targetX;
            c.userData.targetZ = sc.targetZ;
            c.userData.pauseTime = sc.pauseTime || 0;
            updateHungerBar(c.userData.hungerBar, c.userData.hunger);
            if (c.userData.products > 0) showProduct(c);
          }
        }

        if (data.pigs && data.pigs.length === pigs.length) {
          for (var pi2 = 0; pi2 < pigs.length; pi2++) {
            var p = pigs[pi2];
            var sp = data.pigs[pi2];
            p.position.x = sp.x;
            p.position.z = sp.z;
            p.rotation.y = sp.rotY;
            p.userData.hunger = sp.hunger || 0;
            p.userData.produceTimer = sp.produceTimer || 0;
            p.userData.products = sp.products || 0;
            p.userData.targetX = sp.targetX;
            p.userData.targetZ = sp.targetZ;
            p.userData.pauseTime = sp.pauseTime || 0;
            updateHungerBar(p.userData.hungerBar, p.userData.hunger);
            if (p.userData.products > 0) showProduct(p);
          }
        }

        selectTool(state.tool);
        updateSeedIcon();
        updateHUD();
        return true;
      } catch (e) {
        console.warn('Errore caricamento:', e);
        return false;
      }
    }

    setInterval(saveGame, AUTOSAVE_INTERVAL * 1000);
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) saveGame();
    });
    window.addEventListener('pagehide', saveGame);
    window.addEventListener('beforeunload', saveGame);

    // =====================================================
    // INPUT CAMERA
    // =====================================================
    var touchLookId = null, lastTouchX = 0, lastTouchY = 0;
    var canvas = renderer.domElement;

    canvas.addEventListener('touchstart', function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (touchLookId === null) {
          touchLookId = t.identifier;
          lastTouchX = t.clientX;
          lastTouchY = t.clientY;
        }
      }
    }, { passive: false });

    canvas.addEventListener('touchmove', function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === touchLookId) {
          state.yaw -= (t.clientX - lastTouchX) * 0.005 * settings.sensitivity;
          state.pitch -= (t.clientY - lastTouchY) * 0.005 * settings.sensitivity;
          state.pitch = Math.max(-1.4, Math.min(1.4, state.pitch));
          lastTouchX = t.clientX;
          lastTouchY = t.clientY;
        }
      }
    }, { passive: false });

    canvas.addEventListener('touchend', function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === touchLookId) touchLookId = null;
      }
    });

    var mouseDown = false;
    canvas.addEventListener('mousedown', function (e) {
      mouseDown = true;
      lastTouchX = e.clientX;
      lastTouchY = e.clientY;
    });
    canvas.addEventListener('mouseup', function () { mouseDown = false; });
    canvas.addEventListener('mousemove', function (e) {
      if (mouseDown) {
        state.yaw -= (e.clientX - lastTouchX) * 0.005 * settings.sensitivity;
        state.pitch -= (e.clientY - lastTouchY) * 0.005 * settings.sensitivity;
        state.pitch = Math.max(-1.4, Math.min(1.4, state.pitch));
        lastTouchX = e.clientX;
        lastTouchY = e.clientY;
      }
    });

    var keys = {};
    window.addEventListener('keydown', function (e) { keys[e.key.toLowerCase()] = true; });
    window.addEventListener('keyup', function (e) { keys[e.key.toLowerCase()] = false; });

    // =====================================================
    // JOYSTICK
    // =====================================================
    var joyEl = document.getElementById('joy');
    var stickEl = document.getElementById('stick');
    var joyActive = false;
    var joyVector = { x: 0, y: 0 };
    var joyTouchId = null;
    var joyCenterFixed = { x: 0, y: 0 };

    function refreshJoyCenter() {
      var rect = joyEl.getBoundingClientRect();
      joyCenterFixed.x = rect.left + rect.width / 2;
      joyCenterFixed.y = rect.top + rect.height / 2;
    }
    refreshJoyCenter();
    window.addEventListener('resize', refreshJoyCenter);
    window.addEventListener('scroll', refreshJoyCenter);
    setTimeout(refreshJoyCenter, 100);

    function updateJoy(cx, cy) {
      var dx = cx - joyCenterFixed.x;
      var dy = cy - joyCenterFixed.y;
      var maxRadius = (settings.joySize / 2) - 8;
      var dist = Math.hypot(dx, dy);

      var clampedX = dx, clampedY = dy;
      if (dist > maxRadius) {
        var angle = Math.atan2(dy, dx);
        clampedX = Math.cos(angle) * maxRadius;
        clampedY = Math.sin(angle) * maxRadius;
      }
      stickEl.style.transform = 'translate(calc(-50% + ' + clampedX + 'px), calc(-50% + ' + clampedY + 'px))';

      var clampedDist = Math.min(dist, maxRadius);
      var normalized = clampedDist / maxRadius;

      if (normalized < JOY_DEAD_ZONE) {
        joyVector.x = 0;
        joyVector.y = 0;
      } else {
        var adjustedNorm = (normalized - JOY_DEAD_ZONE) / (1 - JOY_DEAD_ZONE);
        var a = Math.atan2(dy, dx);
        joyVector.x = Math.cos(a) * adjustedNorm;
        joyVector.y = Math.sin(a) * adjustedNorm;
      }
    }

    function releaseJoy() {
      joyActive = false;
      joyTouchId = null;
      joyVector.x = 0;
      joyVector.y = 0;
      stickEl.style.transition = 'transform 0.15s ease-out';
      stickEl.style.transform = 'translate(-50%,-50%)';
      setTimeout(function () { stickEl.style.transition = ''; }, 160);
    }

    joyEl.addEventListener('touchstart', function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (joyActive) return;
      var t = e.changedTouches[0];
      joyTouchId = t.identifier;
      refreshJoyCenter();
      joyActive = true;
      stickEl.style.transition = 'none';
      updateJoy(t.clientX, t.clientY);
    }, { passive: false });

    joyEl.addEventListener('touchmove', function (e) {
      e.preventDefault();
      e.stopPropagation();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === joyTouchId) {
          updateJoy(t.clientX, t.clientY);
          break;
        }
      }
    }, { passive: false });

    joyEl.addEventListener('touchend', function (e) {
      e.preventDefault();
      e.stopPropagation();
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === joyTouchId) {
          releaseJoy();
          break;
        }
      }
    }, { passive: false });

    joyEl.addEventListener('touchcancel', function (e) {
      for (var i = 0; i < e.changedTouches.length; i++) {
        var t = e.changedTouches[i];
        if (t.identifier === joyTouchId) {
          releaseJoy();
          break;
        }
      }
    });

    var joyMouseDown = false;
    joyEl.addEventListener('mousedown', function (e) {
      e.preventDefault();
      joyMouseDown = true;
      refreshJoyCenter();
      joyActive = true;
      stickEl.style.transition = 'none';
      updateJoy(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', function (e) {
      if (joyMouseDown) updateJoy(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', function () {
      if (joyMouseDown) {
        joyMouseDown = false;
        releaseJoy();
      }
    });

    // =====================================================
    // PULSANTE AZIONE
    // =====================================================
    var actionBtn = document.getElementById('actionBtn');
    actionBtn.addEventListener('touchstart', function (e) {
      e.stopPropagation();
      e.preventDefault();
      doAction();
    }, { passive: false });
    actionBtn.addEventListener('click', function (e) {
      e.preventDefault();
      doAction();
    });

    // =====================================================
    // TOOLBAR
    // =====================================================
    var seedPanel = document.getElementById('seedPanel');
    var seedIcon = document.getElementById('seedIcon');

    var toolElements = document.querySelectorAll('.tool');
    for (var ti2 = 0; ti2 < toolElements.length; ti2++) {
      (function (el) {
        var t = el.dataset.tool;
        el.addEventListener('touchstart', function (e) {
          e.preventDefault();
          e.stopPropagation();
          selectTool(t);
        }, { passive: false });
        el.addEventListener('click', function (e) {
          e.preventDefault();
          selectTool(t);
        });
      })(toolElements[ti2]);
    }

    function selectTool(tool) {
      state.tool = tool;
      for (var i = 0; i < toolElements.length; i++) {
        toolElements[i].classList.toggle('active', toolElements[i].dataset.tool === tool);
      }
      if (tool === 'seed') {
        seedPanel.classList.add('open');
        updateSeedAvailability();
      } else {
        seedPanel.classList.remove('open');
      }
      updateActionBtn();
    }

    function updateSeedIcon() {
      seedIcon.textContent = CROPS[state.selectedSeed].icon;
    }

    function updateSeedAvailability() {
      var cards = document.querySelectorAll('.seedCard');
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var seedType = card.dataset.seed;
        var cost = CROPS[seedType].cost;
        var selected = state.selectedSeed === seedType;
        card.classList.toggle('selected', selected);
        card.classList.toggle('unaffordable', state.money < cost);
      }
    }

    var seedCards = document.querySelectorAll('.seedCard');
    for (var sci = 0; sci < seedCards.length; sci++) {
      (function (card) {
        var seedType = card.dataset.seed;
        card.addEventListener('touchstart', function (e) {
          e.preventDefault();
          e.stopPropagation();
          state.selectedSeed = seedType;
          updateSeedIcon();
          updateSeedAvailability();
        }, { passive: false });
        card.addEventListener('click', function (e) {
          e.preventDefault();
          state.selectedSeed = seedType;
          updateSeedIcon();
          updateSeedAvailability();
        });
      })(seedCards[sci]);
    }

    function updateActionBtn() {
      var names = {
        hoe: 'ZAPPA',
        seed: 'SEMINA',
        water: 'ANNAFFIA',
        harvest: 'RACCOGLI',
        feed: 'NUTRI'
      };
      var colors = {
        hoe: '#8B5A2B',
        seed: '#E8C860',
        water: '#2196F3',
        harvest: '#4CAF50',
        feed: '#FF9800'
      };
      actionBtn.textContent = names[state.tool];
      actionBtn.style.background = 'linear-gradient(135deg, ' + colors[state.tool] + ', ' + shade(colors[state.tool], -20) + ')';
      actionBtn.style.color = state.tool === 'seed' ? '#333' : '#fff';
    }

    function shade(hex, amt) {
      var n = parseInt(hex.slice(1), 16);
      var r = Math.max(0, Math.min(255, (n >> 16) + amt));
      var g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
      var b = Math.max(0, Math.min(255, (n & 0xff) + amt));
      var hexStr = ((r << 16) | (g << 8) | b).toString(16);
      while (hexStr.length < 6) hexStr = '0' + hexStr;
      return '#' + hexStr;
    }

    // =====================================================
    // UI IMPOSTAZIONI
    // =====================================================
    var gearBtn = document.getElementById('gearBtn');
    var settingsPanel = document.getElementById('settings');
    var sensSlider = document.getElementById('sensSlider');
    var sensVal = document.getElementById('sensVal');
    var joySlider = document.getElementById('joySlider');
    var joyVal = document.getElementById('joyVal');
    var previewJoy = document.getElementById('previewJoy');
    var closeSettings = document.getElementById('closeSettings');
    var resetSave = document.getElementById('resetSave');

    sensSlider.value = Math.round(settings.sensitivity * 100);
    sensVal.textContent = Math.round(settings.sensitivity * 100) + '%';
    joySlider.value = settings.joySize;
    joyVal.textContent = settings.joySize + 'px';
    previewJoy.style.width = settings.joySize + 'px';
    previewJoy.style.height = settings.joySize + 'px';

    gearBtn.addEventListener('click', function () { settingsPanel.classList.add('open'); });
    gearBtn.addEventListener('touchstart', function (e) {
      e.preventDefault();
      settingsPanel.classList.add('open');
    }, { passive: false });

    closeSettings.addEventListener('click', function () { settingsPanel.classList.remove('open'); });
    closeSettings.addEventListener('touchstart', function (e) {
      e.preventDefault();
      settingsPanel.classList.remove('open');
    }, { passive: false });

    sensSlider.addEventListener('input', function (e) {
      settings.sensitivity = parseInt(e.target.value) / 100;
      sensVal.textContent = e.target.value + '%';
      localStorage.setItem('farm_sens', settings.sensitivity);
    });

    joySlider.addEventListener('input', function (e) {
      settings.joySize = parseInt(e.target.value);
      joyVal.textContent = settings.joySize + 'px';
      document.getElementById('joy').style.width = settings.joySize + 'px';
      document.getElementById('joy').style.height = settings.joySize + 'px';
      previewJoy.style.width = settings.joySize + 'px';
      previewJoy.style.height = settings.joySize + 'px';
      localStorage.setItem('farm_joysize', settings.joySize);
      setTimeout(refreshJoyCenter, 220);
    });

    resetSave.addEventListener('click', function () {
      if (confirm('Cancellare la partita salvata? Questa azione è irreversibile.')) {
        localStorage.removeItem(SAVE_KEY);
        location.reload();
      }
    });

    // =====================================================
    // UI MERCATO
    // =====================================================
    var marketUI = document.getElementById('marketUI');
    var marketProducts = document.getElementById('marketProducts');
    var totalEarn = document.getElementById('totalEarn');
    var confirmSale = document.getElementById('confirmSale');
    var cancelSale = document.getElementById('cancelSale');

    var saleSelection = { wheat: 0, corn: 0, carrot: 0, eggs: 0, meat: 0 };
    var PRODUCT_META = {
      wheat:  { icon: '🌾', name: 'Grano' },
      corn:   { icon: '🌽', name: 'Mais' },
      carrot: { icon: '🥕', name: 'Carota' },
      eggs:   { icon: '🥚', name: 'Uova' },
      meat:   { icon: '🥩', name: 'Carne' }
    };
    var PRODUCT_KEYS = ['wheat', 'corn', 'carrot', 'eggs', 'meat'];

    function openMarket() {
      if (state.marketOpen) return;
      state.marketOpen = true;
      saleSelection = { wheat: 0, corn: 0, carrot: 0, eggs: 0, meat: 0 };
      renderMarket();
      marketUI.classList.add('open');
    }

    function closeMarket() {
      state.marketOpen = false;
      marketUI.classList.remove('open');
    }

    function renderMarket() {
      marketProducts.innerHTML = '';
      var total = 0;
      for (var i = 0; i < PRODUCT_KEYS.length; i++) {
        var key = PRODUCT_KEYS[i];
        var qty = state[key];
        var price = PRICES[key];
        var meta = PRODUCT_META[key];
        var sel = saleSelection[key];
        total += sel * price;

        var div = document.createElement('div');
        div.className = 'product';
        div.innerHTML =
          '<div class="icon">' + meta.icon + '</div>' +
          '<div class="info">' +
            '<div class="name">' + meta.name + '</div>' +
            '<div class="price">' + price + '💰 / unità</div>' +
            '<div class="qty">Hai: ' + qty + '</div>' +
          '</div>' +
          '<div class="controls">' +
            '<button data-act="minus" data-key="' + key + '"' + (sel <= 0 ? ' disabled' : '') + '>−</button>' +
            '<div class="count">' + sel + '</div>' +
            '<button data-act="plus" data-key="' + key + '"' + (sel >= qty ? ' disabled' : '') + '>+</button>' +
          '</div>';
        marketProducts.appendChild(div);
      }
      for (var j = 0; j < PRODUCT_KEYS.length; j++) {
        var k = PRODUCT_KEYS[j];
        if (state[k] > 0 && saleSelection[k] < state[k]) {
          (function (key) {
            var btn = document.createElement('button');
            btn.className = 'sellAllBtn';
            btn.textContent = 'Vendi tutti ' + PRODUCT_META[key].name.toLowerCase();
            btn.addEventListener('click', function () {
              saleSelection[key] = state[key];
              renderMarket();
            });
            marketProducts.appendChild(btn);
          })(k);
        }
      }
      totalEarn.textContent = total;
      confirmSale.disabled = total <= 0;
      confirmSale.textContent = total > 0 ? 'Vendi (' + total + '💰)' : 'Nessuna selezione';
    }

    marketProducts.addEventListener('click', function (e) {
      var btn = e.target.closest('button');
      if (!btn || !btn.dataset.act) return;
      var key = btn.dataset.key;
      if (btn.dataset.act === 'plus') {
        if (saleSelection[key] < state[key]) saleSelection[key]++;
      } else if (btn.dataset.act === 'minus') {
        if (saleSelection[key] > 0) saleSelection[key]--;
      }
      renderMarket();
    });

    confirmSale.addEventListener('click', function () {
      var total = 0;
      for (var i = 0; i < PRODUCT_KEYS.length; i++) {
        var key = PRODUCT_KEYS[i];
        var sel = saleSelection[key];
        if (sel > 0) {
          state[key] -= sel;
          total += sel * PRICES[key];
        }
      }
      state.money += total;
      updateHUD();
      flash();
      showInfo('💰 +' + total + '€ incassati!');
      closeMarket();
      saveGame();
    });

    cancelSale.addEventListener('click', closeMarket);

    // =====================================================
    // HUD
    // =====================================================
    function updateHUD() {
      document.getElementById('wheat').textContent = state.wheat;
      document.getElementById('corn').textContent = state.corn;
      document.getElementById('carrot').textContent = state.carrot;
      document.getElementById('eggs').textContent = state.eggs;
      document.getElementById('meat').textContent = state.meat;
      document.getElementById('money').textContent = state.money;
      document.getElementById('water').textContent = state.water;
    }

    var infoTimer = null;
    function showInfo(text, dur) {
      var el = document.getElementById('info');
      el.textContent = text;
      el.style.opacity = '1';
      if (infoTimer) clearTimeout(infoTimer);
      infoTimer = setTimeout(function () { el.style.opacity = '0'; }, dur || 2500);
    }

    function flash() {
      var f = document.getElementById('flash');
      f.style.opacity = '0.25';
      setTimeout(function () { f.style.opacity = '0'; }, 80);
    }

    // =====================================================
    // RAYCAST
    // =====================================================
    var raycaster = new THREE.Raycaster();
    var center = new THREE.Vector2(0, 0);

    function getTargetPlot() {
      raycaster.setFromCamera(center, camera);
      raycaster.far = 6;
      var meshes = plots.map(function (p) { return p.mesh; });
      var hits = raycaster.intersectObjects(meshes, false);
      if (hits.length > 0) {
        for (var i = 0; i < plots.length; i++) {
          if (plots[i].mesh === hits[0].object) return plots[i];
        }
      }
      return null;
    }

    function getTargetAnimal() {
      raycaster.setFromCamera(center, camera);
      raycaster.far = 5;
      var all = chickens.concat(pigs);
      var hits = raycaster.intersectObjects(all, true);
      if (hits.length > 0) {
        var obj = hits[0].object;
        while (obj.parent && obj.parent !== scene) obj = obj.parent;
        for (var i = 0; i < all.length; i++) {
          if (all[i] === obj) return all[i];
        }
      }
      return null;
    }

    // =====================================================
    // AZIONE
    // =====================================================
    function doAction() {
      if (state.marketOpen) return;

      if (state.tool === 'feed') {
        var animal = getTargetAnimal();
        if (!animal) { showInfo('Mira un animale per nutrirlo 🍽️'); return; }
        if (state.wheat < 1) { showInfo('Non hai grano per nutrire! 🌾'); return; }
        if (animal.userData.hunger >= 0.95) { showInfo('Già sazio! 🍽️'); return; }
        state.wheat--;
        animal.userData.hunger = 1;
        animal.userData.produceTimer = 0;
        updateHUD();
        flash();
        var what = animal.userData.type === 'chicken' ? 'gallina' : 'maiale';
        showInfo('🌾 Hai nutrito la ' + what + '! Produrrà presto');
        saveGame();
        return;
      }

      if (state.tool === 'water' && state.water < WATER_MAX) {
        var dw = camera.position.distanceTo(WELL_POS);
        if (dw < WELL_RADIUS + 1.5) {
          state.water = WATER_MAX;
          showInfo('💧 Acqua riempita!');
          updateHUD();
          flash();
          return;
        }
      }

      if (state.tool === 'harvest') {
        var animal2 = getTargetAnimal();
        if (animal2 && animal2.userData.products > 0) {
          var type = animal2.userData.type;
          var count = animal2.userData.products;
          if (type === 'chicken') {
            state.eggs += count;
            showInfo('🥚 +' + count + ' uova raccolte!');
          } else {
            state.meat += count;
            showInfo('🥩 +' + count + ' carne raccolta!');
          }
          animal2.userData.products = 0;
          if (animal2.userData.productMesh) {
            animal2.remove(animal2.userData.productMesh);
            animal2.userData.productMesh = null;
          }
          updateHUD();
          flash();
          saveGame();
          return;
        }
      }

      var plot = getTargetPlot();
      if (!plot) {
        showInfo('Troppo lontano! Avvicinati e mira il terreno');
        return;
      }

      if (state.tool === 'hoe') {
        if (plot.state === 'empty') {
          plot.state = 'tilled';
          plot.mesh.material = matTilled;
          showInfo('Terreno zappato! Ora semina 🌱');
          flash();
        } else if (plot.state === 'grown') {
          showInfo('Prima raccogli! 🧺');
        } else {
          showInfo('Già zappato');
        }
      } else if (state.tool === 'seed') {
        if (plot.state === 'tilled') {
          var crop = CROPS[state.selectedSeed];
          if (crop.cost > 0 && state.money < crop.cost) {
            showInfo('Servono ' + crop.cost + '💰 per i semi di ' + crop.name.toLowerCase() + '!');
            return;
          }
          if (crop.cost > 0) {
            state.money -= crop.cost;
            showInfo('Piantato ' + crop.name.toLowerCase() + '! (-' + crop.cost + '💰)');
          } else {
            showInfo('Piantato ' + crop.name.toLowerCase() + '!');
          }
          plot.state = 'planted';
          plot.cropType = state.selectedSeed;
          plot.growth = 0;
          plot.watered = false;
          createCrop(plot);
          updateHUD();
          updateSeedAvailability();
          flash();
        } else if (plot.state === 'empty') {
          showInfo('Prima zappa il terreno ⛏️');
        } else if (plot.state === 'planted') {
          showInfo('Già piantato qui');
        } else {
          showInfo('Raccogli prima! 🧺');
        }
      } else if (state.tool === 'water') {
        if (plot.state === 'planted' && !plot.watered) {
          if (state.water <= 0) {
            showInfo('Acqua finita! Vai alla pozza 💧');
            return;
          }
          plot.watered = true;
          state.water--;
          plot.mesh.material = matWet;
          updateHUD();
          flash();
          showInfo('Annaffiato! ⏳');
        } else if (plot.state === 'planted' && plot.watered) {
          showInfo('Già annaffiato');
        } else {
          showInfo('Niente da annaffiare');
        }
      } else if (state.tool === 'harvest') {
        if (plot.state === 'grown') {
          var cropType = plot.cropType;
          var crop2 = CROPS[cropType];
          state[cropType]++;
          removeCrop(plot);
          plot.state = 'tilled';
          plot.cropType = null;
          plot.mesh.material = matTilled;
          updateHUD();
          flash();
          showInfo(crop2.icon + ' ' + crop2.name + ' raccolto! Totale: ' + state[cropType]);
          saveGame();
        } else if (plot.state === 'planted') {
          showInfo('Non ancora maturo! ⏳');
        } else {
          showInfo('Niente da raccogliere qui');
        }
      }
    }

    // =====================================================
    // COLTURE
    // =====================================================
    function createCrop(plot) {
      var crop = CROPS[plot.cropType];
      var g = new THREE.Group();
      var stemMat = new THREE.MeshStandardMaterial({ color: crop.stemColor, roughness: 0.8 });

      for (var i = 0; i < crop.plantCount; i++) {
        var angle = Math.random() * Math.PI * 2;
        var r = Math.random() * 0.5;
        var stemH = crop.headType === 'corn' ? 0.7 : 0.5;
        var stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.04, stemH, 4),
          stemMat
        );
        stem.position.set(Math.cos(angle) * r, stemH / 2, Math.sin(angle) * r);
        stem.castShadow = true;
        g.add(stem);
      }

      g.position.set(plot.x, 0.12, plot.z);
      g.scale.setScalar(0.25);
      scene.add(g);
      plot.cropMesh = g;
    }

    function growCrop(plot) {
      var crop = CROPS[plot.cropType];
      while (plot.cropMesh.children.length > 0) {
        plot.cropMesh.remove(plot.cropMesh.children[0]);
      }

      var matureStemMat = new THREE.MeshStandardMaterial({ color: crop.matureStemColor, roughness: 0.8 });
      var headMat = new THREE.MeshStandardMaterial({ color: crop.headColor, roughness: 0.6 });

      for (var i = 0; i < crop.plantCount; i++) {
        var angle = Math.random() * Math.PI * 2;
        var r = Math.random() * 0.5;
        var stemH = crop.headType === 'corn' ? 0.8 : crop.headType === 'root' ? 0.35 : 0.6;
        var stem = new THREE.Mesh(
          new THREE.CylinderGeometry(0.025, 0.04, stemH, 4),
          matureStemMat
        );
        stem.position.set(Math.cos(angle) * r, stemH / 2, Math.sin(angle) * r);
        stem.castShadow = true;
        plot.cropMesh.add(stem);

        if (crop.headType === 'spike') {
          var spike = new THREE.Mesh(
            new THREE.SphereGeometry(crop.headSize, 6, 6),
            headMat
          );
          spike.position.set(Math.cos(angle) * r, stemH + 0.08, Math.sin(angle) * r);
          spike.scale.y = 1.8;
          spike.castShadow = true;
          plot.cropMesh.add(spike);
        } else if (crop.headType === 'corn') {
          var cob = new THREE.Mesh(
            new THREE.CylinderGeometry(0.1, 0.08, 0.3, 8),
            headMat
          );
          cob.position.set(Math.cos(angle) * r, stemH - 0.15, Math.sin(angle) * r);
          cob.castShadow = true;
          plot.cropMesh.add(cob);
          for (var j = 0; j < 3; j++) {
            var leaf = new THREE.Mesh(
              new THREE.ConeGeometry(0.08, 0.35, 4),
              matureStemMat
            );
            leaf.position.set(
              Math.cos(angle) * r + Math.cos(j * 2.1) * 0.12,
              stemH - 0.1,
              Math.sin(angle) * r + Math.sin(j * 2.1) * 0.12
            );
            leaf.rotation.z = (Math.random() - 0.5) * 0.8;
            plot.cropMesh.add(leaf);
          }
        } else if (crop.headType === 'root') {
          var root = new THREE.Mesh(
            new THREE.ConeGeometry(0.1, 0.25, 6),
            headMat
          );
          root.position.set(Math.cos(angle) * r, 0.12, Math.sin(angle) * r);
          root.rotation.x = Math.PI;
          root.castShadow = true;
          plot.cropMesh.add(root);
          var top = new THREE.Mesh(
            new THREE.ConeGeometry(0.08, 0.15, 4),
            matureStemMat
          );
          top.position.set(Math.cos(angle) * r, 0.3, Math.sin(angle) * r);
          plot.cropMesh.add(top);
        }
      }
    }

    function removeCrop(plot) {
      if (plot.cropMesh) {
        scene.remove(plot.cropMesh);
        plot.cropMesh = null;
      }
    }

    // =====================================================
    // PARTICELLE
    // =====================================================
    var particles = [];
    function updateParticles(dt) {
      for (var i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.userData.vy -= 9 * dt;
        p.position.x += p.userData.vx * dt;
        p.position.y += p.userData.vy * dt;
        p.position.z += p.userData.vz * dt;
        p.userData.life -= dt * 1.5;
        p.material.opacity = Math.max(0, p.userData.life);
        if (p.userData.life <= 0 || p.position.y < 0) {
          scene.remove(p);
          particles.splice(i, 1);
        }
      }
    }

    function showProduct(animal) {
      if (animal.userData.productMesh) return;
      var type = animal.userData.type;
      var mesh;
      if (type === 'chicken') {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.13, 8, 6),
          new THREE.MeshStandardMaterial({ color: 0xFFFFFF, roughness: 0.4 })
        );
        mesh.scale.set(1, 1.3, 1);
        mesh.position.y = 0.7;
      } else {
        mesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.3, 0.1, 0.4),
          new THREE.MeshStandardMaterial({ color: 0xC62828, roughness: 0.6 })
        );
        mesh.position.y = 1.0;
      }
      animal.userData.productMesh = mesh;
      animal.add(mesh);
    }

    function updateAnimals(dt, now) {
      var all = chickens.concat(pigs);
      for (var i = 0; i < all.length; i++) {
        var a = all[i];
        var u = a.userData;
        if (u.hunger > 0) {
          u.hunger -= dt / FEED_DURATION;
          if (u.hunger < 0) u.hunger = 0;
          updateHungerBar(u.hungerBar, u.hunger);
          if (u.hunger > 0) {
            u.produceTimer += dt;
            if (u.produceTimer >= PRODUCE_INTERVAL) {
              u.produceTimer = 0;
              u.products++;
              showProduct(a);
            }
          }
        } else {
          updateHungerBar(u.hungerBar, 0);
        }

        if (u.pauseTime > 0) {
          u.pauseTime -= dt;
          if (u.type === 'chicken' && u.headGroup) {
            u.peckTime += dt;
            u.headGroup.position.y = 0.62 + Math.sin(u.peckTime * 8) * 0.04;
            u.headGroup.position.z = 0.28 + Math.sin(u.peckTime * 6) * 0.03;
          }
        } else {
          var dx = u.targetX - a.position.x;
          var dz = u.targetZ - a.position.z;
          var dist = Math.hypot(dx, dz);
          if (dist < 0.2) {
            var area = u.type === 'chicken' ? CHICKEN_AREA : PIG_AREA;
            u.targetX = area.x1 + Math.random() * (area.x2 - area.x1);
            u.targetZ = area.z1 + Math.random() * (area.z2 - area.z1);
            u.pauseTime = u.type === 'chicken'
              ? (0.5 + Math.random() * 2.5)
              : (1 + Math.random() * 3);
          } else {
            var nx = dx / dist, nz = dz / dist;
            a.position.x += nx * u.speed * dt;
            a.position.z += nz * u.speed * dt;
            var targetAngle = Math.atan2(nx, nz);
            var diff = targetAngle - a.rotation.y;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            a.rotation.y += diff * Math.min(1, dt * (u.type === 'chicken' ? 6 : 4));
            a.position.y = Math.abs(Math.sin(now * (u.type === 'chicken' ? 0.012 : 0.008))) * 0.04;
            if (u.type === 'chicken' && u.headGroup) {
              u.headGroup.position.y = 0.62;
              u.headGroup.position.z = 0.28;
            }
          }
        }
      }
    }

    // =====================================================
    // MOVIMENTO (FIX ASSI)
    // =====================================================
    var MOVE_SPEED = 5;
    var clock = new THREE.Clock();

    function update(dt) {
      var now = performance.now();
      if (state.marketOpen) {
        renderer.render(scene, camera);
        return;
      }

      var mx = 0, mz = 0;
      if (joyActive) { mx = joyVector.x; mz = joyVector.y; }
      if (keys['w'] || keys['arrowup']) mz -= 1;
      if (keys['s'] || keys['arrowdown']) mz += 1;
      if (keys['a'] || keys['arrowleft']) mx -= 1;
      if (keys['d'] || keys['arrowright']) mx += 1;

      var mag = Math.hypot(mx, mz);
      if (mag > 0.1) {
        mx /= mag;
        mz /= mag;

        var sinY = Math.sin(state.yaw);
        var cosY = Math.cos(state.yaw);

        var forwardX = sinY;
        var forwardZ = cosY;
        var rightX = -cosY;
        var rightZ = sinY;

        var fwd = -mz;
        var strafe = mx;

        player.x += (forwardX * fwd + rightX * strafe) * MOVE_SPEED * dt;
        player.z += (forwardZ * fwd + rightZ * strafe) * MOVE_SPEED * dt;
      }

      player.x = Math.max(-25, Math.min(25, player.x));
      player.z = Math.max(-25, Math.min(25, player.z));

      camera.position.x = player.x;
      camera.position.z = player.z;
      camera.position.y = 1.7 + Math.sin(clock.elapsedTime * 8) * (mag > 0.1 ? 0.04 : 0);

      var dir = new THREE.Vector3(
        Math.sin(state.yaw) * Math.cos(state.pitch),
        Math.sin(state.pitch),
        Math.cos(state.yaw) * Math.cos(state.pitch)
      );
      camera.lookAt(
        camera.position.x + dir.x,
        camera.position.y + dir.y,
        camera.position.z + dir.z
      );

      var distToMarket = Math.hypot(player.x - MARKET_POS.x, player.z - MARKET_POS.z);
      var wasInSellZone = state.inSellZone;
      state.inSellZone = distToMarket < SELL_RADIUS;

      if (state.inSellZone) {
        sellZone.material.opacity = 0.4 + Math.sin(now * 0.005) * 0.3;
        sellZone.material.color.setHex(0x66FF66);
      } else {
        sellZone.material.opacity = 0.5;
        sellZone.material.color.setHex(0xFFD700);
      }

      if (state.inSellZone && !wasInSellZone) {
        var hasSomething =
          state.wheat > 0 || state.corn > 0 || state.carrot > 0 ||
          state.eggs > 0 || state.meat > 0;
        if (hasSomething) {
          openMarket();
        } else {
          showInfo('🏪 Mercato — Non hai nulla da vendere', 2500);
        }
      }

      var feedPrompt = document.getElementById('feedPrompt');
      if (state.tool === 'feed') {
        var animal = getTargetAnimal();
        if (animal) {
          feedPrompt.style.display = 'block';
          var what = animal.userData.type === 'chicken' ? 'gallina' : 'maiale';
          feedPrompt.textContent = '🍽️ Tocca USA per nutrire la ' + what;
          document.getElementById('crosshair').classList.add('target');
        } else {
          feedPrompt.style.display = 'none';
          document.getElementById('crosshair').classList.remove('target');
        }
      } else {
        feedPrompt.style.display = 'none';
        document.getElementById('crosshair').classList.remove('target');
      }

      for (var i = 0; i < plots.length; i++) {
        var plot = plots[i];
        if (plot.state === 'planted' && plot.watered && plot.cropMesh) {
          var crop = CROPS[plot.cropType];
          plot.growth += dt;
          var prog = Math.min(plot.growth / crop.growTime, 1);
          plot.cropMesh.scale.setScalar(0.25 + prog * 0.75);
          plot.cropMesh.rotation.z = Math.sin(now * 0.002 + plot.wobble) * 0.08 * prog;
          if (prog >= 1) {
            plot.state = 'grown';
            plot.mesh.material = matReady;
            growCrop(plot);
          }
        }
        if (plot.state === 'grown' && plot.cropMesh) {
          plot.cropMesh.rotation.z = Math.sin(now * 0.002 + plot.wobble) * 0.06;
        }
      }

      for (var ci = 0; ci < clouds.length; ci++) {
        clouds[ci].position.x += clouds[ci].userData.speed * dt;
        if (clouds[ci].position.x > 55) clouds[ci].position.x = -55;
      }

      updateParticles(dt);
      updateAnimals(dt, now);

      wellWater.rotation.z = Math.sin(now * 0.001) * 0.02;
    }

    function animate() {
      requestAnimationFrame(animate);
      var dt = Math.min(clock.getDelta(), 0.1);
      update(dt);
      renderer.render(scene, camera);
    }

    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // =====================================================
    // AVVIO
    // =====================================================
    var loaded = loadGame();
    updateHUD();
    updateActionBtn();
    updateSeedIcon();
    if (loaded) {
      showInfo('💾 Partita caricata!', 3000);
    } else {
      showInfo('Zappa il terreno ⛏️ — Compra semi 🌽 — Vendi al mercato 🏪', 5000);
    }
    animate();

  } catch (err) {
    showError('ERRORE:\n' + err.message, err);
  }
});