# 🚀 VLS — Vertex Launch System

<p align="center">
  <i>🤖 Note: Approximately 98% of this README was generated with AI assistance.<br>
  The VLS project itself is also partially AI-assisted, with approximately 60% of the project generated or developed with AI assistance.</i>
</p>

---

<p align="center">
  <img src="https://raw.githubusercontent.com/avet-1007/VLS-vertex_launch_system/refs/heads/main/logo.png" alt="VLS logo" width="160"/>
</p>

<p align="center">
  <b>Vertex-based level creation system for 2D games</b><br>
  <i>Points • Lines • Sectors • Smooth worlds • Made with ❤️</i>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blueviolet?style=for-the-badge"/>
  <img src="https://img.shields.io/badge/status-active-success?style=for-the-badge"/>
  <img src="https://img.shields.io/badge/license-MIT-blue?style=for-the-badge"/>
</p>

---

## 🌟 About

**VLS (Vertex Launch System)** is a level creation and level description system designed for **2D games**.

In many traditional 2D games, the environment is created from sprites or tiles. A tile is usually a fixed-size image, for example **16×16 pixels**. Other systems use smaller tiles; for example, **PICO-8** commonly works with **8×8 pixel sprites**.

This approach is useful, simple and efficient for many types of games. However, when the entire level is built from square tiles, the geometry of the world becomes strongly connected to the tile grid.

Creating unusual shapes, smooth walls, large irregular rooms or more natural landscapes can therefore require many separate tiles and additional tricks.

**VLS takes a different approach.**

Instead of describing a level as a collection of square tiles, VLS describes its geometry using **vertices, lines and sectors**.

![Traditional tiles compared with VLS geometry](./assets/tile-vs-vls.svg)

---

## 🧠 The basic idea

A VLS level starts with **points**.

These points are called **vertices**.

Vertices can be connected together with **lines**:

```text
        ●────────────●
       /               |
      \                /
       \              /
        ●────────────●
```

A collection of connected lines can define a **sector** — an area of the level.

This means that instead of saying:

> "Put a tile here, then another tile here, then another tile here..."

VLS can describe the actual shape of the environment:

> "These points are connected by these lines, and these lines form this sector."

The game engine can then decide how this geometry should be rendered.

---

# 🧱 Why not build everything from sprites?

Sprites are still extremely useful.

A game can use sprites for:

- the player
- enemies
- weapons
- items
- decorations
- visual effects
- UI elements

The important difference is that **the geometry of the level does not have to be made from those sprites**.

For example, a traditional tile-based map might look like this:

```text
 ■■■■■■■■■■■■
■            ■
■   ROOM     ■
■            ■
 ■■■■■■  ■■■■■
       ■
       ■
       ■
```

The same general idea can be represented by geometry:

```text
●──────────────●
│              │
│     ROOM     ●──────●
│              │      │
●──────●       │      │
       │       │      │
       ●───────●──────●
```

The second representation is not tied to a fixed square grid.

This is the main idea behind VLS.

---

# 🔷 Vertices

A **vertex** is a point in the level.

It normally contains a position, such as:

```text
Vertex = (X, Y)
```

For example:

```text
Vertex 0 = (0, 0)
Vertex 1 = (128, 0)
Vertex 2 = (128, 96)
Vertex 3 = (0, 96)
```

These four vertices can describe a rectangular area.

Vertices can also be placed at arbitrary positions, allowing irregular geometry:

```text
        ●────────●
       /          \
     ●─────────────●
```

The exact coordinate system and file representation depend on the VLS implementation.

---

# 📏 Lines

A **line** connects two vertices.

For example:

```text
Vertex 0 ●────────────● Vertex 1
```

A line can be represented conceptually as:

```text
Line 0 = Vertex 0 → Vertex 1
```

Multiple lines can be connected together to create the boundaries of a sector.

---

# 🧩 Sectors

A **sector** is an area defined by connected geometry.

For example:

```text
        ●────────────●
        │            │
        │   SECTOR   │
        │     01     │
        │            │
        ●────────────●
```

Sectors are one of the most important concepts in VLS.

They allow a level to be divided into logical areas:

```text
┌──────────────┐
│              │
│   SECTOR 1   │
│              │
└──────┬───────┘
       │
       │
┌──────┴───────┐
│              │
│   SECTOR 2   │
│              │
└──────────────┘
```

A sector could represent a room, corridor, outdoor area, cave, building, platform area, or any other region supported by the game.

---

# 🔗 Connecting sectors

Sectors can be connected to form a complete level.

For example:

```text
┌─────────────┐
│   ROOM 01   │
│             ├─────────────┐
└─────────────┘  CORRIDOR   │
               ┌────────────┘
               │
        ┌──────┴──────┐
        │   ROOM 02   │
        │             │
        └─────────────┘
```

The connection itself does not necessarily mean one specific gameplay mechanic.

Depending on the game engine, a connection could become:

- a normal passage
- a door
- a portal
- a transition
- a staircase
- a trigger
- another custom gameplay element

**VLS describes the structure. The game decides the behavior.**

---

# 🎮 VLS and Doom

The sector concept may look familiar to people who know **Doom**.

Doom uses sectors as part of its level representation and rendering system. However, Doom uses that approach to create an **illusion of a 3D environment**.

VLS has a different purpose.

### Doom

```text
Level geometry
      ↓
Sectors
      ↓
3D-like rendering
      ↓
FPS gameplay
```

### VLS

```text
2D level geometry
      ↓
Vertices
      ↓
Lines
      ↓
Sectors
      ↓
Smooth / irregular 2D world
```

The similarity is mainly the idea of dividing a level into connected sectors.

**VLS is not a Doom engine and does not attempt to reproduce Doom's rendering system.**

Instead, VLS uses a related structural idea to solve a different problem: creating flexible **2D geometry without relying entirely on square tiles**.

---

![VLS structure: vertices, lines and sectors](./assets/vls-structure.svg)

---

# 🎨 Smooth walls and landscapes

Because VLS geometry is based on points and lines, a level is not required to follow a regular 8×8, 16×16 or other fixed-size grid.

This makes it possible to describe shapes such as:

```text
       ●─────────────────●
      /                   \
    ●                     |
     \____________________●
```

The actual visual appearance is determined by the engine that loads the level.

For example, one engine could render the lines as pixel-art walls.

Another could turn the same geometry into collision polygons.

Another could use the geometry to generate a completely different visual style.

The VLS level describes the **shape and structure**, while the game controls the final presentation.

---

# 🛠️ What is inside this repository?

The VLS repository is intended to contain the **tools required to create and work with VLS levels**.

It is not intended to be a complete game.

The general idea is:

```text
VLS Repository
│
├── Level Editor
├── Vertex Tools
├── Line Tools
├── Sector Tools
├── Level Data
└── Documentation
```

The tools are used by a level designer to create a map.

The resulting level is then loaded by a separate game engine.

---

# 🔌 Engine integration

This is an important part of the VLS concept.

If a developer wants to use VLS as the level system of their own game, they need to create an **integration between their engine and the VLS level format**.

The VLS tools create the level:

```text
VLS Editor
     ↓
VLS Level File
```

The developer's engine then reads it:

```text
VLS Level File
     ↓
VLS Level Loader
     ↓
Game Engine
     ↓
Game World
```

![VLS engine integration](./assets/vls-integration.svg)

The loader is responsible for reading the VLS data and converting it into objects understood by the game engine.

Conceptually:

```text
VLS Vertex
    ↓
Engine Vector2

VLS Line
    ↓
Engine Geometry / Collision

VLS Sector
    ↓
Engine Polygon / Area

VLS Connection
    ↓
Engine Portal / Passage / Trigger
```

The exact implementation is up to the developer.

---

# 🧩 VLS does not define gameplay

VLS does **not** decide what happens inside a level.

For example, imagine a game inspired by classic FPS level design.

The VLS file could describe:

```text
ROOM A
   │
   └── CORRIDOR
           │
           └── ROOM B
```

The game engine can then add gameplay:

```text
ROOM A
 ├── Player
 └── Enemies

CORRIDOR
 └── Locked Door

ROOM B
 ├── Key
 ├── Enemies
 └── Exit
```

The concepts of:

- enemies
- weapons
- keys
- doors
- health
- quests
- objectives
- triggers
- items

are **game-specific**.

VLS only provides the level structure that the game can use.

---

# 📄 Level data

A VLS level can conceptually be represented as a collection of geometry:

```text
Vertices
    ↓
Lines
    ↓
Sectors
    ↓
Sector connections
    ↓
Additional level data
```

For example:

```text
Vertex 0 = (0, 0)
Vertex 1 = (128, 0)
Vertex 2 = (128, 96)
Vertex 3 = (0, 96)

Line 0 = 0 → 1
Line 1 = 1 → 2
Line 2 = 2 → 3
Line 3 = 3 → 0

Sector 0
    Lines = 0, 1, 2, 3
```

This example is only an illustration of the concept. The actual VLS file format is defined by the implementation of the project.

---

# 🔄 Complete workflow

The complete workflow can be thought of as four stages:

### 1. Create

The level designer creates geometry using VLS tools.

```text
Vertices
   ↓
Lines
   ↓
Sectors
   ↓
Connections
```

### 2. Save

The level is saved into a VLS-compatible level file.

```text
VLS Editor
    ↓
Level File
```

### 3. Load

The game developer's level loader reads the file.

```text
Level File
    ↓
Parser / Loader
    ↓
Engine Data
```

### 4. Play

The engine adds its own systems:

```text
Level Geometry
      +
Player
      +
Enemies
      +
Objects
      +
Physics
      +
Rendering
      ↓
    Game
```

---

# 🎯 Main concept

The main idea of VLS can be summarized as:

> **VLS describes what the level is. The game engine decides what the level does.**

VLS provides the geometry and structure.

The engine provides rendering, physics and gameplay.

This separation allows VLS to remain independent from a specific game and potentially be integrated into different 2D projects.

---

# ✨ Features

- 🔹 **Vertex-based geometry**
- 📏 **Line-based level boundaries**
- 🧩 **Sector-based level structure**
- 🔗 **Connections between sectors**
- 🎨 **Geometry independent from fixed-size tiles**
- 🗺️ **Flexible 2D level design**
- 🔌 **Engine-independent level data**
- 🛠️ **Tools for level creation**
- 🌐 **Open source**

---

# 🚀 Installation

Clone the repository:

```bash
git clone https://github.com/avet-1007/VLS-vertex_launch_system.git
```

Enter the project folder:

```bash
cd VLS-vertex_launch_system
```

The exact requirements and launch instructions depend on the current version of the VLS tools.

---

# 📖 Using VLS in a game

VLS is intended to be integrated into a game rather than used as a complete game by itself.

A typical integration should contain:

```text
Your Game
│
├── VLS Level Loader
├── VLS Geometry
├── Rendering
├── Collision
├── Player
├── Entities
└── Gameplay
```

The **VLS Level Loader** is the bridge between the VLS level file and the game.

This makes it possible to keep the level editor and the game engine as separate parts of a project.

---

# 🗺️ Roadmap

- [ ] Core VLS level format
- [ ] Vertex editing
- [ ] Line editing
- [ ] Sector creation
- [ ] Sector connections
- [ ] Level saving
- [ ] Level loading
- [ ] Level validation
- [ ] Documentation
- [ ] Example integration
- [ ] Example test level
- [ ] Stable release

---

# 🤝 Contributing

Want to help the project? Awesome!

1. Fork the repository 🍴
2. Create your feature branch:

```bash
git checkout -b feature/amazing-feature
```

3. Commit your changes:

```bash
git commit -m "Add amazing feature"
```

4. Push to the branch:

```bash
git push origin feature/amazing-feature
```

5. Open a Pull Request 🎉

---

# 📝 License

This project is distributed under the **MIT** license.

See the [LICENSE](./LICENSE) file for details.

---

# 📬 Contact

- 📧 Email: [gyonjyanavet@gmail.com](mailto:gyonjyanavet@gmail.com)
- 🐙 GitHub: [avet-1007](https://github.com/avet-1007)

---

<p align="center">
  Made with 💙 by <b>VLS team</b><br>
  <i>Create worlds without being limited by the grid.</i>
</p>
