# 🌍 SEISMICWAVE — Listening to the Pulse of the Earth

> **Live Application**: [alperencatak.github.io/seismic-wave/](https://alperencatak.github.io/seismic-wave/)

---

### The Earth never truly sleeps.
It breathes, shifts, and sings in deep seismic waves. While we go about our daily lives, tectonic plates are in a constant, slow-motion dance. 

**Seismic Wave** is an immersive window into that silent, ongoing symphony. It is a highly interactive, real-time global earthquake visualizer built on a custom 3D orthographic dot-matrix globe. By bridging scientific data streams with elegant, glassmorphic design and synthesised sound, it turns raw geology data into a living, breathing sensory experience.

---

## 🎨 The Experience & Core Features

### 1. The Holographic 3D Dot Globe
Instead of standard flat maps or heavy 3D textures, Seismic Wave projects the world onto a custom **D3.js & HTML5 Canvas Dot Matrix Projection Engine**. 
* **Mathematical Precision**: The engine pre-computes a mathematical grid of latitude and longitude coordinates and runs them through `d3.geoContains` against a simplified TopoJSON World Atlas to determine land versus ocean boundaries on the fly.
* **Fluid Rotations & Interaction**: Click and drag to spin the globe, or scroll to zoom. Selecting an earthquake pauses the auto-rotation and pivots the globe smoothly to center on the coordinates, scaling up the earthquake marker and flashing magnitude rings.

### 2. Synthesized Seismic Chimes (Web Audio API)
Earthquakes are usually presented as cold, silent numbers. Seismic Wave gives them a voice.
* **Seismic Auditioning**: Turn on the **AUDIO** HUD switch, and the application generates custom acoustic chimes using the browser’s **Web Audio API** (utilizing a synthesis network of pure oscillator nodes, low-pass filters, and custom envelope curves).
* **Data-to-Sound Mapping**: 
  * **Magnitude** determines the volume and depth of the sound. Larger earthquakes chime louder and produce richer harmonics.
  * **Depth** is mapped inversely to frequency. Deep subduction zone earthquakes ring with low, rumbling tones, while shallow crustal quakes spark high-frequency glass-like pings.

### 3. Multi-Agency Live Data Normalization
Different agencies speak different languages. To create a truly global dashboard, Seismic Wave connects directly to six of the world's most trusted seismological networks, reconciling and normalizing their data structure in real time:
* 🇺🇸 **USGS** (United States Geological Survey) — *Global coverage*
* 🇹🇷 **KOERI** (Kandilli Observatory, Türkiye) — *High-frequency Mediterranean & Anatolian feeds*
* 🇪🇺 **EMSC** (European-Mediterranean Seismological Centre) — *Euro-Mediterranean tracking*
* 🇳🇿 **GeoNet** (GNS Science, New Zealand) — *Southern hemisphere plate boundary tracking*
* 🇯🇵 **JMA** (Japan Meteorological Agency via P2P) — *Precision East-Asian coverage*
* 🇮🇹 **INGV** (Istituto Nazionale di Geofisica e Vulcanologia, Italy) — *Italian & Central Mediterranean tracking*

All feeds auto-poll every **60 seconds**, updating active stats, magnitude frequency distributions, and the chronological timeline dynamically.

### 4. True Geometrical Country Filtering
Standard maps filter earthquakes by reading text labels like `"USA"` or `"Japan"`. However, different agencies list locations differently (e.g. USGS might label an event `"5km SSE of Petrolia, California"` or `"offshore Oregon"`).
* **The Solution**: Seismic Wave implements real mathematical polygon intersection. When you click a country on the globe or search for it in the sidebar, the engine uses **D3 boundary polygons** to check which earthquakes mathematically fall within that country's exact borders. No more missing events due to naming discrepancies.

---

## 🛠️ The Tech Stack (Crafted without Bloat)

This application was engineered with a philosophy of maximum performance, zero bloated dependencies, and clean, modular design:
* **UI Structure & Layout**: Semantic HTML5 and Vanilla CSS3. The dashboard features responsive layouts, CSS-driven starry backgrounds, custom atmospheric radial gradients, glowing indicators, and glassmorphism panels.
* **Visual Projections**: **D3.js v7** & **TopoJSON Client** for orthographic 3D projection, math, path parsing, and boundary mapping.
* **Audio Engine**: Native **Web Audio API** synthesizer networks.
* **Application Architecture**: An IIFE-wrapped modular state-controller pattern in vanilla ES6+ JavaScript, maintaining clean encapsulation and predictable data flow.

---

## ⚡ Under the Hood: Solving the Hard Parts

Building a smooth, client-side globe is easy. Building an *interactive, mathematically robust, bug-free interactive simulator* has distinct challenges. Here is how some of them were conquered:

### 🔄 The Spinning Interpolator Trap
When implementing click-to-center transitions on an auto-rotating globe, long-running rotation values accumulate into the thousands of degrees. Standard D3 interpolators (`d3.interpolate`) would try to undo all of those spins in a fraction of a second, causing the globe to un-spin wildly.
* **The Fix**: Before initiating a smooth transition, the controller normalizes the active rotation angles strictly into the `[-180, 180]` degree boundary. This ensures D3 always rotates the globe along the shortest path to its destination.

### 🛑 Interrupting Active Animations Safely
Selecting a new earthquake while the globe is still transitioning to a previous target often causes canvas flickering or thread locking.
* **The Fix**: The engine leverages D3's transition lifecycle, executing `d3.select(canvas).interrupt()` before starting any new coordinate transition. This safely halts existing interpolations on the canvas without triggering browser type-errors.

---

## 🚀 Running the Project Locally

Because the application is built entirely on native web standards and client-side logic, running it is incredibly simple.

### Option A: The Double-Click Way
1. Clone this repository or download the source code files.
2. Double-click the `index.html` file to open it in your browser. 
*(Note: Because of browser security sandbox restrictions on loading local JSON files, loading the country maps may require a local server. If the globe doesn't render land masses immediately, use Option B).*

### Option B: The Dev Server Way (Recommended)
Running a local development server ensures smooth file loading and allows all APIs to execute properly:
* **With VS Code**: Install the **Live Server** extension, right-click `index.html`, and select *Open with Live Server*.
* **With Python**: Open your terminal in the directory and run:
  ```bash
  python -m http.server 8000
  ```
  Then open [http://localhost:8000](http://localhost:8000) in your browser.
* **With Node.js / npm**: Run:
  ```bash
  npx serve .
  ```
  Then open the provided port in your browser.

---

## 🤝 Crafted by Hand

This application is the product of passionate, iterative design. From micro-interactions and custom CSS-only sliders to precision geospatial boundary calculations, every pixel and line of code was crafted to showcase the beautiful intersection of science, art, and modern front-end technology.

Feel free to explore, clone, modify, and listen to the pulse of the Earth! 🌍✨
